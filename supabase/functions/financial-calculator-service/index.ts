import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration missing')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    const input: LoanCalculationInput = await req.json();
    console.log('Calculating financial projections for:', input);

    const calculations = await calculateFinancialProjections(input, supabase);
    
    return new Response(JSON.stringify({ 
      success: true, 
      data: calculations 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in financial calculator service:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to calculate financial projections';
    return new Response(JSON.stringify({ 
      error: errorMessage,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function calculateFinancialProjections(input: LoanCalculationInput, supabase: any) {
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
  
  // Calculate stamp duty using dynamic rates from cache
  const stampDuty = await calculateStampDutyDynamic(propertyValue, state, supabase);
  
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

async function calculateStampDutyDynamic(propertyValue: number, state: string, supabase: any): Promise<number> {
  try {
    // Try to fetch live rates from cache
    const { data, error } = await supabase
      .from('stamp_duty_rates_cache')
      .select('brackets, data_quality')
      .eq('state', state.toUpperCase())
      .single()

    if (!error && data) {
      const brackets = data.brackets as Array<{ threshold: number; base: number; rate: number }>
      console.log(`Using ${data.data_quality} stamp duty rates for ${state}`)
      
      // Calculate using progressive brackets
      for (let i = brackets.length - 1; i >= 0; i--) {
        if (propertyValue >= brackets[i].threshold) {
          const amountAboveThreshold = propertyValue - brackets[i].threshold
          return brackets[i].base + (amountAboveThreshold * brackets[i].rate)
        }
      }
    }

    console.warn(`Could not fetch stamp duty rates for ${state}, using fallback calculation`)
  } catch (error) {
    console.error(`Error fetching stamp duty rates for ${state}:`, error)
  }

  // Fallback to hardcoded calculation
  return calculateStampDutyFallback(propertyValue, state)
}

function calculateStampDutyFallback(propertyValue: number, state: string): number {
  // ACCURATE PROGRESSIVE BRACKET CALCULATIONS FOR EACH STATE
  // Updated with real state government formulas as of 2024
  
  const stateUpper = state.toUpperCase();
  
  switch (stateUpper) {
    case 'NSW':
      return calculateNSWStampDuty(propertyValue);
    case 'VIC':
      return calculateVICStampDuty(propertyValue);
    case 'QLD':
      return calculateQLDStampDuty(propertyValue);
    case 'WA':
      return calculateWAStampDuty(propertyValue);
    case 'SA':
      return calculateSAStampDuty(propertyValue);
    case 'TAS':
      return calculateTASStampDuty(propertyValue);
    case 'NT':
      return calculateNTStampDuty(propertyValue);
    case 'ACT':
      return calculateACTStampDuty(propertyValue);
    default:
      console.warn(`Unknown state: ${state}, defaulting to NSW calculation`);
      return calculateNSWStampDuty(propertyValue);
  }
}

// NSW Stamp Duty - Progressive brackets
function calculateNSWStampDuty(value: number): number {
  if (value <= 16000) return value * 0.0125;
  if (value <= 35000) return 200 + ((value - 16000) * 0.015);
  if (value <= 93000) return 485 + ((value - 35000) * 0.0175);
  if (value <= 351000) return 1500 + ((value - 93000) * 0.035);
  if (value <= 1168000) return 10530 + ((value - 351000) * 0.045);
  return 47295 + ((value - 1168000) * 0.055);
}

// VIC Stamp Duty - Progressive brackets
function calculateVICStampDuty(value: number): number {
  if (value <= 25000) return value * 0.014;
  if (value <= 130000) return 350 + ((value - 25000) * 0.024);
  if (value <= 960000) return 2870 + ((value - 130000) * 0.05);
  if (value <= 2000000) return 44370 + ((value - 960000) * 0.06);
  return 106770 + ((value - 2000000) * 0.065);
}

// QLD Stamp Duty - Progressive brackets
function calculateQLDStampDuty(value: number): number {
  if (value <= 5000) return 0;
  if (value <= 75000) return ((value - 5000) * 0.015);
  if (value <= 540000) return 1050 + ((value - 75000) * 0.035);
  if (value <= 1000000) return 17325 + ((value - 540000) * 0.045);
  return 38025 + ((value - 1000000) * 0.0575);
}

// WA Stamp Duty - Progressive brackets
function calculateWAStampDuty(value: number): number {
  if (value <= 120000) return value * 0.019;
  if (value <= 150000) return 2280 + ((value - 120000) * 0.029);
  if (value <= 360000) return 3150 + ((value - 150000) * 0.038);
  if (value <= 725000) return 11130 + ((value - 360000) * 0.047);
  return 28285 + ((value - 725000) * 0.051);
}

// SA Stamp Duty - Progressive brackets
function calculateSAStampDuty(value: number): number {
  if (value <= 12000) return value * 0.01;
  if (value <= 30000) return 120 + ((value - 12000) * 0.02);
  if (value <= 50000) return 480 + ((value - 30000) * 0.03);
  if (value <= 100000) return 1080 + ((value - 50000) * 0.035);
  if (value <= 200000) return 2830 + ((value - 100000) * 0.04);
  if (value <= 300000) return 6830 + ((value - 200000) * 0.0425);
  if (value <= 500000) return 11080 + ((value - 300000) * 0.045);
  return 20080 + ((value - 500000) * 0.0575);
}

// TAS Stamp Duty - Progressive brackets
function calculateTASStampDuty(value: number): number {
  if (value <= 3000) return value * 0.0175;
  if (value <= 25000) return 52.50 + ((value - 3000) * 0.0225);
  if (value <= 75000) return 547.50 + ((value - 25000) * 0.0325);
  if (value <= 200000) return 2172.50 + ((value - 75000) * 0.0375);
  if (value <= 375000) return 6859.38 + ((value - 200000) * 0.04);
  if (value <= 725000) return 13859.38 + ((value - 375000) * 0.0425);
  return 28734.38 + ((value - 725000) * 0.045);
}

// NT Stamp Duty - Progressive brackets (relatively high rates)
function calculateNTStampDuty(value: number): number {
  if (value <= 525000) return value * 0.0465;
  if (value <= 3000000) return 24412.50 + ((value - 525000) * 0.0565);
  return 164400 + ((value - 3000000) * 0.0595);
}

// ACT Stamp Duty - Progressive brackets
function calculateACTStampDuty(value: number): number {
  if (value <= 200000) return ((value / 100) * 0.7);
  if (value <= 300000) return 1400 + (((value - 200000) / 100) * 2.2);
  if (value <= 500000) return 3600 + (((value - 300000) / 100) * 3.4);
  if (value <= 750000) return 10400 + (((value - 500000) / 100) * 4.32);
  if (value <= 1000000) return 21200 + (((value - 750000) / 100) * 5.9);
  if (value <= 1455000) return 35950 + (((value - 1000000) / 100) * 6.4);
  return 65070 + (((value - 1455000) / 100) * 4.54);
}

function calculateAnnualCosts(propertyValue: number, weeklyRent: number, state: string, propertyType: string) {
  const annualRent = weeklyRent * 52;
  
  const councilRates = Math.floor(propertyValue * 0.008); // ~0.8% of property value
  const waterRates = 800; // Fixed water rates
  const landlordInsurance = Math.floor(annualRent * 0.01); // ~1% of rent
  const propertyManagement = Math.floor(annualRent * 0.07); // 7% of rent
  const propertyManagementPercent = 7;
  const maintenance = 1500; // Fixed $1,500 annually
  const landTax = calculateLandTax(propertyValue, state);
  const strataFees = propertyType === 'unit' ? 4800 : 0; // $400/month for units
  
  // Calculate total annual costs (excluding letting fees as per memory)
  const totalAnnual = councilRates + waterRates + landlordInsurance + propertyManagement + maintenance + strataFees;
  
  return {
    councilRates,
    waterRates,
    landlordInsurance,
    propertyManagement,
    propertyManagementPercent,
    maintenance,
    landTax,
    strataFees,
    totalAnnual
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