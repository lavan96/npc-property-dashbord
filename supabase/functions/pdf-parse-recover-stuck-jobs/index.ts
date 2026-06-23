import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { createTokenAuthCorsHeaders } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RECOVERY_TOKEN = Deno.env.get('PDF_PARSE_RECOVERY_TOKEN') ?? SERVICE_ROLE;
const PARSE_URL = (Deno.env.get('PDF_PARSE_SERVICE_URL') ?? '').replace(/\/$/, '');
const PARSE_TOKEN = Deno.env.get('PDF_PARSE_SERVICE_TOKEN') ?? '';

type Admin = ReturnType<typeof createClient>;

interface ChunkRow {
  id: string;
  job_id: string;
  parent_chunk_id: string | null;
  chunk_index: number;
  page_start: number;
  page_end: number;
  status: string;
  attempts: number | null;
  max_attempts: number | null;
  artifact_paths: Record<string, unknown> | null;
  dispatched_at: string | null;
  updated_at: string | null;
}

function json(body: unknown, status = 200, cors = createTokenAuthCorsHeaders()) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function appendJobAttempt(admin: Admin, jobId: string, entry: Record<string, unknown>) {
  const enriched = { ...entry, at: new Date().toISOString() };

  const { error } = await admin.rpc('append_pdf_import_attempt', {
    p_job_id: jobId,
    p_attempt: enriched,
  });

  if (!error) return;

  const { data } = await admin
    .from('pdf_import_jobs')
    .select('attempts')
    .eq('id', jobId)
    .maybeSingle();

  const attempts = Array.isArray((data as any)?.attempts) ? (data as any).attempts : [];

  await admin
    .from('pdf_import_jobs')
    .update({ attempts: [...attempts, enriched] })
    .eq('id', jobId);
}

async function resignSourceUrl(admin: Admin, jobId: string): Promise<string | null> {
  const { data: job } = await admin
    .from('pdf_import_jobs')
    .select('plan_payload, request_payload')
    .eq('id', jobId)
    .maybeSingle();

  const plan = (job as any)?.plan_payload ?? {};
  const src = plan?.source ?? {};

  if (src.kind === 'storage' && src.bucket && src.path) {
    const { data, error } = await admin.storage
      .from(src.bucket)
      .createSignedUrl(src.path, 1200);

    if (error || !data?.signedUrl) {
      console.error('[pdf-parse-recover] re-sign failed', { jobId, error });
      return null;
    }

    return data.signedUrl;
  }

  if (src.kind === 'url' && typeof src.url === 'string') return src.url;

  return null;
}

async function redispatchChunk(admin: Admin, chunk: ChunkRow): Promise<{ ok: boolean; error?: string }> {
  if (!PARSE_URL || !PARSE_TOKEN) {
    return { ok: false, error: 'PDF_PARSE_SERVICE_URL or PDF_PARSE_SERVICE_TOKEN missing' };
  }

  const signedUrl = await resignSourceUrl(admin, chunk.job_id);
  if (!signedUrl) return { ok: false, error: 'source URL could not be re-signed' };

  const { data: job } = await admin
    .from('pdf_import_jobs')
    .select('mode, request_payload, plan_payload')
    .eq('id', chunk.job_id)
    .maybeSingle();

  const rp = ((job as any)?.request_payload ?? {}) as Record<string, unknown>;
  const plan = ((job as any)?.plan_payload ?? {}) as Record<string, unknown>;
  const mode = String(plan.dispatch_effective_mode ?? (job as any)?.mode ?? 'semantic');
  const selectedLane = String(plan.selected_lane ?? plan.recommended_lane ?? 'unplanned');
  const nextAttempts = Number(chunk.attempts ?? 0) + 1;

  await admin
    .from('pdf_import_chunks')
    .update({
      status: 'dispatched',
      attempts: nextAttempts,
      dispatched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_code: null,
      error_text: null,
      artifact_paths: {},
    })
    .eq('id', chunk.id);

  const body = {
    job_id: chunk.job_id,
    chunk_id: chunk.id,
    chunk_index: chunk.chunk_index,
    page_start: chunk.page_start,
    page_end: chunk.page_end,
    url: signedUrl,
    mode,
    extractor_lane: selectedLane,
    callback_url: `${SUPABASE_URL}/functions/v1/pdf-parse-chunk-callback`,
    callback_token: PARSE_TOKEN,
    enable_picture_description: rp.description_tier !== 'off' && plan.requires_picture_description === true,
    include_doctags: true,
    include_markdown: rp.include_markdown !== false,
    redact_pii: Boolean(rp.redact_pii),
    raster_dpi: mode === 'pixel_perfect' || mode === 'pixel-perfect' ? 200 : 144,
    raster_format: 'png',
  };

  const res = await fetch(`${PARSE_URL}/parse-chunk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PARSE_TOKEN}`,
      'X-Request-Id': chunk.job_id,
    },
    body: JSON.stringify(body),
  });

  if (res.status !== 202) {
    const text = await res.text().catch(() => '');

    await admin
      .from('pdf_import_chunks')
      .update({
        status: 'failed',
        error_code: `redispatch_http_${res.status}`,
        error_text: text.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq('id', chunk.id);

    return {
      ok: false,
      error: `Cloud Run /parse-chunk returned ${res.status}: ${text.slice(0, 300)}`,
    };
  }

  await appendJobAttempt(admin, chunk.job_id, {
    kind: 'chunk_recovery_redispatch',
    chunk_id: chunk.id,
    chunk_index: chunk.chunk_index,
    page_start: chunk.page_start,
    page_end: chunk.page_end,
    attempts: nextAttempts,
  });

  return { ok: true };
}

async function recoverStaleChunks(admin: Admin, staleMinutes: number, limit: number) {
  const thresholdIso = new Date(Date.now() - staleMinutes * 60_000).toISOString();

  const { data: chunks, error } = await admin
    .from('pdf_import_chunks')
    .select('id, job_id, parent_chunk_id, chunk_index, page_start, page_end, status, attempts, max_attempts, artifact_paths, dispatched_at, updated_at')
    .eq('status', 'dispatched')
    .lt('updated_at', thresholdIso)
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (error) throw error;

  const rows = (chunks ?? []) as ChunkRow[];
  const results: Array<Record<string, unknown>> = [];

  for (const chunk of rows) {
    const attempts = Number(chunk.attempts ?? 0);
    const maxAttempts = Number(chunk.max_attempts ?? 3);

    if (attempts >= maxAttempts) {
      await admin
        .from('pdf_import_chunks')
        .update({
          status: 'fatal',
          error_code: 'chunk_recovery_attempts_exhausted',
          error_text: `Chunk remained stale after ${attempts}/${maxAttempts} attempts.`,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', chunk.id);

      await appendJobAttempt(admin, chunk.job_id, {
        kind: 'chunk_recovery_fatal',
        chunk_id: chunk.id,
        chunk_index: chunk.chunk_index,
        page_start: chunk.page_start,
        page_end: chunk.page_end,
        attempts,
        max_attempts: maxAttempts,
      });

      results.push({
        chunk_id: chunk.id,
        chunk_index: chunk.chunk_index,
        page_start: chunk.page_start,
        page_end: chunk.page_end,
        action: 'marked_fatal',
      });

      continue;
    }

    const redispatch = await redispatchChunk(admin, chunk);

    results.push({
      chunk_id: chunk.id,
      chunk_index: chunk.chunk_index,
      page_start: chunk.page_start,
      page_end: chunk.page_end,
      action: redispatch.ok ? 'redispatched' : 'redispatch_failed',
      error: redispatch.error ?? null,
    });
  }

  return {
    staleMinutes,
    found: rows.length,
    results,
  };
}

Deno.serve(async (req) => {
  const cors = createTokenAuthCorsHeaders();

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  const auth = req.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';

  if (!RECOVERY_TOKEN || token !== RECOVERY_TOKEN) {
    return json({ error: 'unauthorized' }, 401, cors);
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const staleMinutes = Math.max(5, Math.min(120, Number((body as any).stale_minutes ?? 10) || 10));
  const limit = Math.max(1, Math.min(25, Number((body as any).limit ?? 10) || 10));

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const result = await recoverStaleChunks(admin, staleMinutes, limit);
    return json({ ok: true, ...result }, 200, cors);
  } catch (e) {
    console.error('[pdf-parse-recover] failed', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500, cors);
  }
});
