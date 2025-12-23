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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const systemPrompt = `You are an Australian property investment expense estimator. Your task is to provide realistic estimates for annual property expenses based on the property address, purchase price, and weekly rent.

You must respond with ONLY a valid JSON object containing the following fields (all values in AUD, annual amounts):
- bodyCorporateFees: Annual body corporate/strata fees (0 if house, typically $2,000-$8,000 for apartments)
- landTax: Annual land tax (based on state and land value, often 0 for properties under threshold)
- councilRates: Annual council rates (typically $1,500-$4,000)
- waterRates: Annual water rates (typically $800-$1,500)
- solicitorFees: Conveyancing/legal fees for purchase (typically $1,500-$3,000)
- buildingLandlordInsurance: Annual building and landlord insurance (typically $1,200-$2,500)
- propertyManagementFees: Property management fee as percentage of rent (typically 7-9%)
- repairsMaintenance: Annual repairs and maintenance allowance (typically 0.5-1% of property value)

Consider:
- Location-specific costs (Sydney/Melbourne more expensive than regional)
- Property type (apartments have strata, houses have higher maintenance)
- Property value affects insurance and some fees
- Use realistic Australian market rates for 2024-2025

Respond with ONLY the JSON object, no markdown, no explanation.`;

    const userPrompt = `Estimate annual property expenses for:
Property Address: ${propertyAddress}
Purchase Price: $${purchasePrice?.toLocaleString() || 'Unknown'}
Weekly Rent: $${weeklyRent?.toLocaleString() || 'Unknown'}
Property Type: ${propertyType || 'Unknown'}

Provide realistic estimates based on the location and property characteristics.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No response from AI');
    }

    console.log('AI Response:', content);

    // Parse JSON from response (handle potential markdown wrapping)
    let estimates;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      estimates = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      throw new Error('Failed to parse expense estimates');
    }

    // Validate and sanitize the response
    const validatedEstimates = {
      bodyCorporateFees: Math.round(Number(estimates.bodyCorporateFees) || 0),
      landTax: Math.round(Number(estimates.landTax) || 0),
      councilRates: Math.round(Number(estimates.councilRates) || 2500),
      waterRates: Math.round(Number(estimates.waterRates) || 1000),
      solicitorFees: Math.round(Number(estimates.solicitorFees) || 2000),
      buildingLandlordInsurance: Math.round(Number(estimates.buildingLandlordInsurance) || 1800),
      propertyManagementFees: Number(estimates.propertyManagementFees) || 8,
      repairsMaintenance: Math.round(Number(estimates.repairsMaintenance) || 3000),
    };

    console.log('Validated estimates:', validatedEstimates);

    return new Response(JSON.stringify({
      success: true,
      estimates: validatedEstimates,
      propertyAddress,
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
