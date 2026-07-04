/**
 * goldenCorpusOrchestrator — Phase 9A.
 *
 * Single operational entry point for the post-import golden regression chain.
 * Pure core (`orchestrateGoldenCorpusRunFromSnapshot`) does no network I/O; the
 * async wrapper (`orchestrateGoldenCorpusRun`) loads the snapshot and optionally
 * persists the summary. Wires Phase 8B (run eval) → 8C (gates) → 8D (summary) →
 * 8F (triage) → 8D persistence.
 */
import { getGoldenCorpusItem } from './goldenCorpusRegistry';
import { evaluateGoldenCorpusRun } from './goldenCorpusRunEvaluator';
import { buildGoldenRegressionSummary } from './goldenRegressionSummary';
import { saveGoldenRegressionSummary } from './goldenRegressionPersistence';
import { loadGoldenCorpusImportQualitySnapshot } from './goldenCorpusImportSnapshot';
import { buildGoldenRunHistoryInputFromSummary } from './goldenRunHistorySummary';
import {
  getLatestGoldenRunBaselines,
  saveGoldenRunHistory,
} from './goldenRunHistoryPersistence';
import { compareGoldenRunToBaseline } from './goldenRunBaselineComparison';
import { evaluatePdfImportQualityGates } from '../qualityGates/pdfImportQualityGateEvaluator';
import {
  evaluatePdfImportFailureTriage,
  extractFailureSignalsFromGoldenRegression,
} from '../failureTriage/pdfImportFailureTriageEvaluator';
import type {
  GoldenCorpusImportQualitySnapshot,
  GoldenCorpusRunEvaluation,
  GoldenCorpusRunReference,
} from './goldenCorpusRunTypes';
import type { PdfImportQualityGateReport } from '../qualityGates/pdfImportQualityGateTypes';
import type { PdfImportFailureTriageSummary } from '../failureTriage/pdfImportFailureTriageTypes';
import type { SaveGoldenRegressionSummaryResult } from './goldenRegressionTypes';
import type { GoldenRunHistoryRecord } from './goldenRunHistoryTypes';
import {
  GOLDEN_CORPUS_ORCHESTRATOR_VERSION,
  type GoldenCorpusOrchestratorMode,
  type GoldenCorpusOrchestratorOptions,
  type GoldenCorpusOrchestratorRequest,
  type GoldenCorpusOrchestratorResult,
  type GoldenCorpusOrchestratorStatus,
  type GoldenCorpusOrchestratorStep,
  type GoldenCorpusOrchestratorStepId,
  type GoldenCorpusOrchestratorStepStatus,
} from './goldenCorpusOrchestratorTypes';

const STEP_LABELS: Record<GoldenCorpusOrchestratorStepId, string> = {
  validate_input: 'Validate input',
  load_snapshot: 'Load import snapshot',
  evaluate_run: 'Evaluate golden run',
  evaluate_quality_gates: 'Evaluate quality gates',
  build_summary: 'Build regression summary',
  evaluate_triage: 'Evaluate failure triage',
  persist_summary: 'Persist regression summary',
  load_baseline: 'Load baseline run',
  compare_baseline: 'Compare to baseline',
  save_history: 'Save run history',
};

const PURE_STEP_ORDER: GoldenCorpusOrchestratorStepId[] = [
  'validate_input',
  'evaluate_run',
  'evaluate_quality_gates',
  'build_summary',
  'evaluate_triage',
  'persist_summary',
];

export function createGoldenCorpusOrchestratorStep(
  id: GoldenCorpusOrchestratorStepId,
  status: GoldenCorpusOrchestratorStepStatus,
  message: string,
  details?: Record<string, unknown>,
): GoldenCorpusOrchestratorStep {
  return { id, status, label: STEP_LABELS[id], message, details };
}

const skippedStep = (id: GoldenCorpusOrchestratorStepId, message = 'Skipped.') =>
  createGoldenCorpusOrchestratorStep(id, 'skipped', message);

function uniq(values: string[]): string[] {
  const out: string[] = [];
  for (const v of values) if (v && !out.includes(v)) out.push(v);
  return out;
}

/** Deterministic-with-`now` golden run id. Only the timestamp is sanitized. */
export function buildGoldenCorpusRunId(input: {
  corpusId: string;
  importId: string;
  now?: () => Date;
}): string {
  const ts = (input.now ?? (() => new Date()))().toISOString().replace(/[^a-zA-Z0-9_-]/g, '-');
  return `golden-run-${input.corpusId}-${input.importId}-${ts}`;
}

export function resolveGoldenCorpusOrchestratorStatus(input: {
  runEvaluation: GoldenCorpusRunEvaluation | null;
  qualityGateReport: PdfImportQualityGateReport | null;
  triageSummary: PdfImportFailureTriageSummary | null;
  persistenceResult: SaveGoldenRegressionSummaryResult | null;
  persistRequested: boolean;
  warnings: string[];
  failures: string[];
}): GoldenCorpusOrchestratorStatus {
  const { qualityGateReport, triageSummary, persistenceResult, persistRequested, warnings } = input;

  if (persistRequested && persistenceResult && persistenceResult.kind === 'error') return 'failed';

  if (qualityGateReport) {
    if (qualityGateReport.overallStatus === 'blocked') return 'blocked';
    if (qualityGateReport.overallStatus === 'fail') return 'failed';
  }
  if (triageSummary?.outcome === 'escalate') return 'failed';
  if (triageSummary?.outcome === 'blocked') return 'blocked';
  if (qualityGateReport?.overallStatus === 'warning') return 'completed_with_warnings';
  if (warnings.length > 0) return 'completed_with_warnings';
  return 'completed';
}

/** Base result skeleton with sensible nulls. */
function baseResult(
  request: GoldenCorpusOrchestratorRequest,
  generatedAt: string,
): GoldenCorpusOrchestratorResult {
  return {
    version: GOLDEN_CORPUS_ORCHESTRATOR_VERSION,
    mode: 'evaluate_only',
    status: 'not_evaluated',
    corpusId: request.corpusId || null,
    importId: request.importId || null,
    templateId: request.templateId ?? null,
    runId: request.runId ?? null,
    runBatchId: request.runBatchId ?? null,
    steps: [],
    runEvaluation: null,
    qualityGateReport: null,
    goldenRegressionSummary: null,
    triageSummary: null,
    persistenceResult: null,
    persisted: false,
    baselineComparison: null,
    historyPersistenceResult: null,
    historyRecord: null,
    historySaved: false,
    warnings: [],
    failures: [],
    generatedAt,
  };
}

/** All pure steps skipped except the given anchor step (used for early returns). */
function skippedRest(except: GoldenCorpusOrchestratorStepId): GoldenCorpusOrchestratorStep[] {
  return PURE_STEP_ORDER.filter((id) => id !== except).map((id) => skippedStep(id));
}

function stepStatusFromDecision(decision: string): GoldenCorpusOrchestratorStepStatus {
  if (decision === 'pass') return 'pass';
  if (decision === 'fail') return 'fail';
  return 'warning'; // warning | not_evaluated
}

function stepStatusFromGate(overall: string): GoldenCorpusOrchestratorStepStatus {
  if (overall === 'pass') return 'pass';
  if (overall === 'fail') return 'fail';
  if (overall === 'blocked') return 'blocked';
  return 'warning'; // warning | not_evaluated
}

function stepStatusFromTriage(outcome: string): GoldenCorpusOrchestratorStepStatus {
  if (outcome === 'resolved') return 'pass';
  if (outcome === 'blocked') return 'blocked';
  if (outcome === 'escalate') return 'fail';
  return 'warning'; // monitor | action_required
}

/**
 * Pure orchestration from an already-loaded snapshot. No network; never persists
 * (persist_summary is always skipped here).
 */
export function orchestrateGoldenCorpusRunFromSnapshot(options: {
  request: GoldenCorpusOrchestratorRequest;
  snapshot: GoldenCorpusImportQualitySnapshot;
  now?: () => Date;
}): GoldenCorpusOrchestratorResult {
  const { request, snapshot } = options;
  const now = options.now ?? (() => new Date());
  const generatedAt = now().toISOString();
  const result = baseResult(request, generatedAt);

  // 1. validate_input
  const corpusId = typeof request.corpusId === 'string' ? request.corpusId.trim() : '';
  if (!corpusId) {
    result.status = 'failed';
    result.failures = ['input_missing_corpus_id'];
    result.steps = [
      createGoldenCorpusOrchestratorStep('validate_input', 'fail', 'corpusId is required.'),
      ...skippedRest('validate_input'),
    ];
    return result;
  }

  const effectiveImportId =
    (typeof request.importId === 'string' && request.importId.trim()) || snapshot.importId || '';
  if (!effectiveImportId) {
    result.status = 'not_evaluated';
    result.warnings = ['input_missing_import_id'];
    result.steps = [
      createGoldenCorpusOrchestratorStep('validate_input', 'warning', 'importId is required to evaluate.'),
      ...skippedRest('validate_input'),
    ];
    return result;
  }

  const corpus = getGoldenCorpusItem(corpusId);
  if (!corpus) {
    result.status = 'failed';
    result.corpusId = corpusId;
    result.failures = ['unknown_corpus_id'];
    result.steps = [
      createGoldenCorpusOrchestratorStep('validate_input', 'fail', `Unknown golden corpus ID: ${corpusId}`),
      ...skippedRest('validate_input'),
    ];
    return result;
  }

  const effectiveTemplateId = request.templateId ?? snapshot.templateId ?? null;
  const effectiveSourceFilename = request.sourceFilename ?? snapshot.sourceFilename ?? null;
  const runId = (typeof request.runId === 'string' && request.runId.trim())
    || buildGoldenCorpusRunId({ corpusId, importId: effectiveImportId, now });

  result.corpusId = corpusId;
  result.importId = effectiveImportId;
  result.templateId = effectiveTemplateId;
  result.runId = runId;
  result.runBatchId = request.runBatchId ?? null;

  const steps: GoldenCorpusOrchestratorStep[] = [
    createGoldenCorpusOrchestratorStep('validate_input', 'pass', 'Input validated.'),
  ];

  const effectiveSnapshot: GoldenCorpusImportQualitySnapshot = {
    ...snapshot,
    importId: effectiveImportId,
    templateId: effectiveTemplateId,
    sourceFilename: effectiveSourceFilename,
  };

  const run: GoldenCorpusRunReference = {
    runId,
    corpusId,
    sourceFilename: effectiveSourceFilename,
    importId: effectiveImportId,
    templateId: effectiveTemplateId,
    notes: request.notes && request.notes.length ? request.notes.join('; ') : null,
  };

  const finalize = (
    status: GoldenCorpusOrchestratorStatus,
    extraFailures: string[] = [],
    extraWarnings: string[] = [],
  ) => {
    result.steps = steps;
    result.warnings = uniq([
      ...(result.runEvaluation?.warnings ?? []),
      ...(result.goldenRegressionSummary?.warnings ?? []),
      ...extraWarnings,
    ]);
    result.failures = uniq([
      ...(result.runEvaluation?.failures ?? []),
      ...(result.goldenRegressionSummary?.failures ?? []),
      ...extraFailures,
    ]);
    result.status = status;
    return result;
  };

  // 5. evaluate_run
  let runEvaluation: GoldenCorpusRunEvaluation;
  try {
    runEvaluation = evaluateGoldenCorpusRun({ run, snapshot: effectiveSnapshot, now });
  } catch (err) {
    steps.push(createGoldenCorpusOrchestratorStep('evaluate_run', 'fail', (err as Error).message));
    steps.push(...skippedRest('validate_input').filter((s) => s.id !== 'evaluate_run'));
    return finalize('failed', ['run_evaluation_failed']);
  }
  result.runEvaluation = runEvaluation;
  steps.push(createGoldenCorpusOrchestratorStep('evaluate_run', stepStatusFromDecision(runEvaluation.decision),
    `Run decision: ${runEvaluation.decision}.`));

  // 6. evaluate_quality_gates
  let qualityGateReport: PdfImportQualityGateReport;
  try {
    qualityGateReport = evaluatePdfImportQualityGates({ evaluation: runEvaluation, now });
  } catch (err) {
    steps.push(createGoldenCorpusOrchestratorStep('evaluate_quality_gates', 'fail', (err as Error).message));
    steps.push(skippedStep('build_summary'), skippedStep('evaluate_triage'), skippedStep('persist_summary'));
    return finalize('failed', ['quality_gate_evaluation_failed']);
  }
  result.qualityGateReport = qualityGateReport;
  steps.push(createGoldenCorpusOrchestratorStep('evaluate_quality_gates', stepStatusFromGate(qualityGateReport.overallStatus),
    `Quality gate: ${qualityGateReport.overallStatus}.`));

  // 7. build_summary
  let summary;
  try {
    summary = buildGoldenRegressionSummary({
      runEvaluation,
      qualityGateReport,
      summaryOptions: {
        runBatchId: request.runBatchId ?? null,
        operatorDecision: request.operatorDecision,
        notes: request.notes ?? [],
        now,
      },
    });
  } catch (err) {
    steps.push(createGoldenCorpusOrchestratorStep('build_summary', 'fail', (err as Error).message));
    steps.push(skippedStep('evaluate_triage'), skippedStep('persist_summary'));
    return finalize('failed', ['summary_build_failed']);
  }
  result.goldenRegressionSummary = summary;
  steps.push(createGoldenCorpusOrchestratorStep('build_summary', 'pass', 'Golden regression summary built.'));

  // 8. evaluate_triage (never fails the whole run)
  const extraWarnings: string[] = [];
  try {
    const signals = extractFailureSignalsFromGoldenRegression({
      warnings: summary.warnings,
      failures: summary.failures,
      qualityGateStatus: summary.qualityGateStatus,
      operatorDecision: summary.operatorDecision,
    });
    const triageSummary = evaluatePdfImportFailureTriage({ signals, now });
    result.triageSummary = triageSummary;
    steps.push(createGoldenCorpusOrchestratorStep('evaluate_triage', stepStatusFromTriage(triageSummary.outcome),
      `Triage outcome: ${triageSummary.outcome}.`));
  } catch (err) {
    result.triageSummary = null;
    extraWarnings.push('triage_evaluation_failed');
    steps.push(createGoldenCorpusOrchestratorStep('evaluate_triage', 'warning', (err as Error).message));
  }

  // 9. persist_summary — always skipped in the pure function.
  steps.push(skippedStep('persist_summary', 'Persistence skipped in pure snapshot orchestration.'));

  // 11. status
  const status = resolveGoldenCorpusOrchestratorStatus({
    runEvaluation,
    qualityGateReport,
    triageSummary: result.triageSummary,
    persistenceResult: null,
    persistRequested: false,
    warnings: uniq([...(runEvaluation.warnings ?? []), ...(summary.warnings ?? []), ...extraWarnings]),
    failures: uniq([...(runEvaluation.failures ?? []), ...(summary.failures ?? [])]),
  });

  return finalize(status, [], extraWarnings);
}

/** Insert `step` immediately after `validate_input` (i.e. the load_snapshot slot). */
function withLoadSnapshotStep(
  steps: GoldenCorpusOrchestratorStep[],
  step: GoldenCorpusOrchestratorStep,
): GoldenCorpusOrchestratorStep[] {
  if (steps.length === 0) return [step];
  return [steps[0], step, ...steps.slice(1)];
}

function replaceStep(
  steps: GoldenCorpusOrchestratorStep[],
  step: GoldenCorpusOrchestratorStep,
): GoldenCorpusOrchestratorStep[] {
  const idx = steps.findIndex((s) => s.id === step.id);
  if (idx < 0) return [...steps, step];
  const copy = [...steps];
  copy[idx] = step;
  return copy;
}

/**
 * Async orchestration: loads the snapshot via the secure `get_status` operation,
 * runs the pure chain, and optionally persists the summary when `request.persist`.
 */
export async function orchestrateGoldenCorpusRun(
  options: GoldenCorpusOrchestratorOptions,
): Promise<GoldenCorpusOrchestratorResult> {
  const { request } = options;
  const now = options.now ?? (() => new Date());
  const generatedAt = now().toISOString();

  const importId = typeof request.importId === 'string' ? request.importId.trim() : '';
  if (!importId) {
    const result = baseResult(request, generatedAt);
    result.status = 'not_evaluated';
    result.warnings = ['input_missing_import_id'];
    result.steps = [
      createGoldenCorpusOrchestratorStep('validate_input', 'warning', 'importId is required to evaluate.'),
      skippedStep('load_snapshot'),
      ...skippedRest('validate_input'),
    ];
    return result;
  }

  const load = await loadGoldenCorpusImportQualitySnapshot(importId);
  if (load.kind === 'error' || load.kind === 'missing' || !load.snapshot) {
    const result = baseResult(request, generatedAt);
    result.corpusId = request.corpusId || null;
    result.status = 'blocked';
    const failureCode = load.kind === 'missing' ? 'snapshot_missing' : 'snapshot_load_failed';
    result.failures = [failureCode];
    result.steps = [
      createGoldenCorpusOrchestratorStep('validate_input', 'pass', 'Input validated.'),
      createGoldenCorpusOrchestratorStep('load_snapshot', 'blocked', load.message ?? 'Snapshot unavailable.'),
      ...skippedRest('validate_input'),
    ];
    return result;
  }

  const pure = orchestrateGoldenCorpusRunFromSnapshot({ request, snapshot: load.snapshot, now });
  pure.steps = withLoadSnapshotStep(
    pure.steps,
    createGoldenCorpusOrchestratorStep('load_snapshot', 'pass', 'Import snapshot loaded.'),
  );

  // Persist the latest summary (Phase 8D). evaluate_only leaves it read-only.
  if (request.persist !== true) {
    pure.mode = 'evaluate_only';
    pure.persisted = false;
    pure.persistenceResult = null;
    pure.steps = replaceStep(pure.steps, skippedStep('persist_summary', 'Persistence not requested (evaluate_only).'));
  } else {
    pure.mode = 'evaluate_and_persist';
    if (!pure.goldenRegressionSummary) {
      pure.persisted = false;
      pure.persistenceResult = null;
      pure.steps = replaceStep(pure.steps, createGoldenCorpusOrchestratorStep('persist_summary', 'fail', 'No summary to persist.'));
      pure.failures = uniq([...pure.failures, 'persistence_summary_missing']);
      pure.status = 'failed';
    } else {
      const saveResult = await saveGoldenRegressionSummary(importId, pure.goldenRegressionSummary);
      pure.persistenceResult = saveResult;
      if (saveResult.kind === 'ok') {
        pure.persisted = true;
        pure.steps = replaceStep(pure.steps, createGoldenCorpusOrchestratorStep('persist_summary', 'pass', 'Golden regression summary persisted.'));
      } else {
        pure.persisted = false;
        pure.steps = replaceStep(pure.steps, createGoldenCorpusOrchestratorStep('persist_summary', 'fail', saveResult.message));
        pure.failures = uniq([...pure.failures, 'persistence_failed']);
        pure.status = 'failed';
      }
    }
  }

  // Phase 9C — baseline comparison + history persistence (independent of persist).
  const wantSaveHistory = request.saveHistory === true;
  const wantCompareBaseline = request.compareBaseline ?? wantSaveHistory;
  if (wantSaveHistory || wantCompareBaseline) {
    await applyGoldenRunHistoryPhase(pure, request, importId);
  }

  return pure;
}

function baselineStepStatus(outcome: string): GoldenCorpusOrchestratorStepStatus {
  if (outcome === 'improved' || outcome === 'stable') return 'pass';
  return 'warning'; // degraded | no_baseline | unknown
}

/**
 * Phase 9C history phase (async-only): optionally loads the previous baseline for
 * the corpus, compares the current run, and saves it to the history ledger. Never
 * throws; failures surface as steps/warnings/failures. A history-save failure when
 * `saveHistory` is requested fails the run; a baseline that cannot be loaded or is
 * absent is non-blocking (warning only).
 */
async function applyGoldenRunHistoryPhase(
  result: GoldenCorpusOrchestratorResult,
  request: GoldenCorpusOrchestratorRequest,
  importId: string,
): Promise<void> {
  const wantSave = request.saveHistory === true;
  const wantCompare = request.compareBaseline ?? wantSave;
  const summary = result.goldenRegressionSummary;
  const corpusId = result.corpusId ?? (request.corpusId || null);

  const addWarning = (code: string) => { result.warnings = uniq([...result.warnings, code]); };
  const addFailure = (code: string) => { result.failures = uniq([...result.failures, code]); };
  const appendStep = (step: GoldenCorpusOrchestratorStep) => { result.steps = [...result.steps, step]; };

  if (wantCompare) {
    let baseline: GoldenRunHistoryRecord | null = null;
    let baselineLoadFailed = false;

    if (corpusId) {
      const baselineRes = await getLatestGoldenRunBaselines({ corpusId });
      if (baselineRes.kind === 'error') {
        baselineLoadFailed = true;
        addWarning('baseline_load_failed');
        appendStep(createGoldenCorpusOrchestratorStep('load_baseline', 'warning', baselineRes.message));
      } else {
        baseline = baselineRes.baselines.find((b) => b.corpusId === corpusId) ?? baselineRes.baselines[0] ?? null;
        appendStep(createGoldenCorpusOrchestratorStep(
          'load_baseline',
          baseline ? 'pass' : 'warning',
          baseline ? `Baseline run ${baseline.runId} loaded.` : 'No previous baseline run found.',
        ));
      }
    } else {
      appendStep(skippedStep('load_baseline', 'No corpus ID to load a baseline.'));
    }

    if (summary && !baselineLoadFailed) {
      const current = buildGoldenRunHistoryInputFromSummary({
        summary,
        triageSummary: result.triageSummary,
        orchestratorVersion: result.version,
      });
      const comparison = compareGoldenRunToBaseline({ current, baseline, corpusId });
      result.baselineComparison = comparison;
      appendStep(createGoldenCorpusOrchestratorStep(
        'compare_baseline',
        baselineStepStatus(comparison.outcome),
        `Baseline outcome: ${comparison.outcome}.`,
        { outcome: comparison.outcome, reasons: comparison.reasons },
      ));
      if (comparison.outcome === 'no_baseline') addWarning('no_baseline_found');
      if (comparison.outcome === 'degraded') addWarning('baseline_regression_detected');
    } else {
      appendStep(skippedStep('compare_baseline', summary ? 'Baseline unavailable.' : 'No summary to compare.'));
    }
  }

  if (wantSave) {
    if (!summary) {
      appendStep(createGoldenCorpusOrchestratorStep('save_history', 'fail', 'No summary to save to history.'));
      addFailure('history_summary_missing');
      result.status = 'failed';
    } else {
      const input = buildGoldenRunHistoryInputFromSummary({
        summary,
        triageSummary: result.triageSummary,
        orchestratorVersion: result.version,
        baselineComparison: result.baselineComparison,
      });
      const saveRes = await saveGoldenRunHistory(importId, input);
      result.historyPersistenceResult = saveRes;
      if (saveRes.kind === 'ok') {
        result.historySaved = true;
        result.historyRecord = saveRes.record;
        appendStep(createGoldenCorpusOrchestratorStep('save_history', 'pass', 'Golden run history saved.'));
      } else {
        result.historySaved = false;
        appendStep(createGoldenCorpusOrchestratorStep('save_history', 'fail', saveRes.message));
        addFailure('history_persistence_failed');
        result.status = 'failed';
      }
    }
  }

  // A clean run that only accrued history warnings drops to completed_with_warnings.
  if (result.status === 'completed' && result.warnings.length > 0) {
    result.status = 'completed_with_warnings';
  }
}

export type { GoldenCorpusOrchestratorMode };
