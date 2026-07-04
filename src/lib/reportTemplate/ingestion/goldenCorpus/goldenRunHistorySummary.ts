/**
 * goldenRunHistorySummary — Phase 9C.
 *
 * Pure transforms between a Phase 8D `GoldenRegressionSummary` and the Phase 9C
 * history wire shapes:
 *   - `buildGoldenRunHistoryInputFromSummary`: summary (+ triage + baseline) → input
 *   - `normalizeGoldenRunHistoryRecord`: a loosely-typed edge/DB payload → record
 * No I/O here — persistence lives in `goldenRunHistoryPersistence.ts`.
 */
import { GOLDEN_CORPUS_ORCHESTRATOR_VERSION } from './goldenCorpusOrchestratorTypes';
import type { GoldenRegressionSummary } from './goldenRegressionTypes';
import type { PdfImportFailureTriageSummary } from '../failureTriage/pdfImportFailureTriageTypes';
import type { GoldenCorpusCategory } from './goldenCorpusTypes';
import type { GoldenCorpusRunDecision, GoldenCorpusRunStatus } from './goldenCorpusRunTypes';
import type { GoldenRegressionOperatorDecision } from './goldenRegressionTypes';
import type { PdfImportQualityGateStatus } from '../qualityGates/pdfImportQualityGateTypes';
import type {
  GoldenRunBaselineComparison,
  GoldenRunHistoryInput,
  GoldenRunHistoryRecord,
} from './goldenRunHistoryTypes';

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function toScoreOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toBoolOrNull(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function toIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

function toStringList(value: unknown): string[] {
  const out: string[] = [];
  for (const raw of Array.isArray(value) ? value : []) {
    const s = String(raw ?? '').trim();
    if (s) out.push(s);
  }
  return out;
}

function toObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export interface BuildGoldenRunHistoryInputOptions {
  summary: GoldenRegressionSummary;
  triageSummary?: PdfImportFailureTriageSummary | null;
  orchestratorVersion?: string | null;
  baselineComparison?: GoldenRunBaselineComparison | null;
}

/**
 * Build a persistable history input from a golden regression summary. Warning /
 * failure counts are derived from the summary's arrays so the row and its
 * embedded summary can never disagree.
 */
export function buildGoldenRunHistoryInputFromSummary(
  options: BuildGoldenRunHistoryInputOptions,
): GoldenRunHistoryInput {
  const { summary } = options ?? ({} as BuildGoldenRunHistoryInputOptions);
  if (!summary) throw new Error('summary is required to build a golden run history input.');
  if (!summary.importId) throw new Error('summary.importId is required to build a golden run history input.');

  const warnings = toStringList(summary.warnings);
  const failures = toStringList(summary.failures);

  return {
    runId: summary.runId,
    runBatchId: summary.runBatchId ?? null,

    corpusId: summary.corpusId,
    category: summary.category,

    importId: summary.importId,
    templateId: summary.templateId ?? null,

    sourceFilename: summary.sourceFilename ?? null,
    engineVersion: summary.engineVersion ?? null,
    orchestratorVersion: options.orchestratorVersion ?? GOLDEN_CORPUS_ORCHESTRATOR_VERSION,
    summaryVersion: summary.version ?? null,

    importStatus: summary.importStatus ?? null,
    runStatus: summary.runStatus ?? null,
    runDecision: summary.runDecision ?? null,

    qualityGateStatus: summary.qualityGateStatus,
    operatorDecision: summary.operatorDecision,

    importPageCount: summary.importPageCount ?? null,
    templatePageCount: summary.templatePageCount ?? null,

    visualQaScore: summary.visualQaScore ?? null,
    repairFinalScore: summary.repairFinalScore ?? null,
    exportVsSourceScore: summary.exportVsSourceScore ?? null,
    editorVsSourceScore: summary.editorVsSourceScore ?? null,
    exportVsEditorScore: summary.exportVsEditorScore ?? null,

    visualQaManualReviewRequired: summary.visualQaManualReviewRequired ?? null,
    repairRequiresFallback: summary.repairRequiresFallback ?? null,
    repairRequiresManualReview: summary.repairRequiresManualReview ?? null,

    aiReconciliationStatus: summary.aiReconciliationStatus ?? null,
    aiReconciliationRecommendation: summary.aiReconciliationRecommendation ?? null,

    exportParityStatus: summary.exportParityStatus ?? null,
    exportParityMode: summary.exportParityMode ?? null,

    warningCount: warnings.length,
    failureCount: failures.length,

    warnings,
    failures,

    gateSummary: toObject(summary.gateSummary),
    triageSummary: options.triageSummary ? toObject(options.triageSummary) : {},
    goldenRegressionSummary: toObject(summary as unknown as Record<string, unknown>),

    baselineComparison: options.baselineComparison ?? null,
  };
}

/**
 * Coerce a loosely-typed history payload (from the edge function or a raw DB
 * row) into a `GoldenRunHistoryRecord`. Tolerant of missing/null fields.
 */
export function normalizeGoldenRunHistoryRecord(raw: unknown): GoldenRunHistoryRecord {
  const r = toObject(raw);
  const warnings = toStringList(r.warnings);
  const failures = toStringList(r.failures);
  const baseline = r.baselineComparison && typeof r.baselineComparison === 'object'
    ? (r.baselineComparison as GoldenRunBaselineComparison)
    : null;

  return {
    id: toStringOrNull(r.id) ?? '',
    runId: toStringOrNull(r.runId) ?? '',
    runBatchId: toStringOrNull(r.runBatchId),

    corpusId: toStringOrNull(r.corpusId) ?? '',
    category: (toStringOrNull(r.category) ?? 'unknown') as GoldenCorpusCategory,

    importId: toStringOrNull(r.importId) ?? '',
    templateId: toStringOrNull(r.templateId),

    sourceFilename: toStringOrNull(r.sourceFilename),
    engineVersion: toStringOrNull(r.engineVersion),
    orchestratorVersion: toStringOrNull(r.orchestratorVersion),
    summaryVersion: toStringOrNull(r.summaryVersion),

    importStatus: toStringOrNull(r.importStatus),
    runStatus: toStringOrNull(r.runStatus) as GoldenCorpusRunStatus | null,
    runDecision: toStringOrNull(r.runDecision) as GoldenCorpusRunDecision | null,

    qualityGateStatus: (toStringOrNull(r.qualityGateStatus) ?? 'not_evaluated') as PdfImportQualityGateStatus,
    operatorDecision: (toStringOrNull(r.operatorDecision) ?? 'not_reviewed') as GoldenRegressionOperatorDecision,

    importPageCount: toIntOrNull(r.importPageCount),
    templatePageCount: toIntOrNull(r.templatePageCount),

    visualQaScore: toScoreOrNull(r.visualQaScore),
    repairFinalScore: toScoreOrNull(r.repairFinalScore),
    exportVsSourceScore: toScoreOrNull(r.exportVsSourceScore),
    editorVsSourceScore: toScoreOrNull(r.editorVsSourceScore),
    exportVsEditorScore: toScoreOrNull(r.exportVsEditorScore),

    visualQaManualReviewRequired: toBoolOrNull(r.visualQaManualReviewRequired),
    repairRequiresFallback: toBoolOrNull(r.repairRequiresFallback),
    repairRequiresManualReview: toBoolOrNull(r.repairRequiresManualReview),

    aiReconciliationStatus: toStringOrNull(r.aiReconciliationStatus),
    aiReconciliationRecommendation: toStringOrNull(r.aiReconciliationRecommendation),

    exportParityStatus: toStringOrNull(r.exportParityStatus),
    exportParityMode: toStringOrNull(r.exportParityMode),

    warningCount: r.warningCount === undefined ? warnings.length : toCount(r.warningCount),
    failureCount: r.failureCount === undefined ? failures.length : toCount(r.failureCount),

    warnings,
    failures,

    gateSummary: toObject(r.gateSummary),
    triageSummary: toObject(r.triageSummary),
    goldenRegressionSummary: toObject(r.goldenRegressionSummary),

    baselineComparison: baseline,

    createdBy: toStringOrNull(r.createdBy),
    createdAt: toStringOrNull(r.createdAt),
    updatedAt: toStringOrNull(r.updatedAt),
  };
}
