/**
 * goldenRunHistoryTypes — Phase 9C regression-history data model.
 *
 * Phase 8D persists only the *latest* golden regression summary onto
 * `template_imports.meta.golden_regression_summary`. Phase 9C adds a durable
 * ledger — one row per persisted golden run in `public.pdf_import_golden_runs` —
 * so history, trends, and baseline comparisons survive beyond that latest summary.
 *
 * These types describe the wire contract with the secure `template-import-pdf`
 * edge operations (camelCase both ways; the edge function maps to/from snake_case
 * columns). Nothing here performs I/O.
 */
import type { GoldenCorpusCategory } from './goldenCorpusTypes';
import type {
  GoldenCorpusRunDecision,
  GoldenCorpusRunStatus,
} from './goldenCorpusRunTypes';
import type { GoldenRegressionOperatorDecision } from './goldenRegressionTypes';
import type { PdfImportQualityGateStatus } from '../qualityGates/pdfImportQualityGateTypes';

export const GOLDEN_RUN_HISTORY_VERSION = 'pdf-import-golden-run-history-v1';
export const GOLDEN_RUN_BASELINE_COMPARISON_VERSION =
  'pdf-import-golden-run-baseline-comparison-v1';

/** Default per-metric score-drop tolerance (visualQa / repairFinal / exportParity). */
export const DEFAULT_GOLDEN_RUN_SCORE_TOLERANCE = 0.02;

/**
 * Ordinal ranks (higher is better) used to detect status/decision regressions.
 * Kept as data (not code) so the baseline comparator stays a pure lookup.
 */
export const GOLDEN_RUN_GATE_RANK: Record<string, number> = {
  blocked: 0,
  fail: 1,
  not_evaluated: 2,
  warning: 3,
  pass: 4,
};

export const GOLDEN_RUN_DECISION_RANK: Record<string, number> = {
  rejected: 0,
  needs_rerun: 1,
  not_reviewed: 2,
  accepted_with_warnings: 3,
  accepted: 4,
};

export type GoldenRunBaselineOutcome =
  | 'improved'
  | 'stable'
  | 'degraded'
  | 'no_baseline'
  | 'unknown';

export type GoldenRunDirection = 'improved' | 'stable' | 'degraded' | 'unknown';

export type GoldenRunMetricKey = 'visualQa' | 'repairFinal' | 'exportParity';

export interface GoldenRunMetricDelta {
  metric: GoldenRunMetricKey;
  current: number | null;
  baseline: number | null;
  delta: number | null;
  direction: GoldenRunDirection;
}

export interface GoldenRunBaselineComparison {
  version: typeof GOLDEN_RUN_BASELINE_COMPARISON_VERSION;
  outcome: GoldenRunBaselineOutcome;
  hasBaseline: boolean;

  corpusId: string | null;
  baselineHistoryId: string | null;
  baselineRunId: string | null;
  baselineCreatedAt: string | null;

  gateDirection: GoldenRunDirection;
  gateStatusFrom: string | null;
  gateStatusTo: string | null;

  decisionDirection: GoldenRunDirection;
  decisionFrom: string | null;
  decisionTo: string | null;

  warningCountDelta: number;
  failureCountDelta: number;

  metrics: GoldenRunMetricDelta[];
  tolerance: number;
  reasons: string[];
}

/**
 * The minimal shape the baseline comparator needs. Both a freshly built
 * history input and a persisted history record satisfy it.
 */
export interface GoldenRunComparable {
  qualityGateStatus: string;
  operatorDecision: string;
  visualQaScore: number | null;
  repairFinalScore: number | null;
  exportVsSourceScore: number | null;
  warningCount: number;
  failureCount: number;
}

/** Payload sent to `save_golden_run_history` (built from a regression summary). */
export interface GoldenRunHistoryInput extends GoldenRunComparable {
  runId: string;
  runBatchId: string | null;

  corpusId: string;
  category: GoldenCorpusCategory;

  importId: string;
  templateId: string | null;

  sourceFilename: string | null;
  engineVersion: string | null;
  orchestratorVersion: string | null;
  summaryVersion: string | null;

  importStatus: string | null;
  runStatus: GoldenCorpusRunStatus | null;
  runDecision: GoldenCorpusRunDecision | null;

  qualityGateStatus: PdfImportQualityGateStatus;
  operatorDecision: GoldenRegressionOperatorDecision;

  importPageCount: number | null;
  templatePageCount: number | null;

  editorVsSourceScore: number | null;
  exportVsEditorScore: number | null;

  visualQaManualReviewRequired: boolean | null;
  repairRequiresFallback: boolean | null;
  repairRequiresManualReview: boolean | null;

  aiReconciliationStatus: string | null;
  aiReconciliationRecommendation: string | null;

  exportParityStatus: string | null;
  exportParityMode: string | null;

  warnings: string[];
  failures: string[];

  gateSummary: Record<string, unknown>;
  triageSummary: Record<string, unknown>;
  goldenRegressionSummary: Record<string, unknown>;

  baselineComparison: GoldenRunBaselineComparison | null;
}

/** A persisted history row as returned by the edge function (camelCase). */
export interface GoldenRunHistoryRecord extends GoldenRunHistoryInput {
  id: string;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ListGoldenRunHistoryOptions {
  corpusId?: string | null;
  importId?: string | null;
  limit?: number | null;
}

export interface GetLatestGoldenRunBaselinesOptions {
  corpusId?: string | null;
}

export type SaveGoldenRunHistoryResult =
  | { kind: 'ok'; historyId: string; record: GoldenRunHistoryRecord }
  | { kind: 'error'; message: string };

export type ListGoldenRunHistoryResult =
  | { kind: 'ok'; records: GoldenRunHistoryRecord[] }
  | { kind: 'error'; message: string };

export type GetGoldenRunHistoryResult =
  | { kind: 'ok'; record: GoldenRunHistoryRecord }
  | { kind: 'missing' }
  | { kind: 'error'; message: string };

export type GetLatestGoldenRunBaselinesResult =
  | { kind: 'ok'; baselines: GoldenRunHistoryRecord[] }
  | { kind: 'error'; message: string };
