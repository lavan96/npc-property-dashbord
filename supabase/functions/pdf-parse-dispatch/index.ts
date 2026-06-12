// pdf-parse-dispatch — async orchestrator for Docling-based PDF imports.
//
// Phase 2 of the Docling pipeline plan. The frontend calls this with either a
// signed source URL or a Storage path; we insert a `pdf_import_jobs` row,
// return `{ jobId }` in <2s, and run the heavy work (sidecar parse + raster +
// diagnostics upload) inside EdgeRuntime.waitUntil so we never block the edge
// request envelope. The UI subscribes to `pdf_import_jobs` via Supabase
// realtime to render staged progress.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  verifyAuthOrNativeUser,
  createTokenAuthCorsHeaders,
  createUnauthorizedResponse,
} from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PARSE_URL = Deno.env.get('PDF_PARSE_SERVICE_URL') ?? '';
const PARSE_TOKEN = Deno.env.get('PDF_PARSE_SERVICE_TOKEN') ?? '';
const DIAGNOSTICS_BUCKET = 'pdf-import-diagnostics';
const SOURCE_BUCKET = 'template-import-assets';

// deno-lint-ignore no-explicit-any
type Admin = ReturnType<typeof createClient>;

async function updateJob(
  admin: Admin,
  jobId: string,
  patch: Record<string, unknown>,
) {
  const { error } = await admin
    .from('pdf_import_jobs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) console.error('[pdf-parse-dispatch] updateJob failed', { jobId, error });
}

async function setStage(admin: Admin, jobId: string, stage: string) {
  await updateJob(admin, jobId, { stage, stage_started_at: new Date().toISOString() });
}

async function ensureDiagnosticsBucket(admin: Admin) {
  const { data } = await admin.storage.getBucket(DIAGNOSTICS_BUCKET);
  if (data) return;
  const { error } = await admin.storage.createBucket(DIAGNOSTICS_BUCKET, {
    public: false,
    fileSizeLimit: 52428800,
    allowedMimeTypes: ['application/json', 'application/pdf', 'image/png', 'image/jpeg'],
  });
  if (error) console.error('[pdf-parse-dispatch] ensureDiagnosticsBucket failed', error);
}

async function uploadDiagnostic(
  admin: Admin,
  jobId: string,
  name: string,
  body: Uint8Array | string,
  contentType: string,
): Promise<string | null> {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  const path = `${jobId}/${name}`;
  const { error } = await admin.storage
    .from(DIAGNOSTICS_BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) {
    console.error('[pdf-parse-dispatch] diagnostic upload failed', { path, error });
    return null;
  }
  return path;
}

async function resolveSignedSourceUrl(
  admin: Admin,
  body: Record<string, unknown>,
): Promise<{ url: string; cleanup?: () => Promise<void> } | { error: string }> {
  const directUrl = typeof body.source_url === 'string' ? body.source_url : '';
  if (directUrl) return { url: directUrl };

  const storagePath = typeof body.source_path === 'string' ? body.source_path : '';
  const bucket = typeof body.source_bucket === 'string' && body.source_bucket
    ? (body.source_bucket as string)
    : SOURCE_BUCKET;
  if (storagePath) {
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(storagePath, 600);
    if (error || !data) return { error: error?.message ?? 'failed to sign source URL' };
    return { url: data.signedUrl };
  }

  // base64 fallback: upload to diagnostics bucket so the sidecar can pull it.
  const b64 = typeof body.source_base64 === 'string' ? body.source_base64 : '';
  if (b64) {
    const clean = b64.includes(',') ? b64.split(',')[1] : b64;
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const path = `inbox/${crypto.randomUUID()}.pdf`;
    const { error: upErr } = await admin.storage
      .from(DIAGNOSTICS_BUCKET)
      .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
    if (upErr) return { error: upErr.message };
    const { data, error } = await admin.storage.from(DIAGNOSTICS_BUCKET).createSignedUrl(path, 600);
    if (error || !data) return { error: error?.message ?? 'failed to sign uploaded PDF' };
    return {
      url: data.signedUrl,
      cleanup: async () => {
        await admin.storage.from(DIAGNOSTICS_BUCKET).remove([path]);
      },
    };
  }
  return { error: 'must supply source_url, source_path, or source_base64' };
}

async function runJob(
  admin: Admin,
  jobId: string,
  signedUrl: string,
  mode: string,
  cleanup?: () => Promise<void>,
) {
  const startedAt = Date.now();
  try {
    await setStage(admin, jobId, 'parsing');

    const parseRes = await fetch(`${PARSE_URL.replace(/\/$/, '')}/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PARSE_TOKEN}`,
      },
      body: JSON.stringify({ url: signedUrl }),
    });
    if (!parseRes.ok) {
      const text = await parseRes.text().catch(() => '');
      throw new Error(`sidecar /parse ${parseRes.status}: ${text.slice(0, 500)}`);
    }
    const parseJson = await parseRes.json();
    // Sidecar returns an envelope { engine_version, pages, docling_document, ... }.
    // The frontend mapper expects the DoclingDocument itself, so persist just
    // that under `docling.json`.
    const doclingDoc = parseJson?.docling_document ?? parseJson;
    const doclingPath = await uploadDiagnostic(
      admin,
      jobId,
      'docling.json',
      JSON.stringify(doclingDoc),
      'application/json',
    );

    const pageCount = Array.isArray(parseJson?.pages)
      ? parseJson.pages.length
      : (typeof parseJson?.page_count === 'number' ? parseJson.page_count : null);
    await updateJob(admin, jobId, {
      page_count: pageCount,
      engine_version: parseJson?.engine_version ?? 'docling',
    });

    // Hybrid / pixel-perfect need page rasters; semantic skips this.
    let rasterPath: string | null = null;
    if (mode === 'hybrid' || mode === 'pixel_perfect' || mode === 'pixel-perfect') {
      await setStage(admin, jobId, 'rastering');
      const dpi = (mode === 'pixel_perfect' || mode === 'pixel-perfect') ? 200 : 144;
      const format = 'png';
      const rasterRes = await fetch(`${PARSE_URL.replace(/\/$/, '')}/raster`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${PARSE_TOKEN}`,
        },
        body: JSON.stringify({ url: signedUrl, dpi, format }),
      });
      if (!rasterRes.ok) {
        const text = await rasterRes.text().catch(() => '');
        throw new Error(`sidecar /raster ${rasterRes.status}: ${text.slice(0, 500)}`);
      }
      const rasterJson = await rasterRes.json();
      // Normalize sidecar shape ({ pages:[{page_no, mime, width_px, height_px, base64}] })
      // into the envelope the frontend `DoclingRasterResponse` typings expect.
      const normalizedRaster = {
        format,
        dpi: rasterJson?.dpi ?? dpi,
        engine_version: rasterJson?.engine_version,
        pages: Array.isArray(rasterJson?.pages)
          ? rasterJson.pages.map((p: any) => ({
              page_no: p.page_no,
              width: p.width ?? p.width_px ?? 0,
              height: p.height ?? p.height_px ?? 0,
              image_base64: p.image_base64 ?? p.base64 ?? '',
            }))
          : [],
      };
      rasterPath = await uploadDiagnostic(
        admin,
        jobId,
        'rasters.json',
        JSON.stringify(normalizedRaster),
        'application/json',
      );
    }

    await setStage(admin, jobId, 'finalizing');
    const finishedAt = Date.now();
    await updateJob(admin, jobId, {
      status: 'succeeded',
      stage: 'parsed',
      finished_at: new Date(finishedAt).toISOString(),
      duration_ms: finishedAt - startedAt,
      diagnostics_path: doclingPath,
      result_payload: {
        docling_path: doclingPath,
        rasters_path: rasterPath,
        page_count: pageCount,
        mode,
      },
    });
  } catch (err) {
    const finishedAt = Date.now();
    console.error('[pdf-parse-dispatch] job failed', { jobId, err });
    await updateJob(admin, jobId, {
      status: 'failed',
      stage: 'failed',
      finished_at: new Date(finishedAt).toISOString(),
      duration_ms: finishedAt - startedAt,
      error_code: 'sidecar_error',
      error_text: String((err as Error)?.message ?? err).slice(0, 2000),
    });
  } finally {
    if (cleanup) await cleanup().catch(() => undefined);
  }
}

Deno.serve(async (req) => {
  const cors = createTokenAuthCorsHeaders();
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  if (!PARSE_URL || !PARSE_TOKEN) {
    return json({ error: 'PDF_PARSE_SERVICE_URL / PDF_PARSE_SERVICE_TOKEN not configured' }, 503);
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const auth = await verifyAuthOrNativeUser(admin, req, body);
    if (auth.error) return createUnauthorizedResponse(auth.error, cors);
    const userId = auth.userId && auth.userId !== 'service_role' ? auth.userId : (body.user_id ?? null);

    const operation = (body.operation as string) || 'start';

    if (operation === 'status') {
      const jobId = body.job_id as string;
      if (!jobId) return json({ error: 'job_id required' }, 400);
      const { data, error } = await admin
        .from('pdf_import_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
      if (error) return json({ error: error.message }, 404);
      return json({ job: data });
    }

    if (operation === 'download') {
      // Signed-URL minter for diagnostic artifacts (docling.json / rasters.json).
      // The frontend can't sign URLs on the private `pdf-import-diagnostics`
      // bucket itself under our custom-auth model, so we mediate here.
      const path = typeof body.path === 'string' ? body.path : '';
      if (!path) return json({ error: 'path required' }, 400);
      const expiresIn = Math.min(Math.max(Number(body.expires_in) || 600, 60), 3600);
      const objectPath = path.startsWith(`${DIAGNOSTICS_BUCKET}/`)
        ? path.slice(DIAGNOSTICS_BUCKET.length + 1)
        : path;
      // Scope: caller must own the underlying job (jobId is the first path segment).
      const jobId = objectPath.split('/')[0];
      if (userId && jobId) {
        const { data: jobRow } = await admin
          .from('pdf_import_jobs')
          .select('user_id')
          .eq('id', jobId)
          .maybeSingle();
        if (jobRow && jobRow.user_id && jobRow.user_id !== userId) {
          return json({ error: 'forbidden' }, 403);
        }
      }
      const { data, error } = await admin.storage
        .from(DIAGNOSTICS_BUCKET)
        .createSignedUrl(objectPath, expiresIn);
      if (error || !data?.signedUrl) return json({ error: error?.message ?? 'sign failed' }, 500);
      return json({ signed_url: data.signedUrl, expires_in: expiresIn });
    }

    if (operation === 'start') {
      const rawMode = (body.mode as string) ?? 'semantic';
      // DB CHECK uses 'pixel_perfect' (underscore); UI/API may pass 'pixel-perfect'.
      const mode = rawMode === 'pixel-perfect' ? 'pixel_perfect' : rawMode;
      await ensureDiagnosticsBucket(admin);
      const sourceRes = await resolveSignedSourceUrl(admin, body);
      if ('error' in sourceRes) return json({ error: sourceRes.error }, 400);


      const { data: jobRow, error: insertErr } = await admin
        .from('pdf_import_jobs')
        .insert({
          user_id: userId,
          template_id: body.template_id ?? null,
          source_file_path: (body.source_path as string)
            ?? (typeof body.source_file_name === 'string' ? `inline:${body.source_file_name}` : `inline:${crypto.randomUUID()}.pdf`),
          source_file_name: body.source_file_name ?? null,
          source_file_size_bytes: body.source_file_size_bytes ?? null,
          engine: 'docling',
          mode,
          status: 'queued',
          stage: 'queued',
          started_at: new Date().toISOString(),
          stage_started_at: new Date().toISOString(),
          request_payload: {
            mode,
            has_source_url: Boolean(body.source_url),
            has_source_path: Boolean(body.source_path),
            has_source_base64: Boolean(body.source_base64),
          },
        })
        .select('id')
        .single();
      if (insertErr || !jobRow) return json({ error: insertErr?.message ?? 'job insert failed' }, 500);

      // Fire-and-forget background processing.
      // @ts-expect-error EdgeRuntime is provided by Supabase's Deno runtime.
      EdgeRuntime.waitUntil(runJob(admin, jobRow.id, sourceRes.url, mode, sourceRes.cleanup));

      return json({ job_id: jobRow.id, status: 'queued' });
    }

    return json({ error: `unknown operation: ${operation}` }, 400);
  } catch (e) {
    console.error('[pdf-parse-dispatch] unhandled', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
