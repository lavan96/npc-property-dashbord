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
    console.log('Received request:', req.method);
    
    const requestBody = await req.json();
    console.log('Request body:', requestBody);
    
    const { propertyAddress, propertyDetails } = requestBody;
    
    if (!propertyAddress) {
      console.error('Property address is missing');
      throw new Error('Property address is required');
    }

    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!perplexityApiKey) {
      console.error('Perplexity API key not found in environment');
      throw new Error('Perplexity API key not configured');
    }
    
    console.log('Property address:', propertyAddress);
    console.log('API key configured:', !!perplexityApiKey);

    // Create comprehensive prompt for property investment analysis
    const prompt = `Analyze this Australian property for investment potential:

PROPERTY: ${propertyAddress}
${propertyDetails ? `DETAILS: Price: $${propertyDetails.price || 'Not specified'}, Type: ${propertyDetails.propertyType || 'Not specified'}, Beds: ${propertyDetails.beds || 'Not specified'}, Baths: ${propertyDetails.baths || 'Not specified'}` : ''}

Provide a detailed investment analysis covering:

## 1. PROPERTY OVERVIEW
- Current asking price vs local market prices
- Property specifications and condition
- Estimated market value range

## 2. FINANCIAL ANALYSIS  
- Estimated weekly rental income based on comparable properties
- Gross rental yield calculation
- Net rental yield (after expenses)
- Local vacancy rates and rental demand
- Estimated ongoing costs (rates, maintenance, etc.)

## 3. INVESTMENT POTENTIAL
- Recent comparable sales in the area (last 6 months)
- Recent comparable rentals and average days on market
- Suburb population and demographic trends
- Future growth drivers and infrastructure projects
- Development potential and zoning considerations

## 4. LOCATION ASSESSMENT
- Proximity to transport, schools, shopping, healthcare
- Local demographics and target tenant profile
- Historical price growth for the suburb
- Economic drivers and employment centers

## 5. 10-YEAR PROJECTION
Provide three scenarios with specific numbers:
- Conservative: Lower growth assumptions
- Moderate: Market average expectations  
- Optimistic: Above average growth potential

Include year-by-year cashflow projections and total ROI for each scenario.

## 6. INVESTMENT RECOMMENDATION
- Overall investment grade (A-F) with reasoning
- Key risks and opportunities
- Recommended action (buy/wait/negotiate/avoid)
- Suitability for different investor types

Focus on current Australian market conditions (2024-2025) with specific data where possible.`;

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

    console.log('Perplexity API response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error response:', errorText);
      console.error('Response status:', response.status);
      console.error('Response headers:', Object.fromEntries(response.headers.entries()));
      throw new Error(`Perplexity API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log('Perplexity API response data keys:', Object.keys(data));
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Unexpected API response structure:', data);
      throw new Error('Invalid response structure from Perplexity API');
    }
    
    const reportContent = data.choices[0].message.content;
    
    if (!reportContent) {
      console.error('No content in API response');
      throw new Error('No report content received from Perplexity API');
    }

    console.log('Report generated successfully, length:', reportContent.length);

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