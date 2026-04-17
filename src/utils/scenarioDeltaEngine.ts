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
}

export interface ScenarioContext {
  baseInputs: BorrowingCapacityInput;
  baseResult: BorrowingCapacityResult;
  properties?: ScenarioProperty[];
  liabilities?: ScenarioLiability[];
  acquisition?: AcquisitionContext;
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
        if (!propertyIds.has(d.id)) {
          issues.push({
            deltaId: d.id,
            deltaType: d.type,
            severity: 'warning',
            message: `Property "${d.id}" not found in client portfolio — delta ignored`,
          });
        }
        break;
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
        const ioMonthlyRate = context.baseInputs.interestRate / 100 / 12;
        const ioRepayment = property.loanRemaining * ioMonthlyRate;
        const saving = Math.max(0, currentRepayment - ioRepayment);
        if (saving > 0) effect.commitmentAdjustment = -saving;
        effect.description = `Refinance ${property.address?.slice(0, 30) || 'property'} to IO`;
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
      // Phase C: Equity-release lever now produces real cash + servicing impact.
      //
      // Inputs interpreted from the delta:
      //   value: target LVR as a ratio (0.80) OR % (80) OR absolute release amount
      //   meta.targetLVR: optional explicit target LVR (0–1 ratio)
      //   meta.amount: optional explicit cash amount to release (overrides LVR math)
      //   unit: 'ratio' = LVR ratio, 'percent' = LVR %, 'absolute' = direct $ amount
      //
      // Output:
      //   - releasedCapital ≈ new equity loan − LMI on that loan
      //   - commitmentAdjustment += monthly IO repayment on the new equity loan
      //   - debtBalanceAdjustment += new equity loan principal
      const property = context.properties?.find(p => p.id === delta.id);
      if (!property || property.currentValue <= 0) break;

      const fhb = !!context.acquisition?.isFirstHomeBuyer;
      const ratePct = context.baseInputs.interestRate || 6.5;
      const monthlyRate = (ratePct / 100) / 12;

      // Resolve the new max loan size on this property
      let newLoan = 0;
      if (delta.unit === 'absolute' && delta.value > 0) {
        newLoan = property.loanRemaining + delta.value;
      } else {
        const targetLVR = delta.unit === 'percent'
          ? delta.value / 100
          : (delta.meta?.targetLVR as number | undefined) ?? delta.value;
        const safeTarget = Math.max(0, Math.min(0.95, targetLVR || 0.8));
        newLoan = property.currentValue * safeTarget;
      }
      const grossRelease = Math.max(0, newLoan - property.loanRemaining);
      if (grossRelease <= 0) {
        effect.acquisitionNotes.push(`Equity release on ${property.address?.slice(0, 30) || 'property'}: no equity available at requested LVR`);
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

      // Servicing impact: assume IO equity loan (worst-case for serviceability)
      const ioRepayment = newLoan * monthlyRate - property.loanRemaining * monthlyRate;
      effect.commitmentAdjustment = Math.max(0, ioRepayment);
      effect.debtBalanceAdjustment = grossRelease;

      effect.releasedCapital = netRelease;
      effect.acquisitionNotes.push(
        `Equity release on ${property.address?.slice(0, 30) || 'property'}: gross $${Math.round(grossRelease).toLocaleString()} − LMI $${Math.round(lmiOnRelease).toLocaleString()} = $${Math.round(netRelease).toLocaleString()} usable. New LVR ${newLvr.toFixed(1)}%.`
      );
      effect.description = `Release equity from ${property.address?.slice(0, 30) || 'property'}`;
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

  return {
    releasedCapital: Math.round(effect.releasedCapital),
    lmi: Math.round(lmi),
    lmiMode,
    stampDuty: Math.round(stampDuty),
    otherAcquisitionCosts: Math.round(otherCosts),
    maxPurchasePrice: Math.round(Math.max(0, purchasePrice)),
    loanAvailableForPurchase: Math.round(loanAvail),
    cashAvailable: Math.round(cashAvailable),
    notes,
  };
}

// ============================================
// CORE ENGINE
// ============================================

export function runScenario(
  scenarioName: string,
  deltas: ScenarioDelta[],
  context: ScenarioContext,
): ScenarioCapacityResult {
  const total = emptyEffect(scenarioName);

  for (const d of deltas) {
    const e = applyDelta(d, context);
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

  const scenarioInputs: BorrowingCapacityInput = {
    ...context.baseInputs,
    grossAnnualIncome: Math.max(0, context.baseInputs.grossAnnualIncome + total.incomeAdjustment),
    shadedAnnualIncome: Math.max(0, context.baseInputs.shadedAnnualIncome + total.shadedIncomeAdjustment),
    monthlyLivingExpenses: Math.max(0, context.baseInputs.monthlyLivingExpenses + total.expenseAdjustment),
    monthlyCommitments: Math.max(0, context.baseInputs.monthlyCommitments + total.commitmentAdjustment),
    interestRate: Math.max(0.5, context.baseInputs.interestRate + total.rateAdjustment),
    loanTermYears: Math.max(5, context.baseInputs.loanTermYears + total.loanTermAdjustment),
    totalDebtBalances: Math.max(0, (context.baseInputs.totalDebtBalances || 0) + total.debtBalanceAdjustment),
    dtiCapEnabled: total.dtiCapEnabled ?? context.baseInputs.dtiCapEnabled,
    dtiCapLimit: total.dtiCapLimit ?? context.baseInputs.dtiCapLimit,
  };

  const scenarioResult = calculateBorrowingCapacity(scenarioInputs);
  const capacityChange = buildScenarioChange(
    context.baseResult.borrowingCapacity,
    scenarioResult.borrowingCapacity,
  );

  const acquisitionCapacity = context.acquisition
    ? computeAcquisitionCapacity(scenarioResult.borrowingCapacity, context, total)
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
    if (d.type === 'property_sell' || d.type === 'property_refinance' || d.type === 'equity_release') return propertyIds.has(d.id);
    if (d.type === 'liability_payoff') return liabilityIds.has(d.id);
    return true;
  });

  const total = emptyEffect(scenarioName);
  for (const d of safeDeltas) {
    const e = applyDelta(d, context);
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

  const inputs: BorrowingCapacityInput = {
    ...context.baseInputs,
    grossAnnualIncome: Math.max(0, context.baseInputs.grossAnnualIncome + total.incomeAdjustment),
    shadedAnnualIncome: Math.max(0, context.baseInputs.shadedAnnualIncome + total.shadedIncomeAdjustment),
    monthlyLivingExpenses: Math.max(0, context.baseInputs.monthlyLivingExpenses + total.expenseAdjustment),
    monthlyCommitments: Math.max(0, context.baseInputs.monthlyCommitments + total.commitmentAdjustment),
    interestRate: Math.max(0.5, context.baseInputs.interestRate + total.rateAdjustment),
    loanTermYears: Math.max(5, context.baseInputs.loanTermYears + total.loanTermAdjustment),
    totalDebtBalances: Math.max(0, (context.baseInputs.totalDebtBalances || 0) + total.debtBalanceAdjustment),
    dtiCapEnabled: total.dtiCapEnabled ?? context.baseInputs.dtiCapEnabled,
    dtiCapLimit: total.dtiCapLimit ?? context.baseInputs.dtiCapLimit,
  };

  const calc = calculateBorrowingCapacity(inputs);
  const capacityChange = buildScenarioChange(context.baseResult.borrowingCapacity, calc.borrowingCapacity);
  const acquisitionCapacity = context.acquisition
    ? computeAcquisitionCapacity(calc.borrowingCapacity, context, total)
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
