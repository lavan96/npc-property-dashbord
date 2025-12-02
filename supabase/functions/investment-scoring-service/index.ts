import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InvestmentScoringInput {
  propertyPrice: number;
  weeklyRent: number;
  medianSuburbPrice?: number;
  priceGrowth1Year?: number;
  priceGrowth3Year?: number;
  vacancyRate?: number;
  daysOnMarket?: number;
  walkScore?: number;
  populationGrowth?: number;
  medianIncome?: number;
  unemploymentRate?: number;
  commuteTimeCBD?: number;
  schoolsNearby?: number;
  cashFlow?: number;
  lvr?: number;
  state?: string;
  propertyType?: string;
}

interface InvestmentScore {
  totalScore: number;
  grade: string;
  recommendation: string;
  breakdown: {
    yieldScore: { score: number; weight: number; details: string };
    growthScore: { score: number; weight: number; details: string };
    locationScore: { score: number; weight: number; details: string };
    demandScore: { score: number; weight: number; details: string };
    riskScore: { score: number; weight: number; details: string };
  };
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  risks: string[];
}

serve(async (req) => {
  console.log('Investment scoring service invoked with method:', req.method);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const input: InvestmentScoringInput = await req.json();
    console.log('Calculating investment score for property:', input);

    const investmentScore = calculateInvestmentScore(input);
    
    return new Response(JSON.stringify({ 
      success: true, 
      data: investmentScore 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in investment scoring service:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to calculate investment score';
    return new Response(JSON.stringify({ 
      error: errorMessage,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function calculateInvestmentScore(input: InvestmentScoringInput): InvestmentScore {
  // Calculate individual component scores (0-100)
  const yieldScore = calculateYieldScore(input);
  const growthScore = calculateGrowthScore(input);
  const locationScore = calculateLocationScore(input);
  const demandScore = calculateDemandScore(input);
  const riskScore = calculateRiskScore(input);

  // Weighted scoring
  const weights = {
    growth: 0.40, // 40% - Capital appreciation potential
    location: 0.25, // 25% - Location quality and amenities
    yield: 0.15,  // 15% - Cash flow generation
    demand: 0.15, // 15% - Supply/demand dynamics
    risk: 0.05    // 5% - Risk factors
  };

  const totalScore = Math.round(
    (yieldScore.score * weights.yield) +
    (growthScore.score * weights.growth) +
    (locationScore.score * weights.location) +
    (demandScore.score * weights.demand) +
    (riskScore.score * weights.risk)
  );

  // Determine grade and recommendation
  const { grade, recommendation } = determineGradeAndRecommendation(totalScore, input);

  // Analyze SWOT
  const { strengths, weaknesses, opportunities, risks } = analyzeSWOT(input, {
    yieldScore,
    growthScore,
    locationScore,
    demandScore,
    riskScore
  });

  return {
    totalScore,
    grade,
    recommendation,
    breakdown: {
      yieldScore: { ...yieldScore, weight: weights.yield * 100 },
      growthScore: { ...growthScore, weight: weights.growth * 100 },
      locationScore: { ...locationScore, weight: weights.location * 100 },
      demandScore: { ...demandScore, weight: weights.demand * 100 },
      riskScore: { ...riskScore, weight: weights.risk * 100 }
    },
    strengths,
    weaknesses,
    opportunities,
    risks
  };
}

function calculateYieldScore(input: InvestmentScoringInput) {
  const annualRent = (input.weeklyRent || 0) * 52;
  const grossYield = (annualRent / input.propertyPrice) * 100;
  
  let score = 0;
  let details = '';

  if (grossYield >= 6) {
    score = 100;
    details = 'Exceptional yield (6%+) - Strong positive cash flow';
  } else if (grossYield >= 5) {
    score = 85;
    details = 'Excellent yield (5-6%) - Good cash flow potential';
  } else if (grossYield >= 4) {
    score = 70;
    details = 'Good yield (4-5%) - Adequate cash flow';
  } else if (grossYield >= 3) {
    score = 50;
    details = 'Average yield (3-4%) - Moderate cash flow';
  } else if (grossYield >= 2) {
    score = 30;
    details = 'Below average yield (2-3%) - Limited cash flow';
  } else {
    score = 10;
    details = 'Poor yield (<2%) - Negative cash flow likely';
  }

  // Adjust based on actual cash flow if provided
  if (input.cashFlow !== undefined) {
    if (input.cashFlow > 0) {
      score = Math.min(100, score + 10);
    } else if (input.cashFlow < -100) {
      score = Math.max(0, score - 20);
    }
  }

  return { score, details };
}

function calculateGrowthScore(input: InvestmentScoringInput) {
  let score = 50; // Base score
  let details = '';

  // Historical growth indicators
  const growth1y = input.priceGrowth1Year || 0;
  const growth3y = input.priceGrowth3Year || 0;

  if (growth1y >= 10) {
    score += 30;
    details = 'Strong recent growth (10%+ p.a.)';
  } else if (growth1y >= 5) {
    score += 20;
    details = 'Good recent growth (5-10% p.a.)';
  } else if (growth1y >= 2) {
    score += 10;
    details = 'Moderate recent growth (2-5% p.a.)';
  } else if (growth1y < 0) {
    score -= 10;
    details = 'Negative recent growth';
  }

  // 3-year trend
  if (growth3y > growth1y && growth3y > 15) {
    score += 20;
    details += ' with accelerating momentum';
  } else if (growth3y > 20) {
    score += 15;
    details += ' and strong 3-year track record';
  }

  // Population growth influence
  if (input.populationGrowth && input.populationGrowth > 2) {
    score += 10;
    details += '. Strong population growth driving demand';
  }

  return { score: Math.min(100, score), details };
}

function calculateLocationScore(input: InvestmentScoringInput) {
  let score = 0;
  const factors: string[] = [];

  // Walk score (max 35 points)
  if (input.walkScore) {
    if (input.walkScore >= 90) {
      score += 35;
      factors.push('Excellent walkability (90+)');
    } else if (input.walkScore >= 70) {
      score += 25;
      factors.push('Very good walkability (70-89)');
    } else if (input.walkScore >= 50) {
      score += 15;
      factors.push('Good walkability (50-69)');
    } else {
      score += 5;
      factors.push('Car-dependent location');
    }
  } else {
    score += 15; // Assume moderate
  }

  // CBD commute time (max 30 points)
  if (input.commuteTimeCBD) {
    if (input.commuteTimeCBD <= 20) {
      score += 30;
      factors.push('Excellent CBD access (<20 min)');
    } else if (input.commuteTimeCBD <= 35) {
      score += 20;
      factors.push('Good CBD access (20-35 min)');
    } else if (input.commuteTimeCBD <= 50) {
      score += 10;
      factors.push('Moderate CBD access (35-50 min)');
    } else {
      score += 5;
      factors.push('Limited CBD access (>50 min)');
    }
  } else {
    score += 15; // Assume moderate
  }

  // Schools nearby (max 20 points)
  if (input.schoolsNearby) {
    if (input.schoolsNearby >= 5) {
      score += 20;
      factors.push('Multiple schools nearby (5+)');
    } else if (input.schoolsNearby >= 3) {
      score += 15;
      factors.push('Good school access (3-4)');
    } else if (input.schoolsNearby >= 1) {
      score += 10;
      factors.push('School access available');
    }
  } else {
    score += 10; // Assume moderate
  }

  // State capital premium (max 15 points)
  if (input.state && ['NSW', 'VIC', 'QLD'].includes(input.state)) {
    score += 15;
    factors.push('Major capital city location');
  } else if (input.state && ['WA', 'SA'].includes(input.state)) {
    score += 10;
    factors.push('Capital city location');
  }

  const details = factors.join('. ');
  return { score: Math.min(100, score), details };
}

function calculateDemandScore(input: InvestmentScoringInput) {
  let score = 50; // Base score
  const factors: string[] = [];

  // Vacancy rate (max 30 points)
  if (input.vacancyRate !== undefined) {
    if (input.vacancyRate < 1) {
      score += 30;
      factors.push('Very tight rental market (<1% vacancy)');
    } else if (input.vacancyRate < 2) {
      score += 20;
      factors.push('Tight rental market (1-2% vacancy)');
    } else if (input.vacancyRate < 3) {
      score += 10;
      factors.push('Balanced rental market (2-3% vacancy)');
    } else if (input.vacancyRate > 5) {
      score -= 10;
      factors.push('Oversupplied rental market (>5% vacancy)');
    }
  }

  // Days on market (max 20 points)
  if (input.daysOnMarket !== undefined) {
    if (input.daysOnMarket < 20) {
      score += 20;
      factors.push('Fast selling market (<20 DOM)');
    } else if (input.daysOnMarket < 40) {
      score += 10;
      factors.push('Good selling pace (20-40 DOM)');
    } else if (input.daysOnMarket > 80) {
      score -= 10;
      factors.push('Slow selling market (>80 DOM)');
    }
  }

  // Price relative to suburb median
  if (input.medianSuburbPrice) {
    const priceRatio = input.propertyPrice / input.medianSuburbPrice;
    if (priceRatio < 0.9) {
      score += 15;
      factors.push('Below median pricing - good value');
    } else if (priceRatio > 1.2) {
      score -= 10;
      factors.push('Above median pricing - premium location');
    }
  }

  // Employment factors
  if (input.unemploymentRate !== undefined) {
    if (input.unemploymentRate < 3) {
      score += 15;
      factors.push('Low unemployment area (<3%)');
    } else if (input.unemploymentRate > 6) {
      score -= 10;
      factors.push('Higher unemployment area (>6%)');
    }
  }

  const details = factors.join('. ');
  return { score: Math.min(100, Math.max(0, score)), details };
}

function calculateRiskScore(input: InvestmentScoringInput) {
  let score = 100; // Start at 100, deduct for risks
  const riskFactors: string[] = [];
  const positiveFactors: string[] = [];

  // LVR risk assessment
  if (input.lvr) {
    if (input.lvr > 90) {
      score -= 40;
      riskFactors.push('Very high LVR (>90%) creates significant leverage risk');
    } else if (input.lvr > 80) {
      score -= 20;
      riskFactors.push('High LVR (80-90%) increases leverage risk');
    } else if (input.lvr > 70) {
      score -= 5;
      riskFactors.push('Moderate LVR (70-80%)');
    } else if (input.lvr <= 60) {
      positiveFactors.push('Conservative LVR (<60%) provides safety buffer');
    }
  }

  // Cash flow risk
  if (input.cashFlow !== undefined) {
    if (input.cashFlow < -300) {
      score -= 25;
      riskFactors.push('Severe negative cash flow (>$300/week) requires substantial funding');
    } else if (input.cashFlow < -200) {
      score -= 15;
      riskFactors.push('High negative cash flow ($200-300/week) creates funding pressure');
    } else if (input.cashFlow < 0) {
      score -= 8;
      riskFactors.push('Negative cash flow requires ongoing contribution');
    } else if (input.cashFlow > 100) {
      positiveFactors.push('Strong positive cash flow provides income buffer');
    }
  }

  // Property type risk
  if (input.propertyType === 'unit' || input.propertyType === 'apartment') {
    score -= 8;
    riskFactors.push('Unit/apartment carries strata risks and potential oversupply');
  } else if (input.propertyType === 'house') {
    positiveFactors.push('House typically offers better long-term capital growth');
  }

  // Market overheating risk
  if (input.priceGrowth1Year && input.priceGrowth1Year > 20) {
    score -= 20;
    riskFactors.push('Extreme growth (>20% p.a.) suggests market overheating');
  } else if (input.priceGrowth1Year && input.priceGrowth1Year > 15) {
    score -= 12;
    riskFactors.push('Rapid growth (15-20% p.a.) may indicate cooling ahead');
  }

  // Vacancy risk
  if (input.vacancyRate !== undefined) {
    if (input.vacancyRate > 5) {
      score -= 20;
      riskFactors.push('Very high vacancy (>5%) signals weak rental demand');
    } else if (input.vacancyRate > 4) {
      score -= 12;
      riskFactors.push('High vacancy (4-5%) indicates oversupplied market');
    } else if (input.vacancyRate < 1.5) {
      positiveFactors.push('Tight rental market (<1.5% vacancy) supports rental income');
    }
  }

  // Days on market risk
  if (input.daysOnMarket !== undefined && input.daysOnMarket > 90) {
    score -= 10;
    riskFactors.push('Extended selling time (>90 days) indicates soft demand');
  }

  // Build overall risk assessment
  let details = '';
  if (riskFactors.length > 0) {
    details = 'Risk Factors: ' + riskFactors.join('. ');
    if (positiveFactors.length > 0) {
      details += '. Mitigating Factors: ' + positiveFactors.join('. ');
    }
  } else if (positiveFactors.length > 0) {
    details = 'Low risk profile. ' + positiveFactors.join('. ');
  } else {
    details = 'Moderate risk profile with balanced characteristics';
  }

  return { score: Math.max(0, Math.min(100, score)), details };
}

function determineGradeAndRecommendation(score: number, input: InvestmentScoringInput) {
  let grade = '';
  let recommendation = '';

  if (score >= 85) {
    grade = 'A+';
    recommendation = 'STRONG BUY - Excellent investment opportunity with strong fundamentals across all metrics';
  } else if (score >= 75) {
    grade = 'A';
    recommendation = 'BUY - Very good investment with solid potential for both income and capital growth';
  } else if (score >= 65) {
    grade = 'B+';
    recommendation = 'BUY - Good investment opportunity with favorable metrics in most areas';
  } else if (score >= 55) {
    grade = 'B';
    recommendation = 'HOLD/BUY - Moderate investment potential, consider your personal circumstances';
  } else if (score >= 45) {
    grade = 'C';
    recommendation = 'HOLD - Average investment with mixed indicators, monitor market conditions';
  } else if (score >= 35) {
    grade = 'D';
    recommendation = 'CAUTION - Below average investment, significant concerns identified';
  } else {
    grade = 'F';
    recommendation = 'AVOID - Poor investment opportunity with multiple red flags';
  }

  return { grade, recommendation };
}

function analyzeSWOT(input: InvestmentScoringInput, scores: any) {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const opportunities: string[] = [];
  const risks: string[] = [];

  // Strengths
  if (scores.yieldScore.score >= 70) {
    strengths.push('Strong rental yield providing good cash flow');
  }
  if (scores.growthScore.score >= 70) {
    strengths.push('Solid capital growth track record');
  }
  if (scores.locationScore.score >= 70) {
    strengths.push('Excellent location with strong amenities');
  }
  if (input.walkScore && input.walkScore >= 80) {
    strengths.push('High walkability score enhancing liveability');
  }

  // Weaknesses
  if (scores.yieldScore.score < 50) {
    weaknesses.push('Below average rental yield may require owner contribution');
  }
  if (scores.growthScore.score < 50) {
    weaknesses.push('Limited historical capital growth');
  }
  if (input.lvr && input.lvr > 80) {
    weaknesses.push('High leverage increases financial risk');
  }
  if (input.vacancyRate && input.vacancyRate > 4) {
    weaknesses.push('Higher than ideal vacancy rate in the area');
  }

  // Opportunities
  if (input.populationGrowth && input.populationGrowth > 2) {
    opportunities.push('Strong population growth driving future demand');
  }
  if (input.medianSuburbPrice && input.propertyPrice < input.medianSuburbPrice * 0.9) {
    opportunities.push('Priced below suburb median - potential for value appreciation');
  }
  if (input.unemploymentRate && input.unemploymentRate < 3.5) {
    opportunities.push('Low unemployment supporting rental demand');
  }
  if (scores.locationScore.score >= 70 && scores.yieldScore.score < 60) {
    opportunities.push('Strong location may drive future capital growth');
  }

  // Risks
  if (input.priceGrowth1Year && input.priceGrowth1Year > 15) {
    risks.push('Rapid recent price growth may indicate market cooling ahead');
  }
  if (input.cashFlow && input.cashFlow < -150) {
    risks.push('Significant negative cash flow requiring ongoing funding');
  }
  if (input.daysOnMarket && input.daysOnMarket > 80) {
    risks.push('Extended selling times may indicate softer market');
  }
  if (input.propertyType === 'unit' && input.state && ['VIC', 'QLD'].includes(input.state)) {
    risks.push('Unit market in this state may face oversupply challenges');
  }

  return { strengths, weaknesses, opportunities, risks };
}