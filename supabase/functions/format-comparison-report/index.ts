import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Post-process content to fix common formatting issues
function sanitizeFormattedContent(content: string): string {
  let sanitized = content;
  
  // Fix HTML entity encoding issues
  sanitized = sanitized.replace(/&#x26;/g, '&');
  sanitized = sanitized.replace(/&#38;/g, '&');
  sanitized = sanitized.replace(/&amp;/g, '&');
  sanitized = sanitized.replace(/&#x27;/g, "'");
  sanitized = sanitized.replace(/&#39;/g, "'");
  sanitized = sanitized.replace(/&#x22;/g, '"');
  sanitized = sanitized.replace(/&#34;/g, '"');
  sanitized = sanitized.replace(/&lt;/g, '<');
  sanitized = sanitized.replace(/&gt;/g, '>');
  sanitized = sanitized.replace(/&nbsp;/g, ' ');
  
  // Ensure proper markdown heading formatting
  sanitized = sanitized.replace(/^([A-Z][A-Z\s&]+)$/gm, (match) => {
    // If it's an all-caps line without # prefix, add it
    if (!match.startsWith('#')) {
      return `# ${match}`;
    }
    return match;
  });
  
  // Fix bullet points that may have been merged in table cells
  // Convert semicolons followed by capital letters to bullet breaks
  sanitized = sanitized.replace(/([a-z0-9%)])(\s*)([A-Z][a-z])/g, '$1; $3');
  
  return sanitized;
}

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
    const propertyCount = comparisonData.property_count || propertyAddresses.length;
    
    console.log(`Formatting report: ${reportTitle} with ${propertyCount} properties`);

    // Create numbered property list for clear reference
    const numberedProperties = propertyAddresses.map((addr: string, idx: number) => 
      `Property ${idx + 1}: ${addr}`
    ).join('\n');

    // Create explicit ranking examples with actual property addresses
    // Use special marker ___RANK_HEADING___ to signal PDF generator for special styling
    const rankingExamples = propertyAddresses.map((addr: string, idx: number) => 
      `___RANK_HEADING___**Rank ${idx + 1}: ${addr}**

- **Score:** [XX.X]/100 | **Grade:** [A/B/C/D]
- **Best For:** [Investor type]
- **Key Strengths:** [Strength 1], [Strength 2], [Strength 3]
- **Key Concerns:** [Concern 1], [Concern 2]`
    ).join('\n\n---\n\n');

    // Create a comprehensive prompt for Perplexity to format the comparison data
    const prompt = `You are a professional real estate analyst report formatter. Convert the following property comparison analysis data into a beautifully formatted markdown report.

**CRITICAL FORMATTING RULES - READ CAREFULLY:**

1. **HTML ENTITIES**: Use actual characters, NOT HTML entities. Write "&" not "&#x26;" or "&amp;". Write "'" not "&#x27;".

2. **COMPLETE RANKINGS**: The Overall Rankings section MUST include ALL ${propertyCount} properties with their FULL ADDRESSES.

3. **PROPERTY NUMBERING**: Use consistent property numbering throughout:
${numberedProperties}

4. **TABLE FORMATTING**:
   - Keep table rows complete - do not split across pages
   - In "Key Strengths" column, separate each strength with " • " (bullet separator)
   - Example: "Strong yield (6.5%) • Good location • Low vacancy"
   - Do NOT use line breaks within table cells

---

# ${reportTitle}

**Properties Analyzed:** ${propertyAddresses.join(' | ')}
**States:** ${propertyStates.join(', ')}
**Analysis Date:** ${new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' })}

---

## MANDATORY STRUCTURE - ALL 10 SECTIONS REQUIRED:

### 1. EXECUTIVE SUMMARY
Write 2-3 paragraphs covering: overview of all ${propertyCount} properties, key findings, critical differentiators, and top recommendation.

### 2. OVERALL RANKINGS
Format each property ranking as a paragraph (NOT a table). You MUST use the EXACT property addresses shown below.

**IMPORTANT**: The ranking order should be based on the investment scores from the comparison data (highest score = Rank 1). Each property MUST include its FULL ADDRESS in the header.

${rankingExamples}

**CRITICAL**: 
- Include ALL ${propertyCount} properties with complete details
- Each property header MUST include the FULL property address (e.g., "21/11 Rowlands Street, Kewdale, WA 6105" NOT just "Property 2")
- Do NOT use tables for rankings
- Rankings should be ordered by investment score (highest first)

### 3. FINANCIAL PERFORMANCE COMPARISON
Include subsections:
- **Best Yield**: Property X - X.XX% Gross / X.XX% Net (with explanation)
- **Best Cash Flow**: Property X - $X,XXX Annual (with explanation)
- **Best ROI**: Property X - (with LVR projections and explanation)
- **Best Value**: Property X - (with explanation)

### 4. LOCATION INTELLIGENCE COMPARISON
Include subsections:
- **Best Infrastructure**: Property X (with explanation)
- **Best Growth Corridor**: Property X (with explanation)
- **Best Schools**: Property X (with explanation)
- **Best Lifestyle**: Property X (with explanation)

### 5. RISK-ADJUSTED RECOMMENDATIONS
Include:
- **Risk Levels** for each property (use bullet points):
  - Property 1: [Risk Level] - [specific risks listed]
  - Property 2: [Risk Level] - [specific risks listed]
  ... for all ${propertyCount} properties
- **Safest Option**: Property X (with explanation)
- **Best Risk/Reward**: Property X (with explanation)
- **Highest Risk**: Property X (with explanation)

### 6. INVESTOR PROFILE MATCHING
For EACH of the ${propertyCount} properties, include:
- **Property X (Full Address)**:
  - Investor Types: [list suitable investor types]
  - Reasoning: [detailed explanation]

### 7. MARKET TIMING & STRATEGY
Include:
- **Buy Order Priority**: Which property to buy first and why
- **Recommended Holding Periods**: For each property with timeframe and reasoning
- **Exit Strategies**: For each property with specific recommendations

### 8. COMPETITIVE ADVANTAGES
For EACH of the ${propertyCount} properties, list 3-5 unique selling points as bullet points.

### 9. RED FLAGS & CONCERNS
For EACH of the ${propertyCount} properties, list specific concerns with severity ratings:
- Use format: "[Concern description] (SEVERITY)" where SEVERITY is LOW, MEDIUM, HIGH, or CRITICAL

### 10. FINAL RECOMMENDATION
- **Best Overall Property**: Property X (Full Address) with clear reasoning
- **Runner-ups**: List with brief explanations
- **Properties to Avoid/Reconsider**: If any, with reasoning
- **Alternative Scenarios**: Different recommendations for different investor priorities

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

**FORMATTING REQUIREMENTS CHECKLIST:**
1. ✅ Use proper markdown headers (##, ###)
2. ✅ Use actual "&" characters, NOT HTML entities
3. ✅ Rankings table has ALL ${propertyCount} properties
4. ✅ Use " • " as bullet separator in table cells
5. ✅ Format currency as $XXX,XXX (Australian format)
6. ✅ Format percentages as X.XX%
7. ✅ All scores on 0-100 scale
8. ✅ Severity ratings: LOW, MEDIUM, HIGH, CRITICAL
9. ✅ Property numbers match addresses consistently
10. ✅ Each section has clear headers

**COMPARISON DATA TO FORMAT:**

${JSON.stringify(comparisonData, null, 2)}

Return ONLY the formatted markdown report. Do not include any commentary or explanation outside the report.`;

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
            content: `You are a professional real estate report formatter. Your output must:
1. Use clean markdown formatting (no HTML entities)
2. Include ALL properties in every table and section
3. Use " • " as bullet separator within table cells
4. Never truncate tables or split them across sections
5. Use actual ampersand "&" characters, never "&#x26;" or "&amp;"
6. Maintain consistent property numbering throughout`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1, // Lower temperature for more consistent formatting
        max_tokens: 12000, // Increased for complete reports
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', response.status, errorText);
      throw new Error(`Perplexity API error: ${response.status}`);
    }

    const data = await response.json();
    let formattedContent = data.choices[0]?.message?.content;

    if (!formattedContent) {
      throw new Error('No formatted content returned from Perplexity');
    }

    // Apply post-processing to fix any remaining formatting issues
    formattedContent = sanitizeFormattedContent(formattedContent);

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
