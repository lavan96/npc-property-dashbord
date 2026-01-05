import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RegenerateRequest {
  reportId: string;
  manualOverrides: Record<string, any>;
  currentReportContent: string;
  propertyAddress: string;
  financialCalculations?: Record<string, any>;
}

// Enhanced data interface - matches generate-investment-report
interface EnhancedData {
  demographics?: any;
  economics?: any;
  financials?: any;
  locationIntelligence?: any;
  investmentScore?: any;
  domainData?: any;
  riskAssessment?: any;
  seifaData?: any;
  crimeStatistics?: any;
  employmentData?: any;
  climateData?: any;
  schoolData?: any;
  validation?: any;
}

// Report section definitions - mirroring generate-investment-report structure
// INCREASED maxTokens for longer, more comprehensive content
const REPORT_SECTIONS = [
  {
    id: 'section1',
    name: 'Location & Market Overview',
    sections: ['Location Overview', 'Current Market Performance', 'Current Economic Context', 'Demographics & Demand Drivers'],
    maxTokens: 8000,  // Increased from 4500
    minContentLength: 12000, // Increased from 8000
    requiredKeywords: ['location', 'market', 'demographic', 'population', 'growth'],
  },
  {
    id: 'section2', 
    name: 'Amenities & Infrastructure',
    sections: ['Schools & Education', 'Healthcare & Shopping', 'Recreational Amenities', 'Transport & Accessibility', 'Environmental Risks & Climate', 'Crime & Safety'],
    maxTokens: 10000,  // Increased from 5000
    minContentLength: 15000, // Increased from 10000
    requiredKeywords: ['school', 'transport', 'hospital', 'crime', 'risk', 'flood', 'bushfire'],
  },
  {
    id: 'section3',
    name: 'Property & Financial Analysis',
    sections: ['Property-Level Information', 'Purchase & Ongoing Costs', 'Rental Assessment & Yield Calculation', 'Loan Structure & Repayment Analysis', 'Cashflow Analysis'],
    maxTokens: 8000,  // Increased from 4500
    minContentLength: 12000, // Increased from 8000
    requiredKeywords: ['purchase', 'stamp duty', 'loan', 'yield', 'cashflow', 'rent'],
  },
  {
    id: 'section4',
    name: 'Projections & Recommendations',
    sections: ['10-Year Investment Projections', 'SWOT Analysis', 'Top 3 Opportunities', 'Top 3 Risks', 'Data Transparency Statement', 'Investment Recommendations', 'Investment Suitability Screening', 'Final Conclusion', 'Data Sources'],
    maxTokens: 10000,  // Increased from 5500
    minContentLength: 10000, // Increased from 7000
    requiredKeywords: ['projection', 'swot', 'opportunity', 'risk', 'recommendation', 'score'],
  }
];

// Helper function to fetch with timeout - matches generate-investment-report
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 90000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log(`⏱️ Request timeout after ${timeoutMs}ms, aborting...`);
    controller.abort();
  }, timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000} seconds`);
    }
    throw error;
  }
}

// Section validation helper - ensures content meets minimum requirements
// STRICTER validation for better quality control
function validateSectionContent(
  sectionDef: typeof REPORT_SECTIONS[0],
  content: string
): { isValid: boolean; issues: string[]; score: number } {
  const issues: string[] = [];
  let score = 100;
  
  const contentLength = content?.length || 0;
  
  // STRICTER length validation - must meet at least 70% of minimum
  const minThreshold = sectionDef.minContentLength * 0.7;
  if (contentLength < minThreshold) {
    issues.push(`Content critically short: ${contentLength} chars (need at least: ${Math.round(minThreshold)})`);
    score -= 50; // Increased penalty
  } else if (contentLength < sectionDef.minContentLength) {
    issues.push(`Content below target: ${contentLength} chars (target: ${sectionDef.minContentLength})`);
    score -= 20;
  }
  
  const contentLower = (content || '').toLowerCase();
  const missingKeywords = (sectionDef.requiredKeywords || []).filter(
    kw => !contentLower.includes(kw.toLowerCase())
  );
  
  if (missingKeywords.length > 0) {
    issues.push(`Missing content areas: ${missingKeywords.join(', ')}`);
    score -= missingKeywords.length * 10;
  }
  
  const headingCount = (content?.match(/^#{1,3}\s+/gm) || []).length;
  if (headingCount < 4) { // Increased from 3
    issues.push(`Insufficient structure: only ${headingCount} headings found (need 4+)`);
    score -= 15;
  }
  
  // Check for data presentation (tables with |)
  const hasDataTables = content?.includes('|') && content?.includes('---');
  if (!hasDataTables && sectionDef.id !== 'section4') {
    issues.push('No data tables found');
    score -= 10;
  }
  
  // Check for inline citations/references
  const hasCitations = content?.includes('[') && content?.includes(']');
  if (!hasCitations) {
    issues.push('No inline citations found');
    score -= 5;
  }
  
  return {
    isValid: score >= 70, // Increased threshold from 60 to 70
    issues,
    score: Math.max(0, score)
  };
}

// Helper function to extract content for a specific section from the original report
function extractSectionContent(fullContent: string, sectionNames: string[]): string {
  let extractedContent = '';
  
  for (const sectionName of sectionNames) {
    const patterns = [
      new RegExp(`^#{1,3}\\s*${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=^#{1,3}\\s|$)`, 'gmi'),
      new RegExp(`\\*\\*${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*[\\s\\S]*?(?=\\*\\*[A-Z]|^#{1,3}|$)`, 'gmi'),
    ];
    
    for (const pattern of patterns) {
      const matches = fullContent.match(pattern);
      if (matches && matches.length > 0) {
        extractedContent += matches[0] + '\n\n';
        break;
      }
    }
  }
  
  return extractedContent.trim();
}

// Fetch all enhanced data from APIs - matches generate-investment-report
async function fetchEnhancedData(
  propertyAddress: string,
  manualOverrides: Record<string, any>,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<{ enhancedData: EnhancedData; suburb: string | null; postcode: string | null; state: string }> {
  console.log('🔄 Fetching enhanced data from multiple APIs...');
  
  let enhancedData: EnhancedData = {};
  
  // Extract location details from property address
  let postcode: string | null = null;
  let state = 'NSW';
  let suburb: string | null = null;
  
  const postcodeMatch = propertyAddress.match(/\b(\d{4})\b/);
  if (postcodeMatch) {
    postcode = postcodeMatch[1];
  }
  
  const stateMatch = propertyAddress.match(/\b(NSW|VIC|QLD|WA|SA|TAS|NT|ACT|Western Australia|New South Wales|Victoria|Queensland|South Australia|Tasmania|Northern Territory|Australian Capital Territory)\b/i);
  if (stateMatch) {
    const stateInput = stateMatch[1].toUpperCase();
    const stateMap: Record<string, string> = {
      'WESTERN AUSTRALIA': 'WA',
      'NEW SOUTH WALES': 'NSW',
      'VICTORIA': 'VIC',
      'QUEENSLAND': 'QLD',
      'SOUTH AUSTRALIA': 'SA',
      'TASMANIA': 'TAS',
      'NORTHERN TERRITORY': 'NT',
      'AUSTRALIAN CAPITAL TERRITORY': 'ACT'
    };
    state = stateMap[stateInput] || stateInput;
  }
  
  // Extract suburb from address
  const suburbMatch = propertyAddress.match(/,\s*([A-Za-z\s]+)(?:,|\s+(?:NSW|VIC|QLD|WA|SA|TAS|NT|ACT))/i);
  if (suburbMatch) {
    suburb = suburbMatch[1].trim().toLowerCase().replace(/\s+/g, '-');
  } else {
    // Try extracting from comma-separated parts
    const parts = propertyAddress.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      suburb = parts[1].replace(/\d{4}|\b(NSW|VIC|QLD|WA|SA|TAS|NT|ACT)\b/gi, '').trim().toLowerCase().replace(/\s+/g, '-');
    }
  }
  
  console.log('📍 Location extracted:', { suburb, postcode, state });

  // Get property details from manual overrides
  const propertyPrice = manualOverrides.purchasePrice || 0;
  const weeklyRent = manualOverrides.weeklyRent || 0;
  const propertyType = manualOverrides.propertyType || 'house';
  const bedrooms = manualOverrides.bedrooms || 3;
  const bathrooms = manualOverrides.bathrooms || 2;

  // 1. Fetch Domain market data
  if (suburb && state) {
    try {
      console.log('📊 Fetching Domain market data...');
      const domainResponse = await fetchWithTimeout(`${supabaseUrl}/functions/v1/domain-data-service`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`
        },
        body: JSON.stringify({ 
          suburb: suburb,
          state: state,
          postcode: postcode,
          propertyCategory: propertyType === 'unit' ? 'unit' : 'house'
        })
      }, 30000);
      
      if (domainResponse.ok) {
        const domainData = await domainResponse.json();
        if (domainData.success && domainData.data) {
          enhancedData.domainData = domainData.data;
          console.log('✓ Domain market data fetched');
        }
      }
    } catch (error: any) {
      console.log('⚠️ Domain data fetch failed:', error?.message);
    }
  }

  // 2. Fetch Risk Assessment
  if (postcode && state) {
    try {
      console.log('🔥 Fetching risk assessment...');
      const riskResponse = await fetchWithTimeout(`${supabaseUrl}/functions/v1/risk-assessment-service`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`
        },
        body: JSON.stringify({ 
          suburb: suburb || 'unknown',
          state: state,
          postcode: postcode
        })
      }, 30000);
      
      if (riskResponse.ok) {
        const riskData = await riskResponse.json();
        if (riskData.success && riskData.data) {
          enhancedData.riskAssessment = riskData.data;
          console.log('✓ Risk assessment data fetched');
        }
      }
    } catch (error: any) {
      console.log('⚠️ Risk assessment fetch failed:', error?.message);
    }
  }

  // 3. Fetch ABS demographic data
  if (postcode) {
    try {
      console.log('👥 Fetching ABS demographics...');
      const absResponse = await fetchWithTimeout(`${supabaseUrl}/functions/v1/abs-data-service`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`
        },
        body: JSON.stringify({ postcode, state })
      }, 30000);
      
      if (absResponse.ok) {
        const absData = await absResponse.json();
        if (absData.success && absData.data) {
          enhancedData.demographics = absData.data;
          console.log('✓ ABS demographics fetched');
        }
      }
    } catch (error: any) {
      console.log('⚠️ ABS demographics fetch failed:', error?.message);
    }
  }

  // 4. Fetch RBA economic data
  try {
    console.log('💰 Fetching RBA economic data...');
    const rbaResponse = await fetchWithTimeout(`${supabaseUrl}/functions/v1/rba-data-service`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    }, 30000);
    
    if (rbaResponse.ok) {
      const rbaData = await rbaResponse.json();
      enhancedData.economics = rbaData.data;
      console.log('✓ RBA economic data fetched');
    }
  } catch (error: any) {
    console.log('⚠️ RBA data fetch failed:', error?.message);
  }

  // 5. Fetch SEIFA socioeconomic data
  if (postcode) {
    try {
      console.log('📈 Fetching SEIFA data...');
      const seifaResponse = await fetchWithTimeout(`${supabaseUrl}/functions/v1/abs-seifa-service`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`
        },
        body: JSON.stringify({ postcode, state })
      }, 30000);
      
      if (seifaResponse.ok) {
        const seifaData = await seifaResponse.json();
        if (seifaData.success && seifaData.data) {
          enhancedData.seifaData = seifaData.data;
          console.log('✓ SEIFA data fetched');
        }
      }
    } catch (error: any) {
      console.log('⚠️ SEIFA data fetch failed:', error?.message);
    }
  }

  // 6. Fetch Crime statistics
  if (suburb && state) {
    try {
      console.log('🚔 Fetching crime statistics...');
      const crimeResponse = await fetchWithTimeout(`${supabaseUrl}/functions/v1/crime-statistics-service`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`
        },
        body: JSON.stringify({ suburb, state, postcode })
      }, 30000);
      
      if (crimeResponse.ok) {
        const crimeData = await crimeResponse.json();
        if (crimeData.success && crimeData.data) {
          enhancedData.crimeStatistics = crimeData.data;
          console.log('✓ Crime statistics fetched');
        }
      }
    } catch (error: any) {
      console.log('⚠️ Crime statistics fetch failed:', error?.message);
    }
  }

  // 7. Fetch Employment data
  if (state) {
    try {
      console.log('💼 Fetching employment data...');
      const employmentResponse = await fetchWithTimeout(`${supabaseUrl}/functions/v1/abs-employment-service`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`
        },
        body: JSON.stringify({ suburb, state, postcode })
      }, 30000);
      
      if (employmentResponse.ok) {
        const employmentData = await employmentResponse.json();
        if (employmentData.success && employmentData.data) {
          enhancedData.employmentData = employmentData.data;
          console.log('✓ Employment data fetched');
        }
      }
    } catch (error: any) {
      console.log('⚠️ Employment data fetch failed:', error?.message);
    }
  }

  // 8. Fetch Climate data
  if (state) {
    try {
      console.log('🌡️ Fetching climate data...');
      const climateResponse = await fetchWithTimeout(`${supabaseUrl}/functions/v1/climate-data-service`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`
        },
        body: JSON.stringify({ suburb, state, postcode })
      }, 30000);
      
      if (climateResponse.ok) {
        const climateData = await climateResponse.json();
        if (climateData.success && climateData.data) {
          enhancedData.climateData = climateData.data;
          console.log('✓ Climate data fetched');
        }
      }
    } catch (error: any) {
      console.log('⚠️ Climate data fetch failed:', error?.message);
    }
  }

  // 9. Fetch Location Intelligence
  try {
    console.log('📍 Fetching location intelligence...');
    const locationResponse = await fetchWithTimeout(`${supabaseUrl}/functions/v1/location-intelligence-service`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify({
        address: propertyAddress,
        postcode: postcode,
        state: state
      })
    }, 30000);
    
    if (locationResponse.ok) {
      const locationData = await locationResponse.json();
      if (locationData.success && locationData.data) {
        enhancedData.locationIntelligence = locationData.data;
        console.log('✓ Location intelligence fetched');
      }
    }
  } catch (error: any) {
    console.log('⚠️ Location intelligence fetch failed:', error?.message);
  }

  // 10. Fetch School data
  if (suburb && state && postcode) {
    try {
      console.log('🎓 Fetching school data...');
      const latitude = enhancedData.locationIntelligence?.coordinates?.lat;
      const longitude = enhancedData.locationIntelligence?.coordinates?.lng;
      
      const schoolResponse = await fetchWithTimeout(`${supabaseUrl}/functions/v1/school-data-service`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`
        },
        body: JSON.stringify({ 
          suburb, state, postcode,
          latitude: latitude || undefined,
          longitude: longitude || undefined
        })
      }, 30000);
      
      if (schoolResponse.ok) {
        const schoolData = await schoolResponse.json();
        if (schoolData.success && schoolData.data) {
          enhancedData.schoolData = schoolData.data;
          console.log('✓ School data fetched');
        }
      }
    } catch (error: any) {
      console.log('⚠️ School data fetch failed:', error?.message);
    }
  }

  // 11. Fetch Financial Calculations (if we have price and rent)
  if (propertyPrice && weeklyRent) {
    try {
      console.log('🧮 Fetching financial calculations...');
      const effectiveLvr = manualOverrides.loanToValueRatio || 80;
      const effectiveDeposit = manualOverrides.depositValue || (propertyPrice * ((100 - effectiveLvr) / 100));
      const effectiveInterestRate = manualOverrides.interestRate || 6.5;
      const effectiveLoanTerm = manualOverrides.loanTermYears || 30;
      
      const financialResponse = await fetchWithTimeout(`${supabaseUrl}/functions/v1/financial-calculator-service`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`
        },
        body: JSON.stringify({
          propertyValue: propertyPrice,
          deposit: effectiveDeposit,
          interestRate: effectiveInterestRate,
          loanTerm: effectiveLoanTerm,
          weeklyRent: weeklyRent,
          weeklyRentSource: 'manual_override',
          state: state,
          propertyType: propertyType,
          isFirstHomeBuyer: manualOverrides.isFirstHomeBuyer || false,
          isNewBuild: manualOverrides.buildType === 'new_build'
        })
      }, 30000);
      
      if (financialResponse.ok) {
        const financialData = await financialResponse.json();
        if (financialData.data) {
          // Merge manual overrides with fresh financial calculations
          const mergedFinancials = JSON.parse(JSON.stringify(financialData.data));
          
          // Apply overrides to nested structure
          const overrideMapping: Record<string, string> = {
            'purchasePrice': 'initialCosts.propertyValue',
            'stampDuty': 'initialCosts.stampDuty',
            'depositValue': 'initialCosts.deposit',
            'loanToValueRatio': 'keyMetrics.lvr',
            'interestRate': 'loanDetails.interestRate',
            'weeklyRent': 'income.weeklyRent',
            'councilRates': 'annualCosts.councilRates',
            'waterRates': 'annualCosts.waterRates',
            'bodyCorporateFees': 'annualCosts.strataFees',
            'buildingLandlordInsurance': 'annualCosts.landlordInsurance',
            'propertyManagementFees': 'annualCosts.propertyManagementPercent',
            'repairsMaintenance': 'annualCosts.maintenance',
            'lettingFees': 'annualCosts.lettingFees',
            'capitalGrowth': 'assumptions.capitalGrowth',
            'landTax': 'annualCosts.landTax',
            'depreciation': 'taxBenefits.depreciation',
            'taxRate': 'taxBenefits.marginalTaxRate',
            'occupancyRate': 'assumptions.occupancyWeeks',
            'loanAmount': 'loanDetails.loanAmount'
          };
          
          for (const [flatKey, overrideValue] of Object.entries(manualOverrides)) {
            const nestedPath = overrideMapping[flatKey];
            if (nestedPath && overrideValue !== null && overrideValue !== undefined) {
              const keys = nestedPath.split('.');
              let current = mergedFinancials;
              
              for (let i = 0; i < keys.length - 1; i++) {
                if (!current[keys[i]]) {
                  current[keys[i]] = {};
                }
                current = current[keys[i]];
              }
              current[keys[keys.length - 1]] = overrideValue;
            }
          }
          
          enhancedData.financials = mergedFinancials;
          console.log('✓ Financial calculations fetched and merged');
        }
      }
    } catch (error: any) {
      console.log('⚠️ Financial calculations fetch failed:', error?.message);
    }
  }

  // 12. Calculate Investment Score
  if (propertyPrice) {
    try {
      console.log('⭐ Calculating investment score...');
      const scoreResponse = await fetchWithTimeout(`${supabaseUrl}/functions/v1/investment-scoring-service`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`
        },
        body: JSON.stringify({
          property: {
            price: propertyPrice,
            weeklyRent: weeklyRent || 0,
            propertyType: propertyType,
            bedrooms: bedrooms,
            bathrooms: bathrooms
          },
          demographics: enhancedData.demographics,
          locationIntelligence: enhancedData.locationIntelligence,
          financials: enhancedData.financials
        })
      }, 30000);
      
      if (scoreResponse.ok) {
        const scoreData = await scoreResponse.json();
        enhancedData.investmentScore = scoreData.data;
        console.log('✓ Investment score calculated:', {
          totalScore: scoreData.data?.totalScore,
          grade: scoreData.data?.grade
        });
      }
    } catch (error: any) {
      console.log('⚠️ Investment score calculation failed:', error?.message);
    }
  }

  console.log('📊 Enhanced data fetch complete. Data sources:', Object.keys(enhancedData).filter(k => enhancedData[k as keyof EnhancedData]).join(', '));

  return { enhancedData, suburb, postcode, state };
}

// Build enhanced data context string - mirrors generate-investment-report
function buildEnhancedDataContext(enhancedData: EnhancedData, propertyAddress: string): string {
  let context = '';
  
  // Demographics context
  if (enhancedData.demographics) {
    const demo = enhancedData.demographics;
    context += `
**DEMOGRAPHIC DATA (ABS Census):**
- Population: ${demo.population?.total || 'N/A'}
- Population Growth (5yr): ${demo.population?.growth || 'N/A'}%
- Median Age: ${demo.population?.medianAge || 'N/A'} years
- Median Household Income: $${demo.income?.medianHouseholdIncome?.toLocaleString() || 'N/A'}
- Median Weekly Income: $${demo.income?.medianWeeklyIncome?.toLocaleString() || 'N/A'}
- Employment Rate: ${demo.employment?.employmentRate || 'N/A'}%
- Unemployment Rate: ${demo.income?.unemploymentRate || 'N/A'}%
- Owner Occupied: ${demo.housing?.ownerOccupied || 'N/A'}%
- Rental Properties: ${demo.housing?.renting || 'N/A'}%
`;
  }

  // Economic context
  if (enhancedData.economics) {
    const econ = enhancedData.economics;
    context += `
**ECONOMIC DATA (RBA):**
- Cash Rate: ${econ.cashRate?.current || '4.35'}%
- Annual Inflation: ${econ.inflation?.annual || 'N/A'}%
- GDP Growth: ${econ.indicators?.gdpGrowth || 'N/A'}%
- Unemployment Rate: ${econ.indicators?.unemploymentRate || 'N/A'}%
- House Price Growth: ${econ.indicators?.housePriceGrowth || 'N/A'}%
`;
  }

  // Location intelligence
  if (enhancedData.locationIntelligence) {
    const loc = enhancedData.locationIntelligence;
    context += `
**LOCATION INTELLIGENCE:**
- Walk Score: ${loc.walkScore || 'N/A'}/100
- Public Transport Score: ${loc.transport?.qualityScore || 'N/A'}/100
- CBD Commute: ${loc.commute?.durationMinutes || 'N/A'} minutes (${loc.commute?.distanceKm || 'N/A'} km)
- Healthcare Facilities (5km): ${loc.healthcare?.facilitiesWithin5km || 'N/A'}
- Shopping Centers: ${loc.lifestyle?.shoppingCenters || 'N/A'}
`;
  }

  // SEIFA data
  if (enhancedData.seifaData) {
    const seifa = enhancedData.seifaData;
    context += `
**SOCIOECONOMIC INDICES (SEIFA):**
- IRSAD Score: ${seifa.irsad?.score || 'N/A'} (Decile ${seifa.irsad?.decile || 'N/A'}/10)
- IRSD Score: ${seifa.irsd?.score || 'N/A'} (Decile ${seifa.irsd?.decile || 'N/A'}/10)
- IER Score: ${seifa.ier?.score || 'N/A'} (Decile ${seifa.ier?.decile || 'N/A'}/10)
- IEO Score: ${seifa.ieo?.score || 'N/A'} (Decile ${seifa.ieo?.decile || 'N/A'}/10)
`;
  }

  // Crime statistics
  if (enhancedData.crimeStatistics) {
    const crime = enhancedData.crimeStatistics;
    context += `
**CRIME & SAFETY:**
- Crime Rate: ${crime.crimeRate || 'N/A'} per 100k
- Safety Score: ${crime.safetyScore || 'N/A'}/100
- Trend: ${crime.trend || 'N/A'}
- Comparison to State: ${crime.comparisonToState || 'N/A'}
`;
  }

  // Employment data
  if (enhancedData.employmentData) {
    const emp = enhancedData.employmentData;
    context += `
**EMPLOYMENT & JOB GROWTH:**
- Annual Growth: ${emp.annualGrowth || 'N/A'}%
- 3-Year Growth: ${emp.threeYearGrowth || 'N/A'}%
- 5-Year Growth: ${emp.fiveYearGrowth || 'N/A'}%
- Top Industries: ${emp.industries?.slice(0, 3).map((i: any) => `${i.name} (${i.percentage}%)`).join(', ') || 'N/A'}
`;
  }

  // Climate data
  if (enhancedData.climateData) {
    const climate = enhancedData.climateData;
    context += `
**CLIMATE & ENVIRONMENT:**
- Climate Zone: ${climate.climateZone || 'N/A'}
- Average Summer Temp: ${climate.temperature?.summer || 'N/A'}°C
- Average Winter Temp: ${climate.temperature?.winter || 'N/A'}°C
- Annual Rainfall: ${climate.rainfall?.annual || 'N/A'}mm
`;
  }

  // Risk assessment
  if (enhancedData.riskAssessment) {
    const risk = enhancedData.riskAssessment;
    context += `
**ENVIRONMENTAL RISKS:**
- Flood Risk: ${risk.floodRisk?.level || 'N/A'} (${risk.floodRisk?.description || ''})
- Bushfire Risk: ${risk.bushfireRisk?.level || 'N/A'} (${risk.bushfireRisk?.description || ''})
- Coastal Erosion: ${risk.coastalRisk?.level || 'N/A'}
- Overall Risk Score: ${risk.overallScore || 'N/A'}/100
`;
  }

  // School data
  if (enhancedData.schoolData) {
    const schools = enhancedData.schoolData;
    context += `
**EDUCATION:**
- Total Schools in Postcode: ${schools.summary?.totalSchools || 'N/A'}
- Average School Rating: ${schools.summary?.averageRating || 'N/A'}/5
- Nearest School: ${schools.nearestSchool?.name || 'N/A'} (${schools.nearestSchool?.distance || 'N/A'} km)
- Education Quality: ${schools.summary?.qualityAssessment || 'N/A'}
`;
  }

  // Financial data
  if (enhancedData.financials) {
    const fin = enhancedData.financials;
    context += `
**FINANCIAL CALCULATIONS:**
- Property Value: $${fin.initialCosts?.propertyValue?.toLocaleString() || 'N/A'}
- Stamp Duty: $${fin.initialCosts?.stampDuty?.toLocaleString() || 'N/A'}
- Loan Amount: $${fin.loanDetails?.loanAmount?.toLocaleString() || 'N/A'}
- Monthly Repayment (P&I): $${fin.loanDetails?.monthlyPayment?.toLocaleString() || 'N/A'}
- Monthly Repayment (IO): $${fin.loanDetails?.interestOnlyPayment?.toLocaleString() || 'N/A'}
- Gross Rental Yield: ${fin.keyMetrics?.grossRentalYield || 'N/A'}%
- Net Rental Yield: ${fin.keyMetrics?.netRentalYield || 'N/A'}%
- Annual Net Cashflow: $${fin.keyMetrics?.annualNet?.toLocaleString() || 'N/A'}
- Total Annual Costs: $${fin.annualCosts?.totalAnnual?.toLocaleString() || 'N/A'}
`;
  }

  // Investment score
  if (enhancedData.investmentScore) {
    const score = enhancedData.investmentScore;
    context += `
**INVESTMENT SCORE:**
- Total Score: ${score.totalScore || 'N/A'}/100
- Grade: ${score.grade || 'N/A'}
- Recommendation: ${score.recommendation || 'N/A'}
- Growth Score: ${score.breakdown?.growthScore?.score || 'N/A'}/100
- Location Score: ${score.breakdown?.locationScore?.score || 'N/A'}/100
- Yield Score: ${score.breakdown?.yieldScore?.score || 'N/A'}/100
- Demand Score: ${score.breakdown?.demandScore?.score || 'N/A'}/100
- Risk Score: ${score.breakdown?.riskScore?.score || 'N/A'}/100
${score.strengths?.length ? `- Strengths: ${score.strengths.join(', ')}` : ''}
${score.weaknesses?.length ? `- Weaknesses: ${score.weaknesses.join(', ')}` : ''}
`;
  }

  return context;
}

// Generate a single section with full context - matches generate-investment-report approach
async function regenerateSection(
  sectionDef: typeof REPORT_SECTIONS[0],
  originalSectionContent: string,
  overrideSummary: string,
  perplexityApiKey: string,
  previousSections: string,
  propertyAddress: string,
  enhancedData: EnhancedData,
  templateContext?: string,
  maxRetries: number = 2
): Promise<{ content: string; citations: any[]; error?: string }> {
  
  // Build enhanced data context
  const enhancedDataContext = buildEnhancedDataContext(enhancedData, propertyAddress);
  
  // Build investment score context for Section 4
  let investmentScoreContext = '';
  if (sectionDef.id === 'section4' && enhancedData.investmentScore) {
    const score = enhancedData.investmentScore;
    console.log('📊 Injecting investment score data into section 4:', {
      totalScore: score.totalScore,
      grade: score.grade,
      recommendation: score.recommendation
    });
    
    investmentScoreContext = `
**INVESTMENT SCORE DATA (USE THESE EXACT VALUES):**
- Total Investment Score: ${score.totalScore}/100
- Investment Grade: ${score.grade}
- Recommendation: ${score.recommendation}
- Growth Score: ${score.breakdown?.growthScore?.score || 'N/A'}/100 (Weight: ${score.breakdown?.growthScore?.weight || 40}%)
- Location Score: ${score.breakdown?.locationScore?.score || 'N/A'}/100 (Weight: ${score.breakdown?.locationScore?.weight || 25}%)
- Yield Score: ${score.breakdown?.yieldScore?.score || 'N/A'}/100 (Weight: ${score.breakdown?.yieldScore?.weight || 15}%)
- Demand Score: ${score.breakdown?.demandScore?.score || 'N/A'}/100 (Weight: ${score.breakdown?.demandScore?.weight || 15}%)
- Risk Score: ${score.breakdown?.riskScore?.score || 'N/A'}/100 (Weight: ${score.breakdown?.riskScore?.weight || 5}%)
${score.strengths?.length ? `- Strengths: ${score.strengths.join(', ')}` : ''}
${score.weaknesses?.length ? `- Weaknesses: ${score.weaknesses.join(', ')}` : ''}
${score.opportunities?.length ? `- Opportunities: ${score.opportunities.join(', ')}` : ''}
${score.risks?.length ? `- Risks: ${score.risks.join(', ')}` : ''}

**CRITICAL: You MUST include the Investment Score Analysis section with the EXACT values above. Do NOT skip this section or use placeholder values.**

`;
  }

  // Build template reference section
  let templateSection = '';
  if (templateContext) {
    templateSection = `
---
**REFERENCE TEMPLATE STRUCTURE (Follow this structure closely):**
${templateContext.substring(0, 4000)}
---
`;
  }

  // IMPORTANT: This is a REGENERATION - we generate COMPLETELY FRESH content
  // DO NOT reference original content - this ensures truly new analysis each time
  const sectionPrompt = `You are an expert Australian property investment analyst for Naidu Property Consulting Services.
You are creating a FRESH, COMPREHENSIVE section for an investment report for: ${propertyAddress}

**SECTION TO CREATE:** ${sectionDef.name}
**Subsections to include:** ${sectionDef.sections.join(', ')}

${templateSection}

**LIVE DATA FROM AUTHORITATIVE SOURCES (USE THIS DATA):**
${enhancedDataContext}

**CLIENT-SPECIFIED VALUES (Use these EXACT values in calculations and analysis):**
${overrideSummary}

${investmentScoreContext}

${previousSections ? `**CONTEXT FROM PREVIOUS SECTIONS (for consistency only - DO NOT repeat this content):**
${previousSections.substring(0, 1500)}...
` : ''}

**CRITICAL INSTRUCTIONS:**
1. Generate COMPLETELY FRESH content - use your own analysis and writing style
2. DO NOT copy or closely paraphrase any existing content - create original analysis
3. Follow markdown formatting: # for main sections, ## for subsections, ### for sub-subsections
4. USE THE LIVE DATA VALUES ABOVE - never use placeholder values when data is available
5. Include well-formatted data tables with REAL numbers from the data context
6. Use proper horizontal rules (---) between major sections
7. Each section must be COMPREHENSIVE and DETAILED - minimum 2000+ words per major section
8. Be thorough, analytical, and data-driven - this is a premium client-facing investment report
9. Start immediately with the first section heading - no preamble or introductory text
10. INCLUDE INLINE CITATIONS: [ABS Census 2021], [RBA], [Domain], [CoreLogic], [SEIFA], [BOM], etc.
11. Be SPECIFIC with numbers, percentages, year-on-year comparisons, and market context
12. Provide unique insights and analysis - differentiate from generic property reports
${sectionDef.id === 'section4' ? '13. MUST include the Investment Score Analysis with the EXACT score values provided above' : ''}

Generate the ${sectionDef.name} section now with fresh, original, comprehensive analysis:`;

  const systemMessage = `You are an expert Australian property investment analyst for Naidu Property Consulting Services. You produce comprehensive, professional-grade investment reports that are UNIQUE and ORIGINAL for each property.

CRITICAL: This is a REGENERATION request - you MUST generate COMPLETELY FRESH content that differs from any previous version. Use different phrasing, sentence structures, and analytical perspectives.

Your task is to:
1. Create ORIGINAL, FRESH analysis - never replicate previous content patterns
2. Use the LIVE DATA provided from authoritative sources - these are real, current values
3. Apply client-specified values exactly as provided
4. Follow professional investment report structure and formatting
5. Write ALL narrative from scratch with unique analytical perspectives
6. Ensure calculations, tables, and projections use the provided values correctly
7. Maintain professional, analytical, and authoritative tone throughout
8. Be data-driven and specific - quantify everything possible
9. INCLUDE INLINE CITATIONS using [Source Name] format throughout:
   - [ABS Census 2021] for demographic data
   - [RBA] for economic/interest rate data  
   - [Domain] or [CoreLogic] for property market data
   - [SEIFA] for socioeconomic indices
   - [State Government] for crime/transport data
   - [Bureau of Meteorology] for climate data
10. Write COMPREHENSIVE, DETAILED content - minimum 2000+ words per major section
11. Include specific numbers, percentages, trend analysis, and year-on-year comparisons
12. Provide UNIQUE insights that differentiate this report from generic analysis`;

  // Retry loop with exponential backoff - matches generate-investment-report
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📝 Regenerating section: ${sectionDef.name}... (attempt ${attempt}/${maxRetries})`);
      
      const response = await fetchWithTimeout('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${perplexityApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar-pro',
          max_tokens: sectionDef.maxTokens,
          temperature: 0.1, // Match generate-investment-report temperature
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: sectionPrompt }
          ]
        }),
      }, 120000); // 120 second timeout per section

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Section ${sectionDef.id} API error (attempt ${attempt}):`, response.status, errorText);
        
        // If rate limited or server error, wait and retry
        if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
          const waitTime = attempt * 5000; // 5s, 10s
          console.log(`⏳ Waiting ${waitTime/1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        return { content: '', citations: [], error: `API error ${response.status}: ${errorText}` };
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const citations = data.citations || [];
      
      console.log(`✓ Section ${sectionDef.name} regenerated: ${content.length} chars`);
      
      return { content, citations };
    } catch (error: any) {
      console.error(`❌ Error regenerating section ${sectionDef.id} (attempt ${attempt}):`, error?.message);
      
      // Retry on timeout or network errors
      if (attempt < maxRetries) {
        const waitTime = attempt * 3000; // 3s, 6s
        console.log(`⏳ Waiting ${waitTime/1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      return { content: '', citations: [], error: error?.message };
    }
  }
  
  return { content: '', citations: [], error: 'Max retries exceeded' };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    if (!PERPLEXITY_API_KEY) {
      throw new Error('PERPLEXITY_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      reportId, 
      manualOverrides, 
      currentReportContent, 
      propertyAddress,
      financialCalculations 
    }: RegenerateRequest = await req.json();

    console.log('=== ENHANCED MULTI-SECTION REPORT REGENERATION ===');
    console.log('📝 Report ID:', reportId);
    console.log('📍 Property:', propertyAddress);
    console.log('📊 Manual overrides:', Object.keys(manualOverrides).length, 'fields');
    console.log('📄 Original content length:', currentReportContent?.length || 0, 'chars');

    // ========== FETCH ENHANCED DATA FROM ALL APIs ==========
    const { enhancedData, suburb, postcode, state } = await fetchEnhancedData(
      propertyAddress,
      manualOverrides,
      supabaseUrl,
      supabaseAnonKey
    );

    // ========== FETCH TEMPLATE FROM DATABASE ==========
    let templateContext = '';
    try {
      console.log('🔍 Fetching AI structure template from database...');
      
      // Get report tier from the report if available
      const { data: reportData } = await supabase
        .from('investment_reports')
        .select('report_tier, report_scope')
        .eq('id', reportId)
        .single();
      
      const reportTier = reportData?.report_tier || 'compass';
      const reportCategory = reportData?.report_scope === 'suburb' ? 'suburb_snapshot' : 'investment';
      
      // Query report_structure_templates for the matching template
      const { data: templates, error: templateError } = await supabase
        .from('report_structure_templates')
        .select('id, name, parsed_content, report_tier, report_category')
        .eq('template_type', 'ai_structure')
        .eq('is_active', true)
        .order('priority', { ascending: false });
      
      if (templateError) {
        console.log('⚠️ Template query error:', templateError.message);
      } else if (templates && templates.length > 0) {
        let selectedTemplate = templates.find(t => 
          t.report_tier === reportTier && t.report_category === reportCategory
        ) || templates.find(t => 
          t.report_tier === reportTier && !t.report_category
        ) || templates.find(t => 
          !t.report_tier && t.report_category === reportCategory
        ) || templates.find(t => 
          !t.report_tier && !t.report_category
        ) || templates[0];
        
        if (selectedTemplate?.parsed_content) {
          templateContext = selectedTemplate.parsed_content;
          console.log(`✓ Template loaded: "${selectedTemplate.name}"`);
          console.log(`  Tier: ${selectedTemplate.report_tier || 'any'}, Category: ${selectedTemplate.report_category || 'any'}`);
        }
      }
    } catch (templateError: any) {
      console.log('⚠️ Template fetch failed (non-critical):', templateError?.message);
    }
    // ========== END TEMPLATE FETCH ==========

    // Build override summary for the AI
    const overrideSummary = buildOverrideSummary(manualOverrides, financialCalculations);
    console.log('📋 Override summary built:', overrideSummary.split('\n').length, 'lines');
    console.log('📊 Enhanced data sources loaded:', Object.keys(enhancedData).filter(k => enhancedData[k as keyof EnhancedData]).length);

    // Generate report header
    const reportHeader = `# NAIDU PROPERTY CONSULTING SERVICES

YOUR DEDICATED PROPERTY PARTNER

# Investment Report: ${propertyAddress}

---

`;

    let combinedContent = reportHeader;
    let allCitations: any[] = [];
    let generationErrors: string[] = [];

    console.log('🔄 Regenerating report in', REPORT_SECTIONS.length, 'sections with enhanced data...');

    // Track section quality for validation
    const sectionResults: Array<{ id: string; name: string; content: string; valid: boolean; score: number; attempts: number }> = [];
    
    // Update status to processing with progress tracking
    await supabase
      .from('investment_reports')
      .update({ 
        status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);
    
    for (let i = 0; i < REPORT_SECTIONS.length; i++) {
      const sectionDef = REPORT_SECTIONS[i];
      console.log(`\n📄 Regenerating section ${i + 1}/${REPORT_SECTIONS.length}: ${sectionDef.name} [FRESH GENERATION]`);
      
      // NOTE: We intentionally DO NOT pass original content to ensure fresh generation
      // The originalSectionContent is no longer used - this ensures truly new content
      console.log(`  Generating fresh content (not referencing original)`);
      
      // Pass context from previously regenerated sections for consistency only
      const previousContext = combinedContent.length > 500 ? combinedContent.substring(combinedContent.length - 2000) : '';
      
      // === SECTION GENERATION WITH VALIDATION AND RETRY ===
      let bestContent = '';
      let bestScore = 0;
      let sectionAttempts = 0;
      const maxSectionAttempts = 2;
      
      for (let attempt = 1; attempt <= maxSectionAttempts; attempt++) {
        sectionAttempts = attempt;
        
        // Pass empty string for originalSectionContent to force fresh generation
        const result = await regenerateSection(
          sectionDef,
          '', // IMPORTANT: Empty string to force fresh content generation
          overrideSummary,
          PERPLEXITY_API_KEY,
          previousContext,
          propertyAddress,
          enhancedData,
          templateContext
        );
        
        if (result.error) {
          console.error(`⚠️ Section ${sectionDef.name} attempt ${attempt} failed:`, result.error);
          if (attempt === maxSectionAttempts) {
            generationErrors.push(`${sectionDef.name}: ${result.error}`);
            // DO NOT fall back to original content - we want fresh content only
            // If generation fails, leave bestContent empty and log the error
            console.log(`  Section ${sectionDef.name} failed after ${maxSectionAttempts} attempts - no fallback used`);
          }
          continue;
        }
        
        if (result.content) {
          let cleanContent = result.content
            .replace(/^(Here|I will|Let me|Now|The following).*?:\s*/im, '')
            .replace(/^(Certainly|Sure|Of course).*?\n/im, '')
            .trim();
          
          // Validate section content
          const validation = validateSectionContent(sectionDef, cleanContent);
          console.log(`📊 Section ${sectionDef.name} validation (attempt ${attempt}):`, {
            contentLength: cleanContent.length,
            minRequired: sectionDef.minContentLength,
            score: validation.score,
            isValid: validation.isValid
          });
          
          if (validation.score > bestScore) {
            bestContent = cleanContent;
            bestScore = validation.score;
            allCitations = [...allCitations, ...result.citations];
          }
          
          if (validation.isValid) {
            console.log(`✓ Section ${sectionDef.name} passed validation with score ${validation.score}`);
            break;
          } else if (attempt < maxSectionAttempts) {
            console.log(`⚠️ Section ${sectionDef.name} below threshold, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      // === END SECTION GENERATION WITH VALIDATION ===
      
      if (bestContent) {
        combinedContent += bestContent + '\n\n---\n\n';
        sectionResults.push({
          id: sectionDef.id,
          name: sectionDef.name,
          content: bestContent,
          valid: bestScore >= 60,
          score: bestScore,
          attempts: sectionAttempts
        });
        
        // === PROGRESSIVE SAVE AFTER EACH SECTION ===
        console.log(`💾 Progressive save after section ${i + 1}...`);
        const { error: progressError } = await supabase
          .from('investment_reports')
          .update({
            report_content: combinedContent,
            updated_at: new Date().toISOString()
          })
          .eq('id', reportId);
        
        if (progressError) {
          console.error(`⚠️ Progressive save failed:`, progressError.message);
        } else {
          console.log(`✓ Progress saved: ${combinedContent.length} chars (section ${i + 1}/${REPORT_SECTIONS.length})`);
        }
      }
      
      // Small delay between sections to avoid rate limiting
      if (i < REPORT_SECTIONS.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // === FINAL VALIDATION SUMMARY ===
    const totalScore = sectionResults.reduce((sum, s) => sum + s.score, 0);
    const avgScore = Math.round(totalScore / Math.max(sectionResults.length, 1));
    
    console.log('\n📊 === REGENERATION QUALITY SUMMARY ===');
    console.log(`Total content length: ${combinedContent.length} chars`);
    console.log(`Average section score: ${avgScore}/100`);
    console.log(`Sections regenerated: ${sectionResults.length}/${REPORT_SECTIONS.length}`);
    console.log(`Enhanced data sources used: ${Object.keys(enhancedData).filter(k => enhancedData[k as keyof EnhancedData]).length}`);

    // Check if we have substantial content
    if (combinedContent.length < 5000) {
      const errorMsg = `Regeneration produced insufficient content (${combinedContent.length} chars). Errors: ${generationErrors.join('; ')}`;
      console.error('❌', errorMsg);
      throw new Error(errorMsg);
    }

    console.log(`\n✓ Enhanced multi-section regeneration complete`);
    console.log(`  Total content length: ${combinedContent.length} chars`);
    console.log(`  Total citations: ${allCitations.length}`);
    console.log(`  Sections with errors: ${generationErrors.length}`);

    // Build comprehensive sources section with enhanced data attribution
    combinedContent += '\n\n---\n\n## DATA SOURCES & REFERENCES\n\n';
    combinedContent += '### Primary Data Sources\n\n';
    combinedContent += 'This report utilises data from the following authoritative sources:\n\n';
    
    // Add explicit enhanced data source attributions
    const dataSources: string[] = [];
    
    if (enhancedData.demographics) {
      dataSources.push('**Australian Bureau of Statistics (ABS)** - Census 2021 demographic data including population, income, employment, and housing statistics');
    }
    if (enhancedData.economics) {
      dataSources.push('**Reserve Bank of Australia (RBA)** - Current cash rate, inflation data, GDP growth, and economic indicators');
    }
    if (enhancedData.seifaData) {
      dataSources.push('**SEIFA (Socio-Economic Indexes for Areas)** - ABS socioeconomic advantage/disadvantage indices');
    }
    if (enhancedData.crimeStatistics) {
      dataSources.push('**State Police/Crime Statistics Agency** - Local crime rates, safety scores, and trend analysis');
    }
    if (enhancedData.employmentData) {
      dataSources.push('**ABS Labour Force Survey** - Employment growth, industry composition, and workforce statistics');
    }
    if (enhancedData.climateData) {
      dataSources.push('**Bureau of Meteorology (BOM)** - Climate data, temperature, rainfall, and extreme weather information');
    }
    if (enhancedData.locationIntelligence) {
      dataSources.push('**Location Intelligence APIs** - Walk scores, transport accessibility, commute times, and local amenities');
    }
    if (enhancedData.schoolData) {
      dataSources.push('**ACARA/MySchool** - School performance data, NAPLAN results, and education quality metrics');
    }
    if (enhancedData.financials) {
      dataSources.push('**State Revenue Office** - Stamp duty calculations and land tax thresholds');
    }
    if (enhancedData.riskAssessment) {
      dataSources.push('**State Government Planning Data** - Flood mapping, bushfire risk zones, and environmental overlays');
    }
    if (enhancedData.domainData) {
      dataSources.push('**Domain/CoreLogic** - Property market data, median prices, and rental yields');
    }
    
    dataSources.forEach((source, index) => {
      combinedContent += `${index + 1}. ${source}\n`;
    });
    
    // Add Perplexity web search citations if available
    if (allCitations.length > 0) {
      combinedContent += '\n### Additional Research Sources\n\n';
      const uniqueCitations = [...new Set(allCitations.map((c: any) => c.url || c.title || c))];
      uniqueCitations.slice(0, 15).forEach((citation: any, index: number) => { // Limit to 15 most relevant
        combinedContent += `${index + 1}. ${citation}\n`;
      });
    }
    
    // Add data disclaimer
    combinedContent += '\n### Data Disclaimer\n\n';
    combinedContent += `*Data sources accessed: ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}. `;
    combinedContent += 'All data is sourced from reputable government and industry databases. Market conditions may change. ';
    combinedContent += 'This report should be used as a guide only and does not constitute financial advice. ';
    combinedContent += 'We recommend consulting with qualified professionals before making investment decisions.*\n';

    // Update the report in the database with enhanced data and mark as completed
    const updatePayload: any = {
      report_content: combinedContent,
      status: 'completed',
      updated_at: new Date().toISOString()
    };

    // Store enhanced data in the report (using correct column names from schema)
    if (Object.keys(enhancedData).length > 0) {
      updatePayload.demographics_data = enhancedData.demographics || null;
      updatePayload.economic_data = enhancedData.economics || null;
      updatePayload.investment_score = enhancedData.investmentScore || null;
      
      // Merge enhanced financials with any existing data
      if (enhancedData.financials) {
        updatePayload.financial_calculations = {
          ...(financialCalculations || {}),
          ...enhancedData.financials
        };
      }
    }

    const { error: updateError } = await supabase
      .from('investment_reports')
      .update(updatePayload)
      .eq('id', reportId);

    if (updateError) {
      console.error('❌ Database update error:', updateError);
      // Try to mark as failed if update fails
      await supabase
        .from('investment_reports')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', reportId);
      throw updateError;
    }

    console.log('✅ Report regeneration complete - status set to completed');

    return new Response(JSON.stringify({
      success: true,
      message: 'Report regenerated successfully with enhanced data from all API sources',
      citations: allCitations,
      contentLength: combinedContent.length,
      sectionsGenerated: REPORT_SECTIONS.length,
      sectionsWithErrors: generationErrors.length,
      enhancedDataSources: Object.keys(enhancedData).filter(k => enhancedData[k as keyof EnhancedData]).length,
      averageQualityScore: avgScore
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Regenerate report error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function buildOverrideSummary(overrides: Record<string, any>, financials?: Record<string, any>): string {
  const summaryLines: string[] = [];
  
  const fieldLabels: Record<string, string> = {
    purchasePrice: 'Purchase Price',
    weeklyRent: 'Weekly Rent',
    interestRate: 'Interest Rate',
    loanToValueRatio: 'Loan to Value Ratio (LVR)',
    capitalGrowth: 'Expected Capital Growth',
    stampDuty: 'Stamp Duty',
    councilRates: 'Council Rates',
    waterRates: 'Water Rates',
    bodyCorporateFees: 'Body Corporate/Strata Fees',
    landTax: 'Land Tax',
    buildingLandlordInsurance: 'Building & Landlord Insurance',
    propertyManagementFees: 'Property Management Fees',
    repairsMaintenance: 'Repairs & Maintenance',
    lettingFees: 'Letting Fees',
    depreciation: 'Annual Depreciation',
    taxRate: 'Marginal Tax Rate',
    occupancyRate: 'Occupancy Rate',
    loanAmount: 'Loan Amount',
    depositValue: 'Deposit Value',
    landPrice: 'Land Price',
    buildPrice: 'Build Price',
    buildType: 'Build Type',
    loanTermYears: 'Loan Term (Years)',
    isNewBuild: 'New Build Property',
    isFirstHomeBuyer: 'First Home Buyer',
    landSizeSqm: 'Land Size (sqm)',
    buildSizeSqm: 'Build Size (sqm)',
    bedrooms: 'Bedrooms',
    bathrooms: 'Bathrooms',
    carSpaces: 'Car Spaces',
    propertyType: 'Property Type',
  };

  const currencyFields = [
    'purchasePrice', 'weeklyRent', 'stampDuty', 'councilRates', 'waterRates',
    'bodyCorporateFees', 'landTax', 'buildingLandlordInsurance', 'repairsMaintenance',
    'lettingFees', 'depreciation', 'loanAmount', 'depositValue', 'landPrice', 'buildPrice'
  ];

  const percentFields = [
    'interestRate', 'loanToValueRatio', 'capitalGrowth', 'propertyManagementFees',
    'taxRate', 'occupancyRate'
  ];

  for (const [key, value] of Object.entries(overrides)) {
    // Skip internal toggle/config fields
    if (key.includes('Toggle') || key === 'cashFlowFieldToggles' || 
        key === 'includeDepreciationInCashFlow' || key === 'schedulePreset' ||
        key === 'customStageMonths' || key === 'cashFlowYearlyOverrides' ||
        key === 'depreciationSchedule' || key === 'depreciationMethod') {
      continue;
    }

    const label = fieldLabels[key] || key;
    
    if (value === null || value === undefined || value === '') continue;

    let formattedValue: string;
    if (currencyFields.includes(key)) {
      formattedValue = `$${Number(value).toLocaleString()}`;
    } else if (percentFields.includes(key)) {
      formattedValue = `${value}%`;
    } else if (typeof value === 'boolean') {
      formattedValue = value ? 'Yes' : 'No';
    } else {
      formattedValue = String(value);
    }

    summaryLines.push(`- ${label}: ${formattedValue}`);
  }

  // Add calculated metrics if available
  if (financials) {
    summaryLines.push('\n**Calculated Financial Metrics:**');
    if (financials.grossRentalYield) {
      summaryLines.push(`- Gross Rental Yield: ${financials.grossRentalYield}%`);
    }
    if (financials.netRentalYield) {
      summaryLines.push(`- Net Rental Yield: ${financials.netRentalYield}%`);
    }
    if (financials.annualCashFlow !== undefined) {
      const cashFlowStr = financials.annualCashFlow >= 0 
        ? `$${Number(financials.annualCashFlow).toLocaleString()}`
        : `($${Math.abs(Number(financials.annualCashFlow)).toLocaleString()})`;
      summaryLines.push(`- Annual Cash Flow: ${cashFlowStr}`);
    }
    if (financials.weeklyCashFlow !== undefined) {
      const weeklyCashFlowStr = financials.weeklyCashFlow >= 0 
        ? `$${Number(financials.weeklyCashFlow).toLocaleString()}`
        : `($${Math.abs(Number(financials.weeklyCashFlow)).toLocaleString()})`;
      summaryLines.push(`- Weekly Cash Flow: ${weeklyCashFlowStr}`);
    }
    if (financials.totalAnnualExpenses) {
      summaryLines.push(`- Total Annual Expenses: $${Number(financials.totalAnnualExpenses).toLocaleString()}`);
    }
    if (financials.annualRentalIncome) {
      summaryLines.push(`- Annual Rental Income: $${Number(financials.annualRentalIncome).toLocaleString()}`);
    }
  }

  return summaryLines.length > 0 
    ? summaryLines.join('\n') 
    : 'No specific overrides provided - regenerate based on original report data.';
}
