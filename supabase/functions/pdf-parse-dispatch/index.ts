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
const ENGINE_VERSION_FAMILY = 'docling-2.14.0+phaseD+waveD+waveG';
const MAX_SIDECAR_ATTEMPTS = 3;

// Wave G chunked thresholds. <=20 pages → monolithic /parse callback.
// 21–60 → 10-page chunks. >60 → 5-page chunks. OCR-heavy halves the size.
const CHUNK_MONOLITHIC_MAX = 20;
const CHUNK_SIZE_MEDIUM = 10;
const CHUNK_SIZE_LARGE = 5;
const STUCK_PARSING_MINUTES = 15;

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

const DIAGNOSTICS_ALLOWED_MIME = [
  'application/json',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/markdown',
  'text/plain',
  'text/html',
  'application/octet-stream',
];

async function ensureDiagnosticsBucket(admin: Admin) {
  const { data } = await admin.storage.getBucket(DIAGNOSTICS_BUCKET);
  if (!data) {
    const { error } = await admin.storage.createBucket(DIAGNOSTICS_BUCKET, {
      public: false,
      fileSizeLimit: 52428800,
      allowedMimeTypes: DIAGNOSTICS_ALLOWED_MIME,
    });
    if (error) console.error('[pdf-parse-dispatch] ensureDiagnosticsBucket create failed', error);
    return;
  }
  // Bucket already exists — ensure the markdown/text mime types are whitelisted so
  // Docling's `document.md` / `doctags.md` artifacts can be uploaded.
  const current = (data as any).allowed_mime_types as string[] | null | undefined;
  const missing = DIAGNOSTICS_ALLOWED_MIME.some((m) => !current?.includes(m));
  if (missing) {
    const { error } = await admin.storage.updateBucket(DIAGNOSTICS_BUCKET, {
      public: false,
      fileSizeLimit: 52428800,
      allowedMimeTypes: DIAGNOSTICS_ALLOWED_MIME,
    });
    if (error) console.error('[pdf-parse-dispatch] ensureDiagnosticsBucket update failed', error);
  }
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

// ---------------------------------------------------------------------------
// Wave G — chunked pipeline planning and dispatch.
// ---------------------------------------------------------------------------
interface SourceDescriptor {
  kind: 'storage' | 'url';
  bucket?: string;
  path?: string;
  url?: string;
}

interface PlanResult {
  page_count: number;
  scanned_page_ratio: number;
  ocr_hint: boolean;
  byte_size: number;
}

async function callSidecarPlan(signedUrl: string, jobId: string): Promise<PlanResult | null> {
  try {
    const res = await fetch(`${PARSE_URL.replace(/\/$/, '')}/plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PARSE_TOKEN}`,
        'X-Request-Id': jobId,
      },
      body: JSON.stringify({ url: signedUrl }),
    });
    if (!res.ok) {
      console.warn('[pdf-parse-dispatch] /plan returned', res.status);
      return null;
    }
    return await res.json() as PlanResult;
  } catch (e) {
    console.warn('[pdf-parse-dispatch] /plan exception', e);
    return null;
  }
}

function planChunks(pageCount: number, ocrHint: boolean): Array<{ page_start: number; page_end: number }> {
  if (pageCount <= 0) return [];
  let size = pageCount <= CHUNK_MONOLITHIC_MAX
    ? pageCount
    : pageCount <= 60
      ? CHUNK_SIZE_MEDIUM
      : CHUNK_SIZE_LARGE;
  // OCR-heavy PDFs: halve the chunk size to keep memory + runtime per request safe.
  if (ocrHint && size > 2) size = Math.max(2, Math.floor(size / 2));
  const ranges: Array<{ page_start: number; page_end: number }> = [];
  for (let s = 1; s <= pageCount; s += size) {
    ranges.push({ page_start: s, page_end: Math.min(pageCount, s + size - 1) });
  }
  return ranges;
}

async function dispatchChunkToSidecar(
  admin: Admin,
  jobId: string,
  chunk: { id: string; chunk_index: number; page_start: number; page_end: number; attempts: number },
  signedUrl: string,
  mode: string,
  requestPayload: Record<string, unknown>,
): Promise<boolean> {
  await admin.from('pdf_import_chunks').update({
    status: 'dispatched',
    attempts: (chunk.attempts ?? 0) + 1,
    dispatched_at: new Date().toISOString(),
  }).eq('id', chunk.id);
  const body = {
    job_id: jobId,
    chunk_id: chunk.id,
    chunk_index: chunk.chunk_index,
    page_start: chunk.page_start,
    page_end: chunk.page_end,
    url: signedUrl,
    mode,
    callback_url: `${SUPABASE_URL}/functions/v1/pdf-parse-chunk-callback`,
    callback_token: PARSE_TOKEN,
    enable_picture_description: requestPayload?.description_tier !== 'off',
    include_doctags: true,
    include_markdown: requestPayload?.include_markdown !== false,
    redact_pii: Boolean(requestPayload?.redact_pii),
    raster_dpi: (mode === 'pixel_perfect' || mode === 'pixel-perfect') ? 200 : 144,
    raster_format: 'png',
  };
  try {
    const res = await fetch(`${PARSE_URL.replace(/\/$/, '')}/parse-chunk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PARSE_TOKEN}`,
        'X-Request-Id': jobId,
      },
      body: JSON.stringify(body),
    });
    if (res.status !== 202) {
      const text = await res.text().catch(() => '');
      console.error('[pdf-parse-dispatch] /parse-chunk non-202', { jobId, chunkIndex: chunk.chunk_index, status: res.status, text: text.slice(0, 300) });
      await admin.from('pdf_import_chunks').update({
        status: 'failed',
        error_code: `dispatch_http_${res.status}`,
        error_text: text.slice(0, 500),
      }).eq('id', chunk.id);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[pdf-parse-dispatch] /parse-chunk exception', e);
    await admin.from('pdf_import_chunks').update({
      status: 'failed',
      error_code: 'dispatch_exception',
      error_text: String((e as Error)?.message ?? e).slice(0, 500),
    }).eq('id', chunk.id);
    return false;
  }
}

async function runChunkedDispatch(
  admin: Admin,
  jobId: string,
  signedUrl: string,
  mode: string,
  pageCount: number,
  ocrHint: boolean,
  requestPayload: Record<string, unknown>,
): Promise<void> {
  const ranges = planChunks(pageCount, ocrHint);
  if (!ranges.length) {
    throw new Error(`chunk plan produced no ranges (pageCount=${pageCount})`);
  }
  await updateJob(admin, jobId, {
    chunked: true,
    chunks_total: ranges.length,
    pages_total: pageCount,
    page_count: pageCount,
  });
  const inserts = ranges.map((r, i) => ({
    job_id: jobId,
    chunk_index: i + 1,
    page_start: r.page_start,
    page_end: r.page_end,
    status: 'pending',
  }));
  const { data: chunkRows, error } = await admin
    .from('pdf_import_chunks')
    .insert(inserts)
    .select('id, chunk_index, page_start, page_end, attempts');
  if (error || !chunkRows) {
    throw new Error(`chunk insert failed: ${error?.message ?? 'unknown'}`);
  }
  // Dispatch in chunk_index order. Sidecar runs concurrently; Cloud Run scales.
  for (const c of chunkRows as any[]) {
    await dispatchChunkToSidecar(admin, jobId, c, signedUrl, mode, requestPayload);
  }
}

async function runJob(
  admin: Admin,
  jobId: string,
  signedUrl: string,
  mode: string,
  cleanup?: () => Promise<void>,
  knownSource?: { hash?: string | null; size?: number | null },
  source?: SourceDescriptor,
) {
  const startedAt = Date.now();
  let bytesIn: number | null = null;
  let chunkedRan = false;
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

    const requestPayload = ((await admin
      .from('pdf_import_jobs')
      .select('request_payload')
      .eq('id', jobId)
      .maybeSingle()).data?.request_payload ?? {}) as Record<string, unknown>;

    // ---- Wave G: planning (page count + OCR hint) --------------------------
    await setStage(admin, jobId, 'planning');
    const plan = await callSidecarPlan(signedUrl, jobId);
    const planRecord: Record<string, unknown> = plan ?? {};
    if (source) planRecord.source = source;
    await updateJob(admin, jobId, { plan_payload: planRecord });

    const forceChunked = requestPayload?.force_chunked === true;
    const useChunked = forceChunked || (plan && plan.page_count > CHUNK_MONOLITHIC_MAX);

    if (useChunked && plan) {
      // ---- Chunked path -----------------------------------------------------
      await setStage(admin, jobId, 'parsing');
      await appendAttempt(admin, jobId, {
        endpoint: '/parse-chunk',
        kind: 'chunked_plan',
        page_count: plan.page_count,
        ocr_hint: plan.ocr_hint,
      });
      await runChunkedDispatch(admin, jobId, signedUrl, mode, plan.page_count, plan.ocr_hint, requestPayload);
      await updateJob(admin, jobId, { bytes_in: bytesIn });
      chunkedRan = true;
      return;
    }

    // ---- Wave F-Option-3: monolithic callback dispatch (small docs) -------
    await setStage(admin, jobId, 'parsing');
    const descriptionTier = (requestPayload?.description_tier as string) ?? 'on';
    const includeMarkdown = requestPayload?.include_markdown === false ? false : true;
    const allowModeOverride = requestPayload?.allow_mode_override !== false;
    const rasterDpi = (mode === 'pixel_perfect' || mode === 'pixel-perfect') ? 200 : 144;

    const parseBody: Record<string, unknown> = {
      url: signedUrl,
      include_doctags: true,
      include_markdown: includeMarkdown,
      redact_pii: Boolean(requestPayload?.redact_pii),
      callback_url: `${SUPABASE_URL}/functions/v1/pdf-parse-callback`,
      callback_token: PARSE_TOKEN,
      job_id: jobId,
      mode,
      raster_dpi: rasterDpi,
      raster_format: 'png',
      allow_mode_override: allowModeOverride,
    };
    if (descriptionTier !== 'off') parseBody.enable_picture_description = true;

    const TRANSIENT = new Set([408, 429, 500, 502, 503, 504, 522, 524]);
    let dispatched = false;
    let lastErr = '';
    for (let attempt = 1; attempt <= MAX_SIDECAR_ATTEMPTS; attempt++) {
      const attemptStarted = Date.now();
      try {
        const parseRes = await fetch(`${PARSE_URL.replace(/\/$/, '')}/parse`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${PARSE_TOKEN}`,
            'X-Request-Id': jobId,
          },
          body: JSON.stringify(parseBody),
        });
        const text = await parseRes.text().catch(() => '');
        if (parseRes.status === 202) {
          await appendAttempt(admin, jobId, { endpoint: '/parse', attempt, status: 202, ok: true, duration_ms: Date.now() - attemptStarted, mode: 'callback' });
          dispatched = true;
          break;
        }
        let retryable = TRANSIENT.has(parseRes.status);
        let errorCode = `http_${parseRes.status}`;
        try {
          const errJson = JSON.parse(text);
          if (typeof errJson?.retryable === 'boolean') retryable = errJson.retryable;
          if (typeof errJson?.error_code === 'string') errorCode = errJson.error_code;
        } catch (_ignored) { /* non-JSON */ }
        lastErr = `sidecar /parse ${parseRes.status}: ${text.slice(0, 500)}`;
        await appendAttempt(admin, jobId, { endpoint: '/parse', attempt, status: parseRes.status, ok: false, error_code: errorCode, retryable, duration_ms: Date.now() - attemptStarted });
        if (!retryable || attempt === MAX_SIDECAR_ATTEMPTS) throw new Error(lastErr);
      } catch (e) {
        lastErr = String((e as Error)?.message ?? e);
        if (!lastErr.startsWith('sidecar /parse')) {
          await appendAttempt(admin, jobId, { endpoint: '/parse', attempt, ok: false, error_code: 'fetch_exception', retryable: attempt < MAX_SIDECAR_ATTEMPTS, message: lastErr.slice(0, 500), duration_ms: Date.now() - attemptStarted });
        }
        if (attempt === MAX_SIDECAR_ATTEMPTS) throw new Error(lastErr);
      }
      const delay = [2000, 5000][attempt - 1] ?? 5000;
      await new Promise((r) => setTimeout(r, delay));
    }
    if (!dispatched) throw new Error(lastErr || 'sidecar /parse dispatch failed');
    await updateJob(admin, jobId, { stage: 'parsing', bytes_in: bytesIn });
  } catch (err) {
    const finishedAt = Date.now();
    console.error('[pdf-parse-dispatch] dispatch failed', { jobId, err });
    await updateJob(admin, jobId, {
      status: 'failed',
      stage: 'failed',
      finished_at: new Date(finishedAt).toISOString(),
      duration_ms: finishedAt - startedAt,
      error_code: 'sidecar_dispatch_error',
      error_text: String((err as Error)?.message ?? err).slice(0, 2000),
    });
  } finally {
    if (cleanup) await cleanup().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Stuck-job recovery — invoked manually (admin) or by a cron schedule.
// ---------------------------------------------------------------------------
async function recoverStuckJobs(admin: Admin): Promise<{ requeued: number; failed: number; jobs: Array<{ job_id: string; action: string }> }> {
  const cutoff = new Date(Date.now() - STUCK_PARSING_MINUTES * 60_000).toISOString();
  const results: Array<{ job_id: string; action: string }> = [];
  let requeued = 0;
  let failed = 0;

  // Monolithic stuck (Option-3 path with no callback after N minutes).
  const { data: monolithicStuck } = await admin
    .from('pdf_import_jobs')
    .select('id, stage_started_at, chunked, plan_payload, mode, request_payload')
    .eq('status', 'parsing')
    .eq('chunked', false)
    .lt('stage_started_at', cutoff)
    .limit(25);
  for (const row of (monolithicStuck as any[]) ?? []) {
    await updateJob(admin, row.id, {
      status: 'recoverable_failed',
      stage: 'failed',
      error_code: 'callback_failed',
      error_text: `monolithic parse exceeded ${STUCK_PARSING_MINUTES}m without callback`,
      finished_at: new Date().toISOString(),
    });
    results.push({ job_id: row.id, action: 'mark_recoverable_failed' });
    failed++;
  }

  // Chunked stuck — re-dispatch any 'dispatched'/'parsing' chunks past cutoff.
  const { data: stuckChunks } = await admin
    .from('pdf_import_chunks')
    .select('id, job_id, chunk_index, page_start, page_end, attempts, max_attempts, status, last_event_at')
    .in('status', ['dispatched', 'parsing'])
    .lt('last_event_at', cutoff)
    .limit(100);
  // Group by job for re-dispatch.
  const byJob = new Map<string, any[]>();
  for (const c of (stuckChunks as any[]) ?? []) {
    if (!byJob.has(c.job_id)) byJob.set(c.job_id, []);
    byJob.get(c.job_id)!.push(c);
  }
  for (const [jobId, chunks] of byJob) {
    const { data: job } = await admin
      .from('pdf_import_jobs')
      .select('mode, request_payload, plan_payload')
      .eq('id', jobId)
      .maybeSingle();
    const plan = ((job as any)?.plan_payload ?? {}) as Record<string, unknown>;
    const src = (plan?.source ?? {}) as SourceDescriptor;
    let signedUrl: string | null = null;
    if (src.kind === 'storage' && src.bucket && src.path) {
      const { data } = await admin.storage.from(src.bucket).createSignedUrl(src.path, 1200);
      signedUrl = data?.signedUrl ?? null;
    } else if (src.kind === 'url' && src.url) {
      signedUrl = src.url;
    }
    if (!signedUrl) {
      for (const c of chunks) {
        await admin.from('pdf_import_chunks').update({
          status: 'fatal',
          error_code: 'source_fetch_error',
          error_text: 'could not re-sign source for stuck recovery',
        }).eq('id', c.id);
        failed++;
        results.push({ job_id: jobId, action: 'fatal_no_source' });
      }
      continue;
    }
    const mode = (job as any)?.mode ?? 'semantic';
    const requestPayload = ((job as any)?.request_payload ?? {}) as Record<string, unknown>;
    for (const c of chunks) {
      if ((c.attempts ?? 0) >= (c.max_attempts ?? 3)) {
        await admin.from('pdf_import_chunks').update({
          status: 'fatal',
          error_code: 'chunk_retry_exhausted',
        }).eq('id', c.id);
        failed++;
        results.push({ job_id: jobId, action: 'fatal_max_attempts' });
        continue;
      }
      const ok = await dispatchChunkToSidecar(admin, jobId, c, signedUrl, mode, requestPayload);
      results.push({ job_id: jobId, action: ok ? 'redispatched' : 'redispatch_failed' });
      if (ok) requeued++;
      else failed++;
    }
  }
  return { requeued, failed, jobs: results };
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
