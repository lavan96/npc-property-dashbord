// Phase 2 — Portfolio reconciler.
// Reads the bcSegmentEngine feature flag, runs commercial + industrial segment
// evaluators in parallel, and computes overlays the main BC pipeline can apply
// ADDITIVELY without touching residential math.
//
// Guarantee: if the flag is off OR no commercial/industrial rows are linked,
// `triggered = false` and overlays are all zero → residential pipeline produces
// byte-identical output to today.

import { evaluateCommercialSegment } from './commercial.ts';
import { evaluateIndustrialSegment } from './industrial.ts';
import {
  DEFAULT_SEGMENT_POLICY,
  type ReconciliationResult,
  type SegmentContribution,
  type SegmentPolicy,
} from './types.ts';

interface ReconcileArgs {
  supabase: any;
  clientId: string;
  forceEnabled?: boolean;          // override flag (testing)
  policy?: Partial<SegmentPolicy>;
  userId?: string | null;          // for observability logs
}


interface FlagShape {
  enabled: boolean;
  allowlist?: string[];          // client_ids opted in early
  dragFactorOverride?: number;   // override DEFAULT_SEGMENT_POLICY.commercialDragFactor
}

async function readFlag(supabase: any): Promise<FlagShape> {
  try {
    const { data } = await supabase
      .from('feature_flags')
      .select('value')
      .eq('key', 'bcSegmentEngine')
      .maybeSingle();
    if (!data) return { enabled: false };
    const v = data.value;
    if (v && typeof v === 'object') {
      return {
        enabled: !!v.enabled,
        allowlist: Array.isArray(v.allowlist) ? v.allowlist.filter((x: any) => typeof x === 'string') : undefined,
        dragFactorOverride: typeof v.dragFactorOverride === 'number' ? v.dragFactorOverride : undefined,
      };
    }
    return { enabled: !!v };
  } catch (_) {
    return { enabled: false };
  }
}

async function logHealth(
  supabase: any,
  status: 'success' | 'error' | 'skipped',
  durationMs: number,
  userId: string | null,
  clientId: string,
  errorMessage?: string,
) {
  try {
    await supabase.from('api_health_log').insert({
      service_name: 'bc-segment-engine',
      endpoint: `client:${clientId}`,
      status,
      response_time_ms: Math.max(0, Math.round(durationMs)),
      error_message: errorMessage ?? null,
      user_id: userId,
    });
  } catch (_) { /* never let logging break BC calc */ }
}

function emptyResult(enabled: boolean): ReconciliationResult {
  return {
    enabled,
    triggered: false,
    segmentBreakdown: [],
    totals: { additionalAnnualNoi: 0, additionalAnnualDebtService: 0, additionalHeadroom: 0 },
    overlays: { extraMonthlyCommitments: 0, extraShadedAnnualIncome: 0, extraDtiDenominator: 0, portfolioCapacityDelta: 0 },
    warnings: [],
  };
}


export async function reconcileSegments(args: ReconcileArgs): Promise<ReconciliationResult> {
  const { supabase, clientId, forceEnabled, policy: overrides } = args;
  const flagOn = forceEnabled ?? await isFlagEnabled(supabase);

  if (!flagOn) return emptyResult(false);

  const policy: SegmentPolicy = {
    ...DEFAULT_SEGMENT_POLICY,
    ...overrides,
    commercial: { ...DEFAULT_SEGMENT_POLICY.commercial, ...overrides?.commercial },
    industrial: { ...DEFAULT_SEGMENT_POLICY.industrial, ...overrides?.industrial },
  };

  // Hard timeout budget — fall back to empty if any segment hangs > 6s
  const timeout = <T>(p: Promise<T>, ms = 6000, fallback?: T): Promise<T> =>
    new Promise((resolve) => {
      const t = setTimeout(() => resolve(fallback as T), ms);
      p.then(v => { clearTimeout(t); resolve(v); }).catch(() => { clearTimeout(t); resolve(fallback as T); });
    });

  const empty = emptyResult(true).segmentBreakdown;
  const [commercial, industrial] = await Promise.all([
    timeout(evaluateCommercialSegment(supabase, clientId, policy), 6000, {
      assetClass: 'commercial', propertyCount: 0, properties: [],
      grossAnnualIncome: 0, shadedAnnualIncome: 0, annualDebtService: 0,
      maxLoanByIcr: 0, maxLoanByDscr: 0, maxLoanByLvr: 0,
      headroom: 0, icr: 0, dscr: 0, weightedLvr: 0,
      band: 'green', warnings: ['commercial segment timed out'], assumptions: [],
    } as SegmentContribution),
    timeout(evaluateIndustrialSegment(supabase, clientId, policy), 6000, {
      assetClass: 'industrial', propertyCount: 0, properties: [],
      grossAnnualIncome: 0, shadedAnnualIncome: 0, annualDebtService: 0,
      maxLoanByIcr: 0, maxLoanByDscr: 0, maxLoanByLvr: 0,
      headroom: 0, icr: 0, dscr: 0, weightedLvr: 0,
      band: 'green', warnings: ['industrial segment timed out'], assumptions: [],
    } as SegmentContribution),
  ]);

  const breakdown: SegmentContribution[] = [];
  if (commercial.propertyCount > 0) breakdown.push(commercial);
  if (industrial.propertyCount > 0) breakdown.push(industrial);

  if (breakdown.length === 0) return emptyResult(true);

  const additionalAnnualNoi = commercial.grossAnnualIncome + industrial.grossAnnualIncome;
  const additionalAnnualDebtService = commercial.annualDebtService + industrial.annualDebtService;

  // Apply commercial drag factor to negative-headroom segments
  const drag = policy.commercialDragFactor;
  const additionalHeadroom = breakdown.reduce((sum, seg) => {
    const factor = seg.headroom < 0 ? drag : 1;
    return sum + seg.headroom * factor;
  }, 0);

  const warnings = [...commercial.warnings, ...industrial.warnings];

  return {
    enabled: true,
    triggered: true,
    segmentBreakdown: breakdown,
    totals: {
      additionalAnnualNoi: Math.round(additionalAnnualNoi),
      additionalAnnualDebtService: Math.round(additionalAnnualDebtService),
      additionalHeadroom: Math.round(additionalHeadroom),
    },
    overlays: {
      // Commercial/industrial debt service rolled into residential commitments
      extraMonthlyCommitments: Math.round(additionalAnnualDebtService / 12),
      // NOI added to shaded income (treated as already net of opex/vacancy)
      extraShadedAnnualIncome: Math.round(additionalAnnualNoi),
      // DTI denominator overlay — only when policy allows
      extraDtiDenominator: policy.dtiIncludeCommercialNoi ? Math.round(additionalAnnualNoi) : 0,
      // Net delta to portfolio capacity vs residential-only baseline
      portfolioCapacityDelta: Math.round(additionalHeadroom),
    },
    warnings,
  };
}
