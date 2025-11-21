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

    // Extract metadata from comparison data
    const reportTitle = comparisonData.report_title || `COMPARISON ANALYSIS - ${comparisonData.property_count} PROPERTIES`;
    const propertyAddresses = comparisonData.property_addresses || [];
    const propertyStates = comparisonData.property_states || [];
    
    console.log(`Formatting report: ${reportTitle}`);

    // Create a comprehensive prompt for Perplexity to format the comparison data
    const prompt = `You are a professional real estate analyst report formatter. Convert the following property comparison analysis data into a beautifully formatted markdown report.

**CRITICAL: THIS REPORT MUST FOLLOW THE EXACT STRUCTURE BELOW**

# ${reportTitle}

**Properties Analyzed:** ${propertyAddresses.join(' | ')}
**States:** ${propertyStates.join(', ')}
**Analysis Date:** ${new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' })}

---

## MANDATORY STRUCTURE - ALL 10 SECTIONS REQUIRED:

1. **EXECUTIVE SUMMARY** (2-3 paragraphs covering overview, key findings, critical differentiators)
2. **OVERALL RANKINGS** (Table format with: Rank | Property | Score | Grade | Best For | Key Strengths | Key Concerns)
3. **FINANCIAL PERFORMANCE COMPARISON** (Must include: Best Yield, Best Cash Flow, Best ROI, Best Value)
4. **LOCATION INTELLIGENCE COMPARISON** (Must include: Best Infrastructure, Best Growth Corridor, Best Schools, Best Lifestyle)
5. **RISK-ADJUSTED RECOMMENDATIONS** (Risk levels, specific risks per property, safest option, best risk/reward)
6. **INVESTOR PROFILE MATCHING** (Match each property to specific investor types with reasoning)
7. **MARKET TIMING & STRATEGY** (Buy order priority, recommended holding periods, exit strategies)
8. **COMPETITIVE ADVANTAGES** (3-5 unique selling points per property)
9. **RED FLAGS & CONCERNS** (Specific concerns per property with severity: LOW/MEDIUM/HIGH/CRITICAL)
10. **FINAL RECOMMENDATION** (Best overall property, runner-ups, properties to avoid/reconsider, alternative scenarios)

**FORMATTING REQUIREMENTS:**
1. Use proper markdown with headers (##, ###), tables, and lists
2. Convert ALL camelCase/snake_case to readable text (e.g., "finalScore" → "Final Score")
3. Format numbers: currency with $, percentages with %, decimals for scores
4. Create comparison tables where appropriate
5. Use bullet points for features/risks
6. Make content professional and easy to read
7. Do NOT include JSON or raw data - only clean formatted text
8. Use **bold** for property addresses and key metrics
9. Include horizontal rules (---) between major sections
10. Ensure each property is consistently numbered throughout the report
**DATA VALIDATION RULES:**
- If data is missing/null, show "Data unavailable" or "N/A" - never omit sections
- All scores must be on 0-100 scale
- All severity ratings must be: LOW, MEDIUM, HIGH, or CRITICAL
- All currency must use Australian format ($XXX,XXX)
- Property numbers must match across all sections

---

## MANDATORY CLOSING SECTIONS:

### Contact Information
**NPC Services**
- **Phone:** 0433 005 110
- **Email:** admin@npcservices.com.au
- **Website:** npcservices.com.au

---

### Professional Disclaimer

As a Professional Property Consultant & Buyers Agent, we provide information and advice based on our expertise and experience in the real estate market. Please be aware that the advice and insights offered are for general informational purposes only and should not be considered financial advice.

While we strive to ensure the accuracy and relevance of the information provided, real estate markets are dynamic and subject to change and cannot guarantee the future performance or outcomes of any property investment.

It is important to understand that real estate investments carry risks, including market fluctuations, changes in property values, and potential financial losses.

Our services include assisting you in identifying and evaluating potential opportunities, negotiating purchase terms, and navigating the transaction process.

Any decisions to purchase, sell, or invest in real estate should be made after careful consideration and consultation with appropriate financial, legal, and tax advisors.

By engaging our services, you acknowledge that you have read and understood this disclaimer and agree to take full responsibility for your property-related decisions.

Always conduct your own research and due diligence to ensure that any property transaction aligns with your financial objectives and risk profile.

---

**COMPARISON DATA TO FORMAT:**

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
