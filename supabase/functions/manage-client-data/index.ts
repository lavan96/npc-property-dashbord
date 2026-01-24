import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createUnauthorizedResponse, createCorsHeaders } from '../_shared/auth.ts';

type TableName = 'clients' | 'client_properties' | 'client_income' | 'client_expenses' | 
                 'client_assets' | 'client_liabilities' | 'client_employment' | 
                 'client_notes' | 'client_files' | 'client_activities';

type Operation = 'create' | 'update' | 'delete';

interface RequestBody {
  operation: Operation;
  table: TableName;
  clientId: string;
  recordId?: string;
  data?: Record<string, any>;
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
    if (!['create', 'update', 'delete'].includes(operation)) {
      return new Response(
        JSON.stringify({ error: `Invalid operation: ${operation}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate clientId for non-client tables
    if (table !== 'clients' && !clientId) {
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

        const insertData = table === 'clients' 
          ? data 
          : { ...data, client_id: clientId };

        const { data: inserted, error: insertError } = await supabase
          .from(table)
          .insert(insertData)
          .select()
          .single();

        result = inserted;
        error = insertError;
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
    }

    if (error) {
      console.error(`Error in ${operation} on ${table}:`, error);
      return new Response(
        JSON.stringify({ error: `Failed to ${operation} record`, details: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the activity
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
