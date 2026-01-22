import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifySession, extractSessionToken, createUnauthorizedResponse } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};

interface RequestBody {
  clientId?: string;
  clientIds?: string[];
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
  };
  session_token?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: RequestBody = await req.json();
    const sessionToken = extractSessionToken(req.headers, body);

    // Validate session
    const { error: authError, userId } = await verifySession(supabase, sessionToken);
    if (authError) {
      console.log('Auth failed for get-client-data:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }

    console.log(`Authenticated user ${userId} requesting client data`);

    const { clientId, clientIds, include = {} } = body;

    // Determine which clients to fetch
    const idsToFetch = clientId ? [clientId] : (clientIds || []);

    if (idsToFetch.length === 0) {
      // Return all clients if no specific IDs provided (list mode)
      const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('*')
        .order('updated_at', { ascending: false });

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
          supabase.from('client_notes').select('*').eq('client_id', id).order('created_at', { ascending: false })
            .then(({ data }) => { clientResult.notes = data || []; })
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
          supabase.from('borrowing_capacity_assessments').select('*').eq('client_id', id).order('created_at', { ascending: false }).limit(1)
            .then(({ data }) => { clientResult.borrowingCapacity = data?.[0] || null; })
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
