import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    // Create comprehensive prompt based on client requirements
    const prompt = `Provide a comprehensive property investment analysis for this Australian property:

PROPERTY: ${propertyAddress}
${propertyDetails ? `CURRENT DETAILS: Price: $${propertyDetails.price || 'Not specified'}, Type: ${propertyDetails.propertyType || 'Not specified'}, Beds: ${propertyDetails.beds || 'Not specified'}, Baths: ${propertyDetails.baths || 'Not specified'}` : ''}

Please structure your analysis to include ALL of the following sections with specific data and calculations:

## 1. PROPERTY BASICS
- Address (suburb, state, postcode)
- Property type (house, townhouse, apartment, duplex, land)
- Bedrooms, bathrooms, car spaces
- Land size (sqm) and building size (sqm, if available)
- Year built / condition assessment
- Asking price / price guide vs current listing

## 2. FINANCIAL SNAPSHOT
- Purchase price vs suburb median price comparison
- Estimated rental income (weekly, based on property characteristics)
- Gross rental yield (%) calculation
- Net rental yield (%) calculation
- Vacancy rate (suburb level)
- Council rates & strata fees (if applicable)
- Loan repayment estimate (if financed at 80% LVR)
- Stamp duty estimate for the state

## 3. INVESTMENT & GROWTH POTENTIAL
- Suburb rental demand (average days on market)
- Comparable rentals (median vs property's estimate)
- Comparable sales (recent similar properties in last 6 months)
- Suburb population growth & forecasts
- Owner-occupier vs investor ratio in the suburb
- Future capital growth potential (based on infrastructure & demand)
- Development potential (zoning, granny flat, subdivision possibilities)
- Tax benefits (e.g., depreciation schedule if new build)

## 4. LOCATION & SUBURB PROFILE
- Suburb name & state with demographic overview
- Proximity to transport, shops, schools, hospitals, universities
- Local demographics (families, students, professionals, etc.)
- Upcoming infrastructure projects (new rail, highways, shopping centres, etc.)
- Suburb's historical capital growth rate (5-10 year trends)

## 5. CALCULATION & PROJECTION
Using the above data, provide a 10-year compounding annual investment calculation including:
- Year-by-year property value projections with compound growth
- Annual rental income growth estimates
- Estimated cashflow position over time (positive/negative)
- Total return on investment calculation
- Break-even analysis and cash-on-cash returns
- Scenarios: Conservative (3-4% growth), Moderate (5-6% growth), Optimistic (7-8% growth)

## 6. INVESTMENT SUMMARY & RECOMMENDATION
- Overall investment grade (A-F rating with detailed justification)
- Key risks and opportunities
- Recommended action (buy, wait, negotiate, avoid) with specific reasoning
- Suitability for different investor profiles (first-time, experienced, retiree)
- Timeline recommendations and market timing considerations

Please ensure all calculations use current Australian market data (2024-2025) and provide specific numbers, percentages, and dollar amounts wherever possible. Include data sources and methodology for all estimates and projections.`;

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
    } catch (fetchError) {
      console.error('Network error calling Perplexity API:', fetchError);
      return new Response(JSON.stringify({ 
        error: `Failed to connect to Perplexity API: ${fetchError.message}`,
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
    
    const reportContent = data.choices[0].message.content;
    
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

    console.log('Report generated successfully, content length:', reportContent.length);

    // Try to save to database (optional, don't fail if this doesn't work)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      
      if (supabaseUrl && supabaseKey) {
        console.log('Attempting to save report to database...');
        const supabase = createClient(supabaseUrl, supabaseKey);

        const authHeader = req.headers.get('authorization');
        let userId = null;
        
        if (authHeader) {
          try {
            const token = authHeader.replace('Bearer ', '');
            const { data: { user } } = await supabase.auth.getUser(token);
            userId = user?.id;
            console.log('User ID extracted:', !!userId);
          } catch (authError) {
            console.log('Could not get user from token:', authError);
          }
        }

        if (userId) {
          const { data: savedReport, error: saveError } = await supabase
            .from('investment_reports')
            .insert({
              property_address: propertyAddress,
              property_listing_id: propertyDetails?.id || null,
              report_content: reportContent,
              generated_by: userId
            })
            .select()
            .single();

          if (saveError) {
            console.error('Error saving report to database:', saveError);
          } else {
            console.log('Report saved successfully with ID:', savedReport.id);
          }
        }
      }
    } catch (dbError) {
      console.error('Database save failed (continuing anyway):', dbError);
    }

    // Return successful response
    const responseData = { 
      reportContent,
      propertyAddress,
      success: true
    };

    console.log('Returning successful response');
    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('Error in generate-investment-report function:', error);
    console.error('Error stack:', error.stack);
    
    const errorResponse = { 
      error: error.message || 'An unexpected error occurred',
      success: false,
      timestamp: new Date().toISOString()
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});