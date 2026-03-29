/**
 * Borrowing Capacity Engine — Phase 2: Three-Output Model Types
 * 
 * The engine now produces three distinct result objects:
 * 
 * 1. current_capacity  — What the client can borrow TODAY based on actual financials
 * 2. scenario_capacity — What-if modelling (Phase 4 will add property-level deltas)
 * 3. proposed_loan_check — Can the client service a specific proposed loan?
 * 
 * These types are consumed by:
 * - Edge function (calculate-borrowing-capacity)
 * - Client-side utilities (borrowingCapacityCalculations.ts)
 * - ResultsPanel, BorrowingCapacityCard, ScenarioModeling components
 * - PDF report generators
 */

import type { ServiceabilityBand, IncomeBreakdownItem, LiabilityBreakdownItem, CalculationMode } from './borrowingCapacityCalculations';
import type { PropertyContributionSummary } from './propertyContributionEngine';

// ============================================
// CURRENT CAPACITY (Output 1)
// ============================================

/** Core borrowing capacity result — what the client can borrow right now */
export interface CurrentCapacityResult {
  /** Maximum borrowing capacity in AUD */
  borrowingCapacity: number;
  /** Monthly surplus after all commitments */
  monthlySurplus: number;
  /** Traffic-light serviceability band */
  serviceabilityBand: ServiceabilityBand;
  /** Capacity at +1% above assessment rate */
  stressTestedCapacity: number;
  /** Debt-to-Income ratio (total debt including new loan / gross annual income) */
  dtiRatio: number;
  /** Assessment rate used (interest + buffer) */
  assessmentRate: number;
  /** After-tax annual income used for serviceability */
  afterTaxAnnualIncome: number;
  /** After-tax monthly income */
  monthlyAfterTaxIncome: number;

  // ── Input Summary ──
  /** Gross annual income */
  grossAnnualIncome: number;
  /** Shaded annual income (after APRA shading rules) */
  shadedAnnualIncome: number;
  /** Income component breakdown */
  incomeBreakdown: IncomeBreakdownItem[];
  /** Monthly living expenses used (HEM or declared) */
  livingExpensesMonthly: number;
  /** Expense determination method */
  expenseMethod: 'hem' | 'declared' | 'declared_higher' | 'hybrid';
  /** HEM benchmark for reference */
  hemBenchmark: number;
  /** Total declared expenses from DB */
  declaredExpenses: number;
  /** Negative property cash flows layered on expenses */
  negativePropertyCashFlows: number;
  /** Total living expenses (base + negative CF) */
  totalLivingExpenses: number;
  /** Monthly existing commitments */
  existingCommitmentsMonthly: number;
  /** Liability component breakdown */
  liabilityBreakdown: LiabilityBreakdownItem[];
  /** Interest rate used */
  interestRate: number;
  /** Buffer rate applied */
  bufferRate: number;
  /** Loan term in years */
  loanTermYears: number;

  // ── Engine Metadata ──
  /** Calculation mode used */
  calculationMode: CalculationMode;
  /** Whether DTI cap was applied */
  dtiCapEnabled: boolean;
  /** DTI cap limit */
  dtiCapLimit: number;
  /** Selected lender name (if any) */
  selectedLenderName: string | null;
  /** Textual recommendations */
  recommendations: string[];
  /** Warning flags */
  warnings: string[];
  /** Calculation assumptions for transparency */
  assumptions: { key: string; value: string }[];

  // ── Tax Breakdown ──
  taxBreakdown: {
    taxPayable: number;
    medicareLevy: number;
    totalTax: number;
    afterTaxIncome: number;
    effectiveTaxRate: number;
    marginalTaxRate: number;
    marginalBracket: string;
    monthlyTakeHome: number;
  };

  // ── LMI ──
  lmiAmount: number;
  lmiMode: string;
  netPurchaseCapacity: number;

  // ── Phase 1: Property Contributions ──
  propertyContributions: {
    summary: {
      totalNetMonthlyContribution: number;
      totalLegacyIncome: number;
      totalLegacyExpense: number;
      totalLegacyLiability: number;
      totalLegacyDebtBalance: number;
      parityValidation: Record<string, any>;
    };
    properties: Array<{
      address: string;
      propertyType: string;
      rawNetMonthlyCashflow: number;
      assessedMonthlyRent: number;
      assessedMonthlyDebt: number;
      assessedMonthlyHoldingCosts: number;
      netMonthlyContribution: number;
      auditNotes: string[];
    }>;
  };

  /** ISO timestamp of when calculation was performed */
  calculatedAt: string;
}

// ============================================
// PROPOSED LOAN CHECK (Output 3)
// ============================================

/** Result of checking if a specific proposed loan amount is serviceable */
export interface ProposedLoanCheckResult {
  /** The proposed loan amount being tested */
  proposedLoanAmount: number;
  /** Whether the client can service this loan */
  isServiceable: boolean;
  /** Estimated monthly P&I repayment at assessment rate */
  monthlyRepayment: number;
  /** Headroom = borrowingCapacity - proposedLoanAmount */
  headroom: number;
  /** How much of capacity is used (0-100%) */
  utilizationPercent: number;
  /** DTI ratio including the proposed loan */
  dtiWithProposedLoan: number;
  /** Serviceability band if this loan is taken */
  projectedBand: ServiceabilityBand;
}

// ============================================
// SCENARIO CAPACITY (Output 2 — Phase 4 will expand)
// ============================================

/** A scenario delta describes a single what-if change */
export interface ScenarioDelta {
  /** Unique identifier for this delta */
  id: string;
  /** Human-readable label */
  label: string;
  /** Type of change */
  type: 'income_change' | 'expense_change' | 'debt_change' | 'rate_change' | 'property_sell' | 'property_refinance' | 'property_add' | 'liability_payoff';
  /** The change value (interpretation depends on type) */
  value: number;
  /** Unit: 'percent', 'absolute', 'rate_points' */
  unit: 'percent' | 'absolute' | 'rate_points';
}

/** Result of a scenario calculation */
export interface ScenarioCapacityResult {
  /** Name of the scenario */
  scenarioName: string;
  /** Deltas applied to produce this scenario */
  deltas: ScenarioDelta[];
  /** The resulting capacity under this scenario */
  borrowingCapacity: number;
  /** Monthly surplus under this scenario */
  monthlySurplus: number;
  /** Serviceability band under this scenario */
  serviceabilityBand: ServiceabilityBand;
  /** DTI ratio under this scenario */
  dtiRatio: number;
  /** Change from base capacity */
  capacityChange: {
    absolute: number;
    percent: number;
    direction: 'increase' | 'decrease' | 'unchanged';
  };
}

// ============================================
// THREE-OUTPUT ENVELOPE
// ============================================

/** The complete three-output response from the BC engine */
export interface ThreeOutputAssessment {
  /** Client identifier */
  clientId: string;
  /** Database assessment ID (if saved) */
  assessmentId: string | null;

  /** Output 1: Current borrowing capacity */
  currentCapacity: CurrentCapacityResult;

  /** Output 2: Scenario results (empty array if no scenarios run) */
  scenarios: ScenarioCapacityResult[];

  /** Output 3: Proposed loan check (null if no proposed amount) */
  proposedLoanCheck: ProposedLoanCheckResult | null;
}

// ============================================
// HELPER: Build proposed loan check from capacity result
// ============================================

export function buildProposedLoanCheck(
  proposedLoanAmount: number,
  borrowingCapacity: number,
  grossAnnualIncome: number,
  totalDebtBalances: number,
  interestRate: number,
  bufferRate: number,
  loanTermYears: number,
): ProposedLoanCheckResult {
  const assessmentRate = interestRate + bufferRate;
  const monthlyRate = (assessmentRate / 100) / 12;
  const periods = loanTermYears * 12;

  const monthlyRepayment = proposedLoanAmount > 0 && monthlyRate > 0
    ? Math.round(
        proposedLoanAmount *
          (monthlyRate * Math.pow(1 + monthlyRate, periods)) /
          (Math.pow(1 + monthlyRate, periods) - 1)
      )
    : 0;

  const isServiceable = borrowingCapacity >= proposedLoanAmount;
  const headroom = borrowingCapacity - proposedLoanAmount;
  const utilizationPercent = borrowingCapacity > 0
    ? Math.min(Math.round((proposedLoanAmount / borrowingCapacity) * 100), 100)
    : 0;

  const totalDebtWithProposed = totalDebtBalances + proposedLoanAmount;
  const dtiWithProposedLoan = grossAnnualIncome > 0
    ? Math.round((totalDebtWithProposed / grossAnnualIncome) * 100) / 100
    : 0;

  // Determine projected band
  let projectedBand: ServiceabilityBand = 'red';
  if (headroom > 0 && dtiWithProposedLoan < 6) {
    projectedBand = 'green';
  } else if (headroom >= 0 && dtiWithProposedLoan < 8) {
    projectedBand = 'amber';
  }

  return {
    proposedLoanAmount,
    isServiceable,
    monthlyRepayment,
    headroom,
    utilizationPercent,
    dtiWithProposedLoan,
    projectedBand,
  };
}

// ============================================
// HELPER: Build scenario capacity change
// ============================================

export function buildScenarioChange(
  baseCapacity: number,
  scenarioCapacity: number,
): { absolute: number; percent: number; direction: 'increase' | 'decrease' | 'unchanged' } {
  const absolute = scenarioCapacity - baseCapacity;
  const percent = baseCapacity > 0 ? Math.round((absolute / baseCapacity) * 1000) / 10 : 0;
  return {
    absolute,
    percent,
    direction: absolute > 0 ? 'increase' : absolute < 0 ? 'decrease' : 'unchanged',
  };
}
