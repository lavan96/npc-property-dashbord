/**
 * Scenario Delta Engine (Phase 4)
 * 
 * Replaces percentage-based sliders with discrete, composable delta operations.
 * Each delta describes a specific financial change (sell property, refinance,
 * pay off liability, income change, rate change) and the engine applies them
 * to the base calculation inputs to produce a scenario result.
 * 
 * The engine:
 * 1. Takes base BorrowingCapacityInput + array of ScenarioDelta objects
 * 2. Applies each delta to modify the base inputs
 * 3. Runs calculateBorrowingCapacity with modified inputs
 * 4. Returns ScenarioCapacityResult with change comparison
 * 
 * Used by:
 * - Edge function (server-side scenario runs)
 * - ScenarioModeling component (client-side instant feedback)
 * - StrategyScenarioModeling component (strategy builder)
 * - PDF report generators (scenario comparison pages)
 */

import {
  calculateBorrowingCapacity,
  type BorrowingCapacityInput,
  type BorrowingCapacityResult,
} from './borrowingCapacityCalculations';
import {
  type ScenarioDelta,
  type ScenarioCapacityResult,
  buildScenarioChange,
} from './borrowingCapacityTypes';

// ============================================
// DELTA APPLICATION CONTEXT
// ============================================

/** Extended input that carries property/liability context for property-level deltas */
export interface ScenarioContext {
  /** Base BC inputs */
  baseInputs: BorrowingCapacityInput;
  /** Base BC result (for change comparison) */
  baseResult: BorrowingCapacityResult;
  /** Properties available for sell/refinance deltas */
  properties?: ScenarioProperty[];
  /** Liabilities available for payoff deltas */
  liabilities?: ScenarioLiability[];
}

export interface ScenarioProperty {
  id: string;
  address: string;
  propertyType: string;
  currentValue: number;
  loanRemaining: number;
  monthlyRepayment: number;
  /** Loan repayment (P&I or IO) */
  loanRepaymentAmount?: number;
  /** Net monthly cash flow (rent - expenses) */
  netMonthlyCashflow?: number;
  /** Monthly rental income */
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
// DELTA APPLICATION FUNCTIONS
// ============================================

interface DeltaEffect {
  incomeAdjustment: number;       // annual income delta
  shadedIncomeAdjustment: number; // annual shaded income delta
  expenseAdjustment: number;      // monthly expense delta
  commitmentAdjustment: number;   // monthly commitment delta
  rateAdjustment: number;         // interest rate delta (percentage points)
  loanTermAdjustment: number;     // loan term delta (years)
  debtBalanceAdjustment: number;  // total debt balance delta (for DTI)
  description: string;            // human-readable description
}

function applyDelta(
  delta: ScenarioDelta,
  context: ScenarioContext,
): DeltaEffect {
  const effect: DeltaEffect = {
    incomeAdjustment: 0,
    shadedIncomeAdjustment: 0,
    expenseAdjustment: 0,
    commitmentAdjustment: 0,
    rateAdjustment: 0,
    loanTermAdjustment: 0,
    debtBalanceAdjustment: 0,
    description: delta.label,
  };

  switch (delta.type) {
    case 'income_change': {
      if (delta.unit === 'percent') {
        const factor = delta.value / 100;
        effect.incomeAdjustment = context.baseInputs.grossAnnualIncome * factor;
        effect.shadedIncomeAdjustment = context.baseInputs.shadedAnnualIncome * factor;
      } else {
        effect.incomeAdjustment = delta.value;
        effect.shadedIncomeAdjustment = delta.value * 0.8; // Apply standard shading
      }
      break;
    }

    case 'expense_change': {
      if (delta.unit === 'percent') {
        const factor = delta.value / 100;
        effect.expenseAdjustment = context.baseInputs.monthlyLivingExpenses * factor;
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
        effect.debtBalanceAdjustment = delta.value * 200; // Rough approximation
      }
      break;
    }

    case 'rate_change': {
      // Always in percentage points
      effect.rateAdjustment = delta.value;
      break;
    }

    case 'property_sell': {
      // delta.id should reference a property ID
      const property = context.properties?.find(p => p.id === delta.id);
      if (property) {
        // Remove loan servicing from commitments
        const loanServicing = property.loanRepaymentAmount || property.monthlyRepayment || 0;
        if (loanServicing > 0) {
          effect.commitmentAdjustment = -loanServicing;
        }
        // Remove loan balance from DTI
        if (property.loanRemaining > 0) {
          effect.debtBalanceAdjustment = -property.loanRemaining;
        }
        // Remove rental income if investment property
        const netCashflow = property.netMonthlyCashflow || 0;
        if (netCashflow > 0) {
          // Positive cashflow was added as income (annualized, shaded at 80%)
          effect.incomeAdjustment = -(netCashflow * 12);
          effect.shadedIncomeAdjustment = -(netCashflow * 12 * 0.8);
        } else if (netCashflow < 0) {
          // Negative cashflow was added as expense
          effect.expenseAdjustment = netCashflow; // negative, so subtracting a negative = reduction
        }
        effect.description = `Sell ${property.address?.slice(0, 30) || 'property'}`;
      }
      break;
    }

    case 'property_refinance': {
      // Refinance P&I → IO
      const property = context.properties?.find(p => p.id === delta.id);
      if (property && property.loanRemaining > 0) {
        const currentRepayment = property.monthlyRepayment || 0;
        // IO repayment = loan_remaining × (interest_rate / 12)
        const ioRate = context.baseInputs.interestRate / 100 / 12;
        const ioRepayment = property.loanRemaining * ioRate;
        const saving = Math.max(0, currentRepayment - ioRepayment);
        if (saving > 0) {
          effect.commitmentAdjustment = -saving;
        }
        effect.description = `Refinance ${property.address?.slice(0, 30) || 'property'} to IO`;
      }
      break;
    }

    case 'property_add': {
      // Adding a new property — delta.value = estimated monthly net contribution
      if (delta.unit === 'absolute') {
        if (delta.value > 0) {
          effect.incomeAdjustment = delta.value * 12;
          effect.shadedIncomeAdjustment = delta.value * 12 * 0.8;
        } else {
          effect.expenseAdjustment = Math.abs(delta.value);
        }
      }
      break;
    }

    case 'liability_payoff': {
      // delta.id should reference a liability ID
      const liability = context.liabilities?.find(l => l.id === delta.id);
      if (liability) {
        effect.commitmentAdjustment = -liability.monthlyServicing;
        effect.debtBalanceAdjustment = -(liability.balance || 0);
        effect.description = `Pay off ${liability.label || liability.type}`;
      }
      break;
    }
  }

  return effect;
}

// ============================================
// CORE ENGINE: RUN SCENARIO
// ============================================

/**
 * Run a single scenario by applying an array of deltas to the base inputs,
 * then computing a new borrowing capacity.
 */
export function runScenario(
  scenarioName: string,
  deltas: ScenarioDelta[],
  context: ScenarioContext,
): ScenarioCapacityResult {
  // Accumulate all delta effects
  const totalEffect: DeltaEffect = {
    incomeAdjustment: 0,
    shadedIncomeAdjustment: 0,
    expenseAdjustment: 0,
    commitmentAdjustment: 0,
    rateAdjustment: 0,
    loanTermAdjustment: 0,
    debtBalanceAdjustment: 0,
    description: scenarioName,
  };

  for (const delta of deltas) {
    const effect = applyDelta(delta, context);
    totalEffect.incomeAdjustment += effect.incomeAdjustment;
    totalEffect.shadedIncomeAdjustment += effect.shadedIncomeAdjustment;
    totalEffect.expenseAdjustment += effect.expenseAdjustment;
    totalEffect.commitmentAdjustment += effect.commitmentAdjustment;
    totalEffect.rateAdjustment += effect.rateAdjustment;
    totalEffect.loanTermAdjustment += effect.loanTermAdjustment;
    totalEffect.debtBalanceAdjustment += effect.debtBalanceAdjustment;
  }

  // Build scenario inputs
  const scenarioInputs: BorrowingCapacityInput = {
    ...context.baseInputs,
    grossAnnualIncome: Math.max(0, context.baseInputs.grossAnnualIncome + totalEffect.incomeAdjustment),
    shadedAnnualIncome: Math.max(0, context.baseInputs.shadedAnnualIncome + totalEffect.shadedIncomeAdjustment),
    monthlyLivingExpenses: Math.max(0, context.baseInputs.monthlyLivingExpenses + totalEffect.expenseAdjustment),
    monthlyCommitments: Math.max(0, context.baseInputs.monthlyCommitments + totalEffect.commitmentAdjustment),
    interestRate: Math.max(0.5, context.baseInputs.interestRate + totalEffect.rateAdjustment),
    loanTermYears: Math.max(5, context.baseInputs.loanTermYears + totalEffect.loanTermAdjustment),
    totalDebtBalances: Math.max(0, (context.baseInputs.totalDebtBalances || 0) + totalEffect.debtBalanceAdjustment),
  };

  // Run calculation
  const scenarioResult = calculateBorrowingCapacity(scenarioInputs);

  // Build change comparison
  const capacityChange = buildScenarioChange(
    context.baseResult.borrowingCapacity,
    scenarioResult.borrowingCapacity,
  );

  return {
    scenarioName,
    deltas,
    borrowingCapacity: scenarioResult.borrowingCapacity,
    monthlySurplus: scenarioResult.monthlySurplus,
    serviceabilityBand: scenarioResult.serviceabilityBand,
    dtiRatio: scenarioResult.dtiRatio,
    capacityChange,
  };
}

/**
 * Run multiple scenarios in parallel (each with its own set of deltas).
 */
export function runMultipleScenarios(
  scenarios: { name: string; deltas: ScenarioDelta[] }[],
  context: ScenarioContext,
): ScenarioCapacityResult[] {
  return scenarios.map(s => runScenario(s.name, s.deltas, context));
}

// ============================================
// PRESET SCENARIO FACTORIES
// ============================================

/** Create a "Pay Off All Unsecured Debt" scenario */
export function createPayOffAllDebtScenario(
  liabilities: ScenarioLiability[],
): { name: string; deltas: ScenarioDelta[] } {
  const unsecured = liabilities.filter(l => 
    !l.type.includes('home_loan') && 
    !l.type.includes('investment_loan') &&
    !l.type.includes('rent_expense')
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

/** Create a "Sell Property" scenario */
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

/** Create a "Refinance to IO" scenario */
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

/** Create a "Rate Change" scenario */
export function createRateChangeScenario(
  rateChange: number,
): { name: string; deltas: ScenarioDelta[] } {
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

/** Create an "Income Change" scenario */
export function createIncomeChangeScenario(
  percentChange: number,
): { name: string; deltas: ScenarioDelta[] } {
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

/** Create a "Maximum Strategy" compound scenario */
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

// ============================================
// EXPORTS
// ============================================

export type { DeltaEffect };
