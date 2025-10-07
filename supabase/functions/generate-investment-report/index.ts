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
    
    // Detect analysis mode
    if (/^\d{4}$/.test(propertyAddress.trim()) || /postcode\s+\d{4}/i.test(propertyAddress)) {
      analysisMode = 'postcode';
      const postcodeMatch = propertyAddress.match(/\b(\d{4})\b/);
      if (postcodeMatch) {
        formattedInput = `Postcode ${postcodeMatch[1]}, Australia`;
      }
    } else if (/(western australia|wa|new south wales|nsw|victoria|vic|queensland|qld|south australia|sa|tasmania|tas|northern territory|nt|australian capital territory|act)/i.test(propertyAddress)) {
      analysisMode = 'state';
      // Keep the state input as is
    }

    console.log('Analysis mode:', analysisMode);
    console.log('Formatted input:', formattedInput);

    // Fetch enhanced data from multiple sources
    console.log('Fetching enhanced data from multiple APIs...');
    
    interface EnhancedData {
      demographics?: any;
      economics?: any;
      financials?: any;
      locationIntelligence?: any;
      investmentScore?: any;
    }
    
    let enhancedData: EnhancedData = {};
    
    try {
      // Extract postcode and state from address for API calls
      const postcodeMatch = formattedInput.match(/\b(\d{4})\b/);
      const stateMatch = formattedInput.match(/\b(NSW|VIC|QLD|WA|SA|TAS|NT|ACT)\b/i);
      const postcode = postcodeMatch ? postcodeMatch[1] : null;
      const state = stateMatch ? stateMatch[1].toUpperCase() : 'NSW';

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
- Gross Rental Yield: ${enhancedData.financials.keyMetrics?.grossRentalYield || 'N/A'}%
- Net Rental Yield: ${enhancedData.financials.keyMetrics?.netRentalYield || 'N/A'}%
- Weekly Net Cash Flow: $${enhancedData.financials.keyMetrics?.weeklyNet || 'N/A'}
- Loan-to-Value Ratio: ${enhancedData.financials.keyMetrics?.lvr || 'N/A'}%
- Stamp Duty: $${enhancedData.financials.initialCosts?.stampDuty || 'N/A'}
` : ''}

${enhancedData.locationIntelligence ? `
LOCATION INTELLIGENCE AVAILABLE:
- Walk Score: ${enhancedData.locationIntelligence.walkScore || 'N/A'}
- Nearest Transit: ${enhancedData.locationIntelligence.transport?.nearestStation || 'N/A'} (${enhancedData.locationIntelligence.transport?.distanceToStation || 'N/A'}km)
- CBD Commute: ${enhancedData.locationIntelligence.commute?.durationMinutes || 'N/A'} minutes
- Nearest School: ${enhancedData.locationIntelligence.schools?.nearestSchool || 'N/A'} (${enhancedData.locationIntelligence.schools?.distanceToSchool || 'N/A'}km)
- Schools Within 3km: ${enhancedData.locationIntelligence.schools?.schoolsWithin3km || 'N/A'}
- Healthcare Facilities: ${enhancedData.locationIntelligence.healthcare?.facilitiesWithin5km || 'N/A'} within 5km
- Shopping Centers: ${enhancedData.locationIntelligence.lifestyle?.shoppingCenters || 'N/A'}
- Parks & Recreation: ${enhancedData.locationIntelligence.lifestyle?.parks || 'N/A'}
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

5. Property-Level Information (Address Mode Only)

Property type (house, townhouse, unit, etc.).

Number of bedrooms, bathrooms, parking spaces.

Land size and building size.

Year built and overall condition.

Asking price (if listed).

Comparison to suburb median.

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
        economics: enhancedData.economics
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