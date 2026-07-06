import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildEmptyGoldenCorpusSnapshot,
  buildGoldenCorpusRunId,
  orchestrateGoldenCorpusRun,
  orchestrateGoldenCorpusRunFromSnapshot,
  type GoldenCorpusImportQualitySnapshot,
  type GoldenCorpusOrchestratorRequest,
} from '../ingestion/goldenCorpus';
import { loadGoldenCorpusImportQualitySnapshot } from '@/lib/reportTemplate/ingestion/goldenCorpus/goldenCorpusImportSnapshot';
import { saveGoldenRegressionSummary } from '@/lib/reportTemplate/ingestion/goldenCorpus/goldenRegressionPersistence';
import {
  getLatestGoldenRunBaselines,
  saveGoldenRunHistory,
} from '@/lib/reportTemplate/ingestion/goldenCorpus/goldenRunHistoryPersistence';
import { runExportParityAutomation } from '@/lib/reportTemplate/ingestion/exportParity/exportParityRunner';

vi.mock('@/lib/reportTemplate/ingestion/goldenCorpus/goldenCorpusImportSnapshot', async (orig) => {
  const actual = await orig<typeof import('@/lib/reportTemplate/ingestion/goldenCorpus/goldenCorpusImportSnapshot')>();
  return { ...actual, loadGoldenCorpusImportQualitySnapshot: vi.fn() };
});
vi.mock('@/lib/reportTemplate/ingestion/goldenCorpus/goldenRegressionPersistence', async (orig) => {
  const actual = await orig<typeof import('@/lib/reportTemplate/ingestion/goldenCorpus/goldenRegressionPersistence')>();
  return { ...actual, saveGoldenRegressionSummary: vi.fn() };
});
vi.mock('@/lib/reportTemplate/ingestion/goldenCorpus/goldenRunHistoryPersistence', async (orig) => {
  const actual = await orig<typeof import('@/lib/reportTemplate/ingestion/goldenCorpus/goldenRunHistoryPersistence')>();
  return { ...actual, getLatestGoldenRunBaselines: vi.fn(), saveGoldenRunHistory: vi.fn() };
});
vi.mock('@/lib/reportTemplate/ingestion/exportParity/exportParityRunner', async (orig) => {
  const actual = await orig<typeof import('@/lib/reportTemplate/ingestion/exportParity/exportParityRunner')>();
  return { ...actual, runExportParityAutomation: vi.fn() };
});

const NOW = () => new Date('2026-07-04T00:00:00.000Z');

function snap(
  overrides: Partial<GoldenCorpusImportQualitySnapshot> = {},
): GoldenCorpusImportQualitySnapshot {
  return {
    ...buildEmptyGoldenCorpusSnapshot('import-1'),
    templateId: 'template-1',
    sourceFilename: 'golden-simple-001.pdf',
    importStatus: 'completed',
    engineVersion: 'docling-1.0',
    importPageCount: 1,
    templatePageCount: 1,
    visualQaArtifactPath: 'import-1/visual-quality.json',
    visualQaScore: 0.95,
    visualQaManualReviewRequired: false,
    repairArtifactPath: 'import-1/repair/repair-loop.json',
    repairStatus: 'completed',
    repairFinalScore: 0.96,
    repairRequiresFallback: false,
    repairRequiresManualReview: false,
    aiReconciliationStatus: null,
    aiReconciliationRecommendation: 'not_needed',
    exportParityArtifactPath: 'import-1/export-parity/export-parity.json',
    exportParityStatus: 'completed',
    exportParityMode: 'manual',
    exportVsSourceScore: 0.94,
    ...overrides,
  };
}

function req(overrides: Partial<GoldenCorpusOrchestratorRequest> = {}): GoldenCorpusOrchestratorRequest {
  return { corpusId: 'golden-simple-001', importId: 'import-1', ...overrides };
}

function pure(request: GoldenCorpusOrchestratorRequest, snapshot = snap()) {
  return orchestrateGoldenCorpusRunFromSnapshot({ request, snapshot, now: NOW });
}

function stepOf(result: ReturnType<typeof pure>, id: string) {
  return result.steps.find((s) => s.id === id);
}

describe('orchestrateGoldenCorpusRunFromSnapshot (pure)', () => {
  it('fails on missing corpusId', () => {
    const result = pure(req({ corpusId: '' }));
    expect(result.status).toBe('failed');
    expect(result.failures).toContain('input_missing_corpus_id');
    expect(stepOf(result, 'validate_input')?.status).toBe('fail');
  });

  it('is not_evaluated on missing importId', () => {
    const result = orchestrateGoldenCorpusRunFromSnapshot({
      request: req({ importId: '' }),
      snapshot: buildEmptyGoldenCorpusSnapshot(null),
      now: NOW,
    });
    expect(result.status).toBe('not_evaluated');
    expect(result.warnings).toContain('input_missing_import_id');
    expect(result.runEvaluation).toBeNull();
  });

  it('fails on unknown corpusId', () => {
    const result = pure(req({ corpusId: 'golden-nope-000' }));
    expect(result.status).toBe('failed');
    expect(result.failures).toContain('unknown_corpus_id');
  });

  it('completes a perfect simple run', () => {
    const result = pure(req());
    expect(result.status).toBe('completed');
    expect(result.runEvaluation).not.toBeNull();
    expect(result.qualityGateReport?.overallStatus).toBe('pass');
    expect(result.goldenRegressionSummary?.qualityGateStatus).toBe('pass');
    expect(result.triageSummary?.outcome).toBe('resolved');
    expect(result.persisted).toBe(false);
    expect(stepOf(result, 'persist_summary')?.status).toBe('skipped');
    expect(stepOf(result, 'evaluate_run')?.status).toBe('pass');
  });

  it('completes_with_warnings for an allowed-manual-review run (OCR)', () => {
    const result = pure(
      req({ corpusId: 'golden-ocr-001' }),
      snap({ visualQaScore: 0.7, repairFinalScore: 0.7, exportVsSourceScore: 0.8, visualQaManualReviewRequired: true }),
    );
    expect(result.status).toBe('completed_with_warnings');
    expect(result.qualityGateReport?.overallStatus).toBe('warning');
  });

  it('fails when Visual QA is below threshold', () => {
    const result = pure(req(), snap({ visualQaScore: 0.5 }));
    expect(result.qualityGateReport?.overallStatus).toBe('fail');
    expect(result.status).toBe('failed');
  });

  it('fails when the Visual QA artifact is missing', () => {
    const result = pure(req(), snap({ visualQaArtifactPath: null }));
    expect(result.status).toBe('failed');
    expect(result.qualityGateReport?.gates.find((g) => g.id === 'visual_quality_artifact_present')?.status).toBe('fail');
  });

  it('fails when the repair audit is missing', () => {
    const result = pure(req(), snap({ repairArtifactPath: null }));
    expect(result.status).toBe('failed');
  });

  it('does not complete when export parity is missing (8C: artifact fail + status blocked)', () => {
    const result = pure(req(), snap({ exportParityArtifactPath: null, exportParityStatus: null, exportVsSourceScore: null }));
    // export_parity_artifact_present → fail, but export_parity_status_acceptable → blocked
    // (status missing), and blocked outranks fail in the gate resolver, so overall is blocked.
    expect(result.status).toBe('blocked');
    expect(result.qualityGateReport?.overallStatus).toBe('blocked');
    expect(result.qualityGateReport?.gates.find((g) => g.id === 'export_parity_artifact_present')?.status).toBe('fail');
  });

  it('gives a warning (not fail) when AI reconciliation was recommended but not run', () => {
    const result = pure(req(), snap({ aiReconciliationRecommendation: 'recommended', aiReconciliationStatus: null }));
    expect(result.status).toBe('completed_with_warnings');
    expect(result.qualityGateReport?.gates.find((g) => g.id === 'ai_reconciliation_policy')?.status).toBe('warning');
  });

  it('produces triage recommendations for a failed repair', () => {
    const result = pure(req(), snap({ repairStatus: 'failed' }));
    expect(result.triageSummary).not.toBeNull();
    const codes = result.triageSummary!.recommendations.map((r) => r.rule.code);
    expect(codes).toContain('repair_failed');
    expect(result.triageSummary!.primaryAction).toBe('rerun_repair');
  });

  it('buildGoldenCorpusRunId is deterministic with now and includes ids + sanitized timestamp', () => {
    const id = buildGoldenCorpusRunId({ corpusId: 'golden-simple-001', importId: 'import-1', now: NOW });
    expect(id).toContain('golden-simple-001');
    expect(id).toContain('import-1');
    expect(id).toBe('golden-run-golden-simple-001-import-1-2026-07-04T00-00-00-000Z');
  });

  it('does not persist in the pure function', () => {
    const result = pure(req());
    expect(result.persistenceResult).toBeNull();
    expect(result.persisted).toBe(false);
    expect(stepOf(result, 'persist_summary')?.status).toBe('skipped');
  });

  it('honors an operatorDecision override', () => {
    const result = pure(req({ operatorDecision: 'accepted_with_warnings' }));
    expect(result.goldenRegressionSummary?.operatorDecision).toBe('accepted_with_warnings');
  });

  it('carries notes into the summary', () => {
    const result = pure(req({ notes: ['phase 9a note'] }));
    expect(result.goldenRegressionSummary?.notes).toContain('phase 9a note');
  });
});

describe('orchestrateGoldenCorpusRun (async)', () => {
  beforeEach(() => {
    vi.mocked(loadGoldenCorpusImportQualitySnapshot).mockReset();
    vi.mocked(saveGoldenRegressionSummary).mockReset();
  });

  it('evaluate_only loads the snapshot and does not persist', async () => {
    vi.mocked(loadGoldenCorpusImportQualitySnapshot).mockResolvedValue({ kind: 'ok', snapshot: snap() });

    const result = await orchestrateGoldenCorpusRun({ request: req({ persist: false }), now: NOW });
    expect(result.mode).toBe('evaluate_only');
    expect(result.persisted).toBe(false);
    expect(saveGoldenRegressionSummary).not.toHaveBeenCalled();
    expect(stepOf(result as any, 'load_snapshot')?.status).toBe('pass');
  });

  it('persist=true saves the summary', async () => {
    vi.mocked(loadGoldenCorpusImportQualitySnapshot).mockResolvedValue({ kind: 'ok', snapshot: snap() });
    vi.mocked(saveGoldenRegressionSummary).mockResolvedValue({ kind: 'ok' });

    const result = await orchestrateGoldenCorpusRun({ request: req({ persist: true }), now: NOW });
    expect(result.mode).toBe('evaluate_and_persist');
    expect(result.persisted).toBe(true);
    expect(stepOf(result as any, 'persist_summary')?.status).toBe('pass');
    expect(saveGoldenRegressionSummary).toHaveBeenCalledTimes(1);
  });

  it('persist=true handles a save error', async () => {
    vi.mocked(loadGoldenCorpusImportQualitySnapshot).mockResolvedValue({ kind: 'ok', snapshot: snap() });
    vi.mocked(saveGoldenRegressionSummary).mockResolvedValue({ kind: 'error', message: 'boom' });

    const result = await orchestrateGoldenCorpusRun({ request: req({ persist: true }), now: NOW });
    expect(result.status).toBe('failed');
    expect(result.persisted).toBe(false);
    expect(result.failures).toContain('persistence_failed');
  });

  it('blocks on a snapshot load error', async () => {
    vi.mocked(loadGoldenCorpusImportQualitySnapshot).mockResolvedValue({ kind: 'error', message: 'network' });
    const result = await orchestrateGoldenCorpusRun({ request: req(), now: NOW });
    expect(result.status).toBe('blocked');
    expect(result.failures).toContain('snapshot_load_failed');
  });

  it('blocks on a missing snapshot', async () => {
    vi.mocked(loadGoldenCorpusImportQualitySnapshot).mockResolvedValue({ kind: 'missing' });
    const result = await orchestrateGoldenCorpusRun({ request: req(), now: NOW });
    expect(result.status).toBe('blocked');
    expect(result.failures).toContain('snapshot_missing');
  });

  it('is not_evaluated without a network call when importId is missing', async () => {
    const result = await orchestrateGoldenCorpusRun({ request: req({ importId: '' }), now: NOW });
    expect(result.status).toBe('not_evaluated');
    expect(loadGoldenCorpusImportQualitySnapshot).not.toHaveBeenCalled();
  });
});

function baselineRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    runId: 'baseline-run',
    corpusId: 'golden-simple-001',
    qualityGateStatus: 'pass',
    operatorDecision: 'accepted',
    visualQaScore: 0.95,
    repairFinalScore: 0.96,
    exportVsSourceScore: 0.94,
    editorVsSourceScore: null,
    exportVsEditorScore: null,
    warningCount: 0,
    failureCount: 0,
    ...overrides,
  } as any;
}

describe('orchestrateGoldenCorpusRun (Phase 9C history + baseline)', () => {
  beforeEach(() => {
    vi.mocked(loadGoldenCorpusImportQualitySnapshot).mockReset();
    vi.mocked(saveGoldenRegressionSummary).mockReset();
    vi.mocked(getLatestGoldenRunBaselines).mockReset();
    vi.mocked(saveGoldenRunHistory).mockReset();
    vi.mocked(loadGoldenCorpusImportQualitySnapshot).mockResolvedValue({ kind: 'ok', snapshot: snap() });
    vi.mocked(saveGoldenRegressionSummary).mockResolvedValue({ kind: 'ok' });
    vi.mocked(getLatestGoldenRunBaselines).mockResolvedValue({ kind: 'ok', baselines: [] });
    vi.mocked(saveGoldenRunHistory).mockResolvedValue({ kind: 'ok', historyId: 'hist-1', history: { id: 'hist-1' } as any });
  });

  it('evaluate_only does not save history by default', async () => {
    const result = await orchestrateGoldenCorpusRun({ request: req({ persist: false }), now: NOW });
    expect(saveGoldenRunHistory).not.toHaveBeenCalled();
    expect(getLatestGoldenRunBaselines).not.toHaveBeenCalled();
    expect(result.historySaved).toBe(false);
    expect(result.baselineComparison).toBeNull();
  });

  it('persist=true saveHistory=false keeps the old behavior', async () => {
    const result = await orchestrateGoldenCorpusRun({ request: req({ persist: true, compareBaseline: false }), now: NOW });
    expect(result.persisted).toBe(true);
    expect(saveGoldenRunHistory).not.toHaveBeenCalled();
    expect(result.historySaved).toBe(false);
  });

  it('persist=true saveHistory=true calls saveGoldenRunHistory', async () => {
    const result = await orchestrateGoldenCorpusRun({ request: req({ persist: true, saveHistory: true }), now: NOW });
    expect(saveGoldenRunHistory).toHaveBeenCalledTimes(1);
    expect(result.historySaved).toBe(true);
  });

  it('history save success populates the record and passes the save_history step', async () => {
    const result = await orchestrateGoldenCorpusRun({ request: req({ persist: true, saveHistory: true }), now: NOW });
    expect(result.historySaved).toBe(true);
    expect(result.historyRecord?.id).toBe('hist-1');
    expect(stepOf(result as any, 'save_history')?.status).toBe('pass');
  });

  it('history save error fails the run', async () => {
    vi.mocked(saveGoldenRunHistory).mockResolvedValue({ kind: 'error', message: 'db down' });
    const result = await orchestrateGoldenCorpusRun({ request: req({ persist: true, saveHistory: true }), now: NOW });
    expect(result.historySaved).toBe(false);
    expect(result.historyPersistenceResult?.kind).toBe('error');
    expect(stepOf(result as any, 'save_history')?.status).toBe('fail');
    expect(result.failures).toContain('history_persistence_failed');
    expect(result.status).toBe('failed');
  });

  it('compareBaseline true loads baselines', async () => {
    await orchestrateGoldenCorpusRun({ request: req({ persist: false, compareBaseline: true }), now: NOW });
    expect(getLatestGoldenRunBaselines).toHaveBeenCalledWith('golden-simple-001');
  });

  it('no baseline creates a no_baseline comparison', async () => {
    vi.mocked(getLatestGoldenRunBaselines).mockResolvedValue({ kind: 'ok', baselines: [] });
    const result = await orchestrateGoldenCorpusRun({ request: req({ persist: false, compareBaseline: true }), now: NOW });
    expect(result.baselineComparison?.outcome).toBe('no_baseline');
    expect(result.warnings).toContain('no_baseline_found');
    expect(result.status).toBe('completed_with_warnings');
  });

  it('a previous baseline creates a comparison', async () => {
    vi.mocked(getLatestGoldenRunBaselines).mockResolvedValue({ kind: 'ok', baselines: [baselineRow()] });
    const result = await orchestrateGoldenCorpusRun({ request: req({ persist: false, compareBaseline: true }), now: NOW });
    expect(result.baselineComparison).not.toBeNull();
    expect(result.baselineComparison?.previousRunId).toBe('baseline-run');
    expect(result.baselineComparison?.outcome).toBe('stable');
  });

  it('a degraded baseline comparison drops to completed_with_warnings', async () => {
    vi.mocked(getLatestGoldenRunBaselines).mockResolvedValue({ kind: 'ok', baselines: [baselineRow({ visualQaScore: 0.99 })] });
    const result = await orchestrateGoldenCorpusRun({ request: req({ persist: false, compareBaseline: true }), now: NOW });
    expect(result.baselineComparison?.outcome).toBe('degraded');
    expect(result.warnings).toContain('baseline_regression_detected');
    expect(result.status).toBe('completed_with_warnings');
  });

  it('a baseline load failure warns but does not block summary creation', async () => {
    vi.mocked(getLatestGoldenRunBaselines).mockResolvedValue({ kind: 'error', message: 'network' });
    const result = await orchestrateGoldenCorpusRun({ request: req({ persist: false, compareBaseline: true }), now: NOW });
    expect(result.warnings).toContain('baseline_load_failed');
    expect(result.goldenRegressionSummary).not.toBeNull();
    expect(result.baselineComparison).toBeNull();
  });

  it('saveHistory with no summary fails with history_summary_missing', async () => {
    const result = await orchestrateGoldenCorpusRun({
      request: req({ corpusId: 'golden-nope-000', persist: false, saveHistory: true, compareBaseline: false }),
      now: NOW,
    });
    expect(result.goldenRegressionSummary).toBeNull();
    expect(result.failures).toContain('history_summary_missing');
    expect(result.status).toBe('failed');
  });

  it('saveHistory=true defaults compareBaseline true unless explicitly false', async () => {
    await orchestrateGoldenCorpusRun({ request: req({ persist: true, saveHistory: true }), now: NOW });
    expect(getLatestGoldenRunBaselines).toHaveBeenCalledTimes(1);

    vi.mocked(getLatestGoldenRunBaselines).mockClear();
    await orchestrateGoldenCorpusRun({ request: req({ persist: true, saveHistory: true, compareBaseline: false }), now: NOW });
    expect(getLatestGoldenRunBaselines).not.toHaveBeenCalled();
  });
});

function epResult(overrides: Record<string, unknown> = {}) {
  return {
    version: 'export-parity-runner-v1',
    importId: 'import-1',
    templateId: 'template-1',
    mode: 'auto',
    status: 'completed',
    automationLevel: 'level_2_source_editor',
    summary: null,
    pageComparisons: [],
    evidence: [],
    scores: { exportVsSourceScore: 0.94, editorVsSourceScore: 0.95, exportVsEditorScore: null, overallScore: 0.945 },
    blockers: [],
    warnings: [],
    notes: [],
    persisted: false,
    persistenceError: null,
    generatedAt: '2026-07-04T00:00:00.000Z',
    ...overrides,
  } as any;
}

describe('orchestrateGoldenCorpusRun (Phase 9D export parity)', () => {
  beforeEach(() => {
    vi.mocked(loadGoldenCorpusImportQualitySnapshot).mockReset();
    vi.mocked(saveGoldenRegressionSummary).mockReset();
    vi.mocked(getLatestGoldenRunBaselines).mockReset();
    vi.mocked(saveGoldenRunHistory).mockReset();
    vi.mocked(runExportParityAutomation).mockReset();
    vi.mocked(loadGoldenCorpusImportQualitySnapshot).mockResolvedValue({ kind: 'ok', snapshot: snap() });
    vi.mocked(saveGoldenRegressionSummary).mockResolvedValue({ kind: 'ok' });
    vi.mocked(getLatestGoldenRunBaselines).mockResolvedValue({ kind: 'ok', baselines: [] });
    vi.mocked(saveGoldenRunHistory).mockResolvedValue({ kind: 'ok', historyId: 'hist-1', history: { id: 'hist-1' } as any });
    vi.mocked(runExportParityAutomation).mockResolvedValue(epResult());
  });

  it('skips run_export_parity when not requested', async () => {
    const result = await orchestrateGoldenCorpusRun({ request: req({ persist: false }), now: NOW });
    expect(runExportParityAutomation).not.toHaveBeenCalled();
    expect(stepOf(result as any, 'run_export_parity')?.status).toBe('skipped');
    expect(result.exportParityRunnerResult).toBeNull();
  });

  it('runExportParity true calls the runner', async () => {
    await orchestrateGoldenCorpusRun({ request: req({ persist: false, runExportParity: true }), now: NOW });
    expect(runExportParityAutomation).toHaveBeenCalledTimes(1);
  });

  it('persistExportParity true passes persist:true to the runner', async () => {
    await orchestrateGoldenCorpusRun({ request: req({ persist: false, runExportParity: true, persistExportParity: true }), now: NOW });
    expect(runExportParityAutomation).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({ persist: true }),
    }));
  });

  it('attaches a completed export parity result', async () => {
    const result = await orchestrateGoldenCorpusRun({ request: req({ persist: false, runExportParity: true }), now: NOW });
    expect(result.exportParityRunnerResult?.status).toBe('completed');
    expect(stepOf(result as any, 'run_export_parity')?.status).toBe('pass');
  });

  it('manual_required export parity adds a warning without crashing', async () => {
    vi.mocked(runExportParityAutomation).mockResolvedValue(epResult({ status: 'manual_required' }));
    const result = await orchestrateGoldenCorpusRun({ request: req({ persist: false, runExportParity: true }), now: NOW });
    expect(result.warnings).toContain('export_parity_automation_manual_required');
    expect(result.exportParityRunnerResult?.status).toBe('manual_required');
    expect(stepOf(result as any, 'run_export_parity')?.status).toBe('warning');
  });

  it('export parity persistence failure fails the run when persistExportParity is true', async () => {
    vi.mocked(runExportParityAutomation).mockResolvedValue(epResult({ status: 'failed', persistenceError: 'db down' }));
    const result = await orchestrateGoldenCorpusRun({ request: req({ persist: false, runExportParity: true, persistExportParity: true }), now: NOW });
    expect(result.failures).toContain('export_parity_persistence_failed');
    expect(result.status).toBe('failed');
  });

  it('reloads the snapshot after export parity is persisted', async () => {
    vi.mocked(runExportParityAutomation).mockResolvedValue(epResult({ persisted: true }));
    const result = await orchestrateGoldenCorpusRun({ request: req({ persist: false, runExportParity: true, persistExportParity: true }), now: NOW });
    expect(loadGoldenCorpusImportQualitySnapshot).toHaveBeenCalledTimes(2);
    expect(result.qualityGateReport).not.toBeNull();
  });

  it('does not reload the snapshot when export parity was not persisted', async () => {
    vi.mocked(runExportParityAutomation).mockResolvedValue(epResult({ persisted: false }));
    await orchestrateGoldenCorpusRun({ request: req({ persist: false, runExportParity: true }), now: NOW });
    expect(loadGoldenCorpusImportQualitySnapshot).toHaveBeenCalledTimes(1);
  });

  it('still returns a structured result when automation is not ready', async () => {
    vi.mocked(runExportParityAutomation).mockResolvedValue(epResult({ status: 'not_ready', blockers: ['source_evidence_missing'] }));
    const result = await orchestrateGoldenCorpusRun({ request: req({ persist: false, runExportParity: true }), now: NOW });
    expect(result.exportParityRunnerResult?.status).toBe('not_ready');
    expect(result.warnings).toContain('export_parity_automation_manual_required');
  });

  it('evaluate_only with export parity persist off does not write the golden summary', async () => {
    await orchestrateGoldenCorpusRun({ request: req({ persist: false, runExportParity: true, persistExportParity: false }), now: NOW });
    expect(saveGoldenRegressionSummary).not.toHaveBeenCalled();
    expect(runExportParityAutomation).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({ persist: false }),
    }));
  });
});
