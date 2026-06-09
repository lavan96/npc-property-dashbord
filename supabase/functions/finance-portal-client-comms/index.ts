/**
 * Finance Portal — Unified Client Communications hub.
 * Batch 3 #13/#14/#15/#16/#17: SMS/WhatsApp/Email/Portal/Threading/Read receipts
 *
 * Actions (POST body { action, ... }):
 *   - list:        { client_id, purchase_file_id?, channels?, limit? } → unified timeline
 *   - send:        { client_id, purchase_file_id?, channel: 'sms'|'whatsapp'|'email'|'portal', body, subject?, template_id? }
 *   - translate:   { source_kind, source_id, text, target_lang }
 *   - mark_read:   { kind, id }
 *   - inbox_list:  {} → cross-client unread summary for the partner
 */
import { extractFinanceToken, makeServiceClient, resolveFinancePartner } from '../_shared/finance-portal-session.ts';
import { getEffectiveGhlCredentials } from '../_shared/ghl-account.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-finance-session-token, x-session-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function publicAppUrl(): string {
  return Deno.env.get('APP_URL') || '';
}

function trackingPixelUrl(token: string): string {
  const projectRef = Deno.env.get('SUPABASE_URL')?.split('//')[1]?.split('.')[0] ?? '';
  return `https://${projectRef}.supabase.co/functions/v1/finance-email-track-pixel?t=${token}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const supabase = makeServiceClient();
  const token = extractFinanceToken(req.headers, body);
  const auth = await resolveFinancePartner(supabase, token);
  if ('error' in auth) return json({ error: auth.error }, auth.status);
  const partner = auth.portalUser;
  const action = body.action as string;

  try {
    switch (action) {
      case 'list':           return await listInbox(supabase, partner, body);
      case 'send':           return await sendMessage(supabase, partner, body);
      case 'translate':      return await translate(supabase, partner, body);
      case 'mark_read':      return await markRead(supabase, partner, body);
      case 'inbox_list':     return await crossClientInbox(supabase, partner);
      default:               return json({ error: 'unknown_action', action }, 400);
    }
  } catch (err) {
    console.error('[finance-portal-client-comms] error', err);
    return json({ error: 'internal_error', message: (err as Error).message }, 500);
  }
});

async function listInbox(supabase: any, _partner: any, body: any) {
  const clientId = body.client_id;
  if (!clientId) return json({ error: 'client_id_required' }, 400);
  const limit = Math.min(body.limit ?? 100, 300);
  const channels = Array.isArray(body.channels) ? body.channels : null;

  // Pull from each source in parallel
  const [portalMsgs, ghlConv, outbound] = await Promise.all([
    supabase
      .from('client_portal_messages')
      .select('id, client_id, sender_type, sender_name, message, is_read, read_at, created_at')
      .eq('client_id', clientId)
      .eq('is_internal', false) // staff-only internal messages are not shown to finance partners
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('ghl_conversations')
      .select('id, ghl_conversation_id, channel_type, last_message_date')
      .eq('client_id', clientId),
    supabase
      .from('finance_outbound_messages')
      .select('id, channel, body, subject, recipient, status, read_at, delivered_at, tracking_token, created_at, provider_message_id')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  let ghlMsgs: any[] = [];
  if ((ghlConv.data ?? []).length > 0) {
    const convIds = ghlConv.data!.map((c: any) => c.id);
    const { data: msgs } = await supabase
      .from('ghl_conversation_messages')
      .select('id, conversation_id, ghl_message_id, direction, channel_type, body, sender_name, ghl_date_added, created_at')
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
      source_id: m.id,
      channel: 'portal',
      direction: m.sender_type === 'client' ? 'inbound' : 'outbound',
      sender_name: m.sender_name,
      body: m.message,
      subject: null,
      created_at: m.created_at,
      is_read: m.is_read,
      read_at: m.read_at,
    });
  }
  for (const m of ghlMsgs) {
    unified.push({
      id: `ghl:${m.id}`,
      kind: 'ghl',
      source_id: m.id,
      channel: (m.channel_type || 'sms').toLowerCase(),
      direction: m.direction,
      sender_name: m.sender_name,
      body: m.body,
      subject: null,
      created_at: m.ghl_date_added || m.created_at,
      is_read: m.direction === 'outbound',
      read_at: null,
    });
  }
  for (const m of outbound.data ?? []) {
    // Skip the ones that were also recorded into GHL (provider_message_id matches a ghl id) to avoid double-display
    if (m.provider_message_id && ghlMsgs.some(g => g.ghl_message_id === m.provider_message_id)) continue;
    if (m.channel === 'portal') continue; // already in portal feed
    unified.push({
      id: `out:${m.id}`,
      kind: 'outbound',
      source_id: m.id,
      channel: m.channel,
      direction: 'outbound',
      sender_name: 'You',
      body: m.body,
      subject: m.subject,
      created_at: m.created_at,
      is_read: !!m.read_at,
      read_at: m.read_at,
      delivered_at: m.delivered_at,
      status: m.status,
      tracking_token: m.tracking_token,
    });
  }

  const filtered = channels ? unified.filter(m => channels.includes(m.channel)) : unified;
  filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return json({ messages: filtered.slice(0, limit) });
}

async function sendMessage(supabase: any, partner: any, body: any) {
  const { client_id, purchase_file_id, channel, body: text, subject, template_id } = body;
  if (!client_id || !channel || !text) return json({ error: 'missing_required' }, 400);
  if (!['sms','whatsapp','email','portal'].includes(channel)) return json({ error: 'invalid_channel' }, 400);

  // Lookup client recipient info
  const { data: client } = await supabase
    .from('clients')
    .select('id, primary_email, secondary_email, primary_phone, secondary_phone, primary_contact_name')
    .eq('id', client_id)
    .maybeSingle();
  if (!client) return json({ error: 'client_not_found' }, 404);

  let trackingToken: string | null = null;
  let providerMessageId: string | null = null;
  let providerLabel = 'internal';
  let status = 'sent';
  let recipient: string | null = null;
  let errorMessage: string | null = null;

  if (channel === 'portal') {
    const ins = await supabase.from('client_portal_messages').insert({
      client_id,
      sender_type: 'advisor',
      sender_name: partner.full_name || partner.email,
      message: text,
    }).select('id').single();
    if (ins.error) return json({ error: 'portal_send_failed', details: ins.error.message }, 500);
    providerMessageId = ins.data.id;
    providerLabel = 'portal';
  } else {
    // SMS / WhatsApp / Email → via GHL
    const { data: conv } = await supabase
      .from('ghl_conversations')
      .select('ghl_conversation_id, ghl_contact_id, channel_type')
      .eq('client_id', client_id)
      .order('last_message_date', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (!conv?.ghl_conversation_id) return json({ error: 'no_ghl_conversation', hint: 'Client has no GHL conversation yet.' }, 400);

    const creds = await getEffectiveGhlCredentials(supabase);
    if (!creds.apiKey) return json({ error: 'ghl_not_configured' }, 500);

    const typeMap: Record<string, string> = { sms: 'SMS', whatsapp: 'WhatsApp', email: 'Email' };
    const ghlType = typeMap[channel];

    recipient = channel === 'email'
      ? (client.primary_email || client.secondary_email)
      : (client.primary_phone || client.secondary_phone);

    let finalBody = text;
    if (channel === 'email') {
      trackingToken = crypto.randomUUID();
      const pixel = `<img src="${trackingPixelUrl(trackingToken)}" width="1" height="1" alt="" style="display:none" />`;
      finalBody = `${text.replace(/\n/g, '<br/>')}${pixel}`;
    }

    const payload: any = {
      type: ghlType,
      conversationId: conv.ghl_conversation_id,
      contactId: conv.ghl_contact_id,
      message: channel === 'email' ? finalBody : text,
    };
    if (channel === 'email') {
      payload.html = finalBody;
      if (subject) payload.subject = subject;
    }

    const res = await fetch('https://services.leadconnectorhq.com/conversations/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.apiKey}`,
        Version: '2021-04-15',
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      status = 'failed';
      errorMessage = JSON.stringify(data).slice(0, 500);
      console.error('[client-comms send] GHL error', errorMessage);
    } else {
      providerMessageId = data.messageId || data.id || null;
      providerLabel = `ghl_${channel}`;
    }
  }

  const logIns = await supabase.from('finance_outbound_messages').insert({
    purchase_file_id: purchase_file_id || null,
    client_id,
    finance_contact_id: partner.id,
    channel,
    recipient,
    subject: subject || null,
    body: text,
    provider: providerLabel,
    provider_message_id: providerMessageId,
    ghl_conversation_id: channel !== 'portal' ? providerMessageId : null,
    status,
    error_message: errorMessage,
    template_id: template_id || null,
    tracking_token: trackingToken,
    metadata: {},
  }).select('id').single();

  // Mark template usage
  if (template_id) {
    await supabase.rpc('increment_template_use', { p_template_id: template_id }).catch(() => {});
    await supabase.from('finance_partner_message_templates')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', template_id);
  }

  if (status === 'failed') return json({ error: 'send_failed', details: errorMessage }, 502);
  return json({ ok: true, id: logIns.data?.id, tracking_token: trackingToken, provider_message_id: providerMessageId });
}

async function translate(supabase: any, partner: any, body: any) {
  const { source_kind, source_id, text, target_lang } = body;
  if (!text || !target_lang) return json({ error: 'missing_required' }, 400);

  if (source_kind && source_id) {
    const { data: cached } = await supabase
      .from('finance_message_translations')
      .select('translated_text, source_lang, model')
      .eq('source_kind', source_kind).eq('source_id', String(source_id)).eq('target_lang', target_lang)
      .maybeSingle();
    if (cached) return json({ cached: true, ...cached, target_lang });
  }

  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return json({ error: 'ai_not_configured' }, 500);

  const model = 'google/gemini-2.5-flash';
  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: `You are a professional translator for Australian mortgage broker communications. Translate the user's message into ${target_lang}. Preserve formatting and tone. Return ONLY the translation, no preamble. If the text is already in ${target_lang}, return it unchanged.` },
        { role: 'user', content: text },
      ],
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    return json({ error: 'translation_failed', details: errText.slice(0, 400) }, 502);
  }
  const data = await res.json();
  const translated = data?.choices?.[0]?.message?.content?.trim() ?? '';

  if (source_kind && source_id) {
    await supabase.from('finance_message_translations').insert({
      source_kind, source_id: String(source_id),
      target_lang, translated_text: translated, model,
      requested_by_finance_contact_id: partner.id,
    }).select().maybeSingle();
  }
  return json({ cached: false, translated_text: translated, target_lang, model });
}

async function markRead(supabase: any, _partner: any, body: any) {
  const { kind, id } = body;
  if (!kind || !id) return json({ error: 'missing_required' }, 400);
  if (kind === 'portal') {
    await supabase.from('client_portal_messages').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id);
  } else if (kind === 'outbound') {
    await supabase.from('finance_outbound_messages').update({ read_at: new Date().toISOString(), status: 'read' }).eq('id', id);
  }
  return json({ ok: true });
}

async function crossClientInbox(supabase: any, partner: any) {
  // List clients assigned to this finance portal user with their latest activity
  // across client portal messages, direct finance/staff messages, and broker-sent
  // outbound SMS/WhatsApp/email. Use physical `clients` columns — the previous
  // query selected legacy aliases (`primary_contact_name`, `primary_phone`) and
  // returned an empty/broken inbox in production.
  const { data: assignments, error: assignmentError } = await supabase
    .from('finance_portal_client_assignments')
    .select('client_id')
    .eq('finance_user_id', partner.id);
  if (assignmentError) return json({ error: assignmentError.message }, 500);

  const clientIds = (assignments ?? []).map((a: any) => a.client_id).filter(Boolean);
  if (clientIds.length === 0) return json({ clients: [] });

  const [clientsRes, portalRes, financeThreadRes, outboundRes, ghlConvRes] = await Promise.all([
    supabase.from('clients')
      .select('id, primary_first_name, primary_surname, primary_email, primary_mobile, secondary_first_name, secondary_surname')
      .in('id', clientIds),
    supabase.from('client_portal_messages')
      .select('id, client_id, created_at, message, sender_type, is_read')
      .in('client_id', clientIds)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('finance_portal_messages')
      .select('id, client_id, created_at, body, sender_type, is_read_by_partner')
      .in('client_id', clientIds)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('finance_outbound_messages')
      .select('id, client_id, created_at, channel, body, status')
      .in('client_id', clientIds)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('ghl_conversations')
      .select('id, client_id, channel_type, last_message_date')
      .in('client_id', clientIds),
  ]);

  if (clientsRes.error) return json({ error: clientsRes.error.message }, 500);

  const byClient: Record<string, any> = {};
  for (const c of clientsRes.data ?? []) {
    const primary = [c.primary_first_name, c.primary_surname].filter(Boolean).join(' ').trim();
    const secondary = [c.secondary_first_name, c.secondary_surname].filter(Boolean).join(' ').trim();
    byClient[c.id] = {
      client_id: c.id,
      name: primary || 'Unknown client',
      secondary_name: secondary || null,
      email: c.primary_email || '',
      phone: c.primary_mobile || '',
      unread_portal: 0,
      unread_finance: 0,
      last_message_at: null as string | null,
      last_message_preview: null as string | null,
      last_channel: null as string | null,
    };
  }

  const touch = (clientId: string, at: string | null, preview: string | null, channel: string | null) => {
    const row = byClient[clientId];
    if (!row || !at) return;
    if (!row.last_message_at || at > row.last_message_at) {
      row.last_message_at = at;
      row.last_message_preview = preview ? preview.slice(0, 140) : '';
      row.last_channel = channel;
    }
  };

  for (const m of portalRes.data ?? []) {
    const row = byClient[m.client_id]; if (!row) continue;
    if (m.sender_type === 'client' && m.is_read === false) row.unread_portal += 1;
    touch(m.client_id, m.created_at, m.message || '', 'portal');
  }
  for (const m of financeThreadRes.data ?? []) {
    const row = byClient[m.client_id]; if (!row) continue;
    if (m.sender_type === 'staff' && m.is_read_by_partner === false) row.unread_finance += 1;
    touch(m.client_id, m.created_at, m.body || '', 'portal');
  }
  for (const m of outboundRes.data ?? []) {
    touch(m.client_id, m.created_at, m.body || '', m.channel || 'email');
  }
  for (const c of ghlConvRes.data ?? []) {
    touch(c.client_id, c.last_message_date, 'GHL conversation activity', String(c.channel_type || '').toLowerCase() || 'sms');
  }

  const list = Object.values(byClient).sort((a: any, b: any) =>
    String(b.last_message_at || '').localeCompare(String(a.last_message_at || '')) ||
    String(a.name || '').localeCompare(String(b.name || ''))
  );
  return json({ clients: list });
}
