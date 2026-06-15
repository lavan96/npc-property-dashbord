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
const ENGINE = 'docling';
const ENGINE_VERSION_FAMILY = 'docling-2.14.0+phaseD+waveD';
const MAX_SIDECAR_ATTEMPTS = 3;

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

async function appendAttempt(
  admin: Admin,
  jobId: string,
  attempt: Record<string, unknown>,
) {
  const enriched = { ...attempt, at: new Date().toISOString() };
  const { error } = await admin.rpc('append_pdf_import_attempt', {
    p_job_id: jobId,
    p_attempt: enriched,
  });
  if (!error) return;
  console.warn('[pdf-parse-dispatch] append attempt rpc failed; falling back', { jobId, error });
  const { data } = await admin
    .from('pdf_import_jobs')
    .select('attempts')
    .eq('id', jobId)
    .maybeSingle();
  const attempts = Array.isArray((data as any)?.attempts) ? (data as any).attempts : [];
  await updateJob(admin, jobId, { attempts: [...attempts, enriched] });
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

async function ensureSourceBucket(admin: Admin) {
  const { data } = await admin.storage.getBucket(SOURCE_BUCKET);
  if (data) return;
  const { error } = await admin.storage.createBucket(SOURCE_BUCKET, {
    public: false,
    fileSizeLimit: 104857600,
    allowedMimeTypes: ['application/pdf'],
  });
  if (error) console.error('[pdf-parse-dispatch] ensureSourceBucket failed', error);
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

function byteLength(body: Uint8Array | string | null | undefined): number {
  if (!body) return 0;
  return typeof body === 'string' ? new TextEncoder().encode(body).byteLength : body.byteLength;
}

function parseDataUri(uri: string): { mime: string; bytes: Uint8Array; ext: string } | null {
  const match = uri.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const bin = atob(match[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('png') ? 'png' : '';
  if (!ext) return null;
  return { mime, bytes, ext };
}

async function uploadDoclingPictureAssets(admin: Admin, jobId: string, doclingDoc: any): Promise<number> {
  const pictures = Array.isArray(doclingDoc?.pictures) ? doclingDoc.pictures : [];
  let bytes = 0;
  for (let i = 0; i < pictures.length; i++) {
    const uri = pictures[i]?.image?.uri;
    if (typeof uri !== 'string') continue;
    const parsed = parseDataUri(uri);
    if (!parsed) continue;
    const path = await uploadDiagnostic(admin, jobId, `images/picture-${i + 1}.${parsed.ext}`, parsed.bytes, parsed.mime);
    if (path) {
      pictures[i].image.diagnostics_path = path;
      bytes += parsed.bytes.byteLength;
    }
  }
  return bytes;
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

async function sha256Text(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text));
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


async function sourceFingerprint(body: Record<string, unknown>): Promise<string> {
  if (typeof body.source_path === 'string' && body.source_path) return `storage:${body.source_bucket ?? SOURCE_BUCKET}:${body.source_path}`;
  if (typeof body.source_url === 'string' && body.source_url) return `url:${body.source_url}`;
  if (typeof body.source_base64 === 'string' && body.source_base64) {
    const clean = body.source_base64.includes(',') ? body.source_base64.split(',').pop()! : body.source_base64;
    return `inline-sha256:${await sha256Text(clean.replace(/\s+/g, ''))}`;
  }
  if (typeof body.source_file_name === 'string' && body.source_file_name) return `inline-name:${body.source_file_name}`;
  return `unknown:${crypto.randomUUID()}`;
}

async function findIdempotentJob(
  admin: Admin,
  userId: string | null,
  idempotencyKey: string,
): Promise<{ id: string; status: string; stage: string | null } | null> {
  let q = admin
    .from('pdf_import_jobs')
    .select('id,status,stage')
    .eq('idempotency_key', idempotencyKey)
    .in('status', ['queued', 'uploading', 'parsing', 'mapping', 'finalizing', 'succeeded']);
  if (userId) q = q.eq('user_id', userId);
  const { data } = await q.order('created_at', { ascending: false }).limit(1);
  return data?.[0] as any ?? null;
}


function ocrPageRatio(summary: any, pageCount: number | null): number {
  const ocrPages = Array.isArray(summary?.ocr_pages) ? summary.ocr_pages.length : 0;
  if (!pageCount || pageCount <= 0) return 0;
  return ocrPages / pageCount;
}

function shouldForcePixelPerfect(summary: any, pageCount: number | null, requestedMode: string, requestPayload: Record<string, unknown> | undefined): boolean {
  if (requestedMode === 'pixel_perfect' || requestedMode === 'pixel-perfect') return false;
  // Honor explicit user choices. Semantic = "I want editable overlays even if the
  // PDF is scanned/flattened" — Docling's internal OCR still produces text blocks
  // we can place as editable text. Auto-promotion only applies to 'hybrid' (the
  // default), where the user has not committed to either extreme.
  if (requestedMode === 'semantic') return false;
  if (requestPayload?.allow_mode_override === false) return false;
  return ocrPageRatio(summary, pageCount) > 0.3;
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
  knownSource?: { hash?: string | null; size?: number | null },
) {
  const startedAt = Date.now();
  let bytesIn: number | null = null;
  let bytesOut = 0;
  let cloudRunMs = 0;
  try {
    // ---- Phase C: hash + cache lookup --------------------------------------
    await setStage(admin, jobId, 'hashing');
    const hashed = knownSource?.hash
      ? { hash: knownSource.hash, size: Number(knownSource.size ?? 0) || 0 }
      : await fetchAndHash(signedUrl);
    if (hashed) {
      await updateJob(admin, jobId, {
        source_file_hash: hashed.hash,
        source_file_size_bytes: hashed.size,
        bytes_in: hashed.size,
      });
      bytesIn = hashed.size;
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
    // Wave F8: always-on picture descriptions + markdown serialisation so the
    // reconstruction pipeline has the richest possible Docling output (figures,
    // captions, page-level markdown). Callers can still pin tier='off' to opt
    // out for very large jobs, but the default is now 'on'.
    const descriptionTier = (requestPayload?.description_tier as string) ?? 'on';
    const includeMarkdown = requestPayload?.include_markdown === false ? false : true;
    const parseBody: Record<string, unknown> = {
      url: signedUrl,
      include_doctags: true,
      include_markdown: includeMarkdown,
      redact_pii: Boolean(requestPayload?.redact_pii),
    };
    if (descriptionTier !== 'off') {
      parseBody.enable_picture_description = true;
    }

    // Retry transient 5xx (Cloud Run cold-start / scale-to-zero often returns 503).
    const TRANSIENT = new Set([408, 429, 500, 502, 503, 504, 522, 524]);
    let parseRes: Response | null = null;
    let lastErr = '';
    for (let attempt = 1; attempt <= MAX_SIDECAR_ATTEMPTS; attempt++) {
      const attemptStarted = Date.now();
      try {
        parseRes = await fetch(`${PARSE_URL.replace(/\/$/, '')}/parse`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${PARSE_TOKEN}`,
            'X-Request-Id': jobId,
          },
          body: JSON.stringify(parseBody),
        });
        const text = await parseRes.text().catch(() => '');
        if (parseRes.ok) {
          await appendAttempt(admin, jobId, {
            endpoint: '/parse',
            attempt,
            status: parseRes.status,
            ok: true,
            duration_ms: Date.now() - attemptStarted,
          });
          parseRes = new Response(text, { status: parseRes.status, headers: parseRes.headers });
          break;
        }
        let retryable = TRANSIENT.has(parseRes.status);
        let errorCode = `http_${parseRes.status}`;
        try {
          const errJson = JSON.parse(text);
          if (typeof errJson?.retryable === 'boolean') retryable = errJson.retryable;
          if (typeof errJson?.error_code === 'string') errorCode = errJson.error_code;
        } catch (_ignored) {
          // Non-JSON errors fall back to HTTP status retryability.
        }
        lastErr = `sidecar /parse ${parseRes.status}: ${text.slice(0, 500)}`;
        await appendAttempt(admin, jobId, {
          endpoint: '/parse',
          attempt,
          status: parseRes.status,
          ok: false,
          error_code: errorCode,
          retryable,
          duration_ms: Date.now() - attemptStarted,
        });
        if (!retryable || attempt === MAX_SIDECAR_ATTEMPTS) {
          throw new Error(lastErr);
        }
      } catch (e) {
        lastErr = String((e as Error)?.message ?? e);
        if (lastErr.startsWith('sidecar /parse')) {
          throw new Error(lastErr);
        } else {
          await appendAttempt(admin, jobId, {
            endpoint: '/parse',
            attempt,
            ok: false,
            error_code: 'fetch_exception',
            retryable: attempt < MAX_SIDECAR_ATTEMPTS,
            message: lastErr.slice(0, 500),
            duration_ms: Date.now() - attemptStarted,
          });
        }
        if (attempt === MAX_SIDECAR_ATTEMPTS) throw new Error(lastErr);
      }
      const delay = [2000, 5000][attempt - 1] ?? 5000;
      console.log(`[pdf-parse-dispatch] sidecar transient error (attempt ${attempt}): ${lastErr}; retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
    if (!parseRes || !parseRes.ok) throw new Error(lastErr || 'sidecar /parse failed');
    const parseJson = await parseRes.json();
    cloudRunMs += Number(parseJson?.parsed_ms) || 0;

    await setStage(admin, jobId, 'persisting');
    const doclingDoc = parseJson?.docling_document ?? parseJson;
    if (parseJson?.summary && doclingDoc && typeof doclingDoc === 'object') {
      doclingDoc.summary = parseJson.summary;
    }
    bytesOut += await uploadDoclingPictureAssets(admin, jobId, doclingDoc);
    const doclingBody = JSON.stringify(doclingDoc);
    const doclingPath = await uploadDiagnostic(
      admin,
      jobId,
      'docling.json',
      doclingBody,
      'application/json',
    );
    bytesOut += byteLength(doclingBody);

    // Phase D: persist auxiliary artifacts when present.
    let doctagsPath: string | null = null;
    let outlinePath: string | null = null;
    let markdownPath: string | null = null;
    if (typeof parseJson?.doctags === 'string' && parseJson.doctags.length) {
      doctagsPath = await uploadDiagnostic(admin, jobId, 'doctags.md', parseJson.doctags, 'text/markdown');
      bytesOut += byteLength(parseJson.doctags);
    }
    if (Array.isArray(parseJson?.outline) && parseJson.outline.length) {
      const outlineBody = JSON.stringify({ outline: parseJson.outline, page_languages: parseJson?.page_languages ?? {} });
      outlinePath = await uploadDiagnostic(
        admin,
        jobId,
        'outline.json',
        outlineBody,
        'application/json',
      );
      bytesOut += byteLength(outlineBody);
    }
    if (typeof parseJson?.markdown === 'string' && parseJson.markdown.length) {
      markdownPath = await uploadDiagnostic(admin, jobId, 'document.md', parseJson.markdown, 'text/markdown');
      bytesOut += byteLength(parseJson.markdown);
    }

    const pageCount = Array.isArray(parseJson?.pages)
      ? parseJson.pages.length
      : (typeof parseJson?.page_count === 'number' ? parseJson.page_count : null);
    let effectiveMode = mode;
    if (shouldForcePixelPerfect(parseJson?.summary, pageCount, mode, requestPayload)) {
      effectiveMode = 'pixel_perfect';
      await appendAttempt(admin, jobId, {
        endpoint: 'dispatch',
        ok: true,
        event: 'mode_auto_selected',
        from_mode: mode,
        to_mode: effectiveMode,
        reason: 'ocr_pages_ratio_gt_0_3',
        ocr_page_ratio: ocrPageRatio(parseJson?.summary, pageCount),
      });
    }
    await updateJob(admin, jobId, {
      page_count: pageCount,
      pages_total: pageCount,
      pages_completed: 0,
      engine_version: parseJson?.engine_version ?? 'docling',
      mode: effectiveMode,
    });

    // Hybrid / pixel-perfect need page rasters; semantic skips this.
    // Phase C: stream page-by-page so the UI can show real progress.
    let rasterPath: string | null = null;
    const needRaster = effectiveMode === 'hybrid' || effectiveMode === 'pixel_perfect' || effectiveMode === 'pixel-perfect';
    if (needRaster && pageCount && pageCount > 0) {
      await setStage(admin, jobId, 'rastering');
      const dpi = (effectiveMode === 'pixel_perfect' || effectiveMode === 'pixel-perfect') ? 200 : 144;
      const format = 'png';
      const collected: any[] = [];
      let engineVersion: string | undefined;
      const rasterPageGroup = async (pageNos: number[]) => {
        let rasterJson: any = null;
        let rasterErr = '';
        for (let attempt = 1; attempt <= MAX_SIDECAR_ATTEMPTS; attempt++) {
          const attemptStarted = Date.now();
          try {
            const rasterRes = await fetch(`${PARSE_URL.replace(/\/$/, '')}/raster`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${PARSE_TOKEN}`,
                'X-Request-Id': jobId,
              },
              body: JSON.stringify({ url: signedUrl, dpi, format, pages: pageNos }),
            });
            const text = await rasterRes.text().catch(() => '');
            if (rasterRes.ok) {
              await appendAttempt(admin, jobId, {
                endpoint: '/raster',
                page_range: pageNos,
                attempt,
                status: rasterRes.status,
                ok: true,
                duration_ms: Date.now() - attemptStarted,
              });
              rasterJson = JSON.parse(text);
              break;
            }
            rasterErr = `sidecar /raster pages ${pageNos.join(',')} ${rasterRes.status}: ${text.slice(0, 500)}`;
            await appendAttempt(admin, jobId, { endpoint: '/raster', page_range: pageNos, attempt, status: rasterRes.status, ok: false, duration_ms: Date.now() - attemptStarted });
          } catch (e) {
            rasterErr = String((e as Error)?.message ?? e);
            await appendAttempt(admin, jobId, { endpoint: '/raster', page_range: pageNos, attempt, ok: false, error_code: 'fetch_exception', retryable: attempt < MAX_SIDECAR_ATTEMPTS, message: rasterErr.slice(0, 500), duration_ms: Date.now() - attemptStarted });
          }
          if (attempt === MAX_SIDECAR_ATTEMPTS) throw new Error(rasterErr);
          await new Promise((r) => setTimeout(r, [1000, 3000][attempt - 1] ?? 3000));
        }
        if (!rasterJson) throw new Error(rasterErr || `sidecar /raster pages ${pageNos.join(',')} failed`);
        return rasterJson;
      };

      // Wave F8: batched-parallel raster for ALL page counts. Previously a
      // ≤20-page hybrid run rasterised page-by-page and routinely blew past
      // the client poll window. Now we always run groups of 4 in parallel
      // batches of 3 groups (max 12 concurrent pages).
      const groups: number[][] = [];
      for (let pageNo = 1; pageNo <= pageCount; pageNo += 4) {
        groups.push(Array.from({ length: Math.min(4, pageCount - pageNo + 1) }, (_, i) => pageNo + i));
      }
      for (let i = 0; i < groups.length; i += 3) {
        const batch = groups.slice(i, i + 3);
        const results = await Promise.all(batch.map((g) => rasterPageGroup(g)));
        for (const rasterJson of results) {
          cloudRunMs += Number(rasterJson?.raster_ms) || 0;
          engineVersion = engineVersion ?? rasterJson?.engine_version;
          const pages = Array.isArray(rasterJson?.pages) ? rasterJson.pages : [];
          for (const page of pages) {
            collected.push({
              page_no: page.page_no ?? 0,
              width: page.width ?? page.width_px ?? 0,
              height: page.height ?? page.height_px ?? 0,
              image_base64: page.image_base64 ?? page.base64 ?? '',
            });
          }
        }
        await updateJob(admin, jobId, { pages_completed: Math.min(pageCount, batch.flat().at(-1) ?? 0) });
      }
      collected.sort((a, b) => Number(a.page_no) - Number(b.page_no));
      const normalizedRaster = { format, dpi, engine_version: engineVersion, pages: collected };
      const rasterBody = JSON.stringify(normalizedRaster);
      rasterPath = await uploadDiagnostic(
        admin,
        jobId,
        'rasters.json',
        rasterBody,
        'application/json',
      );
      bytesOut += byteLength(rasterBody);
    }

    await setStage(admin, jobId, 'finalizing');
    const finishedAt = Date.now();
    await updateJob(admin, jobId, {
      status: 'succeeded',
      stage: 'parsed',
      finished_at: new Date(finishedAt).toISOString(),
      duration_ms: finishedAt - startedAt,
      cloud_run_ms: cloudRunMs || null,
      bytes_in: bytesIn,
      bytes_out: bytesOut || null,
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
        summary: parseJson?.summary ?? null,
        mode: effectiveMode,
        requested_mode: mode,
        auto_mode_selected: effectiveMode !== mode,
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
      const expiresIn = Math.min(Math.max(Number(body.expires_in) || 300, 60), 300);
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

    if (operation === 'upload_source') {
      const b64 = typeof body.source_base64 === 'string' ? body.source_base64 : '';
      if (!b64) return json({ error: 'source_base64 required' }, 400);
      const clean = b64.includes(',') ? b64.split(',').pop()! : b64;
      const bin = atob(clean);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const hash = await sha256Hex(bytes);
      const filename = String(body.source_file_name || 'source.pdf').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80);
      const path = `pdf-import-sources/${hash}/${filename || 'source.pdf'}`;
      // Diagnostics bucket already allows application/pdf; the legacy
      // template-import-assets bucket is image-only on existing projects
      // and was rejecting "mime type application/pdf is not supported".
      await ensureDiagnosticsBucket(admin);
      const { error: upErr } = await admin.storage
        .from(DIAGNOSTICS_BUCKET)
        .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
      if (upErr) return json({ error: upErr.message }, 500);
      return json({ source_path: path, source_bucket: DIAGNOSTICS_BUCKET, source_file_hash: hash, bytes: bytes.byteLength });
    }

    if (operation === 'start') {
      const rawMode = (body.mode as string) ?? 'semantic';
      // DB CHECK uses 'pixel_perfect' (underscore); UI/API may pass 'pixel-perfect'.
      const mode = rawMode === 'pixel-perfect' ? 'pixel_perfect' : rawMode;
      const sourceFilePath = await sourceFingerprint(body);
      const idempotencyKey = typeof body.idempotency_key === 'string' && body.idempotency_key
        ? body.idempotency_key
        : await sha256Text(`${sourceFilePath}:${mode}:${ENGINE_VERSION_FAMILY}`);
      const existing = await findIdempotentJob(admin, userId as string | null, idempotencyKey);
      if (existing) {
        return json({
          job_id: existing.id,
          status: existing.status,
          stage: existing.stage,
          idempotency_key: idempotencyKey,
          idempotent_replay: true,
        });
      }
      await ensureDiagnosticsBucket(admin);
      const sourceRes = await resolveSignedSourceUrl(admin, body);
      if ('error' in sourceRes) return json({ error: sourceRes.error }, 400);


      const { data: jobRow, error: insertErr } = await admin
        .from('pdf_import_jobs')
        .insert({
          user_id: userId,
          template_id: body.template_id ?? null,
          source_file_path: sourceFilePath,
          source_file_name: body.source_file_name ?? null,
          source_file_size_bytes: body.source_file_size_bytes ?? null,
          source_file_hash: typeof body.source_file_hash === 'string' ? body.source_file_hash : null,
          engine: ENGINE,
          engine_version: ENGINE_VERSION_FAMILY,
          idempotency_key: idempotencyKey,
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
            description_tier: typeof body.description_tier === 'string' ? body.description_tier : 'on',
            include_markdown: body.include_markdown === false ? false : true,
            redact_pii: Boolean(body.redact_pii),
            pii_redaction_reason: typeof body.pii_redaction_reason === 'string' ? body.pii_redaction_reason.slice(0, 120) : null,
            allow_mode_override: body.allow_mode_override !== false,
          },
        })
        .select('id')
        .single();
      if (insertErr || !jobRow) {
        const replay = await findIdempotentJob(admin, userId as string | null, idempotencyKey);
        if (replay) {
          return json({
            job_id: replay.id,
            status: replay.status,
            stage: replay.stage,
            idempotency_key: idempotencyKey,
            idempotent_replay: true,
          });
        }
        return json({ error: insertErr?.message ?? 'job insert failed' }, 500);
      }

      // Fire-and-forget background processing.
      // @ts-expect-error EdgeRuntime is provided by Supabase's Deno runtime.
      EdgeRuntime.waitUntil(runJob(admin, jobRow.id, sourceRes.url, mode, sourceRes.cleanup, {
        hash: typeof body.source_file_hash === 'string' ? body.source_file_hash : null,
        size: Number(body.source_file_size_bytes) || null,
      }));

      return json({ job_id: jobRow.id, status: 'queued', idempotency_key: idempotencyKey });
    }

    return json({ error: `unknown operation: ${operation}` }, 400);
  } catch (e) {
    console.error('[pdf-parse-dispatch] unhandled', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
