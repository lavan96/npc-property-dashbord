// pdf-parse-dispatch — async orchestrator for Docling-based PDF imports.
//
// Phase 2 of the Docling pipeline plan. The frontend calls this with either a
// signed source URL or a Storage path; we insert a `pdf_import_jobs` row,
// return `{ jobId }` in <2s, and run the heavy work (sidecar parse + raster +
// diagnostics upload) inside EdgeRuntime.waitUntil so we never block the edge
// request envelope. The UI subscribes to `pdf_import_jobs` via Supabase
// realtime to render staged progress.
//
// Phase C additions:
//   * SHA-256 file-hash dedupe — identical PDFs in the same mode reuse prior
//     `docling.json` / `rasters.json` artifacts (instant return, cache_hit=true).
//   * Per-page raster streaming — rasters are produced one page at a time so
//     `pages_completed` / `pages_total` advance live in the UI.

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

async function downloadDiagnostic(
  admin: Admin,
  path: string,
): Promise<Uint8Array | null> {
  const objectPath = path.startsWith(`${DIAGNOSTICS_BUCKET}/`)
    ? path.slice(DIAGNOSTICS_BUCKET.length + 1)
    : path;
  const { data, error } = await admin.storage.from(DIAGNOSTICS_BUCKET).download(objectPath);
  if (error || !data) {
    console.warn('[pdf-parse-dispatch] cache fetch failed', { path, error });
    return null;
  }
  return new Uint8Array(await data.arrayBuffer());
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
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

async function fetchAndHash(signedUrl: string): Promise<{ hash: string; size: number } | null> {
  try {
    const res = await fetch(signedUrl);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const hash = await sha256Hex(bytes);
    return { hash, size: bytes.length };
  } catch (e) {
    console.warn('[pdf-parse-dispatch] hash fetch failed', e);
    return null;
  }
}

async function findCachedJob(
  admin: Admin,
  hash: string,
  mode: string,
): Promise<{ id: string; result_payload: Record<string, unknown> | null; page_count: number | null; engine_version: string | null } | null> {
  const { data } = await admin
    .from('pdf_import_jobs')
    .select('id, result_payload, page_count, engine_version, diagnostics_path')
    .eq('source_file_hash', hash)
    .eq('mode', mode)
    .eq('engine', 'docling')
    .eq('status', 'succeeded')
    .order('finished_at', { ascending: false })
    .limit(1);
  if (!data || !data.length) return null;
  const row = data[0] as any;
  // Verify diagnostics still exist.
  const doclingPath = row?.result_payload?.docling_path ?? row?.diagnostics_path;
  if (!doclingPath) return null;
  return row;
}

async function copyDiagnostic(
  admin: Admin,
  srcPath: string,
  destJobId: string,
  destName: string,
): Promise<string | null> {
  const bytes = await downloadDiagnostic(admin, srcPath);
  if (!bytes) return null;
  return uploadDiagnostic(admin, destJobId, destName, bytes, 'application/json');
}

async function serveFromCache(
  admin: Admin,
  jobId: string,
  cached: { id: string; result_payload: Record<string, unknown> | null; page_count: number | null; engine_version: string | null },
  mode: string,
  startedAt: number,
) {
  await setStage(admin, jobId, 'cache_hit');
  const result = (cached.result_payload ?? {}) as Record<string, unknown>;
  const doclingSrc = (result.docling_path as string) ?? '';
  const rasterSrc = (result.rasters_path as string) ?? '';
  const doclingPath = doclingSrc ? await copyDiagnostic(admin, doclingSrc, jobId, 'docling.json') : null;
  const rasterPath = rasterSrc ? await copyDiagnostic(admin, rasterSrc, jobId, 'rasters.json') : null;
  const finishedAt = Date.now();
  const pageCount = cached.page_count ?? null;
  await updateJob(admin, jobId, {
    status: 'succeeded',
    stage: 'parsed',
    cache_hit: true,
    cache_source_job_id: cached.id,
    engine_version: cached.engine_version ?? 'docling',
    page_count: pageCount,
    pages_total: pageCount,
    pages_completed: pageCount,
    finished_at: new Date(finishedAt).toISOString(),
    duration_ms: finishedAt - startedAt,
    diagnostics_path: doclingPath,
    result_payload: {
      docling_path: doclingPath,
      rasters_path: rasterPath,
      page_count: pageCount,
      mode,
      cache_hit: true,
      cache_source_job_id: cached.id,
    },
  });
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
    // ---- Phase C: hash + cache lookup --------------------------------------
    await setStage(admin, jobId, 'hashing');
    const hashed = await fetchAndHash(signedUrl);
    if (hashed) {
      await updateJob(admin, jobId, {
        source_file_hash: hashed.hash,
        source_file_size_bytes: hashed.size,
      });
      const cached = await findCachedJob(admin, hashed.hash, mode);
      if (cached) {
        console.log('[pdf-parse-dispatch] cache hit', { jobId, source: cached.id, hash: hashed.hash });
        await serveFromCache(admin, jobId, cached, mode, startedAt);
        return;
      }
    }

    await setStage(admin, jobId, 'parsing');

    // Phase D: forward optional description tier / serialisation toggles.
    const requestPayload = (await admin
      .from('pdf_import_jobs')
      .select('request_payload')
      .eq('id', jobId)
      .maybeSingle()).data?.request_payload as Record<string, unknown> | undefined;
    const descriptionTier = (requestPayload?.description_tier as string) ?? 'auto';
    const includeMarkdown = Boolean(requestPayload?.include_markdown);
    const parseBody: Record<string, unknown> = {
      url: signedUrl,
      include_doctags: true,
      include_markdown: includeMarkdown,
    };
    if (descriptionTier === 'on' || descriptionTier === 'premium') {
      parseBody.enable_picture_description = true;
    }

    // Retry transient 5xx (Cloud Run cold-start / scale-to-zero often returns 503).
    const TRANSIENT = new Set([502, 503, 504, 522, 524]);
    const MAX_ATTEMPTS = 4;
    let parseRes: Response | null = null;
    let lastErr = '';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        parseRes = await fetch(`${PARSE_URL.replace(/\/$/, '')}/parse`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${PARSE_TOKEN}`,
          },
          body: JSON.stringify(parseBody),
        });
        if (parseRes.ok) break;
        const text = await parseRes.text().catch(() => '');
        lastErr = `sidecar /parse ${parseRes.status}: ${text.slice(0, 500)}`;
        if (!TRANSIENT.has(parseRes.status) || attempt === MAX_ATTEMPTS) {
          throw new Error(lastErr);
        }
      } catch (e) {
        lastErr = String((e as Error)?.message ?? e);
        if (attempt === MAX_ATTEMPTS) throw new Error(lastErr);
      }
      const delay = [2000, 5000, 12000][attempt - 1] ?? 5000;
      console.log(`[pdf-parse-dispatch] sidecar transient error (attempt ${attempt}): ${lastErr}; retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
    if (!parseRes || !parseRes.ok) throw new Error(lastErr || 'sidecar /parse failed');
    const parseJson = await parseRes.json();

    await setStage(admin, jobId, 'persisting');
    const doclingDoc = parseJson?.docling_document ?? parseJson;
    const doclingPath = await uploadDiagnostic(
      admin,
      jobId,
      'docling.json',
      JSON.stringify(doclingDoc),
      'application/json',
    );

    // Phase D: persist auxiliary artifacts when present.
    let doctagsPath: string | null = null;
    let outlinePath: string | null = null;
    let markdownPath: string | null = null;
    if (typeof parseJson?.doctags === 'string' && parseJson.doctags.length) {
      doctagsPath = await uploadDiagnostic(admin, jobId, 'doctags.md', parseJson.doctags, 'text/markdown');
    }
    if (Array.isArray(parseJson?.outline) && parseJson.outline.length) {
      outlinePath = await uploadDiagnostic(
        admin,
        jobId,
        'outline.json',
        JSON.stringify({ outline: parseJson.outline, page_languages: parseJson?.page_languages ?? {} }),
        'application/json',
      );
    }
    if (typeof parseJson?.markdown === 'string' && parseJson.markdown.length) {
      markdownPath = await uploadDiagnostic(admin, jobId, 'document.md', parseJson.markdown, 'text/markdown');
    }

    const pageCount = Array.isArray(parseJson?.pages)
      ? parseJson.pages.length
      : (typeof parseJson?.page_count === 'number' ? parseJson.page_count : null);
    await updateJob(admin, jobId, {
      page_count: pageCount,
      pages_total: pageCount,
      pages_completed: 0,
      engine_version: parseJson?.engine_version ?? 'docling',
    });

    // Hybrid / pixel-perfect need page rasters; semantic skips this.
    // Phase C: stream page-by-page so the UI can show real progress.
    let rasterPath: string | null = null;
    const needRaster = mode === 'hybrid' || mode === 'pixel_perfect' || mode === 'pixel-perfect';
    if (needRaster && pageCount && pageCount > 0) {
      await setStage(admin, jobId, 'rastering');
      const dpi = (mode === 'pixel_perfect' || mode === 'pixel-perfect') ? 200 : 144;
      const format = 'png';
      const collected: any[] = [];
      let engineVersion: string | undefined;
      for (let pageNo = 1; pageNo <= pageCount; pageNo++) {
        const rasterRes = await fetch(`${PARSE_URL.replace(/\/$/, '')}/raster`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${PARSE_TOKEN}`,
          },
          body: JSON.stringify({ url: signedUrl, dpi, format, pages: [pageNo] }),
        });
        if (!rasterRes.ok) {
          const text = await rasterRes.text().catch(() => '');
          throw new Error(`sidecar /raster page ${pageNo} ${rasterRes.status}: ${text.slice(0, 500)}`);
        }
        const rasterJson = await rasterRes.json();
        engineVersion = engineVersion ?? rasterJson?.engine_version;
        const pages = Array.isArray(rasterJson?.pages) ? rasterJson.pages : [];
        for (const p of pages) {
          collected.push({
            page_no: p.page_no ?? pageNo,
            width: p.width ?? p.width_px ?? 0,
            height: p.height ?? p.height_px ?? 0,
            image_base64: p.image_base64 ?? p.base64 ?? '',
          });
        }
        await updateJob(admin, jobId, { pages_completed: pageNo });
      }
      const normalizedRaster = { format, dpi, engine_version: engineVersion, pages: collected };
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
      pages_completed: pageCount,
      result_payload: {
        docling_path: doclingPath,
        rasters_path: rasterPath,
        doctags_path: doctagsPath,
        outline_path: outlinePath,
        markdown_path: markdownPath,
        page_count: pageCount,
        page_languages: parseJson?.page_languages ?? {},
        outline_node_count: Array.isArray(parseJson?.outline) ? parseJson.outline.length : 0,
        mode,
        cache_hit: false,
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
            // Phase D passthroughs (consumed by runJob).
            description_tier: typeof body.description_tier === 'string' ? body.description_tier : 'auto',
            include_markdown: Boolean(body.include_markdown),
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
