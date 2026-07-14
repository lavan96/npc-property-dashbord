/**
 * Quality-gated finalization (implementation-plan Part 1, Phases 6–7).
 *
 * Runs the source-vs-template visual diff + deterministic repair loop INLINE
 * during the Docling import, BEFORE the template is finalized — turning the
 * importer from "it parsed" into "it passed quality control". The gate:
 *   1. Renders the reconstructed template (the SAME renderer the editor uses)
 *      and diffs it against the source page rasters Docling produced.
 *   2. Runs the page-scoped deterministic repair loop (max 2 passes) on pages
 *      that score in the repair band.
 *   3. Decides a recommended final mode from the aggregate score and flags the
 *      import for manual review when it stays weak.
 *
 * Hard rule: this NEVER throws. Visual QA is browser-coupled (html2canvas) and
 * best-effort — any failure returns a `ran: false` result and the caller
 * finalizes the un-repaired template exactly as before. The gate must not be
 * able to brick an import.
 */
import type { ReportTemplate } from '../templateSchema';
import type { CdirDocument } from '../ingestion/cdir';
import { buildImportReviewDraft } from '../ingestion/review';
import {
  runVisualRepairOrchestrationPipeline,
  imageUrlToImageData,
  QUALITY_THRESHOLDS,
  PAGE_CONTEXT_RENDER_ARTIFACT_MANIFEST_VERSION,
  type PageContextRenderArtifactManifest,
  type SourceRenderPageRaster,
  type VisualImportFinalMode,
  type RunVisualRepairOrchestrationPipelineOptions,
  type VisualRepairOrchestrationPipelineResult,
} from '../ingestion/visualQuality';
import type { DoclingRasterByPage } from './docling/doclingTypes';
import type { DoclingPlanMode } from './docling/mapDoclingToPagePlan';

export const IMPORT_QUALITY_GATE_VERSION = 'import-quality-gate-v1';

/**
 * Above this page count the inline gate is skipped: rendering + diffing every
 * page with html2canvas is too slow/memory-heavy to block a large import on.
 * Large docs still get on-demand Visual QA from the review UI.
 */
export const DEFAULT_QUALITY_GATE_MAX_PAGES = 40;

export interface ImportQualityGatePageVerdict {
  pageNumber: number;
  score: number;
  recommendedAction: string;
}

export interface ImportQualityGateSummary {
  version: typeof IMPORT_QUALITY_GATE_VERSION;
  ran: boolean;
  skippedReason?: string;
  error?: string;
  requestedMode: DoclingPlanMode;
  recommendedFinalMode: DoclingPlanMode;
  overallScore: number | null;
  initialScore: number | null;
  finalScore: number | null;
  scoreDelta: number | null;
  repairStatus: string | null;
  repairPassesApplied: number;
  patchesApplied: number;
  manualReviewRequired: boolean;
  pageCount: number;
  pagesNeedingReview: number;
  perPage: ImportQualityGatePageVerdict[];
  warningCount: number;
  ranAt: string;
}

export interface RunImportQualityGateResult {
  /** Possibly-repaired template to finalize. Same object identity as input when the gate did not run. */
  template: ReportTemplate;
  /** Mode recommendation for the review UI. The staged template's actual mode is unchanged. */
  recommendedFinalMode: DoclingPlanMode;
  repairPassesApplied: number;
  manualReviewRequired: boolean;
  summary: ImportQualityGateSummary;
}

export interface RunImportQualityGateOptions {
  importId: string;
  template: ReportTemplate;
  cdir: CdirDocument;
  requestedMode: DoclingPlanMode;
  /** Source page rasters keyed by page number (from Docling /raster or the manifest). */
  rastersByPage?: DoclingRasterByPage;
  maxRepairPasses?: number;
  maxRasterDim?: number;
  maxPages?: number;
  /** Injectable (tests / server): data-URL → ImageData. */
  imageUrlToImageDataImpl?: (url: string, opts?: { maxPixelDim?: number }) => Promise<ImageData>;
  /** Injectable (tests): the visual-repair orchestration. */
  runOrchestrationImpl?: (
    options: RunVisualRepairOrchestrationPipelineOptions,
  ) => Promise<VisualRepairOrchestrationPipelineResult>;
  now?: () => Date;
}

function toVisualFinalMode(mode: DoclingPlanMode): VisualImportFinalMode {
  return mode;
}

/**
 * Downgrade-only mode recommendation. We never auto-mutate the staged
 * template's page backgrounds (that would require re-running the plan mapper),
 * so this is advisory — surfaced to the review UI's force-mode controls. A weak
 * semantic import is nudged to hybrid (keep the source raster); anything below
 * the hybrid-fallback floor is nudged to pixel-perfect.
 */
export function recommendFinalMode(requested: DoclingPlanMode, score: number | null): DoclingPlanMode {
  if (requested === 'pixel-perfect') return 'pixel-perfect';
  if (score === null || !Number.isFinite(score)) return requested;
  if (score < QUALITY_THRESHOLDS.fallbackToHybrid) return 'pixel-perfect';
  if (score < QUALITY_THRESHOLDS.repair && requested === 'semantic') return 'hybrid';
  return requested;
}

function skippedSummary(
  options: RunImportQualityGateOptions,
  skippedReason: string,
  extra: Partial<ImportQualityGateSummary> = {},
): ImportQualityGateSummary {
  const now = options.now ?? (() => new Date());
  return {
    version: IMPORT_QUALITY_GATE_VERSION,
    ran: false,
    skippedReason,
    requestedMode: options.requestedMode,
    recommendedFinalMode: options.requestedMode,
    overallScore: null,
    initialScore: null,
    finalScore: null,
    scoreDelta: null,
    repairStatus: null,
    repairPassesApplied: 0,
    patchesApplied: 0,
    manualReviewRequired: false,
    pageCount: options.cdir?.pages?.length ?? 0,
    pagesNeedingReview: 0,
    perPage: [],
    warningCount: 0,
    ranAt: now().toISOString(),
    ...extra,
  };
}

function skippedResult(
  options: RunImportQualityGateOptions,
  skippedReason: string,
  extra?: Partial<ImportQualityGateSummary>,
): RunImportQualityGateResult {
  return {
    template: options.template,
    recommendedFinalMode: options.requestedMode,
    repairPassesApplied: 0,
    manualReviewRequired: false,
    summary: skippedSummary(options, skippedReason, extra),
  };
}

async function buildSourceRasters(
  rastersByPage: DoclingRasterByPage,
  imageUrlToImageDataImpl: NonNullable<RunImportQualityGateOptions['imageUrlToImageDataImpl']>,
  maxPixelDim: number,
): Promise<SourceRenderPageRaster[]> {
  const out: SourceRenderPageRaster[] = [];
  for (const [key, raster] of Object.entries(rastersByPage)) {
    const pageNumber = Number(key);
    if (!Number.isFinite(pageNumber) || pageNumber < 1) continue;
    if (!raster?.dataUrl) continue;
    try {
      const imageData = await imageUrlToImageDataImpl(raster.dataUrl, { maxPixelDim });
      out.push({
        pageId: `docling-page-${pageNumber}`,
        pageNumber,
        imageData,
        signedUrl: null,
        storagePath: null,
      });
    } catch {
      // A single unreadable raster shouldn't abort the whole gate.
    }
  }
  return out.sort((a, b) => a.pageNumber - b.pageNumber);
}

function buildManifest(
  importId: string,
  pageCount: number,
  sourceRasters: SourceRenderPageRaster[],
  now: () => Date,
): PageContextRenderArtifactManifest {
  return {
    version: PAGE_CONTEXT_RENDER_ARTIFACT_MANIFEST_VERSION,
    importId,
    source: 'pdfPageContexts',
    sourceContext: 'legacy_docling',
    expectedPageCount: pageCount,
    observedPageCount: sourceRasters.length,
    sourceRasterCount: sourceRasters.length,
    doclingPageArtifactCount: 0,
    problems: [],
    pages: sourceRasters.map((raster) => ({
      pageId: raster.pageId,
      pageNumber: raster.pageNumber,
      sourceRasterPath: raster.storagePath ?? null,
      sourceRasterSignedUrl: raster.signedUrl ?? null,
      doclingPath: null,
      blocksPath: null,
      tablesPath: null,
      picturesPath: null,
      summaryPath: null,
      width: raster.imageData?.width ?? null,
      height: raster.imageData?.height ?? null,
      hasParentGlobalArtifacts: false,
    })),
    generatedAt: now().toISOString(),
  };
}

/**
 * Run the inline quality gate. Fail-open: on any error or missing prerequisite
 * this returns the original template unchanged with a `ran: false` summary.
 */
export async function runImportQualityGate(
  options: RunImportQualityGateOptions,
): Promise<RunImportQualityGateResult> {
  const now = options.now ?? (() => new Date());
  try {
    const rastersByPage = options.rastersByPage ?? {};
    const rasterCount = Object.keys(rastersByPage).length;
    const pageCount = options.cdir?.pages?.length ?? 0;
    const maxPages = options.maxPages ?? DEFAULT_QUALITY_GATE_MAX_PAGES;

    if (rasterCount === 0) return skippedResult(options, 'no_source_rasters');
    if (pageCount === 0) return skippedResult(options, 'no_cdir_pages');
    if (pageCount > maxPages) {
      return skippedResult(options, 'page_count_exceeds_gate_limit', { pageCount });
    }
    if (typeof document === 'undefined' && !options.runOrchestrationImpl) {
      // Real capture needs a browser; without an injected impl there is nothing to run.
      return skippedResult(options, 'no_browser_render_context');
    }

    const imageUrlToImageDataImpl = options.imageUrlToImageDataImpl ?? imageUrlToImageData;
    const maxRasterDim = options.maxRasterDim ?? 1024;
    const sourceRasters = await buildSourceRasters(rastersByPage, imageUrlToImageDataImpl, maxRasterDim);
    if (sourceRasters.length === 0) return skippedResult(options, 'source_rasters_unreadable');

    const draft = buildImportReviewDraft({
      id: options.importId,
      cdir: options.cdir,
      template: options.template,
      artifacts: [],
      now,
    });

    const loaded = {
      record: { id: options.importId, created_template_id: null as string | null },
      draft,
      renderArtifactManifest: buildManifest(options.importId, pageCount, sourceRasters, now),
    };

    const runOrchestration = options.runOrchestrationImpl ?? runVisualRepairOrchestrationPipeline;
    const result = await runOrchestration({
      loaded,
      sourceRasters,
      templateId: null,
      finalMode: toVisualFinalMode(options.requestedMode),
      persistVisualQa: false,
      maxRasterDim,
      maxRepairPasses: options.maxRepairPasses ?? 2,
      captureOptions: { maxPages },
    });

    const summaryData = result.summary;
    const finalReport = result.repair.finalReport;
    const finalScore = Number.isFinite(summaryData.finalScore) ? summaryData.finalScore : null;
    const initialScore = Number.isFinite(summaryData.visualQaScore) ? summaryData.visualQaScore : null;
    const recommendedFinalMode = recommendFinalMode(options.requestedMode, finalScore);

    const perPage: ImportQualityGatePageVerdict[] = (finalReport.pages ?? []).map((page) => ({
      pageNumber: page.pageNumber,
      score: page.overallScore,
      recommendedAction: page.recommendedAction,
    }));
    const pagesNeedingReview = perPage.filter(
      (page) => page.score < QUALITY_THRESHOLDS.acceptWithWarnings,
    ).length;
    const warningCount = (finalReport.pages ?? []).reduce(
      (sum, page) => sum + (page.warnings?.length ?? 0),
      0,
    );
    const manualReviewRequired = Boolean(summaryData.requiresManualReview)
      || finalReport.manualReviewRequired
      || (finalScore !== null && finalScore < QUALITY_THRESHOLDS.repair);

    const summary: ImportQualityGateSummary = {
      version: IMPORT_QUALITY_GATE_VERSION,
      ran: true,
      requestedMode: options.requestedMode,
      recommendedFinalMode,
      overallScore: finalScore,
      initialScore,
      finalScore,
      scoreDelta: Number.isFinite(summaryData.scoreDelta) ? summaryData.scoreDelta : null,
      repairStatus: summaryData.repairStatus ?? null,
      repairPassesApplied: summaryData.passesAttempted ?? 0,
      patchesApplied: summaryData.totalApplied ?? 0,
      manualReviewRequired,
      pageCount,
      pagesNeedingReview,
      perPage,
      warningCount,
      ranAt: now().toISOString(),
    };

    return {
      template: result.draft.template ?? options.template,
      recommendedFinalMode,
      repairPassesApplied: summary.repairPassesApplied,
      manualReviewRequired,
      summary,
    };
  } catch (error) {
    return skippedResult(options, 'gate_error', { error: (error as Error).message });
  }
}
