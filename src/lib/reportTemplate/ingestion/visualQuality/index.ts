/**
 * Visual Import Quality Contract (Phase 2).
 *
 * Public entry point for the visual quality gate that sits on top of CDIR.
 * Phase 4 will produce the metrics; Phase 5 will persist them; Phase 6 will
 * drive the AI repair loop off `recommendedAction`.
 *
 * Consumers should import from this barrel, never the individual files:
 *
 *   import {
 *     scorePage,
 *     aggregateImportQuality,
 *     QUALITY_THRESHOLDS,
 *     type VisualImportQualityReport,
 *   } from '@/lib/reportTemplate/ingestion/visualQuality';
 */
export type {
  VisualImportFinalMode,
  VisualImportQualityReport,
  VisualPageQualityReport,
  VisualRecommendedAction,
  VisualWarning,
  VisualWarningSeverity,
} from './schema';

export {
  QUALITY_SCORE_WEIGHTS,
  QUALITY_THRESHOLDS,
  METRIC_WARNING_THRESHOLDS,
  recommendActionForScore,
  warningForMetric,
  type MetricKey,
  type QualityThresholdKey,
} from './thresholds';

export {
  computePageOverallScore,
  scorePage,
  aggregateImportQuality,
  countPagesNeedingReview,
  type PageMetricInput,
  type AggregateOptions,
} from './score';

export {
  loadVisualQuality,
  saveVisualQuality,
  imageDataToPngBase64,
  visualQualityPaths,
  type LoadVisualQualityResult,
  type PersistedVisualQuality,
  type SaveVisualQualityResult,
  type SaveVisualQualityOptions,
  type VisualQualityArtifactPaths,
  type VisualQualityPageRasters,
} from './persist';

// Phase 4 — visual diff harness
export {
  runVisualDiff,
  compareImages,
  buildDiffImage,
  measureTextCoverage,
  measureLayoutMetrics,
  flattenCdirLayerBounds,
  rasterizePdfPages,
  rasterizeFromHtmlImage,
  type VisualDiffInput,
  type RenderedPageRaster,
  type DoclingExpectationsLike,
  type ImageMetricsResult,
  type TextCoverageResult,
  type LayoutMetricsResult,
  type RasterisedPage,
  type RasterizePdfOptions,
} from './diff';

// Phase 6 — repair loop
export {
  runRepairLoop,
  applyPatch,
  applyPatches,
  doclingRepairSolver,
  type RunRepairLoopOptions,
  type ApplyPatchResult,
  type RepairOp,
  type RepairPatch,
  type RepairSolver,
  type RepairContext,
  type RepairPassReport,
  type RepairLoopResult,
} from './repair';


export {
  PAGE_CONTEXT_RENDER_ARTIFACT_MANIFEST_VERSION,
  buildPageContextRenderArtifactManifest,
  pageContextRenderManifestToReviewArtifacts,
  type PageContextRenderArtifactManifest,
  type PageContextSourceRenderArtifact,
} from './pageContextArtifacts';


export {
  GENERATED_RENDER_ARTIFACT_MANIFEST_VERSION,
  buildGeneratedRenderArtifactManifest,
  captureGeneratedTemplatePageRasters,
  generatedRenderRastersToReviewArtifacts,
  type CaptureGeneratedRenderOptions,
  type GeneratedRenderArtifactManifest,
  type GeneratedRenderArtifactPage,
  type GeneratedRenderPageRaster,
} from './generatedRenderCapture';


export {
  RENDER_DIFF_PERSISTENCE_VERSION,
  buildVisualQualityFromRenderPairs,
  imageUrlToImageData,
  loadSourceRastersFromManifest,
  pairSourceAndGeneratedRasters,
  persistRenderDiffVisualQuality,
  sourceRasterRefsFromManifest,
  type BuildVisualQualityFromRenderPairsOptions,
  type PairedRenderPageRaster,
  type PersistRenderDiffOptions,
  type PersistRenderDiffResult,
  type SourceRenderPageRaster,
  type VisualQualityFromRenderPairs,
} from './renderDiffPersistence';
