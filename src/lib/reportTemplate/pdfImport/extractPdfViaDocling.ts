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
const FINALIZATION_POLL_INTERVAL_MS = 2500;
const FINALIZATION_POLL_TIMEOUT_MS = 20 * 60_000;
const TERMINAL_STATUS = new Set(['succeeded', 'failed', 'cancelled']);
const DIAGNOSTICS_BUCKET = 'pdf-import-diagnostics';

async function invokeImport(body: any) {
  const { data, error } = await invokeSecureFunction('template-import-pdf', body, { timeoutMs: 300_000 });
  if (error) throw new Error(describeAuthError(error.message) ?? error.message ?? 'template-import-pdf failed');
  if (data?.error) throw new Error(describeAuthError(String(data.error)) ?? String(data.error));
  return data;
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

async function downloadUrl(path: string): Promise<string | null> {
  const { data, error } = await invokeSecureFunction(
    'pdf-parse-dispatch',
    { operation: 'download', path },
    { timeoutMs: 30_000 },
  );
  if (error) return null;
  return (data as { signed_url?: string } | null)?.signed_url ?? null;
}


interface TemplateImportStatusRow {
  id: string;
  status: string;
  page_count: number | null;
  created_template_id: string | null;
  error: string | null;
  source_filename?: string | null;
  meta?: Record<string, any> | null;
}

async function waitForTemplateFinalization(
  importId: string,
  onProgress: (progress: ImportProgress) => void,
): Promise<TemplateImportStatusRow> {
  const started = Date.now();

  while (Date.now() - started < FINALIZATION_POLL_TIMEOUT_MS) {
    const statusRes = await invokeImport({
      operation: 'get_status',
      import_id: importId,
    });

    const record = statusRes?.record as TemplateImportStatusRow | undefined;
    if (!record) {
      throw new Error('Template finalization status response was empty.');
    }

    const meta = record.meta ?? {};
    const finalizationStatus = typeof meta.finalization_status === 'string'
      ? meta.finalization_status
      : record.status;

    onProgress({
      phase: 'finalizing',
      totalPages: record.page_count ?? undefined,
      message: `Finalizing template… (${finalizationStatus})`,
    });

    if (record.status === 'completed' && record.created_template_id) {
      return record;
    }

    if (record.status === 'failed' || record.status === 'cancelled') {
      const detail = record.error
        ?? meta.finalization_error
        ?? meta.finalization_last_error
        ?? 'unknown finalization error';
      throw new Error(`Template finalization failed: ${detail}`);
    }

    await new Promise((resolve) => setTimeout(resolve, FINALIZATION_POLL_INTERVAL_MS));
  }

  throw new Error('Template finalization timed out while waiting for the async worker.');
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
  result_payload: { docling_path?: string; rasters_path?: string; rasters_manifest_path?: string; page_raster_paths?: string[]; legacy_rasters_path?: string; mode?: string; summary?: unknown; auto_mode_selected?: boolean } | null;
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

async function manifestToRastersByPage(payload: unknown): Promise<DoclingRasterByPage | undefined> {
  if (!payload || typeof payload !== 'object') return undefined;
  const pages = (payload as { pages?: Array<{ page_no?: number; width?: number; height?: number; path?: string }> }).pages;
  if (!Array.isArray(pages)) return undefined;

  const out: DoclingRasterByPage = {};
  for (const page of pages) {
    if (page?.page_no == null || !page.path) continue;
    const signedUrl = await downloadUrl(page.path);
    if (!signedUrl) continue;

    out[page.page_no] = {
      width: Number(page.width ?? 0),
      height: Number(page.height ?? 0),
      dataUrl: signedUrl,
    };
  }

  return Object.keys(out).length ? out : undefined;
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
    if (job.status !== 'succeeded') {
      throw new Error(
        `Docling job ${job.status}: ${job.error_code ?? 'unknown'} — ${job.error_text ?? ''}`.trim(),
      );
    }

    const doclingPath = job.result_payload?.docling_path ?? job.diagnostics_path;
    if (!doclingPath) throw new Error('Docling job did not produce a diagnostics path');

    const doclingDoc = await downloadJson<DoclingDocument>(doclingPath);
    if (!doclingDoc) throw new Error('Failed to download docling.json');
    if (job.result_payload?.summary && !doclingDoc.summary) {
      doclingDoc.summary = job.result_payload.summary as DoclingDocument['summary'];
    }

    const rasterManifestPayload = job.result_payload?.rasters_manifest_path
      ? await downloadJson<unknown>(job.result_payload.rasters_manifest_path)
      : null;
    const rasters = rasterManifestPayload
      ? await manifestToRastersByPage(rasterManifestPayload)
      : job.result_payload?.rasters_path
        ? rastersByPage(await downloadJson<unknown>(job.result_payload.rasters_path))
        : undefined;

    const effectiveMode = wireModeToDocling(job.result_payload?.mode, mode);
    onProgress({
      phase: 'finalizing',
      message: job.result_payload?.auto_mode_selected
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
        diagnosticsPath: doclingPath,
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

    await invokeImport({
      operation: 'stage_artifacts',
      import_id: importId,
      schema: template,
      page_count: totalPages,
      source_filename: file.name,
      source_checksum: sourceChecksum,
      cdir,
      cdir_fidelity: cdirFidelity,
      import_manifests: {
        pdf_import_job: {
          job_id: jobId,
          engine_version: job.engine_version ?? 'docling',
          diagnostics_path: doclingPath,
          rasters_manifest_path: job.result_payload?.rasters_manifest_path ?? null,
          page_raster_paths: job.result_payload?.page_raster_paths ?? [],
          mode: effectiveMode,
          page_count: totalPages,
        },
      },
    });

    onProgress({
      phase: 'finalizing',
      totalPages,
      message: 'Template artifacts staged. Starting async finalization…',
    });

    await invokeImport(options.targetTemplateId
      ? {
          operation: 'start_finalize',
          import_id: importId,
          mode: 'resync',
          template_id: options.targetTemplateId,
          page_count: totalPages,
          source_filename: file.name,
          note: `Re-synced from ${file.name} (docling)`,
        }
      : {
          operation: 'start_finalize',
          import_id: importId,
          mode: 'finalize',
          name: options.templateName ?? file.name.replace(/\.pdf$/i, ''),
          page_count: totalPages,
          source_filename: file.name,
        });

    const finalRecord = await waitForTemplateFinalization(importId, onProgress);

    onProgress({ phase: 'done', totalPages });
    const textBlocks = plan.pages.reduce(
      (acc, p) => acc + p.overlays.filter((o) => o.type === 'text').length, 0);
    const images = plan.pages.reduce(
      (acc, p) => acc + p.overlays.filter((o) => o.type === 'image').length, 0);

    return {
      template: {
        id: finalRecord.created_template_id ?? options.targetTemplateId ?? importId,
        name: options.templateName ?? file.name.replace(/\.pdf$/i, ''),
      },
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
    const message = (err as Error).message ?? String(err);
    const asyncFinalizationError =
      message.startsWith('Template finalization failed:') ||
      message.startsWith('Template finalization timed out');
    if (!asyncFinalizationError) {
      await invokeImport({
        operation: 'fail',
        import_id: importId,
        error: message,
      }).catch(() => {});
    }
    throw err;
  }
}
