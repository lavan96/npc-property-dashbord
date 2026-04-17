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
  | 'equity_release';

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
}

export interface ScenarioLiability {
  id: string;
  type: string;
  label: string;
  balance: number;
  limit?: number;
  monthlyServicing: number;
}

export interface ScenarioContext {
  baseInputs: ScenarioBaseInputs;
  baseResult: ScenarioBaseResult;
  properties: ScenarioProperty[];
  liabilities: ScenarioLiability[];
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
    description,
  };
}

function blendedShadingRatio(ctx: ScenarioContext): number {
  const gross = ctx.baseInputs.grossAnnualIncome;
  const shaded = ctx.baseInputs.shadedAnnualIncome;
  if (gross <= 0) return 0.8;
  return Math.max(0, Math.min(1, shaded / gross));
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
        const ioRate = context.baseInputs.interestRate / 100 / 12;
        const io = property.loanRemaining * ioRate;
        const saving = Math.max(0, cur - io);
        if (saving > 0) effect.commitmentAdjustment = -saving;
        effect.description = `Refinance ${property.address?.slice(0, 30) || 'property'} to IO`;
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
      // Phase B: informational only (Phase C will fold released capital into
      // acquisition capacity). The audit trail still surfaces it.
      const property = context.properties.find(p => p.id === delta.id);
      if (property) effect.description = `Release equity from ${property.address?.slice(0, 30) || 'property'}`;
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
    if (e.dtiCapEnabled !== undefined) total.dtiCapEnabled = e.dtiCapEnabled;
    if (e.dtiCapLimit !== undefined) total.dtiCapLimit = e.dtiCapLimit;
  }

  const inputs: AggregatedScenarioInputs = {
    grossAnnualIncome: Math.max(0, context.baseInputs.grossAnnualIncome + total.incomeAdjustment),
    shadedAnnualIncome: Math.max(0, context.baseInputs.shadedAnnualIncome + total.shadedIncomeAdjustment),
    monthlyLivingExpenses: Math.max(0, context.baseInputs.monthlyLivingExpenses + total.expenseAdjustment),
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
