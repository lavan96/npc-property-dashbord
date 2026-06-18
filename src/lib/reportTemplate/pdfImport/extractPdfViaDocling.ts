/**
 * Docling-backed PDF importer.
 *
 * Produces the canonical template PDF import result contract.
 *
 * Pipeline:
 *   1. `template-import-pdf` → create_import (gives us an importId + audit row).
 *   2. Upload PDF bytes to the dispatcher as base64 (the dispatcher signs &
 *      forwards a URL to the Cloud Run Docling sidecar).
 *   3. Poll `pdf_import_jobs` until status ∈ {succeeded, failed, cancelled}.
 *   4. Download the resulting `docling.json` (+ optional `rasters.json`) via
 *      signed URLs from the `pdf-import-diagnostics` bucket.
 *   5. Map to `TemplateImportPlan` (`mapDoclingToPagePlan`), convert to a
 *      `ReportTemplate` via `applyTemplateImportPlan`, and finalize through
 *      `template-import-pdf` so downstream UI sees a normal template.
 */
import type { ImportOptions, ImportProgress, ImportResult } from './types';
import { supabase } from '@/integrations/supabase/client';
import { invokeSecureFunction, describeAuthError } from '@/lib/secureInvoke';
import { reportTemplateToCdir } from '@/lib/reportTemplate/ingestion/cdir';
import { buildCdirFidelityReport } from '@/lib/reportTemplate/ingestion/fidelity';
import { applyTemplateImportPlan } from '@/lib/reportTemplate/ingestion/reconciliation/applyPlan';
import { validateReconstructedSchema } from '@/lib/reportTemplate/referenceImport';
import { mapDoclingToPagePlan, type DoclingPlanMode } from './docling/mapDoclingToPagePlan';
import { buildDoclingExpectations } from './docling/buildDoclingExpectations';
import type {
  DoclingDocument,
  DoclingRasterByPage,
  DoclingRasterResponse,
  RasterManifest,
} from './docling/doclingTypes';
import { downloadRasterManifest } from './rasterArtifactRefs';

/**
 * Phase 3 compatibility flag — keep `false` so legacy base64 `rasters.json` is
 * NEVER auto-loaded into the schema. Toggle only for one-off debug sessions.
 */
const allowLegacyRastersJson = false;


const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 20 * 60_000; // Wave F8: bumped from 10→20m to absorb Cloud Run cold-start + hybrid raster runs.
// `recoverable_failed` is terminal-for-this-attempt but should surface as a
// retry-friendly error rather than a hard failure.
const TERMINAL_STATUS = new Set(['succeeded', 'failed', 'cancelled', 'recoverable_failed']);
const DIAGNOSTICS_BUCKET = 'pdf-import-diagnostics';

/**
 * Recursively strip embedded raster/image bytes from any value. Removes
 * dataUrl / image_base64 / imageBase64 / base64 keys, strings starting with
 * `data:image`, and src/url strings starting with `data:`. Used before
 * resync/finalize to keep the template-import-pdf payload lightweight.
 */
function stripEmbeddedImageData<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => stripEmbeddedImageData(item))
      .filter((item) => item !== null && item !== undefined) as T;
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey === 'dataurl' ||
        lowerKey === 'image_base64' ||
        lowerKey === 'imagebase64' ||
        lowerKey === 'base64'
      ) {
        continue;
      }
      if (typeof raw === 'string') {
        const lowerValue = raw.slice(0, 256).toLowerCase();
        if (
          lowerValue.startsWith('data:image') ||
          raw.includes('data:image') ||
          ((lowerKey === 'src' || lowerKey === 'url') && lowerValue.startsWith('data:'))
        ) {
          continue;
        }
      }
      out[key] = stripEmbeddedImageData(raw);
    }
    return out as T;
  }

  if (typeof value === 'string' && value.includes('data:image')) {
    return null as unknown as T;
  }

  return value;
}

function inspectEmbeddedImageData(value: unknown) {
  const json = JSON.stringify(value);
  return {
    bytes: new Blob([json]).size,
    dataImage: json.includes('data:image'),
    base64: /base64[,":]/i.test(json) || json.includes('image_base64'),
  };
}

async function invokeImport(body: any) {
  const { data, error } = await invokeSecureFunction('template-import-pdf', body, { timeoutMs: 300_000 });
  if (error) throw new Error(describeAuthError(error.message) ?? error.message ?? 'template-import-pdf failed');
  if (data?.error) {
    const msg = String(data.error);
    if (/^unknown operation/i.test(msg)) {
      // Cryptic on its own — tell the caller which op the deployed function rejected.
      throw new Error(`template-import-pdf rejected operation "${body?.operation}" (${msg}). Redeploy the edge function.`);
    }
    throw new Error(describeAuthError(msg) ?? msg);
  }
  return data;
}

/**
 * Normalize the dispatcher / sidecar `result_payload` into a single artifacts
 * record. All paths are optional — pixel-perfect runs may carry only
 * `rasters_path`, semantic runs may carry only `docling_path` + `markdown_path`.
 * Falls back to `job.diagnostics_path` for backwards compatibility with the
 * Wave G chunked pipeline (which writes there first and `result_payload` later).
 */
function normalizeArtifacts(job: JobRow) {
  const payload = (job.result_payload ?? {}) as Record<string, unknown>;
  const pickStr = (k: string): string | null => {
    const v = payload[k];
    return typeof v === 'string' && v.length > 0 ? v : null;
  };
  const payloadArr = (k: string): string[] => {
    const v = payload[k];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  };
  return {
    doclingPath: pickStr('docling_path') ?? job.diagnostics_path ?? null,
    // Legacy `rasters.json` (may contain base64). Never embedded by default.
    legacyRastersPath: pickStr('legacy_rasters_path') ?? pickStr('rasters_path'),
    // Phase 3 — lightweight Storage-backed manifest.
    rastersManifestPath: pickStr('rasters_manifest_path'),
    pageRasterPaths: payloadArr('page_raster_paths'),
    markdownPath: pickStr('markdown_path'),
    outlinePath: pickStr('outline_path'),
    doctagsPath: pickStr('doctags_path'),
    pageCount: typeof payload.page_count === 'number' ? payload.page_count : null,
    requestedMode: pickStr('requested_mode') ?? pickStr('mode'),
    summary: payload.summary,
    autoModeSelected: payload.auto_mode_selected === true,
  };
}


async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', buf.slice(0));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `unverified-${buf.byteLength}`;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}

function modeToDocling(mode: ImportOptions['mode']): DoclingPlanMode {
  if (mode === 'pixel') return 'pixel-perfect';
  if (mode === 'hybrid') return 'hybrid';
  // 'semantic' or 'ocr' → docling has no OCR concept; semantic is the closest
  // since the sidecar already OCRs scanned pages internally.
  return 'semantic';
}

function modeToWire(mode: DoclingPlanMode): string {
  return mode === 'pixel-perfect' ? 'pixel_perfect' : mode;
}

async function downloadJson<T>(path: string): Promise<T> {
  console.info('[PDF_IMPORT_DEBUG] requesting signed artifact URL', { path });

  const { data, error } = await invokeSecureFunction(
    'pdf-parse-dispatch',
    { operation: 'download', path },
    { timeoutMs: 30_000 },
  );

  if (error) {
    throw new Error(
      `pdf-parse-dispatch download invoke failed for ${path}: ${
        describeAuthError(error.message) ?? error.message ?? 'unknown invoke error'
      }`,
    );
  }

  const payload = data as {
    signed_url?: string;
    signedUrl?: string;
    error?: string;
    details?: unknown;
    function?: string;
    received_operation?: string;
    received_keys?: string[];
  } | null;

  if (payload?.error) {
    throw new Error(
      `pdf-parse-dispatch download failed for ${path}: ${payload.error}${
        payload.details ? ` details=${JSON.stringify(payload.details)}` : ''
      }${payload.function ? ` function=${payload.function}` : ''}${
        payload.received_operation ? ` received_operation=${payload.received_operation}` : ''
      }${payload.received_keys ? ` received_keys=${payload.received_keys.join(',')}` : ''}`,
    );
  }

  const signedUrl = payload?.signed_url ?? payload?.signedUrl;

  if (!signedUrl) {
    throw new Error(
      `pdf-parse-dispatch download returned no signed_url for ${path}. Response keys: ${
        payload ? Object.keys(payload).join(', ') : 'null'
      }`,
    );
  }

  console.info('[PDF_IMPORT_DEBUG] fetching signed artifact URL', {
    path,
    signedUrlPrefix: signedUrl.slice(0, 80),
  });

  const res = await fetch(signedUrl);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Signed artifact fetch failed for ${path}: HTTP ${res.status} ${res.statusText}. ${text.slice(0, 500)}`,
    );
  }

  try {
    return (await res.json()) as T;
  } catch (e) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Signed artifact JSON parse failed for ${path}: ${(e as Error).message}. Body preview: ${text.slice(0, 300)}`,
    );
  }
}

/**
 * Resolve a Storage object path to a short-lived signed URL via the
 * `pdf-parse-dispatch { operation: 'download' }` edge function. Returns the
 * `signed_url` (or `null` on failure) — unlike `downloadJson`, it does NOT
 * fetch the body, so it's used to point a renderer at a page raster without
 * pulling the bytes through the app.
 */
async function downloadUrl(path: string): Promise<string | null> {
  const { data, error } = await invokeSecureFunction(
    'pdf-parse-dispatch',
    { operation: 'download', path },
    { timeoutMs: 30_000 },
  );

  if (error) {
    console.warn('[PDF_IMPORT_DEBUG] downloadUrl invoke failed', {
      path,
      error: describeAuthError(error.message) ?? error.message ?? 'unknown invoke error',
    });
    return null;
  }

  const payload = data as { signed_url?: string; signedUrl?: string; error?: string } | null;
  if (payload?.error) {
    console.warn('[PDF_IMPORT_DEBUG] downloadUrl returned error', { path, error: payload.error });
    return null;
  }

  return payload?.signed_url ?? payload?.signedUrl ?? null;
}

/**
 * Phase 3 — resolve a downloaded `rasters-manifest.json` into a page-keyed map
 * whose `dataUrl` is a freshly signed Storage URL (NEVER base64). Each page's
 * `path` is signed on demand via `downloadUrl`; pages that fail to sign are
 * skipped so one bad page can't abort the whole import.
 */
async function manifestToRastersByPage(manifest: RasterManifest): Promise<DoclingRasterByPage> {
  const out: DoclingRasterByPage = {};
  for (const page of manifest.pages ?? []) {
    if (page?.page_no == null) continue;
    const signedUrl = await downloadUrl(page.path);
    if (!signedUrl) {
      console.warn('[PDF_IMPORT_DEBUG] manifest page sign skipped', {
        pageNo: page.page_no,
        path: page.path,
      });
      continue;
    }
    out[page.page_no] = {
      width: page.width,
      height: page.height,
      dataUrl: signedUrl,
    };
  }
  return out;
}

interface JobRow {
  id: string;
  status: string;
  stage: string | null;
  page_count: number | null;
  pages_completed?: number | null;
  pages_total?: number | null;
  duration_ms: number | null;
  engine_version: string | null;
  diagnostics_path: string | null;
  error_code: string | null;
  error_text: string | null;
  result_payload: {
    docling_path?: string;
    doctags_path?: string;
    outline_path?: string;
    markdown_path?: string;
    rasters_path?: string;
    legacy_rasters_path?: string;
    rasters_manifest_path?: string;
    page_raster_paths?: string[];
    mode?: string;
    requested_mode?: string;
    summary?: unknown;
    auto_mode_selected?: boolean;
    page_count?: number;
  } | null;

  attempts?: Array<{ endpoint?: string; ok?: boolean; status?: number; attempt?: number; error_code?: string; retryable?: boolean; message?: string } | unknown> | null;
}

function stageToPhase(stage: string | null): ImportProgress['phase'] {
  switch (stage) {
    case 'rastering':
    case 'rasterizing':
      return 'rasterizing';
    case 'finalizing':
    case 'parsed':
    case 'persisting':
      return 'finalizing';
    case 'hashing':
    case 'queued':
    case 'cache_hit':
      return 'uploading';
    default:
      return 'extracting';
  }
}

function stageLabel(stage: string | null): string {
  if (!stage) return 'Working…';
  switch (stage) {
    case 'queued': return 'Queued';
    case 'hashing': return 'Hashing source';
    case 'parsing': return 'Docling parsing';
    case 'persisting': return 'Saving Docling output';
    case 'rastering':
    case 'rasterizing':
      return 'Rasterising pages';
    case 'finalizing': return 'Finalising';
    case 'parsed': return 'Done';
    case 'cache_hit': return 'Cache hit — reusing prior parse';
    default: return stage;
  }
}

function latestSidecarWarning(attempts: JobRow['attempts']): string | null {
  if (!Array.isArray(attempts)) return null;
  for (let i = attempts.length - 1; i >= 0; i--) {
    const a = attempts[i] as any;
    if (!a || a.ok) continue;
    const ep = a.endpoint ?? 'sidecar';
    const status = a.status ? ` ${a.status}` : '';
    const reason = a.message ? ` — ${String(a.message).slice(0, 160)}` : '';
    const retry = a.retryable === false ? ' (giving up)' : ' (retrying)';
    return `${ep}${status}${retry}${reason}`;
  }
  return null;
}

async function pollJob(
  jobId: string,
  onProgress?: ImportOptions['onProgress'],
): Promise<JobRow> {
  const start = Date.now();
  let lastStage: string | null = null;
  let lastPages = -1;
  let lastWarning: string | null = null;
  let consecutiveErrors = 0;
  let lastError: string | null = null;
  // Poll via `pdf-parse-dispatch { operation: 'status' }` rather than direct
  // table reads — the table is RLS-scoped to `auth.uid()`, which is null under
  // our custom session tokens, so direct selects would silently return zero
  // rows and the import would always time out.
  const MAX_CONSECUTIVE_ERRORS = 8;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await invokeSecureFunction(
      'pdf-parse-dispatch',
      { operation: 'status', job_id: jobId },
      { timeoutMs: 30_000 },
    );
    if (error || (data as any)?.error) {
      consecutiveErrors += 1;
      lastError = error?.message ?? String((data as any)?.error ?? 'unknown');
      console.warn(`[docling] status read failed (attempt ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${lastError}`);
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        throw new Error(`pdf-parse-dispatch status failed after ${consecutiveErrors} retries: ${lastError}`);
      }
      await new Promise((r) => setTimeout(r, Math.min(1000 * consecutiveErrors, 5000)));
    } else {
      consecutiveErrors = 0;
      const row = (data as { job?: JobRow } | null)?.job;
      if (row) {
        const pages = row.pages_completed ?? 0;
        const total = row.pages_total ?? row.page_count ?? null;
        const warning = latestSidecarWarning(row.attempts);
        const stageChanged = row.stage !== lastStage;
        const pagesChanged = pages !== lastPages;
        const warningChanged = warning !== lastWarning;
        if (stageChanged || pagesChanged || warningChanged) {
          lastStage = row.stage;
          lastPages = pages;
          lastWarning = warning;
          onProgress?.({
            phase: stageToPhase(row.stage),
            stage: row.stage,
            page: pages || undefined,
            totalPages: total ?? undefined,
            pagesCompleted: pages,
            pagesTotal: total,
            warning,
            message: `${stageLabel(row.stage)}${total ? ` · ${pages}/${total} pages` : ''}`,
          });
        }
        if (TERMINAL_STATUS.has(row.status)) return row;
      }
    }
    if (Date.now() - start > POLL_TIMEOUT_MS) {
      throw new Error(`Docling parse timed out after ${Math.round(POLL_TIMEOUT_MS / 60_000)} minutes (last stage: ${lastStage ?? 'unknown'})`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}


function wireModeToDocling(mode: string | null | undefined, fallback: DoclingPlanMode): DoclingPlanMode {
  if (mode === 'pixel_perfect' || mode === 'pixel-perfect') return 'pixel-perfect';
  if (mode === 'hybrid') return 'hybrid';
  if (mode === 'semantic') return 'semantic';
  return fallback;
}

function rastersByPage(payload: unknown): DoclingRasterByPage | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const env = payload as DoclingRasterResponse;
  const pages = env.pages;
  if (!Array.isArray(pages)) return undefined;
  const mime = env.format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const out: DoclingRasterByPage = {};
  for (const p of pages) {
    if (p?.page_no == null) continue;
    out[p.page_no] = {
      width: p.width,
      height: p.height,
      dataUrl: `data:${mime};base64,${p.image_base64}`,
    };
  }
  return out;
}

export async function extractPdfViaDocling(
  file: File,
  options: ImportOptions,
): Promise<ImportResult> {
  const onProgress = options.onProgress ?? (() => {});
  const mode = modeToDocling(options.mode);

  onProgress({ phase: 'reading', message: 'Reading PDF…' });
  const buf = await file.arrayBuffer();
  const sourceChecksum = `sha256:${await sha256Hex(buf)}`;

  const createRes = await invokeImport({
    operation: 'create_import',
    user_id: options.userId ?? null,
    fidelity_mode: options.mode,
    source_filename: file.name,
    source_size_bytes: file.size,
    page_count: null,
    meta: { source_checksum: sourceChecksum, engine: 'docling', docling_mode: mode },
  });
  const importId: string = createRes.record.id;

  try {
    onProgress({ phase: 'uploading', message: 'Uploading PDF source…' });
    const base64 = bytesToBase64(new Uint8Array(buf));
    const { data: uploadRes, error: uploadErr } = await invokeSecureFunction(
      'pdf-parse-dispatch',
      {
        operation: 'upload_source',
        source_base64: base64,
        source_file_name: file.name,
      },
      { timeoutMs: 120_000 },
    );
    if (uploadErr) throw new Error(uploadErr.message ?? 'pdf-parse-dispatch upload_source failed');
    const uploaded = uploadRes as { source_path?: string; source_bucket?: string; source_file_hash?: string } | null;
    if (!uploaded?.source_path) throw new Error('pdf-parse-dispatch upload_source did not return a source_path');

    onProgress({ phase: 'uploading', message: 'Starting Docling job…' });
    const { data: dispatchRes, error: dispatchErr } = await invokeSecureFunction(
      'pdf-parse-dispatch',
      {
        operation: 'start',
        mode: modeToWire(mode),
        source_path: uploaded.source_path,
        source_bucket: uploaded.source_bucket,
        source_file_hash: uploaded.source_file_hash,
        source_file_name: file.name,
        source_file_size_bytes: file.size,
        redact_pii: Boolean(options.redactPii),
        pii_redaction_reason: options.redactPii ? 'finance_pdf_import' : null,
        description_tier: 'on',
        include_markdown: true,
      },
      { timeoutMs: 120_000 },
    );
    if (dispatchErr) throw new Error(dispatchErr.message ?? 'pdf-parse-dispatch start failed');
    const jobId = (dispatchRes as { job_id?: string } | null)?.job_id;
    if (!jobId) throw new Error('pdf-parse-dispatch did not return a job_id');

    onProgress({ phase: 'extracting', message: 'Docling parsing…' });
    const job = await pollJob(jobId, onProgress);
    if (job.status === 'recoverable_failed') {
      // Distinct retry-able failure — the dispatcher's stuck-job recovery may
      // re-dispatch the same job_id; surface a message the dialog can offer
      // a retry against rather than burying it as a hard error.
      throw new Error(
        `Docling job is recoverable (will be retried by the dispatcher). last_stage=${job.stage ?? 'unknown'}; ${job.error_code ?? ''} ${job.error_text ?? ''}`.trim(),
      );
    }
    if (job.status !== 'succeeded') {
      throw new Error(
        `Docling job ${job.status} (stage=${job.stage ?? 'unknown'}): ${job.error_code ?? 'unknown'} — ${job.error_text ?? ''}`.trim(),
      );
    }

    // Per the spec — status=succeeded + stage=parsed is the success contract.
    // result_payload may carry any subset of artifact paths; do not require
    // docling.json for pixel-perfect when rasters are present.
    const artifacts = normalizeArtifacts(job);
    const effectiveMode = wireModeToDocling(artifacts.requestedMode, mode);

    // Phase 3 — prefer Storage-backed raster manifest over legacy rasters.json.
    // The manifest only contains paths + metadata; per-page PNGs are signed on
    // demand at render time via `getArtifactSignedUrl`. Legacy `rasters.json`
    // (which may contain base64) is only loaded when an explicit compatibility
    // flag is set and is NEVER persisted into the template schema.
    let rasterManifest: RasterManifest | null = null;
    if (artifacts.rastersManifestPath) {
      try {
        rasterManifest = await downloadRasterManifest(artifacts.rastersManifestPath);
      } catch (e) {
        console.warn('[PDF_IMPORT_DEBUG] raster manifest download failed', {
          path: artifacts.rastersManifestPath,
          error: (e as Error).message,
        });
      }
    }

    let rasterPayload: unknown | null = null;
    if (allowLegacyRastersJson && artifacts.legacyRastersPath) {
      try {
        rasterPayload = await downloadJson<unknown>(artifacts.legacyRastersPath);
      } catch (e) {
        console.warn('[PDF_IMPORT_DEBUG] optional legacy raster download skipped', {
          path: artifacts.legacyRastersPath,
          error: (e as Error).message,
        });
      }
    }
    // Build the page-keyed raster map the mapper uses for backgrounds + sizing.
    // Prefer the Phase 3 manifest: each page resolves to a signed Storage URL
    // (no base64) via `manifestToRastersByPage`. Only fall back to the legacy
    // base64 `rasters.json` when the compatibility flag is on.
    let rasters: DoclingRasterByPage | undefined;
    if (rasterManifest) {
      try {
        rasters = await manifestToRastersByPage(rasterManifest);
      } catch (e) {
        console.warn('[PDF_IMPORT_DEBUG] manifest → rastersByPage failed', {
          error: (e as Error).message,
        });
      }
    }
    if (!rasters && rasterPayload) {
      rasters = rastersByPage(rasterPayload);
    }

    console.info('[PDF_IMPORT_DEBUG] downloading docling artifact', {
      jobId: job.id,
      doclingPath: artifacts.doclingPath,
      rastersManifestPath: artifacts.rastersManifestPath,
      pageRasterPathsCount: artifacts.pageRasterPaths.length,
      resultPayloadKeys: Object.keys(job.result_payload ?? {}),
    });

    let doclingDoc: DoclingDocument | null = null;
    if (artifacts.doclingPath) {
      try {
        doclingDoc = await downloadJson<DoclingDocument>(artifacts.doclingPath);
      } catch (e) {
        if (effectiveMode === 'pixel-perfect' && ((rasters && Object.keys(rasters).length > 0) || rasterManifest)) {
          console.warn('[PDF_IMPORT_DEBUG] docling download failed, falling back to raster-only pixel-perfect', {
            error: (e as Error).message,
          });
        } else {
          throw e;
        }
      }
    }
    if (!doclingDoc) {
      const manifestPages = rasterManifest?.pages ?? [];
      if (effectiveMode === 'pixel-perfect' && (manifestPages.length > 0 || (rasters && Object.keys(rasters).length > 0))) {
        const pages: Record<string, { page_no: number; size: { width: number; height: number } }> = {};
        if (manifestPages.length > 0) {
          for (const p of manifestPages) {
            pages[String(p.page_no)] = { page_no: p.page_no, size: { width: p.width, height: p.height } };
          }
        } else if (rasters) {
          for (const [pageNoStr, r] of Object.entries(rasters)) {
            const pageNo = Number(pageNoStr);
            pages[String(pageNo)] = { page_no: pageNo, size: { width: r.width, height: r.height } };
          }
        }
        doclingDoc = { pages, texts: [], tables: [], pictures: [] } as DoclingDocument;
      } else {
        throw new Error(
          `Failed to download docling.json (artifact=${artifacts.doclingPath ?? 'none'}). result_payload had keys: ${Object.keys(job.result_payload ?? {}).join(', ') || 'none'}`,
        );
      }
    }
    if (artifacts.summary && !doclingDoc.summary) {
      doclingDoc.summary = artifacts.summary as DoclingDocument['summary'];
    }

    onProgress({
      phase: 'finalizing',
      message: artifacts.autoModeSelected
        ? 'Mapping Docling → template (Pixel-Perfect selected for OCR-heavy PDF)…'
        : 'Mapping Docling → template…',
    });
    const plan = mapDoclingToPagePlan(doclingDoc, {
      importId,
      mode: effectiveMode,
      rastersByPage: rasters,
      engineVersion: job.engine_version ?? 'docling',
    });


    const rawTemplate = applyTemplateImportPlan(plan, {
      templateName: options.templateName ?? file.name.replace(/\.pdf$/i, ''),
    });

    // Sanitize: strip any embedded raster/image bytes that may have leaked into
    // the reconstructed schema. The template-import-pdf resync/finalize payload
    // must only reference storage paths, never embed data:image / base64 blobs.
    const template = stripEmbeddedImageData(rawTemplate);
    template.meta = {
      ...(template.meta ?? {}),
      pdfImport: {
        engine: 'docling',
        engineVersion: job.engine_version ?? 'docling',
        mode: effectiveMode,
        diagnosticsPath: artifacts.doclingPath,
        rastersPath: artifacts.legacyRastersPath ?? null,
        legacyRastersPath: artifacts.legacyRastersPath ?? null,
        rastersManifestPath: artifacts.rastersManifestPath ?? null,
        pageRasterPaths: artifacts.pageRasterPaths,
        markdownPath: artifacts.markdownPath ?? null,
        outlinePath: artifacts.outlinePath ?? null,
        doctagsPath: artifacts.doctagsPath ?? null,
        jobId,
        importedAt: new Date().toISOString(),
      },
    };

    // Phase 3 — attach per-page raster references (storage paths only). The
    // canvas/PDF renderer resolves them to signed URLs at render time and must
    // treat the background as locked (not selectable as a normal image layer).
    if (rasterManifest && effectiveMode !== 'semantic') {
      const refByPageNo = new Map<number, typeof rasterManifest.pages[number]>();
      for (const p of rasterManifest.pages) refByPageNo.set(p.page_no, p);
      template.pages.forEach((page, idx) => {
        const pageNo = idx + 1;
        const ref = refByPageNo.get(pageNo);
        if (!ref) return;
        (page as any).meta = {
          ...((page as any).meta ?? {}),
          sourceRasterRef: {
            kind: 'pdf_import_raster_ref' as const,
            jobId,
            manifestPath: artifacts.rastersManifestPath,
            pageNo,
            path: ref.path,
            width: ref.width,
            height: ref.height,
            mime: ref.mime,
            dpi: rasterManifest?.dpi ?? null,
          },
        };
      });
    }

    const schemaValidation = validateReconstructedSchema(template);
    if (!schemaValidation.ok) {
      throw new Error(`Docling reconstructed schema failed validation: ${schemaValidation.errors.join('; ')}`);
    }

    const cdir = stripEmbeddedImageData(
      reportTemplateToCdir(template, {
        kind: 'pdf',
        checksum: sourceChecksum,
        filename: file.name,
      }),
    );
    // Phase 3: Feed real text and bounds expectations into CDIR fidelity so
    // `textAccuracy` and `medianPositionDrift` are measured against the
    // source Docling document instead of empty arrays.
    const doclingExpectations = buildDoclingExpectations(doclingDoc);
    const cdirFidelity = stripEmbeddedImageData(buildCdirFidelityReport(cdir, doclingExpectations));
    const totalPages = job.page_count ?? template.pages.length;

    // Payload diagnostics — guard against the resync timeout we hit when
    // raster data leaks into the schema. After sanitization, dataImage and
    // base64 must both be false; otherwise fail fast with a clear message.
    const schemaInspection = inspectEmbeddedImageData(template);
    const cdirInspection = inspectEmbeddedImageData(cdir);
    const fidelityInspection = inspectEmbeddedImageData(cdirFidelity);
    console.info('[PDF_IMPORT_DEBUG] sanitized payload sizes', {
      schema: schemaInspection,
      cdir: cdirInspection,
      fidelity: fidelityInspection,
    });
    const MAX_PAYLOAD_BYTES = 50 * 1024 * 1024;
    if (
      schemaInspection.dataImage ||
      schemaInspection.base64 ||
      cdirInspection.dataImage ||
      cdirInspection.base64 ||
      fidelityInspection.dataImage ||
      fidelityInspection.base64
    ) {
      throw new Error(
        `Refusing to resync: sanitized payload still contains embedded image data ` +
        `(schemaBytes=${schemaInspection.bytes}, schemaDataImage=${schemaInspection.dataImage}, schemaBase64=${schemaInspection.base64}, ` +
        `cdirDataImage=${cdirInspection.dataImage}, cdirBase64=${cdirInspection.base64}). Raster data must stay in storage references.`,
      );
    }
    if (schemaInspection.bytes > MAX_PAYLOAD_BYTES) {
      throw new Error(
        `Refusing to resync: schema payload exceeds ${MAX_PAYLOAD_BYTES} bytes (schemaBytes=${schemaInspection.bytes}).`,
      );
    }


    // Per spec: when the underlying pdf_import_jobs row is already
    // `succeeded/parsed` and we have artifacts in hand, a downstream
    // template-import-pdf persistence failure (e.g. an older deployment
    // missing `resync`) must NOT mask the successful import. We attempt
    // persistence, but on `unknown operation`-style failures we fall back to
    // returning the loaded template + artifacts so the UI can render the job.
    let finRes: any;
    try {
      finRes = options.targetTemplateId
        ? await invokeImport({
            operation: 'resync',
            import_id: importId,
            template_id: options.targetTemplateId,
            schema: template,
            page_count: totalPages,
            source_filename: file.name,
            source_checksum: sourceChecksum,
            cdir,
            cdir_fidelity: cdirFidelity,
            note: `Re-synced from ${file.name} (docling)`,
          })
        : await invokeImport({
            operation: 'finalize',
            import_id: importId,
            name: options.templateName ?? file.name.replace(/\.pdf$/i, ''),
            schema: template,
            page_count: totalPages,
            source_filename: file.name,
            source_checksum: sourceChecksum,
            cdir,
            cdir_fidelity: cdirFidelity,
          });
    } catch (persistErr) {
      const msg = String((persistErr as Error)?.message ?? persistErr);
      const isUnknownOp = /unknown operation/i.test(msg);
      // Only swallow when we have a real target template to fall back onto.
      if (isUnknownOp && options.targetTemplateId) {
        console.warn(
          `[docling] persistence step rejected (${msg}). Job ${jobId} succeeded; ` +
          `returning loaded artifacts so the UI can render. Redeploy template-import-pdf to restore resync.`,
        );
        finRes = {
          template: {
            id: options.targetTemplateId,
            name: options.templateName ?? file.name.replace(/\.pdf$/i, ''),
          },
        };
      } else {
        throw persistErr;
      }
    }

    onProgress({ phase: 'done', totalPages });
    const textBlocks = plan.pages.reduce(
      (acc, p) => acc + p.overlays.filter((o) => o.type === 'text').length, 0);
    const images = plan.pages.reduce(
      (acc, p) => acc + p.overlays.filter((o) => o.type === 'image').length, 0);

    return {
      template: { id: finRes.template.id, name: finRes.template.name ?? options.templateName ?? file.name },
      importId,
      pageCount: totalPages,
      cdir,
      cdirFidelity,
      fidelityReport: {
        semanticPages: effectiveMode === 'pixel-perfect' ? 0 : totalPages,
        rasterizedPages: effectiveMode === 'semantic' ? 0 : totalPages,
        textBlocks,
        images,
        vectors: 0,
        fontsEmbedded: 0,
        fontsSubstituted: [],
      },
    };
  } catch (err) {
    await invokeImport({
      operation: 'fail',
      import_id: importId,
      error: (err as Error).message,
    }).catch(() => {});
    throw err;
  }
}
