import { 
  DepreciationInput, 
  DepreciationComp, 
  DepreciationResult, 
  ScoredComp 
} from '@/types/depreciation';

const MIN_COMPS_REQUIRED = 5;
const MAX_COMPS_TO_USE = 25;

/**
 * Step A: Hard filter comps by exact match criteria
 */
function hardFilterComps(comps: DepreciationComp[], input: DepreciationInput): DepreciationComp[] {
  return comps.filter(comp => 
    comp.purchase_date_category === input.purchaseDateCategory &&
    comp.property_type === input.propertyType &&
    comp.finish_standard === input.finishStandard &&
    comp.nearest_city === input.nearestCity &&
    !comp.renovated &&
    !comp.fully_furnished
  );
}

/**
 * Step B: Score each comp based on price and build year similarity
 * Price similarity: 60% weight
 * Build year similarity: 40% weight
 */
function scoreComps(comps: DepreciationComp[], input: DepreciationInput): ScoredComp[] {
  return comps.map(comp => {
    // Price similarity: 1 - min(|P_user - P_comp| / P_user, 1)
    const priceDiff = Math.abs(input.purchasePrice - comp.purchase_price);
    const priceScore = Math.max(0, 1 - Math.min(priceDiff / input.purchasePrice, 1));
    
    // Build year similarity: 1 - min(|Y_user - Y_comp| / 20, 1) - cap within 20 years
    const yearDiff = Math.abs(input.buildYear - comp.build_year);
    const yearScore = Math.max(0, 1 - Math.min(yearDiff / 20, 1));
    
    // Weighted total: 60% price, 40% year
    const score = (priceScore * 0.6) + (yearScore * 0.4);
    
    return { ...comp, score };
  });
}

/**
 * Step C: Select top k comps (up to 25)
 */
function selectTopComps(scoredComps: ScoredComp[]): ScoredComp[] {
  return scoredComps
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_COMPS_TO_USE);
}

/**
 * Step D: Calculate weighted average for each year
 */
function blendResults(comps: ScoredComp[]): { dv: number[]; pc: number[] } {
  const totalWeight = comps.reduce((sum, c) => sum + c.score, 0);
  
  if (totalWeight === 0) {
    return { dv: Array(10).fill(0), pc: Array(10).fill(0) };
  }
  
  const dv: number[] = [];
  const pc: number[] = [];
  
  for (let year = 1; year <= 10; year++) {
    const dvKey = `dv_year${year}` as keyof DepreciationComp;
    const pcKey = `pc_year${year}` as keyof DepreciationComp;
    
    let dvSum = 0;
    let pcSum = 0;
    
    for (const comp of comps) {
      dvSum += (comp[dvKey] as number) * comp.score;
      pcSum += (comp[pcKey] as number) * comp.score;
    }
    
    dv.push(dvSum / totalWeight);
    pc.push(pcSum / totalWeight);
  }
  
  return { dv, pc };
}

/**
 * Step E: Scale results by purchase price ratio
 */
function scaleByPrice(
  results: { dv: number[]; pc: number[] }, 
  comps: ScoredComp[], 
  userPrice: number
): { dv: number[]; pc: number[] } {
  const avgCompPrice = comps.reduce((sum, c) => sum + c.purchase_price, 0) / comps.length;
  const scale = userPrice / avgCompPrice;
  
  return {
    dv: results.dv.map(v => Math.max(0, v * scale)),
    pc: results.pc.map(v => Math.max(0, v * scale)),
  };
}

/**
 * Round to nearest $1,000 for display
 */
export function roundToThousand(value: number): number {
  return Math.round(value / 1000) * 1000;
}

/**
 * Main calculation function
 */
export function calculateDepreciation(
  allComps: DepreciationComp[], 
  input: DepreciationInput
): DepreciationResult | null {
  // Step A: Hard filter
  let filtered = hardFilterComps(allComps, input);
  
  // Fallback: If townhouse has no matches, try house data
  if (filtered.length < MIN_COMPS_REQUIRED && input.propertyType === 'townhouse') {
    const fallbackInput = { ...input, propertyType: 'house' as const };
    filtered = hardFilterComps(allComps, fallbackInput);
    console.log(`Townhouse fallback: Using house data (${filtered.length} comps found)`);
  }
  
  // Step B: Score
  const scored = scoreComps(filtered, input);
  
  // Step C: Select top comps
  const topComps = selectTopComps(scored);
  
  // Check minimum requirement
  if (topComps.length < MIN_COMPS_REQUIRED) {
    return null;
  }
  
  // Step D: Blend results
  const blended = blendResults(topComps);
  
  // Step E: Scale by price
  const scaled = scaleByPrice(blended, topComps, input.purchasePrice);
  
  // Calculate totals
  const dvTotal = scaled.dv.reduce((sum, v) => sum + v, 0);
  const pcTotal = scaled.pc.reduce((sum, v) => sum + v, 0);
  
  // Calculate confidence score (based on count and score distribution)
  const avgScore = topComps.reduce((sum, c) => sum + c.score, 0) / topComps.length;
  const confidenceScore = Math.min(100, (topComps.length / MAX_COMPS_TO_USE) * 50 + (avgScore * 50));
  
  return {
    dv: scaled.dv,
    pc: scaled.pc,
    dvTotal,
    pcTotal,
    matchCount: topComps.length,
    topCompIds: topComps.map(c => c.id),
    confidenceScore,
  };
}

/**
 * Format currency for display (rounded to nearest thousand)
 */
export function formatDepreciationValue(value: number): string {
  const rounded = roundToThousand(value);
  return `$${rounded.toLocaleString()}`;
}
