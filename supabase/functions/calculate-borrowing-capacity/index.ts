import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// INCOME SHADING RULES (APRA-Aligned)
// ============================================
const INCOME_SHADING_RULES: Record<string, { rate: number; label: string }> = {
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

// ============================================
// HEM BENCHMARK TABLE (Monthly - AUD)
// ============================================
const HEM_BENCHMARKS: Record<string, Record<number, number>> = {
  single: {
    0: 1500,
    1: 2000,
    2: 2300,
    3: 2600,
  },
  couple: {
    0: 2200,
    1: 2600,
    2: 2900,
    3: 3200,
  },
};

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

function getHemBenchmark(maritalStatus: string | null, dependentsCount: number | null): number {
  const status = maritalStatus?.toLowerCase() || 'single';
  const isCouple = ['married', 'de facto', 'couple', 'partnered'].includes(status);
  const dependents = Math.min(dependentsCount || 0, 3);
  
  const category = isCouple ? 'couple' : 'single';
  return HEM_BENCHMARKS[category][dependents] || HEM_BENCHMARKS[category][0];
}

function calculateIncomeBreakdown(incomeRecords: any[], properties: any[]): { 
  grossTotal: number; 
  shadedTotal: number; 
  breakdown: IncomeBreakdownItem[];
} {
  const breakdown: IncomeBreakdownItem[] = [];
  let grossTotal = 0;
  let shadedTotal = 0;

  // Process income records
  for (const income of incomeRecords) {
    // Gross salary
    if (income.gross_salary && income.gross_salary > 0) {
      const frequency = income.salary_frequency?.toLowerCase() || 'annual';
      let annualAmount = income.gross_salary;
      if (frequency === 'monthly') annualAmount *= 12;
      else if (frequency === 'fortnightly') annualAmount *= 26;
      else if (frequency === 'weekly') annualAmount *= 52;
      
      const rule = INCOME_SHADING_RULES.gross_salary;
      grossTotal += annualAmount;
      shadedTotal += annualAmount * rule.rate;
      breakdown.push({
        component: rule.label,
        grossAmount: annualAmount,
        shadingRate: rule.rate,
        shadedAmount: annualAmount * rule.rate,
      });
    }

    // Bonus
    if (income.bonus && income.bonus > 0) {
      const rule = INCOME_SHADING_RULES.bonus;
      grossTotal += income.bonus;
      shadedTotal += income.bonus * rule.rate;
      breakdown.push({
        component: rule.label,
        grossAmount: income.bonus,
        shadingRate: rule.rate,
        shadedAmount: income.bonus * rule.rate,
      });
    }

    // Commission
    if (income.commission && income.commission > 0) {
      const rule = INCOME_SHADING_RULES.commission;
      grossTotal += income.commission;
      shadedTotal += income.commission * rule.rate;
      breakdown.push({
        component: rule.label,
        grossAmount: income.commission,
        shadingRate: rule.rate,
        shadedAmount: income.commission * rule.rate,
      });
    }

    // Overtime - Essential
    if (income.overtime_essential && income.overtime_essential > 0) {
      const rule = INCOME_SHADING_RULES.overtime_essential;
      grossTotal += income.overtime_essential;
      shadedTotal += income.overtime_essential * rule.rate;
      breakdown.push({
        component: rule.label,
        grossAmount: income.overtime_essential,
        shadingRate: rule.rate,
        shadedAmount: income.overtime_essential * rule.rate,
      });
    }

    // Overtime - Non-Essential
    if (income.overtime_non_essential && income.overtime_non_essential > 0) {
      const rule = INCOME_SHADING_RULES.overtime_non_essential;
      grossTotal += income.overtime_non_essential;
      shadedTotal += income.overtime_non_essential * rule.rate;
      breakdown.push({
        component: rule.label,
        grossAmount: income.overtime_non_essential,
        shadingRate: rule.rate,
        shadedAmount: income.overtime_non_essential * rule.rate,
      });
    }

    // Allowance
    if (income.allowance && income.allowance > 0) {
      const rule = INCOME_SHADING_RULES.allowance;
      grossTotal += income.allowance;
      shadedTotal += income.allowance * rule.rate;
      breakdown.push({
        component: rule.label,
        grossAmount: income.allowance,
        shadingRate: rule.rate,
        shadedAmount: income.allowance * rule.rate,
      });
    }

    // Other taxable income
    if (income.other_taxable_income && income.other_taxable_income > 0) {
      const rule = INCOME_SHADING_RULES.other_taxable;
      grossTotal += income.other_taxable_income;
      shadedTotal += income.other_taxable_income * rule.rate;
      breakdown.push({
        component: rule.label,
        grossAmount: income.other_taxable_income,
        shadingRate: rule.rate,
        shadedAmount: income.other_taxable_income * rule.rate,
      });
    }
  }

  // Add rental income from properties
  for (const property of properties) {
    if (property.monthly_rental_income && property.monthly_rental_income > 0) {
      const annualRent = property.monthly_rental_income * 12;
      const rule = INCOME_SHADING_RULES.rental_existing;
      grossTotal += annualRent;
      shadedTotal += annualRent * rule.rate;
      breakdown.push({
        component: `${rule.label} (${property.address?.substring(0, 30) || 'Property'}...)`,
        grossAmount: annualRent,
        shadingRate: rule.rate,
        shadedAmount: annualRent * rule.rate,
      });
    }
  }

  return { grossTotal, shadedTotal, breakdown };
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

  // Add existing property loans
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
    } else if (property.monthly_interest_repayment && property.monthly_interest_repayment > 0) {
      // Standard property loan
      const monthlyServicing = property.monthly_interest_repayment;
      totalMonthly += monthlyServicing;
      breakdown.push({
        type: `Existing Loan (${property.address?.substring(0, 30) || 'Property'}...)`,
        balance: property.loan_remaining || 0,
        monthlyServicing,
      });
    }
  }

  return { totalMonthly, breakdown };
}

function calculateBorrowingCapacity(params: {
  shadedAnnualIncome: number;
  monthlyLivingExpenses: number;
  monthlyCommitments: number;
  interestRate: number;
  bufferRate: number;
  loanTermYears: number;
}): CalculationResult {
  const { shadedAnnualIncome, monthlyLivingExpenses, monthlyCommitments, 
          interestRate, bufferRate, loanTermYears } = params;
  
  // Assessment rate = current rate + APRA buffer
  const assessmentRate = interestRate + bufferRate;
  const monthlyRate = (assessmentRate / 100) / 12;
  
  // Monthly net income available
  const monthlyIncome = shadedAnnualIncome / 12;
  const monthlySurplus = monthlyIncome - monthlyLivingExpenses - monthlyCommitments;
  
  // Max new repayment = available surplus
  const maxNewRepayment = Math.max(0, monthlySurplus);
  
  // Reverse-calculate max loan from repayment using P&I formula
  // Loan = Payment × [(1 - (1 + r)^-n) / r]
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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { clientId, overrides, saveResult = true } = await req.json();

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

    // Fetch related data in parallel
    const [incomeResult, liabilitiesResult, propertiesResult] = await Promise.all([
      supabase.from("client_income").select("*").eq("client_id", clientId),
      supabase.from("client_liabilities").select("*").eq("client_id", clientId),
      supabase.from("client_properties").select("*").eq("client_id", clientId),
    ]);

    const incomeRecords = incomeResult.data || [];
    const liabilities = liabilitiesResult.data || [];
    const properties = propertiesResult.data || [];

    console.log(`[calculate-borrowing-capacity] Found ${incomeRecords.length} income records, ${liabilities.length} liabilities, ${properties.length} properties`);

    // Calculate income
    const { grossTotal, shadedTotal, breakdown: incomeBreakdown } = calculateIncomeBreakdown(incomeRecords, properties);
    
    // Apply overrides if provided
    const effectiveGrossIncome = overrides?.grossAnnualIncome ?? grossTotal;
    const effectiveShadedIncome = overrides?.additionalIncome 
      ? shadedTotal + (overrides.additionalIncome * 0.8) 
      : shadedTotal;

    // Calculate living expenses (HEM or override)
    const hemBenchmark = getHemBenchmark(client.marital_status, client.dependents_count);
    const livingExpenses = overrides?.livingExpenses ?? hemBenchmark;

    // Calculate liability servicing
    const { totalMonthly: liabilityServicing, breakdown: liabilityBreakdown } = 
      calculateLiabilityBreakdown(liabilities, properties, effectiveGrossIncome);
    
    const effectiveCommitments = overrides?.additionalLiabilities 
      ? liabilityServicing + overrides.additionalLiabilities 
      : liabilityServicing;

    // Set calculation parameters
    const interestRate = overrides?.interestRate ?? 6.50;
    const bufferRate = overrides?.bufferRate ?? 3.00;
    const loanTermYears = overrides?.loanTermYears ?? 30;

    // Perform calculation
    const result = calculateBorrowingCapacity({
      shadedAnnualIncome: effectiveShadedIncome,
      monthlyLivingExpenses: livingExpenses,
      monthlyCommitments: effectiveCommitments,
      interestRate,
      bufferRate,
      loanTermYears,
    });

    console.log(`[calculate-borrowing-capacity] Result: Capacity $${result.borrowingCapacity}, Band: ${result.serviceabilityBand}`);

    // Build response
    const responseData = {
      clientId,
      grossAnnualIncome: effectiveGrossIncome,
      shadedAnnualIncome: effectiveShadedIncome,
      incomeBreakdown,
      livingExpensesMonthly: livingExpenses,
      expenseMethod: overrides?.livingExpenses ? 'declared' : 'hem',
      hemBenchmark,
      existingCommitmentsMonthly: effectiveCommitments,
      liabilityBreakdown,
      interestRate,
      bufferRate,
      assessmentRate: result.assessmentRate,
      loanTermYears,
      proposedLoanAmount: overrides?.proposedLoanAmount || null,
      borrowingCapacity: result.borrowingCapacity,
      monthlySurplus: result.monthlySurplus,
      serviceabilityBand: result.serviceabilityBand,
      stressTestedCapacity: result.stressTestedCapacity,
      dtiRatio: result.dtiRatio,
      recommendations: result.recommendations,
      warnings: result.warnings,
      assumptions: [
        { key: "Buffer Rate", value: `${bufferRate}%` },
        { key: "Assessment Rate", value: `${result.assessmentRate}%` },
        { key: "Loan Term", value: `${loanTermYears} years` },
        { key: "HEM Benchmark", value: `$${hemBenchmark.toLocaleString()}/mo` },
        { key: "Repayment Type", value: "Principal & Interest" },
      ],
      calculatedAt: new Date().toISOString(),
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
          expense_method: overrides?.livingExpenses ? 'declared' : 'hem',
          expense_breakdown: { hemBenchmark },
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
