import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to update report status to failed
async function markReportFailed(reportId: string | null, errorMessage: string): Promise<void> {
  if (!reportId) return;
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (supabaseUrl && supabaseKey) {
      const client = createClient(supabaseUrl, supabaseKey);
      await client
        .from('investment_reports')
        .update({ 
          status: 'failed',
          error_message: errorMessage,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);
      
      // Also update auto_report_generation_log if this was an auto-generated report
      await client
        .from('auto_report_generation_log')
        .update({
          status: 'failed',
          error_message: `Report generation failed: ${errorMessage}`,
          completed_at: new Date().toISOString()
        })
        .eq('report_id', reportId);
      
      console.log(`✓ Marked report ${reportId} as failed: ${errorMessage}`);
    }
  } catch (updateError) {
    console.error('Error updating report status to failed:', updateError);
  }
}

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
    
    const { reportId, propertyAddress, propertyDetails } = requestBody;
    const reportScope = propertyDetails?.queryType || 'address'; // Get scope from request
    console.log('Report ID:', reportId);
    console.log('Property address:', propertyAddress);
    console.log('Report scope:', reportScope);
    
    if (!propertyAddress) {
      console.error('Property address is missing');
      await markReportFailed(reportId, 'Property address is required');
      return new Response(JSON.stringify({ 
        error: 'Property address is required',
        success: false 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client for database updates
    let supabaseClient = null;
    let existingManualOverrides = null;
    
    if (reportId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && supabaseKey) {
        supabaseClient = createClient(supabaseUrl, supabaseKey);
        
        // Fetch existing manual overrides before regeneration
        const { data: existingReport } = await supabaseClient
          .from('investment_reports')
          .select('manual_overrides')
          .eq('id', reportId)
          .single();
        
        if (existingReport?.manual_overrides) {
          existingManualOverrides = existingReport.manual_overrides;
          console.log('📝 Fetched existing manual overrides:', Object.keys(existingManualOverrides).length, 'fields');
        }
        
        // Update status to processing
        await supabaseClient
          .from('investment_reports')
          .update({ status: 'processing' })
          .eq('id', reportId);
        
        console.log('Updated report status to processing');
      }
    }

    // Check for Perplexity API key
    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    console.log('Perplexity API key configured:', !!perplexityApiKey);
    
    if (!perplexityApiKey) {
      console.error('Perplexity API key not found in environment');
      const errorMsg = 'Perplexity API key not configured. Please set PERPLEXITY_API_KEY in Supabase secrets.';
      await markReportFailed(reportId, errorMsg);
      return new Response(JSON.stringify({ 
        error: errorMsg,
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
        console.log('Fetching ABS data for postcode:', postcode, 'state:', state);
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
          console.log('✓ ABS response received:', { success: absData.success, hasData: !!absData.data });
          if (absData.success && absData.data) {
            enhancedData = { ...enhancedData, demographics: absData.data };
            console.log('✓ ABS demographics data integrated successfully');
          } else {
            console.warn('⚠️ ABS response missing expected data structure');
          }
        } else {
          const errorText = await absResponse.text();
          console.error('❌ ABS service returned non-OK status:', absResponse.status, errorText);
        }
      } catch (error: any) {
        console.error('❌ ABS data fetch failed:', error?.message || 'Unknown error');
        console.error('Stack trace:', error?.stack);
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

      // Fetch rent from cache if not provided
      let weeklyRent = propertyDetails?.weeklyRent;
      let rentSource = 'user_input';
      
      if (!weeklyRent && suburb && state) {
        try {
          console.log('📊 Weekly rent not provided, fetching from SQM Research cache...');
          const rentResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sqm-rent-service`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
            },
            body: JSON.stringify({
              suburb: suburb.replace(/-/g, ' '),
              state: state,
              postcode: postcode || '',
              propertyType: propertyDetails?.propertyType?.toLowerCase() || 'house',
              bedrooms: propertyDetails?.bedrooms || 3
            })
          });
          
          if (rentResponse.ok) {
            const rentData = await rentResponse.json();
            if (rentData.success && rentData.data?.medianWeeklyRent) {
              weeklyRent = rentData.data.medianWeeklyRent;
              rentSource = rentData.source === 'cache' ? 'sqm_cache' : 'sqm_scraped';
              console.log(`✓ Median weekly rent from ${rentSource}: $${weeklyRent}`);
            } else {
              console.log('⚠️ No rent data available from SQM Research');
            }
          }
        } catch (error: any) {
          console.log('⚠️ SQM rent lookup failed:', error?.message || 'Unknown error');
        }
      }
      
      // Calculate financial projections if property details available
      if (propertyDetails?.price && weeklyRent) {
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
              weeklyRent: weeklyRent,
              weeklyRentSource: rentSource,
              state: state,
              propertyType: propertyDetails.propertyType || 'house'
            })
          });
          
          if (financialResponse.ok) {
            const financialData = await financialResponse.json();
            
            // Merge manual overrides with fresh financial calculations
            if (existingManualOverrides && Object.keys(existingManualOverrides).length > 0) {
              console.log('🔀 Merging manual overrides with fresh financial calculations');
              
              // Create a deep copy of financial data
              const mergedFinancials = JSON.parse(JSON.stringify(financialData.data));
              
              // Map flat override keys to nested structure
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
                'solicitorFees': 'initialCosts.legalFees',
                'repairsMaintenance': 'annualCosts.maintenance',
                'lettingFees': 'annualCosts.lettingFees',
                'capitalGrowth': 'assumptions.capitalGrowth',
                'buildPrice': 'initialCosts.buildPrice',
                'landPrice': 'initialCosts.landPrice',
                'landSizeSqm': 'propertySpecs.landSizeSqm',
                'buildSizeSqm': 'propertySpecs.buildSizeSqm'
              };
              
              // Apply overrides to the nested structure
              for (const [flatKey, overrideValue] of Object.entries(existingManualOverrides)) {
                const nestedPath = overrideMapping[flatKey];
                if (nestedPath) {
                  const keys = nestedPath.split('.');
                  let current = mergedFinancials;
                  
                  // Navigate to the nested location
                  for (let i = 0; i < keys.length - 1; i++) {
                    if (!current[keys[i]]) {
                      current[keys[i]] = {};
                    }
                    current = current[keys[i]];
                  }
                  
                  // Set the overridden value
                  current[keys[keys.length - 1]] = overrideValue;
                  console.log(`  ✓ Override applied: ${flatKey} → ${nestedPath} = ${overrideValue}`);
                }
              }
              
              enhancedData = { 
                ...enhancedData, 
                financials: mergedFinancials
              };
              console.log('✓ Manual overrides applied to financial calculations');
            } else {
              enhancedData = { ...enhancedData, financials: financialData.data };
            }
            
            console.log('Financial calculations completed successfully');
            
            // Run validation on financial calculations
            try {
              const validationResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/financial-validation-service`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
                },
                body: JSON.stringify({
                  propertyValue: propertyDetails.price,
                  weeklyRent: propertyDetails.weeklyRent,
                  stampDuty: financialData.data.initialCosts.stampDuty,
                  councilRates: financialData.data.annualCosts.councilRates,
                  annualCosts: financialData.data.annualCosts,
                  state: state,
                  propertyType: propertyDetails.propertyType || 'house'
                })
              });
              
              if (validationResponse.ok) {
                const validationData = await validationResponse.json();
                enhancedData = { ...enhancedData, validation: validationData.data };
                console.log('✓ Financial validation completed:', {
                  qualityScore: validationData.data.qualityScore,
                  flagCount: validationData.data.flags.length
                });
                
                // Log any critical validation errors
                const criticalFlags = validationData.data.flags.filter((f: any) => f.severity === 'critical');
                if (criticalFlags.length > 0) {
                  console.warn('⚠️ CRITICAL validation issues detected:', criticalFlags);
                }
              }
            } catch (validationError: any) {
              console.warn('⚠️ Validation service failed (non-blocking):', validationError?.message);
            }
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
          console.log('Fetching crime statistics for suburb:', suburb, 'state:', state, 'postcode:', postcode);
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
            console.log('✓ Crime response received:', { success: crimeData.success, hasData: !!crimeData.data });
            if (crimeData.success && crimeData.data) {
              enhancedData = { ...enhancedData, crimeStatistics: crimeData.data };
              console.log('✓ Crime statistics integrated successfully');
            } else {
              console.warn('⚠️ Crime response missing expected data structure');
            }
          } else {
            const errorText = await crimeResponse.text();
            console.error('❌ Crime service returned non-OK status:', crimeResponse.status, errorText);
          }
        } catch (error: any) {
          console.error('❌ Crime statistics fetch failed:', error?.message || 'Unknown error');
          console.error('Stack trace:', error?.stack);
        }
      } else {
        console.warn('⚠️ Skipping crime statistics - missing suburb or state');
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

    // Build year context string for suburb analysis
    let yearContextString = '';
    if (propertyDetails?.dataYearType === 'single' && propertyDetails?.dataYear) {
      yearContextString = `\n\n**CRITICAL DATA YEAR REQUIREMENT:**
Focus the analysis on data from the year ${propertyDetails.dataYear}. All statistics, market data, demographics, and trends should be sourced from or reference ${propertyDetails.dataYear} data where available. Clearly indicate when data from ${propertyDetails.dataYear} is used vs. when more recent or older data is substituted.`;
      console.log('📅 Single year context:', propertyDetails.dataYear);
    } else if (propertyDetails?.dataYearType === 'range' && propertyDetails?.dataYearStart && propertyDetails?.dataYearEnd) {
      yearContextString = `\n\n**CRITICAL DATA YEAR RANGE REQUIREMENT:**
Analyze trends and data spanning from ${propertyDetails.dataYearStart} to ${propertyDetails.dataYearEnd}. 
- Include year-over-year comparisons across this period
- Show growth/decline trends from ${propertyDetails.dataYearStart} to ${propertyDetails.dataYearEnd}
- Compare early period (${propertyDetails.dataYearStart}-${Math.floor((propertyDetails.dataYearStart + propertyDetails.dataYearEnd) / 2)}) vs. recent period (${Math.ceil((propertyDetails.dataYearStart + propertyDetails.dataYearEnd) / 2)}-${propertyDetails.dataYearEnd})
- Clearly label data sources with their respective years
- Highlight significant changes or inflection points within the ${propertyDetails.dataYearEnd - propertyDetails.dataYearStart + 1}-year period`;
      console.log('📅 Year range context:', propertyDetails.dataYearStart, '-', propertyDetails.dataYearEnd);
    }

    // Create enhanced prompt with additional data
    // Suburb-specific prompt for suburb investment analysis
    const suburbPrompt = `You are an expert Australian suburb analyst creating comprehensive suburb investment snapshots.
Your goal is to generate a professional suburb-level investment analysis report.

**SUBURB TO ANALYZE: ${formattedInput}**
${yearContextString}

${propertyDetails ? `Context: ${propertyDetails.propertyType || 'Property'} analysis in this suburb${propertyDetails.landSizeSqm ? `, typical land size: ${propertyDetails.landSizeSqm}m²` : ''}${propertyDetails.buildSizeSqm ? `, typical build size: ${propertyDetails.buildSizeSqm}m²` : ''}` : ''}

**CRITICAL - MANDATORY SUBURB REPORT STRUCTURE:**

Follow this exact structure for suburb-level analysis:

# REPORT TITLE
Suburb Investment Snapshot: [SUBURB NAME], [STATE]

# 1. Location & Profile
- Suburb overview and character
- Distance to CBD/major employment centers (e.g., "12km north of Sydney CBD")
- Statistical areas: SA2, SA3, SA4, LGA
- Suburb type (beachside, urban, suburban, regional)
- Lifestyle description
- Key attractions and features
- Development status and trends

# 2. Property Market Data
**Current Market Snapshot (use most recent data):**

| Property Type | Median Price | Median Rent (Weekly) | Gross Yield | Annual Growth |
|--------------|--------------|---------------------|-------------|---------------|
| Houses | $XXX,XXX | $XXX | X.XX% | +/-X.X% |
| Units | $XXX,XXX | $XXX | X.XX% | +/-X.X% |

**Market Activity:**
| Metric | Houses | Units |
|--------|---------|-------|
| Sales Volume (12 months) | XX | XX |
| Days on Market | XX | XX |
| Stock on Market | XX | XX |
| Vacancy Rate | X.X% | X.X% |

# 3. Market Performance
**5-Year Price Growth:**
| Property Type | 1-Year | 3-Year | 5-Year | Peak Growth Period |
|--------------|--------|--------|--------|-------------------|
| Houses | +/-X.X% | +/-XX.X% | +/-XX.X% | [period] |
| Units | +/-X.X% | +/-XX.X% | +/-XX.X% | [period] |

**Rental Growth History:**
| Property Type | 1-Year | 3-Year | 5-Year |
|--------------|--------|--------|--------|
| Houses | +/-X.X% | +/-XX.X% | +/-XX.X% |
| Units | +/-X.X% | +/-XX.X% | +/-XX.X% |

[Include market cycle analysis and trends]

# 4. Demographics
**Population Statistics:**
| Metric | Value | State Average | National Average |
|--------|-------|---------------|------------------|
| Total Population | XX,XXX | - | - |
| Population Density | XX per km² | XX per km² | XX per km² |
| Population Growth (5yr) | +/-X.X% | +/-X.X% | +/-X.X% |
| Median Age | XX years | XX years | XX years |
| Families with Children | XX.X% | XX.X% | XX.X% |
| Couples without Children | XX.X% | XX.X% | XX.X% |
| Single Occupants | XX.X% | XX.X% | XX.X% |

**Income & Employment:**
| Metric | Value | State Average |
|--------|-------|---------------|
| Median Household Income | $X,XXX/week | $X,XXX/week |
| Median Annual Income | $XX,XXX | $XX,XXX |
| Employment Rate | XX.X% | XX.X% |
| Unemployment Rate | X.X% | X.X% |
| SEIFA Index (IRSAD) | XXX (Decile X) | - |

**Top Industries:**
1. [Industry] - XX.X%
2. [Industry] - XX.X%
3. [Industry] - XX.X%
4. [Industry] - XX.X%
5. [Industry] - XX.X%

# 5. Infrastructure & Amenities
**Education:**
| School Name | Type | Level | Distance | Rating/ICSEA |
|------------|------|-------|----------|--------------|

**Transport:**
| Mode | Details | Access Score |
|------|---------|--------------|
| Train Stations | [names] (XXkm) | XX/100 |
| Bus Routes | XX routes | XX/100 |
| Major Roads | [list] | - |
| CBD Commute | XX mins by [mode] | - |
| Walk Score | XX/100 | - |

**Shopping & Services:**
| Facility Type | Nearest | Distance | Details |
|--------------|---------|----------|---------|
| Shopping Center | [name] | XXkm | [description] |
| Supermarkets | [names] | XXkm | - |
| Cafes/Restaurants | XX+ venues | within XXkm | - |

**Healthcare:**
| Facility | Name | Distance |
|----------|------|----------|
| Hospital | [name] | XXkm |
| Medical Centers | XX facilities | within XXkm |

**Recreation:**
| Facility Type | Count | Details |
|--------------|-------|---------|
| Parks | XX | [names] |
| Beaches | XX | [names] |
| Sports Facilities | XX | [types] |

# 6. Investment Insights
**Market Strengths:**
- [Key advantages for investors]
- [Growth drivers]
- [Demand factors]

**Considerations:**
- [Risks or challenges]
- [Market competition]
- [Supply dynamics]

**Buyer Profile:**
[Who typically buys here and why]

**Rental Demand:**
[Who rents here, typical lease terms, vacancy patterns]

**Capital Growth Outlook:**
[Short and medium term price expectations with reasoning]

**Rental Yield Outlook:**
[Income potential and rental growth expectations]

# 7. Environmental & Risk Factors
| Risk Type | Assessment | Details |
|-----------|-----------|---------|
| Flood Risk | [Low/Medium/High] | [explanation] |
| Bushfire Risk | [Low/Medium/High] | [explanation] |
| Coastal Erosion | [Low/Medium/High] | [explanation if applicable] |
| Climate Risks | [assessment] | [heatwaves, storms, etc.] |

# 8. Crime & Safety
| Metric | Value | Comparison to State |
|--------|-------|-------------------|
| Crime Rate per 100k | XXX | [above/below average] |
| Safety Score | XX/100 | - |
| Trend (3-year) | [Improving/Stable/Worsening] | - |

**Crime Breakdown:**
| Category | Percentage | Trend |
|----------|-----------|-------|

[Include safety commentary]

---

**DATA QUALITY REQUIREMENTS:**
- Use live data where available from ABS, Domain, CoreLogic, state authorities
- Clearly mark estimated or inferred data points
- Include data sources and "as of" dates for all statistics
- Prioritize recent data (last 12 months preferred)

**OUTPUT STYLE:**
- Use markdown tables extensively for data presentation
- Include horizontal rulers (---) between major sections
- Professional, data-driven language
- Specific numbers, percentages, dollar amounts
- Actionable insights for investors
- No code blocks or JSON formatting

Produce a comprehensive suburb investment snapshot following the structure above with specific Australian market data.`;

    const propertyPrompt = `You are an expert property analyst researching Australian property investment reports.
Your goal is to generate a comprehensive, professional-grade investment report for the following input:

Mode: ${analysisMode.charAt(0).toUpperCase() + analysisMode.slice(1)}

**PROPERTY ADDRESS TO ANALYZE: ${formattedInput}**

${propertyDetails ? `Additional Details: Price: $${propertyDetails.price || 'Not specified'}, Weekly Rent: $${propertyDetails.weeklyRent || 'Not specified'}, Type: ${propertyDetails.propertyType || 'Not specified'}, Beds: ${propertyDetails.beds || 'Not specified'}, Baths: ${propertyDetails.baths || 'Not specified'}${propertyDetails.landSizeSqm ? `, Land Size: ${propertyDetails.landSizeSqm}m²` : ''}${propertyDetails.buildSizeSqm ? `, Build Size: ${propertyDetails.buildSizeSqm}m²` : ''}` : ''}

**CRITICAL - MANDATORY REPORT STRUCTURE:**

YOU MUST FOLLOW THIS EXACT STRUCTURE. DO NOT DEVIATE. Each section must follow this precise format:

# REPORT TITLE
Investment Report: [PROPERTY ADDRESS], [STATE]

# 1. Location Overview
- Begin with: "This investment report analyzes: [FULL PROPERTY ADDRESS]"
- Suburb profile and characteristics
- Distance to CBD/major city (e.g., "approximately 55km northwest of Brisbane CBD")
- Statistical areas: SA2, SA3, SA4, LGA
- Suburb lifestyle and amenities description
- Commute information
- Population and development trends

# 2. Current Market Performance (Include reporting period)
**Table format:**
| Metric | Value | YoY Change |
| Median House Price | $XXX,XXX | +/-X.X% |
| Median Rent (House) | $XXX | +/-X.X% |
| Gross Rental Yield | X.XX% | N/A |
| Houses Sold (12 months) | XX | N/A |
| Days on Market | XX | N/A |
| Annual Capital Growth | X.X% | N/A |

# 3. Historical Price Growth
| Time Period | Growth Rate | Source |

# 4. Historical Rent Growth  
| Time Period | Growth Rate | Source |

# 5. Market Activity
| Metric | Value | Source |

# 6. Population & Household Characteristics
**Table format:**
| Metric | Value | Source |
| Employment Rate | XX.X% | ABS (2025) |
| Unemployment Rate | X.X% | ABS (2025) |
| Labor Force Size | XX,XXX | ABS (2025) |
| Median Weekly Income | $X,XXX | ABS (2025) |
| Median Annual Income | $XX,XXX | ABS (2025) |
| IRSAD Score | XXX (Decile X/10) | ABS SEIFA (2025) |
| IRSD Score | XXX (Decile X/10) | ABS SEIFA (2025) |

# 7. Major Industries & Job Growth
| Industry | Workforce % | Growth Rate |

# 8. Job Growth Trends
| Time Period | Growth Rate | Source |

[Include narrative about demand drivers]

# 9. Transport & Accessibility
| Metric | Value | Details |
| Walk Score | XX/100 | ... |
| CBD Commute | XX minutes | ... |
| Public Transport Score | XX/100 | ... |

# 10. Education Facilities
| Facility | Distance | Rating |

# 11. Healthcare & Shopping
| Facility | Distance | Details |

# 12. Amenity Scores
| Category | Facilities Count | Nearest Facility |

[Include commentary on amenities]

# 13. Environmental Risks
| Risk Type | Assessment | Details |
| Flood Risk | ... | ... |
| Bushfire Risk | ... | ... |
| Heatwaves | ... | ... |
| Storms | ... | ... |

# 14. Crime Statistics
| Metric | Value | Comparison |
| Overall Crime Rating | ... | ... |
| Rate per 100k people | ... | ... |
| Safety Score | XX/100 | ... |
| Year-on-Year Change | ... | ... |
| 3-Year Trend | ... | ... |

# 15. Crime Breakdown
| Category | Incidents | Percentage |

[Include narrative on risk profile]

# 16. Property-Level Information
| Property Characteristic | Estimated Value |
| Property Type | ... |
| Land Size | ... |
| Bedrooms | ... |
| Bathrooms | ... |
| Parking | ... |
| Year Built | ... |
| Condition | ... |
| Estimated Value | $XXX,XXX |

[Include property description. CRITICAL: When comparing to median prices, ONLY include comparisons if the property price is HIGHER than the median (positive comparison showing value or premium). NEVER include comparisons when the property price is LOWER than the median (negative comparison). If the property is below median, simply omit the comparison entirely.]

# 17. Purchase & Ongoing Costs (Annual)
| Cost Category | Amount (AUD) | Calculation Method |
| Property Price | $XXX,XXX | ... |
| Stamp Duty | $XX,XXX | ... |
| Council Rates | $X,XXX | ... |
| Water Rates | $XXX | ... |
| Property Management Fee | $X,XXX | ... |
| Insurance | $X,XXX | ... |
| Maintenance | $1,500 | Fixed amount per instructions |
| Land Tax | $X,XXX | State-specific calculation |
| **Total Annual Costs** | **$XX,XXX** | **Sum of ALL ongoing costs including Land Tax (Council Rates + Water Rates + Property Management + Insurance + Maintenance + Land Tax - exclude letting fees)** |

# 18. Recent Comparable Sales (Last 12 Months)
| Address | Sale Price | Sale Date | Beds/Baths/Parking | Distance |

# 19. Recent Comparable Rentals
| Address | Weekly Rent | Property Type | Location |

[Include analysis of comparables]

# 20. Base Assumptions
${enhancedData.financials ? `- Property Price: $${enhancedData.financials.initialCosts?.propertyValue?.toLocaleString() || 'XXX,XXX'}
- Deposit: 20% - $${enhancedData.financials.initialCosts?.deposit?.toLocaleString() || 'XXX,XXX'}
- Loan Amount: $${enhancedData.financials.initialCosts?.loanAmount?.toLocaleString() || 'XXX,XXX'}
- Interest Rate: ${enhancedData.financials.loanDetails?.interestRate || 6.5}%
- Loan Term: 30 years
- Weekly Rent: $${enhancedData.financials.income?.weeklyRent || 'XXX'} ($${((enhancedData.financials.income?.weeklyRent || 0) * 52).toLocaleString()} annually)
- Property Management: 7% × $${((enhancedData.financials.income?.weeklyRent || 0) * 52).toLocaleString()} annual rent = $${Math.round(((enhancedData.financials.income?.weeklyRent || 0) * 52) * 0.07).toLocaleString()}
- Maintenance: $1,500 annually (fixed)
- Council Rates: $${enhancedData.financials.annualCosts?.councilRates?.toLocaleString() || 'X,XXX'} annually
- Water Rates: $${enhancedData.financials.annualCosts?.waterRates?.toLocaleString() || 'XXX'} annually
- Insurance: $${enhancedData.financials.annualCosts?.landlordInsurance?.toLocaleString() || 'X,XXX'} annually` : `- Property Price: $XXX,XXX
- Deposit: 20% - $XXX,XXX
- Loan Amount: $XXX,XXX
- Interest Rate: 6.5%
- Loan Term: 30 years
- Weekly Rent: $XXX ($XX,XXX annually)
- Property Management: 7% × $XX,XXX annual rent = $X,XXX
- Maintenance: $1,500 annually (fixed)
- Council Rates: $X,XXX annually
- Water Rates: $XXX annually
- Insurance: $X,XXX annually`}

# 21. Gross & Net Yield Calculation
**IMPORTANT: Annual Expenses here must EXCLUDE Land Tax. Land Tax is shown in Section 17 Total Annual Costs but is NOT included in the net yield calculation.**
**CRITICAL: For Annual Income calculation column, show the WEEKLY rent amount (e.g., $629) multiplied by 52, NOT the annual amount. Example: "$629 × 52 weeks" NOT "$32,708 × 52 weeks"**
| Metric | Calculation | Value |
| Gross Rental Yield | $[annual rent] ÷ $[property price] × 100 | X.XX% |
| Annual Income | $[WEEKLY rent] × 52 weeks | $XX,XXX |
| Annual Expenses | Council Rates + Water Rates + Property Management + Insurance + Maintenance (EXCLUDING Land Tax) | $X,XXX |
| Net Annual Return | $[annual income] - $[annual expenses] | $XX,XXX |
| Net Rental Yield | $[net annual return] ÷ $[property price] × 100 | X.XX% |

# 22. Principal & Interest Loan
| Item | Amount (Annual) | Amount (Monthly) |

# 23. Interest-Only Loan (First 5 Years)
| Item | Amount (Annual) | Amount (Monthly) |

# 24. Sensitivity Analysis
| Scenario | Interest Rate | Annual Cashflow |

[Include narrative on cashflow]

# 25. Property Value Projections ($)
| Year | Conservative (2%) | Base (4%) |

# 26. Rental Income Projections ($)
| Year | Conservative (2%) | Base (3%) |

# 27. Cumulative Cashflow Projections ($)
| Year | Conservative | Base |

# 28. Final Loan-to-Value Ratio (LVR)
| Scenario | Year 10 LVR |

[Include projection narrative]

# 29. Overall Investment Score
Investment Grade: [GRADE]
Total Score: XX/100
Recommendation: [BUY/HOLD/SELL]

# 30. Investment Score Breakdown
| Component | Weight (%) | Score (/100) |

# 31. SWOT Analysis
**Strengths:**
- [bullet points]

**Weaknesses:**
- [bullet points]

**Opportunities:**
- [bullet points]

**Threats:**
- [bullet points]

[Include narrative conclusion]

# 32. Top 3 Opportunities
1. [Opportunity title] - [Description]

# 33. Top 3 Risks
1. [Risk title] - [Description]

# 34. Investment Recommendations
Based on the comprehensive analysis above, here are tailored recommendations for this investment:

**Short-term Actions:**
- [Specific actionable recommendation]
- [Specific actionable recommendation]

**Long-term Strategy:**
- [Strategic recommendation for maximizing returns]
- [Risk mitigation recommendation]

**Key Considerations:**
- [Important factor to monitor]
- [Market condition to watch]

# 35. Market Data Sources
| Metric | Source | URL |

# 36. Demographic & Economic Data
| Metric | Source | URL |

**ABSOLUTE REQUIREMENTS:**
1. **NO N/A VALUES**: If a data point is not available, DO NOT include it in tables or text. Completely omit that row/metric.
2. **EXACT STRUCTURE**: Follow the section order and numbering exactly as shown above
3. **TABLE FORMATTING**: Use markdown tables exactly as specified
4. **CONSISTENT HEADERS**: Use # for main sections exactly as shown
5. **CURRENCY**: All amounts in AUD with $ symbol
6. **DATES**: Include reporting periods and data sources with every metric
7. **NO PLACEHOLDERS**: Never write "data unavailable", "TBD", "N/A", or similar - just omit the metric entirely
8. **MEDIAN PRICE COMPARISONS**: ONLY include property-to-median price comparisons when the property price is HIGHER than the median. NEVER mention or include comparisons when the property price is LOWER than the median. If below median, omit the comparison entirely.

**CRITICAL DATA HANDLING RULE: If any data point is unavailable, missing, or would be marked as "N/A", completely OMIT that entire row/metric from the table or section. DO NOT show any placeholders. Only include metrics where actual data exists.**

${enhancedData.demographics ? `
DEMOGRAPHIC DATA AVAILABLE (Only include metrics with actual values - OMIT any N/A values):
${enhancedData.demographics.population?.total ? `- Population: ${enhancedData.demographics.population.total}` : ''}
${enhancedData.demographics.income?.medianHouseholdIncome ? `- Median Household Income: $${enhancedData.demographics.income.medianHouseholdIncome}` : ''}
${enhancedData.demographics.income?.unemploymentRate ? `- Unemployment Rate: ${enhancedData.demographics.income.unemploymentRate}%` : ''}
${enhancedData.demographics.housing?.ownerOccupierRate ? `- Owner-Occupier Rate: ${enhancedData.demographics.housing.ownerOccupierRate}%` : ''}
${enhancedData.demographics.employment?.laborForceParticipation ? `- Labor Force Participation: ${enhancedData.demographics.employment.laborForceParticipation}%` : ''}
` : ''}

${enhancedData.economics ? `
ECONOMIC DATA AVAILABLE (Only include metrics with actual values - OMIT any N/A values):
${enhancedData.economics.cashRate?.current ? `- Current Cash Rate: ${enhancedData.economics.cashRate.current}%` : ''}
${enhancedData.economics.inflation?.annual ? `- Annual Inflation: ${enhancedData.economics.inflation.annual}%` : ''}
${enhancedData.economics.indicators?.gdpGrowth ? `- GDP Growth: ${enhancedData.economics.indicators.gdpGrowth}%` : ''}
${enhancedData.economics.indicators?.unemploymentRate ? `- National Unemployment: ${enhancedData.economics.indicators.unemploymentRate}%` : ''}
${enhancedData.economics.indicators?.housePriceGrowth ? `- House Price Growth: ${enhancedData.economics.indicators.housePriceGrowth}%` : ''}
` : ''}

${enhancedData.financials ? `
FINANCIAL CALCULATIONS AVAILABLE - USE THESE EXACT VALUES (Only include metrics with actual values):
${enhancedData.financials.initialCosts?.stampDuty ? `- Stamp Duty: $${enhancedData.financials.initialCosts.stampDuty}` : ''}
${enhancedData.financials.keyMetrics?.grossRentalYield ? `- Gross Rental Yield: ${enhancedData.financials.keyMetrics.grossRentalYield}%` : ''}
${enhancedData.financials.keyMetrics?.netRentalYield ? `- Net Rental Yield: ${enhancedData.financials.keyMetrics.netRentalYield}%` : ''}
${enhancedData.financials.annualCosts?.councilRates ? `- Council Rates: $${enhancedData.financials.annualCosts.councilRates}` : ''}
${enhancedData.financials.annualCosts?.waterRates ? `- Water Rates: $${enhancedData.financials.annualCosts.waterRates}` : ''}
${enhancedData.financials.annualCosts?.landlordInsurance ? `- Insurance: $${enhancedData.financials.annualCosts.landlordInsurance}` : ''}
${enhancedData.financials.annualCosts?.propertyManagement ? `- Property Management: $${enhancedData.financials.annualCosts.propertyManagement}` : ''}
- Maintenance: $1,500 AUD (FIXED - ALWAYS USE THIS EXACT AMOUNT)

10-YEAR PROJECTIONS (Use these exact calculated values):
${enhancedData.financials.projections?.conservative?.[0] ? `Conservative: Year 1-10 values provided` : ''}
${enhancedData.financials.projections?.moderate?.[0] ? `Moderate: Year 1-10 values provided` : ''}
${enhancedData.financials.projections?.optimistic?.[0] ? `Optimistic: Year 1-10 values provided` : ''}
` : ''}

${enhancedData.domainData ? `
DOMAIN MARKET DATA (REAL API VALUES - Use these in Current Market Performance section):
${enhancedData.domainData.medianSoldPrice ? `- Median House Price: $${enhancedData.domainData.medianSoldPrice.toLocaleString()}` : ''}
${enhancedData.domainData.medianRentListingPrice ? `- Median Weekly Rent: $${enhancedData.domainData.medianRentListingPrice}` : ''}
${enhancedData.domainData.annualGrowth ? `- Annual Capital Growth: ${enhancedData.domainData.annualGrowth}%` : ''}
${enhancedData.domainData.rentalYield ? `- Rental Yield: ${enhancedData.domainData.rentalYield.toFixed(2)}%` : ''}
${enhancedData.domainData.daysOnMarket ? `- Days on Market: ${enhancedData.domainData.daysOnMarket}` : ''}
${enhancedData.domainData.numberSold ? `- Houses Sold: ${enhancedData.domainData.numberSold}` : ''}
` : ''}

${enhancedData.riskAssessment ? `
ENVIRONMENTAL RISK DATA (Use in Environmental Risks section):
${enhancedData.riskAssessment.floodRisk ? `Flood: ${enhancedData.riskAssessment.floodRisk.level} - ${enhancedData.riskAssessment.floodRisk.description}` : ''}
${enhancedData.riskAssessment.bushfireRisk ? `Bushfire: ${enhancedData.riskAssessment.bushfireRisk.level} - ${enhancedData.riskAssessment.bushfireRisk.description}` : ''}
${enhancedData.riskAssessment.crimeStatistics ? `Crime: ${enhancedData.riskAssessment.crimeStatistics.overallRating} - ${enhancedData.riskAssessment.crimeStatistics.comparedToStateAverage}` : ''}
` : ''}

${enhancedData.locationIntelligence ? `
LOCATION INTELLIGENCE DATA:
${enhancedData.locationIntelligence.walkScore ? `- Walk Score: ${enhancedData.locationIntelligence.walkScore}/100` : ''}
${enhancedData.locationIntelligence.commute?.durationMinutes ? `- CBD Commute: ${enhancedData.locationIntelligence.commute.durationMinutes} minutes` : ''}
${enhancedData.locationIntelligence.transport?.qualityScore ? `- Public Transport Score: ${enhancedData.locationIntelligence.transport.qualityScore}/100` : ''}
` : ''}

${enhancedData.investmentScore ? `
INVESTMENT SCORE (Use these exact values in Overall Investment Score section):
- Total Score: ${enhancedData.investmentScore.totalScore}/100
- Grade: ${enhancedData.investmentScore.grade}
- Recommendation: ${enhancedData.investmentScore.recommendation}
Component Scores: Growth ${enhancedData.investmentScore.breakdown?.growthScore?.score}, Location ${enhancedData.investmentScore.breakdown?.locationScore?.score}, Yield ${enhancedData.investmentScore.breakdown?.yieldScore?.score}, Demand ${enhancedData.investmentScore.breakdown?.demandScore?.score}, Risk ${enhancedData.investmentScore.breakdown?.riskScore?.score}
` : ''}

**FORMATTING INSTRUCTIONS:**
- Use markdown tables for all data presentations
- Include data sources and dates for every metric
- Add horizontal rulers (---) between major sections
- Use # for section headers
- CRITICAL: Omit any metric where data is not available - do not show N/A or placeholders
- All amounts in AUD with $ symbol
- Follow the 36-section structure exactly as specified above

${enhancedData.economics ? `
ECONOMIC DATA AVAILABLE (Only include metrics with actual values):
${enhancedData.economics.cashRate?.current ? `- Current Cash Rate: ${enhancedData.economics.cashRate.current}%` : ''}
${enhancedData.economics.inflation?.annual ? `- Annual Inflation: ${enhancedData.economics.inflation.annual}%` : ''}
${enhancedData.economics.indicators?.gdpGrowth ? `- GDP Growth: ${enhancedData.economics.indicators.gdpGrowth}%` : ''}
${enhancedData.economics.indicators?.unemploymentRate ? `- National Unemployment: ${enhancedData.economics.indicators.unemploymentRate}%` : ''}
${enhancedData.economics.indicators?.housePriceGrowth ? `- House Price Growth: ${enhancedData.economics.indicators.housePriceGrowth}%` : ''}
` : ''}

${enhancedData.financials ? `
FINANCIAL CALCULATIONS AVAILABLE (Only include metrics with actual values):
KEY METRICS:
${enhancedData.financials.initialCosts?.propertyValue ? `- Property Value: $${enhancedData.financials.initialCosts.propertyValue}` : ''}
${enhancedData.financials.initialCosts?.deposit ? `- Deposit: $${enhancedData.financials.initialCosts.deposit}` : ''}
${enhancedData.financials.initialCosts?.loanAmount ? `- Loan Amount: $${enhancedData.financials.initialCosts.loanAmount}` : ''}
${enhancedData.financials.initialCosts?.stampDuty ? `- Stamp Duty: $${enhancedData.financials.initialCosts.stampDuty}` : ''}
${enhancedData.financials.initialCosts?.totalUpfront ? `- Total Upfront Costs: $${enhancedData.financials.initialCosts.totalUpfront}` : ''}
${enhancedData.financials.loanDetails?.monthlyPayment ? `- Monthly Loan Payment: $${Math.round(enhancedData.financials.loanDetails.monthlyPayment)}` : ''}
${enhancedData.financials.loanDetails?.totalInterest ? `- Total Interest (30yr): $${Math.round(enhancedData.financials.loanDetails.totalInterest)}` : ''}
${enhancedData.financials.keyMetrics?.grossRentalYield ? `- Gross Rental Yield: ${enhancedData.financials.keyMetrics.grossRentalYield}%` : ''}
${enhancedData.financials.keyMetrics?.netRentalYield ? `- Net Rental Yield: ${enhancedData.financials.keyMetrics.netRentalYield}%` : ''}
${enhancedData.financials.keyMetrics?.weeklyNet ? `- Weekly Net Cash Flow: $${enhancedData.financials.keyMetrics.weeklyNet}` : ''}
${enhancedData.financials.keyMetrics?.annualNet ? `- Annual Net Cash Flow: $${enhancedData.financials.keyMetrics.annualNet}` : ''}
${enhancedData.financials.keyMetrics?.lvr ? `- Loan-to-Value Ratio: ${enhancedData.financials.keyMetrics.lvr}%` : ''}
${enhancedData.financials.keyMetrics?.cashOnCashReturn ? `- Cash on Cash Return: ${enhancedData.financials.keyMetrics.cashOnCashReturn}%` : ''}

ANNUAL COSTS (Only include costs with actual values):
${enhancedData.financials.annualCosts?.councilRates ? `- Council Rates: $${enhancedData.financials.annualCosts.councilRates}` : ''}
${enhancedData.financials.annualCosts?.waterRates ? `- Water Rates: $${enhancedData.financials.annualCosts.waterRates}` : ''}
${enhancedData.financials.annualCosts?.landlordInsurance ? `- Insurance: $${enhancedData.financials.annualCosts.landlordInsurance}` : ''}
${enhancedData.financials.annualCosts?.propertyManagement ? `- Property Management: $${enhancedData.financials.annualCosts.propertyManagement}` : ''}
- Maintenance: $1,500 AUD (FIXED - USE THIS EXACT AMOUNT IN ALL CALCULATIONS)
${enhancedData.financials.annualCosts?.landTax ? `- Land Tax: $${enhancedData.financials.annualCosts.landTax} (INCLUDE in Section 14 Total Annual Costs, but EXCLUDE from Section 21 Annual Expenses)` : ''}
${enhancedData.financials.annualCosts?.totalAnnual ? `- Total Annual Costs (WITH Land Tax - for Section 14): $${enhancedData.financials.annualCosts.totalAnnual}` : ''}
${enhancedData.financials.annualCosts?.totalAnnualExcludingLandTax ? `- Annual Expenses (WITHOUT Land Tax - for Section 21 Net Yield): $${enhancedData.financials.annualCosts.totalAnnualExcludingLandTax}` : ''}

CRITICAL LAND TAX RULES:
- Section 14 (Purchase & Ongoing Costs): Include Land Tax as a separate row AND in Total Annual Costs
- Section 21 (Net Yield Calculation): Annual Expenses must EXCLUDE Land Tax


10-YEAR PROJECTIONS (Only include scenarios with actual data):
${enhancedData.financials.projections?.conservative?.[0] ? `
Conservative Scenario (2% capital, 2% rent growth):
${enhancedData.financials.projections.conservative.slice(0, 10).map((p: any, i: number) => 
  `Year ${i + 1}: Value $${p.propertyValue?.toLocaleString() || '0'}, Equity $${p.equity?.toLocaleString() || '0'}, Cash Flow $${p.cashFlow?.toLocaleString() || '0'}, ROI ${p.roi || '0'}%`
).join('\n')}
` : ''}
${enhancedData.financials.projections?.moderate?.[0] ? `
Moderate Scenario (4% capital, 3% rent growth):
${enhancedData.financials.projections.moderate.slice(0, 10).map((p: any, i: number) => 
  `Year ${i + 1}: Value $${p.propertyValue?.toLocaleString() || '0'}, Equity $${p.equity?.toLocaleString() || '0'}, Cash Flow $${p.cashFlow?.toLocaleString() || '0'}, ROI ${p.roi || '0'}%`
).join('\n')}
` : ''}
${enhancedData.financials.projections?.optimistic?.[0] ? `
Optimistic Scenario (6% capital, 4% rent growth):
${enhancedData.financials.projections.optimistic.slice(0, 10).map((p: any, i: number) => 
  `Year ${i + 1}: Value $${p.propertyValue?.toLocaleString() || '0'}, Equity $${p.equity?.toLocaleString() || '0'}, Cash Flow $${p.cashFlow?.toLocaleString() || '0'}, ROI ${p.roi || '0'}%`
).join('\n')}
` : ''}

${enhancedData.financials.sensitivityAnalysis ? `
SENSITIVITY ANALYSIS:
${enhancedData.financials.sensitivityAnalysis?.interestRateUp ? `
Interest Rate +1% (${(parseFloat(propertyDetails?.interestRate || '6.5') + 1).toFixed(1)}%):
- Monthly Payment: $${Math.round(enhancedData.financials.sensitivityAnalysis.interestRateUp.monthlyPayment)}
- Weekly Net: $${Math.round(enhancedData.financials.sensitivityAnalysis.interestRateUp.weeklyNet)}
- Annual Net: $${Math.round(enhancedData.financials.sensitivityAnalysis.interestRateUp.annualNet)}
` : ''}
${enhancedData.financials.sensitivityAnalysis?.interestRateDown ? `
Interest Rate -1% (${(parseFloat(propertyDetails?.interestRate || '6.5') - 1).toFixed(1)}%):
- Monthly Payment: $${Math.round(enhancedData.financials.sensitivityAnalysis.interestRateDown.monthlyPayment)}
- Weekly Net: $${Math.round(enhancedData.financials.sensitivityAnalysis.interestRateDown.weeklyNet)}
- Annual Net: $${Math.round(enhancedData.financials.sensitivityAnalysis.interestRateDown.annualNet)}
` : ''}
` : ''}

IMPORTANT: Use these exact calculated values in your "Financial Analysis" and "10-Year Projection Scenarios" sections. Do not recalculate - these are professionally calculated projections.
` : ''}

${enhancedData.domainData ? `
DOMAIN MARKET DATA (FROM DOMAIN API - Only include metrics with actual values):
${enhancedData.domainData.medianSoldPrice ? `- Median House Price: $${enhancedData.domainData.medianSoldPrice.toLocaleString()}` : ''}
${enhancedData.domainData.numberSold ? `- Number of Sales: ${enhancedData.domainData.numberSold}` : ''}
${enhancedData.domainData.medianRentListingPrice ? `- Median Weekly Rent: $${enhancedData.domainData.medianRentListingPrice}` : ''}
${enhancedData.domainData.daysOnMarket ? `- Days on Market: ${enhancedData.domainData.daysOnMarket} days` : ''}
${enhancedData.domainData.auctionClearanceRate ? `- Auction Clearance Rate: ${enhancedData.domainData.auctionClearanceRate}%` : ''}
${enhancedData.domainData.annualGrowth ? `- Annual Price Growth: ${enhancedData.domainData.annualGrowth}%` : ''}
${enhancedData.domainData.rentalYield ? `- Rental Yield: ${enhancedData.domainData.rentalYield.toFixed(2)}%` : ''}
- Data Source: ${enhancedData.domainData.dataSource}
- Last Updated: ${enhancedData.domainData.lastUpdated}

CRITICAL: These are REAL MARKET VALUES from Domain API. Use them to replace any generic market data in your "Market KPIs" and "Comparable Market Evidence" sections. Only include metrics with actual values. Do not make up comparable sales - state that specific comparable sales require further local agent research if not available.
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
LOCATION INTELLIGENCE AVAILABLE (Only include sections with actual data):
${enhancedData.locationIntelligence.walkScore ? `WALKABILITY & ACCESS:
- Walk Score: ${enhancedData.locationIntelligence.walkScore}/100` : ''}
${enhancedData.locationIntelligence.commute?.durationMinutes ? `- CBD Commute: ${enhancedData.locationIntelligence.commute.durationMinutes} minutes via ${enhancedData.locationIntelligence.commute.mode || 'transit'}${enhancedData.locationIntelligence.commute.distanceKm ? ` (${enhancedData.locationIntelligence.commute.distanceKm}km)` : ''}` : ''}

${enhancedData.locationIntelligence.transport?.qualityScore ? `PUBLIC TRANSPORT (Quality Score: ${enhancedData.locationIntelligence.transport.qualityScore}/100):
${enhancedData.locationIntelligence.transport.summary || ''}

TRANSPORT DETAILS:
${enhancedData.locationIntelligence.transport.nearestStop ? `- Nearest Stop: ${enhancedData.locationIntelligence.transport.nearestStop}${enhancedData.locationIntelligence.transport.distanceToStop ? ` (${enhancedData.locationIntelligence.transport.distanceToStop}m away)` : ''}` : ''}
${enhancedData.locationIntelligence.transport.stopsWithin1km ? `- Stops Within 1km: ${enhancedData.locationIntelligence.transport.stopsWithin1km}` : ''}
${enhancedData.locationIntelligence.transport.transportTypes?.length ? `- Transport Types Available: ${enhancedData.locationIntelligence.transport.transportTypes.join(', ')}` : ''}
${enhancedData.locationIntelligence.transport.serviceFrequency ? `- Service Frequency:
  Peak Hour: ${enhancedData.locationIntelligence.transport.serviceFrequency.peak} services/hour
  Off-Peak: ${enhancedData.locationIntelligence.transport.serviceFrequency.offPeak} services/hour` : ''}
${enhancedData.locationIntelligence.transport.routeCoverage?.length > 0 ? `- Route Coverage:
${enhancedData.locationIntelligence.transport.routeCoverage.map((r: any) => `  * ${r.route} (${r.type}): ${r.frequency} services/hour`).join('\n')}` : ''}
${enhancedData.locationIntelligence.transport.accessibility ? `- Accessibility: ${enhancedData.locationIntelligence.transport.accessibility.wheelchairAccessible ? 'Wheelchair accessible' : 'Standard access'}${enhancedData.locationIntelligence.transport.accessibility.lifts ? ', Lifts available' : ''}${enhancedData.locationIntelligence.transport.accessibility.tactilePaving ? ', Tactile paving' : ''}` : ''}
${enhancedData.locationIntelligence.transport.realTimeAlerts?.length > 0 ? `- Current Service Alerts: ${enhancedData.locationIntelligence.transport.realTimeAlerts.join('; ')}` : ''}
${enhancedData.locationIntelligence.transport.detailedStops?.length > 0 ? `- Nearby Stops Detail:
${enhancedData.locationIntelligence.transport.detailedStops.slice(0, 5).map((s: any) => `  * ${s.name} (${s.type}): ${s.distance}m away, Routes: ${s.routes?.join(', ') || 'N/A'}`).join('\n')}` : ''}
` : `${enhancedData.locationIntelligence.transport?.nearestStation ? `PUBLIC TRANSPORT:
- Nearest Station: ${enhancedData.locationIntelligence.transport.nearestStation}` : ''}
${enhancedData.locationIntelligence.transport?.distanceToStation ? `
- Distance to Station: ${enhancedData.locationIntelligence.transport.distanceToStation}km` : ''}`}

${enhancedData.locationIntelligence.schools ? `EDUCATION:
${enhancedData.locationIntelligence.schools.nearestSchool ? `- Nearest School: ${enhancedData.locationIntelligence.schools.nearestSchool}${enhancedData.locationIntelligence.schools.distanceToSchool ? ` (${enhancedData.locationIntelligence.schools.distanceToSchool}km away)` : ''}` : ''}
${enhancedData.locationIntelligence.schools.schoolsWithin3km ? `- Schools Within 3km: ${enhancedData.locationIntelligence.schools.schoolsWithin3km}` : ''}
${enhancedData.locationIntelligence.schools.topSchools?.length > 0 ? `- Top Schools Nearby:
${enhancedData.locationIntelligence.schools.topSchools.map((s: any) => `  * ${s.name} - ${s.distance}km away (Rating: ${s.rating}/5)`).join('\n')}` : ''}
` : ''}
${enhancedData.locationIntelligence.healthcare ? `HEALTHCARE:
${enhancedData.locationIntelligence.healthcare.nearestHospital ? `- Nearest Hospital: ${enhancedData.locationIntelligence.healthcare.nearestHospital}${enhancedData.locationIntelligence.healthcare.distanceToHospital ? ` (${enhancedData.locationIntelligence.healthcare.distanceToHospital}km away)` : ''}` : ''}
${enhancedData.locationIntelligence.healthcare.facilitiesWithin5km ? `- Healthcare Facilities Within 5km: ${enhancedData.locationIntelligence.healthcare.facilitiesWithin5km}` : ''}
` : ''}
${enhancedData.locationIntelligence.lifestyle ? `LIFESTYLE & AMENITIES:
${enhancedData.locationIntelligence.lifestyle.shoppingCenters ? `- Shopping Centers: ${enhancedData.locationIntelligence.lifestyle.shoppingCenters}` : ''}
${enhancedData.locationIntelligence.lifestyle.nearestShopping ? `- Nearest Shopping: ${enhancedData.locationIntelligence.lifestyle.nearestShopping}` : ''}
${enhancedData.locationIntelligence.lifestyle.parks ? `- Parks & Recreation Areas: ${enhancedData.locationIntelligence.lifestyle.parks}` : ''}
${enhancedData.locationIntelligence.lifestyle.nearestPark ? `- Nearest Park: ${enhancedData.locationIntelligence.lifestyle.nearestPark}` : ''}
${enhancedData.locationIntelligence.lifestyle.restaurants ? `- Restaurants & Cafes: ${enhancedData.locationIntelligence.lifestyle.restaurants}` : ''}
` : ''}
${enhancedData.locationIntelligence.amenities?.length > 0 ? `AMENITY SCORES BY CATEGORY:
${enhancedData.locationIntelligence.amenities.map((a: any) => 
  `- ${a.category}: ${a.count} facilities, nearest "${a.nearest}" at ${a.distance}km (Score: ${a.score}/100)`
).join('\n')}

IMPORTANT: Include these specific amenity counts, distances, and scores in your "Infrastructure & Amenities" section. Use the actual facility names and distances provided.
` : ''}
` : ''}

${enhancedData.investmentScore ? `
INVESTMENT SCORE CALCULATED (USE THESE VALUES IN YOUR REPORT):
${enhancedData.investmentScore.totalScore ? `- Total Score: ${enhancedData.investmentScore.totalScore}/100` : ''}
${enhancedData.investmentScore.grade ? `- Letter Grade: ${enhancedData.investmentScore.grade} (A+ to F scale)` : ''}
${enhancedData.investmentScore.recommendation ? `- Investment Recommendation: ${enhancedData.investmentScore.recommendation}` : ''}

COMPONENT SCORES (out of 100):
${enhancedData.investmentScore.breakdown?.growthScore ? `- Growth Score: ${enhancedData.investmentScore.breakdown.growthScore.score}/100 (Weight: ${enhancedData.investmentScore.breakdown.growthScore.weight || 30}%)
  Details: ${enhancedData.investmentScore.breakdown.growthScore.details}
  ` : ''}
${enhancedData.investmentScore.breakdown?.locationScore ? `- Location Score: ${enhancedData.investmentScore.breakdown.locationScore.score}/100 (Weight: ${enhancedData.investmentScore.breakdown.locationScore.weight || 25}%)
  Details: ${enhancedData.investmentScore.breakdown.locationScore.details}
  ` : ''}
${enhancedData.investmentScore.breakdown?.yieldScore ? `- Yield Score: ${enhancedData.investmentScore.breakdown.yieldScore.score}/100 (Weight: ${enhancedData.investmentScore.breakdown.yieldScore.weight || 20}%)
  Details: ${enhancedData.investmentScore.breakdown.yieldScore.details}
  ` : ''}
${enhancedData.investmentScore.breakdown?.demandScore ? `- Demand Score: ${enhancedData.investmentScore.breakdown.demandScore.score}/100 (Weight: ${enhancedData.investmentScore.breakdown.demandScore.weight || 15}%)
  Details: ${enhancedData.investmentScore.breakdown.demandScore.details}
  ` : ''}
${enhancedData.investmentScore.breakdown?.riskScore ? `- Risk Score: ${enhancedData.investmentScore.breakdown.riskScore.score}/100 (Weight: ${enhancedData.investmentScore.breakdown.riskScore.weight || 10}%)
  Details: ${enhancedData.investmentScore.breakdown.riskScore.details}
  ` : ''}
${enhancedData.investmentScore.strengths?.length || enhancedData.investmentScore.weaknesses?.length || enhancedData.investmentScore.opportunities?.length || enhancedData.investmentScore.risks?.length ? `
SWOT ANALYSIS:
${enhancedData.investmentScore.strengths?.length ? `Strengths: ${enhancedData.investmentScore.strengths.join('; ')}` : ''}
${enhancedData.investmentScore.weaknesses?.length ? `Weaknesses: ${enhancedData.investmentScore.weaknesses.join('; ')}` : ''}
${enhancedData.investmentScore.opportunities?.length ? `Opportunities: ${enhancedData.investmentScore.opportunities.join('; ')}` : ''}
${enhancedData.investmentScore.risks?.length ? `Threats/Risks: ${enhancedData.investmentScore.risks.join('; ')}` : ''}
` : ''}
${enhancedData.investmentScore.grade ? `IMPORTANT: Use this pre-calculated investment score directly in your "Overall Investment Score" section. Display the letter grade (${enhancedData.investmentScore.grade}) prominently. Do NOT recalculate - use these exact values and component breakdowns.` : ''}
` : ''}

${enhancedData.seifaData ? `
SEIFA SOCIOECONOMIC INDEX DATA (ABS - Only include indexes with actual values):
${enhancedData.seifaData.irsad?.score ? `- IRSAD Score: ${enhancedData.seifaData.irsad.score} (Decile ${enhancedData.seifaData.irsad.decile}/10)${enhancedData.seifaData.irsad.description ? `
- IRSAD Rating: ${enhancedData.seifaData.irsad.description}` : ''}` : ''}
${enhancedData.seifaData.irsd?.score ? `- IRSD Score: ${enhancedData.seifaData.irsd.score} (Decile ${enhancedData.seifaData.irsd.decile}/10)` : ''}
${enhancedData.seifaData.ier?.score ? `- IER Score: ${enhancedData.seifaData.ier.score} (Decile ${enhancedData.seifaData.ier.decile}/10)` : ''}
${enhancedData.seifaData.ieo?.score ? `- IEO Score: ${enhancedData.seifaData.ieo.score} (Decile ${enhancedData.seifaData.ieo.decile}/10)` : ''}
${enhancedData.seifaData.summary ? `- Summary: ${enhancedData.seifaData.summary}` : ''}
${enhancedData.seifaData.dataSource ? `- Data Source: ${enhancedData.seifaData.dataSource}` : ''}
${enhancedData.seifaData.note ? `- Note: ${enhancedData.seifaData.note}` : ''}

IMPORTANT: Use this SEIFA data in your "Demographics & Demand Drivers" section to provide socioeconomic context. Decile 10 = most advantaged, Decile 1 = most disadvantaged.
` : ''}

${enhancedData.crimeStatistics ? `
CRIME STATISTICS DATA (Only include metrics with actual values):
${enhancedData.crimeStatistics.overallRating ? `- Overall Crime Rating: ${enhancedData.crimeStatistics.overallRating}` : ''}
${enhancedData.crimeStatistics.comparedToStateAverage ? `- Compared to State Average: ${enhancedData.crimeStatistics.comparedToStateAverage}` : ''}
${enhancedData.crimeStatistics.ratePerCapita ? `- Rate per 100k people: ${enhancedData.crimeStatistics.ratePerCapita}` : ''}
${enhancedData.crimeStatistics.period ? `- Period: ${enhancedData.crimeStatistics.period}` : ''}
${enhancedData.crimeStatistics.safetyScore ? `- Safety Score: ${enhancedData.crimeStatistics.safetyScore}/100` : ''}

${enhancedData.crimeStatistics.breakdown ? `CRIME BREAKDOWN BY CATEGORY:
${enhancedData.crimeStatistics.breakdown.propertyOffenses ? `- Property Offenses: ${enhancedData.crimeStatistics.breakdown.propertyOffenses.count} incidents (${enhancedData.crimeStatistics.breakdown.propertyOffenses.percentage}%)${enhancedData.crimeStatistics.breakdown.propertyOffenses.types?.length ? `
  Types: ${enhancedData.crimeStatistics.breakdown.propertyOffenses.types.join(', ')}` : ''}` : ''}
${enhancedData.crimeStatistics.breakdown.violentOffenses ? `- Violent Offenses: ${enhancedData.crimeStatistics.breakdown.violentOffenses.count} incidents (${enhancedData.crimeStatistics.breakdown.violentOffenses.percentage}%)${enhancedData.crimeStatistics.breakdown.violentOffenses.types?.length ? `
  Types: ${enhancedData.crimeStatistics.breakdown.violentOffenses.types.join(', ')}` : ''}` : ''}
${enhancedData.crimeStatistics.breakdown.drugOffenses ? `- Drug Offenses: ${enhancedData.crimeStatistics.breakdown.drugOffenses.count} incidents (${enhancedData.crimeStatistics.breakdown.drugOffenses.percentage}%)` : ''}
${enhancedData.crimeStatistics.breakdown.publicOrder ? `- Public Order: ${enhancedData.crimeStatistics.breakdown.publicOrder.count} incidents (${enhancedData.crimeStatistics.breakdown.publicOrder.percentage}%)` : ''}
` : ''}
${enhancedData.crimeStatistics.trends ? `CRIME TRENDS:
${enhancedData.crimeStatistics.trends.yearOnYear ? `- Year-on-Year Change: ${enhancedData.crimeStatistics.trends.yearOnYear}` : ''}
${enhancedData.crimeStatistics.trends.threeYear ? `- 3-Year Trend: ${enhancedData.crimeStatistics.trends.threeYear}` : ''}
${enhancedData.crimeStatistics.trends.description ? `- Trend Description: ${enhancedData.crimeStatistics.trends.description}` : ''}
` : ''}
${enhancedData.crimeStatistics.dataSource ? `Data Source: ${enhancedData.crimeStatistics.dataSource}` : ''}
${enhancedData.crimeStatistics.officialSources?.length ? `Official Sources: ${enhancedData.crimeStatistics.officialSources.join(', ')}` : ''}

IMPORTANT: Include this crime data in your "Risk Assessment" section. Provide context about safety and how it compares to state averages.
` : ''}

${enhancedData.employmentData ? `
EMPLOYMENT & JOB GROWTH DATA (ABS - Only include metrics with actual values):
${enhancedData.employmentData.employmentRate ? `- Employment Rate: ${enhancedData.employmentData.employmentRate}%` : ''}
${enhancedData.employmentData.unemploymentRate ? `- Unemployment Rate: ${enhancedData.employmentData.unemploymentRate}%` : ''}
${enhancedData.employmentData.participationRate ? `- Participation Rate: ${enhancedData.employmentData.participationRate}%` : ''}
${enhancedData.employmentData.laborForceSize ? `- Labor Force Size: ${enhancedData.employmentData.laborForceSize.toLocaleString()}` : ''}

${enhancedData.employmentData.majorIndustries?.length > 0 ? `MAJOR INDUSTRIES:
${enhancedData.employmentData.majorIndustries.map((ind: any) => 
  `- ${ind.name}: ${ind.percentage}% of workforce (Growth: ${ind.growth})`
).join('\n')}
` : ''}
${enhancedData.employmentData.jobGrowth ? `JOB GROWTH TRENDS:
${enhancedData.employmentData.jobGrowth.annual ? `- Annual Growth: ${enhancedData.employmentData.jobGrowth.annual}` : ''}
${enhancedData.employmentData.jobGrowth.threeYear ? `- 3-Year Growth: ${enhancedData.employmentData.jobGrowth.threeYear}` : ''}
${enhancedData.employmentData.jobGrowth.fiveYear ? `- 5-Year Growth: ${enhancedData.employmentData.jobGrowth.fiveYear}` : ''}
${enhancedData.employmentData.jobGrowth.description ? `- Description: ${enhancedData.employmentData.jobGrowth.description}` : ''}
` : ''}
${enhancedData.employmentData.medianIncome ? `MEDIAN INCOME:
${enhancedData.employmentData.medianIncome.weekly ? `- Weekly: $${enhancedData.employmentData.medianIncome.weekly.toLocaleString()}` : ''}
${enhancedData.employmentData.medianIncome.annual ? `- Annual: $${enhancedData.employmentData.medianIncome.annual.toLocaleString()}` : ''}
${enhancedData.employmentData.medianIncome.growth ? `- Growth: ${enhancedData.employmentData.medianIncome.growth}` : ''}
` : ''}
${enhancedData.employmentData.futureOutlook ? `FUTURE OUTLOOK:
${enhancedData.employmentData.futureOutlook.rating ? `- Rating: ${enhancedData.employmentData.futureOutlook.rating}` : ''}
${enhancedData.employmentData.futureOutlook.description ? `- Description: ${enhancedData.employmentData.futureOutlook.description}` : ''}
${enhancedData.employmentData.futureOutlook.keyDrivers?.length ? `- Key Drivers: ${enhancedData.employmentData.futureOutlook.keyDrivers.join(', ')}` : ''}
` : ''}
${enhancedData.employmentData.dataSource ? `Data Source: ${enhancedData.employmentData.dataSource}` : ''}

IMPORTANT: Use this employment data in your "Demographics & Demand Drivers" and "Infrastructure & Amenities" sections to show job market strength and economic prospects.
` : ''}

${enhancedData.climateData ? `
CLIMATE & ENVIRONMENTAL DATA (BoM - Only include metrics with actual values):
${enhancedData.climateData.climateZone ? `- Climate Zone: ${enhancedData.climateData.climateZone}` : ''}
${enhancedData.climateData.temperature?.annual ? `- Annual Average Temperature: ${enhancedData.climateData.temperature.annual}°C${enhancedData.climateData.temperature.summer ? `
  Summer: ${enhancedData.climateData.temperature.summer}°C` : ''}${enhancedData.climateData.temperature.winter ? `, Winter: ${enhancedData.climateData.temperature.winter}°C` : ''}` : ''}
${enhancedData.climateData.rainfall?.annual ? `- Annual Rainfall: ${enhancedData.climateData.rainfall.annual}mm${enhancedData.climateData.rainfall.wettest ? `
  Wettest Period: ${enhancedData.climateData.rainfall.wettest}` : ''}${enhancedData.climateData.rainfall.driest ? `
  Driest Period: ${enhancedData.climateData.rainfall.driest}` : ''}` : ''}
${enhancedData.climateData.humidity?.annual ? `- Humidity: ${enhancedData.climateData.humidity.annual}%` : ''}
${enhancedData.climateData.comfortIndex ? `- Comfort Index: ${enhancedData.climateData.comfortIndex}/100` : ''}

${enhancedData.climateData.extremeWeather ? `EXTREME WEATHER RISKS:
${enhancedData.climateData.extremeWeather.heatwaves ? `- Heatwaves: ${enhancedData.climateData.extremeWeather.heatwaves}` : ''}
${enhancedData.climateData.extremeWeather.bushfire ? `- Bushfire: ${enhancedData.climateData.extremeWeather.bushfire}` : ''}
${enhancedData.climateData.extremeWeather.flooding ? `- Flooding: ${enhancedData.climateData.extremeWeather.flooding}` : ''}
${enhancedData.climateData.extremeWeather.storms ? `- Storms: ${enhancedData.climateData.extremeWeather.storms}` : ''}
${enhancedData.climateData.extremeWeather.cyclones ? `- Cyclones: ${enhancedData.climateData.extremeWeather.cyclones}` : ''}
` : ''}
${enhancedData.climateData.dataSource ? `Data Source: ${enhancedData.climateData.dataSource}` : ''}

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

CRITICAL - FIXED COSTS:
- Annual Maintenance Fee: ALWAYS use exactly $1,500 AUD (Australian Dollars)
- This is a FIXED amount and must NOT be calculated, estimated, or varied
- Use this exact figure in ALL sections: Financial Analysis, Cashflow Calculations, 10-Year Projections, and any other cost breakdowns
- Do NOT use percentages, estimates, or ranges for maintenance - it is always $1,500 AUD annually

1. Use only Australian data and sources.

2. Provide clear sections with proper headings and bullet points.

3. Cite the source name and date directly in the text for every statistic or metric.

4. If a metric cannot be found because it is paywalled or proprietary (e.g., CoreLogic), clearly state that and explain why.

5. Avoid filler text. Provide specific numbers, facts, and actionable insights.

6. The output should be plain text, not JSON or code.

7. All currency amounts must be in AUD (Australian Dollars) unless otherwise specified.

---

Sections to Include

1. Location Overview

**MUST BEGIN WITH:** "This investment report analyzes: ${formattedInput}"

${analysisMode === 'address' ? `
**CRITICAL:** State the complete property address "${formattedInput}" clearly at the start of this section. All analysis must be for this specific address.
` : ''}

Suburb/area profile and character.

Distance to nearest major city or CBD.

Key lifestyle attributes (parks, schools, shopping hubs, etc.).

Identify the SA2, SA3, SA4, and LGA that this ${analysisMode === 'address' ? 'property address' : 'location'} belongs to.

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

Insurance estimates.

MAINTENANCE COSTS: Always use the FIXED amount of $1,500 AUD annually. Do NOT estimate or calculate this - it is a predetermined fixed cost.

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

Maintenance: FIXED at $1,500 AUD annually (DO NOT change this amount - use exactly $1,500 AUD)

Council rates and insurance: include estimated figures

Sensitivity analysis: show effect of interest rates at +1% and -1%.

IMPORTANT: The $1,500 AUD annual maintenance fee is FIXED and must be used in all cashflow calculations, projections, and cost breakdowns without variation.

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

**CRITICAL: Use the pre-calculated investment score provided above.**

Display the investment score as follows:

**Investment Grade: [Letter Grade A+ to F]**
**Total Score: [Score]/100**
**Recommendation: [Buy/Hold/Sell recommendation]**

Then create a detailed breakdown table showing:
- Component Name | Weight (%) | Score (/100) | Details

Include all five components:
1. Growth Score (30% weighting)
2. Location Score (25% weighting)  
3. Yield Score (20% weighting)
4. Demand Score (15% weighting)
5. Risk Score (10% weighting)

Present the SWOT analysis (Strengths, Weaknesses, Opportunities, Threats) provided in the investment score data.

Add context and explanation for each component based on the market data you've analyzed, but use the exact scores and letter grade provided above. Do NOT recalculate the investment score.

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

Use clear section headings (## for major sections, ### for subsections).

Write in professional, concise, and data-driven language.

**CRITICAL FORMATTING REQUIREMENTS:**

- Add horizontal rulers (---) between ALL major sections for visual separation
- Use markdown tables extensively for data presentation, especially for:
  * Market KPIs (median prices, growth rates, yields, vacancy rates)
  * Comparable sales (address, price, date, beds/baths/parking, distance)
  * Comparable rentals (address, weekly rent, property type, location)
  * Financial analysis (cashflow breakdown, loan scenarios)
  * 10-year projections (all three scenarios side-by-side in a table)
  * Investment score breakdown (showing each component, weighting, score)
  * Cost breakdown (stamp duty, rates, fees, insurance)
  * Demographics data (population, income, employment by category)
- Use bullet points for narrative content and lists
- Keep everything plain text — no code blocks or JSON
- Ensure every major section ends with --- before the next section begins

---

Final Output

Produce a full investment report following the structure above, including detailed numbers, calculations, and references to primary Australian data sources such as ABS, RBA, state revenue offices, data.gov.au, SQM Research, and official hazard maps.`;

    // Select the appropriate prompt based on report scope
    const prompt = reportScope === 'suburb' ? suburbPrompt : propertyPrompt;
    const systemMessage = reportScope === 'suburb' 
      ? 'You are an expert Australian suburb analyst with deep knowledge of property markets, demographics, infrastructure, and investment potential across Australian suburbs. Your role is to provide comprehensive, data-driven suburb-level analysis that helps investors understand market dynamics, growth potential, and investment opportunities in specific suburbs. Always include specific numbers, percentages, and statistics in your analysis. Focus on suburb-wide trends, amenities, and characteristics rather than individual properties.'
      : 'You are an expert Australian property investment analyst with deep knowledge of real estate markets, financial analysis, and investment projections. Your role is to provide comprehensive, data-driven property investment analysis that covers all aspects of property investment decision-making. You have access to current market data and can provide specific calculations for rental yields, capital growth projections, and investment returns. Always include specific numbers, percentages, and dollar amounts in your analysis. Focus on practical, actionable insights that help investors make informed decisions about property purchases. Use current Australian market conditions and regulations in your analysis.';

    console.log('Calling Perplexity API with sonar model...');
    console.log('Report scope:', reportScope);
    console.log('Prompt length:', prompt.length);

    // Retry logic with exponential backoff
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second
    let response;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`API call attempt ${attempt}/${maxRetries}`);
        
        // Using the correct Perplexity API configuration based on their docs
        response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${perplexityApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'sonar-pro', // Multi-step reasoning with 2x more citations for comprehensive analysis
            messages: [
              {
                role: 'system',
                content: systemMessage
              },
              {
                role: 'user',
                content: prompt
              }
            ]
          }),
        });
        
        // If we got a response, break out of retry loop
        console.log(`✓ API call successful on attempt ${attempt}`);
        break;
        
      } catch (fetchError: any) {
        lastError = fetchError;
        console.error(`Network error on attempt ${attempt}/${maxRetries}:`, fetchError?.message || fetchError);
        
        // If this was the last attempt, return error
        if (attempt === maxRetries) {
          console.error('All retry attempts failed');
          const errorMsg = `Failed to connect to Perplexity API after ${maxRetries} attempts: ${fetchError?.message || 'Network error'}`;
          await markReportFailed(reportId, errorMsg);
          return new Response(JSON.stringify({ 
            error: errorMsg,
            success: false 
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // Calculate exponential backoff delay
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Safety check (should never happen given the retry logic above)
    if (!response) {
      const errorMsg = 'Failed to get response from Perplexity API';
      await markReportFailed(reportId, errorMsg);
      return new Response(JSON.stringify({ 
        error: errorMsg,
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
      
      await markReportFailed(reportId, errorMessage);
      return new Response(JSON.stringify({ 
        error: errorMessage,
        success: false 
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let data;
    let responseText;
    try {
      // Read response as text first (more reliable than direct .json())
      responseText = await response.text();
      console.log('✓ Response text received, length:', responseText.length);
      
      // Parse the text as JSON
      data = JSON.parse(responseText);
      console.log('✓ Response parsed successfully');
      console.log('✓ Response structure keys:', Object.keys(data));
    } catch (jsonError) {
      console.error('❌ Error parsing JSON response:', jsonError);
      console.error('❌ Raw response text (first 500 chars):', responseText?.substring(0, 500));
      const errorMsg = 'Invalid JSON response from Perplexity API';
      await markReportFailed(reportId, errorMsg);
      return new Response(JSON.stringify({ 
        error: errorMsg,
        success: false,
        details: jsonError.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Unexpected API response structure:', data);
      const errorMsg = 'Invalid response structure from Perplexity API';
      await markReportFailed(reportId, errorMsg);
      return new Response(JSON.stringify({ 
        error: errorMsg,
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    let reportContent = data.choices[0].message.content;
    
    if (!reportContent) {
      console.error('No content in API response');
      const errorMsg = 'No report content received from Perplexity API';
      await markReportFailed(reportId, errorMsg);
      return new Response(JSON.stringify({ 
        error: errorMsg,
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

- 🌐 **Website:** [npcservices.com.au](https://npcservices.com.au)
- 📧 **Email:** [admin@npcservices.com.au](mailto:admin@npcservices.com.au)
- 📱 **Phone:** [0433 005 110](tel:+61433005110)

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

    // Validate report structure against schema
    console.log('🔍 Validating report structure...');
    let schemaValidationFlags: any[] = [];
    
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
      
      if (supabaseUrl && supabaseAnonKey) {
        const schemaValidatorClient = createClient(supabaseUrl, supabaseAnonKey);
        
        const { data: schemaValidation, error: schemaError } = await schemaValidatorClient.functions.invoke(
          'report-schema-validator',
          {
            body: { reportContent }
          }
        );
        
        if (schemaError) {
          console.error('Schema validation error:', schemaError);
        } else if (schemaValidation) {
          console.log('✓ Schema validation complete');
          console.log('Schema valid:', schemaValidation.valid);
          console.log('Schema issues found:', schemaValidation.issues?.length || 0);
          
          // Convert schema issues to validation flags
          if (schemaValidation.issues && schemaValidation.issues.length > 0) {
            schemaValidationFlags = schemaValidation.issues.map((issue: any) => ({
              type: 'schema',
              severity: issue.severity || 'medium',
              field: issue.section || 'structure',
              message: issue.message,
              value: issue.details || null
            }));
          }
        }
      }
    } catch (validationError) {
      console.error('Error during schema validation:', validationError);
      // Continue without blocking report generation
    }

    // Update database if reportId provided
    if (reportId && supabaseClient) {
      console.log('Updating report in database with ID:', reportId);
      
      // Prepare property specs from property details
      const propertySpecs = {
        land_size_sqm: propertyDetails?.landSize || null,
        building_size_sqm: propertyDetails?.buildingSize || null,
        bedrooms: propertyDetails?.beds || null,
        bathrooms: propertyDetails?.baths || null,
        parking: propertyDetails?.parking || null,
        year_built: propertyDetails?.yearBuilt || null,
        property_type: propertyDetails?.propertyType || 'house',
        zoning: propertyDetails?.zoning || null,
        council_area: propertyDetails?.councilArea || null
      };
      
      // Prepare data sources tracking
      const dataSources = {
        demographics: enhancedData.demographics ? {
          source: 'abs',
          confidence: enhancedData.demographics.data_quality === 'live' ? 1.0 : 0.6,
          timestamp: new Date().toISOString()
        } : null,
        financials: enhancedData.financials ? {
          source: 'calculated',
          confidence: 1.0,
          timestamp: new Date().toISOString()
        } : null,
        marketData: enhancedData.domainData ? {
          source: 'domain',
          confidence: 0.9,
          timestamp: new Date().toISOString()
        } : null,
        locationIntelligence: enhancedData.locationIntelligence ? {
          source: 'google_maps',
          confidence: 0.95,
          timestamp: new Date().toISOString()
        } : null
      };
      
      // Combine financial validation flags with schema validation flags
      const allValidationFlags = [
        ...(enhancedData.validation?.flags || []),
        ...schemaValidationFlags
      ];
      
      // Prepare update object, preserving manual_overrides if they exist
      const updateData: any = {
        report_content: reportContent,
        sources_content: sourcesContent,
        demographics_data: enhancedData.demographics || null,
        economic_data: enhancedData.economics || null,
        financial_calculations: enhancedData.financials || null,
        investment_score: enhancedData.investmentScore || null,
        location_intelligence: enhancedData.locationIntelligence || null,
        property_specs: propertySpecs,
        validation_flags: allValidationFlags,
        calculation_version: '1.0.0',
        data_sources: dataSources,
        report_scope: reportScope, // Track the scope type
        status: 'completed'
      };
      
      // Preserve manual_overrides if they exist (don't overwrite with null)
      if (existingManualOverrides && Object.keys(existingManualOverrides).length > 0) {
        updateData.manual_overrides = existingManualOverrides;
        console.log('✓ Preserving manual overrides in database update');
      }
      
      const { error: updateError } = await supabaseClient
        .from('investment_reports')
        .update(updateData)
        .eq('id', reportId);

      if (updateError) {
        console.error('Error updating report:', updateError);
        throw new Error(`Failed to save report: ${updateError.message}`);
      }
      
      console.log('Report successfully updated in database with validation and property specs');
      
      // Log data quality score
      if (enhancedData.validation) {
        console.log('📊 Report Quality Score:', enhancedData.validation.qualityScore, '/100');
      }
    }

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
    
    // Update report status to failed if reportId provided
    if (requestBody?.reportId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (supabaseUrl && supabaseKey) {
          const supabaseClient = createClient(supabaseUrl, supabaseKey);
          await supabaseClient
            .from('investment_reports')
            .update({ 
              status: 'failed',
              error_message: error?.message || 'An unexpected error occurred'
            })
            .eq('id', requestBody.reportId);
          
          console.log('Updated report status to failed');
        }
      } catch (updateError) {
        console.error('Error updating report status to failed:', updateError);
      }
    }
    
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