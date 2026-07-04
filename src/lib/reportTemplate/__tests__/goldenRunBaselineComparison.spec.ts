import { describe, expect, it } from 'vitest';
import {
  compareGoldenRunToBaseline,
  getGoldenRunBaselineOutcomeLabel,
  getGoldenRunBaselineOutcomeTone,
  type GoldenRunComparable,
  type GoldenRunHistoryRecord,
} from '../ingestion/goldenCorpus';

function comparable(overrides: Partial<GoldenRunComparable> = {}): GoldenRunComparable {
  return {
    qualityGateStatus: 'pass',
    operatorDecision: 'accepted',
    visualQaScore: 0.95,
    repairFinalScore: 0.96,
    exportVsSourceScore: 0.94,
    warningCount: 0,
    failureCount: 0,
    ...overrides,
  };
}

function baselineRecord(overrides: Partial<GoldenRunHistoryRecord> = {}): GoldenRunHistoryRecord {
  return {
    id: 'baseline-1',
    runId: 'baseline-run-1',
    createdAt: '2026-07-01T00:00:00.000Z',
    ...comparable(),
    ...(overrides as any),
  } as GoldenRunHistoryRecord;
}

describe('compareGoldenRunToBaseline', () => {
  it('returns no_baseline when there is no previous run', () => {
    const c = compareGoldenRunToBaseline({ current: comparable(), baseline: null });
    expect(c.outcome).toBe('no_baseline');
    expect(c.hasBaseline).toBe(false);
    expect(c.reasons).toContain('no_baseline');
  });

  it('is stable when nothing moves materially', () => {
    const c = compareGoldenRunToBaseline({ current: comparable(), baseline: baselineRecord() });
    expect(c.outcome).toBe('stable');
    expect(c.gateDirection).toBe('stable');
    expect(c.decisionDirection).toBe('stable');
  });

  it('flags a quality-gate regression as degraded', () => {
    const c = compareGoldenRunToBaseline({
      current: comparable({ qualityGateStatus: 'fail', operatorDecision: 'rejected' }),
      baseline: baselineRecord(),
    });
    expect(c.outcome).toBe('degraded');
    expect(c.gateDirection).toBe('degraded');
    expect(c.decisionDirection).toBe('degraded');
    expect(c.reasons).toContain('quality_gate_regressed');
  });

  it('flags a score drop beyond tolerance as degraded', () => {
    const c = compareGoldenRunToBaseline({
      current: comparable({ visualQaScore: 0.9 }), // 0.95 -> 0.90, drop 0.05 > 0.02
      baseline: baselineRecord(),
    });
    expect(c.outcome).toBe('degraded');
    expect(c.metrics.find((m) => m.metric === 'visualQa')?.direction).toBe('degraded');
  });

  it('treats a sub-tolerance score drop as stable', () => {
    const c = compareGoldenRunToBaseline({
      current: comparable({ visualQaScore: 0.94 }), // 0.95 -> 0.94, drop 0.01 <= 0.02
      baseline: baselineRecord(),
    });
    expect(c.metrics.find((m) => m.metric === 'visualQa')?.direction).toBe('stable');
    expect(c.outcome).toBe('stable');
  });

  it('honors a custom tolerance', () => {
    const c = compareGoldenRunToBaseline({
      current: comparable({ visualQaScore: 0.9 }),
      baseline: baselineRecord(),
      tolerance: 0.1, // 0.05 drop is now within tolerance
    });
    expect(c.metrics.find((m) => m.metric === 'visualQa')?.direction).toBe('stable');
  });

  it('is improved when a metric rises and nothing regresses', () => {
    const c = compareGoldenRunToBaseline({
      current: comparable({ visualQaScore: 0.99 }),
      baseline: baselineRecord({ visualQaScore: 0.9 } as any),
    });
    expect(c.outcome).toBe('improved');
    expect(c.metrics.find((m) => m.metric === 'visualQa')?.direction).toBe('improved');
  });

  it('degrades when failures increase even if scores hold', () => {
    const c = compareGoldenRunToBaseline({
      current: comparable({ failureCount: 2 }),
      baseline: baselineRecord(),
    });
    expect(c.failureCountDelta).toBe(2);
    expect(c.outcome).toBe('degraded');
    expect(c.reasons).toContain('failure_count_increased');
  });

  it('only degrades on warnings when they rise by more than two', () => {
    const small = compareGoldenRunToBaseline({
      current: comparable({ warningCount: 2 }),
      baseline: baselineRecord(),
    });
    expect(small.warningCountDelta).toBe(2);
    expect(small.outcome).not.toBe('degraded');

    const big = compareGoldenRunToBaseline({
      current: comparable({ warningCount: 3 }),
      baseline: baselineRecord(),
    });
    expect(big.outcome).toBe('degraded');
  });

  it('is unknown when statuses are unrankable and no metrics compare', () => {
    const c = compareGoldenRunToBaseline({
      current: {
        qualityGateStatus: 'mystery',
        operatorDecision: 'mystery',
        visualQaScore: null,
        repairFinalScore: null,
        exportVsSourceScore: null,
        warningCount: 0,
        failureCount: 0,
      },
      baseline: baselineRecord({
        qualityGateStatus: 'mystery' as any,
        operatorDecision: 'mystery' as any,
        visualQaScore: null,
        repairFinalScore: null,
        exportVsSourceScore: null,
      } as any),
    });
    expect(c.outcome).toBe('unknown');
  });

  it('carries baseline identity onto the comparison', () => {
    const c = compareGoldenRunToBaseline({
      current: comparable(),
      baseline: baselineRecord(),
      corpusId: 'golden-simple-001',
    });
    expect(c.baselineHistoryId).toBe('baseline-1');
    expect(c.baselineRunId).toBe('baseline-run-1');
    expect(c.baselineCreatedAt).toBe('2026-07-01T00:00:00.000Z');
    expect(c.corpusId).toBe('golden-simple-001');
  });
});

describe('baseline outcome display helpers', () => {
  it('maps outcomes to tone and label', () => {
    expect(getGoldenRunBaselineOutcomeTone('degraded')).toBe('destructive');
    expect(getGoldenRunBaselineOutcomeTone('improved')).toBe('default');
    expect(getGoldenRunBaselineOutcomeLabel('no_baseline')).toBe('No baseline');
    expect(getGoldenRunBaselineOutcomeLabel('unknown')).toBe('Unknown');
  });
});
