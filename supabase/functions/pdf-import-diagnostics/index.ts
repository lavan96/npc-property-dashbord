// pdf-import-diagnostics — superadmin-only read access to pdf_import_jobs +
// signed download URLs for the per-job diagnostics bundle.
//
// Phase 7 of the Docling pipeline plan. Backs the /admin/pdf-import-diagnostics
// page. The table's RLS scopes by `auth.uid()` which doesn't fire for our
// custom-auth users — this function mediates with the service-role key after
// re-checking the superadmin role server-side.
//
// Operations:
//   - { operation: 'list',     status?, engine?, engineVersion?, limit? } -> { rows }
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
      const engineVersion = typeof body.engineVersion === 'string' ? body.engineVersion : null;
      const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);

      let q = admin
        .from('pdf_import_jobs')
        .select(
          'id,user_id,template_id,source_file_name,source_file_size_bytes,engine,engine_version,mode,status,stage,started_at,finished_at,duration_ms,cloud_run_ms,bytes_in,bytes_out,page_count,ssim_score,error_code,error_text,diagnostics_path,result_payload,created_at,updated_at',
        )
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status) q = q.eq('status', status);
      if (engine) q = q.eq('engine', engine);
      if (engineVersion) q = q.eq('engine_version', engineVersion);

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
      const expiresIn = Math.min(Math.max(Number(body.expiresIn) || 300, 60), 300);
      // Strip the bucket prefix if the caller passed the full storage path.
      const objectPath = path.startsWith(`${DIAGNOSTICS_BUCKET}/`)
        ? path.slice(DIAGNOSTICS_BUCKET.length + 1)
        : path;
      const { data: jobRow } = await admin
        .from('pdf_import_jobs')
        .select('id,source_file_hash,source_file_name')
        .eq('id', objectPath.split('/')[0])
        .maybeSingle();
      const { data, error } = await admin.storage
        .from(DIAGNOSTICS_BUCKET)
        .createSignedUrl(objectPath, expiresIn);
      if (error) return json({ error: error.message }, 500);
      await admin.from('pdf_import_audit_log').insert({
        job_id: jobRow?.id ?? null,
        actor_id: auth.userId === 'service_role' ? null : auth.userId,
        action: 'diagnostics_download_signed',
        diagnostics_path: objectPath,
        file_hash: jobRow?.source_file_hash ?? null,
        metadata: { expires_in: expiresIn, source_file_name: jobRow?.source_file_name ?? null },
      }).then(({ error: auditError }) => {
        if (auditError) console.warn('[pdf-import-diagnostics] audit insert failed', auditError);
      });
      return json({ signedUrl: data?.signedUrl, expiresIn });
    }

    if (operation === 'stats') {
      // Lightweight rollup for the dashboard hero strip.
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await admin
        .from('pdf_import_jobs')
        .select('status,engine,engine_version,duration_ms,cloud_run_ms,bytes_in,bytes_out,ssim_score,page_count,source_file_size_bytes,user_id,result_payload,created_at')
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
      const byEngineVersion: Record<string, number> = {};
      const byUser: Record<string, number> = {};
      const byFileSizeBucket: Record<string, number> = {};
      const byPageCount: Record<string, number> = {};
      const summary = {
        text_chars: 0,
        ocr_ratio_sum: 0,
        ocr_ratio_count: 0,
        table_count: 0,
        confidence_sum: 0,
        confidence_count: 0,
      };
      let cloudRunMs = 0;
      let bytesIn = 0;
      let bytesOut = 0;
      for (const r of rows as any[]) {
        const ev = r.engine_version || '(unset)';
        byEngineVersion[ev] = (byEngineVersion[ev] ?? 0) + 1;
        byUser[r.user_id || '(unknown)'] = (byUser[r.user_id || '(unknown)'] ?? 0) + 1;
        const size = Number(r.source_file_size_bytes ?? r.bytes_in ?? 0);
        const sizeBucket = size < 1024 * 1024 ? '<1MB' : size < 10 * 1024 * 1024 ? '1-10MB' : size < 50 * 1024 * 1024 ? '10-50MB' : '50MB+';
        byFileSizeBucket[sizeBucket] = (byFileSizeBucket[sizeBucket] ?? 0) + 1;
        const pc = Number(r.page_count ?? 0);
        const pageBucket = pc <= 1 ? '1 page' : pc <= 5 ? '2-5 pages' : pc <= 20 ? '6-20 pages' : '21+ pages';
        byPageCount[pageBucket] = (byPageCount[pageBucket] ?? 0) + 1;
        cloudRunMs += Number(r.cloud_run_ms) || 0;
        bytesIn += Number(r.bytes_in) || 0;
        bytesOut += Number(r.bytes_out) || 0;
        const s = r.result_payload?.summary;
        if (s && typeof s === 'object') {
          summary.text_chars += Number(s.text_chars) || 0;
          summary.table_count += Number(s.table_count) || 0;
          const ocrChars = Number(s.ocr_chars) || 0;
          const textChars = Number(s.text_chars) || 0;
          if (textChars > 0) {
            summary.ocr_ratio_sum += ocrChars / textChars;
            summary.ocr_ratio_count += 1;
          }
          const conf = Number(s.avg_text_confidence);
          if (Number.isFinite(conf)) {
            summary.confidence_sum += conf;
            summary.confidence_count += 1;
          }
        }
      }
      return json({
        totals,
        latency: { p50_ms: p50, p95_ms: p95 },
        ssim: { avg: avgSsim, sample_count: ssim.length },
        summary: {
          text_chars: summary.text_chars,
          avg_ocr_ratio: summary.ocr_ratio_count ? summary.ocr_ratio_sum / summary.ocr_ratio_count : null,
          table_count: summary.table_count,
          avg_confidence: summary.confidence_count ? summary.confidence_sum / summary.confidence_count : null,
        },
        cohorts: { byEngineVersion, byUser, byFileSizeBucket, byPageCount },
        cost: { cloud_run_ms: cloudRunMs, bytes_in: bytesIn, bytes_out: bytesOut },
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
