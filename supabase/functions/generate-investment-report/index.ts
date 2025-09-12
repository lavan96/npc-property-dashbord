import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('Function invoked with method:', req.method);
  
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
      throw new Error('Invalid JSON in request body');
    }
    
    const { propertyAddress, propertyDetails } = requestBody;
    console.log('Property address:', propertyAddress);
    
    if (!propertyAddress) {
      console.error('Property address is missing');
      throw new Error('Property address is required');
    }

    // Check for Perplexity API key
    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    console.log('Perplexity API key configured:', !!perplexityApiKey);
    console.log('API key length:', perplexityApiKey ? perplexityApiKey.length : 0);
    
    if (!perplexityApiKey) {
      console.error('Perplexity API key not found in environment');
      throw new Error('Perplexity API key not configured. Please set PERPLEXITY_API_KEY in Supabase secrets.');
    }

    // Create a simple test prompt first
    const prompt = `Provide a brief property investment analysis for: ${propertyAddress}

Please provide:
1. Basic property overview
2. Estimated rental yield range
3. Brief market assessment
4. Simple investment recommendation

Keep the response concise (under 1000 words).`;

    console.log('Calling Perplexity API...');
    console.log('Prompt length:', prompt.length);

    let response;
    try {
      response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${perplexityApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.1-sonar-small-128k-online', // Using smaller model for testing
          messages: [
            {
              role: 'system',
              content: 'You are a property investment analyst. Provide concise, practical investment advice for Australian properties.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 1500,
          temperature: 0.3
        }),
      });
    } catch (fetchError) {
      console.error('Network error calling Perplexity API:', fetchError);
      throw new Error(`Failed to connect to Perplexity API: ${fetchError.message}`);
    }

    console.log('Perplexity API response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error response:', errorText);
      
      if (response.status === 401) {
        throw new Error('Invalid Perplexity API key. Please check your PERPLEXITY_API_KEY secret.');
      } else if (response.status === 429) {
        throw new Error('Perplexity API rate limit exceeded. Please try again later.');
      } else {
        throw new Error(`Perplexity API error (${response.status}): ${errorText}`);
      }
    }

    let data;
    try {
      data = await response.json();
      console.log('Response parsed successfully');
      console.log('Response structure keys:', Object.keys(data));
    } catch (jsonError) {
      console.error('Error parsing JSON response:', jsonError);
      throw new Error('Invalid JSON response from Perplexity API');
    }
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Unexpected API response structure:', data);
      throw new Error('Invalid response structure from Perplexity API');
    }
    
    const reportContent = data.choices[0].message.content;
    
    if (!reportContent) {
      console.error('No content in API response');
      throw new Error('No report content received from Perplexity API');
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
      error: error.message,
      success: false,
      timestamp: new Date().toISOString()
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});