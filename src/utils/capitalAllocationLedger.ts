/**
 * Phase K1 — Capital Allocation Ledger
 *
 * Pure helpers that:
 *   1) Walk source-emitting deltas (equity_release, portfolio_lvr_release,
 *      property_sell, plus context.cashOnHand) and accumulate a per-pool
 *      cash ledger.
 *   2) Resolve every `capital_allocation` delta into a typed sink effect
 *      (commitment delta, debt-balance delta, deposit contribution, notes).
 *   3) Validate the ledger (overcommit, missing targets, exceeded balances).
 *
 * The same logic is mirrored in `supabase/functions/_shared/capitalAllocationLedger.ts`
 * for server-side parity. Keep them in sync.
 *
 * Design notes:
 *   - Sources contribute their FULL net cash to the pool (so the unallocated
 *     remainder remains the path to the acquisition deposit, preserving
 *     backward compatibility with the legacy "release → deposit" flow).
 *   - Sinks consume from the pool. Overcommit is flagged as an `error` issue
 *     and the engine clamps each sink at the remaining balance to keep math
 *     internally consistent.
 *   - `acquisition_deposit` sinks are explicit "reserve $X for the next
 *     purchase deposit" choices — they consume from the pool and route the
 *     amount to `depositContribution`, which is added on top of the implicit
 *     remainder when computing acquisition cash.
 */

import type {
  ScenarioDelta,
  CapitalLedger,
  CapitalPoolLedger,
  CapitalSinkType,
  CapitalSinkEntry,
  CapitalSourceEntry,
  ScenarioValidationIssue,
} from './borrowingCapacityTypes';

// ── Local context shape (subset of ScenarioContext used by the ledger) ──
export interface LedgerContext {
  properties: Array<{
    id: string;
    address: string;
    propertyType?: string;
    currentValue: number;
    loanRemaining: number;
    monthlyRepayment: number;
    loanRepaymentAmount?: number;
    interestRate?: number;
  }>;
  liabilities: Array<{
    id: string;
    label: string;
    type?: string;
    balance: number;
    monthlyServicing: number;
  }>;
  cashOnHand?: number;
  /** Per-property gross release amounts produced by source-emitting deltas
   *  on this run. Required to attribute the pool inflow accurately. Map keyed
   *  by deltaId so a single source contributes once. */
  sourceContributions: Array<{
    deltaId: string;
    sourceType: CapitalSourceEntry['sourceType'];
    label: string;
    amount: number;
  }>;
}

export interface SinkAggregate {
  /** Net commitment $/mo across all sinks (negative = saving). */
  monthlyServicingDelta: number;
  /** Net debt-balance $ across all sinks (negative = paydown). */
  debtBalanceDelta: number;
  /** Cash explicitly reserved for next-purchase deposit by sinks. */
  depositContribution: number;
  /** Audit notes from each sink. */
  notes: string[];
}

const DEFAULT_POOL_ID = 'pool-default';

/** Build the full ledger from sources + capital_allocation deltas, and
 *  compute aggregated sink effects + validation issues. */
export function buildCapitalLedger(
  deltas: ScenarioDelta[],
  ctx: LedgerContext,
): {
  ledger: CapitalLedger;
  sinkAggregate: SinkAggregate;
  issues: ScenarioValidationIssue[];
} {
  const issues: ScenarioValidationIssue[] = [];
  const pools: Record<string, CapitalPoolLedger> = {};

  // ── Step 1: collect SOURCES ─────────────────────────────────────────
  // Cash on hand is treated as a source on the default pool so allocation
  // sinks can draw from it explicitly (e.g. cash → liability_payoff).
  if ((ctx.cashOnHand ?? 0) > 0) {
    ensurePool(pools, DEFAULT_POOL_ID).sources.push({
      deltaId: 'cash-on-hand',
      sourceType: 'cash_on_hand',
      label: 'Cash on hand',
      amount: ctx.cashOnHand ?? 0,
    });
  }
  for (const src of ctx.sourceContributions) {
    if (src.amount <= 0) continue;
    ensurePool(pools, DEFAULT_POOL_ID).sources.push({
      deltaId: src.deltaId,
      sourceType: src.sourceType,
      label: src.label,
      amount: src.amount,
    });
  }

  // ── Step 2: process SINKS ───────────────────────────────────────────
  const sinkAggregate: SinkAggregate = {
    monthlyServicingDelta: 0,
    debtBalanceDelta: 0,
    depositContribution: 0,
    notes: [],
  };

  // Pre-compute totals so we can clamp sinks against their pool's balance
  // in a deterministic order (deltas array order).
  for (const poolId of Object.keys(pools)) {
    pools[poolId].totalIn = pools[poolId].sources.reduce((s, x) => s + x.amount, 0);
    pools[poolId].remainder = pools[poolId].totalIn;
  }

  for (const d of deltas) {
    if (d.type !== 'capital_allocation') continue;
    const sinkType = (d.meta?.sinkType as CapitalSinkType | undefined);
    const poolId = (d.meta?.sourcePool as string | undefined) || DEFAULT_POOL_ID;
    const requested = Math.max(0, Number(d.value) || 0);

    if (!sinkType) {
      issues.push({
        deltaId: d.id,
        deltaType: d.type,
        severity: 'error',
        message: 'capital_allocation missing meta.sinkType',
      });
      continue;
    }

    const pool = ensurePool(pools, poolId);
    const available = Math.max(0, pool.remainder);
    const allocated = Math.min(requested, available);
    if (allocated < requested) {
      issues.push({
        deltaId: d.id,
        deltaType: d.type,
        severity: 'error',
        message: `Allocation $${Math.round(requested).toLocaleString()} exceeds pool "${poolId}" remainder $${Math.round(available).toLocaleString()}. Clamped to $${Math.round(allocated).toLocaleString()}.`,
      });
      pool.overcommitted = true;
    }
    if (allocated <= 0) continue;

    const sinkEntry = resolveSink(sinkType, d, allocated, ctx, issues);
    pool.sinks.push({
      deltaId: d.id,
      sinkType,
      label: sinkEntry.label,
      amount: allocated,
      monthlyServicingDelta: sinkEntry.monthlyServicingDelta,
      debtBalanceDelta: sinkEntry.debtBalanceDelta,
      notes: sinkEntry.notes,
    });
    pool.remainder = Math.max(0, pool.remainder - allocated);

    sinkAggregate.monthlyServicingDelta += sinkEntry.monthlyServicingDelta;
    sinkAggregate.debtBalanceDelta += sinkEntry.debtBalanceDelta;
    sinkAggregate.depositContribution += sinkEntry.depositContribution;
    if (sinkEntry.notes.length) sinkAggregate.notes.push(...sinkEntry.notes);
  }

  // ── Step 3: finalise pool totals ────────────────────────────────────
  for (const poolId of Object.keys(pools)) {
    const p = pools[poolId];
    p.totalOut = p.sinks.reduce((s, x) => s + x.amount, 0);
    p.remainder = Math.max(0, p.totalIn - p.totalOut);
  }

  return { ledger: { pools }, sinkAggregate, issues };
}

// ── Sink resolvers ────────────────────────────────────────────────────

interface ResolvedSink {
  label: string;
  monthlyServicingDelta: number;
  debtBalanceDelta: number;
  depositContribution: number;
  notes: string[];
}

function resolveSink(
  sinkType: CapitalSinkType,
  delta: ScenarioDelta,
  allocated: number,
  ctx: LedgerContext,
  issues: ScenarioValidationIssue[],
): ResolvedSink {
  const targetId = delta.meta?.sinkTargetId as string | undefined;
  switch (sinkType) {
    case 'liability_payoff': {
      const liab = ctx.liabilities.find((l) => l.id === targetId);
      if (!liab) {
        issues.push({
          deltaId: delta.id,
          deltaType: delta.type,
          severity: 'warning',
          message: `liability_payoff sink: target "${targetId}" not found — allocation has no servicing effect.`,
        });
        return blankSink(`Pay down (target missing)`, allocated);
      }
      const usable = Math.min(allocated, Math.max(0, liab.balance));
      if (usable < allocated) {
        issues.push({
          deltaId: delta.id,
          deltaType: delta.type,
          severity: 'warning',
          message: `Allocation $${Math.round(allocated).toLocaleString()} exceeds "${liab.label}" balance $${Math.round(liab.balance).toLocaleString()}. Capped.`,
        });
      }
      const ratio = liab.balance > 0 ? usable / liab.balance : 0;
      const servicingSaving = -liab.monthlyServicing * ratio;
      return {
        label: `Pay down ${liab.label}`,
        monthlyServicingDelta: servicingSaving,
        debtBalanceDelta: -usable,
        depositContribution: 0,
        notes: [
          `Pay down ${liab.label}: $${Math.round(usable).toLocaleString()} (${(ratio * 100).toFixed(0)}% of balance) → ${servicingSaving < 0 ? '−' : ''}$${Math.round(Math.abs(servicingSaving)).toLocaleString()}/mo`,
        ],
      };
    }
    case 'offset_deposit': {
      const prop = ctx.properties.find((p) => p.id === targetId);
      if (!prop) {
        issues.push({
          deltaId: delta.id,
          deltaType: delta.type,
          severity: 'warning',
          message: `offset_deposit sink: target property "${targetId}" not found.`,
        });
        return blankSink('Offset deposit (target missing)', allocated);
      }
      const ratePoints = Number(delta.meta?.offsetRatePoints) || prop.interestRate || 6.0;
      // Offset cancels interest on the offset balance, capped at loan balance
      const usable = Math.min(allocated, Math.max(0, prop.loanRemaining));
      if (usable < allocated) {
        issues.push({
          deltaId: delta.id,
          deltaType: delta.type,
          severity: 'warning',
          message: `Offset $${Math.round(allocated).toLocaleString()} exceeds loan balance $${Math.round(prop.loanRemaining).toLocaleString()}. Capped.`,
        });
      }
      const monthlySaving = -(usable * (ratePoints / 100)) / 12;
      return {
        label: `Offset deposit on ${truncate(prop.address, 28)}`,
        monthlyServicingDelta: monthlySaving,
        debtBalanceDelta: 0,
        depositContribution: 0,
        notes: [
          `Offset $${Math.round(usable).toLocaleString()} on ${truncate(prop.address, 28)} @ ${ratePoints.toFixed(2)}% → −$${Math.round(Math.abs(monthlySaving)).toLocaleString()}/mo interest`,
        ],
      };
    }
    case 'rate_buydown': {
      const prop = ctx.properties.find((p) => p.id === targetId);
      if (!prop || prop.loanRemaining <= 0) {
        issues.push({
          deltaId: delta.id,
          deltaType: delta.type,
          severity: 'warning',
          message: `rate_buydown sink: target property "${targetId}" not found or has no loan.`,
        });
        return blankSink('Rate buy-down (target missing)', allocated);
      }
      // Industry rule of thumb: 1% of loan balance buys down ~25 bps for 30yr
      const buydownEfficiency = 0.25 / 100; // bps per dollar-percent
      const ratePoints = Number(delta.meta?.rateBuydownPoints);
      const buydown = Number.isFinite(ratePoints) && ratePoints > 0
        ? Math.min(2.0, ratePoints) // hard cap @ 2pp
        : Math.min(2.0, (allocated / prop.loanRemaining) * buydownEfficiency * 100);
      const oldRate = prop.interestRate ?? 6.5;
      const newRate = Math.max(0.5, oldRate - buydown);
      const cur = prop.loanRepaymentAmount || prop.monthlyRepayment || 0;
      const isIo = cur > 0 && Math.abs(cur - prop.loanRemaining * (oldRate / 100 / 12)) / Math.max(1, prop.loanRemaining * (oldRate / 100 / 12)) < 0.05;
      const newMr = newRate / 100 / 12;
      const newRep = isIo
        ? prop.loanRemaining * newMr
        : (newMr > 0
            ? prop.loanRemaining * (newMr * Math.pow(1 + newMr, 360)) / (Math.pow(1 + newMr, 360) - 1)
            : prop.loanRemaining / 360);
      const servicingDelta = newRep - cur;
      return {
        label: `Rate buy-down on ${truncate(prop.address, 28)}`,
        monthlyServicingDelta: servicingDelta,
        debtBalanceDelta: 0,
        depositContribution: 0,
        notes: [
          `Buy-down $${Math.round(allocated).toLocaleString()} on ${truncate(prop.address, 28)}: ${oldRate.toFixed(2)}% → ${newRate.toFixed(2)}% (−${(buydown * 100).toFixed(0)} bps), ${servicingDelta >= 0 ? '+' : '−'}$${Math.round(Math.abs(servicingDelta)).toLocaleString()}/mo`,
        ],
      };
    }
    case 'debt_recycle': {
      // Pay down OO loan with cash, redraw as IP loan.
      // Servicing-neutral (same balance, same rate). Tax effect is captured
      // by the negative-gearing add-back logic on the engine side via a note.
      const prop = ctx.properties.find((p) => p.id === targetId);
      const ratePoints = prop?.interestRate ?? 6.0;
      return {
        label: `Debt-recycle ${prop ? truncate(prop.address, 28) : 'OO loan'}`,
        monthlyServicingDelta: 0,
        debtBalanceDelta: 0,
        depositContribution: 0,
        notes: [
          `Debt-recycle $${Math.round(allocated).toLocaleString()}${prop ? ` against ${truncate(prop.address, 28)}` : ''} @ ${ratePoints.toFixed(2)}% → interest now tax-deductible. Confirm with accountant; servicing impact is recognised via negative-gearing add-back at year-end.`,
        ],
      };
    }
    case 'acquisition_deposit': {
      return {
        label: 'Reserve as acquisition deposit',
        monthlyServicingDelta: 0,
        debtBalanceDelta: 0,
        depositContribution: allocated,
        notes: [
          `Reserve $${Math.round(allocated).toLocaleString()} as acquisition deposit (next purchase).`,
        ],
      };
    }
    case 'holding_reserve': {
      return {
        label: 'Hold as cash buffer',
        monthlyServicingDelta: 0,
        debtBalanceDelta: 0,
        depositContribution: 0,
        notes: [
          `Hold $${Math.round(allocated).toLocaleString()} as cash buffer (no servicing impact).`,
        ],
      };
    }
    case 'repayment_reduction': {
      const monthlyCut = Number(delta.meta?.repaymentReductionMonthly) || 0;
      const prop = ctx.properties.find((p) => p.id === targetId);
      const liab = !prop ? ctx.liabilities.find((l) => l.id === targetId) : undefined;
      const targetServicing = prop?.loanRepaymentAmount || prop?.monthlyRepayment || liab?.monthlyServicing || 0;
      const safeCut = Math.min(monthlyCut, targetServicing);
      if (monthlyCut > targetServicing) {
        issues.push({
          deltaId: delta.id,
          deltaType: delta.type,
          severity: 'error',
          message: `Repayment reduction $${Math.round(monthlyCut).toLocaleString()}/mo exceeds target servicing $${Math.round(targetServicing).toLocaleString()}/mo. Capped.`,
        });
      }
      const targetLabel = prop ? truncate(prop.address, 28) : (liab?.label || 'target loan');
      return {
        label: `Reduce repayment on ${targetLabel}`,
        monthlyServicingDelta: -safeCut,
        debtBalanceDelta: 0,
        depositContribution: 0,
        notes: [
          `Apply $${Math.round(allocated).toLocaleString()} from pool to reduce ${targetLabel} repayment by $${Math.round(safeCut).toLocaleString()}/mo (capped at original $${Math.round(targetServicing).toLocaleString()}/mo).`,
        ],
      };
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function ensurePool(pools: Record<string, CapitalPoolLedger>, poolId: string): CapitalPoolLedger {
  if (!pools[poolId]) {
    pools[poolId] = {
      poolId,
      sources: [],
      sinks: [],
      totalIn: 0,
      totalOut: 0,
      remainder: 0,
      overcommitted: false,
    };
  }
  return pools[poolId];
}

function blankSink(label: string, allocated: number): ResolvedSink {
  return {
    label,
    monthlyServicingDelta: 0,
    debtBalanceDelta: 0,
    depositContribution: 0,
    notes: [`(${label}) — $${Math.round(allocated).toLocaleString()} parked, no effect`],
  };
}

function truncate(s: string | undefined, n: number): string {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
