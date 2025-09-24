import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LoanCalculationInput {
  propertyValue: number;
  deposit: number;
  interestRate: number;
  loanTerm: number;
  weeklyRent: number;
  state: string;
  propertyType: 'house' | 'unit' | 'townhouse';
}

interface FinancialProjection {
  year: number;
  propertyValue: number;
  loanBalance: number;
  equity: number;
  annualRent: number;
  cashFlow: number;
  cumulativeCashFlow: number;
  roi: number;
}

serve(async (req) => {
  console.log('Financial calculator service invoked with method:', req.method);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const input: LoanCalculationInput = await req.json();
    console.log('Calculating financial projections for:', input);

    const calculations = await calculateFinancialProjections(input);
    
    return new Response(JSON.stringify({ 
      success: true, 
      data: calculations 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in financial calculator service:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to calculate financial projections',
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function calculateFinancialProjections(input: LoanCalculationInput) {
  const {
    propertyValue,
    deposit,
    interestRate,
    loanTerm,
    weeklyRent,
    state,
    propertyType
  } = input;

  // Calculate initial values
  const loanAmount = propertyValue - deposit;
  const monthlyInterestRate = interestRate / 100 / 12;
  const totalPayments = loanTerm * 12;
  
  // Monthly loan payment (Principal + Interest)
  const monthlyPayment = calculateMonthlyPayment(loanAmount, monthlyInterestRate, totalPayments);
  
  // Calculate stamp duty
  const stampDuty = calculateStampDuty(propertyValue, state);
  
  // Calculate ongoing costs
  const annualCosts = calculateAnnualCosts(propertyValue, weeklyRent, state, propertyType);
  
  // Generate 10-year projections with scenarios
  const scenarios = {
    conservative: generateProjections(input, monthlyPayment, annualCosts, 0.02, 0.02),
    moderate: generateProjections(input, monthlyPayment, annualCosts, 0.04, 0.03),
    optimistic: generateProjections(input, monthlyPayment, annualCosts, 0.06, 0.04)
  };

  // Calculate key metrics
  const metrics = calculateKeyMetrics(input, monthlyPayment, annualCosts, stampDuty);

  return {
    initialCosts: {
      propertyValue,
      deposit,
      loanAmount,
      stampDuty,
      legalFees: 1500,
      inspectionFees: 500,
      totalUpfront: deposit + stampDuty + 1500 + 500
    },
    loanDetails: {
      monthlyPayment,
      totalInterest: (monthlyPayment * totalPayments) - loanAmount,
      weeklyPayment: monthlyPayment * 12 / 52
    },
    annualCosts,
    keyMetrics: metrics,
    projections: scenarios,
    sensitivityAnalysis: calculateSensitivityAnalysis(input, monthlyPayment, annualCosts)
  };
}

function calculateMonthlyPayment(loanAmount: number, monthlyRate: number, totalPayments: number): number {
  if (monthlyRate === 0) return loanAmount / totalPayments;
  
  return loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) / 
         (Math.pow(1 + monthlyRate, totalPayments) - 1);
}

function calculateStampDuty(propertyValue: number, state: string): number {
  // Simplified stamp duty calculation by state
  const rates: { [key: string]: any } = {
    'NSW': { threshold: 25000, rate: 0.055 },
    'VIC': { threshold: 25000, rate: 0.055 },
    'QLD': { threshold: 5000, rate: 0.035 },
    'WA': { threshold: 120000, rate: 0.04 },
    'SA': { threshold: 12000, rate: 0.055 },
    'TAS': { threshold: 13000, rate: 0.04 },
    'NT': { threshold: 525000, rate: 0.057 },
    'ACT': { threshold: 200000, rate: 0.041 }
  };

  const stateRate = rates[state.toUpperCase()] || rates['NSW'];
  
  if (propertyValue <= stateRate.threshold) {
    return propertyValue * 0.01; // Minimal rate for low values
  }
  
  return propertyValue * stateRate.rate;
}

function calculateAnnualCosts(propertyValue: number, weeklyRent: number, state: string, propertyType: string) {
  const annualRent = weeklyRent * 52;
  
  return {
    councilRates: Math.floor(propertyValue * 0.008), // ~0.8% of property value
    waterRates: 1200,
    landlordInsurance: Math.floor(annualRent * 0.01), // ~1% of rent
    propertyManagement: Math.floor(annualRent * 0.07), // 7% of rent
    maintenance: Math.floor(propertyValue * 0.01), // 1% of property value
    landTax: calculateLandTax(propertyValue, state),
    strataFees: propertyType === 'unit' ? 4800 : 0, // $400/month for units
    totalAnnual: 0 // Will be calculated
  };
}

function calculateLandTax(propertyValue: number, state: string): number {
  // Simplified land tax calculation (varies by state and thresholds)
  const thresholds: { [key: string]: number } = {
    'NSW': 755000,
    'VIC': 300000,
    'QLD': 600000,
    'WA': 300000,
    'SA': 391000,
    'TAS': 25000,
    'NT': 0, // No general land tax
    'ACT': 0 // Rates instead of land tax
  };

  const threshold = thresholds[state.toUpperCase()] || 755000;
  
  if (propertyValue <= threshold) return 0;
  
  return Math.floor((propertyValue - threshold) * 0.015); // ~1.5% above threshold
}

function generateProjections(
  input: LoanCalculationInput,
  monthlyPayment: number,
  annualCosts: any,
  capitalGrowthRate: number,
  rentGrowthRate: number
): FinancialProjection[] {
  
  const projections: FinancialProjection[] = [];
  let currentPropertyValue = input.propertyValue;
  let currentRent = input.weeklyRent * 52;
  let loanBalance = input.propertyValue - input.deposit;
  let cumulativeCashFlow = 0;
  
  // Calculate total annual costs
  const totalAnnualCosts = Object.values(annualCosts)
    .filter(val => typeof val === 'number')
    .reduce((sum, cost) => sum + cost, 0) + (monthlyPayment * 12);

  for (let year = 1; year <= 10; year++) {
    // Update property value and rent
    currentPropertyValue *= (1 + capitalGrowthRate);
    currentRent *= (1 + rentGrowthRate);
    
    // Calculate loan balance (simplified - assumes P&I payments)
    const annualPrincipalPayment = (monthlyPayment * 12) - (loanBalance * input.interestRate / 100);
    loanBalance = Math.max(0, loanBalance - annualPrincipalPayment);
    
    // Calculate cash flow
    const annualCashFlow = currentRent - totalAnnualCosts;
    cumulativeCashFlow += annualCashFlow;
    
    // Calculate equity and ROI
    const equity = currentPropertyValue - loanBalance;
    const roi = (annualCashFlow + (currentPropertyValue - input.propertyValue) / year) / input.deposit * 100;
    
    projections.push({
      year,
      propertyValue: Math.round(currentPropertyValue),
      loanBalance: Math.round(loanBalance),
      equity: Math.round(equity),
      annualRent: Math.round(currentRent),
      cashFlow: Math.round(annualCashFlow),
      cumulativeCashFlow: Math.round(cumulativeCashFlow),
      roi: Math.round(roi * 100) / 100
    });
  }
  
  return projections;
}

function calculateKeyMetrics(
  input: LoanCalculationInput,
  monthlyPayment: number,
  annualCosts: any,
  stampDuty: number
) {
  const annualRent = input.weeklyRent * 52;
  const totalAnnualCosts = Object.values(annualCosts)
    .filter(val => typeof val === 'number')
    .reduce((sum, cost) => sum + cost, 0);
    
  const grossYield = (annualRent / input.propertyValue) * 100;
  const netYield = ((annualRent - totalAnnualCosts) / input.propertyValue) * 100;
  const netCashFlow = annualRent - totalAnnualCosts - (monthlyPayment * 12);
  const totalReturn = input.deposit + stampDuty + 2000; // Including fees
  
  return {
    grossRentalYield: Math.round(grossYield * 100) / 100,
    netRentalYield: Math.round(netYield * 100) / 100,
    weeklyNet: Math.round(netCashFlow / 52),
    annualNet: Math.round(netCashFlow),
    lvr: Math.round(((input.propertyValue - input.deposit) / input.propertyValue) * 100),
    totalInvestment: totalReturn,
    cashOnCashReturn: Math.round((netCashFlow / totalReturn) * 100 * 100) / 100
  };
}

function calculateSensitivityAnalysis(
  input: LoanCalculationInput,
  monthlyPayment: number,
  annualCosts: any
) {
  const baseNetCashFlow = (input.weeklyRent * 52) - 
    Object.values(annualCosts).filter(val => typeof val === 'number').reduce((sum, cost) => sum + cost, 0) - 
    (monthlyPayment * 12);

  return {
    interestRateChanges: {
      'minus1Percent': calculateImpact(input, input.interestRate - 1, annualCosts),
      'plus1Percent': calculateImpact(input, input.interestRate + 1, annualCosts),
      'plus2Percent': calculateImpact(input, input.interestRate + 2, annualCosts)
    },
    rentChanges: {
      'minus10Percent': baseNetCashFlow - (input.weeklyRent * 52 * 0.1),
      'plus10Percent': baseNetCashFlow + (input.weeklyRent * 52 * 0.1),
      'plus20Percent': baseNetCashFlow + (input.weeklyRent * 52 * 0.2)
    }
  };
}

function calculateImpact(input: LoanCalculationInput, newRate: number, annualCosts: any) {
  const loanAmount = input.propertyValue - input.deposit;
  const monthlyRate = newRate / 100 / 12;
  const totalPayments = input.loanTerm * 12;
  const newMonthlyPayment = calculateMonthlyPayment(loanAmount, monthlyRate, totalPayments);
  
  const totalAnnualCosts = Object.values(annualCosts)
    .filter(val => typeof val === 'number')
    .reduce((sum, cost) => sum + cost, 0);
    
  return (input.weeklyRent * 52) - totalAnnualCosts - (newMonthlyPayment * 12);
}