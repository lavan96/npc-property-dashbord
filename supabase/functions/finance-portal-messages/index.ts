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

function extractFinancePortalToken(headers: Headers, body?: any): string | null {
  // Only finance-specific token locations identify a Finance Portal partner.
  // Command Centre staff calls also include generic x-session-token/session_token
  // values for internal auth; treating those as finance sessions causes false
  // "Invalid session" errors before staff auth can run.
  return headers.get('x-finance-session-token')
    || body?.finance_session_token
    || null;
}

function jsonResponse(data: any, status = 200, corsHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function ensureStaffFinanceMessageNotification(supabase: any, messageRow: any, threadId: string) {
  try {
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .contains('metadata', { message_id: messageRow.id })
      .eq('type', 'finance_portal_message_received')
      .maybeSingle();

    if (existing?.id) return;

    const { data: client } = await supabase
      .from('clients')
      .select('primary_first_name, primary_surname, primary_email, assigned_team_user_id')
      .eq('id', messageRow.client_id)
      .maybeSingle();

    const clientName = [client?.primary_first_name, client?.primary_surname]
      .filter(Boolean)
      .join(' ') || client?.primary_email || 'Client';
    const preview = (messageRow.body || '').slice(0, 140) || '(attachment)';

    await supabase.from('notifications').insert({
      type: 'finance_portal_message_received',
      title: `New finance message · ${clientName}`,
      message: preview,
      entity_id: messageRow.client_id,
      target_user_id: client?.assigned_team_user_id || null,
      metadata: {
        client_id: messageRow.client_id,
        thread_id: threadId,
        message_id: messageRow.id,
        sender_name: messageRow.sender_name,
        link_path: `/clients?clientId=${messageRow.client_id}&tab=finance-messages`,
        source: 'finance-portal-messages',
      },
    });
  } catch (e) {
    console.error('Failed to ensure staff finance message notification:', e);
  }
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
    const financeToken = extractFinancePortalToken(req.headers, body);
    const portalToken = req.headers.get('x-portal-session-token') || body?.portal_session_token || null;
    let actor: { type: 'partner'; portalUserId: string; email: string; name: string }
             | { type: 'staff'; userId: string; username: string }
             | { type: 'client'; portalUserId: string; clientId: string; name: string }
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
    } else if (portalToken) {
      const { data: session } = await supabase
        .from('client_portal_sessions')
        .select('*, client_portal_users:user_id ( id, client_id, status, email )')
        .eq('session_token', portalToken)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      const portalUser = (session as any)?.client_portal_users;
      if (!portalUser || portalUser.status !== 'active') {
        return jsonResponse({ error: 'Invalid or expired client session' }, 401, corsHeaders);
      }
      actor = {
        type: 'client',
        portalUserId: portalUser.id,
        clientId: portalUser.client_id,
        name: portalUser.email || 'Client',
      };
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


    const scopeForThreadType = (scope: string) => {
      if (scope === 'finance_client_with_command_visibility') return 'finance_client';
      if (scope === 'command_client_with_finance_allocated') return 'command_client_allocated';
      if (scope === 'internal_command_only') return 'internal_command';
      return 'command_finance';
    };

    const permittedScopesForActor = (actorType: string) => {
      if (actorType === 'partner') {
        return ['command_finance_private', 'command_client_with_finance_allocated', 'finance_client_with_command_visibility'];
      }
      if (actorType === 'client') {
        return ['command_client_with_finance_allocated', 'finance_client_with_command_visibility'];
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
          unread_count_partner, unread_count_staff, is_archived, created_at, visibility_scope, thread_type, allocation_status, finance_allocated,
          clients:client_id (id, primary_first_name, primary_surname, secondary_first_name, secondary_surname),
          finance_portal_users:finance_user_id (id, email)
        `)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(200);

      if (actor.type === 'partner') {
        query = query.eq('finance_user_id', actor.portalUserId)
          .in('visibility_scope', ['command_finance_private', 'command_client_with_finance_allocated', 'finance_client_with_command_visibility']);
      } else if (actor.type === 'client') {
        query = query.eq('client_id', actor.clientId)
          .in('visibility_scope', ['finance_client_with_command_visibility', 'command_client_with_finance_allocated']);
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
      if (actor.type === 'client') {
        return jsonResponse({ error: 'Clients cannot create finance threads; reply to an existing authorised thread' }, 403, corsHeaders);
      }

      const requestedScope = body.visibility_scope || 'command_finance_private';
      const requestedThreadType = body.thread_type || scopeForThreadType(requestedScope);
      const allowedScopes = permittedScopesForActor(actor.type);
      if (allowedScopes && !allowedScopes.includes(requestedScope)) {
        return jsonResponse({ error: 'Requested visibility scope is not permitted for this actor' }, 403, corsHeaders);
      }

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
        .eq('thread_type', requestedThreadType)
        .maybeSingle();

      if (existing) return jsonResponse({ success: true, thread: existing }, 200, corsHeaders);

      const requestedPermissionStatus = body.permission_status
        || (requestedScope === 'finance_client_with_command_visibility'
          ? { command_centre: 'full', finance_portal: 'granted', client_portal: 'granted' }
          : requestedScope === 'command_client_with_finance_allocated'
            ? { command_centre: 'full', finance_portal: 'thread_granted', client_portal: 'granted' }
            : { command_centre: 'full', finance_portal: 'granted', client_portal: 'blocked' });

      const { data: created, error } = await supabase
        .from('finance_portal_threads')
        .insert({
          client_id,
          finance_user_id: fuId,
          subject: subject?.slice(0, 200) || null,
          visibility_scope: requestedScope,
          thread_type: requestedThreadType,
          allocation_status: body.allocation_status || 'none',
          finance_allocated: body.finance_allocated === true,
          command_owner_user_id: actor.type === 'staff' ? actor.userId : null,
          permission_status: requestedPermissionStatus,
        })
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
        .select('id, client_id, finance_user_id, visibility_scope')
        .eq('id', thread_id)
        .maybeSingle();
      if (!thread) return jsonResponse({ error: 'Thread not found' }, 404, corsHeaders);
      if (actor.type === 'partner' && thread.finance_user_id !== actor.portalUserId) {
        return jsonResponse({ error: 'Forbidden' }, 403, corsHeaders);
      }
      if (actor.type === 'client' && (thread.client_id !== actor.clientId || !['finance_client_with_command_visibility', 'command_client_with_finance_allocated'].includes(thread.visibility_scope))) {
        return jsonResponse({ error: 'Forbidden' }, 403, corsHeaders);
      }

      let messageQuery = supabase
        .from('finance_portal_messages')
        .select('*')
        .eq('thread_id', thread_id)
        .order('created_at', { ascending: true })
        .limit(500);
      const messageAllowedScopes = permittedScopesForActor(actor.type);
      if (messageAllowedScopes) messageQuery = messageQuery.in('visibility_scope', messageAllowedScopes);

      const { data, error } = await messageQuery;
      if (error) throw error;
      return jsonResponse({ success: true, messages: data || [], thread }, 200, corsHeaders);
    }

    // ── mark_thread_read ──
    if (operation === 'mark_thread_read') {
      const { thread_id } = body;
      if (!thread_id) return jsonResponse({ error: 'thread_id required' }, 400, corsHeaders);

      const { data: thread } = await supabase
        .from('finance_portal_threads')
        .select('id, client_id, finance_user_id, visibility_scope')
        .eq('id', thread_id)
        .maybeSingle();
      if (!thread) return jsonResponse({ error: 'Thread not found' }, 404, corsHeaders);
      if (actor.type === 'partner' && thread.finance_user_id !== actor.portalUserId) {
        return jsonResponse({ error: 'Forbidden' }, 403, corsHeaders);
      }

      if (actor.type === 'client' && (thread.client_id !== actor.clientId || !['finance_client_with_command_visibility', 'command_client_with_finance_allocated'].includes(thread.visibility_scope))) {
        return jsonResponse({ error: 'Forbidden' }, 403, corsHeaders);
      }

      const updates: any = actor.type === 'partner'
        ? { unread_count_partner: 0 }
        : actor.type === 'staff'
          ? { unread_count_staff: 0 }
          : {};
      await supabase.from('finance_portal_threads').update(updates).eq('id', thread_id);

      const msgUpdate = actor.type === 'partner'
        ? { is_read_by_partner: true, read_by_partner_at: new Date().toISOString() }
        : actor.type === 'staff'
          ? { is_read_by_staff: true, read_by_staff_at: new Date().toISOString() }
          : null;
      const filterField = actor.type === 'partner' ? 'is_read_by_partner' : 'is_read_by_staff';
      if (msgUpdate) await supabase
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
        .select('id, client_id, finance_user_id, visibility_scope, thread_type, allocation_status')
        .eq('id', thread_id)
        .maybeSingle();
      if (!thread) return jsonResponse({ error: 'Thread not found' }, 404, corsHeaders);
      if (actor.type === 'partner' && thread.finance_user_id !== actor.portalUserId) {
        return jsonResponse({ error: 'Forbidden' }, 403, corsHeaders);
      }
      if (actor.type === 'client' && (thread.client_id !== actor.clientId || !['finance_client_with_command_visibility', 'command_client_with_finance_allocated'].includes(thread.visibility_scope))) {
        return jsonResponse({ error: 'Forbidden' }, 403, corsHeaders);
      }

      const requestedScope = body.visibility_scope || thread.visibility_scope;
      const requestedThreadType = body.thread_type || thread.thread_type;
      const allowedScopes = permittedScopesForActor(actor.type);
      if (allowedScopes && !allowedScopes.includes(requestedScope)) {
        return jsonResponse({ error: 'Requested visibility scope is not permitted for this actor' }, 403, corsHeaders);
      }
      if (requestedScope !== thread.visibility_scope || requestedThreadType !== thread.thread_type) {
        return jsonResponse({ error: 'Thread visibility and type are immutable; create or select the correct governed thread' }, 400, corsHeaders);
      }

      const insertRow: any = {
        thread_id,
        client_id: thread.client_id,
        sender_type: actor.type,
        sender_name: actor.type === 'partner' ? actor.name : actor.type === 'staff' ? actor.username : actor.name,
        body: trimmed || '(attachment)',
        visibility_scope: requestedScope,
        thread_type: requestedThreadType,
        allocation_status: body.allocation_status || thread.allocation_status || 'none',
        command_owner_user_id: actor.type === 'staff' ? actor.userId : null,
        permission_status: requestedScope === 'finance_client_with_command_visibility'
          ? { command_centre: 'full', finance_portal: 'granted', client_portal: 'granted' }
          : requestedScope === 'command_client_with_finance_allocated'
            ? { command_centre: 'full', finance_portal: 'thread_granted', client_portal: 'granted' }
            : { command_centre: 'full', finance_portal: 'granted', client_portal: 'blocked' },
      };
      if (actor.type === 'partner') insertRow.finance_user_id = actor.portalUserId;
      else if (actor.type === 'staff') insertRow.staff_user_id = actor.userId;

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
          actor_type: actor.type === 'partner' ? 'finance_partner' : actor.type === 'client' ? 'client' : 'admin',
          action: 'message_sent',
          entity_type: 'finance_portal_message',
          entity_id: message.id,
          metadata: { thread_id, has_attachment: !!attachment },
        });
      } catch (e) { console.error('[messages] audit failed', e); }

      // Notify the receiving side after a send. Staff -> partner uses the
      // Finance Portal notification table; partner -> staff uses the Command
      // Centre bell notification table, with this fallback covering deployments
      // where the DB trigger is missing or misconfigured.
      if (actor.type === 'staff') {
        await notifyFinancePortalAssignees({
          client_id: thread.client_id,
          notification_type: 'message_received',
          title: 'New message from staff',
          body: trimmed.slice(0, 140) || 'Sent you an attachment',
          link_path: `/finance/clients/${thread.client_id}?tab=messages`,
          metadata: { thread_id, message_id: message.id },
        });
      } else if (actor.type === 'partner') {
        await ensureStaffFinanceMessageNotification(supabase, message, thread_id);
        if (requestedScope === 'finance_client_with_command_visibility') {
          await supabase.from('client_portal_notifications').insert({
            client_id: thread.client_id,
            title: 'New finance message',
            message: trimmed.slice(0, 140) || 'Sent you an attachment',
            type: 'info',
            category: 'message',
            action_url: '/portal/messages',
            metadata: { thread_id, message_id: message.id, source: 'finance_portal' },
          });
        }
      } else {
        await ensureStaffFinanceMessageNotification(supabase, message, thread_id);
        await notifyFinancePortalAssignees({
          client_id: thread.client_id,
          notification_type: 'client_finance_reply',
          title: 'Client replied to finance',
          body: trimmed.slice(0, 140) || 'Client sent a reply',
          link_path: `/finance/messages`,
          metadata: { thread_id, message_id: message.id, source: 'client_portal' },
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
        .select('id, client_id, finance_user_id, visibility_scope')
        .eq('id', thread_id)
        .maybeSingle();
      if (!thread) return jsonResponse({ error: 'Thread not found' }, 404, corsHeaders);
      if (actor.type === 'partner' && thread.finance_user_id !== actor.portalUserId) {
        return jsonResponse({ error: 'Forbidden' }, 403, corsHeaders);
      }
      if (actor.type === 'client' && (thread.client_id !== actor.clientId || !permittedScopesForActor('client')!.includes(thread.visibility_scope))) {
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
        .select('id, thread_id, client_id, visibility_scope, attachment_path, finance_portal_threads:thread_id(finance_user_id)')
        .eq('id', message_id)
        .maybeSingle();
      if (!msg || !msg.attachment_path) return jsonResponse({ error: 'Attachment not found' }, 404, corsHeaders);

      if (actor.type === 'partner') {
        const fuId = (msg as any).finance_portal_threads?.finance_user_id;
        if (fuId !== actor.portalUserId || !permittedScopesForActor('partner')!.includes(msg.visibility_scope)) {
          return jsonResponse({ error: 'Forbidden' }, 403, corsHeaders);
        }
      }
      if (actor.type === 'client' && (msg.client_id !== actor.clientId || !permittedScopesForActor('client')!.includes(msg.visibility_scope))) {
        return jsonResponse({ error: 'Forbidden' }, 403, corsHeaders);
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
