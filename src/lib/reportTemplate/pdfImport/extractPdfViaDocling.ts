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
} from './docling/doclingTypes';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 20 * 60_000; // Wave F8: bumped from 10→20m to absorb Cloud Run cold-start + hybrid raster runs.
// `recoverable_failed` is terminal-for-this-attempt but should surface as a
// retry-friendly error rather than a hard failure.
const TERMINAL_STATUS = new Set(['succeeded', 'failed', 'cancelled', 'recoverable_failed']);
const DIAGNOSTICS_BUCKET = 'pdf-import-diagnostics';

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
  return {
    doclingPath: pickStr('docling_path') ?? job.diagnostics_path ?? null,
    rastersPath: pickStr('rasters_path'),
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

async function downloadJson<T>(path: string): Promise<T | null> {
  // Sign via the dispatcher — the anon client can't sign URLs on the private
  // diagnostics bucket under our custom-auth model.
  const { data, error } = await invokeSecureFunction(
    'pdf-parse-dispatch',
    { operation: 'download', path },
    { timeoutMs: 30_000 },
  );
  if (error) return null;
  const signed = (data as { signed_url?: string } | null)?.signed_url;
  if (!signed) return null;
  const res = await fetch(signed);
  if (!res.ok) return null;
  return (await res.json()) as T;
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
  result_payload: { docling_path?: string; rasters_path?: string; markdown_path?: string; outline_path?: string; doctags_path?: string; mode?: string; summary?: unknown; auto_mode_selected?: boolean } | null;
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

    // TEMP: Do not embed raster base64/data URLs into the template schema —
    // they blow up the resync payload and cause `template-import-pdf` upstream
    // timeouts. Raster references are still persisted in `template.meta.pdfImport`
    // (rastersPath) so pixel-perfect rendering can rehydrate them lazily.
    const shouldEmbedRasters = false;
    const rasterPayload =
      shouldEmbedRasters && artifacts.rastersPath
        ? await downloadJson<unknown>(artifacts.rastersPath)
        : null;
    const rasters = rasterPayload ? rastersByPage(rasterPayload) : undefined;

    let doclingDoc = artifacts.doclingPath ? await downloadJson<DoclingDocument>(artifacts.doclingPath) : null;
    if (!doclingDoc) {
      if (effectiveMode === 'pixel-perfect' && rasters && Object.keys(rasters).length > 0) {
        // Pixel-perfect only needs raster backgrounds. Synthesize a minimal
        // DoclingDocument so the page-plan mapper still emits one page per
        // raster (with no editable overlays — exactly what pixel-perfect wants).
        const pages: Record<string, { page_no: number; size: { width: number; height: number } }> = {};
        for (const [pageNoStr, r] of Object.entries(rasters)) {
          const pageNo = Number(pageNoStr);
          pages[String(pageNo)] = { page_no: pageNo, size: { width: r.width, height: r.height } };
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


    const template = applyTemplateImportPlan(plan, {
      templateName: options.templateName ?? file.name.replace(/\.pdf$/i, ''),
    });
    template.meta = {
      ...(template.meta ?? {}),
      pdfImport: {
        engine: 'docling',
        engineVersion: job.engine_version ?? 'docling',
        mode: effectiveMode,
        diagnosticsPath: artifacts.doclingPath,
        rastersPath: artifacts.rastersPath ?? null,
        markdownPath: artifacts.markdownPath ?? null,
        outlinePath: artifacts.outlinePath ?? null,
        doctagsPath: artifacts.doctagsPath ?? null,
        jobId,
        importedAt: new Date().toISOString(),
      },
    };
    const schemaValidation = validateReconstructedSchema(template);
    if (!schemaValidation.ok) {
      throw new Error(`Docling reconstructed schema failed validation: ${schemaValidation.errors.join('; ')}`);
    }

    const cdir = reportTemplateToCdir(template, {
      kind: 'pdf',
      checksum: sourceChecksum,
      filename: file.name,
    });
    // Phase 3: Feed real text and bounds expectations into CDIR fidelity so
    // `textAccuracy` and `medianPositionDrift` are measured against the
    // source Docling document instead of empty arrays.
    const doclingExpectations = buildDoclingExpectations(doclingDoc);
    const cdirFidelity = buildCdirFidelityReport(cdir, doclingExpectations);
    const totalPages = job.page_count ?? template.pages.length;

    // Payload diagnostics — guard against the resync timeout we hit when
    // raster data leaked into the schema. If something starts re-embedding
    // base64/data URLs, fail fast with a clear message instead of waiting
    // for an upstream timeout.
    const schemaJson = JSON.stringify(template);
    const cdirJson = JSON.stringify(cdir);
    const fidelityJson = JSON.stringify(cdirFidelity);
    const schemaBytes = new TextEncoder().encode(schemaJson).length;
    const cdirBytes = new TextEncoder().encode(cdirJson).length;
    const fidelityBytes = new TextEncoder().encode(fidelityJson).length;
    const schemaHasDataImage = schemaJson.includes('data:image');
    const schemaHasBase64 = /;base64,/.test(schemaJson);
    console.log('[docling] resync payload sizes', {
      schemaBytes,
      cdirBytes,
      fidelityBytes,
      schemaHasDataImage,
      schemaHasBase64,
    });
    const MAX_PAYLOAD_BYTES = 50 * 1024 * 1024;
    if (schemaBytes > MAX_PAYLOAD_BYTES || schemaHasDataImage || schemaHasBase64) {
      throw new Error(
        `Refusing to resync: schema payload too heavy (schemaBytes=${schemaBytes}, dataImage=${schemaHasDataImage}, base64=${schemaHasBase64}). Raster data must stay in storage references, not embedded in the schema.`,
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
