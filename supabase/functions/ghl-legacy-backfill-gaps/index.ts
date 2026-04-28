/**
 * One-shot backfill: fixes gaps in the legacy GHL mirror before Phase B replay.
 *
 * Phase 1: For every ghl_conversations row with zero messages, re-fetch
 *          ALL pages of /conversations/{id}/messages and upsert.
 * Phase 2: For every client.ghl_contact_id NOT present in ghl_conversations,
 *          re-run /conversations/search and recursively pull messages.
 *
 * Uses the LEGACY (default) GHL credentials. Superadmin-only.
 *
 * Body: { dry_run?: boolean, max_contacts?: number, max_shells?: number }
 * Returns: { phase1: {...}, phase2: {...}, final_audit: {...} }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import {
  verifyAuth,
  createCorsHeaders,
  createUnauthorizedResponse,
  createForbiddenResponse,
} from '../_shared/auth.ts';

const GHL_BASE = 'https://services.leadconnectorhq.com';

function parseDate(v: any): string | null {
  if (!v) return null;
  if (typeof v === 'number' || /^\d{10,13}$/.test(String(v))) {
    const n = Number(v);
    return new Date(n > 1e12 ? n : n * 1000).toISOString();
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function mapChannel(t: any): string {
  if (!t) return 'sms';
  const s = String(t).toLowerCase();
  const m: Record<string, string> = {
    sms: 'sms', '1': 'sms', phone: 'sms', type_phone: 'sms',
    email: 'email', '2': 'email', type_email: 'email',
    whatsapp: 'whatsapp', '3': 'whatsapp', type_whatsapp: 'whatsapp',
    fb: 'facebook', facebook: 'facebook', '4': 'facebook', type_facebook: 'facebook',
    ig: 'instagram', instagram: 'instagram', '5': 'instagram', type_instagram: 'instagram',
    live_chat: 'live_chat', livechat: 'live_chat', '6': 'live_chat', type_live_chat: 'live_chat',
    google_my_business: 'gmb', gmb: 'gmb', '7': 'gmb',
    custom: 'custom', activity: 'activity',
  };
  return m[s] || s;
}
function mapDir(m: any): string {
  const d = m.direction;
  if (d === 'inbound' || d === 1 || d === '1') return 'inbound';
  if (d === 'outbound' || d === 2 || d === '2') return 'outbound';
  if (m.incoming === true) return 'inbound';
  if (m.incoming === false) return 'outbound';
  if (m.userId) return 'outbound';
  return 'outbound';
}
function mapCT(c?: string): string {
  if (!c) return 'text';
  const x = c.toLowerCase();
  if (x.includes('image')) return 'image';
  if (x.includes('video')) return 'video';
  if (x.includes('audio')) return 'audio';
  if (x.includes('document') || x.includes('pdf') || x.includes('file')) return 'document';
  return 'text';
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ghlGet(url: string, headers: Record<string, string>, retries = 5): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const r = await fetch(url, { headers });
    if (r.status === 429 || r.status >= 500) {
      const wait = Math.min(8000, 800 * Math.pow(2, i));
      console.log(`  ⏳ ${r.status}, retry in ${wait}ms`);
      await sleep(wait);
      continue;
    }
    return r;
  }
  return await fetch(url, { headers });
}

async function fetchAllMessages(
  ghlConvId: string,
  localConvId: string,
  headers: Record<string, string>,
  sb: any,
): Promise<number> {
  let total = 0;
  let lastMsgId: string | undefined;
  for (let page = 0; page < 30; page++) {
    const p = new URLSearchParams({ limit: '100' });
    if (lastMsgId) p.set('lastMessageId', lastMsgId);
    const r = await ghlGet(`${GHL_BASE}/conversations/${ghlConvId}/messages?${p}`, headers);
    if (!r.ok) {
      console.log(`    msgs ${ghlConvId} ${r.status}`);
      return total;
    }
    const j = await r.json();
    let msgs: any[] = [];
    let hasMore = false;
    if (j.messages?.messages) {
      msgs = j.messages.messages;
      hasMore = j.messages.nextPage === true;
      lastMsgId = j.messages.lastMessageId || undefined;
    } else if (Array.isArray(j.messages)) {
      msgs = j.messages;
    }
    if (msgs.length === 0) break;
    const rows = msgs.map((m: any) => ({
      conversation_id: localConvId,
      ghl_message_id: m.id,
      direction: mapDir(m),
      channel_type: mapChannel(m.messageType || m.source),
      body: m.body || m.message || m.text || null,
      content_type: mapCT(m.contentType),
      attachment_urls: m.attachments?.map((a: any) => a.url).filter(Boolean) || null,
      sender_name: m.contactName || m.userName || null,
      sender_number: m.contactId ? null : (m.phone || m.from || null),
      recipient_number: m.phone || m.to || null,
      message_status: m.status || 'sent',
      ghl_date_added: parseDate(m.dateAdded || m.createdAt),
    }));
    const { error } = await sb
      .from('ghl_conversation_messages')
      .upsert(rows, { onConflict: 'ghl_message_id', ignoreDuplicates: false });
    if (error && (error as any).code !== '23505') {
      console.log(`    upsert err ${error.message}`);
    }
    total += msgs.length;
    if (!hasMore || msgs.length < 100) break;
    lastMsgId = msgs[msgs.length - 1]?.id;
    await sleep(150);
  }
  return total;
}

async function syncContact(
  clientId: string | null,
  ghlContactId: string,
  locationId: string,
  headers: Record<string, string>,
  sb: any,
): Promise<{ convs: number; msgs: number }> {
  const r = await ghlGet(
    `${GHL_BASE}/conversations/search?locationId=${locationId}&contactId=${ghlContactId}`,
    headers,
  );
  if (!r.ok) {
    console.log(`  search ${ghlContactId} ${r.status}`);
    return { convs: 0, msgs: 0 };
  }
  const j = await r.json();
  const convs = j.conversations || [];
  let cTotal = 0, mTotal = 0;
  for (const c of convs) {
    const { data: up, error } = await sb
      .from('ghl_conversations')
      .upsert({
        ghl_conversation_id: c.id,
        client_id: clientId,
        ghl_contact_id: ghlContactId,
        channel_type: mapChannel(c.type),
        last_message_body: c.lastMessageBody || c.snippet || null,
        last_message_date: parseDate(c.lastMessageDate || c.dateUpdated),
        last_message_direction:
          c.lastMessageDirection || (c.lastMessageType === 1 ? 'inbound' : 'outbound'),
        unread_count: c.unreadCount || 0,
        conversation_status: c.starred ? 'starred' : c.deleted ? 'archived' : 'open',
        assigned_to: c.assignedTo || null,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'ghl_conversation_id' })
      .select('id')
      .single();
    if (error || !up) {
      console.log(`  conv upsert err ${error?.message}`);
      continue;
    }
    cTotal++;
    await sleep(120);
    mTotal += await fetchAllMessages(c.id, up.id, headers, sb);
    await sleep(120);
  }
  return { convs: cTotal, msgs: mTotal };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const cors = createCorsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const { error: authErr, userId } = await verifyAuth(sb, req.headers, body);
    if (authErr || !userId) return createUnauthorizedResponse(authErr || 'Auth required', cors);
    if (userId !== 'service_role') {
      const { data: roles } = await sb.from('user_roles').select('role').eq('user_id', userId);
      if (!(roles || []).some((r: any) => r.role === 'superadmin')) {
        return createForbiddenResponse('Superadmin only', cors);
      }
    }

    const KEY = Deno.env.get('GOHIGHLEVEL_API_KEY')!;
    const LOC = Deno.env.get('GOHIGHLEVEL_LOCATION_ID')!;
    const headers = { Authorization: `Bearer ${KEY}`, Version: '2021-07-28', Accept: 'application/json' };

    const dryRun = body.dry_run === true;
    const maxShells = body.max_shells ?? 1000;
    const maxContacts = body.max_contacts ?? 1000;

    // ── Phase 1: empty-shell conversations ──
    console.log('=== PHASE 1: empty shells ===');
    const { data: allConvs } = await sb.from('ghl_conversations').select('id, ghl_conversation_id').limit(5000);
    const empties: { id: string; ghl_conversation_id: string }[] = [];
    for (let i = 0; i < (allConvs || []).length; i += 100) {
      const slice = (allConvs || []).slice(i, i + 100);
      const { data: have } = await sb
        .from('ghl_conversation_messages')
        .select('conversation_id')
        .in('conversation_id', slice.map((s: any) => s.id));
      const hSet = new Set((have || []).map((m: any) => m.conversation_id));
      for (const s of slice) if (!hSet.has(s.id)) empties.push(s);
    }
    console.log(`Found ${empties.length} empty-shell conversations`);

    let p1c = 0, p1m = 0;
    if (!dryRun) {
      for (const [i, s] of empties.slice(0, maxShells).entries()) {
        const n = await fetchAllMessages(s.ghl_conversation_id, s.id, headers, sb);
        p1m += n; p1c++;
        if (i % 5 === 0) console.log(`  [${i + 1}/${Math.min(empties.length, maxShells)}] +${n} (total ${p1m})`);
        await sleep(120);
      }
    }
    console.log(`PHASE 1: ${p1c} convs / ${p1m} msgs added`);

    // ── Phase 2: contacts with no conversations ──
    console.log('=== PHASE 2: missing-conversation contacts ===');
    const { data: clients } = await sb
      .from('clients').select('id, ghl_contact_id').not('ghl_contact_id', 'is', null).limit(2000);
    const have = new Set<string>();
    let from = 0;
    while (true) {
      const { data: chunk } = await sb
        .from('ghl_conversations').select('ghl_contact_id').range(from, from + 999);
      if (!chunk || chunk.length === 0) break;
      for (const c of chunk) if (c.ghl_contact_id) have.add(c.ghl_contact_id);
      if (chunk.length < 1000) break;
      from += 1000;
    }
    const missing = (clients || []).filter((c: any) => !have.has(c.ghl_contact_id));
    console.log(`Found ${missing.length} contacts with no conversations`);

    let p2contacts = 0, p2c = 0, p2m = 0, p2empty = 0;
    if (!dryRun) {
      for (const [i, c] of missing.slice(0, maxContacts).entries()) {
        const r = await syncContact(c.id, c.ghl_contact_id, LOC, headers, sb);
        p2contacts++; p2c += r.convs; p2m += r.msgs;
        if (r.convs === 0) p2empty++;
        if (i % 5 === 0) console.log(`  [${i + 1}/${Math.min(missing.length, maxContacts)}] +${r.convs}c/${r.msgs}m (totals ${p2c}/${p2m}, genuinely empty: ${p2empty})`);
        await sleep(180);
      }
    }
    console.log(`PHASE 2: ${p2contacts} contacts / ${p2c} convs / ${p2m} msgs / ${p2empty} truly empty`);

    // ── Final audit ──
    const { count: totalConvs } = await sb.from('ghl_conversations').select('*', { count: 'exact', head: true });
    const { count: totalMsgs } = await sb.from('ghl_conversation_messages').select('*', { count: 'exact', head: true });

    return new Response(JSON.stringify({
      success: true,
      dry_run: dryRun,
      phase1: { empty_shells_found: empties.length, processed: p1c, messages_added: p1m },
      phase2: { missing_contacts_found: missing.length, processed: p2contacts, conversations_added: p2c, messages_added: p2m, genuinely_empty: p2empty },
      final_audit: { total_conversations: totalConvs, total_messages: totalMsgs },
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[backfill] error', e);
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
