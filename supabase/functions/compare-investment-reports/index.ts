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
    const { reportIds, analysisDepth = 'comprehensive', investorProfile } = await req.json();

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

    // Structure data for AI analysis
    const propertiesData = reports.map((report, index) => {
      const investmentScore = report.investment_score || {};
      const financials = report.financial_calculations || {};
      const demographics = report.demographics_data || {};
      const location = report.location_intelligence || {};
      const economics = report.economic_data || {};

      return {
        propertyNumber: index + 1,
        address: report.property_address,
        
        // Investment Scoring
        overallScore: investmentScore.totalScore || 0,
        letterGrade: investmentScore.letterGrade || 'N/A',
        recommendation: investmentScore.recommendation || 'Not available',
        scoreBreakdown: {
          yield: investmentScore.yieldScore || {},
          growth: investmentScore.growthScore || {},
          location: investmentScore.locationScore || {},
          demand: investmentScore.demandScore || {},
          risk: investmentScore.riskScore || {}
        },
        
        // Financial Metrics
        financialMetrics: {
          purchasePrice: financials.purchasePrice || 0,
          weeklyRent: financials.weeklyRent || 0,
          annualRent: financials.annualRent || 0,
          rentalYield: financials.rentalYield || 0,
          cashFlow: financials.monthlyCashFlow || 0,
          roi5Year: financials.projections?.fiveYear?.totalReturn || 0,
          roi10Year: financials.projections?.tenYear?.totalReturn || 0,
          appreciation: financials.projections?.tenYear?.appreciation || 0
        },
        
        // Location Intelligence
        locationData: {
          walkScore: location.walkScore || 0,
          transitScore: location.transitScore || 0,
          schoolRating: location.averageSchoolRating || 0,
          nearbySchools: location.schoolsNearby || 0,
          amenitiesCount: location.amenitiesNearby || 0,
          distanceToCity: location.distanceToCity || 'N/A'
        },
        
        // Demographics
        demographics: {
          population: demographics.population || 0,
          medianIncome: demographics.medianIncome || 0,
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

    // Prepare AI analysis prompt
    const analysisPrompt = `You are a professional property investment analyst. Perform a comprehensive qualitative comparison of ${reports.length} investment properties.

PROPERTIES DATA:
${JSON.stringify(propertiesData, null, 2)}

${investorProfile ? `INVESTOR PROFILE: ${investorProfile}` : ''}

Provide a detailed comparative analysis including:

1. EXECUTIVE SUMMARY (2-3 paragraphs)
   - Quick overview of the comparison
   - Key finding and top recommendation
   - Critical factors that differentiate these properties

2. OVERALL RANKINGS
   For each property, provide:
   - Final rank (1st, 2nd, 3rd, etc.)
   - Primary strengths
   - Primary concerns
   - Best suited for (investor type)

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
      "finalScore": number,
      "primaryStrengths": ["string"],
      "primaryConcerns": ["string"],
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
            content: 'You are an expert property investment analyst specializing in comparative analysis. Provide detailed, actionable insights based on data. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: analysisPrompt
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
      const jsonMatch = analysisText.match(/```json\n([\s\S]*?)\n```/) || analysisText.match(/```\n([\s\S]*?)\n```/);
      const jsonString = jsonMatch ? jsonMatch[1] : analysisText;
      analysis = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Store raw text if JSON parsing fails
      analysis = {
        executiveSummary: analysisText,
        rawResponse: true
      };
    }

    const processingTime = Date.now() - startTime;

    // Store comparison in database
    const { data: comparisonData, error: insertError } = await supabase
      .from('property_comparisons')
      .insert({
        report_ids: reportIds,
        property_count: reports.length,
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
        processing_time_ms: processingTime
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
