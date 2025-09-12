import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { propertyAddress, propertyDetails } = await req.json();
    
    if (!propertyAddress) {
      throw new Error('Property address is required');
    }

    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!perplexityApiKey) {
      throw new Error('Perplexity API key not configured');
    }

    // Create comprehensive prompt for property investment analysis
    const prompt = `Please provide a comprehensive property investment analysis for the following property:

ADDRESS: ${propertyAddress}
${propertyDetails ? `PROPERTY DETAILS: ${JSON.stringify(propertyDetails, null, 2)}` : ''}

Please structure your analysis to include ALL of the following sections:

## 1. PROPERTY BASICS
- Property type, bedrooms, bathrooms, car spaces
- Land size and building size (if available)
- Year built and condition assessment
- Current asking price vs recent sales

## 2. FINANCIAL SNAPSHOT
- Purchase price comparison vs suburb median price
- Estimated current rental income (weekly) based on comparable properties
- Gross rental yield calculation (%)
- Net rental yield estimation (%)
- Local vacancy rates and rental demand
- Council rates and potential strata fees
- Stamp duty estimate for this state
- Loan repayment estimates for different loan scenarios

## 3. INVESTMENT & GROWTH POTENTIAL
- Average days on market for rentals in this suburb
- Recent comparable rental properties (last 3-6 months)
- Recent comparable sales (last 6 months, similar properties)
- Suburb population growth trends and forecasts
- Owner-occupier vs investor ratio in the area
- Future capital growth potential based on:
  - Planned infrastructure developments
  - Zoning and development potential
  - Economic drivers in the area
- Development potential (granny flat, subdivision possibilities)
- Tax benefits and depreciation opportunities

## 4. LOCATION & SUBURB PROFILE
- Suburb demographics (families, professionals, students, etc.)
- Proximity analysis:
  - Public transport (trains, buses)
  - Schools (primary, secondary, universities)
  - Shopping centers and amenities
  - Hospitals and medical facilities
- Upcoming infrastructure projects (new rail lines, highways, shopping centers)
- Historical capital growth rates for this suburb (5-10 year trends)

## 5. 10-YEAR INVESTMENT PROJECTION
- Compound annual growth rate projections based on historical data
- Detailed cashflow projections year by year including:
  - Rental income growth assumptions
  - Property value appreciation
  - Ongoing costs escalation
  - Net cashflow position over time
- Provide THREE scenarios:
  - Conservative (pessimistic): Lower growth rates
  - Moderate (realistic): Market average growth
  - Optimistic: Above-average growth
- Total return on investment calculations for each scenario

## 6. INVESTMENT SUMMARY & RECOMMENDATIONS
- Overall investment grade (A-F rating with justification)
- Key risks and opportunities
- Suitability for different investor profiles (first-time, experienced, retiree)
- Recommended action (buy, wait, negotiate, avoid) with reasoning

Please ensure all data is current (2024/2025) and provide specific numbers, percentages, and dollar amounts wherever possible. Include data sources and assumptions made in your analysis.`;

    console.log('Sending request to Perplexity API...');

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-large-128k-online',
        messages: [
          {
            role: 'system',
            content: 'You are an expert property investment analyst with deep knowledge of Australian real estate markets. Provide detailed, accurate, and current market analysis based on the latest available data. Include specific numbers, calculations, and data sources where possible.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 4000,
        return_images: false,
        return_related_questions: false,
        search_recency_filter: 'month',
        frequency_penalty: 1,
        presence_penalty: 0
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', errorText);
      throw new Error(`Perplexity API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const reportContent = data.choices[0].message.content;

    console.log('Report generated successfully');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user ID from the authorization header
    const authHeader = req.headers.get('authorization');
    let userId = null;
    
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        userId = user?.id;
      } catch (error) {
        console.log('Could not get user from token:', error);
      }
    }

    // Save the report to the database
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
        console.error('Error saving report:', saveError);
        // Continue anyway - return the report even if saving fails
      } else {
        console.log('Report saved successfully:', savedReport.id);
      }
    }

    return new Response(JSON.stringify({ 
      reportContent,
      propertyAddress 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-investment-report function:', error);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});