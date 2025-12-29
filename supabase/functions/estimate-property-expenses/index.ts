import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { propertyAddress, purchasePrice, weeklyRent, propertyType } = await req.json();
    
    console.log('📊 Estimating property expenses for:', propertyAddress);
    console.log('Purchase Price:', purchasePrice, 'Weekly Rent:', weeklyRent);

    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!perplexityApiKey) {
      throw new Error('PERPLEXITY_API_KEY is not configured');
    }

    const userPrompt = `I need accurate, current Australian property expense estimates for this investment property:

Property Address: ${propertyAddress}
Purchase Price: $${purchasePrice?.toLocaleString() || 'Unknown'}
Weekly Rent: $${weeklyRent?.toLocaleString() || 'Unknown'}
Property Type: ${propertyType || 'Unknown'}

Please search for and provide realistic current estimates for the following annual expenses in AUD. Use current 2024-2025 rates specific to this property's location:

1. Body Corporate / Strata Fees (annual) - $0 if it's a house, otherwise typical strata fees for the area
2. Land Tax (annual) - based on current state thresholds and land value
3. Council Rates (annual) - search for typical rates in this council area
4. Water Rates (annual) - typical for this area
5. Solicitor/Conveyancing Fees (one-off purchase cost)
6. Building & Landlord Insurance (annual)
7. Property Management Fee Percentage - JUST the percentage number (typically 7-9), NOT a dollar amount. For example: 8 means 8%
8. Repairs & Maintenance allowance (annual)

IMPORTANT: For propertyManagementFeePercent, return ONLY the percentage number (e.g., 7, 8, or 9), NOT a dollar amount!

Respond with ONLY a valid JSON object in this exact format, no other text:
{
  "bodyCorporateFees": number (annual $ amount),
  "landTax": number (annual $ amount),
  "councilRates": number (annual $ amount),
  "waterRates": number (annual $ amount),
  "solicitorFees": number ($ amount),
  "buildingLandlordInsurance": number (annual $ amount),
  "propertyManagementFeePercent": number (PERCENTAGE ONLY, e.g. 8 for 8%),
  "repairsMaintenance": number (annual $ amount)
}`;

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
            content: 'You are an Australian property investment expense estimator. Search for current, accurate expense data for the specific property location. Always respond with ONLY valid JSON, no markdown or explanation.' 
          },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', response.status, errorText);
      throw new Error(`Perplexity API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const citations = data.citations || [];
    
    if (!content) {
      throw new Error('No response from Perplexity');
    }

    console.log('Perplexity Response:', content);
    console.log('Citations:', citations);

    // Parse JSON from response (handle potential markdown wrapping)
    let estimates;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      estimates = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error('Failed to parse Perplexity response:', parseError);
      console.error('Raw content:', content);
      throw new Error('Failed to parse expense estimates');
    }

    // Validate and sanitize the response
    // Handle both old field name (propertyManagementFees) and new (propertyManagementFeePercent)
    let pmPercent = Number(estimates.propertyManagementFeePercent) || Number(estimates.propertyManagementFees) || 8;
    
    // If the value looks like a dollar amount (>20), it's likely an error - use default
    if (pmPercent > 20) {
      console.warn('Property management value looks like a dollar amount, using default 8%:', pmPercent);
      pmPercent = 8;
    }
    
    const validatedEstimates = {
      bodyCorporateFees: Math.round(Number(estimates.bodyCorporateFees) || 0),
      landTax: Math.round(Number(estimates.landTax) || 0),
      councilRates: Math.round(Number(estimates.councilRates) || 2500),
      waterRates: Math.round(Number(estimates.waterRates) || 1000),
      solicitorFees: Math.round(Number(estimates.solicitorFees) || 2000),
      buildingLandlordInsurance: Math.round(Number(estimates.buildingLandlordInsurance) || 1800),
      propertyManagementFees: pmPercent, // This is a PERCENTAGE value (e.g., 8 for 8%)
      repairsMaintenance: Math.round(Number(estimates.repairsMaintenance) || 3000),
    };

    console.log('Validated estimates:', validatedEstimates);

    return new Response(JSON.stringify({
      success: true,
      estimates: validatedEstimates,
      propertyAddress,
      citations, // Include sources for transparency
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error estimating property expenses:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
