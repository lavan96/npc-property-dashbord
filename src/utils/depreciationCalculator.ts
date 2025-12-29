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
  console.group('🧮 Depreciation Calculation Debug');
  console.log('📊 Input Parameters:', {
    purchasePrice: input.purchasePrice,
    buildYear: input.buildYear,
    purchaseDateCategory: input.purchaseDateCategory,
    propertyType: input.propertyType,
    finishStandard: input.finishStandard,
    nearestCity: input.nearestCity,
    renovated: input.renovated,
    fullyFurnished: input.fullyFurnished,
  });
  console.log('📦 Total comps received from database:', allComps.length);
  
  // Validate comps data
  if (!allComps || allComps.length === 0) {
    console.error('❌ No comps data received from database!');
    console.groupEnd();
    return null;
  }
  
  // Log sample of comps to verify structure
  console.log('🔍 Sample comp structure (first record):', allComps[0]);
  
  // Step A: Hard filter
  let filtered = hardFilterComps(allComps, input);
  console.log('Step A - Hard filter results:', filtered.length, 'comps');
  
  // Debug: Check what's in the data that doesn't match
  if (filtered.length < MIN_COMPS_REQUIRED) {
    const uniqueCategories = [...new Set(allComps.map(c => c.purchase_date_category))];
    const uniqueTypes = [...new Set(allComps.map(c => c.property_type))];
    const uniqueFinish = [...new Set(allComps.map(c => c.finish_standard))];
    const uniqueCities = [...new Set(allComps.map(c => c.nearest_city))];
    
    console.warn('⚠️ Not enough matches after hard filter. Available values in database:');
    console.log('  - purchase_date_categories:', uniqueCategories);
    console.log('  - property_types:', uniqueTypes);
    console.log('  - finish_standards:', uniqueFinish);
    console.log('  - nearest_cities:', uniqueCities);
    
    // Check each filter individually
    const byCategory = allComps.filter(c => c.purchase_date_category === input.purchaseDateCategory);
    const byType = allComps.filter(c => c.property_type === input.propertyType);
    const byFinish = allComps.filter(c => c.finish_standard === input.finishStandard);
    const byCity = allComps.filter(c => c.nearest_city === input.nearestCity);
    
    console.log('  Filter breakdown:');
    console.log(`    - Matching purchase_date_category "${input.purchaseDateCategory}":`, byCategory.length);
    console.log(`    - Matching property_type "${input.propertyType}":`, byType.length);
    console.log(`    - Matching finish_standard "${input.finishStandard}":`, byFinish.length);
    console.log(`    - Matching nearest_city "${input.nearestCity}":`, byCity.length);
  }
  
  // Fallback: If townhouse has no matches, try house data
  if (filtered.length < MIN_COMPS_REQUIRED && input.propertyType === 'townhouse') {
    const fallbackInput = { ...input, propertyType: 'house' as const };
    filtered = hardFilterComps(allComps, fallbackInput);
    console.log(`🔄 Townhouse fallback: Using house data (${filtered.length} comps found)`);
  }
  
  // Step B: Score
  const scored = scoreComps(filtered, input);
  console.log('Step B - Scored comps:', scored.length);
  if (scored.length > 0) {
    const scores = scored.map(c => c.score);
    console.log('  Score range:', Math.min(...scores).toFixed(3), '-', Math.max(...scores).toFixed(3));
    console.log('  Average score:', (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3));
  }
  
  // Step C: Select top comps
  const topComps = selectTopComps(scored);
  console.log('Step C - Top comps selected:', topComps.length, `(max ${MAX_COMPS_TO_USE})`);
  
  // Check minimum requirement
  if (topComps.length < MIN_COMPS_REQUIRED) {
    console.error(`❌ FAILED: Only ${topComps.length} comps found, need minimum ${MIN_COMPS_REQUIRED}`);
    console.groupEnd();
    return null;
  }
  
  // Log top comp details
  console.log('📋 Top 3 comps used:');
  topComps.slice(0, 3).forEach((comp, i) => {
    console.log(`  ${i + 1}. Price: $${comp.purchase_price.toLocaleString()}, Year: ${comp.build_year}, Score: ${comp.score.toFixed(3)}`);
  });
  
  // Step D: Blend results
  const blended = blendResults(topComps);
  console.log('Step D - Blended DV Year 1:', blended.dv[0]?.toFixed(0));
  console.log('Step D - Blended PC Year 1:', blended.pc[0]?.toFixed(0));
  
  // Step E: Scale by price
  const avgCompPrice = topComps.reduce((sum, c) => sum + c.purchase_price, 0) / topComps.length;
  const scale = input.purchasePrice / avgCompPrice;
  console.log('Step E - Price scaling:', {
    userPrice: input.purchasePrice,
    avgCompPrice: avgCompPrice.toFixed(0),
    scaleFactor: scale.toFixed(4),
  });
  
  const scaled = scaleByPrice(blended, topComps, input.purchasePrice);
  
  // Calculate totals
  const dvTotal = scaled.dv.reduce((sum, v) => sum + v, 0);
  const pcTotal = scaled.pc.reduce((sum, v) => sum + v, 0);
  
  // Calculate confidence score (based on count and score distribution)
  const avgScore = topComps.reduce((sum, c) => sum + c.score, 0) / topComps.length;
  const confidenceScore = Math.min(100, (topComps.length / MAX_COMPS_TO_USE) * 50 + (avgScore * 50));
  
  console.log('✅ CALCULATION COMPLETE:');
  console.log('  DV Year 1:', roundToThousand(scaled.dv[0]).toLocaleString());
  console.log('  PC Year 1:', roundToThousand(scaled.pc[0]).toLocaleString());
  console.log('  DV 10-Year Total:', roundToThousand(dvTotal).toLocaleString());
  console.log('  PC 10-Year Total:', roundToThousand(pcTotal).toLocaleString());
  console.log('  Confidence:', confidenceScore.toFixed(0) + '%');
  console.groupEnd();
  
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
