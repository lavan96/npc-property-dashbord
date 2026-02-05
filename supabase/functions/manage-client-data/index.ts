import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createUnauthorizedResponse, createCorsHeaders } from '../_shared/auth.ts';

type TableName = 'clients' | 'client_properties' | 'client_income' | 'client_expenses' |
                 'client_assets' | 'client_liabilities' | 'client_employment' |
                 'client_notes' | 'client_files' | 'client_activities' | 'client_additional_contacts' |
                 'report_qa_messages' | 'report_qa_conversations' | 'portfolio_reviews' | 'client_scores';

type Operation = 'create' | 'update' | 'delete' | 'upsert';

interface RequestBody {
  operation: Operation;
  table: TableName;
  clientId?: string; // Optional for report_qa tables
  recordId?: string;
  data?: Record<string, any> | Record<string, any>[]; // Allow array for batch inserts
  session_token?: string;
}

const ALLOWED_TABLES: TableName[] = [
  'clients',
  'client_properties',
  'client_income',
  'client_expenses',
  'client_assets',
  'client_liabilities',
  'client_employment',
  'client_notes',
  'client_files',
  'client_activities',
  'client_additional_contacts',
  'report_qa_messages',
  'report_qa_conversations',
  'portfolio_reviews',
  'client_scores',
];

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
    const { error: authError, userId, username } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.log('Auth failed for manage-client-data:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }

    console.log(`Authenticated user ${userId} (${username}) performing ${body.operation} on ${body.table}`);

    const { operation, table, clientId, recordId, data } = body;

    // Validate table name
    if (!ALLOWED_TABLES.includes(table)) {
      return new Response(
        JSON.stringify({ error: `Invalid table: ${table}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate operation
    if (!['create', 'update', 'delete', 'upsert'].includes(operation)) {
      return new Response(
        JSON.stringify({ error: `Invalid operation: ${operation}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Tables that don't require clientId
    const STANDALONE_TABLES = ['clients', 'report_qa_messages', 'report_qa_conversations'];
    
    // Validate clientId for client-related tables only
    if (!STANDALONE_TABLES.includes(table) && !clientId) {
      return new Response(
        JSON.stringify({ error: 'clientId is required for related tables' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let result: any;
    let error: any;

    switch (operation) {
      case 'create': {
        if (!data) {
          return new Response(
            JSON.stringify({ error: 'data is required for create operation' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Handle batch inserts (array) or single inserts
        const isArray = Array.isArray(data);
        let insertData: Record<string, any> | Record<string, any>[];
        
        if (STANDALONE_TABLES.includes(table)) {
          // For standalone tables, use data as-is
          insertData = data;
        } else {
          // For client-related tables, add client_id
          insertData = isArray 
            ? data.map((item: Record<string, any>) => ({ ...item, client_id: clientId }))
            : { ...data, client_id: clientId };
        }

        // Use .select() without .single() to handle both array and single inserts
        const { data: inserted, error: insertError } = await supabase
          .from(table)
          .insert(insertData)
          .select();

        result = isArray ? inserted : inserted?.[0];
        error = insertError;

        // Update last_note_at on the client when a note is created
        if (!error && table === 'client_notes' && clientId) {
          await supabase
            .from('clients')
            .update({ last_note_at: new Date().toISOString() })
            .eq('id', clientId);
        }
        break;
      }

      case 'update': {
        if (!recordId && table !== 'clients') {
          return new Response(
            JSON.stringify({ error: 'recordId is required for update operation' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!data) {
          return new Response(
            JSON.stringify({ error: 'data is required for update operation' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // For clients table, use clientId as the record ID
        const idToUpdate = table === 'clients' ? clientId : recordId;

        const { data: updated, error: updateError } = await supabase
          .from(table)
          .update(data)
          .eq('id', idToUpdate)
          .select()
          .single();

        result = updated;
        error = updateError;
        break;
      }

      case 'delete': {
        if (!recordId && table !== 'clients') {
          return new Response(
            JSON.stringify({ error: 'recordId is required for delete operation' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // For clients table, use clientId as the record ID
        const idToDelete = table === 'clients' ? clientId : recordId;

        const { error: deleteError } = await supabase
          .from(table)
          .delete()
          .eq('id', idToDelete);

        result = { deleted: true, id: idToDelete };
        error = deleteError;
        break;
      }

      case 'upsert': {
        if (!data) {
          return new Response(
            JSON.stringify({ error: 'data is required for upsert operation' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // For client-related tables, add client_id
        const upsertData = STANDALONE_TABLES.includes(table)
          ? { ...data as Record<string, any> }
          : { ...data as Record<string, any>, client_id: clientId };

        // Upsert using client_id as the conflict target for client-related tables
        const { data: upserted, error: upsertError } = await supabase
          .from(table)
          .upsert(upsertData, { onConflict: 'client_id' })
          .select()
          .single();

        result = upserted;
        error = upsertError;
        break;
      }
    }

    if (error) {
      console.error(`Error in ${operation} on ${table}:`, error);
      return new Response(
        JSON.stringify({ error: `Failed to ${operation} record`, details: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the activity (only for client-related tables)
    if (clientId && !['report_qa_messages', 'report_qa_conversations'].includes(table)) {
      try {
        await supabase.from('client_activities').insert({
          client_id: clientId,
          activity_type: `${table}_${operation}`,
          title: `${operation.charAt(0).toUpperCase() + operation.slice(1)}d ${table.replace('client_', '').replace('_', ' ')}`,
          description: `Record ${operation}d via secure API`,
          created_by: userId,
          metadata: { table, operation, recordId: recordId || result?.id },
        });
      } catch (logError) {
        console.warn('Failed to log activity:', logError);
        // Don't fail the main operation due to logging failure
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        operation, 
        table, 
        result,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('manage-client-data error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
