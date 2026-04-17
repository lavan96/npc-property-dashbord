/**
 * Scenario Delta Engine — Phase B (Engine Unification)
 *
 * SINGLE SOURCE OF TRUTH for what-if scenario math.
 *
 * The same engine is used by:
 *   1. Edge function (`calculate-borrowing-capacity` server-side replay)
 *   2. Strategy Scenario Builder (`StrategyScenarioModeling` UI)
 *   3. AI Strategy Advisor (Apply Scenario flow)
 *   4. PDF report generators (scenario comparison pages)
 *
 * For Deno parity, `supabase/functions/_shared/scenarioDeltaEngine.ts` mirrors
 * this file structurally. Both are covered by parity tests.
 *
 * Engine contract:
 *   1. Take base BorrowingCapacityInput + an array of ScenarioDelta objects
 *   2. Resolve every entity-bound delta against the ScenarioContext (warns on
 *      unknown property/liability IDs to catch AI hallucinations)
 *   3. Aggregate net adjustments (income / expense / commitments / rate / debt
 *      balance / loan term / DTI cap)
 *   4. Replay calculateBorrowingCapacity with the adjusted inputs
 *   5. Return ScenarioCapacityResult with capacity-change comparison + warnings
 */

import {
  calculateBorrowingCapacity,
  type BorrowingCapacityInput,
  type BorrowingCapacityResult,
} from './borrowingCapacityCalculations';
import {
  type ScenarioDelta,
  type ScenarioCapacityResult,
  type AcquisitionCapacity,
  buildScenarioChange,
} from './borrowingCapacityTypes';
import { estimateLMI, type LmiMode } from './lmiCalculations';
import {
  calculateStampDuty,
  estimateOtherAcquisitionCosts,
  type AustralianState,
  type PurchaseIntent,
  type PropertyCategory,
} from './stampDutyCalculator';
import {
  resolveLenderProfile,
  reshadeIncome,
  BANK_STANDARD_PROFILE,
  type ScenarioIncomeComponent,
} from './lenderShadingProfiles';

// ============================================
// CONTEXT TYPES
// ============================================

export interface AcquisitionContext {
  state?: AustralianState;
  intent?: PurchaseIntent;
  category?: PropertyCategory;
  isFirstHomeBuyer?: boolean;
  isForeignBuyer?: boolean;
  lmiMode?: LmiMode;
  /** Cash on hand brought to settlement (in addition to released equity) */
  cashOnHand?: number;
  /** Phase F2 — target purchase price the strategy is trying to hit.
   *  When set, AcquisitionCapacity reports `meetsTarget` + `shortfallToTarget`
   *  and exposes `loanRequiredForPurchase` / `netCashAfterSettlement` so the
   *  Strategy Builder can show "achievable" / "short by $X" feedback. */
  targetPurchasePrice?: number;
}

export interface ScenarioContext {
  baseInputs: BorrowingCapacityInput;
  baseResult: BorrowingCapacityResult;
  properties?: ScenarioProperty[];
  liabilities?: ScenarioLiability[];
  acquisition?: AcquisitionContext;
  /** Phase I1 — typed income components for lender-aware re-shading. */
  incomeComponents?: ScenarioIncomeComponent[];
  /** Phase I1 — current lender profile id (defaults to bank_standard). */
  currentLenderProfileId?: string;
  /** Phase I2 — monthly HEM benchmark; engine floors expenses here. */
  hemBenchmark?: number;
}

export interface ScenarioProperty {
  id: string;
  address: string;
  propertyType: string;
  currentValue: number;
  loanRemaining: number;
  /** Servicing repayment used in commitments (P&I or IO) */
  monthlyRepayment: number;
  loanRepaymentAmount?: number;
  /** Net monthly cash flow (rent − expenses), positive or negative */
  netMonthlyCashflow?: number;
  monthlyRentalIncome?: number;
  /** Phase F1 — contracted annual interest rate on this property's loan (%).
   *  Used by `equity_release`, `property_refinance`, and `property_rate_change`
   *  deltas instead of the global `baseInputs.interestRate`. */
  interestRate?: number;
}

export interface ScenarioLiability {
  id: string;
  type: string;
  label: string;
  balance: number;
  limit?: number;
  monthlyServicing: number;
}

// ============================================
// EFFECT AGGREGATOR
// ============================================

export interface DeltaEffect {
  incomeAdjustment: number;
  shadedIncomeAdjustment: number;
  expenseAdjustment: number;
  commitmentAdjustment: number;
  rateAdjustment: number;
  loanTermAdjustment: number;
  debtBalanceAdjustment: number;
  dtiCapEnabled?: boolean;
  dtiCapLimit?: number;
  /** Phase I1 — lender profile id to apply during aggregation. */
  lenderProfileOverride?: string;
  /** Phase C: cash freed from equity-release deltas (post-LMI on the release loan) */
  releasedCapital: number;
  /** Phase C: notes from equity-release / acquisition levers (audit trail) */
  acquisitionNotes: string[];
  description: string;
}

function emptyEffect(description = ''): DeltaEffect {
  return {
    incomeAdjustment: 0,
    shadedIncomeAdjustment: 0,
    expenseAdjustment: 0,
    commitmentAdjustment: 0,
    rateAdjustment: 0,
    loanTermAdjustment: 0,
    debtBalanceAdjustment: 0,
    releasedCapital: 0,
    acquisitionNotes: [],
    description,
  };
}

/** Blended shading ratio derived from the client's actual income profile.
 *  Used as the fallback for absolute income deltas where the AI/operator
 *  hasn't specified a shading category — keeps scenarios aligned with the
 *  base assessment instead of defaulting to a magic 0.8.
 */
function blendedShadingRatio(ctx: ScenarioContext): number {
  const gross = ctx.baseInputs.grossAnnualIncome;
  const shaded = ctx.baseInputs.shadedAnnualIncome;
  if (gross <= 0) return 0.8;
  return Math.max(0, Math.min(1, shaded / gross));
}

// ── Phase E (M3 fix): HEM tier-aware expense recompute ─────────────────
// Mirrors `policyEngine.DEFAULT_HEM_CONFIG.incomeScaling`. When an
// income-growth or portfolio-sell delta moves the client into a new HEM
// tier, the assumed monthly living-expense floor must scale with it —
// otherwise high-income scenarios under-estimate expenses and overstate
// borrowing capacity.
const HEM_TIER_MULTIPLIERS: Array<{ maxIncome: number; multiplier: number }> = [
  { maxIncome: 80000,  multiplier: 1.00 },
  { maxIncome: 120000, multiplier: 1.15 },
  { maxIncome: 180000, multiplier: 1.30 },
  { maxIncome: 250000, multiplier: 1.50 },
  { maxIncome: Infinity, multiplier: 1.75 },
];

function hemMultiplierFor(grossAnnualIncome: number): number {
  for (const tier of HEM_TIER_MULTIPLIERS) {
    if (grossAnnualIncome <= tier.maxIncome) return tier.multiplier;
  }
  return HEM_TIER_MULTIPLIERS[HEM_TIER_MULTIPLIERS.length - 1].multiplier;
}

function computeHemTierDelta(
  baseGrossAnnualIncome: number,
  newGrossAnnualIncome: number,
  baseMonthlyExpenses: number,
): number {
  if (baseMonthlyExpenses <= 0) return 0;
  const baseMult = hemMultiplierFor(Math.max(0, baseGrossAnnualIncome));
  const newMult = hemMultiplierFor(Math.max(0, newGrossAnnualIncome));
  if (baseMult === newMult) return 0;
  const rescaled = baseMonthlyExpenses * (newMult / baseMult);
  const delta = rescaled - baseMonthlyExpenses;
  const cap = baseMonthlyExpenses * 0.30;
  return Math.max(-cap, Math.min(cap, delta));
}

// ============================================
// VALIDATION (Phase B safety net)
// ============================================

export interface DeltaValidationIssue {
  deltaId: string;
  deltaType: string;
  severity: 'warning' | 'error';
  message: string;
}

/** Validate deltas against the available context. Surfaces unknown
 *  property/liability IDs (AI hallucination guard) and obviously broken
 *  numeric inputs. Engine still runs — these are informational. */
export function validateDeltas(
  deltas: ScenarioDelta[],
  context: ScenarioContext,
): DeltaValidationIssue[] {
  const issues: DeltaValidationIssue[] = [];
  const propertyIds = new Set((context.properties || []).map(p => p.id));
  const liabilityIds = new Set((context.liabilities || []).map(l => l.id));

  for (const d of deltas) {
    if (!Number.isFinite(d.value)) {
      issues.push({ deltaId: d.id, deltaType: d.type, severity: 'error', message: 'Non-finite value' });
      continue;
    }
    switch (d.type) {
      case 'property_sell':
      case 'property_refinance':
      case 'equity_release':
      case 'property_rate_change':
      case 'property_value_change':
        if (!propertyIds.has(d.id)) {
          issues.push({
            deltaId: d.id,
            deltaType: d.type,
            severity: 'warning',
            message: `Property "${d.id}" not found in client portfolio — delta ignored`,
          });
        }
        if (d.type === 'property_rate_change' && (d.value < 0.5 || d.value > 25)) {
          issues.push({
            deltaId: d.id,
            deltaType: d.type,
            severity: 'warning',
            message: `Property rate ${d.value}% outside plausible 0.5–25% band`,
          });
        }
        if (d.type === 'property_value_change') {
          if (d.unit === 'percent' && Math.abs(d.value) > 100) {
            issues.push({
              deltaId: d.id,
              deltaType: d.type,
              severity: 'warning',
              message: `Valuation uplift ${d.value}% exceeds ±100% — likely a data entry error`,
            });
          }
          if (d.unit === 'absolute' && d.value <= 0) {
            issues.push({
              deltaId: d.id,
              deltaType: d.type,
              severity: 'error',
              message: `Absolute valuation must be positive (got ${d.value})`,
            });
          }
          // basis is required so finance can audit the assumption
          const basis = d.meta?.basis as string | undefined;
          if (!basis) {
            issues.push({
              deltaId: d.id,
              deltaType: d.type,
              severity: 'warning',
              message: 'Valuation override missing `meta.basis` — PDF will watermark as unverified',
            });
          }
        }
        break;
      case 'portfolio_lvr_release': {
        const ids = (d.meta?.propertyIds as string[] | undefined) || [];
        if (!Array.isArray(ids) || ids.length === 0) {
          issues.push({
            deltaId: d.id,
            deltaType: d.type,
            severity: 'error',
            message: 'Pool release missing `meta.propertyIds` — at least one property required',
          });
        } else {
          for (const pid of ids) {
            if (!propertyIds.has(pid)) {
              issues.push({
                deltaId: d.id,
                deltaType: d.type,
                severity: 'warning',
                message: `Pool member "${pid}" not in portfolio — excluded from blended LVR`,
              });
            }
          }
        }
        const target = d.unit === 'percent' ? d.value / 100 : d.value;
        if (!Number.isFinite(target) || target <= 0 || target > 0.97) {
          issues.push({
            deltaId: d.id,
            deltaType: d.type,
            severity: 'warning',
            message: `Blended target LVR ${(target * 100).toFixed(1)}% outside 0–97% sane band`,
          });
        }
        break;
      }
      case 'liability_payoff':
        if (!liabilityIds.has(d.id)) {
          issues.push({
            deltaId: d.id,
            deltaType: d.type,
            severity: 'warning',
            message: `Liability "${d.id}" not found — delta ignored`,
          });
        }
        break;
      case 'rate_change':
        if (Math.abs(d.value) > 10) {
          issues.push({ deltaId: d.id, deltaType: d.type, severity: 'warning', message: 'Rate change exceeds ±10pp — likely unrealistic' });
        }
        break;
      case 'loan_term_change':
        if (Math.abs(d.value) > 30) {
          issues.push({ deltaId: d.id, deltaType: d.type, severity: 'warning', message: 'Loan term change exceeds ±30 years' });
        }
        break;
    }
  }
  return issues;
}

// ============================================
// DELTA APPLICATION
// ============================================

export function applyDelta(delta: ScenarioDelta, context: ScenarioContext): DeltaEffect {
  const effect = emptyEffect(delta.label || delta.type);
  const shadingRatio = blendedShadingRatio(context);

  switch (delta.type) {
    case 'income_change': {
      if (delta.unit === 'percent') {
        const factor = delta.value / 100;
        effect.incomeAdjustment = context.baseInputs.grossAnnualIncome * factor;
        effect.shadedIncomeAdjustment = context.baseInputs.shadedAnnualIncome * factor;
      } else {
        effect.incomeAdjustment = delta.value;
        effect.shadedIncomeAdjustment = delta.value * shadingRatio;
      }
      break;
    }

    case 'expense_change': {
      if (delta.unit === 'percent') {
        effect.expenseAdjustment = context.baseInputs.monthlyLivingExpenses * (delta.value / 100);
      } else {
        effect.expenseAdjustment = delta.value;
      }
      break;
    }

    case 'debt_change': {
      if (delta.unit === 'percent') {
        const factor = delta.value / 100;
        effect.commitmentAdjustment = context.baseInputs.monthlyCommitments * factor;
        effect.debtBalanceAdjustment = (context.baseInputs.totalDebtBalances || 0) * factor;
      } else {
        effect.commitmentAdjustment = delta.value;
        // Approximate balance change from monthly servicing using a 25-year P&I duration factor
        effect.debtBalanceAdjustment = delta.value * 200;
      }
      break;
    }

    case 'rate_change':
      effect.rateAdjustment = delta.value;
      break;

    case 'loan_term_change':
      // value is years (positive = extend, negative = shorten)
      effect.loanTermAdjustment = delta.value;
      break;

    case 'dti_cap_change': {
      // meta.enabled drives toggle, value is the cap multiple (e.g. 6.0)
      const enabled = (delta.meta?.enabled as boolean | undefined) ?? true;
      effect.dtiCapEnabled = enabled;
      if (enabled) effect.dtiCapLimit = delta.value;
      break;
    }

    case 'property_sell': {
      const property = context.properties?.find(p => p.id === delta.id);
      if (property) {
        const loanServicing = property.loanRepaymentAmount || property.monthlyRepayment || 0;
        if (loanServicing > 0) effect.commitmentAdjustment = -loanServicing;
        if (property.loanRemaining > 0) effect.debtBalanceAdjustment = -property.loanRemaining;
        const cf = property.netMonthlyCashflow || 0;
        if (cf > 0) {
          effect.incomeAdjustment = -(cf * 12);
          effect.shadedIncomeAdjustment = -(cf * 12 * shadingRatio);
        } else if (cf < 0) {
          // Removing a negative-cash-flow property reduces expenses → expenseAdjustment is negative
          effect.expenseAdjustment = cf;
        }
        effect.description = `Sell ${property.address?.slice(0, 30) || 'property'}`;
      }
      break;
    }

    case 'property_refinance': {
      const property = context.properties?.find(p => p.id === delta.id);
      if (property && property.loanRemaining > 0) {
        const currentRepayment = property.loanRepaymentAmount || property.monthlyRepayment || 0;
        // Phase F1 — use the property's own contracted rate (fallback to global)
        const propertyRatePct = property.interestRate ?? context.baseInputs.interestRate;
        const ioMonthlyRate = propertyRatePct / 100 / 12;
        const ioRepayment = property.loanRemaining * ioMonthlyRate;
        const saving = Math.max(0, currentRepayment - ioRepayment);
        if (saving > 0) effect.commitmentAdjustment = -saving;
        effect.acquisitionNotes.push(
          `Refinance ${property.address?.slice(0, 30) || 'property'} P&I→IO @ ${propertyRatePct.toFixed(2)}%: monthly servicing −$${Math.round(saving).toLocaleString()}`
        );
        effect.description = `Refinance ${property.address?.slice(0, 30) || 'property'} to IO`;
      }
      break;
    }

    case 'property_rate_change': {
      // Phase F1 — repricing a single property (e.g. negotiated refinance to a
      // lower rate). Recomputes that property's monthly servicing using the
      // NEW rate, keeping the existing repayment structure (P&I vs IO) intact.
      const property = context.properties?.find(p => p.id === delta.id);
      if (property && property.loanRemaining > 0 && Number.isFinite(delta.value) && delta.value > 0) {
        const currentRepayment = property.loanRepaymentAmount || property.monthlyRepayment || 0;
        const oldRatePct = property.interestRate ?? context.baseInputs.interestRate;
        const newRatePct = delta.value;

        // Infer current structure from the relationship between repayment & loan.
        // If repayment looks like IO at the current rate, keep IO at the new rate.
        // Otherwise treat as P&I over the policy-default term.
        const monthlyOldIO = property.loanRemaining * (oldRatePct / 100 / 12);
        const isIo = currentRepayment > 0 && Math.abs(currentRepayment - monthlyOldIO) / Math.max(1, monthlyOldIO) < 0.05;

        let newRepayment: number;
        if (isIo) {
          newRepayment = property.loanRemaining * (newRatePct / 100 / 12);
        } else {
          const termYears = context.baseInputs.loanTermYears || 30;
          const periods = termYears * 12;
          const monthlyRate = newRatePct / 100 / 12;
          newRepayment = monthlyRate > 0
            ? property.loanRemaining * (monthlyRate * Math.pow(1 + monthlyRate, periods)) / (Math.pow(1 + monthlyRate, periods) - 1)
            : property.loanRemaining / periods;
        }

        const delta$ = newRepayment - currentRepayment;
        effect.commitmentAdjustment = delta$;
        effect.acquisitionNotes.push(
          `Reprice ${property.address?.slice(0, 30) || 'property'}: ${oldRatePct.toFixed(2)}% → ${newRatePct.toFixed(2)}% ${isIo ? '(IO)' : '(P&I)'}, monthly servicing ${delta$ >= 0 ? '+' : '−'}$${Math.round(Math.abs(delta$)).toLocaleString()}`
        );
        effect.description = `Reprice ${property.address?.slice(0, 30) || 'property'} to ${newRatePct.toFixed(2)}%`;
      }
      break;
    }

    case 'property_add': {
      // Adding a new property — value = estimated monthly net contribution
      if (delta.unit === 'absolute') {
        if (delta.value > 0) {
          effect.incomeAdjustment = delta.value * 12;
          effect.shadedIncomeAdjustment = delta.value * 12 * shadingRatio;
        } else {
          effect.expenseAdjustment = Math.abs(delta.value);
        }
      }
      break;
    }

    case 'liability_payoff': {
      const liability = context.liabilities?.find(l => l.id === delta.id);
      if (liability) {
        effect.commitmentAdjustment = -liability.monthlyServicing;
        effect.debtBalanceAdjustment = -(liability.balance || 0);
        effect.description = `Pay off ${liability.label || liability.type}`;
      }
      break;
    }

    case 'equity_release': {
      // Phase C + F2: Equity-release lever closes the loop between cash freed,
      // the new shadow debt, and the source property's actual contracted rate.
      //
      // Inputs interpreted from the delta:
      //   value: target LVR as a ratio (0.80) OR % (80) OR absolute release amount
      //   meta.targetLVR: optional explicit target LVR (0–1 ratio)
      //   meta.releaseRate: optional override rate for the release loan (% p.a.)
      //   meta.lenderMaxLVR: optional lender ceiling per security (default 0.95)
      //   unit: 'ratio' = LVR ratio, 'percent' = LVR %, 'absolute' = direct $ amount
      //
      // Output:
      //   - releasedCapital ≈ new equity loan − LMI on that loan (cash to settlement)
      //   - commitmentAdjustment += monthly IO repayment on the NEW slice only
      //   - debtBalanceAdjustment += new equity loan principal (DTI honest)
      const property = context.properties?.find(p => p.id === delta.id);
      if (!property || property.currentValue <= 0) break;

      const fhb = !!context.acquisition?.isFirstHomeBuyer;
      // Phase F1/F2 — release loan rate priority:
      //   1. explicit override on the delta (`meta.releaseRate`)
      //   2. property's contracted rate (`property.interestRate`)
      //   3. global assessment rate
      const overrideRate = delta.meta?.releaseRate as number | undefined;
      const ratePct = (Number.isFinite(overrideRate) && (overrideRate as number) > 0)
        ? (overrideRate as number)
        : (property.interestRate ?? context.baseInputs.interestRate ?? 6.5);
      const monthlyRate = (ratePct / 100) / 12;

      // Phase G3 — lender max LVR is now externalised so finance can test 90/95/97.5
      const lenderCap = (delta.meta?.lenderMaxLVR as number | undefined);
      const safeLenderCap = (Number.isFinite(lenderCap) && (lenderCap as number) > 0 && (lenderCap as number) <= 0.99)
        ? (lenderCap as number)
        : 0.95;

      // Resolve the new max loan size on this property
      let newLoan = 0;
      if (delta.unit === 'absolute' && delta.value > 0) {
        newLoan = property.loanRemaining + delta.value;
      } else {
        const targetLVR = delta.unit === 'percent'
          ? delta.value / 100
          : (delta.meta?.targetLVR as number | undefined) ?? delta.value;
        const safeTarget = Math.max(0, Math.min(safeLenderCap, targetLVR || 0.8));
        newLoan = property.currentValue * safeTarget;
      }
      // Phase G3 — never exceed lender cap regardless of input mode
      newLoan = Math.min(newLoan, property.currentValue * safeLenderCap);
      const grossRelease = Math.max(0, newLoan - property.loanRemaining);
      if (grossRelease <= 0) {
        // Phase G3 — no longer silent. Surface the reason so the rationale PDF
        // can prompt finance to consider G1 valuation uplift or G2 pool mode.
        const currentLvr = (property.loanRemaining / property.currentValue) * 100;
        effect.acquisitionNotes.push(
          `⚠ Equity release on ${property.address?.slice(0, 30) || 'property'} skipped — already at ${currentLvr.toFixed(1)}% LVR (target would shrink loan). Consider valuation uplift (G1) or cross-collateralised pool mode (G2).`
        );
        break;
      }

      // LMI on the equity-release loan if LVR > 80%
      const newLvr = (newLoan / property.currentValue) * 100;
      let lmiOnRelease = 0;
      if (newLvr > 80) {
        const est = estimateLMI({
          propertyValue: property.currentValue,
          depositAmount: property.currentValue - newLoan,
          loanAmount: newLoan,
          isFirstHomeBuyer: fhb,
        });
        lmiOnRelease = est.lmiAmount;
      }

      // Net usable cash (after LMI on the release loan)
      const netRelease = Math.max(0, grossRelease - lmiOnRelease);

      // F2 fix — servicing impact is the IO cost on the NEW slice only
      // (grossRelease × monthly rate). The previous formula
      //   `newLoan*r − loanRemaining*r`
      // was algebraically identical but obscured intent and broke if a future
      // refactor changed how `newLoan` was computed.
      const ioRepaymentNewSlice = grossRelease * monthlyRate;
      effect.commitmentAdjustment = Math.max(0, ioRepaymentNewSlice);
      effect.debtBalanceAdjustment = grossRelease;

      effect.releasedCapital = netRelease;
      effect.acquisitionNotes.push(
        `Equity release on ${property.address?.slice(0, 30) || 'property'} @ ${ratePct.toFixed(2)}%: gross $${Math.round(grossRelease).toLocaleString()} − LMI $${Math.round(lmiOnRelease).toLocaleString()} = $${Math.round(netRelease).toLocaleString()} usable. New LVR ${newLvr.toFixed(1)}%. Servicing +$${Math.round(ioRepaymentNewSlice).toLocaleString()}/mo (IO).`
      );
      effect.description = `Release equity from ${property.address?.slice(0, 30) || 'property'}`;
      break;
    }

    case 'property_value_change': {
      // Phase G1 — Pure input override. Mutates the resolved property record
      // in place so any downstream property-bound delta in the same run sees
      // the new valuation. The order-aware sort in `runScenario` guarantees
      // value changes are applied first.
      const property = context.properties?.find(p => p.id === delta.id);
      if (!property || property.currentValue <= 0) break;
      const oldValue = property.currentValue;
      let newValue = oldValue;
      if (delta.unit === 'percent') {
        newValue = oldValue * (1 + delta.value / 100);
      } else if (delta.unit === 'absolute' && delta.value > 0) {
        newValue = delta.value;
      }
      newValue = Math.max(0, newValue);
      if (Math.abs(newValue - oldValue) < 1) break;
      property.currentValue = newValue; // mutate in place — order-aware engine
      const basis = (delta.meta?.basis as string | undefined) || 'manual';
      const source = (delta.meta?.source as string | undefined) || '—';
      const pct = oldValue > 0 ? ((newValue - oldValue) / oldValue) * 100 : 0;
      effect.acquisitionNotes.push(
        `Revalue ${property.address?.slice(0, 30) || 'property'}: $${Math.round(oldValue).toLocaleString()} → $${Math.round(newValue).toLocaleString()} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%, basis: ${basis}, source: ${source})`
      );
      effect.description = `Revalue ${property.address?.slice(0, 30) || 'property'}`;
      break;
    }

    case 'portfolio_lvr_release': {
      // Phase G2 — Cross-collateralised / blended-LVR release across a pool.
      // Closes the gap where standalone mode floors at $0 even when an
      // equity-rich property could subsidise over-leveraged ones.
      //
      // Math:
      //   pool members = meta.propertyIds (filtered to actual portfolio)
      //   totalValue   = Σ currentValue (post G1 overrides)
      //   totalDebt    = Σ loanRemaining
      //   target debt  = totalValue × blendedTargetLVR
      //   gross pool   = max(0, target debt − totalDebt)
      //   allocation   = highest_equity_first OR pro_rata
      //   per-property newLoan ≤ currentValue × lenderMaxLVR
      //   LMI         = computed PER SECURITY on slices crossing 80% LVR
      const pool = (delta.meta?.propertyIds as string[] | undefined) || [];
      const members = (context.properties || []).filter(p => pool.includes(p.id) && p.currentValue > 0);
      if (members.length === 0) {
        effect.acquisitionNotes.push(`⚠ Pool release: no valid pool members found in portfolio.`);
        break;
      }

      const blendedTarget = delta.unit === 'percent' ? delta.value / 100 : delta.value;
      const safeBlended = Math.max(0, Math.min(0.97, blendedTarget || 0.8));

      const lenderCap = (delta.meta?.lenderMaxLVR as number | undefined);
      const safeLenderCap = (Number.isFinite(lenderCap) && (lenderCap as number) > 0 && (lenderCap as number) <= 0.99)
        ? (lenderCap as number)
        : 0.95;

      const allocationStrategy = (delta.meta?.allocationStrategy as string | undefined) === 'pro_rata'
        ? 'pro_rata'
        : 'highest_equity_first';

      const totalValue = members.reduce((s, p) => s + p.currentValue, 0);
      const totalDebt = members.reduce((s, p) => s + p.loanRemaining, 0);
      const targetTotalDebt = totalValue * safeBlended;
      const grossPool = Math.max(0, targetTotalDebt - totalDebt);

      if (grossPool <= 0) {
        const currentBlended = totalValue > 0 ? (totalDebt / totalValue) * 100 : 0;
        effect.acquisitionNotes.push(
          `⚠ Pool release skipped — current blended LVR ${currentBlended.toFixed(1)}% already at/above target ${(safeBlended * 100).toFixed(1)}%.`
        );
        break;
      }

      // Per-property headroom = max additional debt before hitting lender cap
      const headroom = members.map(p => ({
        property: p,
        headroom: Math.max(0, p.currentValue * safeLenderCap - p.loanRemaining),
        equity: Math.max(0, p.currentValue - p.loanRemaining),
      }));
      const totalHeadroom = headroom.reduce((s, h) => s + h.headroom, 0);
      // Cap pool draw at total headroom (lender will not exceed any single security's cap)
      const cappedPool = Math.min(grossPool, totalHeadroom);

      // Allocate cappedPool across members
      let allocations: Array<{ property: typeof members[number]; allocation: number }> = [];
      if (allocationStrategy === 'pro_rata' && totalHeadroom > 0) {
        allocations = headroom.map(h => ({
          property: h.property,
          allocation: cappedPool * (h.headroom / totalHeadroom),
        }));
      } else {
        // highest_equity_first — fill cleanest-security headroom first
        const sorted = [...headroom].sort((a, b) => b.equity - a.equity);
        let remaining = cappedPool;
        allocations = sorted.map(h => {
          const take = Math.min(h.headroom, remaining);
          remaining = Math.max(0, remaining - take);
          return { property: h.property, allocation: take };
        }).filter(a => a.allocation > 0);
      }

      // Compute LMI per-security and aggregate the pool
      const fhb = !!context.acquisition?.isFirstHomeBuyer;
      let totalGross = 0;
      let totalLmi = 0;
      let totalIo = 0;
      const overrideRate = delta.meta?.releaseRate as number | undefined;
      const blendedRatePct = (Number.isFinite(overrideRate) && (overrideRate as number) > 0)
        ? (overrideRate as number)
        : context.baseInputs.interestRate ?? 6.5;

      const securityNotes: string[] = [];
      for (const a of allocations) {
        if (a.allocation <= 0) continue;
        totalGross += a.allocation;
        const newLoan = a.property.loanRemaining + a.allocation;
        const newLvr = (newLoan / a.property.currentValue) * 100;
        // LMI per-security on the new slice if individual LVR crosses 80%
        let lmiSlice = 0;
        if (newLvr > 80) {
          const est = estimateLMI({
            propertyValue: a.property.currentValue,
            depositAmount: a.property.currentValue - newLoan,
            loanAmount: newLoan,
            isFirstHomeBuyer: fhb,
          });
          lmiSlice = est.lmiAmount;
        }
        totalLmi += lmiSlice;
        // Servicing on the new slice only — use property's own rate where available, blended otherwise
        const ratePct = a.property.interestRate ?? blendedRatePct;
        totalIo += a.allocation * (ratePct / 100 / 12);
        securityNotes.push(
          `${a.property.address?.slice(0, 25) || 'property'}: +$${Math.round(a.allocation).toLocaleString()} (LVR → ${newLvr.toFixed(1)}%${lmiSlice > 0 ? `, LMI $${Math.round(lmiSlice).toLocaleString()}` : ''})`
        );
      }

      const netPool = Math.max(0, totalGross - totalLmi);

      effect.commitmentAdjustment = Math.max(0, totalIo);
      effect.debtBalanceAdjustment = totalGross;
      effect.releasedCapital = netPool;

      const blendedNow = totalValue > 0 ? (totalDebt / totalValue) * 100 : 0;
      const blendedAfter = totalValue > 0 ? ((totalDebt + totalGross) / totalValue) * 100 : 0;
      effect.acquisitionNotes.push(
        `Cross-collat pool (${members.length} properties, ${allocationStrategy}): blended LVR ${blendedNow.toFixed(1)}% → ${blendedAfter.toFixed(1)}% (target ${(safeBlended * 100).toFixed(1)}%). Gross $${Math.round(totalGross).toLocaleString()} − LMI $${Math.round(totalLmi).toLocaleString()} = $${Math.round(netPool).toLocaleString()} usable. Servicing +$${Math.round(totalIo).toLocaleString()}/mo IO.`
      );
      for (const n of securityNotes) effect.acquisitionNotes.push(`  · ${n}`);
      if (cappedPool < grossPool) {
        effect.acquisitionNotes.push(
          `  · ⚠ Pool capped at $${Math.round(cappedPool).toLocaleString()} (target wanted $${Math.round(grossPool).toLocaleString()}, but lender cap of ${(safeLenderCap * 100).toFixed(0)}% per security limits draw).`
        );
      }
      effect.description = `Cross-collat release pool @ ${(safeBlended * 100).toFixed(0)}% blended LVR`;
      break;
    }
  }
  return effect;
}

// ============================================
// ACQUISITION CAPACITY HELPER (Phase C)
// ============================================

/** Iteratively solve for the maximum purchase price given:
 *   - serviceable loan capacity (post-deltas)
 *   - cash available (released equity + cash on hand)
 *   - LMI mode (none / display_deduction / debt_capitalised)
 *   - state stamp duty + acquisition costs
 *
 *  In `display_deduction` mode the loan stays at `borrowingCapacity` and LMI
 *  is netted from the cash side. In `debt_capitalised` mode the loan absorbs
 *  the LMI premium, so available principal for the property = capacity − LMI.
 */
export function computeAcquisitionCapacity(
  borrowingCapacity: number,
  context: ScenarioContext,
  effect: DeltaEffect,
): AcquisitionCapacity {
  const acq = context.acquisition || {};
  const lmiMode = acq.lmiMode ?? 'display_deduction';
  const state = acq.state ?? 'NSW';
  const intent = acq.intent ?? 'investor';
  const category = acq.category ?? 'established';
  const isFhb = !!acq.isFirstHomeBuyer;
  const isForeign = !!acq.isForeignBuyer;
  const cashOnHand = Math.max(0, acq.cashOnHand ?? 0);

  const cashAvailable = cashOnHand + Math.max(0, effect.releasedCapital);
  const notes = [...effect.acquisitionNotes];

  if (borrowingCapacity <= 0 && cashAvailable <= 0) {
    return {
      releasedCapital: effect.releasedCapital,
      lmi: 0, lmiMode, stampDuty: 0, otherAcquisitionCosts: 0,
      maxPurchasePrice: 0, loanAvailableForPurchase: 0, cashAvailable, notes,
    };
  }

  // Iterate up to 6 times — each pass refines stamp duty, LMI on a higher
  // property price, and the resulting purchase ceiling.
  let purchasePrice = borrowingCapacity + cashAvailable;
  let lmi = 0;
  let stampDuty = 0;
  let otherCosts = 0;
  let loanAvail = borrowingCapacity;

  for (let i = 0; i < 6; i++) {
    // Stamp duty + other costs on the current candidate price
    const sdResult = calculateStampDuty({
      propertyValue: purchasePrice,
      state, intent, category,
      isFirstHomeBuyer: isFhb,
      isForeignBuyer: isForeign,
    });
    stampDuty = sdResult.totalDuty;
    otherCosts = estimateOtherAcquisitionCosts(purchasePrice).total;

    // Loan size required for this purchase = price − cashAvailable
    const requiredLoan = Math.max(0, purchasePrice - cashAvailable);
    const cappedLoan = Math.min(borrowingCapacity, requiredLoan);

    // LMI on the acquisition loan (LVR = loan / price)
    if (lmiMode !== 'none') {
      const est = estimateLMI({
        propertyValue: purchasePrice,
        depositAmount: cashAvailable,
        loanAmount: cappedLoan,
        isFirstHomeBuyer: isFhb,
      });
      lmi = est.lmiAmount;
    } else {
      lmi = 0;
    }

    // Recompute loan-available-for-purchase based on LMI mode
    if (lmiMode === 'debt_capitalised') {
      loanAvail = Math.max(0, borrowingCapacity - lmi);
    } else {
      loanAvail = borrowingCapacity;
    }

    // New purchase ceiling = loan + cash − LMI (display) − stamp duty − other
    const lmiCashDeduction = lmiMode === 'display_deduction' ? lmi : 0;
    const newPrice = Math.max(0, loanAvail + cashAvailable - lmiCashDeduction - stampDuty - otherCosts);

    if (Math.abs(newPrice - purchasePrice) < 1000) {
      purchasePrice = newPrice;
      break;
    }
    purchasePrice = newPrice;
  }

  if (lmi > 0) notes.push(`LMI ${lmiMode === 'debt_capitalised' ? 'capitalised onto loan' : 'deducted from settlement cash'}: $${Math.round(lmi).toLocaleString()}`);
  if (stampDuty > 0) notes.push(`${state} stamp duty: $${Math.round(stampDuty).toLocaleString()} (${intent}${isFhb ? ', FHB' : ''})`);
  if (otherCosts > 0) notes.push(`Acquisition costs (legals, inspections, registrations): $${Math.round(otherCosts).toLocaleString()}`);

  // ── Phase F2 — Target solving + actual loan-required + net cash ──
  // The Strategy Builder needs a clear "achievable / short by $X" answer
  // when finance has a target purchase price (e.g. $700k).
  const target = acq.targetPurchasePrice && acq.targetPurchasePrice > 0
    ? acq.targetPurchasePrice
    : undefined;

  // Loan REQUIRED for the *target* price (or for the max if no target set):
  // = price − cashAvailable + LMI(display) + stampDuty + otherCosts
  // For the target case we recompute LMI/SD against the target price for honesty.
  let loanRequiredForPurchase: number | undefined;
  let netCashAfterSettlement: number | undefined;
  let meetsTarget: boolean | undefined;
  let shortfallToTarget: number | undefined;

  if (target !== undefined) {
    const sdTarget = calculateStampDuty({
      propertyValue: target,
      state, intent, category,
      isFirstHomeBuyer: isFhb,
      isForeignBuyer: isForeign,
    }).totalDuty;
    const otherTarget = estimateOtherAcquisitionCosts(target).total;

    const requiredLoanRaw = Math.max(0, target - cashAvailable);
    let lmiAtTarget = 0;
    if (lmiMode !== 'none') {
      lmiAtTarget = estimateLMI({
        propertyValue: target,
        depositAmount: cashAvailable,
        loanAmount: requiredLoanRaw,
        isFirstHomeBuyer: isFhb,
      }).lmiAmount;
    }
    const lmiCashAtTarget = lmiMode === 'display_deduction' ? lmiAtTarget : 0;
    loanRequiredForPurchase = lmiMode === 'debt_capitalised'
      ? requiredLoanRaw + lmiAtTarget
      : requiredLoanRaw;

    netCashAfterSettlement = cashAvailable - Math.max(0, target - (loanRequiredForPurchase ?? 0)) - lmiCashAtTarget - sdTarget - otherTarget;
    meetsTarget = (loanRequiredForPurchase ?? 0) <= borrowingCapacity && netCashAfterSettlement >= 0;
    shortfallToTarget = Math.max(0, target - Math.max(0, purchasePrice));

    if (meetsTarget) {
      notes.push(
        `✅ Target $${Math.round(target).toLocaleString()} achievable: needs loan $${Math.round(loanRequiredForPurchase).toLocaleString()} (capacity $${Math.round(borrowingCapacity).toLocaleString()}); net cash post-settlement $${Math.round(netCashAfterSettlement).toLocaleString()}.`
      );
    } else {
      const loanShort = Math.max(0, (loanRequiredForPurchase ?? 0) - borrowingCapacity);
      const cashShort = Math.max(0, -netCashAfterSettlement);
      notes.push(
        `❌ Target $${Math.round(target).toLocaleString()} NOT met: short by $${Math.round(shortfallToTarget).toLocaleString()} (loan gap $${Math.round(loanShort).toLocaleString()}, cash gap $${Math.round(cashShort).toLocaleString()}).`
      );
    }
  } else {
    // No target — still report the loan that would actually be drawn for the
    // computed maxPurchasePrice, so the UI can headline "Loan required" cleanly.
    loanRequiredForPurchase = Math.max(0, Math.max(0, purchasePrice) - cashAvailable);
    netCashAfterSettlement = 0; // by construction at the ceiling
  }

  return {
    releasedCapital: Math.round(effect.releasedCapital),
    lmi: Math.round(lmi),
    lmiMode,
    stampDuty: Math.round(stampDuty),
    otherAcquisitionCosts: Math.round(otherCosts),
    maxPurchasePrice: Math.round(Math.max(0, purchasePrice)),
    loanAvailableForPurchase: Math.round(loanAvail),
    loanRequiredForPurchase: loanRequiredForPurchase !== undefined ? Math.round(loanRequiredForPurchase) : undefined,
    netCashAfterSettlement: netCashAfterSettlement !== undefined ? Math.round(netCashAfterSettlement) : undefined,
    cashAvailable: Math.round(cashAvailable),
    targetPurchasePrice: target !== undefined ? Math.round(target) : undefined,
    meetsTarget,
    shortfallToTarget: shortfallToTarget !== undefined ? Math.round(shortfallToTarget) : undefined,
    notes,
  };
}

// ============================================
// CORE ENGINE
// ============================================

/** Phase G1 — Order-aware delta sort. `property_value_change` deltas must
 *  resolve BEFORE any other property-bound delta in the same run, since they
 *  mutate the resolved property record (currentValue) that downstream
 *  equity_release / portfolio_lvr_release / property_refinance / property_sell
 *  deltas read from. Stable for everything else. */
function orderDeltas(deltas: ScenarioDelta[]): ScenarioDelta[] {
  const valueChanges: ScenarioDelta[] = [];
  const others: ScenarioDelta[] = [];
  for (const d of deltas) {
    if (d.type === 'property_value_change') valueChanges.push(d);
    else others.push(d);
  }
  return [...valueChanges, ...others];
}

/** Phase G1 — Deep-clone the property records so in-place mutations from
 *  `property_value_change` are scenario-scoped and never leak back into the
 *  caller's portfolio. Liabilities & acquisition pass through untouched. */
function cloneContextForRun(context: ScenarioContext): ScenarioContext {
  return {
    ...context,
    properties: (context.properties || []).map(p => ({ ...p })),
  };
}

export function runScenario(
  scenarioName: string,
  deltas: ScenarioDelta[],
  context: ScenarioContext,
): ScenarioCapacityResult {
  const total = emptyEffect(scenarioName);
  const ctx = cloneContextForRun(context);
  const ordered = orderDeltas(deltas);

  for (const d of ordered) {
    const e = applyDelta(d, ctx);
    total.incomeAdjustment += e.incomeAdjustment;
    total.shadedIncomeAdjustment += e.shadedIncomeAdjustment;
    total.expenseAdjustment += e.expenseAdjustment;
    total.commitmentAdjustment += e.commitmentAdjustment;
    total.rateAdjustment += e.rateAdjustment;
    total.loanTermAdjustment += e.loanTermAdjustment;
    total.debtBalanceAdjustment += e.debtBalanceAdjustment;
    total.releasedCapital += e.releasedCapital;
    if (e.acquisitionNotes.length) total.acquisitionNotes.push(...e.acquisitionNotes);
    if (e.dtiCapEnabled !== undefined) total.dtiCapEnabled = e.dtiCapEnabled;
    if (e.dtiCapLimit !== undefined) total.dtiCapLimit = e.dtiCapLimit;
  }

  // Phase E (M3): rescale HEM-derived expenses for the new income tier
  const newGross = Math.max(0, ctx.baseInputs.grossAnnualIncome + total.incomeAdjustment);
  const hemDelta = computeHemTierDelta(
    ctx.baseInputs.grossAnnualIncome,
    newGross,
    ctx.baseInputs.monthlyLivingExpenses,
  );

  const scenarioInputs: BorrowingCapacityInput = {
    ...ctx.baseInputs,
    grossAnnualIncome: newGross,
    shadedAnnualIncome: Math.max(0, ctx.baseInputs.shadedAnnualIncome + total.shadedIncomeAdjustment),
    monthlyLivingExpenses: Math.max(0, ctx.baseInputs.monthlyLivingExpenses + total.expenseAdjustment + hemDelta),
    monthlyCommitments: Math.max(0, ctx.baseInputs.monthlyCommitments + total.commitmentAdjustment),
    interestRate: Math.max(0.5, ctx.baseInputs.interestRate + total.rateAdjustment),
    loanTermYears: Math.max(5, ctx.baseInputs.loanTermYears + total.loanTermAdjustment),
    totalDebtBalances: Math.max(0, (ctx.baseInputs.totalDebtBalances || 0) + total.debtBalanceAdjustment),
    dtiCapEnabled: total.dtiCapEnabled ?? ctx.baseInputs.dtiCapEnabled,
    dtiCapLimit: total.dtiCapLimit ?? ctx.baseInputs.dtiCapLimit,
  };

  const scenarioResult = calculateBorrowingCapacity(scenarioInputs);
  const capacityChange = buildScenarioChange(
    ctx.baseResult.borrowingCapacity,
    scenarioResult.borrowingCapacity,
  );

  const acquisitionCapacity = ctx.acquisition
    ? computeAcquisitionCapacity(scenarioResult.borrowingCapacity, ctx, total)
    : null;

  return {
    scenarioName,
    deltas,
    borrowingCapacity: scenarioResult.borrowingCapacity,
    monthlySurplus: scenarioResult.monthlySurplus,
    serviceabilityBand: scenarioResult.serviceabilityBand,
    dtiRatio: scenarioResult.dtiRatio,
    capacityChange,
    acquisitionCapacity,
  };
}

export function runMultipleScenarios(
  scenarios: { name: string; deltas: ScenarioDelta[] }[],
  context: ScenarioContext,
): ScenarioCapacityResult[] {
  return scenarios.map(s => runScenario(s.name, s.deltas, context));
}

/** Run a scenario AND return the merged inputs used. Useful when the caller
 *  needs to replay or persist exactly what the engine evaluated (e.g. the
 *  Strategy Builder's "Apply Scenario" handoff to the calculator). */
export function runScenarioWithInputs(
  scenarioName: string,
  deltas: ScenarioDelta[],
  context: ScenarioContext,
): { result: ScenarioCapacityResult; inputs: BorrowingCapacityInput; effect: DeltaEffect; issues: DeltaValidationIssue[] } {
  const issues = validateDeltas(deltas, context);
  // Drop deltas whose target IDs are missing — keeps the math honest
  const propertyIds = new Set((context.properties || []).map(p => p.id));
  const liabilityIds = new Set((context.liabilities || []).map(l => l.id));
  const safeDeltas = deltas.filter(d => {
    if (
      d.type === 'property_sell' ||
      d.type === 'property_refinance' ||
      d.type === 'equity_release' ||
      d.type === 'property_rate_change' ||
      d.type === 'property_value_change'
    ) return propertyIds.has(d.id);
    if (d.type === 'liability_payoff') return liabilityIds.has(d.id);
    // portfolio_lvr_release filters its own pool inside applyDelta — let it through
    return true;
  });

  // Phase G1 — clone context + sort property_value_change FIRST so downstream
  // property-bound deltas see the new valuations
  const ctx = cloneContextForRun(context);
  const orderedSafe = orderDeltas(safeDeltas);

  const total = emptyEffect(scenarioName);
  for (const d of orderedSafe) {
    const e = applyDelta(d, ctx);
    total.incomeAdjustment += e.incomeAdjustment;
    total.shadedIncomeAdjustment += e.shadedIncomeAdjustment;
    total.expenseAdjustment += e.expenseAdjustment;
    total.commitmentAdjustment += e.commitmentAdjustment;
    total.rateAdjustment += e.rateAdjustment;
    total.loanTermAdjustment += e.loanTermAdjustment;
    total.debtBalanceAdjustment += e.debtBalanceAdjustment;
    total.releasedCapital += e.releasedCapital;
    if (e.acquisitionNotes.length) total.acquisitionNotes.push(...e.acquisitionNotes);
    if (e.dtiCapEnabled !== undefined) total.dtiCapEnabled = e.dtiCapEnabled;
    if (e.dtiCapLimit !== undefined) total.dtiCapLimit = e.dtiCapLimit;
  }

  // Phase E (M3): rescale HEM-derived expenses for the new income tier
  const newGross2 = Math.max(0, ctx.baseInputs.grossAnnualIncome + total.incomeAdjustment);
  const hemDelta2 = computeHemTierDelta(
    ctx.baseInputs.grossAnnualIncome,
    newGross2,
    ctx.baseInputs.monthlyLivingExpenses,
  );

  const inputs: BorrowingCapacityInput = {
    ...ctx.baseInputs,
    grossAnnualIncome: newGross2,
    shadedAnnualIncome: Math.max(0, ctx.baseInputs.shadedAnnualIncome + total.shadedIncomeAdjustment),
    monthlyLivingExpenses: Math.max(0, ctx.baseInputs.monthlyLivingExpenses + total.expenseAdjustment + hemDelta2),
    monthlyCommitments: Math.max(0, ctx.baseInputs.monthlyCommitments + total.commitmentAdjustment),
    interestRate: Math.max(0.5, ctx.baseInputs.interestRate + total.rateAdjustment),
    loanTermYears: Math.max(5, ctx.baseInputs.loanTermYears + total.loanTermAdjustment),
    totalDebtBalances: Math.max(0, (ctx.baseInputs.totalDebtBalances || 0) + total.debtBalanceAdjustment),
    dtiCapEnabled: total.dtiCapEnabled ?? ctx.baseInputs.dtiCapEnabled,
    dtiCapLimit: total.dtiCapLimit ?? ctx.baseInputs.dtiCapLimit,
  };

  const calc = calculateBorrowingCapacity(inputs);
  const capacityChange = buildScenarioChange(ctx.baseResult.borrowingCapacity, calc.borrowingCapacity);
  const acquisitionCapacity = ctx.acquisition
    ? computeAcquisitionCapacity(calc.borrowingCapacity, ctx, total)
    : null;

  return {
    result: {
      scenarioName,
      deltas: safeDeltas,
      borrowingCapacity: calc.borrowingCapacity,
      monthlySurplus: calc.monthlySurplus,
      serviceabilityBand: calc.serviceabilityBand,
      dtiRatio: calc.dtiRatio,
      capacityChange,
      acquisitionCapacity,
      validationIssues: issues.map(i => ({ deltaId: i.deltaId, deltaType: i.deltaType, severity: i.severity, message: i.message })),
    },
    inputs,
    effect: total,
    issues,
  };
}

// ============================================
// PRESET FACTORIES (unchanged surface)
// ============================================

export function createPayOffAllDebtScenario(
  liabilities: ScenarioLiability[],
): { name: string; deltas: ScenarioDelta[] } {
  const unsecured = liabilities.filter(l =>
    !l.type.includes('home_loan') &&
    !l.type.includes('investment_loan') &&
    !l.type.includes('rent_expense'),
  );

  return {
    name: 'Pay Off All Unsecured Debt',
    deltas: unsecured.map(l => ({
      id: l.id,
      label: `Pay off ${l.label}`,
      type: 'liability_payoff' as const,
      value: l.balance,
      unit: 'absolute' as const,
    })),
  };
}

export function createSellPropertyScenario(
  property: ScenarioProperty,
): { name: string; deltas: ScenarioDelta[] } {
  return {
    name: `Sell ${property.address?.slice(0, 30) || 'Property'}`,
    deltas: [{
      id: property.id,
      label: `Sell ${property.address?.slice(0, 30) || 'property'}`,
      type: 'property_sell' as const,
      value: property.currentValue,
      unit: 'absolute' as const,
    }],
  };
}

export function createRefinanceToIOScenario(
  properties: ScenarioProperty[],
): { name: string; deltas: ScenarioDelta[] } {
  const withLoans = properties.filter(p =>
    p.loanRemaining > 0 &&
    p.propertyType !== 'rental' &&
    p.propertyType !== 'owner_occupied'
  );

  return {
    name: 'Refinance All Investment Loans to IO',
    deltas: withLoans.map(p => ({
      id: p.id,
      label: `Refinance ${p.address?.slice(0, 25) || 'property'} to IO`,
      type: 'property_refinance' as const,
      value: 0,
      unit: 'absolute' as const,
    })),
  };
}

export function createRateChangeScenario(rateChange: number): { name: string; deltas: ScenarioDelta[] } {
  const direction = rateChange > 0 ? 'increase' : 'decrease';
  return {
    name: `Rates ${rateChange >= 0 ? '+' : ''}${rateChange}%`,
    deltas: [{
      id: `rate-${rateChange}`,
      label: `Interest rate ${direction} ${Math.abs(rateChange)}%`,
      type: 'rate_change' as const,
      value: rateChange,
      unit: 'rate_points' as const,
    }],
  };
}

export function createIncomeChangeScenario(percentChange: number): { name: string; deltas: ScenarioDelta[] } {
  return {
    name: `Income ${percentChange >= 0 ? '+' : ''}${percentChange}%`,
    deltas: [{
      id: `income-${percentChange}`,
      label: `Income ${percentChange >= 0 ? 'increase' : 'decrease'} ${Math.abs(percentChange)}%`,
      type: 'income_change' as const,
      value: percentChange,
      unit: 'percent' as const,
    }],
  };
}

export function createMaximumStrategyScenario(
  liabilities: ScenarioLiability[],
  properties: ScenarioProperty[],
): { name: string; deltas: ScenarioDelta[] } {
  const debtDeltas = createPayOffAllDebtScenario(liabilities).deltas;
  const refiDeltas = createRefinanceToIOScenario(properties).deltas;

  return {
    name: 'Maximum Strategy',
    deltas: [
      ...debtDeltas,
      ...refiDeltas,
      {
        id: 'expense-15',
        label: 'Reduce expenses 15%',
        type: 'expense_change' as const,
        value: -15,
        unit: 'percent' as const,
      },
    ],
  };
}
