// pdf-parse-callback — service-token completion endpoint for Docling sidecar callbacks.
//
// Wave F2 introduces callback completion so the UI can rely on realtime changes
// to pdf_import_jobs instead of polling dispatch. The sidecar should POST a
// completed/failed payload here with X-Request-Id set to the job id.

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

  const body = await req.json().catch(() => ({}));
  const jobId = String(body.job_id ?? req.headers.get('x-request-id') ?? '');
  if (!jobId) return json({ error: 'job_id required' }, 400);

  const status = body.status === 'failed' ? 'failed' : 'succeeded';
  const now = new Date().toISOString();
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const patch: Record<string, unknown> = {
    status,
    stage: status === 'failed' ? 'failed' : 'parsed',
    callback_received_at: now,
    finished_at: now,
    updated_at: now,
  };

  if (status === 'failed') {
    patch.error_code = typeof body.error_code === 'string' ? body.error_code : 'sidecar_callback_failed';
    patch.error_text = String(body.message ?? body.error_text ?? 'Sidecar callback reported failure.').slice(0, 2000);
  } else {
    if (typeof body.engine_version === 'string') patch.engine_version = body.engine_version;
    if (typeof body.page_count === 'number') {
      patch.page_count = body.page_count;
      patch.pages_total = body.page_count;
      patch.pages_completed = body.page_count;
    }
    if (body.result_payload && typeof body.result_payload === 'object') {
      patch.result_payload = body.result_payload;
    }
  }

  const { error } = await admin.from('pdf_import_jobs').update(patch).eq('id', jobId);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, job_id: jobId, status });
});
