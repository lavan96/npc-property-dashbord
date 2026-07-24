// Manage Borrowing Capacity scenarios — secure-mediation pattern
// Operations: list | create | delete (per client)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth, createUnauthorizedResponse, createCorsHeaders } from "../_shared/auth.ts";

import { enforceCsrf, csrfDenied } from "../_shared/csrfGuard.ts";
type Operation = 'list' | 'create' | 'delete';

interface RequestBody {
  operation: Operation;
  clientId?: string;
  recordId?: string;
  data?: {
    name: string;
    is_base?: boolean;
    payload: Record<string, unknown>;
  };
  session_token?: string;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const corsHeaders = createCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // SEC5-CSRF: reject cross-site cookie-authenticated mutations (exact-origin).
  // No-op for GET/HEAD/OPTIONS and any request without the session cookie.
  const __csrf = enforceCsrf(req);
  if (!__csrf.ok) return csrfDenied(corsHeaders, __csrf);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: RequestBody = await req.json();

    const { error: authError, userId, username } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.log('[manage-bc-scenarios] Auth error:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }
    console.log(`[manage-bc-scenarios] Auth OK: ${username || userId}`);

    const { operation, clientId, recordId, data } = body;

    if (!operation || !['list', 'create', 'delete'].includes(operation)) {
      return new Response(
        JSON.stringify({ success: false, error: `Invalid operation: ${operation}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (operation === 'list') {
      if (!clientId) {
        return new Response(
          JSON.stringify({ success: false, error: 'clientId is required for list' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const { data: rows, error } = await supabase
        .from('bc_scenarios')
        .select('id, client_id, name, is_base, payload, created_by, created_at, updated_at')
        .eq('client_id', clientId)
        .order('is_base', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('[manage-bc-scenarios] list error:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ success: true, items: rows || [], count: rows?.length || 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (operation === 'create') {
      if (!clientId || !data || !data.name || !data.payload) {
        return new Response(
          JSON.stringify({ success: false, error: 'clientId, data.name and data.payload are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Enforce only one is_base per client (replace existing base on conflict)
      if (data.is_base) {
        await supabase.from('bc_scenarios').delete().eq('client_id', clientId).eq('is_base', true);
      }

      const insertRow = {
        client_id: clientId,
        name: data.name.slice(0, 200),
        is_base: !!data.is_base,
        payload: data.payload,
        created_by: userId || null,
      };

      const { data: created, error } = await supabase
        .from('bc_scenarios')
        .insert(insertRow)
        .select()
        .single();

      if (error) {
        console.error('[manage-bc-scenarios] create error:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ success: true, item: created }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // delete
    if (!recordId) {
      return new Response(
        JSON.stringify({ success: false, error: 'recordId is required for delete' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const { error: delError } = await supabase
      .from('bc_scenarios')
      .delete()
      .eq('id', recordId);

    if (delError) {
      console.error('[manage-bc-scenarios] delete error:', delError);
      return new Response(
        JSON.stringify({ success: false, error: delError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({ success: true, deleted: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[manage-bc-scenarios] Unexpected error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Internal error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
});
