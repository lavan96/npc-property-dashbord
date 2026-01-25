import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createUnauthorizedResponse, createCorsHeaders } from '../_shared/auth.ts';

type TableName = 'report_structure_templates' | 'client_branding_profiles' | 'integration_configs' | 'depreciation_comps' | 'depreciation_estimator_runs' | 'charts' | 'chart_analysis' | 'chart_configurations' | 'global_report_settings' | 'finance_agent_contacts' | 'bulk_generation_jobs' | 'property_comparisons';

interface RequestBody {
  // Operation type
  operation: 'list' | 'get' | 'insert' | 'update' | 'upsert' | 'delete' | 'rpc';
  
  // Target table
  table: TableName;
  
  // For get/update/delete operations
  recordId?: string;
  
  // For list operations
  listOptions?: {
    select?: string;
    orderBy?: string;
    orderAsc?: boolean;
    limit?: number;
    filters?: Record<string, any>;
  };
  
  // For insert/update/upsert operations
  data?: Record<string, any> | Record<string, any>[];
  
  // For upsert operations
  onConflict?: string;
  
  // For RPC calls
  rpcName?: string;
  rpcParams?: Record<string, any>;
  
  session_token?: string;
}

const DEFAULT_SELECTS: Record<TableName, string> = {
  report_structure_templates: '*',
  client_branding_profiles: '*',
  integration_configs: '*',
  depreciation_comps: '*',
  depreciation_estimator_runs: 'id, created_at',
  charts: '*',
  chart_analysis: '*',
  chart_configurations: '*',
  global_report_settings: '*',
  finance_agent_contacts: '*',
  bulk_generation_jobs: '*',
  property_comparisons: '*',
};

serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const corsHeaders = createCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: RequestBody = await req.json();
    
    // SECURITY: Verify authentication
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.log('[manage-templates] Auth failed:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }

    console.log(`[manage-templates] Authenticated user ${userId}, operation: ${body.operation}, table: ${body.table}`);

    const { operation, table, recordId, listOptions = {}, data, onConflict, rpcName, rpcParams } = body;

    // Validate table
    const validTables: TableName[] = ['report_structure_templates', 'client_branding_profiles', 'integration_configs', 'depreciation_comps', 'depreciation_estimator_runs', 'charts', 'chart_analysis', 'chart_configurations', 'global_report_settings', 'finance_agent_contacts', 'bulk_generation_jobs', 'property_comparisons'];
    if (!validTables.includes(table)) {
      return new Response(
        JSON.stringify({ error: `Invalid table: ${table}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle RPC calls
    if (operation === 'rpc' && rpcName) {
      const { data: rpcData, error: rpcError } = await supabase.rpc(rpcName, rpcParams || {});
      
      if (rpcError) {
        console.error(`[manage-templates] RPC error:`, rpcError);
        return new Response(
          JSON.stringify({ error: rpcError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: true, data: rpcData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle list operation
    if (operation === 'list') {
      const { select = DEFAULT_SELECTS[table], orderBy = 'created_at', orderAsc = false, limit, filters } = listOptions;
      
      let query = supabase.from(table).select(select);
      
      // Apply filters
      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value !== undefined && value !== null) {
            query = query.eq(key, value);
          }
        }
      }
      
      query = query.order(orderBy, { ascending: orderAsc });
      
      if (limit) {
        query = query.limit(limit);
      }
      
      const { data: records, error } = await query;
      
      if (error) {
        console.error(`[manage-templates] List error:`, error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: true, records, count: records?.length || 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle get operation
    if (operation === 'get' && recordId) {
      const { data: record, error } = await supabase
        .from(table)
        .select('*')
        .eq('id', recordId)
        .single();
      
      if (error) {
        console.error(`[manage-templates] Get error:`, error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: error.code === 'PGRST116' ? 404 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: true, record }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle insert operation
    if (operation === 'insert' && data) {
      const { data: record, error } = await supabase
        .from(table)
        .insert(data)
        .select()
        .single();
      
      if (error) {
        console.error(`[manage-templates] Insert error:`, error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: true, record }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle update operation
    if (operation === 'update' && recordId && data) {
      const { data: record, error } = await supabase
        .from(table)
        .update(data)
        .eq('id', recordId)
        .select()
        .single();
      
      if (error) {
        console.error(`[manage-templates] Update error:`, error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: true, record }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle upsert operation
    if (operation === 'upsert' && data) {
      const upsertOptions = onConflict ? { onConflict } : {};
      const { data: record, error } = await supabase
        .from(table)
        .upsert(data, upsertOptions)
        .select();
      
      if (error) {
        console.error(`[manage-templates] Upsert error:`, error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: true, records: record }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle delete operation
    if (operation === 'delete' && recordId) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', recordId);
      
      if (error) {
        console.error(`[manage-templates] Delete error:`, error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid operation or missing required parameters' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[manage-templates] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
});
