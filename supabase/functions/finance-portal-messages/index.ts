/**
 * Finance Portal Messages — secure messaging between finance partners and internal staff.
 *
 * Dual auth modes:
 *   • Partner mode:  x-finance-session-token header (partner-side calls)
 *   • Staff mode:    standard internal auth via verifyAuth (internal dashboard calls)
 *
 * Operations:
 *   - list_threads             (partner: own threads only · staff: all threads, optionally for client_id)
 *   - get_or_create_thread     (partner+staff)
 *   - list_messages            (both — bound to thread_id)
 *   - send_message             (both — body, optional attachment metadata)
 *   - mark_thread_read         (both — clears unread for the calling side)
 *   - get_attachment_url       (both — signed URL)
 *   - upload_attachment_url    (both — signed PUT URL for the bucket)
 *   - unread_count             (partner only — total unread for the badge)
 *   - archive_thread           (staff only)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { verifyAuth, createCorsHeaders } from "../_shared/auth.ts";
import { notifyFinancePortalAssignees } from "../_shared/finance-portal-notify.ts";

const BUCKET = 'finance-portal-messages';
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const SIGNED_URL_TTL = 60 * 10;
const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument', 'text/'];

function extractFinanceToken(headers: Headers, body?: any): string | null {
  return headers.get('x-finance-session-token')
    || headers.get('x-session-token')
    || headers.get('x-session-id')
    || body?.finance_session_token
    || body?.session_token
    || null;
}

function jsonResponse(data: any, status = 200, corsHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = {
    ...createCorsHeaders(origin),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-finance-session-token, x-session-token, x-session-id',
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json().catch(() => ({}));
    const { operation } = body;
    if (!operation) return jsonResponse({ error: 'operation required' }, 400, corsHeaders);

    // ── Resolve actor (partner vs staff) ──
    const financeToken = extractFinanceToken(req.headers, body);
    let actor: { type: 'partner'; portalUserId: string; email: string; name: string }
             | { type: 'staff'; userId: string; username: string }
             | null = null;

    if (financeToken) {
      const { data: portalUser, error: portalUserErr } = await supabase
        .from('finance_portal_users')
        .select('id, email, is_active, revoked_at, session_expires_at')
        .eq('session_token', financeToken)
        .maybeSingle();
      if (portalUserErr) {
        console.error('[finance-portal-messages] session lookup failed', portalUserErr.message);
        return jsonResponse({ error: 'Session lookup failed' }, 500, corsHeaders);
      }
      if (!portalUser || !portalUser.is_active || portalUser.revoked_at) {
        return jsonResponse({ error: 'Invalid session' }, 401, corsHeaders);
      }
      if (!portalUser.session_expires_at || new Date(portalUser.session_expires_at) < new Date()) {
        return jsonResponse({ error: 'Session expired' }, 401, corsHeaders);
      }
      actor = { type: 'partner', portalUserId: portalUser.id, email: portalUser.email, name: portalUser.email };
    } else {
      const auth = await verifyAuth(supabase, req.headers, body);
      if (auth.error || !auth.userId) {
        return jsonResponse({ error: 'Authentication required' }, 401, corsHeaders);
      }
      actor = { type: 'staff', userId: auth.userId, username: auth.username || 'Staff' };
    }

    // Helper: ensure partner is assigned to client and has messages permission
    const assertPartnerAssigned = async (clientId: string) => {
      if (actor!.type !== 'partner') return null;
      const { data: a } = await supabase
        .from('finance_portal_client_assignments')
        .select('id, permissions')
        .eq('finance_user_id', actor!.portalUserId)
        .eq('client_id', clientId)
        .maybeSingle();
      if (!a) return jsonResponse({ error: 'Not assigned to this client' }, 403, corsHeaders);
      // Check messages permission — default to true for backward compatibility
      const perms = (a.permissions || {}) as Record<string, any>;
      const msgPerm = perms.messages;
      if (msgPerm && msgPerm.view === false) {
        return jsonResponse({ error: 'No messages permission for this client' }, 403, corsHeaders);
      }
      return null;
    };

    // ── unread_count (partner only) ──
    if (operation === 'unread_count') {
      if (actor.type !== 'partner') return jsonResponse({ error: 'Partner only' }, 403, corsHeaders);
      const { data, error } = await supabase
        .from('finance_portal_threads')
        .select('unread_count_partner')
        .eq('finance_user_id', actor.portalUserId);
      if (error) throw error;
      const total = (data || []).reduce((s, t: any) => s + (t.unread_count_partner || 0), 0);
      return jsonResponse({ success: true, count: total }, 200, corsHeaders);
    }

    // ── list_threads ──
    if (operation === 'list_threads') {
      let query = supabase
        .from('finance_portal_threads')
        .select(`
          id, client_id, finance_user_id, subject, last_message_at, last_message_preview,
          unread_count_partner, unread_count_staff, is_archived, created_at,
          clients:client_id (id, primary_first_name, primary_surname, secondary_first_name, secondary_surname),
          finance_portal_users:finance_user_id (id, email)
        `)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(200);

      if (actor.type === 'partner') {
        query = query.eq('finance_user_id', actor.portalUserId);
      } else if (body.client_id) {
        query = query.eq('client_id', body.client_id);
      } else if (body.finance_user_id) {
        query = query.eq('finance_user_id', body.finance_user_id);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Synthesize legacy field names so callers don't break
      const threads = (data || []).map((t: any) => ({
        ...t,
        clients: t.clients ? {
          id: t.clients.id,
          primary_contact_name: [t.clients.primary_first_name, t.clients.primary_surname].filter(Boolean).join(' ').trim() || null,
          secondary_contact_name: [t.clients.secondary_first_name, t.clients.secondary_surname].filter(Boolean).join(' ').trim() || null,
        } : null,
      }));
      return jsonResponse({ success: true, threads }, 200, corsHeaders);
    }

    // ── get_or_create_thread ──
    if (operation === 'get_or_create_thread') {
      const { client_id, finance_user_id, subject } = body;
      if (!client_id) return jsonResponse({ error: 'client_id required' }, 400, corsHeaders);

      let fuId = actor.type === 'partner' ? actor.portalUserId : finance_user_id;
      if (!fuId && actor.type === 'staff') {
        const { data: assignment } = await supabase
          .from('finance_portal_client_assignments')
          .select('finance_user_id, assigned_at')
          .eq('client_id', client_id)
          .order('assigned_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        fuId = assignment?.finance_user_id || null;
      }
      if (!fuId) return jsonResponse({ error: 'No finance partner assigned to this client yet' }, 404, corsHeaders);

      const denied = await assertPartnerAssigned(client_id);
      if (denied) return denied;

      const { data: existing } = await supabase
        .from('finance_portal_threads')
        .select('*')
        .eq('client_id', client_id)
        .eq('finance_user_id', fuId)
        .maybeSingle();

      if (existing) return jsonResponse({ success: true, thread: existing }, 200, corsHeaders);

      const { data: created, error } = await supabase
        .from('finance_portal_threads')
        .insert({ client_id, finance_user_id: fuId, subject: subject?.slice(0, 200) || null })
        .select()
        .single();
      if (error) throw error;
      return jsonResponse({ success: true, thread: created }, 200, corsHeaders);
    }

    // ── list_messages ──
    if (operation === 'list_messages') {
      const { thread_id } = body;
      if (!thread_id) return jsonResponse({ error: 'thread_id required' }, 400, corsHeaders);

      const { data: thread } = await supabase
        .from('finance_portal_threads')
        .select('id, client_id, finance_user_id')
        .eq('id', thread_id)
        .maybeSingle();
      if (!thread) return jsonResponse({ error: 'Thread not found' }, 404, corsHeaders);
      if (actor.type === 'partner' && thread.finance_user_id !== actor.portalUserId) {
        return jsonResponse({ error: 'Forbidden' }, 403, corsHeaders);
      }

      const { data, error } = await supabase
        .from('finance_portal_messages')
        .select('*')
        .eq('thread_id', thread_id)
        .order('created_at', { ascending: true })
        .limit(500);
      if (error) throw error;
      return jsonResponse({ success: true, messages: data || [], thread }, 200, corsHeaders);
    }

    // ── mark_thread_read ──
    if (operation === 'mark_thread_read') {
      const { thread_id } = body;
      if (!thread_id) return jsonResponse({ error: 'thread_id required' }, 400, corsHeaders);

      const { data: thread } = await supabase
        .from('finance_portal_threads')
        .select('id, finance_user_id')
        .eq('id', thread_id)
        .maybeSingle();
      if (!thread) return jsonResponse({ error: 'Thread not found' }, 404, corsHeaders);
      if (actor.type === 'partner' && thread.finance_user_id !== actor.portalUserId) {
        return jsonResponse({ error: 'Forbidden' }, 403, corsHeaders);
      }

      const updates: any = actor.type === 'partner'
        ? { unread_count_partner: 0 }
        : { unread_count_staff: 0 };
      await supabase.from('finance_portal_threads').update(updates).eq('id', thread_id);

      const msgUpdate = actor.type === 'partner'
        ? { is_read_by_partner: true, read_by_partner_at: new Date().toISOString() }
        : { is_read_by_staff: true, read_by_staff_at: new Date().toISOString() };
      const filterField = actor.type === 'partner' ? 'is_read_by_partner' : 'is_read_by_staff';
      await supabase
        .from('finance_portal_messages')
        .update(msgUpdate)
        .eq('thread_id', thread_id)
        .eq(filterField, false);

      return jsonResponse({ success: true }, 200, corsHeaders);
    }

    // ── send_message ──
    if (operation === 'send_message') {
      const { thread_id, body: messageBody, attachment } = body;
      if (!thread_id) return jsonResponse({ error: 'thread_id required' }, 400, corsHeaders);
      const trimmed = (messageBody || '').toString().trim();
      if (!trimmed && !attachment) return jsonResponse({ error: 'body or attachment required' }, 400, corsHeaders);
      if (trimmed.length > 5000) return jsonResponse({ error: 'Message too long (max 5000 chars)' }, 400, corsHeaders);

      const { data: thread } = await supabase
        .from('finance_portal_threads')
        .select('id, client_id, finance_user_id')
        .eq('id', thread_id)
        .maybeSingle();
      if (!thread) return jsonResponse({ error: 'Thread not found' }, 404, corsHeaders);
      if (actor.type === 'partner' && thread.finance_user_id !== actor.portalUserId) {
        return jsonResponse({ error: 'Forbidden' }, 403, corsHeaders);
      }

      const insertRow: any = {
        thread_id,
        client_id: thread.client_id,
        sender_type: actor.type,
        sender_name: actor.type === 'partner' ? actor.name : actor.username,
        body: trimmed || '(attachment)',
      };
      if (actor.type === 'partner') insertRow.finance_user_id = actor.portalUserId;
      else insertRow.staff_user_id = actor.userId;

      if (attachment && attachment.path) {
        insertRow.attachment_path = attachment.path;
        insertRow.attachment_filename = (attachment.filename || '').slice(0, 255) || null;
        insertRow.attachment_mime = (attachment.mime || '').slice(0, 100) || null;
        insertRow.attachment_size_bytes = Number(attachment.size) || null;
      }

      const { data: message, error } = await supabase
        .from('finance_portal_messages')
        .insert(insertRow)
        .select()
        .single();
      if (error) throw error;

      // Audit
      try {
        await supabase.from('finance_portal_activity_log').insert({
          finance_user_id: actor.type === 'partner' ? actor.portalUserId : thread.finance_user_id,
          client_id: thread.client_id,
          actor_user_id: actor.type === 'staff' ? actor.userId : null,
          actor_type: actor.type === 'partner' ? 'finance_partner' : 'admin',
          action: 'message_sent',
          entity_type: 'finance_portal_message',
          entity_id: message.id,
          metadata: { thread_id, has_attachment: !!attachment },
        });
      } catch (e) { console.error('[messages] audit failed', e); }

      // Notify partner when staff sends
      if (actor.type === 'staff') {
        await notifyFinancePortalAssignees({
          client_id: thread.client_id,
          notification_type: 'message_received',
          title: 'New message from staff',
          body: trimmed.slice(0, 140) || 'Sent you an attachment',
          link_path: `/finance/clients/${thread.client_id}?tab=messages`,
          metadata: { thread_id, message_id: message.id },
        });
      }

      return jsonResponse({ success: true, message }, 200, corsHeaders);
    }

    // ── upload_attachment_url ──
    if (operation === 'upload_attachment_url') {
      const { thread_id, filename, mime, size } = body;
      if (!thread_id || !filename) return jsonResponse({ error: 'thread_id and filename required' }, 400, corsHeaders);
      if (size && Number(size) > MAX_FILE_SIZE) return jsonResponse({ error: 'File too large (max 25 MB)' }, 400, corsHeaders);
      if (mime && !ALLOWED_MIME_PREFIXES.some(p => String(mime).startsWith(p))) {
        return jsonResponse({ error: 'File type not allowed' }, 400, corsHeaders);
      }

      const { data: thread } = await supabase
        .from('finance_portal_threads')
        .select('id, client_id, finance_user_id')
        .eq('id', thread_id)
        .maybeSingle();
      if (!thread) return jsonResponse({ error: 'Thread not found' }, 404, corsHeaders);
      if (actor.type === 'partner' && thread.finance_user_id !== actor.portalUserId) {
        return jsonResponse({ error: 'Forbidden' }, 403, corsHeaders);
      }

      const safe = String(filename).replace(/[^\w.\-]+/g, '_').slice(0, 200);
      const path = `${thread.client_id}/${thread_id}/${Date.now()}_${safe}`;
      const { data: signed, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUploadUrl(path);
      if (error) throw error;
      return jsonResponse({ success: true, path, token: signed?.token, signedUrl: signed?.signedUrl }, 200, corsHeaders);
    }

    // ── get_attachment_url ──
    if (operation === 'get_attachment_url') {
      const { message_id } = body;
      if (!message_id) return jsonResponse({ error: 'message_id required' }, 400, corsHeaders);

      const { data: msg } = await supabase
        .from('finance_portal_messages')
        .select('id, thread_id, attachment_path, finance_portal_threads:thread_id(finance_user_id)')
        .eq('id', message_id)
        .maybeSingle();
      if (!msg || !msg.attachment_path) return jsonResponse({ error: 'Attachment not found' }, 404, corsHeaders);

      if (actor.type === 'partner') {
        const fuId = (msg as any).finance_portal_threads?.finance_user_id;
        if (fuId !== actor.portalUserId) return jsonResponse({ error: 'Forbidden' }, 403, corsHeaders);
      }

      const { data: signed, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(msg.attachment_path, SIGNED_URL_TTL);
      if (error) throw error;
      return jsonResponse({ success: true, url: signed?.signedUrl }, 200, corsHeaders);
    }

    // ── archive_thread (staff only) ──
    if (operation === 'archive_thread') {
      if (actor.type !== 'staff') return jsonResponse({ error: 'Staff only' }, 403, corsHeaders);
      const { thread_id, archived } = body;
      if (!thread_id) return jsonResponse({ error: 'thread_id required' }, 400, corsHeaders);
      const { error } = await supabase
        .from('finance_portal_threads')
        .update({ is_archived: !!archived })
        .eq('id', thread_id);
      if (error) throw error;
      return jsonResponse({ success: true }, 200, corsHeaders);
    }

    return jsonResponse({ error: `Unknown operation: ${operation}` }, 400, corsHeaders);
  } catch (e: any) {
    console.error('[finance-portal-messages] error', e);
    return jsonResponse({ error: 'Internal server error', details: e?.message }, 500, corsHeaders);
  }
});
