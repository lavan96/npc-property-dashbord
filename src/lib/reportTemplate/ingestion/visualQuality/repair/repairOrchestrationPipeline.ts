import type { PageContextRenderArtifactManifest } from '../pageContextArtifacts';
import {
  captureGeneratedTemplatePageRasters,
  type CaptureGeneratedRenderOptions,
  type GeneratedRenderPageRaster,
} from '../generatedRenderCapture';
import {
  loadSourceRastersFromManifest,
  type SourceRenderPageRaster,
} from '../renderDiffPersistence';
import {
  runImportReviewVisualQualityPipeline,
  type LoadedImportReviewForVisualQuality,
  type RunImportReviewVisualQualityPipelineOptions,
  type RunImportReviewVisualQualityPipelineResult,
} from '../importReviewPipeline';
import type { VisualImportFinalMode } from '../schema';
import {
  buildRepairLoopBridgeInput,
  type RepairLoopBridgeInput,
} from './repairBridge';
import {
  runDeterministicVisualRepair,
  type DeterministicRepairStatus,
  type DeterministicVisualRepairResult,
  type RunDeterministicVisualRepairOptions,
} from './deterministicRepairRunner';

export const VISUAL_REPAIR_ORCHESTRATION_PIPELINE_VERSION = 'visual-repair-orchestration-pipeline-v1';

export interface VisualRepairOrchestrationSummary {
  version: typeof VISUAL_REPAIR_ORCHESTRATION_PIPELINE_VERSION;
  importId: string;
  templateId: string | null;
  visualQaScore: number;
  finalScore: number;
  scoreDelta: number;
  visualQaPersisted: boolean;
  repairStatus: DeterministicRepairStatus;
  canRunRepairLoop: boolean;
  eligiblePageCount: number;
  totalApplied: number;
  passesAttempted: number;
  patchesAccepted: number;
  patchesRejected: number;
  requiresFallback: boolean;
  requiresManualReview: boolean;
  problemCount: number;
  problems: string[];
}

export interface RunVisualRepairOrchestrationPipelineOptions {
  loaded: LoadedImportReviewForVisualQuality;
  generatedRasters?: GeneratedRenderPageRaster[] | null;
  sourceRasters?: SourceRenderPageRaster[] | null;
  templateId?: string | null;
  finalMode?: VisualImportFinalMode;
  persistVisualQa?: boolean;
  maxRasterDim?: number;
  maxRepairPasses?: number;
  captureOptions?: Partial<Omit<CaptureGeneratedRenderOptions, 'importId' | 'template'>>;
  captureGeneratedRasters?: (options: CaptureGeneratedRenderOptions) => Promise<GeneratedRenderPageRaster[]>;
  loadSourceRasters?: (
    manifest: PageContextRenderArtifactManifest,
    opts?: { maxPixelDim?: number },
  ) => Promise<SourceRenderPageRaster[]>;
  runVisualQaPipelineImpl?: (
    options: RunImportReviewVisualQualityPipelineOptions,
  ) => Promise<RunImportReviewVisualQualityPipelineResult>;
  runDeterministicRepairImpl?: (
    options: RunDeterministicVisualRepairOptions,
  ) => Promise<DeterministicVisualRepairResult>;
  runRepairLoopImpl?: RunDeterministicVisualRepairOptions['runRepairLoopImpl'];
  now?: () => Date;
}

export interface VisualRepairOrchestrationPipelineResult {
  version: typeof VISUAL_REPAIR_ORCHESTRATION_PIPELINE_VERSION;
  importId: string;
  templateId: string | null;
  loaded: LoadedImportReviewForVisualQuality;
  generatedRasters: GeneratedRenderPageRaster[];
  sourceRasters: SourceRenderPageRaster[];
  visualQa: RunImportReviewVisualQualityPipelineResult;
  bridge: RepairLoopBridgeInput;
  repair: DeterministicVisualRepairResult;
  draft: DeterministicVisualRepairResult['draft'];
  summary: VisualRepairOrchestrationSummary;
}

async function resolveGeneratedRasters(
  options: RunVisualRepairOrchestrationPipelineOptions,
): Promise<GeneratedRenderPageRaster[]> {
  if (options.generatedRasters?.length) return options.generatedRasters;

  const capture = options.captureGeneratedRasters ?? captureGeneratedTemplatePageRasters;
  return capture({
    ...(options.captureOptions ?? {}),
    importId: options.loaded.record.id,
    template: options.loaded.draft.template,
  });
}

async function resolveSourceRasters(
  options: RunVisualRepairOrchestrationPipelineOptions,
): Promise<SourceRenderPageRaster[]> {
  if (options.sourceRasters?.length) return options.sourceRasters;

  const load = options.loadSourceRasters ?? loadSourceRastersFromManifest;
  return load(options.loaded.renderArtifactManifest, {
    maxPixelDim: options.maxRasterDim ?? 1400,
  });
}

function buildSummary(options: {
  importId: string;
  templateId: string | null;
  visualQa: RunImportReviewVisualQualityPipelineResult;
  bridge: RepairLoopBridgeInput;
  repair: DeterministicVisualRepairResult;
}): VisualRepairOrchestrationSummary {
  const problems = [
    ...(options.bridge.problems ?? []),
    ...(options.visualQa.visualQa.problems ?? []),
    ...(options.repair.errorMessage ? [`repair_error:${options.repair.errorMessage}`] : []),
  ];

  return {
    version: VISUAL_REPAIR_ORCHESTRATION_PIPELINE_VERSION,
    importId: options.importId,
    templateId: options.templateId,
    visualQaScore: options.visualQa.visualQa.report.overallScore,
    finalScore: options.repair.finalReport.overallScore,
    scoreDelta: options.repair.finalReport.overallScore - options.visualQa.visualQa.report.overallScore,
    visualQaPersisted: options.visualQa.visualQa.summary.persisted,
    repairStatus: options.repair.status,
    canRunRepairLoop: options.bridge.canRunRepairLoop,
    eligiblePageCount: options.bridge.eligibility.eligiblePageCount,
    totalApplied: options.repair.totalApplied,
    passesAttempted: options.repair.summary.passesAttempted,
    patchesAccepted: options.repair.summary.patchesAccepted,
    patchesRejected: options.repair.summary.patchesRejected,
    requiresFallback: options.bridge.eligibility.requiresFallback,
    requiresManualReview: options.bridge.eligibility.requiresManualReview || options.repair.finalReport.manualReviewRequired,
    problemCount: problems.length,
    problems,
  };
}

export async function runVisualRepairOrchestrationPipeline(
  options: RunVisualRepairOrchestrationPipelineOptions,
): Promise<VisualRepairOrchestrationPipelineResult> {
  const loaded = options.loaded;
  const importId = loaded.record.id;
  if (!importId) throw new Error('importId is required for visual repair orchestration.');

  const templateId = options.templateId ?? loaded.record.created_template_id ?? null;
  const finalMode = options.finalMode ?? 'hybrid';

  const generatedRasters = await resolveGeneratedRasters(options);
  const sourceRasters = await resolveSourceRasters(options);

  const visualQaRunner = options.runVisualQaPipelineImpl ?? runImportReviewVisualQualityPipeline;
  const visualQa = await visualQaRunner({
    loaded,
    generatedRasters,
    sourceRasters,
    templateId,
    finalMode,
    persist: options.persistVisualQa ?? false,
    maxRasterDim: options.maxRasterDim,
  });

  const repairLoaded: LoadedImportReviewForVisualQuality = {
    ...loaded,
    draft: visualQa.draft,
  };

  const bridge = buildRepairLoopBridgeInput({
    loaded: repairLoaded,
    visualReport: visualQa.visualQa.report,
    generatedRasters,
    sourceRasters,
    finalMode,
    maxPasses: options.maxRepairPasses,
  });

  const repairRunner = options.runDeterministicRepairImpl ?? runDeterministicVisualRepair;
  const repair = await repairRunner({
    loaded: repairLoaded,
    bridge,
    runRepairLoopImpl: options.runRepairLoopImpl,
    now: options.now,
  });

  const summary = buildSummary({
    importId,
    templateId,
    visualQa,
    bridge,
    repair,
  });

  return {
    version: VISUAL_REPAIR_ORCHESTRATION_PIPELINE_VERSION,
    importId,
    templateId,
    loaded: repairLoaded,
    generatedRasters,
    sourceRasters,
    visualQa,
    bridge,
    repair,
    draft: repair.draft,
    summary,
  };
}
