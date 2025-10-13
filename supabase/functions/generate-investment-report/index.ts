import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('Investment report function invoked with method:', req.method);
  
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting investment report generation...');
    
    // Parse request body
    let requestBody;
    try {
      requestBody = await req.json();
      console.log('Request body parsed successfully');
    } catch (parseError) {
      console.error('Error parsing request body:', parseError);
      return new Response(JSON.stringify({ 
        error: 'Invalid JSON in request body',
        success: false 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const { propertyAddress, propertyDetails } = requestBody;
    console.log('Property address:', propertyAddress);
    
    if (!propertyAddress) {
      console.error('Property address is missing');
      return new Response(JSON.stringify({ 
        error: 'Property address is required',
        success: false 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for Perplexity API key
    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    console.log('Perplexity API key configured:', !!perplexityApiKey);
    
    if (!perplexityApiKey) {
      console.error('Perplexity API key not found in environment');
      return new Response(JSON.stringify({ 
        error: 'Perplexity API key not configured. Please set PERPLEXITY_API_KEY in Supabase secrets.',
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine analysis mode and format input query
    let analysisMode = 'address'; // Default mode
    let formattedInput = propertyAddress;
    let detectedSuburb = null;
    let detectedPostcode = null;
    let detectedState = null;
    
    // Extract postcode and state from input
    const postcodeMatch = propertyAddress.match(/\b(\d{4})\b/);
    const stateMatch = propertyAddress.match(/\b(NSW|VIC|QLD|WA|SA|TAS|NT|ACT|Western Australia|New South Wales|Victoria|Queensland|South Australia|Tasmania|Northern Territory|Australian Capital Territory)\b/i);
    
    if (postcodeMatch) {
      detectedPostcode = postcodeMatch[1];
    }
    if (stateMatch) {
      const stateInput = stateMatch[1].toUpperCase();
      // Convert full state names to abbreviations
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
      detectedState = stateMap[stateInput] || stateInput;
    }
    
    // Detect analysis mode
    if (/^\d{4}$/.test(propertyAddress.trim()) || /postcode\s+\d{4}/i.test(propertyAddress)) {
      // Pure postcode mode
      analysisMode = 'postcode';
      const postcode = postcodeMatch ? postcodeMatch[1] : propertyAddress.trim();
      // Require state for postcode to avoid ambiguity
      if (!detectedState) {
        console.warn('⚠️ Postcode provided without state, defaulting to NSW');
        detectedState = 'NSW';
      }
      formattedInput = `Postcode ${postcode}, ${detectedState}, Australia`;
    } else if (propertyAddress.match(/^[A-Za-z\s]+(?:,\s*(?:\d{4}|NSW|VIC|QLD|WA|SA|TAS|NT|ACT))+/i)) {
      // Suburb mode: Suburb name followed by postcode and/or state
      // Examples: "Bondi, 2026, NSW" or "Bondi NSW 2026" or "Bondi, NSW"
      analysisMode = 'suburb';
      const parts = propertyAddress.split(',').map(p => p.trim());
      detectedSuburb = parts[0];
      
      // Require both postcode and state for suburb to avoid ambiguity
      if (!detectedPostcode || !detectedState) {
        console.warn('⚠️ Suburb provided without complete postcode/state information');
        if (!detectedState) {
          detectedState = 'NSW'; // Default fallback
        }
      }
      
      formattedInput = `${detectedSuburb}${detectedPostcode ? ', ' + detectedPostcode : ''}${detectedState ? ', ' + detectedState : ''}, Australia`;
      console.log('Suburb analysis mode detected:', { suburb: detectedSuburb, postcode: detectedPostcode, state: detectedState });
    } else if (/(western australia|wa|new south wales|nsw|victoria|vic|queensland|qld|south australia|sa|tasmania|tas|northern territory|nt|australian capital territory|act)$/i.test(propertyAddress.trim())) {
      // State-wide mode: ends with just a state name
      analysisMode = 'state';
      formattedInput = propertyAddress;
    } else {
      // Default to address mode
      analysisMode = 'address';
    }

    console.log('Analysis mode:', analysisMode);
    console.log('Formatted input:', formattedInput);
    console.log('Analysis details:', { suburb: detectedSuburb, postcode: detectedPostcode, state: detectedState });

    // Fetch enhanced data from multiple sources
    console.log('Fetching enhanced data from multiple APIs...');
    
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
    }
    
    let enhancedData: EnhancedData = {};
    
    try {
      // Use detected values from earlier, or extract from formatted input
      let postcode = detectedPostcode;
      let state = detectedState || 'NSW';
      let suburb = detectedSuburb;
      
      // If not detected earlier, try to extract from formatted input
      if (!postcode) {
        const postcodeMatch = formattedInput.match(/\b(\d{4})\b/);
        postcode = postcodeMatch ? postcodeMatch[1] : null;
      }
      if (!state || state === 'NSW') {
        const stateMatch = formattedInput.match(/\b(NSW|VIC|QLD|WA|SA|TAS|NT|ACT)\b/i);
        if (stateMatch) state = stateMatch[1].toUpperCase();
      }
      if (!suburb) {
        // Extract suburb from address (everything between street and state/postcode)
        const suburbMatch = formattedInput.match(/,\s*([A-Za-z\s]+)(?:,|\s+(?:NSW|VIC|QLD|WA|SA|TAS|NT|ACT))/i);
        suburb = suburbMatch ? suburbMatch[1].trim().toLowerCase().replace(/\s+/g, '-') : null;
      } else {
        // Convert suburb to URL-friendly format if not already
        suburb = suburb.toLowerCase().replace(/\s+/g, '-');
      }
      
      console.log('Using for API calls:', { suburb, postcode, state });

      // Fetch Domain market data
      if (suburb && state) {
        try {
          console.log('Fetching Domain market data for:', suburb, state);
          const domainResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/domain-data-service`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
            },
            body: JSON.stringify({ 
              suburb: suburb,
              state: state,
              postcode: postcode,
              propertyCategory: propertyDetails?.propertyType?.toLowerCase() === 'unit' ? 'unit' : 'house'
            })
          });
          
          if (domainResponse.ok) {
            const domainData = await domainResponse.json();
            if (domainData.success && domainData.data) {
              enhancedData = { ...enhancedData, domainData: domainData.data };
              console.log('✓ Domain market data fetched successfully');
            } else {
              console.log('⚠️ Domain data unavailable, will use estimates');
            }
          }
        } catch (error: any) {
          console.log('Domain data fetch failed:', error?.message || 'Unknown error');
        }
      }

      // Fetch risk assessment data
      if (postcode && state) {
        try {
          console.log('Fetching risk assessment for:', suburb, state, postcode);
          
          // Extract coordinates from location intelligence if available
          const latitude = enhancedData.locationIntelligence?.coordinates?.lat;
          const longitude = enhancedData.locationIntelligence?.coordinates?.lng;
          
          const riskResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/risk-assessment-service`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
            },
            body: JSON.stringify({ 
              suburb: suburb || 'unknown',
              state: state,
              postcode: postcode,
              latitude: latitude || undefined,
              longitude: longitude || undefined
            })
          });
          
          if (riskResponse.ok) {
            const riskData = await riskResponse.json();
            if (riskData.success && riskData.data) {
              enhancedData = { ...enhancedData, riskAssessment: riskData.data };
              console.log('✓ Risk assessment data fetched successfully');
              if (latitude && longitude) {
                console.log('  Using precise coordinates for flood/bushfire assessment');
              } else {
                console.log('  Using postcode-based estimates (coordinates unavailable)');
              }
            }
          }
        } catch (error: any) {
          console.log('Risk assessment fetch failed:', error?.message || 'Unknown error');
        }
      }

      // Fetch ABS demographic data
      try {
        const absResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/abs-data-service`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
          },
          body: JSON.stringify({ postcode, state })
        });
        
        if (absResponse.ok) {
          const absData = await absResponse.json();
          enhancedData = { ...enhancedData, demographics: absData.data };
          console.log('ABS data fetched successfully');
        }
      } catch (error: any) {
        console.log('ABS data fetch failed, using estimates:', error?.message || 'Unknown error');
      }

      // Fetch RBA economic data
      try {
        const rbaResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/rba-data-service`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
          }
        });
        
        if (rbaResponse.ok) {
          const rbaData = await rbaResponse.json();
          enhancedData = { ...enhancedData, economics: rbaData.data };
          console.log('RBA data fetched successfully');
        }
      } catch (error: any) {
        console.log('RBA data fetch failed, using estimates:', error?.message || 'Unknown error');
      }

      // Calculate financial projections if property details available
      if (propertyDetails?.price && propertyDetails?.weeklyRent) {
        try {
          const financialResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/financial-calculator-service`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
            },
            body: JSON.stringify({
              propertyValue: propertyDetails.price,
              deposit: propertyDetails.price * 0.2,
              interestRate: 6.5,
              loanTerm: 30,
              weeklyRent: propertyDetails.weeklyRent || 500,
              state: state,
              propertyType: propertyDetails.propertyType || 'house'
            })
          });
          
          if (financialResponse.ok) {
            const financialData = await financialResponse.json();
            enhancedData = { ...enhancedData, financials: financialData.data };
            console.log('Financial calculations completed successfully');
          }
        } catch (error: any) {
          console.log('Financial calculations failed:', error?.message || 'Unknown error');
        }
      }

      // Fetch location intelligence data
      try {
        console.log('Fetching location intelligence for:', formattedInput);
        const locationResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/location-intelligence-service`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
          },
          body: JSON.stringify({
            address: formattedInput,
            postcode: postcode,
            state: state
          })
        });
        
        if (locationResponse.ok) {
          const locationData = await locationResponse.json();
          
          if (locationData.success && locationData.data) {
            enhancedData = { ...enhancedData, locationIntelligence: locationData.data };
            console.log('✓ Location intelligence data fetched successfully');
            
            if (locationData.usingMockData) {
              console.warn('⚠️ Using mock location data:', locationData.message);
            }
          } else {
            console.warn('⚠️ Location intelligence returned no data');
          }
        } else {
          const errorText = await locationResponse.text();
          console.error('❌ Location intelligence API error:', locationResponse.status, errorText);
        }
      } catch (error: any) {
        console.error('❌ Location intelligence fetch failed:', error?.message || 'Unknown error');
      }

      // Calculate investment score
      if (propertyDetails?.price) {
        try {
          const scoreResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/investment-scoring-service`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
            },
            body: JSON.stringify({
              property: {
                price: propertyDetails.price,
                weeklyRent: propertyDetails.weeklyRent || 0,
                propertyType: propertyDetails.propertyType || 'house',
                bedrooms: propertyDetails.beds || 3,
                bathrooms: propertyDetails.baths || 2
              },
              demographics: enhancedData.demographics,
              locationIntelligence: enhancedData.locationIntelligence,
              financials: enhancedData.financials
            })
          });
          
          if (scoreResponse.ok) {
            const scoreData = await scoreResponse.json();
            enhancedData = { ...enhancedData, investmentScore: scoreData.data };
            console.log('Investment score calculated successfully');
          }
        } catch (error: any) {
          console.log('Investment score calculation failed:', error?.message || 'Unknown error');
        }
      }

      // Fetch ABS SEIFA socioeconomic data
      if (postcode) {
        try {
          console.log('Fetching SEIFA socioeconomic data for postcode:', postcode);
          const seifaResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/abs-seifa-service`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
            },
            body: JSON.stringify({ 
              postcode: postcode,
              state: state
            })
          });
          
          if (seifaResponse.ok) {
            const seifaData = await seifaResponse.json();
            if (seifaData.success && seifaData.data) {
              enhancedData = { ...enhancedData, seifaData: seifaData.data };
              console.log('✓ SEIFA socioeconomic data fetched successfully');
            }
          }
        } catch (error: any) {
          console.log('SEIFA data fetch failed:', error?.message || 'Unknown error');
        }
      }

      // Fetch crime statistics
      if (suburb && state) {
        try {
          console.log('Fetching crime statistics for:', suburb, state);
          const crimeResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/crime-statistics-service`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
            },
            body: JSON.stringify({ 
              suburb: suburb,
              state: state,
              postcode: postcode
            })
          });
          
          if (crimeResponse.ok) {
            const crimeData = await crimeResponse.json();
            if (crimeData.success && crimeData.data) {
              enhancedData = { ...enhancedData, crimeStatistics: crimeData.data };
              console.log('✓ Crime statistics fetched successfully');
            }
          }
        } catch (error: any) {
          console.log('Crime statistics fetch failed:', error?.message || 'Unknown error');
        }
      }

      // Fetch employment & job growth data
      if (state) {
        try {
          console.log('Fetching employment data for:', state);
          const employmentResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/abs-employment-service`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
            },
            body: JSON.stringify({ 
              suburb: suburb,
              state: state,
              postcode: postcode
            })
          });
          
          if (employmentResponse.ok) {
            const employmentData = await employmentResponse.json();
            if (employmentData.success && employmentData.data) {
              enhancedData = { ...enhancedData, employmentData: employmentData.data };
              console.log('✓ Employment data fetched successfully');
            }
          }
        } catch (error: any) {
          console.log('Employment data fetch failed:', error?.message || 'Unknown error');
        }
      }

      // Fetch climate data
      if (state) {
        try {
          console.log('Fetching climate data for:', state);
          const climateResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/climate-data-service`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
            },
            body: JSON.stringify({ 
              suburb: suburb,
              state: state,
              postcode: postcode
            })
          });
          
          if (climateResponse.ok) {
            const climateData = await climateResponse.json();
            if (climateData.success && climateData.data) {
              enhancedData = { ...enhancedData, climateData: climateData.data };
              console.log('✓ Climate data fetched successfully');
            }
          }
        } catch (error: any) {
          console.log('Climate data fetch failed:', error?.message || 'Unknown error');
        }
      }

      // Fetch school data
      if (suburb && state && postcode) {
        try {
          console.log('Fetching school data for:', suburb, state, postcode);
          
          // Extract coordinates from location intelligence if available
          const latitude = enhancedData.locationIntelligence?.coordinates?.lat;
          const longitude = enhancedData.locationIntelligence?.coordinates?.lng;
          
          const schoolResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/school-data-service`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
            },
            body: JSON.stringify({ 
              suburb: suburb,
              state: state,
              postcode: postcode,
              latitude: latitude || undefined,
              longitude: longitude || undefined
            })
          });
          
          if (schoolResponse.ok) {
            const schoolData = await schoolResponse.json();
            if (schoolData.success && schoolData.data) {
              enhancedData = { ...enhancedData, schoolData: schoolData.data };
              console.log('✓ School data fetched successfully');
              console.log(`  Found ${schoolData.data.summary?.totalSchools || 0} schools in ${postcode}`);
            }
          }
        } catch (error: any) {
          console.log('School data fetch failed:', error?.message || 'Unknown error');
        }
      }


    } catch (error: any) {
      console.log('Enhanced data fetch failed, proceeding with basic analysis:', error?.message || 'Unknown error');
    }

    // Create enhanced prompt with additional data
    const prompt = `You are an expert property analyst researching Australian property investment reports.
Your goal is to generate a comprehensive, professional-grade investment report for the following input:

Mode: ${analysisMode.charAt(0).toUpperCase() + analysisMode.slice(1)}

Input: ${formattedInput}
${propertyDetails ? `Additional Details: Price: $${propertyDetails.price || 'Not specified'}, Type: ${propertyDetails.propertyType || 'Not specified'}, Beds: ${propertyDetails.beds || 'Not specified'}, Baths: ${propertyDetails.baths || 'Not specified'}` : ''}

${enhancedData.demographics ? `
DEMOGRAPHIC DATA AVAILABLE:
- Population: ${enhancedData.demographics.population?.total || 'N/A'}
- Median Household Income: $${enhancedData.demographics.income?.medianHouseholdIncome || 'N/A'}
- Unemployment Rate: ${enhancedData.demographics.income?.unemploymentRate || 'N/A'}%
- Owner-Occupier Rate: ${enhancedData.demographics.housing?.ownerOccupierRate || 'N/A'}%
- Labor Force Participation: ${enhancedData.demographics.employment?.laborForceParticipation || 'N/A'}%
` : ''}

${enhancedData.economics ? `
ECONOMIC DATA AVAILABLE:
- Current Cash Rate: ${enhancedData.economics.cashRate?.current || 'N/A'}%
- Annual Inflation: ${enhancedData.economics.inflation?.annual || 'N/A'}%
- GDP Growth: ${enhancedData.economics.indicators?.gdpGrowth || 'N/A'}%
- National Unemployment: ${enhancedData.economics.indicators?.unemploymentRate || 'N/A'}%
- House Price Growth: ${enhancedData.economics.indicators?.housePriceGrowth || 'N/A'}%
` : ''}

${enhancedData.financials ? `
FINANCIAL CALCULATIONS AVAILABLE:
KEY METRICS:
- Property Value: $${enhancedData.financials.initialCosts?.propertyValue || 'N/A'}
- Deposit: $${enhancedData.financials.initialCosts?.deposit || 'N/A'}
- Loan Amount: $${enhancedData.financials.initialCosts?.loanAmount || 'N/A'}
- Stamp Duty: $${enhancedData.financials.initialCosts?.stampDuty || 'N/A'}
- Total Upfront Costs: $${enhancedData.financials.initialCosts?.totalUpfront || 'N/A'}
- Monthly Loan Payment: $${Math.round(enhancedData.financials.loanDetails?.monthlyPayment || 0)}
- Total Interest (30yr): $${Math.round(enhancedData.financials.loanDetails?.totalInterest || 0)}
- Gross Rental Yield: ${enhancedData.financials.keyMetrics?.grossRentalYield || 'N/A'}%
- Net Rental Yield: ${enhancedData.financials.keyMetrics?.netRentalYield || 'N/A'}%
- Weekly Net Cash Flow: $${enhancedData.financials.keyMetrics?.weeklyNet || 'N/A'}
- Annual Net Cash Flow: $${enhancedData.financials.keyMetrics?.annualNet || 'N/A'}
- Loan-to-Value Ratio: ${enhancedData.financials.keyMetrics?.lvr || 'N/A'}%
- Cash on Cash Return: ${enhancedData.financials.keyMetrics?.cashOnCashReturn || 'N/A'}%

ANNUAL COSTS:
- Council Rates: $${enhancedData.financials.annualCosts?.councilRates || 'N/A'}
- Water Rates: $${enhancedData.financials.annualCosts?.waterRates || 'N/A'}
- Insurance: $${enhancedData.financials.annualCosts?.landlordInsurance || 'N/A'}
- Property Management: $${enhancedData.financials.annualCosts?.propertyManagement || 'N/A'}
- Maintenance: $${enhancedData.financials.annualCosts?.maintenance || 'N/A'}
- Land Tax: $${enhancedData.financials.annualCosts?.landTax || 'N/A'}

10-YEAR PROJECTIONS (Use these exact numbers in your report):
${enhancedData.financials.projections ? `
Conservative Scenario (${enhancedData.financials.projections.conservative?.[0] ? '2% capital, 2% rent growth' : 'N/A'}):
${enhancedData.financials.projections.conservative?.slice(0, 10).map((p: any, i: number) => 
  `Year ${i + 1}: Value $${p.propertyValue?.toLocaleString() || 'N/A'}, Equity $${p.equity?.toLocaleString() || 'N/A'}, Cash Flow $${p.cashFlow?.toLocaleString() || 'N/A'}, ROI ${p.roi || 'N/A'}%`
).join('\n') || 'N/A'}

Moderate Scenario (${enhancedData.financials.projections.moderate?.[0] ? '4% capital, 3% rent growth' : 'N/A'}):
${enhancedData.financials.projections.moderate?.slice(0, 10).map((p: any, i: number) => 
  `Year ${i + 1}: Value $${p.propertyValue?.toLocaleString() || 'N/A'}, Equity $${p.equity?.toLocaleString() || 'N/A'}, Cash Flow $${p.cashFlow?.toLocaleString() || 'N/A'}, ROI ${p.roi || 'N/A'}%`
).join('\n') || 'N/A'}

Optimistic Scenario (${enhancedData.financials.projections.optimistic?.[0] ? '6% capital, 4% rent growth' : 'N/A'}):
${enhancedData.financials.projections.optimistic?.slice(0, 10).map((p: any, i: number) => 
  `Year ${i + 1}: Value $${p.propertyValue?.toLocaleString() || 'N/A'}, Equity $${p.equity?.toLocaleString() || 'N/A'}, Cash Flow $${p.cashFlow?.toLocaleString() || 'N/A'}, ROI ${p.roi || 'N/A'}%`
).join('\n') || 'N/A'}
` : 'Projection data not available'}

SENSITIVITY ANALYSIS:
${enhancedData.financials.sensitivityAnalysis ? `
Interest Rate +1% (${(parseFloat(propertyDetails?.interestRate || '6.5') + 1).toFixed(1)}%):
- Monthly Payment: $${Math.round(enhancedData.financials.sensitivityAnalysis?.interestRateUp?.monthlyPayment || 0)}
- Weekly Net: $${Math.round(enhancedData.financials.sensitivityAnalysis?.interestRateUp?.weeklyNet || 0)}
- Annual Net: $${Math.round(enhancedData.financials.sensitivityAnalysis?.interestRateUp?.annualNet || 0)}

Interest Rate -1% (${(parseFloat(propertyDetails?.interestRate || '6.5') - 1).toFixed(1)}%):
- Monthly Payment: $${Math.round(enhancedData.financials.sensitivityAnalysis?.interestRateDown?.monthlyPayment || 0)}
- Weekly Net: $${Math.round(enhancedData.financials.sensitivityAnalysis?.interestRateDown?.weeklyNet || 0)}
- Annual Net: $${Math.round(enhancedData.financials.sensitivityAnalysis?.interestRateDown?.annualNet || 0)}
` : 'Sensitivity analysis not available'}

IMPORTANT: Use these exact calculated values in your "Financial Analysis" and "10-Year Projection Scenarios" sections. Do not recalculate - these are professionally calculated projections.
` : ''}

${enhancedData.domainData ? `
DOMAIN MARKET DATA (FROM DOMAIN API - USE INSTEAD OF ESTIMATING):
- Median House Price: $${enhancedData.domainData.medianSoldPrice?.toLocaleString() || 'Data unavailable'}
- Number of Sales: ${enhancedData.domainData.numberSold || 'Data unavailable'}
- Median Weekly Rent: $${enhancedData.domainData.medianRentListingPrice || 'Data unavailable'}
- Days on Market: ${enhancedData.domainData.daysOnMarket || 'Data unavailable'} days
- Auction Clearance Rate: ${enhancedData.domainData.auctionClearanceRate || 'Data unavailable'}%
- Annual Price Growth: ${enhancedData.domainData.annualGrowth || 'Data unavailable'}%
- Rental Yield: ${enhancedData.domainData.rentalYield?.toFixed(2) || 'Data unavailable'}%
- Data Source: ${enhancedData.domainData.dataSource}
- Last Updated: ${enhancedData.domainData.lastUpdated}

CRITICAL: These are REAL MARKET VALUES from Domain API. Use them to replace any generic market data in your "Market KPIs" and "Comparable Market Evidence" sections. Do not make up comparable sales - state that specific comparable sales require further local agent research if not available.
` : ''}

${enhancedData.riskAssessment ? `
RISK ASSESSMENT DATA:
${enhancedData.riskAssessment.floodRisk ? `
Flood Risk:
- Level: ${enhancedData.riskAssessment.floodRisk.level}
- Details: ${enhancedData.riskAssessment.floodRisk.description}
- Data Source: ${enhancedData.riskAssessment.floodRisk.dataSource}
` : ''}
${enhancedData.riskAssessment.bushfireRisk ? `
Bushfire Risk:
- Level: ${enhancedData.riskAssessment.bushfireRisk.level}
- Details: ${enhancedData.riskAssessment.bushfireRisk.description}
- Data Source: ${enhancedData.riskAssessment.bushfireRisk.dataSource}
` : ''}
${enhancedData.riskAssessment.crimeStatistics ? `
Crime Statistics:
- Overall Rating: ${enhancedData.riskAssessment.crimeStatistics.overallRating}
- Comparison: ${enhancedData.riskAssessment.crimeStatistics.comparedToStateAverage}
- Data Source: ${enhancedData.riskAssessment.crimeStatistics.dataSource}
` : ''}
${enhancedData.riskAssessment.climateRisk ? `
Climate Risk:
- Overall Rating: ${enhancedData.riskAssessment.climateRisk.overallRating}
- Main Concerns: ${enhancedData.riskAssessment.climateRisk.mainConcerns.join(', ')}
- Data Source: ${enhancedData.riskAssessment.climateRisk.dataSource}
` : ''}
` : ''}

${enhancedData.locationIntelligence ? `
LOCATION INTELLIGENCE AVAILABLE (Use these specific details in your report):
WALKABILITY & ACCESS:
- Walk Score: ${enhancedData.locationIntelligence.walkScore || 'N/A'}/100
- CBD Commute: ${enhancedData.locationIntelligence.commute?.durationMinutes || 'N/A'} minutes via ${enhancedData.locationIntelligence.commute?.mode || 'transit'} (${enhancedData.locationIntelligence.commute?.distanceKm || 'N/A'}km)

PUBLIC TRANSPORT ${enhancedData.locationIntelligence.transport?.qualityScore ? `(Quality Score: ${enhancedData.locationIntelligence.transport.qualityScore}/100)` : ''}:
${enhancedData.locationIntelligence.transport?.qualityScore ? `
${enhancedData.locationIntelligence.transport?.summary || ''}

TRANSPORT DETAILS:
- Nearest Stop: ${enhancedData.locationIntelligence.transport?.nearestStop || 'N/A'} (${enhancedData.locationIntelligence.transport?.distanceToStop || 'N/A'}m away)
- Stops Within 1km: ${enhancedData.locationIntelligence.transport?.stopsWithin1km || 'N/A'}
- Transport Types Available: ${enhancedData.locationIntelligence.transport?.transportTypes?.join(', ') || 'N/A'}
- Service Frequency:
  Peak Hour: ${enhancedData.locationIntelligence.transport?.serviceFrequency?.peak || 'N/A'} services/hour
  Off-Peak: ${enhancedData.locationIntelligence.transport?.serviceFrequency?.offPeak || 'N/A'} services/hour
${enhancedData.locationIntelligence.transport?.routeCoverage?.length > 0 ? `
- Route Coverage:
${enhancedData.locationIntelligence.transport.routeCoverage.map((r: any) => `  * ${r.route} (${r.type}): ${r.frequency} services/hour`).join('\n')}` : ''}
- Accessibility: ${enhancedData.locationIntelligence.transport?.accessibility?.wheelchairAccessible ? 'Wheelchair accessible' : 'Standard access'}${enhancedData.locationIntelligence.transport?.accessibility?.lifts ? ', Lifts available' : ''}${enhancedData.locationIntelligence.transport?.accessibility?.tactilePaving ? ', Tactile paving' : ''}
${enhancedData.locationIntelligence.transport?.realTimeAlerts?.length > 0 ? `
- Current Service Alerts: ${enhancedData.locationIntelligence.transport.realTimeAlerts.join('; ')}` : ''}
${enhancedData.locationIntelligence.transport?.detailedStops?.length > 0 ? `
- Nearby Stops Detail:
${enhancedData.locationIntelligence.transport.detailedStops.slice(0, 5).map((s: any) => `  * ${s.name} (${s.type}): ${s.distance}m away, Routes: ${s.routes?.join(', ') || 'N/A'}`).join('\n')}` : ''}
` : `
- Nearest Station: ${enhancedData.locationIntelligence.transport?.nearestStation || 'N/A'}
- Distance to Station: ${enhancedData.locationIntelligence.transport?.distanceToStation || 'N/A'}km
- Stations Within 2km: ${enhancedData.locationIntelligence.transport?.stationsWithin2km || 'N/A'}
`}

EDUCATION:
- Nearest School: ${enhancedData.locationIntelligence.schools?.nearestSchool || 'N/A'} (${enhancedData.locationIntelligence.schools?.distanceToSchool || 'N/A'}km away)
- Schools Within 3km: ${enhancedData.locationIntelligence.schools?.schoolsWithin3km || 'N/A'}
${enhancedData.locationIntelligence.schools?.topSchools?.length > 0 ? `- Top Schools Nearby:
${enhancedData.locationIntelligence.schools.topSchools.map((s: any) => `  * ${s.name} - ${s.distance}km away (Rating: ${s.rating}/5)`).join('\n')}` : ''}

HEALTHCARE:
- Nearest Hospital: ${enhancedData.locationIntelligence.healthcare?.nearestHospital || 'N/A'} (${enhancedData.locationIntelligence.healthcare?.distanceToHospital || 'N/A'}km away)
- Healthcare Facilities Within 5km: ${enhancedData.locationIntelligence.healthcare?.facilitiesWithin5km || 'N/A'}

LIFESTYLE & AMENITIES:
- Shopping Centers: ${enhancedData.locationIntelligence.lifestyle?.shoppingCenters || 'N/A'}
- Nearest Shopping: ${enhancedData.locationIntelligence.lifestyle?.nearestShopping || 'N/A'}
- Parks & Recreation Areas: ${enhancedData.locationIntelligence.lifestyle?.parks || 'N/A'}
- Nearest Park: ${enhancedData.locationIntelligence.lifestyle?.nearestPark || 'N/A'}
- Restaurants & Cafes: ${enhancedData.locationIntelligence.lifestyle?.restaurants || 'N/A'}

AMENITY SCORES BY CATEGORY:
${enhancedData.locationIntelligence.amenities?.map((a: any) => 
  `- ${a.category}: ${a.count} facilities, nearest "${a.nearest}" at ${a.distance}km (Score: ${a.score}/100)`
).join('\n') || 'N/A'}

IMPORTANT: Include these specific amenity counts, distances, and scores in your "Infrastructure & Amenities" section. Use the actual facility names and distances provided.
` : ''}

${enhancedData.investmentScore ? `
INVESTMENT SCORE AVAILABLE:
- Total Score: ${enhancedData.investmentScore.totalScore || 'N/A'}/100
- Grade: ${enhancedData.investmentScore.grade || 'N/A'}
- Recommendation: ${enhancedData.investmentScore.recommendation || 'N/A'}
- Yield Score: ${enhancedData.investmentScore.yieldScore?.score || 'N/A'}/100
- Growth Score: ${enhancedData.investmentScore.growthScore?.score || 'N/A'}/100
- Location Score: ${enhancedData.investmentScore.locationScore?.score || 'N/A'}/100
` : ''}

${enhancedData.seifaData ? `
SEIFA SOCIOECONOMIC INDEX DATA (ABS):
- IRSAD Score: ${enhancedData.seifaData.irsad?.score || 'N/A'} (Decile ${enhancedData.seifaData.irsad?.decile || 'N/A'}/10)
- IRSAD Rating: ${enhancedData.seifaData.irsad?.description || 'N/A'}
- IRSD Score: ${enhancedData.seifaData.irsd?.score || 'N/A'} (Decile ${enhancedData.seifaData.irsd?.decile || 'N/A'}/10)
- IER Score: ${enhancedData.seifaData.ier?.score || 'N/A'} (Decile ${enhancedData.seifaData.ier?.decile || 'N/A'}/10)
- IEO Score: ${enhancedData.seifaData.ieo?.score || 'N/A'} (Decile ${enhancedData.seifaData.ieo?.decile || 'N/A'}/10)
- Summary: ${enhancedData.seifaData.summary || 'N/A'}
- Data Source: ${enhancedData.seifaData.dataSource || 'ABS'}
- Note: ${enhancedData.seifaData.note || 'SEIFA indexes rank areas based on socioeconomic advantage'}

IMPORTANT: Use this SEIFA data in your "Demographics & Demand Drivers" section to provide socioeconomic context. Decile 10 = most advantaged, Decile 1 = most disadvantaged.
` : ''}

${enhancedData.crimeStatistics ? `
CRIME STATISTICS DATA:
- Overall Crime Rating: ${enhancedData.crimeStatistics.overallRating || 'N/A'}
- Compared to State Average: ${enhancedData.crimeStatistics.comparedToStateAverage || 'N/A'}
- Rate per 100k people: ${enhancedData.crimeStatistics.ratePerCapita || 'N/A'}
- Period: ${enhancedData.crimeStatistics.period || 'Latest 12 months'}
- Safety Score: ${enhancedData.crimeStatistics.safetyScore || 'N/A'}/100

CRIME BREAKDOWN BY CATEGORY:
- Property Offenses: ${enhancedData.crimeStatistics.breakdown?.propertyOffenses?.count || 'N/A'} incidents (${enhancedData.crimeStatistics.breakdown?.propertyOffenses?.percentage || 'N/A'}%)
  Types: ${enhancedData.crimeStatistics.breakdown?.propertyOffenses?.types?.join(', ') || 'N/A'}
- Violent Offenses: ${enhancedData.crimeStatistics.breakdown?.violentOffenses?.count || 'N/A'} incidents (${enhancedData.crimeStatistics.breakdown?.violentOffenses?.percentage || 'N/A'}%)
  Types: ${enhancedData.crimeStatistics.breakdown?.violentOffenses?.types?.join(', ') || 'N/A'}
- Drug Offenses: ${enhancedData.crimeStatistics.breakdown?.drugOffenses?.count || 'N/A'} incidents (${enhancedData.crimeStatistics.breakdown?.drugOffenses?.percentage || 'N/A'}%)
- Public Order: ${enhancedData.crimeStatistics.breakdown?.publicOrder?.count || 'N/A'} incidents (${enhancedData.crimeStatistics.breakdown?.publicOrder?.percentage || 'N/A'}%)

CRIME TRENDS:
- Year-on-Year Change: ${enhancedData.crimeStatistics.trends?.yearOnYear || 'N/A'}
- 3-Year Trend: ${enhancedData.crimeStatistics.trends?.threeYear || 'N/A'}
- Trend Description: ${enhancedData.crimeStatistics.trends?.description || 'N/A'}

Data Source: ${enhancedData.crimeStatistics.dataSource || 'State crime statistics'}
Official Sources: ${enhancedData.crimeStatistics.officialSources?.join(', ') || 'State police service'}

IMPORTANT: Include this crime data in your "Risk Assessment" section. Provide context about safety and how it compares to state averages.
` : ''}

${enhancedData.employmentData ? `
EMPLOYMENT & JOB GROWTH DATA (ABS):
- Employment Rate: ${enhancedData.employmentData.employmentRate || 'N/A'}%
- Unemployment Rate: ${enhancedData.employmentData.unemploymentRate || 'N/A'}%
- Participation Rate: ${enhancedData.employmentData.participationRate || 'N/A'}%
- Labor Force Size: ${enhancedData.employmentData.laborForceSize?.toLocaleString() || 'N/A'}

MAJOR INDUSTRIES:
${enhancedData.employmentData.majorIndustries?.map((ind: any) => 
  `- ${ind.name}: ${ind.percentage}% of workforce (Growth: ${ind.growth})`
).join('\n') || 'N/A'}

JOB GROWTH TRENDS:
- Annual Growth: ${enhancedData.employmentData.jobGrowth?.annual || 'N/A'}
- 3-Year Growth: ${enhancedData.employmentData.jobGrowth?.threeYear || 'N/A'}
- 5-Year Growth: ${enhancedData.employmentData.jobGrowth?.fiveYear || 'N/A'}
- Description: ${enhancedData.employmentData.jobGrowth?.description || 'N/A'}

MEDIAN INCOME:
- Weekly: $${enhancedData.employmentData.medianIncome?.weekly?.toLocaleString() || 'N/A'}
- Annual: $${enhancedData.employmentData.medianIncome?.annual?.toLocaleString() || 'N/A'}
- Growth: ${enhancedData.employmentData.medianIncome?.growth || 'N/A'}

FUTURE OUTLOOK:
- Rating: ${enhancedData.employmentData.futureOutlook?.rating || 'N/A'}
- Description: ${enhancedData.employmentData.futureOutlook?.description || 'N/A'}
- Key Drivers: ${enhancedData.employmentData.futureOutlook?.keyDrivers?.join(', ') || 'N/A'}

Data Source: ${enhancedData.employmentData.dataSource || 'ABS Labour Force Survey'}

IMPORTANT: Use this employment data in your "Demographics & Demand Drivers" and "Infrastructure & Amenities" sections to show job market strength and economic prospects.
` : ''}

${enhancedData.climateData ? `
CLIMATE & ENVIRONMENTAL DATA (BoM):
- Climate Zone: ${enhancedData.climateData.climateZone || 'N/A'}
- Annual Average Temperature: ${enhancedData.climateData.temperature?.annual || 'N/A'}°C
  Summer: ${enhancedData.climateData.temperature?.summer || 'N/A'}°C, Winter: ${enhancedData.climateData.temperature?.winter || 'N/A'}°C
- Annual Rainfall: ${enhancedData.climateData.rainfall?.annual || 'N/A'}mm
  Wettest Period: ${enhancedData.climateData.rainfall?.wettest || 'N/A'}
  Driest Period: ${enhancedData.climateData.rainfall?.driest || 'N/A'}
- Humidity: ${enhancedData.climateData.humidity?.annual || 'N/A'}%
- Comfort Index: ${enhancedData.climateData.comfortIndex || 'N/A'}/100

EXTREME WEATHER RISKS:
- Heatwaves: ${enhancedData.climateData.extremeWeather?.heatwaves || 'N/A'}
- Bushfire: ${enhancedData.climateData.extremeWeather?.bushfire || 'N/A'}
- Flooding: ${enhancedData.climateData.extremeWeather?.flooding || 'N/A'}
- Storms: ${enhancedData.climateData.extremeWeather?.storms || 'N/A'}
- Cyclones: ${enhancedData.climateData.extremeWeather?.cyclones || 'N/A'}

CLIMATE PROJECTIONS:
- Temperature Trend: ${enhancedData.climateData.climateProjections?.temperature?.trend || 'N/A'}
- Rainfall Trend: ${enhancedData.climateData.climateProjections?.rainfall?.trend || 'N/A'}
- Extreme Events: ${enhancedData.climateData.climateProjections?.extremeEvents?.trend || 'N/A'}

PROPERTY IMPLICATIONS:
Construction Considerations: ${enhancedData.climateData.propertyImplications?.construction?.join(', ') || 'N/A'}
Insurance Factors: ${enhancedData.climateData.propertyImplications?.insurance?.join(', ') || 'N/A'}
Value Impacts: ${enhancedData.climateData.propertyImplications?.value?.join(', ') || 'N/A'}

Data Source: ${enhancedData.climateData.dataSource || 'Bureau of Meteorology'}
Note: ${enhancedData.climateData.note || 'Climate data based on historical patterns'}

IMPORTANT: Include climate data in your "Risk Assessment" section and discuss long-term climate impacts on property value and insurance costs.
` : ''}

${enhancedData.schoolData ? `
SCHOOL & EDUCATION DATA AVAILABLE:
SUMMARY:
- Total Schools in Postcode: ${enhancedData.schoolData.summary?.totalSchools || 'N/A'}
- Primary Schools: ${enhancedData.schoolData.summary?.primarySchools || 'N/A'}
- Secondary Schools: ${enhancedData.schoolData.summary?.secondarySchools || 'N/A'}
- Average ICSEA Score: ${enhancedData.schoolData.summary?.averageICSEA || 'N/A'} (National average: 1000)
- Average School Rating: ${enhancedData.schoolData.summary?.averageRating || 'N/A'}/5 stars
- Education Quality: ${enhancedData.schoolData.summary?.educationQuality || 'N/A'}

${enhancedData.schoolData.summary?.nearestSchool ? `
NEAREST SCHOOL:
- Name: ${enhancedData.schoolData.summary.nearestSchool.name}
- Distance: ${enhancedData.schoolData.summary.nearestSchool.distance}km
- Level: ${enhancedData.schoolData.summary.nearestSchool.level}
- Rating: ${enhancedData.schoolData.summary.nearestSchool.rating}/5 stars
` : ''}

${enhancedData.schoolData.summary?.topRatedSchools?.length > 0 ? `
TOP-RATED SCHOOLS IN AREA:
${enhancedData.schoolData.summary.topRatedSchools.map((school: any) => 
  `- ${school.name} (${school.level}, ${school.type})
  Rating: ${school.rating}/5 stars, ICSEA: ${school.icsea || 'N/A'}`
).join('\n')}
` : ''}

${enhancedData.schoolData.schools?.length > 0 ? `
DETAILED SCHOOL INFORMATION:
${enhancedData.schoolData.schools.slice(0, 10).map((school: any) => 
  `- ${school.name} (${school.level}, ${school.type})
  ICSEA: ${school.icsea || 'N/A'}, Rating: ${school.rating || 'N/A'}/5
  ${school.naplan?.overall ? `NAPLAN Average: ${school.naplan.overall}` : ''}
  ${school.atar?.median ? `ATAR Median: ${school.atar.median}` : ''}
  ${school.studentCount ? `Students: ${school.studentCount}` : ''}`
).join('\n\n')}
` : ''}

Data Source: ${enhancedData.schoolData.dataSource || 'ACARA MySchool'}
Note: ${enhancedData.schoolData.note || 'ICSEA measures socio-educational advantage (Australian average = 1000)'}

IMPORTANT: Include this education data in a dedicated "Schools & Education" section or incorporate it into "Demographics & Lifestyle". This is CRITICAL for families and significantly impacts property demand and capital growth. Mention specific school names, ratings, and ICSEA scores.
` : ''}

---

Instructions

1. Use only Australian data and sources.

2. Provide clear sections with proper headings and bullet points.

3. Cite the source name and date directly in the text for every statistic or metric.

4. If a metric cannot be found because it is paywalled or proprietary (e.g., CoreLogic), clearly state that and explain why.

5. Avoid filler text. Provide specific numbers, facts, and actionable insights.

6. The output should be plain text, not JSON or code.

---

Sections to Include

1. Location Overview

Suburb/area profile and character.

Distance to nearest major city or CBD.

Key lifestyle attributes (parks, schools, shopping hubs, etc.).

Identify the SA2, SA3, SA4, and LGA that this address/postcode/state belongs to.

---

2. Market KPIs

Provide the latest data for the relevant geography:

Median house price and median unit price (if available).

Historical price growth: 1-year, 3-year, 5-year, and 10-year.

Median weekly rent (house and unit separately).

Historical rent growth: 1-year, 3-year, and 5-year.

Gross rental yield and net rental yield (explain how net yield was calculated).

Vacancy rate (suburb or SA2 level).

Days on market (DOM).

Annual sales volume or stock on market.

If data is missing or only available via paid sources, state clearly that it is unavailable and why.

---

3. Demographics & Demand Drivers

Total population and population growth trends (past 5 years).

Median household income and key occupation breakdown.

Predominant age group and household type (e.g., families, singles).

Owner-occupier vs renter ratio (if available).

Employment/unemployment rate and main local industries.

---

4. Infrastructure & Amenities

Major transport hubs (train stations, highways, airports).

Planned infrastructure projects that could influence capital growth.

Health, education, and lifestyle facilities (schools, hospitals, parks, recreation).

---

5. Property-Level Information (MODE-SPECIFIC)

${analysisMode === 'address' ? `
[ADDRESS MODE]
- Property type (house, townhouse, unit, etc.)
- Number of bedrooms, bathrooms, parking spaces
- Land size and building size
- Year built and overall condition
- Asking price (if listed)
- Comparison to suburb median
` : ''}

${analysisMode === 'suburb' ? `
[SUBURB MODE]
Focus on suburb-level analysis:
- Suburb boundaries and key features
- Dominant property types in the suburb
- Median prices by property type (houses vs units)
- Typical property characteristics (common bed/bath configurations)
- Best streets/pockets within the suburb
- Suburb-specific market dynamics
- Price distribution across different areas of the suburb
- Postcode: ${detectedPostcode || 'Not specified'}
- State: ${detectedState || 'Not specified'}
- Include analysis of multiple areas within the suburb if applicable
` : ''}

${analysisMode === 'postcode' ? `
[POSTCODE MODE]
Focus on postcode-wide analysis:
- Postcode: ${detectedPostcode || 'Not specified'}
- State: ${detectedState || 'Not specified'}
- All suburbs within this postcode
- Price variations across different suburbs in the postcode
- Dominant property types across the postcode
- Best performing suburbs within the postcode
- Comparative analysis of different areas
- Infrastructure that serves the entire postcode
` : ''}

${analysisMode === 'state' ? `
[STATE-WIDE MODE]
Focus on state-level analysis:
- State: ${detectedState || formattedInput}
- Major metro markets performance
- Regional market trends
- State-wide economic indicators
- Government policies affecting property
- Population distribution and migration patterns
- Top performing regions/LGAs
- State infrastructure projects
` : ''}

---

6. Costs for Investors

Include calculations relevant to the specific state:

Stamp duty for this purchase price.

Land tax rules and thresholds.

Typical council rates and how you estimated them.

Property management fee assumption (% of rent).

Typical strata fees (if applicable).

Insurance and maintenance estimates.

---

7. Risk Assessment

Provide a risk profile for the area:

Flood risk (referencing official state data).

Bushfire risk (official state data).

Crime index (SA2 or LGA level if available).

Market volatility (historical price fluctuations).

---

8. Comparable Market Evidence

List 3–5 recent comparable sales within a 1.5 km radius over the past 6–12 months. Include:

Address

Sale price

Date of sale

Beds/baths/parking

Distance from subject property

List 3 comparable rental properties with weekly rent, location, and property type.

If comparable data is only available through paid sources, explain that clearly.

---

9. Financial Analysis

Gross yield and net yield calculations.

Year-one cashflow estimate for both P&I and Interest-Only loans at the following assumptions:

Deposit: 20%

Interest rate: 6.5%

Property management fee: 7% of rent

Maintenance: 1% of property value annually

Council rates and insurance: include estimated figures

Sensitivity analysis: show effect of interest rates at +1% and -1%.

---

10. 10-Year Projection Scenarios

Model three scenarios:

Conservative: 2% annual price growth, 2% rent growth.

Base: 4% annual price growth, 3% rent growth.

Optimistic: 6% annual price growth, 4% rent growth.

Show:

Property value at year 10.

Total rent received over 10 years.

Cumulative cashflow over 10 years.

Final Loan-to-Value Ratio (LVR).

---

11. Overall Investment Score

Create a total score out of 100 with these weightings:

Market momentum (25%)

Yield and cashflow (30%)

Risk factors (20%)

Demand drivers (15%)

Supply factors (10%)

Explain each component and provide a final recommendation: Buy, Hold, Sell, or Wait/Negotiate.

---

12. Key Opportunities & Risks

Summarize the 3–5 biggest opportunities and risks:

Example opportunity: new transport infrastructure boosting capital growth.

Example risk: property priced significantly above suburb median.

---

13. Sources & Data Transparency

For each key metric, include:

Source name

URL (if available)

"As of" date

If data was estimated or inferred, explain the methodology.

---

Output Style

Use clear section headings.

Write in professional, concise, and data-driven language.

Use bullet points or tables for clarity wherever appropriate.

Keep everything plain text — no code blocks or JSON.

---

Final Output

Produce a full investment report following the structure above, including detailed numbers, calculations, and references to primary Australian data sources such as ABS, RBA, state revenue offices, data.gov.au, SQM Research, and official hazard maps.`;

    console.log('Calling Perplexity API with sonar model...');
    console.log('Prompt length:', prompt.length);

    let response;
    try {
      // Using the correct Perplexity API configuration based on their docs
      response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${perplexityApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar-reasoning', // Deep research model for comprehensive analysis
          messages: [
            {
              role: 'system',
              content: 'You are an expert Australian property investment analyst with deep knowledge of real estate markets, financial analysis, and investment projections. Your role is to provide comprehensive, data-driven property investment analysis that covers all aspects of property investment decision-making. You have access to current market data and can provide specific calculations for rental yields, capital growth projections, and investment returns. Always include specific numbers, percentages, and dollar amounts in your analysis. Focus on practical, actionable insights that help investors make informed decisions about property purchases. Use current Australian market conditions and regulations in your analysis.'
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        }),
      });
    } catch (fetchError: any) {
      console.error('Network error calling Perplexity API:', fetchError);
      return new Response(JSON.stringify({ 
        error: `Failed to connect to Perplexity API: ${fetchError?.message || 'Network error'}`,
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Perplexity API response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error response:', errorText);
      
      let errorMessage;
      if (response.status === 401) {
        errorMessage = 'Invalid Perplexity API key. Please check your PERPLEXITY_API_KEY secret.';
      } else if (response.status === 429) {
        errorMessage = 'Perplexity API rate limit exceeded. Please try again later.';
      } else if (response.status === 400) {
        errorMessage = `Bad request to Perplexity API: ${errorText}`;
      } else {
        errorMessage = `Perplexity API error (${response.status}): ${errorText}`;
      }
      
      return new Response(JSON.stringify({ 
        error: errorMessage,
        success: false 
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let data;
    try {
      data = await response.json();
      console.log('Response parsed successfully');
      console.log('Response structure keys:', Object.keys(data));
    } catch (jsonError) {
      console.error('Error parsing JSON response:', jsonError);
      return new Response(JSON.stringify({ 
        error: 'Invalid JSON response from Perplexity API',
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Unexpected API response structure:', data);
      return new Response(JSON.stringify({ 
        error: 'Invalid response structure from Perplexity API',
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    let reportContent = data.choices[0].message.content;
    
    if (!reportContent) {
      console.error('No content in API response');
      return new Response(JSON.stringify({ 
        error: 'No report content received from Perplexity API',
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Filter out reasoning sections from Sonar Deep Research model
    // Remove content between reasoning markers and thinking blocks
    reportContent = reportContent
      .replace(/```thinking[\s\S]*?```/gi, '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/\*\*Reasoning:\*\*[\s\S]*?(?=\*\*|$)/gi, '')
      .replace(/\*\*Analysis:\*\*[\s\S]*?(?=\*\*|$)/gi, '')
      .replace(/\*\*Thought process:\*\*[\s\S]*?(?=\*\*|$)/gi, '')
      .replace(/Let me analyze[\s\S]*?(?=\n\n|\*\*|$)/gi, '')
      .replace(/I need to[\s\S]*?(?=\n\n|\*\*|$)/gi, '')
      .replace(/First, I'll[\s\S]*?(?=\n\n|\*\*|$)/gi, '')
      .replace(/To provide[\s\S]*?(?=\n\n|\*\*|$)/gi, '')
      .trim();

    // Extract citations and sources from the response
    const citations = data.citations || [];
    const searchResults = data.search_results || [];
    
    // Format sources section
    let sourcesContent = '';
    if (citations.length > 0 || searchResults.length > 0) {
      sourcesContent = '\n\n## SOURCES & REFERENCES\n\n';
      
      if (citations.length > 0) {
        sourcesContent += '### Citations:\n';
        citations.forEach((citation: any, index: number) => {
          sourcesContent += `${index + 1}. ${citation.url || citation.title || citation}\n`;
        });
        sourcesContent += '\n';
      }
      
      if (searchResults.length > 0) {
        sourcesContent += '### Additional Sources:\n';
        searchResults.forEach((result: any, index: number) => {
          const title = result.title || 'Source';
          const url = result.url || '';
          sourcesContent += `${index + 1}. [${title}](${url})\n`;
        });
      }
    }

    console.log('Report generated successfully, content length:', reportContent.length);
    console.log('Citations found:', citations.length);
    console.log('Search results found:', searchResults.length);

    // Add contact details and professional disclaimer at the end of the report
    const contactAndDisclaimer = `\n\n---

## 📞 CONTACT US

**Let's discuss your next investment opportunity**

| | |
|---|---|
| 🌐 **Website** | [npcservices.com.au](https://npcservices.com.au) |
| 📧 **Email** | [admin@npcservices.com.au](mailto:admin@npcservices.com.au) |
| 📱 **Phone** | [0433 005 110](tel:+61433005110) |

---

## ⚖️ PROFESSIONAL DISCLAIMER

As a Professional Property Consultant & Buyers Agent, we provide information and advice based on our expertise and experience in the real estate market. Please be aware that the advice and insights offered are for general informational purposes only and should not be considered financial advice.

While we strive to ensure the accuracy and relevance of the information provided, real estate markets are dynamic and subject to change and cannot guarantee the future performance or outcomes of any property investment.

It is important to understand that real estate investments carry risks, including market fluctuations, changes in property values, and potential financial losses.

Our services include assisting you in identifying and evaluating potential opportunities, negotiating purchase terms, and navigating the transaction process.

Any decisions to purchase, sell, or invest in real estate should be made after careful consideration and consultation with appropriate financial, legal, and tax advisors.

By engaging our services, you acknowledge that you have read and understood this disclaimer and agree to take full responsibility for your property-related decisions.

Always conduct your own research and due diligence to ensure that any property transaction aligns with your financial objectives and risk profile.`;

    // Append contact details and disclaimer to report content
    reportContent = reportContent + contactAndDisclaimer;

    // Database save will be handled client-side
    console.log('Report generation complete, returning response');

    // Return successful response
    const responseData = { 
      reportContent,
      sourcesContent,
      propertyAddress,
      success: true,
      enhancedData: {
        locationIntelligence: enhancedData.locationIntelligence,
        investmentScore: enhancedData.investmentScore,
        financials: enhancedData.financials,
        demographics: enhancedData.demographics,
        economics: enhancedData.economics,
        schoolData: enhancedData.schoolData
      }
    };

    console.log('Returning successful response');
    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error: any) {
    console.error('Error in generate-investment-report function:', error);
    console.error('Error stack:', error?.stack);
    
    const errorResponse = { 
      error: error?.message || 'An unexpected error occurred',
      success: false,
      timestamp: new Date().toISOString()
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});