import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth, createUnauthorizedResponse, createCorsHeaders } from "../_shared/auth.ts";

type TableName = 'call_tags' | 'call_alert_rules' | 'call_alert_history';
type Operation = 'list' | 'create' | 'update' | 'delete';

interface RequestBody {
  operation: Operation;
  table: TableName;
  recordId?: string;
  data?: Record<string, any>;
  filters?: {
    orderBy?: string;
    orderAsc?: boolean;
    limit?: number;
    isRead?: boolean;
  };
  session_token?: string;
}

const ALLOWED_TABLES: TableName[] = ['call_tags', 'call_alert_rules', 'call_alert_history'];

serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const corsHeaders = createCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: RequestBody = await req.json();

    // SECURITY: Verify authentication
    const { error: authError, userId, username } = await verifyAuth(supabase, req.headers, body);

    if (authError) {
      console.log('[manage-call-settings] Auth error:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }

    console.log(`[manage-call-settings] Authenticated user: ${username || userId} (${userId})`);

    const { operation, table, recordId, data, filters } = body;

    // Validate table
    if (!ALLOWED_TABLES.includes(table)) {
      return new Response(
        JSON.stringify({ success: false, error: `Invalid table: ${table}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate operation
    if (!['list', 'create', 'update', 'delete'].includes(operation)) {
      return new Response(
        JSON.stringify({ success: false, error: `Invalid operation: ${operation}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let result: any;

    switch (operation) {
      case 'list': {
        let query = supabase.from(table).select('*');
        
        // Apply ordering
        if (filters?.orderBy) {
          query = query.order(filters.orderBy, { ascending: filters.orderAsc ?? true });
        } else {
          // Default ordering based on table
          if (table === 'call_tags') {
            query = query.order('name', { ascending: true });
          } else if (table === 'call_alert_rules') {
            query = query.order('created_at', { ascending: false });
          } else if (table === 'call_alert_history') {
            query = query.order('triggered_at', { ascending: false });
          }
        }
        
        // Apply limit for history
        if (filters?.limit) {
          query = query.limit(filters.limit);
        } else if (table === 'call_alert_history') {
          query = query.limit(50); // Default limit for history
        }

        const { data: rows, error } = await query;
        
        if (error) {
          console.error(`[manage-call-settings] Error listing ${table}:`, error);
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        result = { items: rows, count: rows?.length || 0 };
        break;
      }

      case 'create': {
        if (!data) {
          return new Response(
            JSON.stringify({ success: false, error: 'Data is required for create operation' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: created, error } = await supabase
          .from(table)
          .insert(data)
          .select()
          .single();

        if (error) {
          console.error(`[manage-call-settings] Error creating ${table}:`, error);
          return new Response(
            JSON.stringify({ success: false, error: error.message, code: error.code }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = { item: created };
        break;
      }

      case 'update': {
        if (!recordId) {
          return new Response(
            JSON.stringify({ success: false, error: 'recordId is required for update operation' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!data) {
          return new Response(
            JSON.stringify({ success: false, error: 'Data is required for update operation' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Special case: bulk update for marking alerts as read
        if (table === 'call_alert_history' && recordId === 'bulk' && data.is_read !== undefined) {
          const { error } = await supabase
            .from(table)
            .update({ is_read: data.is_read })
            .eq('is_read', false);

          if (error) {
            console.error(`[manage-call-settings] Error bulk updating ${table}:`, error);
            return new Response(
              JSON.stringify({ success: false, error: error.message }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          result = { updated: true, bulk: true };
        } else {
          const { data: updated, error } = await supabase
            .from(table)
            .update(data)
            .eq('id', recordId)
            .select()
            .single();

          if (error) {
            console.error(`[manage-call-settings] Error updating ${table}:`, error);
            return new Response(
              JSON.stringify({ success: false, error: error.message }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          result = { item: updated };
        }
        break;
      }

      case 'delete': {
        if (!recordId) {
          return new Response(
            JSON.stringify({ success: false, error: 'recordId is required for delete operation' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error } = await supabase
          .from(table)
          .delete()
          .eq('id', recordId);

        if (error) {
          console.error(`[manage-call-settings] Error deleting from ${table}:`, error);
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = { deleted: true };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown operation: ${operation}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    console.log(`[manage-call-settings] ${operation} on ${table} completed successfully`);
    
    return new Response(
      JSON.stringify({ success: true, operation, table, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[manage-call-settings] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
});
