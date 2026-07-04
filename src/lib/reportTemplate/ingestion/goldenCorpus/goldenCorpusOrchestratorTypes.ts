/**
 * goldenCorpusOrchestratorTypes — Phase 9A orchestration data model.
 *
 * The orchestrator is the single operational entry point that, given a corpusId +
 * importId, runs the full post-import golden regression chain (Phase 8B run eval →
 * 8C quality gates → 8D summary → 8F triage → optional persistence) and returns one
 * structured result. It starts after a PDF is already imported; it never uploads
 * PDFs or automates the browser.
 */
import type {
  GoldenRegressionOperatorDecision,
  GoldenRegressionSummary,
  SaveGoldenRegressionSummaryResult,
} from './goldenRegressionTypes';
import type {
  GoldenCorpusImportQualitySnapshot,
  GoldenCorpusRunEvaluation,
} from './goldenCorpusRunTypes';
import type { PdfImportQualityGateReport } from '../qualityGates/pdfImportQualityGateTypes';
import type { PdfImportFailureTriageSummary } from '../failureTriage/pdfImportFailureTriageTypes';
import type {
  GoldenRunBaselineComparison,
  GoldenRunHistoryRecord,
  SaveGoldenRunHistoryResult,
} from './goldenRunHistoryTypes';

export const GOLDEN_CORPUS_ORCHESTRATOR_VERSION = 'pdf-import-golden-corpus-orchestrator-v1';

export type GoldenCorpusOrchestratorMode = 'evaluate_only' | 'evaluate_and_persist';

export type GoldenCorpusOrchestratorStatus =
  | 'completed'
  | 'completed_with_warnings'
  | 'failed'
  | 'blocked'
  | 'not_evaluated';

export type GoldenCorpusOrchestratorStepId =
  | 'validate_input'
  | 'load_snapshot'
  | 'evaluate_run'
  | 'evaluate_quality_gates'
  | 'build_summary'
  | 'evaluate_triage'
  | 'persist_summary'
  | 'load_baseline'
  | 'compare_baseline'
  | 'save_history';

export type GoldenCorpusOrchestratorStepStatus =
  | 'pending'
  | 'skipped'
  | 'pass'
  | 'warning'
  | 'fail'
  | 'blocked';

export interface GoldenCorpusOrchestratorStep {
  id: GoldenCorpusOrchestratorStepId;
  status: GoldenCorpusOrchestratorStepStatus;
  label: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface GoldenCorpusOrchestratorRequest {
  corpusId: string;
  importId: string;
  templateId?: string | null;
  sourceFilename?: string | null;
  runId?: string | null;
  runBatchId?: string | null;
  operatorDecision?: GoldenRegressionOperatorDecision;
  notes?: string[];
  persist?: boolean;
  /** Persist this run into the Phase 9C `pdf_import_golden_runs` history ledger. */
  saveHistory?: boolean;
  /**
   * Compare this run against the previous baseline run for the same corpus.
   * Defaults to `saveHistory` when omitted (a saved run is compared before it
   * becomes the next baseline).
   */
  compareBaseline?: boolean;
}

export interface GoldenCorpusOrchestratorOptions {
  request: GoldenCorpusOrchestratorRequest;
  now?: () => Date;
}

export interface GoldenCorpusOrchestratorResult {
  version: typeof GOLDEN_CORPUS_ORCHESTRATOR_VERSION;
  mode: GoldenCorpusOrchestratorMode;
  status: GoldenCorpusOrchestratorStatus;

  corpusId: string | null;
  importId: string | null;
  templateId: string | null;
  runId: string | null;
  runBatchId: string | null;

  steps: GoldenCorpusOrchestratorStep[];

  runEvaluation: GoldenCorpusRunEvaluation | null;
  qualityGateReport: PdfImportQualityGateReport | null;
  goldenRegressionSummary: GoldenRegressionSummary | null;
  triageSummary: PdfImportFailureTriageSummary | null;

  persistenceResult: SaveGoldenRegressionSummaryResult | null;
  persisted: boolean;

  // Phase 9C — regression history + baseline comparison.
  baselineComparison: GoldenRunBaselineComparison | null;
  historyPersistenceResult: SaveGoldenRunHistoryResult | null;
  historyRecord: GoldenRunHistoryRecord | null;
  historySaved: boolean;

  warnings: string[];
  failures: string[];

  generatedAt: string;
}

export interface GoldenCorpusSnapshotLoadResult {
  kind: 'ok' | 'missing' | 'error';
  snapshot?: GoldenCorpusImportQualitySnapshot;
  message?: string;
  raw?: unknown;
}
