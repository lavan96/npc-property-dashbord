import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { 
      reportIds, 
      analysisDepth = 'comprehensive', 
      investorProfile = 'general',
      timeHorizon = '5-7 years',
      riskTolerance = 'moderate',
      customWeights
    } = await req.json();

    if (!reportIds || !Array.isArray(reportIds) || reportIds.length < 2 || reportIds.length > 5) {
      return new Response(
        JSON.stringify({ error: 'Please provide 2-5 report IDs for comparison' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all investment reports
    const { data: reports, error: fetchError } = await supabase
      .from('investment_reports')
      .select('*')
      .in('id', reportIds);

    if (fetchError) {
      console.error('Error fetching reports:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch investment reports' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!reports || reports.length !== reportIds.length) {
      return new Response(
        JSON.stringify({ error: 'Some reports could not be found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Comparing ${reports.length} properties...`);

    // Extract property addresses and determine states
    const propertyAddresses = reports.map(r => r.property_address);
    
    // Extract states from addresses with improved pattern matching
    const extractedStates = reports.map(r => {
      const address = r.property_address;
      
      // Try multiple patterns to extract state
      // Pattern 1: State code followed by postcode (e.g., "VIC 3000", "NSW 2000")
      let match = address.match(/\b(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s+\d{4}\b/i);
      if (match) return match[1].toUpperCase();
      
      // Pattern 2: State code in parentheses or brackets (e.g., "(VIC)", "[WA]")
      match = address.match(/[\(\[](NSW|VIC|QLD|WA|SA|TAS|ACT|NT)[\)\]]/i);
      if (match) return match[1].toUpperCase();
      
      // Pattern 3: State code at end of address (e.g., "Street, Suburb VIC")
      match = address.match(/,\s*(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)$/i);
      if (match) return match[1].toUpperCase();
      
      // Pattern 4: Any occurrence of state code with word boundaries
      match = address.match(/\b(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b/i);
      if (match) return match[1].toUpperCase();
      
      // Try to extract from property_specs if available
      if (report.property_specs && typeof report.property_specs === 'object') {
        const specs = report.property_specs as any;
        if (specs.state) return specs.state.toUpperCase();
      }
      
      return null;
    }).filter(state => state !== null) as string[];
    
    // Get unique states, preserving empty array if no states found
    const propertyStates = extractedStates.length > 0 
      ? [...new Set(extractedStates)]
      : [];

    // Generate accurate report title
    const statesText = propertyStates.length === 0 
      ? 'MIXED STATES' 
      : propertyStates.length === 1 
        ? propertyStates[0]
        : propertyStates.join(' & ');
    
    const reportTitle = `COMPARISON ANALYSIS - ${reports.length} PROPERTIES, ${statesText}`;
    
    console.log(`Generated title: ${reportTitle}`);
    console.log(`Property states extracted: ${propertyStates.length > 0 ? propertyStates.join(', ') : 'none found'}`);

    // Structure data for AI analysis
    const propertiesData = reports.map((report, index) => {
      // Parse JSONB fields safely (null is also typeof 'object' so we need to check for it)
      const investmentScore = (typeof report.investment_score === 'object' && report.investment_score !== null) ? report.investment_score : {};
      const financials = (typeof report.financial_calculations === 'object' && report.financial_calculations !== null) ? report.financial_calculations : {};
      const demographics = (typeof report.demographics_data === 'object' && report.demographics_data !== null) ? report.demographics_data : {};
      const location = (typeof report.location_intelligence === 'object' && report.location_intelligence !== null) ? report.location_intelligence : {};
      const economics = (typeof report.economic_data === 'object' && report.economic_data !== null) ? report.economic_data : {};
      
      // Extract report text for analysis if structured data is missing
      const reportText = report.report_content || '';

      return {
        propertyNumber: index + 1,
        address: report.property_address,
        reportText: reportText, // Full report content for comprehensive analysis
        
        // Investment Scoring
        overallScore: investmentScore.totalScore || null,
        letterGrade: investmentScore.letterGrade || null,
        recommendation: investmentScore.recommendation || null,
        scoreBreakdown: {
          yield: investmentScore.yieldScore || null,
          growth: investmentScore.growthScore || null,
          location: investmentScore.locationScore || null,
          demand: investmentScore.demandScore || null,
          risk: investmentScore.riskScore || null
        },
        
        // Financial Metrics
        financialMetrics: {
          purchasePrice: financials.purchasePrice || null,
          weeklyRent: financials.weeklyRent || null,
          annualRent: financials.annualRent || null,
          rentalYield: financials.rentalYield || null,
          cashFlow: financials.monthlyCashFlow || null,
          roi5Year: financials.projections?.fiveYear?.totalReturn || null,
          roi10Year: financials.projections?.tenYear?.totalReturn || null,
          appreciation: financials.projections?.tenYear?.appreciation || null
        },
        
        // Location Intelligence
        locationData: {
          walkScore: location.walkScore || null,
          transitScore: location.transitScore || null,
          schoolRating: location.averageSchoolRating || null,
          nearbySchools: location.schoolsNearby || null,
          amenitiesCount: location.amenitiesNearby || null,
          distanceToCity: location.distanceToCity || null
        },
        
        // Demographics
        demographics: {
          population: demographics.population || null,
          medianIncome: demographics.medianIncome || null,
          medianAge: demographics.medianAge || 0,
          employmentRate: demographics.employmentRate || 0,
          housingAffordability: demographics.housingAffordability || 'N/A'
        },
        
        // Risk Factors
        risks: investmentScore.swotAnalysis?.threats || [],
        strengths: investmentScore.swotAnalysis?.strengths || [],
        
        // Market Data
        marketData: {
          vacancyRate: economics.vacancyRate || 0,
          supplyGrowth: economics.supplyGrowth || 0,
          interestRate: economics.cashRate || 0
        }
      };
    });

    const prompt = `You are an expert Australian property investment analyst comparing ${reports.length} investment properties for a client.

**REPORT METADATA:**
- Properties: ${propertyAddresses.join(' | ')}
- States: ${propertyStates.join(', ')}
- Report Title: ${reportTitle}

**CRITICAL STRUCTURE REQUIREMENTS:**
This comparison MUST contain ALL of the following 10 sections in exact order. Missing sections will cause report rejection:
1. EXECUTIVE SUMMARY (2-3 paragraphs)
2. OVERALL RANKINGS (complete table with all properties)
3. FINANCIAL PERFORMANCE COMPARISON (4 sub-sections: yield, cash flow, ROI, value)
4. LOCATION INTELLIGENCE COMPARISON (4 sub-sections: infrastructure, growth corridor, schools, lifestyle)
5. RISK-ADJUSTED RECOMMENDATIONS (risk levels for all properties)
6. INVESTOR PROFILE MATCHING (match each property to investor types)
7. MARKET TIMING & STRATEGY (buy order, holding periods, exit strategies)
8. COMPETITIVE ADVANTAGES (3-5 advantages per property)
9. RED FLAGS & CONCERNS (specific concerns per property with severity ratings)
10. FINAL RECOMMENDATION (best overall, runners-up, properties to avoid/reconsider)

**DATA QUALITY INSTRUCTIONS:**
    - **SCORING SCALE**: ALL finalScore values MUST be on a 0-100 scale (e.g., 85.2, not 8.5). Use the overallScore provided in the data when available.
    - Some properties may have incomplete structured data - if data is null, analyze the reportText field to extract relevant information
    - When structured data is missing, extract key metrics and insights from the reportText field
    - If certain metrics are unavailable for a property, note this clearly (use "N/A" or "Data unavailable")
    - **CRITICAL**: Double-check all finalScore values are 0-100 scale before submitting (typical good scores: 70-85, excellent: 85+, poor: <60)
    ${customWeights ? `- **CUSTOM SCORING WEIGHTS**: Apply these custom weights when calculating rankings: Growth ${customWeights.growth}%, Location ${customWeights.location}%, Yield ${customWeights.yield}%, Demand ${customWeights.demand}%, Risk ${customWeights.risk}%` : ''}
    
    **ANALYSIS DEPTH:** ${analysisDepth}
    **INVESTOR PROFILE:** ${investorProfile}
    **TIME HORIZON:** ${timeHorizon}
    **RISK TOLERANCE:** ${riskTolerance}
    ${customWeights ? `**CUSTOM WEIGHTS:** Growth ${customWeights.growth}%, Location ${customWeights.location}%, Yield ${customWeights.yield}%, Demand ${customWeights.demand}%, Risk ${customWeights.risk}%` : ''}

    **PROPERTIES TO COMPARE:**
    ${JSON.stringify(propertiesData, null, 2)}

Provide a detailed comparative analysis including:

1. EXECUTIVE SUMMARY (2-3 paragraphs)
   - Quick overview of the comparison
   - Key finding and top recommendation
   - Critical factors that differentiate these properties

2. OVERALL RANKINGS
   For each property, provide:
   - Final rank (1st, 2nd, 3rd, etc.)
   - Final score (MUST be 0-100 scale - use the overallScore provided in data when available, or calculate based on comprehensive analysis)
   - Primary strengths (3-5 key strengths)
   - Primary concerns (3-5 key concerns)
   - Best suited for (specific investor type)

3. FINANCIAL PERFORMANCE COMPARISON
   - Which property offers best rental yield?
   - Which has strongest cash flow?
   - Which has best ROI projections?
   - Which offers best value for money?
   - Compare entry costs vs expected returns

4. LOCATION INTELLIGENCE COMPARISON
   - Which location has best infrastructure?
   - Which is in the strongest growth corridor?
   - Which has best schools and amenities?
   - Which has best lifestyle factors?
   - Compare accessibility and convenience

5. RISK-ADJUSTED RECOMMENDATIONS
   - Rank properties by risk level (low to high)
   - Identify specific risks for each property
   - Which property is safest for conservative investors?
   - Which offers best risk/reward balance?

6. INVESTOR PROFILE MATCHING
   For each property, identify the ideal investor:
   - Cash Flow Focused Investor
   - Capital Growth Investor
   - Balanced Portfolio Investor
   - First-Time Investor
   - Experienced Investor

7. MARKET TIMING & STRATEGY
   - Which property to prioritize (buy first)?
   - Recommended holding periods for each
   - Exit strategy considerations
   - Portfolio sequencing if buying multiple

8. COMPETITIVE ADVANTAGES
   For each property, list 3-5 unique selling points or competitive advantages

9. RED FLAGS & CONCERNS
   For each property, identify potential deal-breakers or areas requiring due diligence

10. FINAL RECOMMENDATION
    - Which is THE best property overall and why?
    - Which are close runner-ups?
    - Which to avoid or reconsider?
    - Alternative scenarios: "If your goal is X, then choose Y"

Format your response as valid JSON with this structure:
{
  "executiveSummary": "string",
  "rankings": [
    {
      "propertyNumber": number,
      "address": "string",
      "rank": number,
      "finalScore": number (CRITICAL: Must be 0-100 scale. Use overallScore from data when available, or calculate comprehensively. Example: 85.5, not 8.5),
      "primaryStrengths": ["string", "string", "string"],
      "primaryConcerns": ["string", "string", "string"],
      "bestSuitedFor": "string"
    }
  ],
  "financialComparison": {
    "bestYield": { "propertyNumber": number, "value": "string", "reason": "string" },
    "bestCashFlow": { "propertyNumber": number, "value": "string", "reason": "string" },
    "bestROI": { "propertyNumber": number, "value": "string", "reason": "string" },
    "bestValue": { "propertyNumber": number, "reason": "string" }
  },
  "locationComparison": {
    "bestInfrastructure": { "propertyNumber": number, "reason": "string" },
    "bestGrowthCorridor": { "propertyNumber": number, "reason": "string" },
    "bestSchools": { "propertyNumber": number, "reason": "string" },
    "bestLifestyle": { "propertyNumber": number, "reason": "string" }
  },
  "riskComparison": {
    "lowestRisk": { "propertyNumber": number, "reason": "string" },
    "highestRisk": { "propertyNumber": number, "reason": "string" },
    "bestRiskReward": { "propertyNumber": number, "reason": "string" },
    "riskLevels": [{ "propertyNumber": number, "riskLevel": "string", "specificRisks": ["string"] }]
  },
  "investorMatches": [
    {
      "propertyNumber": number,
      "investorTypes": ["string"],
      "reasoning": "string"
    }
  ],
  "marketTiming": {
    "buyFirst": { "propertyNumber": number, "reason": "string" },
    "holdingPeriods": [{ "propertyNumber": number, "recommendedPeriod": "string", "reason": "string" }],
    "exitStrategies": [{ "propertyNumber": number, "strategy": "string" }]
  },
  "competitiveAdvantages": [
    {
      "propertyNumber": number,
      "advantages": ["string"]
    }
  ],
  "redFlags": [
    {
      "propertyNumber": number,
      "concerns": ["string"],
      "severity": "string"
    }
  ],
  "finalRecommendation": {
    "bestOverall": { "propertyNumber": number, "reason": "string" },
    "runners": [{ "propertyNumber": number, "reason": "string" }],
    "avoid": [{ "propertyNumber": number, "reason": "string" }],
    "alternativeScenarios": [{ "scenario": "string", "recommendation": number, "reason": "string" }]
  }
}`;

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Calling Lovable AI for comparison analysis...');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are an expert property investment analyst specializing in comparative analysis. Provide detailed, actionable insights based on data. CRITICAL: Always respond with ONLY valid JSON - no markdown formatting, no code blocks, no ```json wrappers. Return pure JSON starting with { and ending with }.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Lovable AI error:', aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'AI analysis failed', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const analysisText = aiData.choices[0].message.content;

    // Parse JSON response
    let analysis;
    try {
      // Extract JSON from markdown code blocks if present
      let jsonString = analysisText;
      
      // Remove markdown code block wrappers
      const jsonMatch = analysisText.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        jsonString = jsonMatch[1];
      }
      
      // Parse the JSON
      analysis = JSON.parse(jsonString);
      
      // Clean up any remaining markdown artifacts in text fields
      if (analysis.executiveSummary && typeof analysis.executiveSummary === 'string') {
        // Remove any JSON formatting artifacts
        analysis.executiveSummary = analysis.executiveSummary
          .replace(/^```json\s*\n/, '')
          .replace(/\n```$/, '')
          .replace(/\\n/g, '\n')
          .trim();
      }
      
      console.log('Successfully parsed AI analysis');
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.error('Raw response:', analysisText);
      
      // Store raw text if JSON parsing fails
      analysis = {
        executiveSummary: analysisText.replace(/```json\s*\n|\n```/g, '').trim(),
        rawResponse: true
      };
    }

    const processingTime = Date.now() - startTime;

    // Store comparison in database with metadata
    const { data: comparisonData, error: insertError } = await supabase
      .from('property_comparisons')
      .insert({
        report_ids: reportIds,
        property_count: reports.length,
        property_addresses: propertyAddresses,
        property_states: propertyStates,
        report_title: reportTitle,
        structure_version: 1,
        executive_summary: analysis.executiveSummary,
        rankings: analysis.rankings,
        financial_comparison: analysis.financialComparison,
        location_comparison: analysis.locationComparison,
        risk_comparison: analysis.riskComparison,
        investor_matches: analysis.investorMatches,
        recommendations: analysis.finalRecommendation,
        red_flags: analysis.redFlags,
        analysis_depth: analysisDepth,
        investor_profile: investorProfile,
        model_used: 'google/gemini-2.5-flash',
        processing_time_ms: processingTime,
        analysis_summary: JSON.stringify({
          timeHorizon,
          riskTolerance,
          customWeights: customWeights || null
        })
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error storing comparison:', insertError);
    }

    console.log(`Comparison completed in ${processingTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        comparisonId: comparisonData?.id,
        propertyCount: reports.length,
        analysis,
        processingTimeMs: processingTime
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Comparison error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: error instanceof Error ? error.stack : undefined
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
