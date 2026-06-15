// pdf-parse-callback — service-token completion endpoint for Docling sidecar callbacks.
//
// Wave F-Option-3: the sidecar uploads all artifacts to the diagnostics bucket
// itself, then POSTs the completion payload here. This endpoint just merges
// the payload into pdf_import_jobs and flips status → succeeded / failed. The
// edge dispatcher's wall-clock budget is no longer coupled to Docling runtime.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { createTokenAuthCorsHeaders } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CALLBACK_TOKEN = Deno.env.get('PDF_PARSE_SERVICE_TOKEN') ?? '';

Deno.serve(async (req) => {
  const cors = createTokenAuthCorsHeaders();
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!CALLBACK_TOKEN || token !== CALLBACK_TOKEN) {
    return json({ error: 'unauthorised' }, 401);
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const jobId = String((body as any).job_id ?? req.headers.get('x-request-id') ?? '');
  if (!jobId) return json({ error: 'job_id required' }, 400);

  const status = (body as any).status === 'failed' ? 'failed' : 'succeeded';
  const now = new Date().toISOString();
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Fetch existing row so we can preserve started_at/duration math.
  const { data: existing } = await admin
    .from('pdf_import_jobs')
    .select('started_at,result_payload')
    .eq('id', jobId)
    .maybeSingle();

  const startedAt = existing?.started_at ? new Date(existing.started_at).getTime() : Date.now();
  const duration = Date.now() - startedAt;

  const patch: Record<string, unknown> = {
    status,
    stage: status === 'failed' ? 'failed' : 'parsed',
    callback_received_at: now,
    finished_at: now,
    duration_ms: duration,
    updated_at: now,
  };

  if (status === 'failed') {
    const b = body as any;
    patch.error_code = typeof b.error_code === 'string' ? b.error_code : 'sidecar_callback_failed';
    patch.error_text = String(b.message ?? b.error_text ?? 'Sidecar callback reported failure.').slice(0, 2000);
  } else {
    const b = body as any;
    if (typeof b.engine_version === 'string') patch.engine_version = b.engine_version;
    if (typeof b.page_count === 'number') {
      patch.page_count = b.page_count;
      patch.pages_total = b.page_count;
      patch.pages_completed = b.page_count;
    }
    if (typeof b.bytes_in === 'number') patch.bytes_in = b.bytes_in;
    if (typeof b.bytes_out === 'number') patch.bytes_out = b.bytes_out;
    if (typeof b.cloud_run_ms === 'number') patch.cloud_run_ms = b.cloud_run_ms;
    if (typeof b.effective_mode === 'string') patch.mode = b.effective_mode;
    if (b.result_payload && typeof b.result_payload === 'object') {
      // Merge with anything dispatcher already wrote (e.g. cache_hit short-circuit).
      const prior = (existing?.result_payload && typeof existing.result_payload === 'object')
        ? existing.result_payload as Record<string, unknown>
        : {};
      patch.result_payload = { ...prior, ...b.result_payload };
      if (typeof (b.result_payload as any).docling_path === 'string') {
        patch.diagnostics_path = (b.result_payload as any).docling_path;
      }
    }
  }

  const { error } = await admin.from('pdf_import_jobs').update(patch).eq('id', jobId);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, job_id: jobId, status });
});
