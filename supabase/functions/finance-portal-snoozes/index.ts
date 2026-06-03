/**
 * Finance Portal — Smart Snoozes
 * Operations: list, create, clear, run_due (cron entry → posts notifications)
 *
 * `create` accepts either an explicit ISO `snooze_until` or a `raw_input` string
 * parsed via a lightweight natural-language date parser (see parseNaturalDate).
 */
import { extractFinanceToken, makeServiceClient, resolveFinancePartner } from '../_shared/finance-portal-session.ts';
import { parseNaturalDate } from '../_shared/parse-natural-date.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-finance-session-token, x-session-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Lightweight natural-language date parser.
 *  Supports: today, tomorrow, in N (hours|days|weeks), monday, next monday,
 *            "<weekday> at <h>(am|pm)", "<weekday> <h>(am|pm)", N (am|pm).
 *  All times resolved in Australia/Sydney local intent (uses server clock as proxy).
 */
export function parseNaturalDate(input: string): Date | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  const now = new Date();
  const result = new Date(now);

  // explicit ISO
  const iso = Date.parse(input);
  if (!Number.isNaN(iso)) return new Date(iso);

  // "today" / "tomorrow"
  if (s === 'today') { result.setHours(17, 0, 0, 0); return result; }
  if (s === 'tomorrow') { result.setDate(result.getDate() + 1); result.setHours(9, 0, 0, 0); return result; }

  // "in N (minutes|hours|days|weeks)"
  const inMatch = s.match(/^in\s+(\d+)\s*(minute|min|hour|hr|day|week)s?$/);
  if (inMatch) {
    const n = parseInt(inMatch[1], 10);
    const unit = inMatch[2];
    if (unit.startsWith('min')) result.setMinutes(result.getMinutes() + n);
    else if (unit.startsWith('hr') || unit.startsWith('hour')) result.setHours(result.getHours() + n);
    else if (unit.startsWith('day')) result.setDate(result.getDate() + n);
    else if (unit.startsWith('week')) result.setDate(result.getDate() + n * 7);
    return result;
  }

  // "next week"
  if (s === 'next week') { result.setDate(result.getDate() + 7); result.setHours(9, 0, 0, 0); return result; }

  // weekday parsing: "next monday", "monday", "monday at 9am", "monday 9am"
  // Also "tue 2pm", "fri at 14:00"
  const wkRegex = /^(next\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day)?(?:\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?$/;
  const wk = s.match(wkRegex);
  if (wk) {
    const isNext = !!wk[1];
    const dayShort = wk[2];
    const map: Record<string, number> = {
      sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6,
    };
    const targetDay = map[dayShort];
    const currentDay = result.getDay();
    let diff = (targetDay - currentDay + 7) % 7;
    if (diff === 0) diff = 7;
    if (isNext) diff = diff === 7 ? 7 : diff + 7;
    result.setDate(result.getDate() + diff);

    let hour = wk[3] ? parseInt(wk[3], 10) : 9;
    const min = wk[4] ? parseInt(wk[4], 10) : 0;
    const ampm = wk[5];
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    result.setHours(hour, min, 0, 0);
    return result;
  }

  // "9am tomorrow" / simple time today
  const timeMatch = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const min = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const ampm = timeMatch[3];
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    result.setHours(hour, min, 0, 0);
    if (result <= now) result.setDate(result.getDate() + 1);
    return result;
  }

  return null;
}

async function notifyDue(supabase: any) {
  const { data: due } = await supabase
    .from('finance_partner_snoozes')
    .select('id, finance_contact_id, purchase_file_id, client_id, scope, reason, snooze_until')
    .lte('snooze_until', new Date().toISOString())
    .is('cleared_at', null)
    .eq('notified', false)
    .limit(200);

  if (!due?.length) return { processed: 0 };

  let processed = 0;
  for (const s of due) {
    try {
      const link = s.purchase_file_id
        ? `/finance/purchase-files/${s.purchase_file_id}`
        : s.client_id ? `/finance/clients/${s.client_id}` : '/finance';

      await supabase.from('finance_portal_notifications').insert({
        portal_user_id: s.finance_contact_id,
        notification_type: 'snooze_due',
        title: 'Reminder: snoozed item is due',
        body: s.reason || 'You asked to be reminded about this.',
        link_path: link,
        metadata: { snooze_id: s.id, scope: s.scope },
      });
      await supabase.from('finance_partner_snoozes').update({ notified: true }).eq('id', s.id);
      processed++;
    } catch (e) {
      console.error('[snoozes] notify error', s.id, e);
    }
  }
  return { processed };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = makeServiceClient();
    const body = await req.json().catch(() => ({}));
    const { operation } = body;

    // run_due is callable without partner session (cron + service)
    if (operation === 'run_due') {
      const result = await notifyDue(supabase);
      return json({ ok: true, ...result });
    }

    const token = extractFinanceToken(req.headers, body);
    const auth = await resolveFinancePartner(supabase, token);
    if (auth.error) return json({ error: auth.error }, auth.status);
    const portalUser = auth.portalUser!;

    if (operation === 'list') {
      const includeCleared = !!body.include_cleared;
      let q = supabase
        .from('finance_partner_snoozes')
        .select('*, purchase_files:purchase_file_id(id, title, property_address, client_id)')
        .eq('finance_contact_id', portalUser.id)
        .order('snooze_until', { ascending: true });
      if (!includeCleared) q = q.is('cleared_at', null);
      const { data, error } = await q;
      if (error) return json({ error: error.message }, 500);
      return json({ snoozes: data ?? [] });
    }

    if (operation === 'create') {
      const payload = body.payload || {};
      let until: Date | null = null;
      if (payload.snooze_until) {
        const d = new Date(payload.snooze_until);
        if (!isNaN(d.getTime())) until = d;
      }
      if (!until && payload.raw_input) {
        until = parseNaturalDate(payload.raw_input);
      }
      if (!until || isNaN(until.getTime())) {
        return json({ error: "Could not understand the time — try 'tomorrow 9am', 'in 3 days', 'next Monday'" }, 400);
      }
      if (until.getTime() < Date.now() - 60_000) {
        return json({ error: 'Snooze time must be in the future' }, 400);
      }

      const scope = ['purchase_file', 'client', 'general'].includes(payload.scope) ? payload.scope : 'purchase_file';
      const ids: any = {};
      if (scope === 'purchase_file' && payload.purchase_file_id) ids.purchase_file_id = payload.purchase_file_id;
      if (scope === 'client' && payload.client_id) ids.client_id = payload.client_id;

      const { data, error } = await supabase
        .from('finance_partner_snoozes')
        .insert({
          finance_contact_id: portalUser.id,
          scope,
          snooze_until: until.toISOString(),
          reason: (payload.reason || '').toString().slice(0, 500) || null,
          raw_input: (payload.raw_input || '').toString().slice(0, 200) || null,
          ...ids,
        })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ snooze: data });
    }

    if (operation === 'clear') {
      const id = body.id;
      if (!id) return json({ error: 'id required' }, 400);
      const { error } = await supabase
        .from('finance_partner_snoozes')
        .update({ cleared_at: new Date().toISOString() })
        .eq('id', id)
        .eq('finance_contact_id', portalUser.id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (operation === 'parse') {
      const d = parseNaturalDate(body.input || '');
      if (!d) return json({ error: 'Could not parse' }, 400);
      return json({ parsed: d.toISOString() });
    }

    return json({ error: `Unknown operation: ${operation}` }, 400);
  } catch (e: any) {
    console.error('[finance-portal-snoozes] error', e);
    return json({ error: e.message || 'Internal error' }, 500);
  }
});
