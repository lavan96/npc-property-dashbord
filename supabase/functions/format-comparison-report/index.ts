import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { comparisonData } = await req.json();
    console.log('Formatting comparison report with Perplexity...');

    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!perplexityApiKey) {
      throw new Error('PERPLEXITY_API_KEY not configured');
    }

    // Create a comprehensive prompt for Perplexity to format the comparison data
    const prompt = `You are a professional real estate analyst report formatter. Convert the following property comparison analysis data into a beautifully formatted markdown report.

REQUIREMENTS:
1. Use proper markdown formatting with headers, tables, and lists
2. Convert ALL camelCase and snake_case variable names into readable text (e.g., "finalScore" → "Final Score", "property_address" → "Property Address")
3. Format numbers appropriately (currency with $ signs, percentages with %, etc.)
4. Create tables for comparing properties side-by-side where appropriate
5. Use bullet points for lists of features or risks
6. Structure the report with clear sections: Executive Summary, Rankings, Financial Analysis, Location Intelligence, Risk Assessment, Recommendations, and Important Considerations
7. Make the content professional and easy to read
8. Do NOT include any JSON code or raw data structures - only clean, formatted text
9. Use bold for property addresses and important metrics
10. Include divider lines (---) between major sections

Here is the comparison data to format:

${JSON.stringify(comparisonData, null, 2)}

Please return ONLY the formatted markdown report, no additional commentary.`;

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a professional real estate report formatter. Format the data into clean, beautiful markdown without any JSON or code. Use tables, headers, and proper formatting.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 8000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', response.status, errorText);
      throw new Error(`Perplexity API error: ${response.status}`);
    }

    const data = await response.json();
    const formattedContent = data.choices[0]?.message?.content;

    if (!formattedContent) {
      throw new Error('No formatted content returned from Perplexity');
    }

    console.log('Successfully formatted comparison report');

    return new Response(
      JSON.stringify({ formattedContent }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in format-comparison-report:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: 'Failed to format comparison report'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
