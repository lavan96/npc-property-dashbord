import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Report tier configurations based on NPC report templates
const TIER_CONFIG = {
  briefing: {
    name: 'Executive Briefing',
    targetPages: 20,
    contentRatio: 0.4, // 40% of original content
    sections: [
      'Location Overview',
      'Current Market Performance',
      'Market Activity',
      'Population & Household Characteristics',
      'Major Industries & Job Growth',
      'Transport & Accessibility',
      'Education Facilities',
      'Healthcare & Shopping',
      'Environmental Risks',
      'Crime Statistics',
      'Property-Level Information',
      'Purchase & Ongoing Costs',
      // NOTE: Comparable Sales and Rentals sections removed - requires paid API integration (CoreLogic/RP Data)
      // TODO: Re-enable when transaction data APIs are integrated
      'Financial Analysis (Yields, Loan Analysis, Sensitivity)',
      'Property Value & Rental Projections',
      'Investment Score Breakdown',
      'SWOT Analysis',
      'Top Opportunities & Risks',
      'Investment Recommendations',
      'Market Data Sources'
    ],
    structureGuide: `
REPORT STRUCTURE (~20 PAGES):

## Location Overview
- Address being analyzed
- SA2/SA3/SA4/LGA statistical areas
- Suburb description (2-3 sentences)
- Population trends (1-2 sentences)

## Current Market Performance (Q3/Q4 2025)
| Metric | Value | YoY Change |
- Median House Price, Median Unit Price
- Gross Rental Yield, Units Sold, Days on Market, Capital Growth
- Source attribution

## Historical Price Growth Table
## Historical Rent Growth Table

## Market Activity
| Metric | Value | Source |
- Active Listings, Sales Volume, Vacancy Rate

## Population & Household Characteristics
| Metric | Value | Source |
- Employment Rate, Unemployment Rate, Labor Force
- Median Income, IRSAD/IRSD Scores

## Major Industries & Job Growth
| Industry | Workforce % | Growth Rate |
- Top 5 industries with growth rates
- Job Growth Trends table

## Transport & Accessibility
| Metric | Value | Details |
- Walk Score, CBD Commute, Public Transport Score

## Education Facilities
| Facility | Distance | Rating |
- 5 nearest facilities

## Healthcare & Shopping
| Facility | Distance | Details |
- Amenity Scores table

## Environmental Risks
| Risk Type | Assessment | Details |
- Flood, Bushfire, Heatwave risks

## Crime Statistics
| Metric | Value | Comparison |
- Crime Breakdown table

## Property-Level Information
| Property Characteristic | Value |
- Type, Bedrooms, Bathrooms, Parking, Year Built, Estimated Value

## Purchase & Ongoing Costs
| Cost Category | Amount | Calculation |
- All annual costs itemized

## Base Assumptions
- Bullet list of all financial assumptions

## Gross & Net Yield Calculation
| Metric | Calculation | Value |

## Loan Analysis (P&I and Interest-Only)
| Item | Annual | Monthly |

## Sensitivity Analysis
| Scenario | Interest Rate | Annual Cashflow |

## Property Value Projections
| Year | Conservative | Base |
- Years 1, 3, 5, 10

## Rental Income Projections
| Year | Conservative | Base |

## Cumulative Cashflow Projections
| Year | Conservative | Base |

## LVR Projections
| Scenario | Year 10 LVR |

## Overall Investment Score
- Investment Grade (letter)
- Total Score (/100)
- Recommendation

## Investment Score Breakdown
| Component | Weight | Score |
- Growth, Location, Yield, Demand, Risk

## SWOT Analysis
### Strengths (4 bullet points)
### Weaknesses (4 bullet points)
### Opportunities (4 bullet points)
### Threats (4 bullet points)

## Top 3 Opportunities
- Detailed paragraph for each

## Top 3 Risks
- Detailed paragraph for each

## Investment Recommendations
### Short-term Actions
### Long-term Strategy
### Key Considerations

## Market Data Sources
| Metric | Source | URL |
`
  },
  snapshot: {
    name: 'Snapshot',
    targetPages: 5,
    contentRatio: 0.15, // 15% of original content
    sections: [
      'Property Summary',
      'Key Market Stats',
      'Investment Score',
      'Financial Snapshot',
      'Top Opportunities & Risks',
      'Recommendation'
    ],
    structureGuide: `
REPORT STRUCTURE (~5 PAGES):

## Property Summary
- Address, Property Type, Bedrooms/Bathrooms
- Estimated Value, Location highlights (3 sentences max)

## Key Market Stats
| Metric | Value |
- Median Price, Rental Yield, Vacancy Rate, Capital Growth
- Days on Market, Walk Score

## Investment Score
- Grade: [Letter Grade]
- Score: [X]/100
- Recommendation: [BUY/HOLD/SELL]

## Score Breakdown (simplified)
| Component | Score |
- Growth, Location, Yield, Demand, Risk

## Financial Snapshot
| Metric | Value |
- Purchase Price, Weekly Rent, Gross Yield, Net Yield
- Annual Cashflow, 10-Year Projected Value

## Top 3 Opportunities
- Brief bullet points (1-2 sentences each)

## Top 3 Risks
- Brief bullet points (1-2 sentences each)

## Quick Recommendation
- 2-3 sentences summarizing the investment thesis
`
  }
};

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('=== Condense Investment Report Function Started ===');

  try {
    // SECURITY: Verify authentication
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const requestBody = await req.json();
    const { parentReportId, targetTier } = requestBody;
    
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, requestBody);
    if (authError) {
      console.log('[condense-investment-report] Auth failed:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }
    console.log(`[condense-investment-report] Authenticated user: ${userId}`);

    console.log('Request params:', { parentReportId, targetTier });

    // Validate inputs
    if (!parentReportId) {
      return new Response(JSON.stringify({ 
        error: 'Parent report ID is required',
        success: false 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!targetTier || !['briefing', 'snapshot'].includes(targetTier)) {
      return new Response(JSON.stringify({ 
        error: 'Target tier must be "briefing" or "snapshot"',
        success: false 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Supabase client already initialized above for auth verification

    // Fetch the parent (Compass) report
    const { data: parentReport, error: fetchError } = await supabase
      .from('investment_reports')
      .select('*')
      .eq('id', parentReportId)
      .eq('report_tier', 'compass')
      .single();

    if (fetchError || !parentReport) {
      console.error('Failed to fetch parent report:', fetchError);
      return new Response(JSON.stringify({ 
        error: 'Parent Compass report not found',
        success: false 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Parent report found:', parentReport.property_address);

    // Check if this tier already exists for this parent
    const { data: existingTier } = await supabase
      .from('investment_reports')
      .select('id')
      .eq('parent_report_id', parentReportId)
      .eq('report_tier', targetTier)
      .single();

    if (existingTier) {
      console.log('Tier already exists, returning existing report');
      return new Response(JSON.stringify({ 
        success: true,
        reportId: existingTier.id,
        message: `${TIER_CONFIG[targetTier].name} already exists for this property`
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create pending condensed report
    const { data: condensedReport, error: insertError } = await supabase
      .from('investment_reports')
      .insert({
        property_address: parentReport.property_address,
        property_listing_id: parentReport.property_listing_id,
        report_content: `Generating ${TIER_CONFIG[targetTier].name}...`,
        status: 'pending',
        report_tier: targetTier,
        parent_report_id: parentReportId,
        report_scope: parentReport.report_scope,
        property_specs: parentReport.property_specs,
        // Copy structured data from parent
        demographics_data: parentReport.demographics_data,
        economic_data: parentReport.economic_data,
        financial_calculations: parentReport.financial_calculations,
        investment_score: parentReport.investment_score,
        location_intelligence: parentReport.location_intelligence,
        data_sources: parentReport.data_sources,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to create condensed report:', insertError);
      throw new Error(`Failed to create report: ${insertError.message}`);
    }

    console.log('Created pending condensed report:', condensedReport.id);

    // Get the tier configuration
    const tierConfig = TIER_CONFIG[targetTier];

    // Build the condensation prompt using the structure guide
    const systemPrompt = `You are an expert investment property analyst for Naidu Property Consulting Services. Your task is to condense a comprehensive property investment report into a ${tierConfig.name} format.

CRITICAL REQUIREMENTS:
1. Follow the EXACT structure template provided below
2. Use markdown heading styles (##, ###) consistently
3. Preserve ALL numerical data, statistics, percentages, and key facts EXACTLY as they appear
4. Keep all tables in proper markdown format with | pipes
5. Remove verbose descriptions while keeping essential insights
6. Focus on the most critical information for investors
7. Target approximately ${tierConfig.targetPages} pages of content

REQUIRED REPORT STRUCTURE:
${tierConfig.structureGuide}

FORMATTING RULES:
- Use ## for main section headings
- Use ### for subsections within a section
- Use proper markdown tables with headers and alignment
- Use bullet points for lists
- Include source attributions where data is cited
- Keep the same professional tone as the original

OUTPUT REQUIREMENTS:
- Start directly with the first section (no preamble or introduction)
- Maintain all tables with proper markdown formatting
- Keep investment scores and ratings EXACTLY as they appear in the original
- Preserve all warnings, risks, red flags, and recommendations
- Include source citations for all data points
- End with the Market Data Sources section`;

    const userPrompt = `Please condense the following comprehensive investment report into a ${tierConfig.name} format (~${tierConfig.targetPages} pages).

Use the structure template from the system prompt and extract the relevant data from this report:

---
ORIGINAL COMPREHENSIVE REPORT:
${parentReport.report_content}
---

IMPORTANT:
- Copy all numerical values, percentages, and scores EXACTLY
- Keep all table data intact
- Follow the section structure precisely
- Maintain professional formatting throughout`;

    // Call Lovable AI to condense the report
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Calling Lovable AI for condensation...');
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // NOTE: Must be a model supported by the Lovable AI gateway.
        // See edge function logs for the current allowlist.
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: targetTier === 'briefing' ? 16000 : 6000,
        temperature: 0.3, // Lower temperature for more consistent output
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      // Update report to failed status
      await supabase
        .from('investment_reports')
        .update({
          status: 'failed',
          error_message: `AI condensation failed: ${aiResponse.status}`,
        })
        .eq('id', condensedReport.id);

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again later.',
          success: false 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const condensedContent = aiData.choices?.[0]?.message?.content;

    if (!condensedContent) {
      throw new Error('No content received from AI');
    }

    console.log('AI condensation complete, content length:', condensedContent.length);

    // Update the condensed report with the content
    const { error: updateError } = await supabase
      .from('investment_reports')
      .update({
        report_content: condensedContent,
        status: 'completed',
        sources_content: parentReport.sources_content, // Copy sources from parent
      })
      .eq('id', condensedReport.id);

    if (updateError) {
      console.error('Failed to update condensed report:', updateError);
      throw new Error(`Failed to update report: ${updateError.message}`);
    }

    console.log('=== Condensation Complete ===');

    return new Response(JSON.stringify({ 
      success: true,
      reportId: condensedReport.id,
      tier: targetTier,
      tierName: tierConfig.name,
      message: `${tierConfig.name} generated successfully`
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Condense report error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
