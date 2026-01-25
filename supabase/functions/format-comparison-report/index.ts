import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

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
  
  // Remove erroneous semicolons in addresses (e.g., "21/11; Rowlands; Street" → "21/11 Rowlands Street")
  // Match semicolon followed by space and a word (but not after numbers with units like "6.5%;")
  sanitized = sanitized.replace(/;\s+([A-Za-z])/g, ' $1');
  
  // Ensure proper markdown heading formatting
  sanitized = sanitized.replace(/^([A-Z][A-Z\s&]+)$/gm, (match) => {
    // If it's an all-caps line without # prefix, add it
    if (!match.startsWith('#')) {
      return `# ${match}`;
    }
    return match;
  });
  
  return sanitized;
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Verify authentication
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const body = await req.json();
    const { comparisonData } = body;
    
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.log('[format-comparison-report] Auth failed:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }
    console.log(`[format-comparison-report] Authenticated user: ${userId}`);
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

    // Create property reference table for clear identification
    const propertyReferenceTable = propertyAddresses.map((addr: string, idx: number) => {
      const state = propertyStates[idx] || 'N/A';
      return `| Property ${idx + 1} | ${addr} | ${state} |`;
    }).join('\n');

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

**Analysis Date:** ${new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' })}

---

## MANDATORY STRUCTURE - ALL 10 SECTIONS REQUIRED:

### 1. PROPERTY REFERENCE GUIDE
Start with this table to clearly identify each property:

| Reference | Full Address | State |
|-----------|--------------|-------|
${propertyReferenceTable}

This reference guide ensures you always know which property is being discussed throughout the report.

### 2. INVESTOR PROFILE MATCHING
**IMPORTANT: This section comes EARLY to help readers identify which properties suit their investment profile.**

For EACH of the ${propertyCount} properties, format as follows:

**Property X: [Full Address]** as a bold header on its own line, then:
- **Best For:** [list 2-3 investor types]
- **Investment Style:** [Growth/Income/Balanced/Value]
- **Risk Tolerance:** [Conservative/Moderate/Aggressive]
- **Reasoning:** [detailed explanation of why this property suits these investor types]

Example format:
**Property 1: 512/23 Adelaide Street, Fremantle, WA 6160**
- **Best For:** Lifestyle-Oriented Capital Growth Investor, Balanced Portfolio Investor
- **Investment Style:** Balanced
- **Risk Tolerance:** Moderate
- **Reasoning:** Strong lifestyle attributes and walkability suit investors prioritising quality-of-life factors alongside capital appreciation.

### 3. EXECUTIVE SUMMARY
Write 2-3 paragraphs covering: overview of all ${propertyCount} properties, key findings, critical differentiators, and top recommendation. Reference properties by their number AND address.

### 4. OVERALL RANKINGS
Format each property ranking as a paragraph (NOT a table). You MUST use the EXACT property addresses shown below.

**IMPORTANT**: The ranking order should be based on the investment scores from the comparison data (highest score = Rank 1). Each property MUST include its FULL ADDRESS in the header.

${rankingExamples}

**CRITICAL**: 
- Include ALL ${propertyCount} properties with complete details
- Each property header MUST include the FULL property address (e.g., "Rank 1: 21/11 Rowlands Street, Kewdale, WA 6105" NOT just "Rank 1: Property 2")
- Do NOT use tables for rankings
- Rankings should be ordered by investment score (highest first)

### 5. FINANCIAL PERFORMANCE COMPARISON
Include subsections:
- **Best Yield**: Property X - [Full Address] - X.XX% Gross / X.XX% Net (with explanation)
- **Best Cash Flow**: Property X - [Full Address] - $X,XXX Annual (with explanation)
- **Best ROI**: Property X - [Full Address] - (with LVR projections and explanation)
- **Best Value**: Property X - [Full Address] - (with explanation)

### 6. LOCATION INTELLIGENCE COMPARISON
Include subsections:
- **Best Infrastructure**: Property X - [Full Address] (with explanation)
- **Best Growth Corridor**: Property X - [Full Address] (with explanation)
- **Best Schools**: Property X - [Full Address] (with explanation)
- **Best Lifestyle**: Property X - [Full Address] (with explanation)

### 7. RISK-ADJUSTED RECOMMENDATIONS
Include:
- **Risk Levels** for each property (use bullet points):
  - Property 1 ([Address]): [Risk Level] - [specific risks listed]
  - Property 2 ([Address]): [Risk Level] - [specific risks listed]
  ... for all ${propertyCount} properties
- **Safest Option**: Property X - [Full Address] (with explanation)
- **Best Risk/Reward**: Property X - [Full Address] (with explanation)
- **Highest Risk**: Property X - [Full Address] (with explanation)

### 8. MARKET TIMING & STRATEGY
Format with clear subsections and property headers:

**Buy Order Priority:**
1. Property X - [Full Address] (reason)
2. Property Y - [Full Address] (reason)

**Recommended Holding Periods:**
For each property, use bold header format:
**Property 1 - [Full Address]:** X-Y years - [reasoning]

**Exit Strategies:**
For each property, use bold header format:
**Property 1 - [Full Address]:** [specific exit strategy recommendations]

### 9. COMPETITIVE ADVANTAGES & RED FLAGS

For EACH of the ${propertyCount} properties, format as follows:

**Property X: [Full Address]**

**✓ Key Strengths:**
- Strength 1
- Strength 2
- Strength 3

**⚠ Concerns:**
- Concern 1 (SEVERITY: LOW/MEDIUM/HIGH)
- Concern 2 (SEVERITY: LOW/MEDIUM/HIGH)

### 10. FINAL RECOMMENDATION
Format with clear subsections:

**🏆 Best Overall Property:**
**Property X: [Full Address]**
[Clear reasoning paragraph explaining why this is the top pick]

**Runner-ups:**
- **Property Y: [Full Address]** - [brief explanation]
- **Property Z: [Full Address]** - [brief explanation]

**Properties to Reconsider:**
- **Property W: [Full Address]** - [reasoning if applicable]

**Alternative Scenarios:**
| Investor Priority | First Choice | Second Choice |
|-------------------|--------------|---------------|
| Income-first | Property X - [Address] | Property Y - [Address] |
| Growth-first | Property Z - [Address] | Property W - [Address] |
| Balanced | Property X - [Address] | Property Z - [Address] |

---

## MANDATORY CLOSING SECTION:

### Contact Information
**NPC Services**
- **Phone:** 0433 005 110
- **Email:** admin@npcservices.com.au
- **Website:** npcservices.com.au

---

**FORMATTING REQUIREMENTS CHECKLIST:**
1. ✅ Use proper markdown headers (##, ###)
2. ✅ Use actual "&" characters, NOT HTML entities
3. ✅ Rankings section has ALL ${propertyCount} properties with FULL ADDRESSES
4. ✅ Use " • " as bullet separator in table cells
5. ✅ Format currency as $XXX,XXX (Australian format)
6. ✅ Format percentages as X.XX%
7. ✅ All scores on 0-100 scale
8. ✅ Severity ratings: LOW, MEDIUM, HIGH, CRITICAL
9. ✅ Property numbers AND addresses used consistently throughout
10. ✅ Each section has clear headers
11. ✅ Property Reference Guide is section 1
12. ✅ Investor Profile Matching is section 2
13. ✅ DO NOT include a Professional Disclaimer section (it will be added by the PDF generator)

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
