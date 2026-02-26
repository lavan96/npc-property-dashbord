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

export type CalculationMode = 'bank' | 'conservative';

export interface CalculationModeConfig {
  mode: CalculationMode;
  dtiCapEnabled: boolean;
  dtiCapLimit: number;
}

export interface BorrowingCapacityInput {
  grossAnnualIncome: number; // Gross income before tax
  shadedAnnualIncome: number; // After shading applied (kept for DTI calc)
  monthlyLivingExpenses: number;
  monthlyCommitments: number;
  interestRate: number;
  bufferRate: number;
  loanTermYears: number;
  // Optional mode configuration
  calculationMode?: CalculationMode;
  dtiCapEnabled?: boolean;
  dtiCapLimit?: number;
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
  // After-tax metrics for transparency
  afterTaxAnnualIncome: number;
  monthlyAfterTaxIncome: number;
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
// 2025-26 AUSTRALIAN TAX BRACKETS
// ============================================

// Tax brackets excluding Medicare Levy (which is 2% additional)
export const TAX_BRACKETS_2025_26 = [
  { min: 0, max: 18200, rate: 0, base: 0 },
  { min: 18201, max: 45000, rate: 0.16, base: 0 },
  { min: 45001, max: 135000, rate: 0.30, base: 4288 },
  { min: 135001, max: 190000, rate: 0.37, base: 31288 },
  { min: 190001, max: Infinity, rate: 0.45, base: 51638 },
];

export const MEDICARE_LEVY_RATE = 0.02;

/**
 * Calculate income tax payable for a given taxable income (2025-26 rates)
 * @param taxableIncome - Annual taxable income
 * @param includeMedicareLevy - Whether to include 2% Medicare Levy (default: true)
 * @returns Tax payable amount
 */
export function calculateIncomeTax(taxableIncome: number, includeMedicareLevy: boolean = true): number {
  if (taxableIncome <= 0) return 0;
  
  let tax = 0;
  
  for (const bracket of TAX_BRACKETS_2025_26) {
    if (taxableIncome >= bracket.min) {
      if (bracket.rate === 0) {
        // Tax-free threshold - no tax
        continue;
      }
      if (taxableIncome <= bracket.max) {
        // Income falls within this bracket
        const previousBracketMax = TAX_BRACKETS_2025_26[TAX_BRACKETS_2025_26.indexOf(bracket) - 1]?.max || 0;
        tax = bracket.base + (taxableIncome - previousBracketMax) * bracket.rate;
        break;
      }
    }
  }
  
  // Add Medicare Levy (2%)
  if (includeMedicareLevy) {
    tax += taxableIncome * MEDICARE_LEVY_RATE;
  }
  
  return Math.round(tax);
}

/**
 * Get the marginal tax rate for a given income level
 * @param taxableIncome - Annual taxable income
 * @param includeMedicareLevy - Whether to include 2% Medicare Levy (default: true)
 * @returns Marginal tax rate as decimal (e.g., 0.32 for 32%)
 */
export function getMarginalTaxRate(taxableIncome: number, includeMedicareLevy: boolean = true): number {
  if (taxableIncome <= 0) return 0;
  
  let marginalRate = 0;
  
  for (const bracket of TAX_BRACKETS_2025_26) {
    if (taxableIncome >= bracket.min && taxableIncome <= bracket.max) {
      marginalRate = bracket.rate;
      break;
    }
  }
  
  // Add Medicare Levy if applicable
  if (includeMedicareLevy) {
    marginalRate += MEDICARE_LEVY_RATE;
  }
  
  return marginalRate;
}

/**
 * Calculate after-tax income (take-home pay)
 * @param grossAnnualIncome - Annual gross income
 * @param includeMedicareLevy - Whether to include 2% Medicare Levy (default: true)
 * @returns After-tax income
 */
export function calculateAfterTaxIncome(grossAnnualIncome: number, includeMedicareLevy: boolean = true): number {
  const tax = calculateIncomeTax(grossAnnualIncome, includeMedicareLevy);
  return grossAnnualIncome - tax;
}

/**
 * Get full tax breakdown for display purposes
 */
export interface TaxBreakdown {
  grossIncome: number;
  taxPayable: number;
  medicareLevy: number;
  totalTax: number;
  afterTaxIncome: number;
  effectiveTaxRate: number;
  marginalTaxRate: number;
  marginalBracket: string;
  monthlyTakeHome: number;
}

export function getTaxBreakdown(grossAnnualIncome: number): TaxBreakdown {
  const taxWithoutMedicare = calculateIncomeTax(grossAnnualIncome, false);
  const medicareLevy = Math.round(grossAnnualIncome * MEDICARE_LEVY_RATE);
  const totalTax = taxWithoutMedicare + medicareLevy;
  const afterTaxIncome = grossAnnualIncome - totalTax;
  const marginalRate = getMarginalTaxRate(grossAnnualIncome, true);
  
  // Determine marginal bracket label
  let marginalBracket = '$0 - $18,200 (0%)';
  if (grossAnnualIncome > 190000) {
    marginalBracket = '$190,001+ (45% + 2% ML)';
  } else if (grossAnnualIncome > 135000) {
    marginalBracket = '$135,001 - $190,000 (37% + 2% ML)';
  } else if (grossAnnualIncome > 45000) {
    marginalBracket = '$45,001 - $135,000 (30% + 2% ML)';
  } else if (grossAnnualIncome > 18200) {
    marginalBracket = '$18,201 - $45,000 (16% + 2% ML)';
  }
  
  return {
    grossIncome: grossAnnualIncome,
    taxPayable: taxWithoutMedicare,
    medicareLevy,
    totalTax,
    afterTaxIncome,
    effectiveTaxRate: grossAnnualIncome > 0 ? totalTax / grossAnnualIncome : 0,
    marginalTaxRate: marginalRate,
    marginalBracket,
    monthlyTakeHome: Math.round(afterTaxIncome / 12),
  };
}

/**
 * Calculate negative gearing tax refund based on marginal rate
 * @param taxableLoss - The negative gearing loss (should be positive number)
 * @param grossAnnualIncome - Client's gross annual income to determine marginal rate
 * @returns Tax refund amount
 */
export function calculateNegativeGearingRefund(taxableLoss: number, grossAnnualIncome: number): number {
  if (taxableLoss <= 0) return 0;
  
  const marginalRate = getMarginalTaxRate(grossAnnualIncome, true);
  return Math.round(taxableLoss * marginalRate);
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
// BASE values - these get scaled by income level
export const HEM_BENCHMARKS_BASE: Record<string, Record<number, number>> = {
  single: {
    0: 2100,  // Base for < $80k income
    1: 2650,
    2: 3050,
    3: 3450,
  },
  couple: {
    0: 2950,  // Base for < $80k income
    1: 3400,
    2: 3850,
    3: 4300,
  },
};

// Income-based HEM scaling factors
// Higher income = higher expected living expenses
export const HEM_INCOME_SCALING: { maxIncome: number; multiplier: number }[] = [
  { maxIncome: 80000, multiplier: 1.00 },   // Base HEM
  { maxIncome: 120000, multiplier: 1.20 },  // 20% uplift for $80-120k
  { maxIncome: 180000, multiplier: 1.40 },  // 40% uplift for $120-180k
  { maxIncome: 250000, multiplier: 1.60 },  // 60% uplift for $180-250k
  { maxIncome: Infinity, multiplier: 1.80 }, // 80% uplift for $250k+
];

// For backwards compatibility - deprecated, use getHemBenchmark with income param
export const HEM_BENCHMARKS = HEM_BENCHMARKS_BASE;

// Rental income expense ratio - banks assume ~20-25% of rent goes to expenses
export const RENTAL_EXPENSE_RATIO = 0.20;

// Assessment rate for stress-testing existing loans
export const LOAN_ASSESSMENT_RATE = 0.095; // 9.5% (approx 6.5% + 3% buffer)

export const DEFAULT_CALCULATION_PARAMS = {
  interestRate: 6.50,
  bufferRate: 3.00,
  loanTermYears: 30,
};

// Conservative mode adjustments (Quickli-style)
export const CONSERVATIVE_MODE_ADJUSTMENTS = {
  minimumSurplusFloor: 1000, // Enforce $1,000/mo minimum surplus
  residualIncomeFloor: 1500, // Minimum residual income requirement
  surplusBufferMultiplier: 0.85, // Only use 85% of calculated surplus
  dtiHardCap: 6, // Hard cap DTI at 6x
};

// Default DTI cap settings
export const DEFAULT_DTI_CAP = 6.0;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get HEM benchmark based on marital status, dependents, and income
 * Income-scaled to reflect higher living costs for higher earners
 */
export interface HemBreakdown {
  householdType: 'single' | 'couple';
  dependentsCount: number;
  baseHem: number;
  incomeTier: string;
  multiplier: number;
  finalHem: number;
}

export function getHemBreakdown(maritalStatus: string | null, dependentsCount: number | null, grossAnnualIncome: number = 0): HemBreakdown {
  const status = maritalStatus?.toLowerCase() || 'single';
  const isCouple = ['married', 'de facto', 'couple', 'partnered'].includes(status);
  const dependents = Math.min(dependentsCount || 0, 3);
  
  const householdType = isCouple ? 'couple' : 'single';
  const baseHem = HEM_BENCHMARKS_BASE[householdType][dependents] || HEM_BENCHMARKS_BASE[householdType][0];
  
  // Find income tier and multiplier
  let multiplier = 1.0;
  let incomeTier = 'Under $80k';
  
  for (let i = 0; i < HEM_INCOME_SCALING.length; i++) {
    const tier = HEM_INCOME_SCALING[i];
    if (grossAnnualIncome <= tier.maxIncome) {
      multiplier = tier.multiplier;
      if (tier.maxIncome === 80000) incomeTier = 'Under $80k';
      else if (tier.maxIncome === 120000) incomeTier = '$80k - $120k';
      else if (tier.maxIncome === 180000) incomeTier = '$120k - $180k';
      else if (tier.maxIncome === 250000) incomeTier = '$180k - $250k';
      else incomeTier = 'Over $250k';
      break;
    }
  }
  
  return {
    householdType,
    dependentsCount: dependents,
    baseHem,
    incomeTier,
    multiplier,
    finalHem: Math.round(baseHem * multiplier),
  };
}

export function getHemBenchmark(maritalStatus: string | null, dependentsCount: number | null, grossAnnualIncome: number = 0): number {
  return getHemBreakdown(maritalStatus, dependentsCount, grossAnnualIncome).finalHem;
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
    grossAnnualIncome,
    shadedAnnualIncome, 
    monthlyLivingExpenses, 
    monthlyCommitments, 
    interestRate, 
    bufferRate, 
    loanTermYears,
    calculationMode = 'bank',
    dtiCapEnabled = false,
    dtiCapLimit = DEFAULT_DTI_CAP,
  } = params;
  
  const isConservative = calculationMode === 'conservative';
  
  // Assessment rate = current rate + APRA buffer
  const assessmentRate = interestRate + bufferRate;
  const monthlyRate = (assessmentRate / 100) / 12;
  
  // *** KEY CHANGE: Calculate after-tax income for serviceability ***
  // Banks assess serviceability based on after-tax income, not gross
  const afterTaxAnnualIncome = calculateAfterTaxIncome(grossAnnualIncome);
  const monthlyAfterTaxIncome = afterTaxAnnualIncome / 12;
  
  // Monthly net income available = after-tax income (what they actually take home)
  const monthlyIncome = monthlyAfterTaxIncome;
  let monthlySurplus = monthlyIncome - monthlyLivingExpenses - monthlyCommitments;
  
  // Conservative mode adjustments
  if (isConservative) {
    // Apply surplus buffer multiplier (only use 85% of calculated surplus)
    monthlySurplus = monthlySurplus * CONSERVATIVE_MODE_ADJUSTMENTS.surplusBufferMultiplier;
    
    // Enforce minimum surplus floor
    if (monthlySurplus < CONSERVATIVE_MODE_ADJUSTMENTS.minimumSurplusFloor) {
      monthlySurplus = Math.max(0, monthlySurplus);
    }
    
    // Enforce residual income floor
    const residualIncome = monthlyIncome - monthlyCommitments;
    if (residualIncome < CONSERVATIVE_MODE_ADJUSTMENTS.residualIncomeFloor) {
      monthlySurplus = Math.max(0, monthlySurplus - (CONSERVATIVE_MODE_ADJUSTMENTS.residualIncomeFloor - residualIncome));
    }
  }
  
  // Max new repayment = available surplus
  let maxNewRepayment = Math.max(0, monthlySurplus);
  
  // Reverse-calculate max loan from repayment using P&I formula
  const periods = loanTermYears * 12;
  let borrowingCapacity = 0;
  
  if (monthlyRate > 0 && maxNewRepayment > 0) {
    const factor = (1 - Math.pow(1 + monthlyRate, -periods)) / monthlyRate;
    borrowingCapacity = Math.round(maxNewRepayment * factor);
  }
  
  // Calculate DTI ratio using actual annual debt servicing (not simple division)
  // DTI = Total Annual Debt Servicing / Gross Annual Income
  const newLoanAnnualServicing = maxNewRepayment * 12; // Actual P&I repayments per year
  const existingAnnualServicing = monthlyCommitments * 12;
  let totalAnnualDebtServicing = existingAnnualServicing + newLoanAnnualServicing;
  let dtiRatio = shadedAnnualIncome > 0 ? Math.round((totalAnnualDebtServicing / shadedAnnualIncome) * 100) / 100 : 0;
  
  // Apply DTI cap if enabled or in conservative mode
  const effectiveDtiCap = isConservative ? CONSERVATIVE_MODE_ADJUSTMENTS.dtiHardCap : dtiCapLimit;
  const shouldApplyDtiCap = dtiCapEnabled || isConservative;
  
  if (shouldApplyDtiCap && dtiRatio > effectiveDtiCap && shadedAnnualIncome > 0) {
    // Calculate max annual servicing to stay within DTI cap
    const maxTotalAnnualServicing = shadedAnnualIncome * effectiveDtiCap;
    const maxNewAnnualServicing = Math.max(0, maxTotalAnnualServicing - existingAnnualServicing);
    const maxNewMonthlyRepayment = maxNewAnnualServicing / 12;
    
    // Reverse-calculate max loan from the DTI-capped monthly repayment
    if (monthlyRate > 0 && maxNewMonthlyRepayment > 0) {
      const factor = (1 - Math.pow(1 + monthlyRate, -periods)) / monthlyRate;
      const dtiCappedCapacity = Math.round(maxNewMonthlyRepayment * factor);
      
      if (dtiCappedCapacity < borrowingCapacity) {
        borrowingCapacity = dtiCappedCapacity;
        // Recalculate DTI with capped capacity
        totalAnnualDebtServicing = existingAnnualServicing + (maxNewMonthlyRepayment * 12);
        dtiRatio = Math.round((totalAnnualDebtServicing / shadedAnnualIncome) * 100) / 100;
      }
    } else {
      borrowingCapacity = 0;
      dtiRatio = shadedAnnualIncome > 0 ? Math.round((existingAnnualServicing / shadedAnnualIncome) * 100) / 100 : 0;
    }
  }
  
  // Stress test at +1% above assessment
  const stressRate = ((assessmentRate + 1) / 100) / 12;
  let stressTestedCapacity = 0;
  if (stressRate > 0 && maxNewRepayment > 0) {
    const stressFactor = (1 - Math.pow(1 + stressRate, -periods)) / stressRate;
    stressTestedCapacity = Math.round(maxNewRepayment * stressFactor);
    
    // Apply DTI cap to stress-tested capacity as well
    if (shouldApplyDtiCap && stressTestedCapacity > borrowingCapacity) {
      stressTestedCapacity = Math.min(stressTestedCapacity, borrowingCapacity);
    }
  }
  
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
  
  // Add mode-specific context
  if (isConservative) {
    recommendations.push("Conservative mode: Capacity adjusted with minimum surplus floors and DTI cap");
  }
  
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
  if (shouldApplyDtiCap && dtiRatio >= effectiveDtiCap * 0.9) {
    warnings.push(`DTI ratio approaching ${effectiveDtiCap}x cap limit`);
  }
  if (dtiRatio >= 7) {
    warnings.push("DTI ratio exceeds most lender thresholds");
  }
  if (monthlySurplus < 0) {
    warnings.push("Monthly expenses exceed income - unable to service new debt");
  }
  if (borrowingCapacity < 100000 && shadedAnnualIncome > 50000) {
    warnings.push("Borrowing capacity constrained by existing commitments");
  }
  if (isConservative && monthlySurplus < CONSERVATIVE_MODE_ADJUSTMENTS.minimumSurplusFloor) {
    warnings.push(`Surplus below conservative minimum floor of $${CONSERVATIVE_MODE_ADJUSTMENTS.minimumSurplusFloor}/mo`);
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
    afterTaxAnnualIncome,
    monthlyAfterTaxIncome: Math.round(monthlyAfterTaxIncome),
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
