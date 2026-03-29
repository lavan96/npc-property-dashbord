import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// POLICY ENGINE — Single source of truth for all constants
// ============================================

interface IncomeShadingRule { rate: number; label: string; }
interface HemConfig {
  baseBenchmarks: Record<'single' | 'couple', Record<number, number>>;
  incomeScaling: { maxIncome: number; multiplier: number }[];
}
interface BandThresholds { greenSurplusMin: number; greenDtiMax: number; amberDtiMax: number; }
interface ConservativeModeConfig { minimumSurplusFloor: number; residualIncomeFloor: number; surplusBufferMultiplier: number; dtiHardCap: number; }
interface LoanDefaults { interestRate: number; bufferRate: number; loanTermYears: number; stressTestIncrement: number; dtiCap: number; }
interface PropertyPolicy { rentalShadingRate: number; proposedRentalShadingRate: number; vacancyRate: number; loanAssessmentRate: number; loanTermMonths: number; rentalExpenseRatio: number; }
interface LiabilityRules { creditCardLimitRate: number; bnplLimitRate: number; }
interface TaxConfig { taxYear: string; brackets: { min: number; max: number; rate: number; base: number }[]; medicareLevyRate: number; }
interface HecsConfig { thresholds: { min: number; max: number; rate: number }[]; }

interface PolicyConfig {
  name: string;
  incomeShadingRules: Record<string, IncomeShadingRule>;
  hem: HemConfig;
  bandThresholds: BandThresholds;
  conservativeMode: ConservativeModeConfig;
  loanDefaults: LoanDefaults;
  propertyPolicy: PropertyPolicy;
  liabilityRules: LiabilityRules;
  tax: TaxConfig;
  hecs: HecsConfig;
}

const DEFAULT_POLICY: PolicyConfig = {
  name: 'Default APRA',
  incomeShadingRules: {
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
  },
  hem: {
    baseBenchmarks: {
      single: { 0: 2100, 1: 2650, 2: 3050, 3: 3450 },
      couple: { 0: 2950, 1: 3400, 2: 3850, 3: 4300 },
    },
    incomeScaling: [
      { maxIncome: 80000, multiplier: 1.00 },
      { maxIncome: 120000, multiplier: 1.20 },
      { maxIncome: 180000, multiplier: 1.40 },
      { maxIncome: 250000, multiplier: 1.60 },
      { maxIncome: Infinity, multiplier: 1.80 },
    ],
  },
  bandThresholds: { greenSurplusMin: 500, greenDtiMax: 6, amberDtiMax: 8 },
  conservativeMode: { minimumSurplusFloor: 1000, residualIncomeFloor: 1500, surplusBufferMultiplier: 0.85, dtiHardCap: 6 },
  loanDefaults: { interestRate: 6.50, bufferRate: 3.00, loanTermYears: 30, stressTestIncrement: 1.0, dtiCap: 6.0 },
  propertyPolicy: { rentalShadingRate: 0.80, proposedRentalShadingRate: 0.70, vacancyRate: 0.0, loanAssessmentRate: 0.095, loanTermMonths: 360, rentalExpenseRatio: 0.20 },
  liabilityRules: { creditCardLimitRate: 0.03, bnplLimitRate: 0.05 },
  tax: {
    taxYear: '2025-26',
    brackets: [
      { min: 0, max: 18200, rate: 0, base: 0 },
      { min: 18201, max: 45000, rate: 0.16, base: 0 },
      { min: 45001, max: 135000, rate: 0.30, base: 4288 },
      { min: 135001, max: 190000, rate: 0.37, base: 31288 },
      { min: 190001, max: Infinity, rate: 0.45, base: 51638 },
    ],
    medicareLevyRate: 0.02,
  },
  hecs: {
    thresholds: [
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
    ],
  },
};

// Lender profiles
const LENDER_PROFILES: Record<string, Partial<PolicyConfig>> = {
  default: { name: 'Default APRA' },
  conservative: {
    name: 'Conservative',
    loanDefaults: { ...DEFAULT_POLICY.loanDefaults, bufferRate: 3.50 },
    bandThresholds: { greenSurplusMin: 750, greenDtiMax: 5, amberDtiMax: 7 },
  },
  cba: {
    name: 'Commonwealth Bank',
    incomeShadingRules: { ...DEFAULT_POLICY.incomeShadingRules, casual: { rate: 0.50, label: "Casual Income (CBA)" }, bonus: { rate: 0.70, label: "Bonus (CBA)" } },
  },
  westpac: {
    name: 'Westpac',
    incomeShadingRules: { ...DEFAULT_POLICY.incomeShadingRules, overtime_non_essential: { rate: 0.40, label: "Non-Essential OT (Westpac)" } },
  },
  anz: {
    name: 'ANZ',
    liabilityRules: { creditCardLimitRate: 0.038, bnplLimitRate: 0.05 },
  },
  nab: {
    name: 'NAB',
    incomeShadingRules: { ...DEFAULT_POLICY.incomeShadingRules, commission: { rate: 0.70, label: "Commission (NAB)" } },
  },
  macquarie: {
    name: 'Macquarie Bank',
    loanDefaults: { ...DEFAULT_POLICY.loanDefaults, bufferRate: 2.50 },
    bandThresholds: { greenSurplusMin: 400, greenDtiMax: 7, amberDtiMax: 9 },
  },
};

function buildPolicy(overrides: Partial<PolicyConfig> = {}): PolicyConfig {
  return {
    name: overrides.name ?? DEFAULT_POLICY.name,
    incomeShadingRules: { ...DEFAULT_POLICY.incomeShadingRules, ...overrides.incomeShadingRules },
    hem: overrides.hem ?? DEFAULT_POLICY.hem,
    bandThresholds: { ...DEFAULT_POLICY.bandThresholds, ...overrides.bandThresholds },
    conservativeMode: { ...DEFAULT_POLICY.conservativeMode, ...overrides.conservativeMode },
    loanDefaults: { ...DEFAULT_POLICY.loanDefaults, ...overrides.loanDefaults },
    propertyPolicy: { ...DEFAULT_POLICY.propertyPolicy, ...overrides.propertyPolicy },
    liabilityRules: { ...DEFAULT_POLICY.liabilityRules, ...overrides.liabilityRules },
    tax: overrides.tax ?? DEFAULT_POLICY.tax,
    hecs: overrides.hecs ?? DEFAULT_POLICY.hecs,
  };
}

function resolvePolicy(lenderName?: string | null): PolicyConfig {
  if (!lenderName) return DEFAULT_POLICY;
  const key = lenderName.toLowerCase().replace(/\s+/g, '');
  for (const [id, profile] of Object.entries(LENDER_PROFILES)) {
    if (key === id || key.includes(id) || id.includes(key)) {
      return buildPolicy(profile);
    }
  }
  return DEFAULT_POLICY;
}

// Backward-compatible aliases
const INCOME_SHADING_RULES = DEFAULT_POLICY.incomeShadingRules;
const RENTAL_EXPENSE_RATIO = DEFAULT_POLICY.propertyPolicy.rentalExpenseRatio;

// ============================================
// PROPERTY CONTRIBUTION ENGINE (Phase 1)
// Unified per-property assessment model
// ============================================

// PropertyContributionPolicy now uses PolicyConfig.propertyPolicy
type PropertyContributionPolicy = PropertyPolicy;

interface PropertyContributionResult {
  propertyId: string;
  address: string;
  propertyType: string;
  rawMonthlyRent: number;
  rawNetMonthlyCashflow: number;
  rawLoanBalance: number;
  rawMonthlyRepayment: number;
  assessedMonthlyRent: number;
  assessedMonthlyDebt: number;
  assessedMonthlyHoldingCosts: number;
  netMonthlyContribution: number;
  legacyIncomeContribution: number;
  legacyExpenseContribution: number;
  legacyLiabilityContribution: number;
  legacyDebtBalance: number;
  auditNotes: string[];
}

interface PropertyContributionSummary {
  properties: PropertyContributionResult[];
  totalLegacyIncome: number;
  totalLegacyExpense: number;
  totalLegacyLiability: number;
  totalLegacyDebtBalance: number;
  totalNetMonthlyContribution: number;
}

function assessPropertyContribution(
  property: any,
  policy: PropertyContributionPolicy = DEFAULT_PROPERTY_POLICY,
): PropertyContributionResult {
  const propertyType = property.property_type?.toLowerCase() || '';
  const address = property.address?.substring(0, 40) || 'Property';
  const auditNotes: string[] = [];

  if (propertyType === 'rental') {
    const monthlyRentPaid = property.monthly_rental_income || 0;
    auditNotes.push(`Rental: client pays $${monthlyRentPaid}/mo`);
    return {
      propertyId: property.id || '',
      address, propertyType,
      rawMonthlyRent: 0, rawNetMonthlyCashflow: 0, rawLoanBalance: 0, rawMonthlyRepayment: 0,
      assessedMonthlyRent: 0, assessedMonthlyDebt: 0, assessedMonthlyHoldingCosts: 0,
      netMonthlyContribution: -monthlyRentPaid,
      legacyIncomeContribution: 0, legacyExpenseContribution: 0,
      legacyLiabilityContribution: monthlyRentPaid, legacyDebtBalance: 0,
      auditNotes,
    };
  }

  const rawNetMonthlyCashflow = property.net_monthly_cashflow || 0;
  const rawMonthlyRent = property.monthly_rental_income || 0;
  const rawLoanBalance = property.loan_remaining || 0;
  const rawMonthlyRepayment = property.monthly_interest_repayment || 0;

  const assessedMonthlyRent = rawMonthlyRent * policy.rentalShadingRate * (1 - policy.vacancyRate);

  let assessedMonthlyDebt = 0;
  if (rawLoanBalance > 0) {
    const monthlyRate = policy.loanAssessmentRate / 12;
    const piRepayment = rawLoanBalance *
      (monthlyRate * Math.pow(1 + monthlyRate, policy.loanTermMonths)) /
      (Math.pow(1 + monthlyRate, policy.loanTermMonths) - 1);
    assessedMonthlyDebt = Math.max(piRepayment, rawMonthlyRepayment);
  }

  const assessedMonthlyHoldingCosts = 0;
  const netMonthlyContribution = assessedMonthlyRent - assessedMonthlyDebt - assessedMonthlyHoldingCosts;

  let legacyIncomeContribution = 0;
  if (rawNetMonthlyCashflow > 0) {
    legacyIncomeContribution = rawNetMonthlyCashflow * 12 * policy.rentalShadingRate;
  }

  let legacyExpenseContribution = 0;
  if (rawNetMonthlyCashflow < 0) {
    legacyExpenseContribution = Math.abs(rawNetMonthlyCashflow);
  }

  const legacyLiabilityContribution = rawLoanBalance > 0 ? Math.round(assessedMonthlyDebt * 100) / 100 : 0;

  auditNotes.push(`Net contribution: $${netMonthlyContribution.toFixed(2)}/mo`);
  auditNotes.push(`Legacy: income=$${legacyIncomeContribution.toFixed(2)}/yr, expense=$${legacyExpenseContribution.toFixed(2)}/mo, liability=$${legacyLiabilityContribution.toFixed(2)}/mo`);

  return {
    propertyId: property.id || '', address, propertyType,
    rawMonthlyRent, rawNetMonthlyCashflow, rawLoanBalance, rawMonthlyRepayment,
    assessedMonthlyRent, assessedMonthlyDebt, assessedMonthlyHoldingCosts,
    netMonthlyContribution,
    legacyIncomeContribution, legacyExpenseContribution, legacyLiabilityContribution,
    legacyDebtBalance: rawLoanBalance,
    auditNotes,
  };
}

function assessAllPropertyContributions(
  properties: any[],
  policy: PropertyContributionPolicy = DEFAULT_PROPERTY_POLICY,
): PropertyContributionSummary {
  const results: PropertyContributionResult[] = [];
  let totalLegacyIncome = 0;
  let totalLegacyExpense = 0;
  let totalLegacyLiability = 0;
  let totalLegacyDebtBalance = 0;
  let totalNetMonthlyContribution = 0;

  for (const property of properties) {
    const result = assessPropertyContribution(property, policy);
    results.push(result);
    totalLegacyIncome += result.legacyIncomeContribution;
    totalLegacyExpense += result.legacyExpenseContribution;
    totalLegacyLiability += result.legacyLiabilityContribution;
    totalLegacyDebtBalance += result.legacyDebtBalance;
    totalNetMonthlyContribution += result.netMonthlyContribution;
  }

  return {
    properties: results,
    totalLegacyIncome, totalLegacyExpense, totalLegacyLiability,
    totalLegacyDebtBalance, totalNetMonthlyContribution,
  };
}

// ============================================
// 2025-26 AUSTRALIAN TAX BRACKETS
// ============================================
const TAX_BRACKETS_2025_26 = [
  { min: 0, max: 18200, rate: 0, base: 0 },
  { min: 18201, max: 45000, rate: 0.16, base: 0 },
  { min: 45001, max: 135000, rate: 0.30, base: 4288 },
  { min: 135001, max: 190000, rate: 0.37, base: 31288 },
  { min: 190001, max: Infinity, rate: 0.45, base: 51638 },
];

const MEDICARE_LEVY_RATE = 0.02;

function calculateIncomeTax(taxableIncome: number, includeMedicareLevy: boolean = true): number {
  if (taxableIncome <= 0) return 0;
  
  let tax = 0;
  
  for (const bracket of TAX_BRACKETS_2025_26) {
    if (taxableIncome >= bracket.min) {
      if (bracket.rate === 0) continue;
      if (taxableIncome <= bracket.max) {
        const previousBracketMax = TAX_BRACKETS_2025_26[TAX_BRACKETS_2025_26.indexOf(bracket) - 1]?.max || 0;
        tax = bracket.base + (taxableIncome - previousBracketMax) * bracket.rate;
        break;
      }
    }
  }
  
  if (includeMedicareLevy) {
    tax += taxableIncome * MEDICARE_LEVY_RATE;
  }
  
  return Math.round(tax);
}

function getMarginalTaxRate(taxableIncome: number, includeMedicareLevy: boolean = true): number {
  if (taxableIncome <= 0) return 0;
  
  let marginalRate = 0;
  for (const bracket of TAX_BRACKETS_2025_26) {
    if (taxableIncome >= bracket.min && taxableIncome <= bracket.max) {
      marginalRate = bracket.rate;
      break;
    }
  }
  
  if (includeMedicareLevy) {
    marginalRate += MEDICARE_LEVY_RATE;
  }
  
  return marginalRate;
}

function getTaxBreakdown(grossAnnualIncome: number) {
  const taxWithoutMedicare = calculateIncomeTax(grossAnnualIncome, false);
  const medicareLevy = Math.round(grossAnnualIncome * MEDICARE_LEVY_RATE);
  const totalTax = taxWithoutMedicare + medicareLevy;
  const afterTaxIncome = grossAnnualIncome - totalTax;
  const marginalRate = getMarginalTaxRate(grossAnnualIncome, true);
  
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

// ============================================
// HECS/HELP REPAYMENT THRESHOLDS (2024-25)
// ============================================
const HECS_THRESHOLDS = [
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

interface IncomeBreakdownItem {
  component: string;
  grossAmount: number;
  shadingRate: number;
  shadedAmount: number;
}

interface LiabilityBreakdownItem {
  type: string;
  balance: number;
  limit?: number;
  monthlyServicing: number;
}

interface CalculationResult {
  borrowingCapacity: number;
  monthlySurplus: number;
  serviceabilityBand: 'green' | 'amber' | 'red';
  stressTestedCapacity: number;
  dtiRatio: number;
  assessmentRate: number;
  recommendations: string[];
  warnings: string[];
}

function getHecsRepayment(annualIncome: number): number {
  for (const bracket of HECS_THRESHOLDS) {
    if (annualIncome >= bracket.min && annualIncome <= bracket.max) {
      return (annualIncome * bracket.rate) / 12; // Monthly
    }
  }
  return (annualIncome * 0.10) / 12;
}

function getHemBenchmark(maritalStatus: string | null, dependentsCount: number | null, grossAnnualIncome: number = 0): number {
  const status = maritalStatus?.toLowerCase() || 'single';
  const isCouple = ['married', 'de facto', 'couple', 'partnered'].includes(status);
  const dependents = Math.min(dependentsCount || 0, 3);
  
  const category = isCouple ? 'couple' : 'single';
  const baseHem = HEM_BENCHMARKS_BASE[category][dependents] || HEM_BENCHMARKS_BASE[category][0];
  
  // Apply income-based scaling
  let multiplier = 1.0;
  for (const tier of HEM_INCOME_SCALING) {
    if (grossAnnualIncome <= tier.maxIncome) {
      multiplier = tier.multiplier;
      break;
    }
  }
  
  return Math.round(baseHem * multiplier);
}

function calculateIncomeBreakdown(incomeRecords: any[], properties: any[], incomeSources: any[]): { 
  grossTotal: number; 
  shadedTotal: number; 
  breakdown: IncomeBreakdownItem[];
} {
  const breakdown: IncomeBreakdownItem[] = [];
  let grossTotal = 0;
  let shadedTotal = 0;

  // Prefer new multi-source income table (client_income_sources) over legacy client_income
  const useNewSources = incomeSources && incomeSources.length > 0;

  if (useNewSources) {
    // Process from client_income_sources (supports primary, secondary, additional contacts)
    for (const src of incomeSources) {
      const contactLabel = src.contact_type === 'primary' ? 'Primary' : 
        src.contact_type === 'secondary' ? 'Secondary' : src.contact_type;
      const sourceName = src.source_name || src.source_type || 'Income';
      const effectiveShading = src.custom_shading_rate ?? src.default_shading_rate ?? 1.0;

      // Base gross annual amount
      const grossAnnual = Number(src.gross_annual_amount) || 0;
      if (grossAnnual > 0) {
        grossTotal += grossAnnual;
        const shadedAmount = grossAnnual * effectiveShading;
        shadedTotal += shadedAmount;
        breakdown.push({
          component: `${contactLabel} ${sourceName}`,
          grossAmount: grossAnnual,
          shadingRate: effectiveShading,
          shadedAmount,
        });
      }

      // Employment sub-fields with their own shading
      const subFields = [
        { key: 'bonus', label: 'Bonus', shading: INCOME_SHADING_RULES.bonus.rate },
        { key: 'commission', label: 'Commission', shading: INCOME_SHADING_RULES.commission.rate },
        { key: 'overtime_essential', label: 'Essential OT', shading: INCOME_SHADING_RULES.overtime_essential.rate },
        { key: 'overtime_non_essential', label: 'Non-Essential OT', shading: INCOME_SHADING_RULES.overtime_non_essential.rate },
        { key: 'allowance', label: 'Allowance', shading: INCOME_SHADING_RULES.allowance.rate },
        { key: 'other_taxable_income', label: 'Other Taxable', shading: INCOME_SHADING_RULES.other_taxable.rate },
      ];
      for (const { key, label, shading } of subFields) {
        const val = Number(src[key]) || 0;
        if (val > 0) {
          grossTotal += val;
          const shadedAmount = val * shading;
          shadedTotal += shadedAmount;
          breakdown.push({
            component: `${contactLabel} ${label}`,
            grossAmount: val,
            shadingRate: shading,
            shadedAmount,
          });
        }
      }
    }
  } else {
    // Fallback: Process from legacy client_income table
    for (const income of incomeRecords) {
      if (income.gross_salary && income.gross_salary > 0) {
        const frequency = income.salary_frequency?.toLowerCase() || 'annual';
        let annualAmount = income.gross_salary;
        if (frequency === 'monthly') annualAmount *= 12;
        else if (frequency === 'fortnightly') annualAmount *= 26;
        else if (frequency === 'weekly') annualAmount *= 52;
        
        const rule = INCOME_SHADING_RULES.gross_salary;
        grossTotal += annualAmount;
        shadedTotal += annualAmount * rule.rate;
        breakdown.push({ component: rule.label, grossAmount: annualAmount, shadingRate: rule.rate, shadedAmount: annualAmount * rule.rate });
      }
      const legacyFields = [
        { key: 'bonus', rule: INCOME_SHADING_RULES.bonus },
        { key: 'commission', rule: INCOME_SHADING_RULES.commission },
        { key: 'overtime_essential', rule: INCOME_SHADING_RULES.overtime_essential },
        { key: 'overtime_non_essential', rule: INCOME_SHADING_RULES.overtime_non_essential },
        { key: 'allowance', rule: INCOME_SHADING_RULES.allowance },
        { key: 'other_taxable_income', rule: INCOME_SHADING_RULES.other_taxable },
      ];
      for (const { key, rule } of legacyFields) {
        const val = Number(income[key]) || 0;
        if (val > 0) {
          grossTotal += val;
          shadedTotal += val * rule.rate;
          breakdown.push({ component: rule.label, grossAmount: val, shadingRate: rule.rate, shadedAmount: val * rule.rate });
        }
      }
    }
  }

  // Add POSITIVE property cash flows as income
  for (const property of properties) {
    const propertyType = property.property_type?.toLowerCase() || '';
    if (propertyType === 'rental') continue;
    
    const netMonthlyCashflow = property.net_monthly_cashflow || 0;
    if (netMonthlyCashflow > 0) {
      const annualPositiveCashflow = netMonthlyCashflow * 12;
      const rule = INCOME_SHADING_RULES.rental_existing;
      grossTotal += annualPositiveCashflow;
      const shadedAmount = annualPositiveCashflow * rule.rate;
      shadedTotal += shadedAmount;
      breakdown.push({
        component: `Positive Cash Flow (${property.address?.substring(0, 30) || 'Property'}...)`,
        grossAmount: annualPositiveCashflow,
        shadingRate: rule.rate,
        shadedAmount,
      });
    }
  }

  return { grossTotal, shadedTotal, breakdown };
}

// Calculate negative property cash flows to be layered on top of expenses
function calculateNegativePropertyCashFlows(properties: any[]): {
  totalMonthly: number;
  breakdown: { address: string; monthlyCashflow: number }[];
} {
  let totalMonthly = 0;
  const breakdown: { address: string; monthlyCashflow: number }[] = [];

  for (const property of properties) {
    const propertyType = property.property_type?.toLowerCase() || '';
    
    // Skip rental properties (where client pays rent) - handled separately
    if (propertyType === 'rental') continue;
    
    const netMonthlyCashflow = property.net_monthly_cashflow || 0;
    
    // Only include NEGATIVE cash flows as additional expenses
    if (netMonthlyCashflow < 0) {
      const absoluteCashflow = Math.abs(netMonthlyCashflow);
      totalMonthly += absoluteCashflow;
      breakdown.push({
        address: property.address?.substring(0, 40) || 'Investment Property',
        monthlyCashflow: absoluteCashflow,
      });
    }
  }

  return { totalMonthly, breakdown };
}

function calculateLiabilityBreakdown(liabilities: any[], properties: any[], annualIncome: number): {
  totalMonthly: number;
  breakdown: LiabilityBreakdownItem[];
} {
  const breakdown: LiabilityBreakdownItem[] = [];
  let totalMonthly = 0;

  // Process liabilities
  for (const liability of liabilities) {
    const type = liability.liability_type?.toLowerCase() || 'other';
    let monthlyServicing = 0;

    if (type.includes('credit') || type.includes('card')) {
      // Credit card: 3% of credit limit
      const limit = liability.credit_limit || liability.current_balance || 0;
      monthlyServicing = limit * 0.03;
      breakdown.push({
        type: 'Credit Card',
        balance: liability.current_balance || 0,
        limit,
        monthlyServicing,
      });
    } else if (type.includes('hecs') || type.includes('help')) {
      // HECS: Based on income threshold
      monthlyServicing = getHecsRepayment(annualIncome);
      breakdown.push({
        type: 'HECS/HELP',
        balance: liability.current_balance || 0,
        monthlyServicing,
      });
    } else if (type.includes('afterpay') || type.includes('bnpl') || type.includes('buy now')) {
      // BNPL: 5% of limit or actual monthly
      const limit = liability.credit_limit || liability.current_balance || 0;
      monthlyServicing = Math.max(limit * 0.05, liability.monthly_repayment || 0);
      breakdown.push({
        type: 'Buy Now Pay Later',
        balance: liability.current_balance || 0,
        limit,
        monthlyServicing,
      });
    } else {
      // All other loans: Use actual repayment
      monthlyServicing = liability.monthly_repayment || 0;
      breakdown.push({
        type: liability.liability_type || 'Other Loan',
        balance: liability.current_balance || 0,
        monthlyServicing,
      });
    }

    totalMonthly += monthlyServicing;
  }

  // Add existing property loans - stress-tested at P&I repayments
  // Banks assess existing loans at P&I even if currently interest-only
  const assessmentRateForLoans = 0.095; // 9.5% assessment rate (approx 6.5% + 3% buffer)
  const loanTermMonths = 30 * 12; // 30 year term for calculation
  
  for (const property of properties) {
    const propertyType = property.property_type?.toLowerCase() || '';
    
    // Handle rental properties (where client is tenant paying rent)
    if (propertyType === 'rental') {
      // Rent paid is treated as an existing commitment
      const monthlyRentPaid = property.monthly_rental_income || 0;
      if (monthlyRentPaid > 0) {
        totalMonthly += monthlyRentPaid;
        breakdown.push({
          type: `Rent Expense (${property.address?.substring(0, 30) || 'Rental'}...)`,
          balance: 0,
          monthlyServicing: monthlyRentPaid,
        });
      }
    } else if (property.loan_remaining && property.loan_remaining > 0) {
      // Calculate P&I servicing at assessment rate, regardless of actual loan type
      // This is how banks stress-test existing loans
      const loanBalance = property.loan_remaining;
      const monthlyRate = assessmentRateForLoans / 12;
      
      // P&I repayment formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
      const piRepayment = loanBalance * (monthlyRate * Math.pow(1 + monthlyRate, loanTermMonths)) 
                          / (Math.pow(1 + monthlyRate, loanTermMonths) - 1);
      
      // Use the higher of: P&I calculated or actual recorded repayment
      const actualRepayment = property.monthly_interest_repayment || 0;
      const monthlyServicing = Math.max(piRepayment, actualRepayment);
      
      totalMonthly += monthlyServicing;
      breakdown.push({
        type: `Existing Loan P&I (${property.address?.substring(0, 30) || 'Property'}...)`,
        balance: loanBalance,
        monthlyServicing: Math.round(monthlyServicing * 100) / 100,
      });
    }
  }

  return { totalMonthly, breakdown };
}

// Conservative mode adjustments (matches client-side logic)
const CONSERVATIVE_MODE_ADJUSTMENTS = {
  minimumSurplusFloor: 1000,
  residualIncomeFloor: 1500,
  surplusBufferMultiplier: 0.85,
  dtiHardCap: 6,
};

const DEFAULT_DTI_CAP = 6.0;

function calculateBorrowingCapacity(params: {
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
}): CalculationResult & { afterTaxAnnualIncome: number; monthlyAfterTaxIncome: number } {
  const { grossAnnualIncome, shadedAnnualIncome, monthlyLivingExpenses, monthlyCommitments, 
          interestRate, bufferRate, loanTermYears,
          calculationMode = 'bank', dtiCapEnabled = false, dtiCapLimit = DEFAULT_DTI_CAP } = params;
  
  const isConservative = calculationMode === 'conservative';
  
  // Assessment rate = current rate + APRA buffer
  const assessmentRate = interestRate + bufferRate;
  const monthlyRate = (assessmentRate / 100) / 12;
  
  // Calculate after-tax income for serviceability
  const taxBreakdown = getTaxBreakdown(grossAnnualIncome);
  const afterTaxAnnualIncome = taxBreakdown.afterTaxIncome;
  const monthlyAfterTaxIncome = afterTaxAnnualIncome / 12;
  
  const monthlyIncome = monthlyAfterTaxIncome;
  let monthlySurplus = monthlyIncome - monthlyLivingExpenses - monthlyCommitments;
  
  // Conservative mode adjustments (mirrors client-side logic exactly)
  if (isConservative) {
    monthlySurplus = monthlySurplus * CONSERVATIVE_MODE_ADJUSTMENTS.surplusBufferMultiplier;
    
    if (monthlySurplus < CONSERVATIVE_MODE_ADJUSTMENTS.minimumSurplusFloor) {
      monthlySurplus = Math.max(0, monthlySurplus);
    }
    
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
  
  // DTI ratio - Industry standard: Total Outstanding Debt Balances / Gross Annual Income
  const totalDebtWithNewLoan = params.totalDebtBalances + borrowingCapacity;
  let dtiRatio = params.grossAnnualIncome > 0 ? Math.round((totalDebtWithNewLoan / params.grossAnnualIncome) * 100) / 100 : 0;
  
  // Apply DTI cap if enabled or in conservative mode
  const effectiveDtiCap = isConservative ? CONSERVATIVE_MODE_ADJUSTMENTS.dtiHardCap : dtiCapLimit;
  const shouldApplyDtiCap = dtiCapEnabled || isConservative;
  
  if (shouldApplyDtiCap && dtiRatio > effectiveDtiCap && grossAnnualIncome > 0) {
    const maxTotalDebt = grossAnnualIncome * effectiveDtiCap;
    const maxNewLoan = Math.max(0, maxTotalDebt - params.totalDebtBalances);
    
    if (maxNewLoan < borrowingCapacity) {
      borrowingCapacity = Math.round(maxNewLoan);
      dtiRatio = Math.round(((params.totalDebtBalances + borrowingCapacity) / grossAnnualIncome) * 100) / 100;
    }
  }
  
  // Stress test at +1% above assessment
  const stressRate = ((assessmentRate + 1) / 100) / 12;
  let stressTestedCapacity = 0;
  if (stressRate > 0 && maxNewRepayment > 0) {
    const stressFactor = (1 - Math.pow(1 + stressRate, -periods)) / stressRate;
    stressTestedCapacity = Math.round(maxNewRepayment * stressFactor);
    
    if (shouldApplyDtiCap && stressTestedCapacity > borrowingCapacity) {
      stressTestedCapacity = Math.min(stressTestedCapacity, borrowingCapacity);
    }
  }
  
  // Determine band
  let serviceabilityBand: 'green' | 'amber' | 'red';
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

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { clientId, overrides, saveResult = true } = body;

    // SECURITY: Verify authentication (enforced - TODO removed)
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.log(`[calculate-borrowing-capacity] Auth failed for client ${clientId}:`, authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }
    console.log(`[calculate-borrowing-capacity] Authenticated user: ${userId}`);

    if (!clientId) {
      return new Response(
        JSON.stringify({ success: false, error: "Client ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[calculate-borrowing-capacity] Processing client: ${clientId}`);

    // Fetch client data
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .single();

    if (clientError || !client) {
      console.error("Client not found:", clientError);
      return new Response(
        JSON.stringify({ success: false, error: "Client not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch related data in parallel - INCLUDING client_expenses and new income sources
    const [incomeResult, incomeSourcesResult, liabilitiesResult, propertiesResult, expensesResult] = await Promise.all([
      supabase.from("client_income").select("*").eq("client_id", clientId),
      supabase.from("client_income_sources").select("*").eq("client_id", clientId).eq("is_active", true).order("display_order"),
      supabase.from("client_liabilities").select("*").eq("client_id", clientId),
      supabase.from("client_properties").select("*").eq("client_id", clientId),
      supabase.from("client_expenses").select("*").eq("client_id", clientId),
    ]);

    const incomeRecords = incomeResult.data || [];
    const incomeSources = incomeSourcesResult.data || [];
    const liabilities = liabilitiesResult.data || [];
    const properties = propertiesResult.data || [];
    const clientExpenses = expensesResult.data || [];
    
    // Calculate total declared living expenses from client_expenses table
    const totalDeclaredExpenses = clientExpenses.reduce((sum, exp) => sum + (Number(exp.monthly_amount) || 0), 0);
    console.log(`[calculate-borrowing-capacity] Declared expenses from DB: $${totalDeclaredExpenses}/month from ${clientExpenses.length} expense records`);

    console.log(`[calculate-borrowing-capacity] Found ${incomeSources.length} income sources (new), ${incomeRecords.length} income records (legacy), ${liabilities.length} liabilities, ${properties.length} properties`);

    // Calculate income - prefers client_income_sources over legacy client_income
    const { grossTotal, shadedTotal, breakdown: incomeBreakdown } = calculateIncomeBreakdown(incomeRecords, properties, incomeSources);
    
    // Apply overrides if provided
    const effectiveGrossIncome = overrides?.grossAnnualIncome ?? grossTotal;
    const effectiveShadedIncome = overrides?.shadedAnnualIncome 
      ? overrides.shadedAnnualIncome
      : overrides?.additionalIncome 
        ? shadedTotal + (overrides.additionalIncome * 0.8) 
        : shadedTotal;

    // Calculate living expenses (HEM or override) - use income-scaled HEM
    const hemBenchmark = getHemBenchmark(client.marital_status, client.dependents_count, effectiveGrossIncome);
    
    // CRITICAL: Use the HIGHER of HEM benchmark OR declared expenses from database
    // This is the "hybrid" approach that banks use - they take the greater value
    // Overrides take precedence if provided (for UI-driven calculations)
    let livingExpenses: number;
    if (overrides?.livingExpenses !== undefined && overrides?.livingExpenses !== null) {
      // UI explicitly passed a value - use it
      livingExpenses = overrides.livingExpenses;
    } else {
      // Default: use MAX(HEM, declared) - the "hybrid" approach
      livingExpenses = Math.max(hemBenchmark, totalDeclaredExpenses);
    }
    
    const expenseMethodUsed = overrides?.livingExpenses 
      ? 'declared' 
      : (totalDeclaredExpenses > hemBenchmark ? 'declared_higher' : 'hem');
    
    console.log(`[calculate-borrowing-capacity] Expenses: HEM=$${hemBenchmark}, Declared=$${totalDeclaredExpenses}, Using=$${livingExpenses} (${expenseMethodUsed})`);

    // Calculate NEGATIVE property cash flows - these are layered ON TOP of expenses
    const { totalMonthly: negativePropertyCashFlows, breakdown: negativeCashFlowBreakdown } = 
      calculateNegativePropertyCashFlows(properties);
    
    // Total living expenses = MAX(HEM, declared) + negative property cash flows
    const totalLivingExpenses = livingExpenses + negativePropertyCashFlows;
    
    console.log(`[calculate-borrowing-capacity] Negative property cash flows: $${negativePropertyCashFlows}/month from ${negativeCashFlowBreakdown.length} properties`);
    console.log(`[calculate-borrowing-capacity] Total living expenses (base + negative CF): $${totalLivingExpenses}/month`);

    // ── PROPERTY CONTRIBUTION ENGINE (Phase 1) ──
    // Run unified assessment alongside legacy for parity validation
    const propertyContributions = assessAllPropertyContributions(properties);
    
    // Parity validation: compare engine outputs against legacy functions
    // Legacy income from properties = income added by calculateIncomeBreakdown from positive cashflows
    const legacyPropertyIncomeFromBreakdown = incomeBreakdown
      .filter((item: any) => item.component?.startsWith('Positive Cash Flow'))
      .reduce((sum: number, item: any) => sum + item.shadedAmount, 0);
    
    const parityChecks = {
      incomeMatch: Math.abs(propertyContributions.totalLegacyIncome - legacyPropertyIncomeFromBreakdown) <= 1,
      expenseMatch: Math.abs(propertyContributions.totalLegacyExpense - negativePropertyCashFlows) <= 1,
      incomeEngine: propertyContributions.totalLegacyIncome,
      incomeLegacy: legacyPropertyIncomeFromBreakdown,
      expenseEngine: propertyContributions.totalLegacyExpense,
      expenseLegacy: negativePropertyCashFlows,
      unifiedNetContribution: propertyContributions.totalNetMonthlyContribution,
    };
    
    console.log(`[calculate-borrowing-capacity] Property Contribution Engine:`, JSON.stringify(parityChecks));
    if (!parityChecks.incomeMatch || !parityChecks.expenseMatch) {
      console.warn(`[calculate-borrowing-capacity] PARITY WARNING: Property contribution engine outputs differ from legacy!`);
    }

    // Calculate liability servicing
    const { totalMonthly: liabilityServicing, breakdown: liabilityBreakdown } = 
      calculateLiabilityBreakdown(liabilities, properties, effectiveGrossIncome);
    
    // Calculate total outstanding debt balances for DTI (industry standard)
    let totalDebtBalances = liabilityBreakdown.reduce((sum, item) => sum + (item.balance || 0), 0);
    console.log(`[calculate-borrowing-capacity] Total debt balances for DTI: $${totalDebtBalances}`);
    
    // debt_capitalised mode: Add LMI to total debt balances so it impacts DTI and capacity
    const lmiMode = overrides?.lmiMode || 'none';
    const lmiAmount = overrides?.lmiAmount || 0;
    if (lmiMode === 'debt_capitalised' && lmiAmount > 0) {
      totalDebtBalances += lmiAmount;
      console.log(`[calculate-borrowing-capacity] LMI capitalised: +$${lmiAmount} → total debt now $${totalDebtBalances}`);
    }
    
    // Calculate monthly servicing cost of capitalised LMI
    // When LMI is added to the loan, it must be serviced at the assessment rate
    let lmiMonthlyServicing = 0;
    if (lmiMode === 'debt_capitalised' && lmiAmount > 0) {
      const lmiAssessmentRate = ((overrides?.interestRate ?? 6.50) + (overrides?.bufferRate ?? 3.00)) / 100;
      const lmiMonthlyRate = lmiAssessmentRate / 12;
      const lmiPeriods = (overrides?.loanTermYears ?? 30) * 12;
      lmiMonthlyServicing = lmiAmount * (lmiMonthlyRate * Math.pow(1 + lmiMonthlyRate, lmiPeriods)) 
                            / (Math.pow(1 + lmiMonthlyRate, lmiPeriods) - 1);
      console.log(`[calculate-borrowing-capacity] LMI monthly servicing: $${lmiMonthlyServicing.toFixed(2)}/mo at ${(lmiAssessmentRate * 100).toFixed(2)}%`);
    }

    const effectiveCommitments = overrides?.existingCommitments != null
      ? overrides.existingCommitments + lmiMonthlyServicing
      : overrides?.additionalLiabilities 
        ? liabilityServicing + overrides.additionalLiabilities + lmiMonthlyServicing
        : liabilityServicing + lmiMonthlyServicing;

    // Set calculation parameters
    const interestRate = overrides?.interestRate ?? 6.50;
    const bufferRate = overrides?.bufferRate ?? 3.00;
    const loanTermYears = overrides?.loanTermYears ?? 30;

    // Perform calculation - uses after-tax income internally
    // NOTE: Uses totalLivingExpenses which includes negative property cash flows
    const result = calculateBorrowingCapacity({
      grossAnnualIncome: effectiveGrossIncome,
      shadedAnnualIncome: effectiveShadedIncome,
      monthlyLivingExpenses: totalLivingExpenses, // Includes negative property cash flows
      monthlyCommitments: effectiveCommitments,
      interestRate,
      bufferRate,
      loanTermYears,
      totalDebtBalances,
      calculationMode: overrides?.calculationMode || 'bank',
      dtiCapEnabled: overrides?.dtiCapEnabled || false,
      dtiCapLimit: overrides?.dtiCapLimit || DEFAULT_DTI_CAP,
    });

    console.log(`[calculate-borrowing-capacity] Result: Capacity $${result.borrowingCapacity}, Band: ${result.serviceabilityBand}`);

    // Calculate tax breakdown for the gross income
    const taxBreakdown = getTaxBreakdown(effectiveGrossIncome);
    console.log(`[calculate-borrowing-capacity] Tax breakdown: Marginal rate ${(taxBreakdown.marginalTaxRate * 100).toFixed(0)}%, After-tax income $${taxBreakdown.afterTaxIncome}`);

    // ── PHASE 2: Build Three-Output Structure ──
    const calculatedAt = new Date().toISOString();
    const effectiveLmiAmount = overrides?.lmiAmount || 0;
    const effectiveLmiMode = overrides?.lmiMode || 'none';
    const effectiveCalcMode = overrides?.calculationMode || 'bank';
    const effectiveDtiCapEnabled = overrides?.dtiCapEnabled || false;
    const effectiveDtiCapLimit = overrides?.dtiCapLimit || DEFAULT_DTI_CAP;
    
    const assumptionItems = [
      { key: "Serviceability Basis", value: "After-Tax Income" },
      { key: "Buffer Rate", value: `${bufferRate}%` },
      { key: "Assessment Rate", value: `${result.assessmentRate}%` },
      { key: "Loan Term", value: `${loanTermYears} years` },
      { key: "HEM Benchmark", value: `$${hemBenchmark.toLocaleString()}/mo (income-scaled)` },
      { key: "Repayment Type", value: "Principal & Interest" },
      { key: "Rental Expense Ratio", value: `${RENTAL_EXPENSE_RATIO * 100}%` },
      { key: "Existing Loan Assessment", value: "P&I at 9.5%" },
      { key: "Tax Year", value: "2025-26 (incl. 2% Medicare Levy)" },
      { key: "After-Tax Income Used", value: `$${taxBreakdown.afterTaxIncome.toLocaleString()}/yr` },
      { key: "Marginal Tax Rate", value: `${(taxBreakdown.marginalTaxRate * 100).toFixed(0)}%` },
    ];

    const propertyContributionData = {
      summary: {
        totalNetMonthlyContribution: propertyContributions.totalNetMonthlyContribution,
        totalLegacyIncome: propertyContributions.totalLegacyIncome,
        totalLegacyExpense: propertyContributions.totalLegacyExpense,
        totalLegacyLiability: propertyContributions.totalLegacyLiability,
        totalLegacyDebtBalance: propertyContributions.totalLegacyDebtBalance,
        parityValidation: parityChecks,
      },
      properties: propertyContributions.properties.map(p => ({
        address: p.address,
        propertyType: p.propertyType,
        rawNetMonthlyCashflow: p.rawNetMonthlyCashflow,
        assessedMonthlyRent: p.assessedMonthlyRent,
        assessedMonthlyDebt: p.assessedMonthlyDebt,
        assessedMonthlyHoldingCosts: p.assessedMonthlyHoldingCosts,
        netMonthlyContribution: p.netMonthlyContribution,
        auditNotes: p.auditNotes,
      })),
    };

    // ── Output 1: Current Capacity ──
    const currentCapacity = {
      borrowingCapacity: result.borrowingCapacity,
      monthlySurplus: result.monthlySurplus,
      serviceabilityBand: result.serviceabilityBand,
      stressTestedCapacity: result.stressTestedCapacity,
      dtiRatio: result.dtiRatio,
      assessmentRate: result.assessmentRate,
      afterTaxAnnualIncome: result.afterTaxAnnualIncome,
      monthlyAfterTaxIncome: result.monthlyAfterTaxIncome,
      grossAnnualIncome: effectiveGrossIncome,
      shadedAnnualIncome: effectiveShadedIncome,
      incomeBreakdown,
      livingExpensesMonthly: livingExpenses,
      expenseMethod: expenseMethodUsed,
      hemBenchmark,
      declaredExpenses: totalDeclaredExpenses,
      negativePropertyCashFlows,
      totalLivingExpenses,
      existingCommitmentsMonthly: effectiveCommitments,
      liabilityBreakdown,
      interestRate,
      bufferRate,
      loanTermYears,
      calculationMode: effectiveCalcMode,
      dtiCapEnabled: effectiveDtiCapEnabled,
      dtiCapLimit: effectiveDtiCapLimit,
      selectedLenderName: overrides?.selectedLenderName || null,
      recommendations: result.recommendations,
      warnings: result.warnings,
      assumptions: assumptionItems,
      taxBreakdown: {
        taxPayable: taxBreakdown.taxPayable,
        medicareLevy: taxBreakdown.medicareLevy,
        totalTax: taxBreakdown.totalTax,
        afterTaxIncome: taxBreakdown.afterTaxIncome,
        effectiveTaxRate: taxBreakdown.effectiveTaxRate,
        marginalTaxRate: taxBreakdown.marginalTaxRate,
        marginalBracket: taxBreakdown.marginalBracket,
        monthlyTakeHome: taxBreakdown.monthlyTakeHome,
      },
      lmiAmount: effectiveLmiAmount,
      lmiMode: effectiveLmiMode,
      netPurchaseCapacity: effectiveLmiAmount ? Math.max(0, result.borrowingCapacity - effectiveLmiAmount) : result.borrowingCapacity,
      propertyContributions: propertyContributionData,
      calculatedAt,
    };

    // ── Output 3: Proposed Loan Check ──
    const proposedLoanAmount = overrides?.proposedLoanAmount || null;
    let proposedLoanCheck = null;
    if (proposedLoanAmount && proposedLoanAmount > 0) {
      const plAssessmentRate = interestRate + bufferRate;
      const plMonthlyRate = (plAssessmentRate / 100) / 12;
      const plPeriods = loanTermYears * 12;
      const plMonthlyRepayment = plMonthlyRate > 0
        ? Math.round(proposedLoanAmount * (plMonthlyRate * Math.pow(1 + plMonthlyRate, plPeriods)) / (Math.pow(1 + plMonthlyRate, plPeriods) - 1))
        : 0;
      const plIsServiceable = result.borrowingCapacity >= proposedLoanAmount;
      const plHeadroom = result.borrowingCapacity - proposedLoanAmount;
      const plUtilization = result.borrowingCapacity > 0 
        ? Math.min(Math.round((proposedLoanAmount / result.borrowingCapacity) * 100), 100) 
        : 0;
      const plTotalDebt = totalDebtBalances + proposedLoanAmount;
      const plDti = effectiveGrossIncome > 0 ? Math.round((plTotalDebt / effectiveGrossIncome) * 100) / 100 : 0;
      let plBand: 'green' | 'amber' | 'red' = 'red';
      if (plHeadroom > 0 && plDti < 6) plBand = 'green';
      else if (plHeadroom >= 0 && plDti < 8) plBand = 'amber';

      proposedLoanCheck = {
        proposedLoanAmount,
        isServiceable: plIsServiceable,
        monthlyRepayment: plMonthlyRepayment,
        headroom: plHeadroom,
        utilizationPercent: plUtilization,
        dtiWithProposedLoan: plDti,
        projectedBand: plBand,
      };
      console.log(`[calculate-borrowing-capacity] Proposed loan check: $${proposedLoanAmount} → ${plIsServiceable ? 'SERVICEABLE' : 'NOT SERVICEABLE'}, headroom $${plHeadroom}`);
    }

    // ── Build backward-compatible flat responseData (legacy shape) ──
    // This preserves all existing field paths so consumers don't break
    const responseData = {
      clientId,
      // Legacy flat fields (backward compat)
      grossAnnualIncome: effectiveGrossIncome,
      shadedAnnualIncome: effectiveShadedIncome,
      incomeBreakdown,
      livingExpensesMonthly: livingExpenses,
      negativePropertyCashFlows,
      negativeCashFlowBreakdown,
      totalLivingExpenses,
      expenseMethod: expenseMethodUsed,
      hemBenchmark,
      declaredExpenses: totalDeclaredExpenses,
      existingCommitmentsMonthly: effectiveCommitments,
      liabilityBreakdown,
      interestRate,
      bufferRate,
      assessmentRate: result.assessmentRate,
      loanTermYears,
      proposedLoanAmount,
      borrowingCapacity: result.borrowingCapacity,
      monthlySurplus: result.monthlySurplus,
      serviceabilityBand: result.serviceabilityBand,
      stressTestedCapacity: result.stressTestedCapacity,
      dtiRatio: result.dtiRatio,
      recommendations: result.recommendations,
      warnings: result.warnings,
      taxBreakdown: currentCapacity.taxBreakdown,
      assumptions: {
        items: assumptionItems,
        calculationMode: effectiveCalcMode,
        dtiCapEnabled: effectiveDtiCapEnabled,
        dtiCapLimit: effectiveDtiCapLimit,
        selectedLenderName: overrides?.selectedLenderName || null,
        lmiMode: effectiveLmiMode,
        lmiPropertyValue: overrides?.lmiPropertyValue || null,
        lmiDepositAmount: overrides?.lmiDepositAmount || null,
        isFirstHomeBuyer: overrides?.isFirstHomeBuyer || false,
        proposedRentalIncome: overrides?.proposedRentalIncome || null,
      },
      lmiAmount: effectiveLmiAmount,
      lmiMode: effectiveLmiMode,
      netPurchaseCapacity: currentCapacity.netPurchaseCapacity,
      calculatedAt,
      propertyContributions: propertyContributionData,
      // ── Phase 2: Three-Output Envelope ──
      currentCapacity,
      scenarios: [], // Phase 4 will populate
      proposedLoanCheck,
    };

    // Save to database if requested
    let assessmentId: string | null = null;
    if (saveResult) {
      const { data: savedAssessment, error: saveError } = await supabase
        .from("borrowing_capacity_assessments")
        .insert({
          client_id: clientId,
          gross_annual_income: effectiveGrossIncome,
          shaded_annual_income: effectiveShadedIncome,
          income_breakdown: incomeBreakdown,
          living_expenses_monthly: livingExpenses,
          expense_method: expenseMethodUsed,
          expense_breakdown: { hemBenchmark, declaredExpenses: totalDeclaredExpenses },
          existing_commitments_monthly: effectiveCommitments,
          liability_breakdown: liabilityBreakdown,
          interest_rate_used: interestRate,
          buffer_rate: bufferRate,
          loan_term_years: loanTermYears,
          proposed_loan_amount: overrides?.proposedLoanAmount || null,
          proposed_lvr: 80,
          borrowing_capacity: result.borrowingCapacity,
          monthly_surplus: result.monthlySurplus,
          serviceability_band: result.serviceabilityBand,
          stress_tested_capacity: result.stressTestedCapacity,
          dti_ratio: result.dtiRatio,
          recommendations: result.recommendations,
          warnings: result.warnings,
          assumptions: responseData.assumptions,
          // LMI fields
          lmi_amount: overrides?.lmiAmount || 0,
          lmi_mode: overrides?.lmiMode || 'none',
          lmi_lvr_trigger: overrides?.lmiPropertyValue && overrides?.lmiDepositAmount 
            ? Math.round(((overrides.lmiPropertyValue - overrides.lmiDepositAmount) / overrides.lmiPropertyValue) * 10000) / 100 
            : null,
          property_value_estimate: overrides?.lmiPropertyValue || null,
          deposit_amount: overrides?.lmiDepositAmount || null,
          net_purchase_capacity: overrides?.lmiAmount 
            ? Math.max(0, result.borrowingCapacity - (overrides.lmiAmount || 0)) 
            : null,
        })
        .select("id")
        .single();

      if (saveError) {
        console.error("Failed to save assessment:", saveError);
      } else {
        assessmentId = savedAssessment?.id || null;
        console.log(`[calculate-borrowing-capacity] Saved assessment: ${assessmentId}`);
      }

      // Update client's borrowing_capacity field
      await supabase
        .from("clients")
        .update({ borrowing_capacity: result.borrowingCapacity })
        .eq("id", clientId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          assessmentId,
          ...responseData,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[calculate-borrowing-capacity] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
