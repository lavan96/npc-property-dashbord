/**
 * goldenRunBaselineComparison — Phase 9C.
 *
 * Pure comparison of a new golden run against the previous baseline run for the
 * same corpus. Detects quality-gate/operator-decision regressions (via ordinal
 * ranks) and per-metric score regressions (visualQa / repairFinal / exportParity)
 * within a configurable tolerance, then resolves an overall outcome. No I/O.
 */
import {
  DEFAULT_GOLDEN_RUN_SCORE_TOLERANCE,
  GOLDEN_RUN_BASELINE_COMPARISON_VERSION,
  GOLDEN_RUN_DECISION_RANK,
  GOLDEN_RUN_GATE_RANK,
  type GoldenRunBaselineComparison,
  type GoldenRunBaselineOutcome,
  type GoldenRunComparable,
  type GoldenRunDirection,
  type GoldenRunHistoryRecord,
  type GoldenRunMetricDelta,
  type GoldenRunMetricKey,
} from './goldenRunHistoryTypes';

function rankDirection(
  rankMap: Record<string, number>,
  from: string | null | undefined,
  to: string | null | undefined,
): GoldenRunDirection {
  const rFrom = from != null ? rankMap[from] : undefined;
  const rTo = to != null ? rankMap[to] : undefined;
  if (rFrom === undefined || rTo === undefined) return 'unknown';
  if (rTo > rFrom) return 'improved';
  if (rTo < rFrom) return 'degraded';
  return 'stable';
}

function metricDirection(
  current: number | null,
  baseline: number | null,
  tolerance: number,
): GoldenRunDirection {
  if (current == null || baseline == null) return 'unknown';
  const delta = current - baseline;
  if (delta > tolerance) return 'improved';
  if (delta < -tolerance) return 'degraded';
  return 'stable';
}

function metricDelta(
  metric: GoldenRunMetricKey,
  current: number | null,
  baseline: number | null,
  tolerance: number,
): GoldenRunMetricDelta {
  const delta = current != null && baseline != null ? current - baseline : null;
  return { metric, current, baseline, delta, direction: metricDirection(current, baseline, tolerance) };
}

export interface CompareGoldenRunToBaselineOptions {
  current: GoldenRunComparable;
  baseline?: GoldenRunHistoryRecord | GoldenRunComparable | null;
  corpusId?: string | null;
  tolerance?: number;
}

/**
 * Compare `current` to `baseline`. When `baseline` is null the outcome is
 * `no_baseline`. Otherwise the outcome resolves to:
 *   - `degraded` if any gate/decision/metric degraded, failures increased, or
 *     warnings increased by more than two;
 *   - `improved` if nothing degraded and at least one signal improved;
 *   - `stable` if at least one signal was comparable but none moved materially;
 *   - `unknown` if there was not enough comparable data.
 */
export function compareGoldenRunToBaseline(
  options: CompareGoldenRunToBaselineOptions,
): GoldenRunBaselineComparison {
  const { current } = options;
  const baseline = options.baseline ?? null;
  const tolerance = typeof options.tolerance === 'number' && Number.isFinite(options.tolerance)
    ? Math.abs(options.tolerance)
    : DEFAULT_GOLDEN_RUN_SCORE_TOLERANCE;
  const corpusId = options.corpusId ?? null;

  const asRecord = baseline as Partial<GoldenRunHistoryRecord> | null;

  const metrics: GoldenRunMetricDelta[] = [
    metricDelta('visualQa', current.visualQaScore ?? null, baseline?.visualQaScore ?? null, tolerance),
    metricDelta('repairFinal', current.repairFinalScore ?? null, baseline?.repairFinalScore ?? null, tolerance),
    metricDelta('exportParity', current.exportVsSourceScore ?? null, baseline?.exportVsSourceScore ?? null, tolerance),
  ];

  const base: GoldenRunBaselineComparison = {
    version: GOLDEN_RUN_BASELINE_COMPARISON_VERSION,
    outcome: 'no_baseline',
    hasBaseline: baseline != null,

    corpusId,
    baselineHistoryId: asRecord?.id ?? null,
    baselineRunId: asRecord?.runId ?? null,
    baselineCreatedAt: asRecord?.createdAt ?? null,

    gateDirection: 'unknown',
    gateStatusFrom: baseline?.qualityGateStatus ?? null,
    gateStatusTo: current.qualityGateStatus ?? null,

    decisionDirection: 'unknown',
    decisionFrom: baseline?.operatorDecision ?? null,
    decisionTo: current.operatorDecision ?? null,

    warningCountDelta: 0,
    failureCountDelta: 0,

    metrics,
    tolerance,
    reasons: [],
  };

  if (!baseline) {
    base.reasons = ['no_baseline'];
    return base;
  }

  base.gateDirection = rankDirection(GOLDEN_RUN_GATE_RANK, baseline.qualityGateStatus, current.qualityGateStatus);
  base.decisionDirection = rankDirection(GOLDEN_RUN_DECISION_RANK, baseline.operatorDecision, current.operatorDecision);
  base.warningCountDelta = (current.warningCount ?? 0) - (baseline.warningCount ?? 0);
  base.failureCountDelta = (current.failureCount ?? 0) - (baseline.failureCount ?? 0);

  const reasons: string[] = [];
  const degraded: string[] = [];
  const improved: string[] = [];

  if (base.gateDirection === 'degraded') { degraded.push('gate'); reasons.push('quality_gate_regressed'); }
  else if (base.gateDirection === 'improved') { improved.push('gate'); reasons.push('quality_gate_improved'); }

  if (base.decisionDirection === 'degraded') { degraded.push('decision'); reasons.push('operator_decision_regressed'); }
  else if (base.decisionDirection === 'improved') { improved.push('decision'); reasons.push('operator_decision_improved'); }

  for (const m of metrics) {
    if (m.direction === 'degraded') { degraded.push(m.metric); reasons.push(`${m.metric}_score_regressed`); }
    else if (m.direction === 'improved') { improved.push(m.metric); reasons.push(`${m.metric}_score_improved`); }
  }

  if (base.failureCountDelta > 0) { degraded.push('failures'); reasons.push('failure_count_increased'); }
  else if (base.failureCountDelta < 0) { improved.push('failures'); reasons.push('failure_count_decreased'); }

  if (base.warningCountDelta > 2) { degraded.push('warnings'); reasons.push('warning_count_increased'); }
  else if (base.warningCountDelta < 0) { improved.push('warnings'); reasons.push('warning_count_decreased'); }

  const resolvedAny =
    base.gateDirection !== 'unknown' ||
    base.decisionDirection !== 'unknown' ||
    metrics.some((m) => m.direction !== 'unknown');

  let outcome: GoldenRunBaselineOutcome;
  if (degraded.length > 0) outcome = 'degraded';
  else if (improved.length > 0) outcome = 'improved';
  else if (resolvedAny) outcome = 'stable';
  else outcome = 'unknown';

  if (outcome === 'stable' && reasons.length === 0) reasons.push('no_material_change');
  if (outcome === 'unknown' && reasons.length === 0) reasons.push('insufficient_data');

  base.outcome = outcome;
  base.reasons = reasons;
  return base;
}

/** Badge tone for a baseline outcome (matches the shadcn Badge variants). */
export function getGoldenRunBaselineOutcomeTone(
  outcome: GoldenRunBaselineOutcome | string | null | undefined,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (outcome) {
    case 'improved': return 'default';
    case 'stable': return 'secondary';
    case 'degraded': return 'destructive';
    case 'no_baseline': return 'outline';
    default: return 'outline';
  }
}

export function getGoldenRunBaselineOutcomeLabel(
  outcome: GoldenRunBaselineOutcome | string | null | undefined,
): string {
  switch (outcome) {
    case 'improved': return 'Improved';
    case 'stable': return 'Stable';
    case 'degraded': return 'Degraded';
    case 'no_baseline': return 'No baseline';
    case 'unknown': return 'Unknown';
    default: return 'Unknown';
  }
}
