/**
 * Docling-backed PDF importer.
 *
 * Mirrors `extractPdfToTemplate`'s return contract so it can be a drop-in
 * replacement when `feature_flags.pdf_import.engine` resolves to `'docling'`
 * (see `src/lib/featureFlags/pdfImportEngine.ts`).
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
import type { ImportOptions, ImportResult } from './extractPdfToTemplate';
import { supabase } from '@/integrations/supabase/client';
import { invokeSecureFunction, describeAuthError } from '@/lib/secureInvoke';
import { reportTemplateToCdir } from '@/lib/reportTemplate/ingestion/cdir';
import { buildCdirFidelityReport } from '@/lib/reportTemplate/ingestion/fidelity';
import { applyTemplateImportPlan } from '@/lib/reportTemplate/ingestion/reconciliation/applyPlan';
import { mapDoclingToPagePlan, type DoclingPlanMode } from './docling/mapDoclingToPagePlan';
import type {
  DoclingDocument,
  DoclingPageRasterEntry,
  DoclingRasterByPage,
} from './docling/doclingTypes';

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 5 * 60_000;
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
  const { data, error } = await supabase.storage.from(DIAGNOSTICS_BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) return null;
  const res = await fetch(data.signedUrl);
  if (!res.ok) return null;
  return (await res.json()) as T;
}

interface JobRow {
  id: string;
  status: string;
  stage: string | null;
  page_count: number | null;
  duration_ms: number | null;
  engine_version: string | null;
  diagnostics_path: string | null;
  error_code: string | null;
  error_text: string | null;
  result_payload: { docling_path?: string; rasters_path?: string; mode?: string } | null;
}

async function pollJob(
  jobId: string,
  onProgress?: ImportOptions['onProgress'],
): Promise<JobRow> {
  const start = Date.now();
  let lastStage: string | null = null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('pdf_import_jobs')
      .select('id,status,stage,page_count,duration_ms,engine_version,diagnostics_path,error_code,error_text,result_payload')
      .eq('id', jobId)
      .maybeSingle();
    if (error) throw new Error(`pdf_import_jobs read failed: ${error.message}`);
    if (data) {
      const row = data as JobRow;
      if (row.stage && row.stage !== lastStage) {
        lastStage = row.stage;
        onProgress?.({
          phase: row.stage === 'rastering' ? 'rasterizing'
            : row.stage === 'finalizing' ? 'finalizing'
            : row.stage === 'parsed' ? 'finalizing'
            : 'extracting',
          message: `Docling: ${row.stage}`,
        });
      }
      if (TERMINAL_STATUS.has(row.status)) return row;
    }
    if (Date.now() - start > POLL_TIMEOUT_MS) {
      throw new Error('Docling parse timed out after 5 minutes');
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

function rastersByPage(payload: unknown): DoclingRasterByPage | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const pages = (payload as { pages?: DoclingPageRasterEntry[] }).pages;
  if (!Array.isArray(pages)) return undefined;
  const out: DoclingRasterByPage = {};
  for (const p of pages) {
    if (p?.page_no != null) out[p.page_no] = p;
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
    onProgress({ phase: 'uploading', message: 'Sending PDF to Docling…' });
    const base64 = bytesToBase64(new Uint8Array(buf));

    const { data: dispatchRes, error: dispatchErr } = await invokeSecureFunction(
      'pdf-parse-dispatch',
      {
        operation: 'start',
        mode: modeToWire(mode),
        source_base64: base64,
        source_file_name: file.name,
        source_file_size_bytes: file.size,
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

    const rasterPayload = job.result_payload?.rasters_path
      ? await downloadJson<unknown>(job.result_payload.rasters_path)
      : null;
    const rasters = rasterPayload ? rastersByPage(rasterPayload) : undefined;

    onProgress({ phase: 'finalizing', message: 'Mapping Docling → template…' });
    const plan = mapDoclingToPagePlan(doclingDoc, {
      importId,
      mode,
      rastersByPage: rasters,
      engineVersion: job.engine_version ?? 'docling',
    });

    const template = applyTemplateImportPlan(plan, {
      templateName: options.templateName ?? file.name.replace(/\.pdf$/i, ''),
    });

    const cdir = reportTemplateToCdir(template, {
      kind: 'pdf',
      checksum: sourceChecksum,
      filename: file.name,
    });
    const cdirFidelity = buildCdirFidelityReport(cdir, { expectedText: [], expectedBounds: [] });
    const totalPages = job.page_count ?? template.pages.length;

    const finRes = options.targetTemplateId
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
        semanticPages: mode === 'pixel-perfect' ? 0 : totalPages,
        rasterizedPages: mode === 'semantic' ? 0 : totalPages,
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
