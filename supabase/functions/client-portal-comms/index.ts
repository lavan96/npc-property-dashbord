/**
 * Client Portal — unified inbox.
 *
 * Aggregates a single client's correspondence across every channel into one
 * timeline: portal messages (client_portal_messages), GHL conversations
 * (SMS / WhatsApp / email via ghl_conversation_messages) and broker-initiated
 * outbound messages (finance_outbound_messages).
 *
 * Auth: client portal session token (x-portal-session-token / body). Service
 * role internally; results are always scoped to the caller's own client_id.
 *
 * Operations:
 *   - list   { channels?: string[], limit? }   → unified, newest-first timeline
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { createCorsHeaders } from '../_shared/auth.ts';

function extractPortalToken(headers: Headers, body?: any): string | null {
  return (
    headers.get('x-portal-session-token') ||
    body?.portal_session_token ||
    headers.get('x-session-token') ||
    body?.session_token ||
    null
  );
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json().catch(() => ({}));
    const token = extractPortalToken(req.headers, body);
    if (!token) return json({ error: 'Authentication required', success: false }, 401);

    // Validate session → resolve client_id
    const { data: session } = await supabase
      .from('client_portal_sessions')
      .select('*, client_portal_users:user_id ( id, client_id, status, email )')
      .eq('session_token', token)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    const portalUser = (session as any)?.client_portal_users;
    if (!portalUser || portalUser.status !== 'active') {
      return json({ error: 'Invalid or expired session', success: false }, 401);
    }
    const clientId = portalUser.client_id;
    const operation = body.operation || 'list';

    if (operation === 'list') {
      const limit = Math.min(Number(body.limit) || 100, 300);
      const channels: string[] | null = Array.isArray(body.channels) ? body.channels : null;

      const [portalMsgs, ghlConv, outbound, financeThreads] = await Promise.all([
        supabase
          .from('client_portal_messages')
          .select('id, sender_type, sender_name, message, is_read, read_at, created_at')
          .eq('client_id', clientId)
          .or('is_internal.is.null,is_internal.eq.false') // never expose staff-only internal messages to the client
          .order('created_at', { ascending: false })
          .limit(limit),
        supabase
          .from('ghl_conversations')
          .select('id, channel_type')
          .eq('client_id', clientId),
        supabase
          .from('finance_outbound_messages')
          .select('id, channel, body, subject, status, read_at, delivered_at, created_at, provider_message_id')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(limit),
        supabase
          .from('finance_portal_threads')
          .select('id, subject, visibility_scope, allocation_status, thread_type')
          .eq('client_id', clientId)
          .in('visibility_scope', ['finance_client_with_command_visibility', 'command_client_with_finance_allocated'])
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(25),
      ]);

      let financeMsgs: any[] = [];
      const visibleFinanceThreadIds = (financeThreads.data ?? []).map((t: any) => t.id);
      const financeThreadMeta = new Map((financeThreads.data ?? []).map((t: any) => [t.id, t]));
      if (visibleFinanceThreadIds.length > 0) {
        const { data: fmsgs } = await supabase
          .from('finance_portal_messages')
          .select('id, thread_id, sender_type, sender_name, body, attachment_filename, created_at, visibility_scope, allocation_status, thread_type')
          .in('thread_id', visibleFinanceThreadIds)
          .in('visibility_scope', ['finance_client_with_command_visibility', 'command_client_with_finance_allocated'])
          .order('created_at', { ascending: false })
          .limit(limit);
        financeMsgs = fmsgs ?? [];
      }

      let ghlMsgs: any[] = [];
      if ((ghlConv.data ?? []).length > 0) {
        const convIds = ghlConv.data!.map((c: any) => c.id);
        const { data: msgs } = await supabase
          .from('ghl_conversation_messages')
          .select('id, ghl_message_id, direction, channel_type, body, sender_name, ghl_date_added, created_at')
          .in('conversation_id', convIds)
          .order('ghl_date_added', { ascending: false })
          .limit(limit);
        ghlMsgs = msgs ?? [];
      }

      const unified: any[] = [];
      for (const m of portalMsgs.data ?? []) {
        unified.push({
          id: `portal:${m.id}`,
          kind: 'portal',
          channel: 'portal',
          direction: m.sender_type === 'client' ? 'outbound' : 'inbound',
          sender_name: m.sender_name,
          body: m.message,
          subject: null,
          created_at: m.created_at,
          is_read: m.is_read,
        });
      }
      for (const m of financeMsgs) {
        const thread = financeThreadMeta.get(m.thread_id) as any;
        unified.push({
          id: `finance:${m.id}`,
          kind: 'finance',
          channel: 'portal',
          direction: m.sender_type === 'client' ? 'outbound' : 'inbound',
          sender_name: m.sender_name,
          body: m.body,
          subject: thread?.subject || 'Finance conversation',
          created_at: m.created_at,
          is_read: true,
          thread_id: m.thread_id,
          visibility_scope: m.visibility_scope,
          allocation_status: m.allocation_status,
          thread_type: m.thread_type,
        });
      }
      for (const m of ghlMsgs) {
        unified.push({
          id: `ghl:${m.id}`,
          kind: 'ghl',
          channel: (m.channel_type || 'sms').toLowerCase(),
          // From the client's perspective, an inbound (to the business) message is
          // one they sent; outbound (from the business) is one they received.
          direction: m.direction === 'inbound' ? 'outbound' : 'inbound',
          sender_name: m.sender_name,
          body: m.body,
          subject: null,
          created_at: m.ghl_date_added || m.created_at,
          is_read: true,
        });
      }
      for (const m of outbound.data ?? []) {
        // Skip rows already represented via GHL, and portal rows (covered above).
        if (m.provider_message_id && ghlMsgs.some((g) => g.ghl_message_id === m.provider_message_id)) continue;
        if (m.channel === 'portal') continue;
        unified.push({
          id: `out:${m.id}`,
          kind: 'outbound',
          channel: m.channel,
          direction: 'inbound', // sent by the business to the client
          sender_name: null,
          body: m.body,
          subject: m.subject,
          created_at: m.created_at,
          is_read: true,
        });
      }

      const filtered = channels ? unified.filter((m) => channels.includes(m.channel)) : unified;
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return json({ success: true, messages: filtered.slice(0, limit) });
    }

    if (operation === 'send_finance_reply') {
      const threadId = body.thread_id;
      const message = (body.message || '').toString().trim();
      if (!threadId) return json({ error: 'thread_id required', success: false }, 400);
      if (!message) return json({ error: 'message required', success: false }, 400);
      if (message.length > 5000) return json({ error: 'Message too long (max 5000)', success: false }, 400);

      const { data: thread } = await supabase
        .from('finance_portal_threads')
        .select('id, client_id, visibility_scope')
        .eq('id', threadId)
        .eq('client_id', clientId)
        .in('visibility_scope', ['finance_client_with_command_visibility', 'command_client_with_finance_allocated'])
        .maybeSingle();
      if (!thread) return json({ error: 'Thread not found or access denied', success: false }, 403);

      const { data: inserted, error } = await supabase
        .from('finance_portal_messages')
        .insert({
          thread_id: threadId,
          client_id: clientId,
          sender_type: 'client',
          sender_name: portalUser.email || 'Client',
          body: message,
          visibility_scope: 'finance_client_with_command_visibility',
          thread_type: 'finance_client',
          allocation_status: 'none',
          permission_status: { command_centre: 'full', finance_portal: 'granted', client_portal: 'granted' },
        })
        .select()
        .single();
      if (error) return json({ error: error.message || 'Send failed', success: false }, 400);

      const { data: assignments } = await supabase
        .from('finance_portal_client_assignments')
        .select('finance_user_id')
        .eq('client_id', clientId);
      const portalRows = (assignments || []).map((a: any) => ({
        portal_user_id: a.finance_user_id,
        client_id: clientId,
        notification_type: 'client_finance_reply',
        title: 'Client replied to finance',
        body: message.slice(0, 140),
        link_path: '/finance/messages',
        metadata: { thread_id: threadId, message_id: inserted.id, source: 'client_portal' },
      }));
      if (portalRows.length) await supabase.from('finance_portal_notifications').insert(portalRows);

      return json({ success: true, message: inserted });
    }

    return json({ error: `Unknown operation: ${operation}`, success: false }, 400);
  } catch (err: any) {
    return json({ error: err?.message || 'Unhandled error', success: false }, 500);
  }
});
