import { describe, expect, it } from 'vitest';
import {
  GOLDEN_CORPUS_ORCHESTRATOR_VERSION,
  GOLDEN_REGRESSION_SUMMARY_VERSION,
  buildGoldenRunHistoryInputFromSummary,
  normalizeGoldenRunHistoryRecord,
  type GoldenRegressionSummary,
} from '../ingestion/goldenCorpus';

function summary(overrides: Partial<GoldenRegressionSummary> = {}): GoldenRegressionSummary {
  return {
    version: GOLDEN_REGRESSION_SUMMARY_VERSION,
    runId: 'golden-run-simple-1',
    runBatchId: 'batch-1',
    corpusId: 'golden-simple-001',
    category: 'simple_one_page',
    importId: 'import-1',
    templateId: 'template-1',
    sourceFilename: 'golden-simple-001.pdf',
    engineVersion: 'docling-1.0',
    importStatus: 'completed',
    runStatus: 'validated',
    runDecision: 'pass',
    importPageCount: 1,
    templatePageCount: 1,
    visualQaScore: 0.95,
    visualQaManualReviewRequired: false,
    repairStatus: 'completed',
    repairFinalScore: 0.96,
    repairRequiresFallback: false,
    repairRequiresManualReview: false,
    aiReconciliationStatus: null,
    aiReconciliationRecommendation: 'not_needed',
    exportParityStatus: 'completed',
    exportParityMode: 'manual',
    exportVsSourceScore: 0.94,
    editorVsSourceScore: 0.93,
    exportVsEditorScore: 0.97,
    qualityGateStatus: 'pass',
    gateSummary: { total: 5, pass: 5 } as any,
    warnings: ['w1'],
    failures: [],
    operatorDecision: 'accepted',
    notes: ['note-1'],
    generatedAt: '2026-07-04T00:00:00.000Z',
    persistedAt: null,
    ...overrides,
  };
}

describe('buildGoldenRunHistoryInputFromSummary', () => {
  it('maps summary fields and derives counts from the arrays', () => {
    const input = buildGoldenRunHistoryInputFromSummary({ summary: summary() });
    expect(input.runId).toBe('golden-run-simple-1');
    expect(input.corpusId).toBe('golden-simple-001');
    expect(input.category).toBe('simple_one_page');
    expect(input.importId).toBe('import-1');
    expect(input.qualityGateStatus).toBe('pass');
    expect(input.operatorDecision).toBe('accepted');
    expect(input.visualQaScore).toBe(0.95);
    expect(input.exportVsSourceScore).toBe(0.94);
    expect(input.warningCount).toBe(1);
    expect(input.failureCount).toBe(0);
    expect(input.summaryVersion).toBe(GOLDEN_REGRESSION_SUMMARY_VERSION);
    expect(input.orchestratorVersion).toBe(GOLDEN_CORPUS_ORCHESTRATOR_VERSION);
    expect(input.baselineComparison).toBeNull();
    // The full summary is embedded for audit.
    expect((input.goldenRegressionSummary as any).runId).toBe('golden-run-simple-1');
  });

  it('carries triage summary, orchestrator version, and baseline comparison when provided', () => {
    const input = buildGoldenRunHistoryInputFromSummary({
      summary: summary(),
      triageSummary: { outcome: 'resolved' } as any,
      orchestratorVersion: 'custom-orchestrator',
      baselineComparison: { outcome: 'improved' } as any,
    });
    expect((input.triageSummary as any).outcome).toBe('resolved');
    expect(input.orchestratorVersion).toBe('custom-orchestrator');
    expect(input.baselineComparison).toEqual({ outcome: 'improved' });
  });

  it('recomputes counts even if summary arrays disagree with any prior count', () => {
    const input = buildGoldenRunHistoryInputFromSummary({
      summary: summary({ warnings: ['a', 'b', 'c'], failures: ['x'] }),
    });
    expect(input.warningCount).toBe(3);
    expect(input.failureCount).toBe(1);
  });

  it('throws when the summary lacks an importId', () => {
    expect(() => buildGoldenRunHistoryInputFromSummary({ summary: summary({ importId: '' }) })).toThrow();
  });
});

describe('normalizeGoldenRunHistoryRecord', () => {
  it('coerces a loosely-typed payload into a record', () => {
    const record = normalizeGoldenRunHistoryRecord({
      id: 'hist-1',
      runId: 'run-1',
      corpusId: 'golden-simple-001',
      category: 'simple_one_page',
      importId: 'import-1',
      qualityGateStatus: 'warning',
      operatorDecision: 'accepted_with_warnings',
      visualQaScore: '0.8',
      warningCount: 2,
      warnings: ['w1', 'w2'],
      failures: [],
      createdAt: '2026-07-04T00:00:00.000Z',
    });
    expect(record.id).toBe('hist-1');
    expect(record.visualQaScore).toBe(0.8);
    expect(record.warningCount).toBe(2);
    expect(record.failureCount).toBe(0);
    expect(record.baselineComparison).toBeNull();
  });

  it('falls back to array lengths when counts are absent', () => {
    const record = normalizeGoldenRunHistoryRecord({
      warnings: ['w1', 'w2', 'w3'],
      failures: ['f1'],
    });
    expect(record.warningCount).toBe(3);
    expect(record.failureCount).toBe(1);
  });

  it('defaults missing status/decision to safe values', () => {
    const record = normalizeGoldenRunHistoryRecord({});
    expect(record.qualityGateStatus).toBe('not_evaluated');
    expect(record.operatorDecision).toBe('not_reviewed');
  });
});
