/**
 * Borrowing Capacity Calculator - Client-Side Utilities
 * 
 * These utilities mirror the edge function logic for:
 * - Instant UI feedback
 * - What-if scenario modeling
 * - Offline calculations
 */

// ============================================
// TYPES
// ============================================

export type ServiceabilityBand = 'green' | 'amber' | 'red';

export interface IncomeBreakdownItem {
  component: string;
  grossAmount: number;
  shadingRate: number;
  shadedAmount: number;
}

export interface LiabilityBreakdownItem {
  type: string;
  balance: number;
  limit?: number;
  monthlyServicing: number;
}

export interface BorrowingCapacityInput {
  shadedAnnualIncome: number;
  monthlyLivingExpenses: number;
  monthlyCommitments: number;
  interestRate: number;
  bufferRate: number;
  loanTermYears: number;
}

export interface BorrowingCapacityResult {
  borrowingCapacity: number;
  monthlySurplus: number;
  serviceabilityBand: ServiceabilityBand;
  stressTestedCapacity: number;
  dtiRatio: number;
  assessmentRate: number;
  recommendations: string[];
  warnings: string[];
}

export interface FullAssessmentResult extends BorrowingCapacityResult {
  assessmentId?: string;
  clientId: string;
  grossAnnualIncome: number;
  shadedAnnualIncome: number;
  incomeBreakdown: IncomeBreakdownItem[];
  livingExpensesMonthly: number;
  expenseMethod: 'hem' | 'declared' | 'hybrid';
  hemBenchmark: number;
  existingCommitmentsMonthly: number;
  liabilityBreakdown: LiabilityBreakdownItem[];
  interestRate: number;
  bufferRate: number;
  loanTermYears: number;
  proposedLoanAmount?: number;
  assumptions: { key: string; value: string }[];
  calculatedAt: string;
}

// ============================================
// CONSTANTS
// ============================================

export const INCOME_SHADING_RULES: Record<string, { rate: number; label: string }> = {
  base_salary: { rate: 1.00, label: "Base Salary (PAYG)" },
  gross_salary: { rate: 1.00, label: "Gross Salary" },
  second_job: { rate: 0.80, label: "Second Job" },
  casual: { rate: 0.60, label: "Casual Income" },
  bonus: { rate: 0.80, label: "Bonus (avg 2yr)" },
  commission: { rate: 0.80, label: "Commission" },
  overtime_essential: { rate: 1.00, label: "Essential Overtime" },
  overtime_non_essential: { rate: 0.50, label: "Non-Essential Overtime" },
  allowance: { rate: 0.80, label: "Allowances" },
  rental_existing: { rate: 0.80, label: "Rental Income (Existing)" },
  rental_proposed: { rate: 0.70, label: "Rental Income (Proposed)" },
  investment_income: { rate: 0.80, label: "Investment Income" },
  government_payments: { rate: 1.00, label: "Government Payments" },
  self_employed: { rate: 0.80, label: "Self-Employed (2yr avg)" },
  other_taxable: { rate: 0.80, label: "Other Taxable" },
};

// HEM BENCHMARK TABLE (Monthly - AUD) - 2024 Industry Standard
// Updated to align with major lender HEM tables
export const HEM_BENCHMARKS: Record<string, Record<number, number>> = {
  single: {
    0: 2100,  // Was 1500 - updated to 2024 standards
    1: 2650,  // Was 2000
    2: 3050,  // Was 2300
    3: 3450,  // Was 2600
  },
  couple: {
    0: 2950,  // Was 2200 - updated to 2024 standards
    1: 3400,  // Was 2600
    2: 3850,  // Was 2900
    3: 4300,  // Was 3200
  },
};

// Rental income expense ratio - banks assume ~20-25% of rent goes to expenses
export const RENTAL_EXPENSE_RATIO = 0.20;

// Assessment rate for stress-testing existing loans
export const LOAN_ASSESSMENT_RATE = 0.095; // 9.5% (approx 6.5% + 3% buffer)

export const DEFAULT_CALCULATION_PARAMS = {
  interestRate: 6.50,
  bufferRate: 3.00,
  loanTermYears: 30,
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get HEM benchmark based on marital status and dependents
 */
export function getHemBenchmark(maritalStatus: string | null, dependentsCount: number | null): number {
  const status = maritalStatus?.toLowerCase() || 'single';
  const isCouple = ['married', 'de facto', 'couple', 'partnered'].includes(status);
  const dependents = Math.min(dependentsCount || 0, 3);
  
  const category = isCouple ? 'couple' : 'single';
  return HEM_BENCHMARKS[category][dependents] || HEM_BENCHMARKS[category][0];
}

/**
 * Get HECS repayment based on annual income (2024-25 rates)
 */
export function getHecsRepayment(annualIncome: number): number {
  const thresholds = [
    { min: 0, max: 54434, rate: 0.00 },
    { min: 54435, max: 62850, rate: 0.01 },
    { min: 62851, max: 66620, rate: 0.02 },
    { min: 66621, max: 70618, rate: 0.025 },
    { min: 70619, max: 74855, rate: 0.03 },
    { min: 74856, max: 79346, rate: 0.035 },
    { min: 79347, max: 84107, rate: 0.04 },
    { min: 84108, max: 89154, rate: 0.045 },
    { min: 89155, max: 94503, rate: 0.05 },
    { min: 94504, max: 100174, rate: 0.055 },
    { min: 100175, max: 106185, rate: 0.06 },
    { min: 106186, max: 112556, rate: 0.065 },
    { min: 112557, max: 119309, rate: 0.07 },
    { min: 119310, max: 126467, rate: 0.075 },
    { min: 126468, max: 134056, rate: 0.08 },
    { min: 134057, max: 142100, rate: 0.085 },
    { min: 142101, max: 150626, rate: 0.09 },
    { min: 150627, max: 159663, rate: 0.095 },
    { min: 159664, max: Infinity, rate: 0.10 },
  ];

  for (const bracket of thresholds) {
    if (annualIncome >= bracket.min && annualIncome <= bracket.max) {
      return (annualIncome * bracket.rate) / 12;
    }
  }
  return (annualIncome * 0.10) / 12;
}

/**
 * Get serviceability band color for styling
 */
export function getServiceabilityBandColor(band: ServiceabilityBand): {
  bg: string;
  text: string;
  border: string;
  label: string;
  description: string;
} {
  switch (band) {
    case 'green':
      return {
        bg: 'bg-emerald-500/10',
        text: 'text-emerald-500',
        border: 'border-emerald-500/30',
        label: 'Strong',
        description: 'Strong borrowing position',
      };
    case 'amber':
      return {
        bg: 'bg-amber-500/10',
        text: 'text-amber-500',
        border: 'border-amber-500/30',
        label: 'Moderate',
        description: 'Moderate capacity - proceed with caution',
      };
    case 'red':
      return {
        bg: 'bg-red-500/10',
        text: 'text-red-500',
        border: 'border-red-500/30',
        label: 'Limited',
        description: 'Limited capacity - focus on debt reduction',
      };
  }
}

// ============================================
// CORE CALCULATION FUNCTION
// ============================================

/**
 * Calculate borrowing capacity from input parameters
 * This mirrors the edge function logic for instant client-side calculations
 */
export function calculateBorrowingCapacity(params: BorrowingCapacityInput): BorrowingCapacityResult {
  const { 
    shadedAnnualIncome, 
    monthlyLivingExpenses, 
    monthlyCommitments, 
    interestRate, 
    bufferRate, 
    loanTermYears 
  } = params;
  
  // Assessment rate = current rate + APRA buffer
  const assessmentRate = interestRate + bufferRate;
  const monthlyRate = (assessmentRate / 100) / 12;
  
  // Monthly net income available
  const monthlyIncome = shadedAnnualIncome / 12;
  const monthlySurplus = monthlyIncome - monthlyLivingExpenses - monthlyCommitments;
  
  // Max new repayment = available surplus
  const maxNewRepayment = Math.max(0, monthlySurplus);
  
  // Reverse-calculate max loan from repayment using P&I formula
  const periods = loanTermYears * 12;
  let borrowingCapacity = 0;
  
  if (monthlyRate > 0 && maxNewRepayment > 0) {
    const factor = (1 - Math.pow(1 + monthlyRate, -periods)) / monthlyRate;
    borrowingCapacity = Math.round(maxNewRepayment * factor);
  }
  
  // Stress test at +1% above assessment
  const stressRate = ((assessmentRate + 1) / 100) / 12;
  let stressTestedCapacity = 0;
  if (stressRate > 0 && maxNewRepayment > 0) {
    const stressFactor = (1 - Math.pow(1 + stressRate, -periods)) / stressRate;
    stressTestedCapacity = Math.round(maxNewRepayment * stressFactor);
  }
  
  // DTI ratio
  const totalAnnualDebt = (monthlyCommitments * 12) + (borrowingCapacity > 0 ? borrowingCapacity / loanTermYears : 0);
  const dtiRatio = shadedAnnualIncome > 0 ? Math.round((totalAnnualDebt / shadedAnnualIncome) * 100) / 100 : 0;
  
  // Determine band
  let serviceabilityBand: ServiceabilityBand;
  if (monthlySurplus > 500 && dtiRatio < 6) {
    serviceabilityBand = 'green';
  } else if (monthlySurplus > 0 && dtiRatio < 8) {
    serviceabilityBand = 'amber';
  } else {
    serviceabilityBand = 'red';
  }
  
  // Generate recommendations
  const recommendations: string[] = [];
  const warnings: string[] = [];
  
  if (serviceabilityBand === 'green') {
    recommendations.push("Strong borrowing position - ready for property acquisition");
    if (borrowingCapacity > 500000) {
      recommendations.push("Consider accelerating portfolio growth while rates are favorable");
    }
  } else if (serviceabilityBand === 'amber') {
    recommendations.push("Moderate borrowing capacity - proceed with caution");
    if (dtiRatio > 5) {
      recommendations.push("Consider debt reduction strategies before new borrowing");
    }
    if (monthlySurplus < 300) {
      recommendations.push("Build cash buffer to improve serviceability");
    }
  } else {
    recommendations.push("Limited borrowing capacity - focus on strengthening financial position");
    recommendations.push("Consider paying down high-interest debts first");
    if (monthlyCommitments > monthlyIncome * 0.5) {
      recommendations.push("Existing commitments are high - debt consolidation may help");
    }
  }
  
  // Add warnings
  if (dtiRatio >= 7) {
    warnings.push("DTI ratio exceeds most lender thresholds");
  }
  if (monthlySurplus < 0) {
    warnings.push("Monthly expenses exceed income - unable to service new debt");
  }
  if (borrowingCapacity < 100000 && shadedAnnualIncome > 50000) {
    warnings.push("Borrowing capacity constrained by existing commitments");
  }
  
  return {
    borrowingCapacity,
    monthlySurplus: Math.round(monthlySurplus),
    serviceabilityBand,
    stressTestedCapacity,
    dtiRatio,
    assessmentRate,
    recommendations,
    warnings,
  };
}

/**
 * Format currency for display
 */
export function formatCapacity(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(2)}M`;
  } else if (amount >= 1000) {
    return `$${Math.round(amount / 1000)}K`;
  }
  return `$${amount.toLocaleString()}`;
}

/**
 * Calculate capacity change for scenario comparison
 */
export function calculateCapacityChange(
  baseResult: BorrowingCapacityResult,
  scenarioResult: BorrowingCapacityResult
): {
  absoluteChange: number;
  percentChange: number;
  direction: 'increase' | 'decrease' | 'unchanged';
} {
  const absoluteChange = scenarioResult.borrowingCapacity - baseResult.borrowingCapacity;
  const percentChange = baseResult.borrowingCapacity > 0 
    ? (absoluteChange / baseResult.borrowingCapacity) * 100 
    : 0;
  
  return {
    absoluteChange,
    percentChange: Math.round(percentChange * 10) / 10,
    direction: absoluteChange > 0 ? 'increase' : absoluteChange < 0 ? 'decrease' : 'unchanged',
  };
}
