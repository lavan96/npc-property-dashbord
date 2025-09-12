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

    // Create a focused prompt for investment analysis
    const prompt = `Analyze this Australian property for investment potential:

PROPERTY: ${propertyAddress}
${propertyDetails ? `DETAILS: Price: $${propertyDetails.price || 'Not specified'}, Type: ${propertyDetails.propertyType || 'Not specified'}, Beds: ${propertyDetails.beds || 'Not specified'}, Baths: ${propertyDetails.baths || 'Not specified'}` : ''}

Please provide a comprehensive investment analysis covering:

1. FINANCIAL ANALYSIS
- Current asking price vs local market comparison
- Estimated weekly rental income
- Gross and net rental yield calculations
- Local vacancy rates and rental demand

2. INVESTMENT POTENTIAL
- Recent comparable sales (last 6 months)
- Recent rental comparisons
- Suburb growth trends and demographics
- Future growth drivers and infrastructure

3. LOCATION ASSESSMENT
- Transport, schools, shopping proximity
- Target tenant demographics
- Historical price growth
- Economic drivers

4. 10-YEAR PROJECTION
Provide three scenarios (conservative, moderate, optimistic) with:
- Annual property value growth estimates
- Rental income growth projections
- Total return on investment calculations

5. RECOMMENDATION
- Investment grade (A-F) with reasoning
- Key risks and opportunities
- Buy/wait/negotiate recommendation
- Investor suitability assessment

Focus on current Australian market conditions with specific data and numbers where possible.`;

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
          model: 'sonar', // Basic sonar model as per official docs
          messages: [
            {
              role: 'system',
              content: 'You are an expert Australian property investment analyst. Provide detailed, accurate investment analysis with specific numbers and current market data.'
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