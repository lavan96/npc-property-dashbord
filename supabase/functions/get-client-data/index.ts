import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createUnauthorizedResponse, createCorsHeaders } from '../_shared/auth.ts';

interface RequestBody {
  clientId?: string;
  clientIds?: string[];
  listMode?: boolean;
  listOptions?: {
    table?: string;
    select?: string;
    orderBy?: string;
    order_asc?: boolean;
    orderAsc?: boolean;
    limit?: number;
    includePropertyCount?: boolean;
    filters?: Record<string, any>;
  };
  notesOptions?: {
    limit?: number;
    offset?: number;
  };
  include?: {
    properties?: boolean;
    income?: boolean;
    expenses?: boolean;
    assets?: boolean;
    liabilities?: boolean;
    employment?: boolean;
    notes?: boolean;
    files?: boolean;
    activities?: boolean;
    borrowingCapacity?: boolean;
    client?: boolean;
    emails?: boolean;
    incomeSources?: boolean;
    additionalContacts?: boolean;
    scores?: boolean;
  };
  session_token?: string;
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: RequestBody = await req.json();

    // Validate authentication (JWT first, then session token)
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.log('Auth failed for get-client-data:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }

    console.log(`Authenticated user ${userId} requesting client data`);

    const { clientId, clientIds, listMode, listOptions = {}, notesOptions = {}, include = {} } = body;

    // Support for querying other tables (portfolio_analysis_reports, etc.)
    const allowedTables = ['clients', 'portfolio_analysis_reports', 'client_properties', 'client_files', 'client_additional_contacts'];
    const targetTable = listOptions.table || 'clients';
    
    if (listOptions.table && !allowedTables.includes(targetTable)) {
      return new Response(
        JSON.stringify({ error: `Table '${targetTable}' is not allowed`, allowedTables }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine which clients to fetch
    const idsToFetch = clientId ? [clientId] : (clientIds || []);

    // Handle custom table queries in list mode
    if (listMode && listOptions.table && listOptions.table !== 'clients') {
      const { 
        select = '*', 
        orderBy = 'created_at', 
        order_asc,
        orderAsc,
        limit,
        filters = {}
      } = listOptions;

      const isAscending = order_asc ?? orderAsc ?? false;

      let query = supabase
        .from(targetTable)
        .select(select)
        .order(orderBy, { ascending: isAscending });

      // Apply filters
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      }

      if (limit) {
        query = query.limit(limit);
      }

      const { data: records, error: recordsError } = await query;

      if (recordsError) {
        console.error(`Error fetching ${targetTable}:`, recordsError);
        return new Response(
          JSON.stringify({ error: `Failed to fetch ${targetTable}`, details: recordsError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Fetched ${records?.length || 0} records from ${targetTable}`);

      return new Response(
        JSON.stringify({ success: true, records, count: records?.length || 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (idsToFetch.length === 0 || listMode) {
      // Return all clients (list mode)
      const { 
        select = '*', 
        orderBy = 'created_at', 
        order_asc,
        orderAsc,
        limit,
        includePropertyCount = false 
      } = listOptions;

      const isAscending = order_asc ?? orderAsc ?? false;

      // Build select string with optional property count
      const selectString = includePropertyCount 
        ? `${select}, client_properties(id)` 
        : select;

      let query = supabase
        .from('clients')
        .select(selectString)
        .order(orderBy, { ascending: isAscending });

      if (limit) {
        query = query.limit(limit);
      }

      const { data: clients, error: clientsError } = await query;

      if (clientsError) {
        console.error('Error fetching clients list:', clientsError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch clients', details: clientsError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, clients, count: clients?.length || 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch specific client(s) with optional related data
    const results = await Promise.all(idsToFetch.map(async (id) => {
      const clientResult: any = { id };

      // Fetch base client data
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .single();

      if (clientError) {
        console.error(`Error fetching client ${id}:`, clientError);
        return { id, error: clientError.message };
      }

      clientResult.client = client;

      // Parallel fetch of related data based on include flags
      const fetchPromises: Promise<void>[] = [];

      if (include.properties !== false) {
        fetchPromises.push(
          supabase.from('client_properties').select('*').eq('client_id', id)
            .then(({ data }) => { clientResult.properties = data || []; })
        );
      }

      if (include.income) {
        fetchPromises.push(
          supabase.from('client_income').select('*').eq('client_id', id)
            .then(({ data }) => { clientResult.income = data || []; })
        );
      }

      if (include.expenses) {
        fetchPromises.push(
          supabase.from('client_expenses').select('*').eq('client_id', id)
            .then(({ data }) => { clientResult.expenses = data || []; })
        );
      }

      if (include.assets) {
        fetchPromises.push(
          supabase.from('client_assets').select('*').eq('client_id', id)
            .then(({ data }) => { clientResult.assets = data || []; })
        );
      }

      if (include.liabilities) {
        fetchPromises.push(
          supabase.from('client_liabilities').select('*').eq('client_id', id)
            .then(({ data }) => { clientResult.liabilities = data || []; })
        );
      }

      if (include.employment) {
        fetchPromises.push(
          supabase.from('client_employment').select('*').eq('client_id', id)
            .then(({ data }) => { clientResult.employment = data || []; })
        );
      }

      if (include.notes) {
        fetchPromises.push(
          (async () => {
            let query = supabase.from('client_notes').select('*').eq('client_id', id).order('created_at', { ascending: false });
            
            // Apply pagination if notesOptions provided
            if (notesOptions.limit !== undefined && notesOptions.offset !== undefined) {
              const start = notesOptions.offset;
              const end = notesOptions.offset + notesOptions.limit - 1;
              query = query.range(start, end);
            }
            
            const { data } = await query;
            clientResult.notes = data || [];
          })()
        );
      }

      if (include.files) {
        fetchPromises.push(
          supabase.from('client_files').select('*').eq('client_id', id)
            .then(({ data }) => { clientResult.files = data || []; })
        );
      }

      if (include.activities) {
        fetchPromises.push(
          supabase.from('client_activities').select('*').eq('client_id', id).order('created_at', { ascending: false }).limit(50)
            .then(({ data }) => { clientResult.activities = data || []; })
        );
      }

      if (include.borrowingCapacity) {
        fetchPromises.push(
          supabase.from('borrowing_capacity_assessments').select('*').eq('client_id', id).order('created_at', { ascending: false }).limit(10)
            .then(({ data }) => { clientResult.borrowingCapacity = data || []; })
        );
      }

      if (include.emails) {
        fetchPromises.push(
          supabase.from('email_copilot_emails').select('id,sender,subject,body,received_at,status,urgency_level,summary,draft_reply,folder,conversation_id,to_recipients').eq('client_id', id).order('received_at', { ascending: false }).limit(100)
            .then(({ data }) => { clientResult.emails = data || []; })
        );
      }

      if (include.additionalContacts) {
        fetchPromises.push(
          supabase.from('client_additional_contacts').select('*').eq('client_id', id).order('display_order', { ascending: true })
            .then(({ data }) => { clientResult.additionalContacts = data || []; })
        );
      }

      if (include.incomeSources) {
        fetchPromises.push(
          supabase.from('client_income_sources').select('*').eq('client_id', id).eq('is_active', true).order('display_order', { ascending: true })
            .then(({ data }) => { clientResult.incomeSources = data || []; })
        );
      }

      if (include.scores) {
        fetchPromises.push(
          supabase.from('client_scores').select('*').eq('client_id', id).maybeSingle()
            .then(({ data }) => { clientResult.scores = data || null; })
        );
      }

      await Promise.all(fetchPromises);

      return clientResult;
    }));

    // If single client requested, return flat response
    if (clientId) {
      const result = results[0];
      if (result.error) {
        return new Response(
          JSON.stringify({ error: 'Client not found', details: result.error }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ success: true, ...result }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Multiple clients: return array
    return new Response(
      JSON.stringify({ success: true, clients: results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('get-client-data error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
