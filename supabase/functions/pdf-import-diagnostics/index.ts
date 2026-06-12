// pdf-import-diagnostics — superadmin-only read access to pdf_import_jobs +
// signed download URLs for the per-job diagnostics bundle.
//
// Phase 7 of the Docling pipeline plan. Backs the /admin/pdf-import-diagnostics
// page. The table's RLS scopes by `auth.uid()` which doesn't fire for our
// custom-auth users — this function mediates with the service-role key after
// re-checking the superadmin role server-side.
//
// Operations:
//   - { operation: 'list',     status?, engine?, limit? }    -> { rows }
//   - { operation: 'get',      jobId }                       -> { row }
//   - { operation: 'download', diagnosticsPath, expiresIn? } -> { signedUrl }
//   - { operation: 'stats' }                                 -> { totals, recent }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  verifyAuth,
  createTokenAuthCorsHeaders,
  createUnauthorizedResponse,
  createForbiddenResponse,
} from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DIAGNOSTICS_BUCKET = 'pdf-import-diagnostics';

Deno.serve(async (req) => {
  const cors = createTokenAuthCorsHeaders();
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const auth = await verifyAuth(admin, req.headers, body);
    if (auth.error || !auth.userId) {
      return createUnauthorizedResponse(auth.error ?? 'unauthorized', cors);
    }
    if (auth.userId !== 'service_role') {
      const { data: roles } = await admin
        .from('user_roles')
        .select('role')
        .eq('user_id', auth.userId);
      const isSuperadmin =
        Array.isArray(roles) && roles.some((r: any) => r.role === 'superadmin');
      if (!isSuperadmin) return createForbiddenResponse('superadmin required', cors);
    }

    const operation = (body.operation as string) || 'list';

    if (operation === 'list') {
      const status = typeof body.status === 'string' ? body.status : null;
      const engine = typeof body.engine === 'string' ? body.engine : null;
      const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);

      let q = admin
        .from('pdf_import_jobs')
        .select(
          'id,user_id,template_id,source_file_name,source_file_size_bytes,engine,engine_version,mode,status,stage,started_at,finished_at,duration_ms,page_count,ssim_score,error_code,error_text,diagnostics_path,created_at,updated_at',
        )
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status) q = q.eq('status', status);
      if (engine) q = q.eq('engine', engine);

      const { data, error } = await q;
      if (error) return json({ error: error.message }, 500);
      return json({ rows: data ?? [] });
    }

    if (operation === 'get') {
      const jobId = body.jobId as string;
      if (!jobId) return json({ error: 'jobId required' }, 400);
      const { data, error } = await admin
        .from('pdf_import_jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ row: data });
    }

    if (operation === 'download') {
      const path = body.diagnosticsPath as string;
      if (!path) return json({ error: 'diagnosticsPath required' }, 400);
      const expiresIn = Math.min(Math.max(Number(body.expiresIn) || 600, 60), 3600);
      // Strip the bucket prefix if the caller passed the full storage path.
      const objectPath = path.startsWith(`${DIAGNOSTICS_BUCKET}/`)
        ? path.slice(DIAGNOSTICS_BUCKET.length + 1)
        : path;
      const { data, error } = await admin.storage
        .from(DIAGNOSTICS_BUCKET)
        .createSignedUrl(objectPath, expiresIn);
      if (error) return json({ error: error.message }, 500);
      return json({ signedUrl: data?.signedUrl, expiresIn });
    }

    if (operation === 'stats') {
      // Lightweight rollup for the dashboard hero strip.
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await admin
        .from('pdf_import_jobs')
        .select('status,engine,duration_ms,ssim_score,created_at')
        .gte('created_at', since)
        .limit(1000);
      if (error) return json({ error: error.message }, 500);
      const rows = data ?? [];
      const totals = {
        total: rows.length,
        succeeded: rows.filter((r) => r.status === 'succeeded').length,
        failed: rows.filter((r) => r.status === 'failed').length,
        inflight: rows.filter(
          (r) => !['succeeded', 'failed', 'cancelled'].includes(String(r.status)),
        ).length,
        legacy: rows.filter((r) => r.engine === 'legacy').length,
        docling: rows.filter((r) => r.engine === 'docling').length,
      };
      const durations = rows
        .map((r) => Number(r.duration_ms))
        .filter((n) => Number.isFinite(n) && n > 0)
        .sort((a, b) => a - b);
      const p50 = durations.length ? durations[Math.floor(durations.length * 0.5)] : null;
      const p95 = durations.length ? durations[Math.floor(durations.length * 0.95)] : null;
      const ssim = rows
        .map((r) => Number(r.ssim_score))
        .filter((n) => Number.isFinite(n));
      const avgSsim = ssim.length ? ssim.reduce((a, b) => a + b, 0) / ssim.length : null;
      return json({
        totals,
        latency: { p50_ms: p50, p95_ms: p95 },
        ssim: { avg: avgSsim, sample_count: ssim.length },
      });
    }

    return json({ error: `unknown operation: ${operation}` }, 400);
  } catch (e: any) {
    console.error('[pdf-import-diagnostics] error', e);
    return new Response(
      JSON.stringify({ error: e?.message ?? String(e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
});
