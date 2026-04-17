/**
 * Scenario Delta Engine — Deno mirror for edge functions.
 *
 * STRUCTURAL TWIN of `src/utils/scenarioDeltaEngine.ts`. Both files implement
 * identical semantics so the client preview and the server replay produce the
 * same numbers. Parity is enforced by tests in
 * `supabase/functions/calculate-borrowing-capacity/scenario_parity_test.ts`.
 *
 * If you change one, change the other and update the parity test.
 */

import { estimateLmi, type LmiMode } from './lmiCalculations.ts';
import {
  calculateStampDuty,
  estimateOtherAcquisitionCosts,
  type AustralianState,
  type PurchaseIntent,
  type PropertyCategory,
} from './stampDutyCalculator.ts';

// ============================================
// TYPES (mirrored from src/utils/borrowingCapacityTypes.ts)
// ============================================

export type ScenarioDeltaType =
  | 'income_change'
  | 'expense_change'
  | 'debt_change'
  | 'rate_change'
  | 'property_sell'
  | 'property_refinance'
  | 'property_add'
  | 'liability_payoff'
  | 'loan_term_change'
  | 'dti_cap_change'
  | 'equity_release'
  | 'property_rate_change';

export type ScenarioDeltaUnit = 'percent' | 'absolute' | 'rate_points' | 'years' | 'ratio';

export interface ScenarioDelta {
  id: string;
  label: string;
  type: ScenarioDeltaType;
  value: number;
  unit: ScenarioDeltaUnit;
  meta?: Record<string, number | string | boolean | null>;
}

export interface ScenarioBaseInputs {
  grossAnnualIncome: number;
  shadedAnnualIncome: number;
  monthlyLivingExpenses: number;
  monthlyCommitments: number;
  interestRate: number;
  bufferRate: number;
  loanTermYears: number;
  totalDebtBalances: number;
  calculationMode?: 'bank' | 'conservative';
  dtiCapEnabled?: boolean;
  dtiCapLimit?: number;
}

export interface ScenarioBaseResult {
  borrowingCapacity: number;
  monthlySurplus: number;
  serviceabilityBand: 'green' | 'amber' | 'red';
  dtiRatio: number;
}

export interface ScenarioProperty {
  id: string;
  address: string;
  propertyType: string;
  currentValue: number;
  loanRemaining: number;
  monthlyRepayment: number;
  loanRepaymentAmount?: number;
  netMonthlyCashflow?: number;
  monthlyRentalIncome?: number;
  /** Phase F1 — contracted annual rate per property (%) */
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

export interface AcquisitionContext {
  state?: 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'TAS' | 'NT' | 'ACT';
  intent?: 'owner_occupier' | 'investor';
  category?: 'established' | 'new' | 'vacant_land';
  isFirstHomeBuyer?: boolean;
  isForeignBuyer?: boolean;
  lmiMode?: 'none' | 'display_deduction' | 'debt_capitalised';
  cashOnHand?: number;
  /** Phase F2 — target purchase price the strategy is solving for */
  targetPurchasePrice?: number;
}

export interface ScenarioContext {
  baseInputs: ScenarioBaseInputs;
  baseResult: ScenarioBaseResult;
  properties: ScenarioProperty[];
  liabilities: ScenarioLiability[];
  acquisition?: AcquisitionContext;
}

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
  releasedCapital: number;
  acquisitionNotes: string[];
  description: string;
}

export interface DeltaValidationIssue {
  deltaId: string;
  deltaType: string;
  severity: 'warning' | 'error';
  message: string;
}

// ============================================
// HELPERS
// ============================================

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

function blendedShadingRatio(ctx: ScenarioContext): number {
  const gross = ctx.baseInputs.grossAnnualIncome;
  const shaded = ctx.baseInputs.shadedAnnualIncome;
  if (gross <= 0) return 0.8;
  return Math.max(0, Math.min(1, shaded / gross));
}

// ── Phase E (M3 fix): HEM tier-aware expense recompute ─────────────────
// Deno mirror of `src/utils/scenarioDeltaEngine.ts` HEM helpers. Keep
// multiplier table in sync with `policyEngine.DEFAULT_HEM_CONFIG.incomeScaling`.
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
// VALIDATION
// ============================================

export function validateDeltas(deltas: ScenarioDelta[], context: ScenarioContext): DeltaValidationIssue[] {
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
        if (!propertyIds.has(d.id)) {
          issues.push({ deltaId: d.id, deltaType: d.type, severity: 'warning', message: `Property "${d.id}" not found in client portfolio — delta ignored` });
        }
        break;
      case 'liability_payoff':
        if (!liabilityIds.has(d.id)) {
          issues.push({ deltaId: d.id, deltaType: d.type, severity: 'warning', message: `Liability "${d.id}" not found — delta ignored` });
        }
        break;
      case 'rate_change':
        if (Math.abs(d.value) > 10) {
          issues.push({ deltaId: d.id, deltaType: d.type, severity: 'warning', message: 'Rate change exceeds ±10pp' });
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
// DELTA APPLICATION (1:1 with client engine)
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
        effect.debtBalanceAdjustment = delta.value * 200;
      }
      break;
    }
    case 'rate_change':
      effect.rateAdjustment = delta.value;
      break;
    case 'loan_term_change':
      effect.loanTermAdjustment = delta.value;
      break;
    case 'dti_cap_change': {
      const enabled = (delta.meta?.enabled as boolean | undefined) ?? true;
      effect.dtiCapEnabled = enabled;
      if (enabled) effect.dtiCapLimit = delta.value;
      break;
    }
    case 'property_sell': {
      const property = context.properties.find(p => p.id === delta.id);
      if (property) {
        const svc = property.loanRepaymentAmount || property.monthlyRepayment || 0;
        if (svc > 0) effect.commitmentAdjustment = -svc;
        if (property.loanRemaining > 0) effect.debtBalanceAdjustment = -property.loanRemaining;
        const cf = property.netMonthlyCashflow || 0;
        if (cf > 0) {
          effect.incomeAdjustment = -(cf * 12);
          effect.shadedIncomeAdjustment = -(cf * 12 * shadingRatio);
        } else if (cf < 0) {
          effect.expenseAdjustment = cf;
        }
        effect.description = `Sell ${property.address?.slice(0, 30) || 'property'}`;
      }
      break;
    }
    case 'property_refinance': {
      const property = context.properties.find(p => p.id === delta.id);
      if (property && property.loanRemaining > 0) {
        const cur = property.loanRepaymentAmount || property.monthlyRepayment || 0;
        // Phase F1 — per-property rate
        const propRate = property.interestRate ?? context.baseInputs.interestRate;
        const ioRate = propRate / 100 / 12;
        const io = property.loanRemaining * ioRate;
        const saving = Math.max(0, cur - io);
        if (saving > 0) effect.commitmentAdjustment = -saving;
        effect.acquisitionNotes.push(`Refinance ${property.address?.slice(0, 30) || 'property'} P&I→IO @ ${propRate.toFixed(2)}%: −$${Math.round(saving).toLocaleString()}/mo`);
        effect.description = `Refinance ${property.address?.slice(0, 30) || 'property'} to IO`;
      }
      break;
    }
    case 'property_rate_change': {
      // Phase F1 — reprice a single property to a new contracted rate.
      const property = context.properties.find(p => p.id === delta.id);
      if (property && property.loanRemaining > 0 && Number.isFinite(delta.value) && delta.value > 0) {
        const cur = property.loanRepaymentAmount || property.monthlyRepayment || 0;
        const oldRate = property.interestRate ?? context.baseInputs.interestRate;
        const newRate = delta.value;
        const monthlyOldIO = property.loanRemaining * (oldRate / 100 / 12);
        const isIo = cur > 0 && Math.abs(cur - monthlyOldIO) / Math.max(1, monthlyOldIO) < 0.05;
        let newRep: number;
        if (isIo) {
          newRep = property.loanRemaining * (newRate / 100 / 12);
        } else {
          const periods = (context.baseInputs.loanTermYears || 30) * 12;
          const mr = newRate / 100 / 12;
          newRep = mr > 0
            ? property.loanRemaining * (mr * Math.pow(1 + mr, periods)) / (Math.pow(1 + mr, periods) - 1)
            : property.loanRemaining / periods;
        }
        const d$ = newRep - cur;
        effect.commitmentAdjustment = d$;
        effect.acquisitionNotes.push(`Reprice ${property.address?.slice(0, 30) || 'property'}: ${oldRate.toFixed(2)}% → ${newRate.toFixed(2)}% ${isIo ? '(IO)' : '(P&I)'}, ${d$ >= 0 ? '+' : '−'}$${Math.round(Math.abs(d$)).toLocaleString()}/mo`);
        effect.description = `Reprice ${property.address?.slice(0, 30) || 'property'} to ${newRate.toFixed(2)}%`;
      }
      break;
    }
    case 'property_add': {
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
      const liability = context.liabilities.find(l => l.id === delta.id);
      if (liability) {
        effect.commitmentAdjustment = -liability.monthlyServicing;
        effect.debtBalanceAdjustment = -(liability.balance || 0);
        effect.description = `Pay off ${liability.label || liability.type}`;
      }
      break;
    }
    case 'equity_release': {
      // Phase C + F1/F2: cash freed + shadow servicing using per-property rate.
      const property = context.properties.find(p => p.id === delta.id);
      if (!property || property.currentValue <= 0) break;
      const fhb = !!context.acquisition?.isFirstHomeBuyer;
      const overrideRate = delta.meta?.releaseRate as number | undefined;
      const ratePct = (Number.isFinite(overrideRate) && (overrideRate as number) > 0)
        ? (overrideRate as number)
        : (property.interestRate ?? context.baseInputs.interestRate ?? 6.5);
      const monthlyRate = (ratePct / 100) / 12;
      let newLoan = 0;
      if (delta.unit === 'absolute' && delta.value > 0) {
        newLoan = property.loanRemaining + delta.value;
      } else {
        const targetLVR = delta.unit === 'percent' ? delta.value / 100
          : (delta.meta?.targetLVR as number | undefined) ?? delta.value;
        newLoan = property.currentValue * Math.max(0, Math.min(0.95, targetLVR || 0.8));
      }
      const grossRelease = Math.max(0, newLoan - property.loanRemaining);
      if (grossRelease <= 0) {
        effect.acquisitionNotes.push(`Equity release on ${property.address?.slice(0, 30) || 'property'}: no equity available`);
        break;
      }
      const newLvr = (newLoan / property.currentValue) * 100;
      let lmiOnRelease = 0;
      if (newLvr > 80) {
        const est = estimateLmi({ propertyValue: property.currentValue, loanAmount: newLoan, isFirstHomeBuyer: fhb });
        lmiOnRelease = est.lmiAmount;
      }
      const netRelease = Math.max(0, grossRelease - lmiOnRelease);
      // F2 fix — IO cost on the NEW slice only
      const ioRepayment = grossRelease * monthlyRate;
      effect.commitmentAdjustment = Math.max(0, ioRepayment);
      effect.debtBalanceAdjustment = grossRelease;
      effect.releasedCapital = netRelease;
      effect.acquisitionNotes.push(`Equity release on ${property.address?.slice(0, 30) || 'property'} @ ${ratePct.toFixed(2)}%: $${Math.round(netRelease).toLocaleString()} usable (LVR ${newLvr.toFixed(1)}%), +$${Math.round(ioRepayment).toLocaleString()}/mo IO`);
      effect.description = `Release equity from ${property.address?.slice(0, 30) || 'property'}`;
      break;
    }
  }
  return effect;
}

// ============================================
// AGGREGATION
// ============================================

export interface AggregatedScenarioInputs {
  grossAnnualIncome: number;
  shadedAnnualIncome: number;
  monthlyLivingExpenses: number;
  monthlyCommitments: number;
  interestRate: number;
  bufferRate: number;
  loanTermYears: number;
  totalDebtBalances: number;
  calculationMode?: 'bank' | 'conservative';
  dtiCapEnabled?: boolean;
  dtiCapLimit?: number;
}

export interface AcquisitionCapacityResult {
  releasedCapital: number;
  lmi: number;
  lmiMode: LmiMode;
  stampDuty: number;
  otherAcquisitionCosts: number;
  maxPurchasePrice: number;
  loanAvailableForPurchase: number;
  cashAvailable: number;
  notes: string[];
}

export interface AggregateResult {
  inputs: AggregatedScenarioInputs;
  effect: DeltaEffect;
  safeDeltas: ScenarioDelta[];
  issues: DeltaValidationIssue[];
}

export function aggregateDeltas(
  scenarioName: string,
  deltas: ScenarioDelta[],
  context: ScenarioContext,
): AggregateResult {
  const issues = validateDeltas(deltas, context);
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

  // Phase E (M3): rescale HEM-derived expenses if income tier changed
  const newGross = Math.max(0, context.baseInputs.grossAnnualIncome + total.incomeAdjustment);
  const hemDelta = computeHemTierDelta(
    context.baseInputs.grossAnnualIncome,
    newGross,
    context.baseInputs.monthlyLivingExpenses,
  );

  const inputs: AggregatedScenarioInputs = {
    grossAnnualIncome: newGross,
    shadedAnnualIncome: Math.max(0, context.baseInputs.shadedAnnualIncome + total.shadedIncomeAdjustment),
    monthlyLivingExpenses: Math.max(0, context.baseInputs.monthlyLivingExpenses + total.expenseAdjustment + hemDelta),
    monthlyCommitments: Math.max(0, context.baseInputs.monthlyCommitments + total.commitmentAdjustment),
    interestRate: Math.max(0.5, context.baseInputs.interestRate + total.rateAdjustment),
    bufferRate: context.baseInputs.bufferRate,
    loanTermYears: Math.max(5, context.baseInputs.loanTermYears + total.loanTermAdjustment),
    totalDebtBalances: Math.max(0, (context.baseInputs.totalDebtBalances || 0) + total.debtBalanceAdjustment),
    calculationMode: context.baseInputs.calculationMode,
    dtiCapEnabled: total.dtiCapEnabled ?? context.baseInputs.dtiCapEnabled,
    dtiCapLimit: total.dtiCapLimit ?? context.baseInputs.dtiCapLimit,
  };

  return { inputs, effect: total, safeDeltas, issues };
}

/** Phase C: iteratively solve for the maximum purchase price.
 *  Mirrors `src/utils/scenarioDeltaEngine.ts::computeAcquisitionCapacity`. */
export function computeAcquisitionCapacity(
  borrowingCapacity: number,
  context: ScenarioContext,
  effect: DeltaEffect,
): AcquisitionCapacityResult {
  const acq = context.acquisition || {};
  const lmiMode: LmiMode = acq.lmiMode ?? 'display_deduction';
  const state: AustralianState = (acq.state ?? 'NSW') as AustralianState;
  const intent: PurchaseIntent = (acq.intent ?? 'investor') as PurchaseIntent;
  const category: PropertyCategory = (acq.category ?? 'established') as PropertyCategory;
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

  let purchasePrice = borrowingCapacity + cashAvailable;
  let lmi = 0;
  let stampDuty = 0;
  let otherCosts = 0;
  let loanAvail = borrowingCapacity;

  for (let i = 0; i < 6; i++) {
    const sd = calculateStampDuty({
      propertyValue: purchasePrice,
      state, intent, category,
      isFirstHomeBuyer: isFhb,
      isForeignBuyer: isForeign,
    });
    stampDuty = sd.totalDuty;
    otherCosts = estimateOtherAcquisitionCosts(purchasePrice).total;

    const requiredLoan = Math.max(0, purchasePrice - cashAvailable);
    const cappedLoan = Math.min(borrowingCapacity, requiredLoan);

    if (lmiMode !== 'none') {
      const est = estimateLmi({
        propertyValue: purchasePrice,
        loanAmount: cappedLoan,
        isFirstHomeBuyer: isFhb,
      });
      lmi = est.lmiAmount;
    } else {
      lmi = 0;
    }

    loanAvail = lmiMode === 'debt_capitalised'
      ? Math.max(0, borrowingCapacity - lmi)
      : borrowingCapacity;

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
  if (otherCosts > 0) notes.push(`Acquisition costs: $${Math.round(otherCosts).toLocaleString()}`);

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
