/**
 * Command Centre Message Governance — staff-only audit/read model for governed
 * portal correspondence. This is the Command Centre visibility surface for
 * message routing, permission, notification, and attachment audit events.
 *
 * Operations:
 *  - list_events      { client_id?, thread_id?, message_id?, event_type?, limit?, cursor_created_at? }
 *  - list_by_client   { client_id, limit? }
 *  - list_by_thread   { thread_id, limit? }
 *  - list_by_message  { message_id, limit? }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createCorsHeaders } from '../_shared/auth.ts';

function jsonResponse(data: unknown, status = 200, corsHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = {
    ...createCorsHeaders(origin),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token, x-session-id',
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json().catch(() => ({}));
    const auth = await verifyAuth(supabase, req.headers, body);
    if (auth.error || !auth.userId) {
      return jsonResponse({ success: false, error: auth.error || 'Authentication required' }, 401, corsHeaders);
    }

    if (auth.userId !== 'service_role') {
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', auth.userId)
        .in('role', ['superadmin', 'admin'])
        .maybeSingle();

      if (roleError) {
        return jsonResponse({ success: false, error: roleError.message }, 500, corsHeaders);
      }

      if (!roleData) {
        return jsonResponse({ success: false, error: 'Command Centre admin access required' }, 403, corsHeaders);
      }
    }

    const operation = body.operation || 'list_events';
    const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 500);

    let query = supabase
      .from('message_governance_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (operation === 'list_by_client') {
      if (!body.client_id) return jsonResponse({ success: false, error: 'client_id required' }, 400, corsHeaders);
      query = query.eq('client_id', body.client_id);
    } else if (operation === 'list_by_thread') {
      if (!body.thread_id) return jsonResponse({ success: false, error: 'thread_id required' }, 400, corsHeaders);
      query = query.eq('thread_id', body.thread_id);
    } else if (operation === 'list_by_message') {
      if (!body.message_id) return jsonResponse({ success: false, error: 'message_id required' }, 400, corsHeaders);
      query = query.eq('message_id', body.message_id);
    } else if (operation === 'list_events') {
      if (body.client_id) query = query.eq('client_id', body.client_id);
      if (body.thread_id) query = query.eq('thread_id', body.thread_id);
      if (body.message_id) query = query.eq('message_id', body.message_id);
      if (body.event_type) query = query.eq('event_type', body.event_type);
      if (body.cursor_created_at) query = query.lt('created_at', body.cursor_created_at);
    } else {
      return jsonResponse({ success: false, error: `Unknown operation: ${operation}` }, 400, corsHeaders);
    }

    const { data, error } = await query;
    if (error) return jsonResponse({ success: false, error: error.message }, 500, corsHeaders);

    return jsonResponse({
      success: true,
      events: data || [],
      next_cursor: data?.length === limit ? data[data.length - 1]?.created_at : null,
    }, 200, corsHeaders);
  } catch (err: any) {
    console.error('[message-governance] error', err);
    return jsonResponse({ success: false, error: err.message || 'Internal error' }, 500, corsHeaders);
  }
});
