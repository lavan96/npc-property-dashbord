/**
 * AML/CTF Case Engine (Phase 1)
 *
 * Ops:
 *  - list           { status?, risk?, assigned_to_me?, search?, limit?, offset? }
 *  - get            { case_id }
 *  - create         { subject_display_name, subject_type?, client_id?, purchase_file_id?, risk_rating?, notes? }
 *  - update         { case_id, patch: { subject_display_name?, risk_rating?, risk_score?, assigned_analyst_id?, assigned_mlro_id?, metadata? } }
 *  - transition     { case_id, to_status, reason? }
 *  - append_event   { case_id, category, summary, payload? }
 *  - list_events    { case_id, limit? }
 *
 * All writes are appended to `aml.case_events` with a per-case SHA-256 hash chain
 * (prev_hash + row_hash) for tamper-evidence. Reads require any AML role; writes
 * require analyst/reviewer/mlro. Enforced in-code AND by RLS.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CASE_STATUSES = [
  'draft', 'kyc_in_progress', 'kyc_complete', 'edd_required',
  'under_review', 'escalated_mlro', 'cleared', 'blocked', 'closed',
] as const;

const RISK_RATINGS = ['low', 'medium', 'high', 'prohibited'] as const;

const EVENT_CATEGORIES = [
  'case_created', 'status_changed', 'risk_rescored', 'document_added',
  'idv_result', 'pep_sanctions_hit', 'edd_note', 'mlro_decision',
  'austrac_report', 'system',
] as const;

// Allowed transitions (defence-in-depth on top of MLRO overrides)
const TRANSITIONS: Record<string, string[]> = {
  draft: ['kyc_in_progress', 'closed'],
  kyc_in_progress: ['kyc_complete', 'edd_required', 'blocked', 'closed'],
  kyc_complete: ['under_review', 'edd_required', 'cleared', 'closed'],
  edd_required: ['under_review', 'escalated_mlro', 'blocked', 'closed'],
  under_review: ['cleared', 'escalated_mlro', 'edd_required', 'blocked', 'closed'],
  escalated_mlro: ['cleared', 'blocked', 'closed'],
  cleared: ['under_review', 'closed'],
  blocked: ['under_review', 'closed'],
  closed: [],
};

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function appendEvent(
  admin: any,
  caseId: string,
  category: string,
  summary: string,
  payload: Record<string, any>,
  actorId: string | null,
  actorLabel: string | null,
) {
  const { data: prev } = await admin
    .schema('aml')
    .from('case_events')
    .select('row_hash, created_at')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const prevHash = prev?.row_hash ?? null;
  const now = new Date().toISOString();
  const canonical = JSON.stringify({
    case_id: caseId,
    category,
    summary,
    payload: payload ?? {},
    actor_id: actorId,
    actor_label: actorLabel,
    prev_hash: prevHash,
    created_at: now,
  });
  const rowHash = await sha256Hex(canonical);

  const { data, error } = await admin
    .schema('aml')
    .from('case_events')
    .insert({
      case_id: caseId,
      category,
      summary,
      payload: payload ?? {},
      actor_id: actorId,
      actor_label: actorLabel,
      prev_hash: prevHash,
      row_hash: rowHash,
      created_at: now,
    })
    .select('id, created_at, category, summary, prev_hash, row_hash')
    .single();

  if (error) throw error;
  return data;
}

async function generateCaseReference(admin: any): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `AML-${year}-`;
  const { count } = await admin
    .schema('aml')
    .from('cases')
    .select('id', { count: 'exact', head: true })
    .ilike('case_reference', `${prefix}%`);
  const seq = String((count ?? 0) + 1).padStart(5, '0');
  return `${prefix}${seq}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return jsonResponse({ error: 'Unauthorized' }, 401);

    // Identify caller with anon-key client + user JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return jsonResponse({ error: 'Invalid session' }, 401);
    const userId = userData.user.id;
    const userEmail = userData.user.email ?? null;

    // Service-role client for privileged AML schema access
    const admin = createClient(supabaseUrl, serviceKey);

    // Confirm caller has any AML role
    const { data: hasAny } = await admin.rpc('has_any_aml_role', { _user_id: userId });
    if (!hasAny) return jsonResponse({ error: 'AML role required' }, 403);

    // Load caller's roles for write-gating
    const { data: roleRows } = await admin
      .schema('aml')
      .from('role_assignments')
      .select('role')
      .eq('user_id', userId)
      .is('revoked_at', null);
    const roles = new Set<string>((roleRows ?? []).map((r: any) => r.role));
    const canWrite = roles.has('analyst') || roles.has('reviewer') || roles.has('mlro');
    const isMlro = roles.has('mlro');

    const body = await req.json().catch(() => ({}));
    const op = String(body?.op ?? '');
    if (!op) return jsonResponse({ error: 'op is required' }, 400);

    switch (op) {
      case 'list': {
        const limit = Math.min(Number(body.limit ?? 50), 200);
        const offset = Math.max(Number(body.offset ?? 0), 0);
        let q = admin
          .schema('aml')
          .from('cases')
          .select('*', { count: 'exact' })
          .order('opened_at', { ascending: false })
          .range(offset, offset + limit - 1);
        if (body.status && CASE_STATUSES.includes(body.status)) q = q.eq('status', body.status);
        if (body.risk && RISK_RATINGS.includes(body.risk)) q = q.eq('risk_rating', body.risk);
        if (body.assigned_to_me) q = q.or(`assigned_analyst_id.eq.${userId},assigned_mlro_id.eq.${userId}`);
        if (body.search) {
          const s = String(body.search).replace(/[%,]/g, ' ').trim();
          if (s) q = q.or(`subject_display_name.ilike.%${s}%,case_reference.ilike.%${s}%`);
        }
        const { data, count, error } = await q;
        if (error) throw error;
        return jsonResponse({ cases: data ?? [], total: count ?? 0, limit, offset });
      }

      case 'get': {
        if (!body.case_id) return jsonResponse({ error: 'case_id is required' }, 400);
        const { data: caseRow, error } = await admin
          .schema('aml').from('cases').select('*').eq('id', body.case_id).maybeSingle();
        if (error) throw error;
        if (!caseRow) return jsonResponse({ error: 'Not found' }, 404);
        const { data: events } = await admin
          .schema('aml').from('case_events').select('*')
          .eq('case_id', body.case_id).order('created_at', { ascending: false }).limit(200);
        return jsonResponse({ case: caseRow, events: events ?? [] });
      }

      case 'create': {
        if (!canWrite) return jsonResponse({ error: 'Write role required' }, 403);
        const subject = String(body.subject_display_name ?? '').trim();
        if (!subject) return jsonResponse({ error: 'subject_display_name is required' }, 400);
        const subjectType = ['individual', 'entity', 'trust'].includes(body.subject_type)
          ? body.subject_type : 'individual';
        const risk = RISK_RATINGS.includes(body.risk_rating) ? body.risk_rating : null;

        const ref = await generateCaseReference(admin);
        const { data: created, error } = await admin
          .schema('aml').from('cases').insert({
            case_reference: ref,
            subject_display_name: subject,
            subject_type: subjectType,
            client_id: body.client_id ?? null,
            purchase_file_id: body.purchase_file_id ?? null,
            risk_rating: risk,
            assigned_analyst_id: userId,
            created_by: userId,
            metadata: body.metadata ?? {},
          }).select('*').single();
        if (error) throw error;

        await appendEvent(admin, created.id, 'case_created',
          `Case ${ref} opened for ${subject}`,
          { subject_type: subjectType, initial_risk: risk, notes: body.notes ?? null },
          userId, userEmail);

        return jsonResponse({ case: created });
      }

      case 'update': {
        if (!canWrite) return jsonResponse({ error: 'Write role required' }, 403);
        if (!body.case_id) return jsonResponse({ error: 'case_id is required' }, 400);
        const patch = body.patch ?? {};
        const allowed: Record<string, any> = {};
        for (const k of ['subject_display_name', 'risk_score', 'assigned_analyst_id', 'assigned_mlro_id', 'metadata']) {
          if (patch[k] !== undefined) allowed[k] = patch[k];
        }
        if (patch.risk_rating !== undefined) {
          if (patch.risk_rating !== null && !RISK_RATINGS.includes(patch.risk_rating)) {
            return jsonResponse({ error: 'Invalid risk_rating' }, 400);
          }
          allowed.risk_rating = patch.risk_rating;
        }
        if (Object.keys(allowed).length === 0) return jsonResponse({ error: 'Empty patch' }, 400);

        const { data: before } = await admin.schema('aml').from('cases')
          .select('risk_rating, risk_score').eq('id', body.case_id).maybeSingle();

        const { data: updated, error } = await admin.schema('aml').from('cases')
          .update(allowed).eq('id', body.case_id).select('*').single();
        if (error) throw error;

        if (patch.risk_rating !== undefined || patch.risk_score !== undefined) {
          await appendEvent(admin, body.case_id, 'risk_rescored',
            `Risk updated → ${updated.risk_rating ?? 'unrated'} (score ${updated.risk_score ?? 'n/a'})`,
            { before, after: { risk_rating: updated.risk_rating, risk_score: updated.risk_score } },
            userId, userEmail);
        }

        return jsonResponse({ case: updated });
      }

      case 'transition': {
        if (!canWrite) return jsonResponse({ error: 'Write role required' }, 403);
        if (!body.case_id || !body.to_status) {
          return jsonResponse({ error: 'case_id and to_status are required' }, 400);
        }
        if (!CASE_STATUSES.includes(body.to_status)) {
          return jsonResponse({ error: 'Invalid to_status' }, 400);
        }
        const { data: caseRow, error: fetchErr } = await admin.schema('aml').from('cases')
          .select('id, status').eq('id', body.case_id).maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!caseRow) return jsonResponse({ error: 'Not found' }, 404);

        const from = caseRow.status;
        const to = body.to_status;
        const legal = TRANSITIONS[from] ?? [];
        if (!legal.includes(to) && !isMlro) {
          return jsonResponse({
            error: `Illegal transition ${from} → ${to} (MLRO override required)`,
          }, 400);
        }

        const patch: Record<string, any> = { status: to };
        if (to === 'closed') patch.closed_at = new Date().toISOString();

        const { data: updated, error: upErr } = await admin.schema('aml').from('cases')
          .update(patch).eq('id', body.case_id).select('*').single();
        if (upErr) throw upErr;

        await appendEvent(admin, body.case_id, 'status_changed',
          `Status ${from} → ${to}${!legal.includes(to) ? ' (MLRO override)' : ''}`,
          { from, to, reason: body.reason ?? null, override: !legal.includes(to) },
          userId, userEmail);

        return jsonResponse({ case: updated });
      }

      case 'append_event': {
        if (!canWrite) return jsonResponse({ error: 'Write role required' }, 403);
        if (!body.case_id || !body.category || !body.summary) {
          return jsonResponse({ error: 'case_id, category, summary required' }, 400);
        }
        if (!EVENT_CATEGORIES.includes(body.category)) {
          return jsonResponse({ error: 'Invalid category' }, 400);
        }
        const ev = await appendEvent(admin, body.case_id, body.category,
          String(body.summary), body.payload ?? {}, userId, userEmail);
        return jsonResponse({ event: ev });
      }

      case 'list_events': {
        if (!body.case_id) return jsonResponse({ error: 'case_id is required' }, 400);
        const limit = Math.min(Number(body.limit ?? 200), 500);
        const { data, error } = await admin.schema('aml').from('case_events')
          .select('*').eq('case_id', body.case_id)
          .order('created_at', { ascending: false }).limit(limit);
        if (error) throw error;
        return jsonResponse({ events: data ?? [] });
      }

      default:
        return jsonResponse({ error: `Unknown op: ${op}` }, 400);
    }
  } catch (err: any) {
    console.error('aml-cases error', err);
    return jsonResponse({ error: err?.message ?? String(err) }, 500);
  }
});
