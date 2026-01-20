import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ClientProperty {
  id: string;
  property_type: string;
  address: string;
  value: number | null;
  loan_remaining: number | null;
  interest_rate: number | null;
  ownership_percentage: number | null;
  monthly_interest_repayment: number | null;
  monthly_body_corporate: number | null;
  monthly_council_rates: number | null;
  monthly_water_rates: number | null;
  monthly_repairs_maintenance: number | null;
  monthly_property_management: number | null;
  monthly_landlord_insurance: number | null;
  monthly_building_insurance: number | null;
  monthly_rental_income: number | null;
  weekly_rental_income: number | null;
  total_monthly_expenditure: number | null;
  net_monthly_cashflow: number | null;
}

interface ClientData {
  id: string;
  primary_first_name: string;
  primary_surname: string;
  total_portfolio_value: number | null;
  total_debt: number | null;
  total_monthly_income: number | null;
  total_monthly_expenditure: number | null;
  total_monthly_rental_income: number | null;
  net_monthly_cash_flow: number | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { 
      clientId,
      investorProfile = 'general',
      analysisDepth = 'comprehensive',
      includeProjections = true,
      projectionYears = 10
    } = await req.json();

    if (!clientId) {
      return new Response(
        JSON.stringify({ error: 'Client ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Starting portfolio analysis for client: ${clientId}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch client data
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      console.error('Error fetching client:', clientError);
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all client properties
    const { data: properties, error: propertiesError } = await supabase
      .from('client_properties')
      .select('*')
      .eq('client_id', clientId)
      .order('value', { ascending: false });

    if (propertiesError) {
      console.error('Error fetching properties:', propertiesError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch client properties' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!properties || properties.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No properties found for this client' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${properties.length} properties for analysis`);

    // Aggregate portfolio metrics
    const investmentProperties = properties.filter(p => p.property_type === 'investment');
    const ownerOccupiedProperties = properties.filter(p => p.property_type === 'owner_occupied');
    
    const portfolioMetrics = {
      totalProperties: properties.length,
      investmentCount: investmentProperties.length,
      ownerOccupiedCount: ownerOccupiedProperties.length,
      totalValue: properties.reduce((sum, p) => sum + (Number(p.value) || 0), 0),
      totalDebt: properties.reduce((sum, p) => sum + (Number(p.loan_remaining) || 0), 0),
      totalEquity: 0,
      averageLVR: 0,
      totalMonthlyRentalIncome: investmentProperties.reduce((sum, p) => sum + (Number(p.monthly_rental_income) || 0), 0),
      totalMonthlyExpenses: properties.reduce((sum, p) => sum + (Number(p.total_monthly_expenditure) || 0), 0),
      netMonthlyCashflow: investmentProperties.reduce((sum, p) => sum + (Number(p.net_monthly_cashflow) || 0), 0),
      averageYield: 0,
      bestPerformer: null as ClientProperty | null,
      worstPerformer: null as ClientProperty | null,
    };

    portfolioMetrics.totalEquity = portfolioMetrics.totalValue - portfolioMetrics.totalDebt;
    portfolioMetrics.averageLVR = portfolioMetrics.totalValue > 0 
      ? (portfolioMetrics.totalDebt / portfolioMetrics.totalValue) * 100 
      : 0;

    // Calculate average yield for investment properties
    if (investmentProperties.length > 0) {
      const yields = investmentProperties
        .filter(p => p.value && p.weekly_rental_income)
        .map(p => (Number(p.weekly_rental_income) * 52 / Number(p.value)) * 100);
      portfolioMetrics.averageYield = yields.length > 0 
        ? yields.reduce((a, b) => a + b, 0) / yields.length 
        : 0;
    }

    // Find best and worst performers by net cashflow
    if (investmentProperties.length > 0) {
      const sortedByPerformance = [...investmentProperties].sort(
        (a, b) => (Number(b.net_monthly_cashflow) || 0) - (Number(a.net_monthly_cashflow) || 0)
      );
      portfolioMetrics.bestPerformer = sortedByPerformance[0];
      portfolioMetrics.worstPerformer = sortedByPerformance[sortedByPerformance.length - 1];
    }

    // Helper to check if property is owner-occupied
    const isOwnerOccupied = (propertyType: string) => 
      propertyType?.toLowerCase() === 'owner_occupied' || 
      propertyType?.toLowerCase() === 'owner-occupied' ||
      propertyType?.toLowerCase() === 'ppor';

    // Generate property-level analysis with property-type awareness
    const propertyAnalyses = properties.map((prop, index) => {
      const value = Number(prop.value) || 0;
      const loan = Number(prop.loan_remaining) || 0;
      const equity = value - loan;
      const lvr = value > 0 ? (loan / value) * 100 : 0;
      const ownerOccupied = isOwnerOccupied(prop.property_type);
      
      // Investment-specific metrics (only calculate for investment properties)
      const weeklyRent = ownerOccupied ? 0 : (Number(prop.weekly_rental_income) || 0);
      const annualRent = weeklyRent * 52;
      const grossYield = (!ownerOccupied && value > 0) ? (annualRent / value) * 100 : null;
      const monthlyIncome = ownerOccupied ? 0 : (Number(prop.monthly_rental_income) || 0);
      const monthlyExpenses = Number(prop.total_monthly_expenditure) || 0;
      const netCashflow = ownerOccupied ? -monthlyExpenses : (Number(prop.net_monthly_cashflow) || 0);
      const cashOnCashReturn = (!ownerOccupied && equity > 0) ? ((netCashflow * 12) / equity) * 100 : null;

      return {
        propertyNumber: index + 1,
        address: prop.address,
        propertyType: prop.property_type,
        isOwnerOccupied: ownerOccupied,
        value,
        loan,
        equity,
        lvr: lvr.toFixed(1),
        ownershipPercentage: prop.ownership_percentage || 100,
        // Return null for investment-specific metrics on owner-occupied properties
        grossYield: grossYield !== null ? grossYield.toFixed(2) : 'N/A',
        monthlyRentalIncome: ownerOccupied ? null : monthlyIncome,
        monthlyExpenses,
        netMonthlyCashflow: ownerOccupied ? null : netCashflow,
        annualCashflow: ownerOccupied ? null : netCashflow * 12,
        cashOnCashReturn: cashOnCashReturn !== null ? cashOnCashReturn.toFixed(2) : 'N/A',
        portfolioContribution: portfolioMetrics.totalValue > 0 
          ? ((value / portfolioMetrics.totalValue) * 100).toFixed(1) 
          : '0',
      };
    });

    // Build AI analysis prompt
    const prompt = `You are an expert Australian property portfolio analyst. Analyze this client's entire property portfolio and provide strategic recommendations.

**CLIENT INFORMATION:**
- Name: ${client.primary_first_name} ${client.primary_surname}
- Total Monthly Income (Personal): $${(client.total_monthly_income || 0).toLocaleString()}
- Investor Profile: ${investorProfile}

**PORTFOLIO SUMMARY:**
- Total Properties: ${portfolioMetrics.totalProperties}
- Investment Properties: ${portfolioMetrics.investmentCount}
- Owner Occupied: ${portfolioMetrics.ownerOccupiedCount}
- Total Portfolio Value: $${portfolioMetrics.totalValue.toLocaleString()}
- Total Debt: $${portfolioMetrics.totalDebt.toLocaleString()}
- Total Equity: $${portfolioMetrics.totalEquity.toLocaleString()}
- Average LVR: ${portfolioMetrics.averageLVR.toFixed(1)}%
- Monthly Rental Income: $${portfolioMetrics.totalMonthlyRentalIncome.toLocaleString()}
- Monthly Expenses: $${portfolioMetrics.totalMonthlyExpenses.toLocaleString()}
- Net Monthly Cashflow: $${portfolioMetrics.netMonthlyCashflow.toLocaleString()}
- Average Gross Yield: ${portfolioMetrics.averageYield.toFixed(2)}%

**INDIVIDUAL PROPERTY ANALYSIS:**
${JSON.stringify(propertyAnalyses, null, 2)}

**IMPORTANT CONTEXT:**
- Owner-occupied properties should be evaluated differently from investment properties
- Do NOT penalize owner-occupied properties for lack of rental income, yield, or cash flow
- Owner-occupied properties should be scored on: equity position, LVR, and capital growth potential
- Investment properties should be scored on: yield, cash flow, LVR, and capital growth

**ANALYSIS REQUIREMENTS:**
Provide a comprehensive portfolio analysis with these sections:

1. EXECUTIVE SUMMARY
   - Portfolio health assessment
   - Key strengths and concerns
   - Overall recommendation

2. PORTFOLIO COMPOSITION ANALYSIS
   - Asset allocation assessment (distinguish owner-occupied vs investment)
   - Geographic diversification (if applicable)
   - Property type mix evaluation

3. FINANCIAL HEALTH METRICS
   - Cashflow analysis (for investment properties only)
   - Equity position assessment (for all properties)
   - Debt serviceability analysis
   - LVR risk assessment

4. INDIVIDUAL PROPERTY RANKINGS
   - Rank investment properties by performance (yield, cashflow)
   - Rank owner-occupied properties by equity position only
   - Identify star performers vs underperformers (investment only)
   - Specific recommendations per property

5. RISK ASSESSMENT
   - Concentration risk
   - Interest rate sensitivity
   - Vacancy risk
   - Market risk factors

6. GROWTH OPPORTUNITIES
   - Equity release options
   - Refinancing opportunities
   - Next purchase recommendations
   - Portfolio optimization strategies

7. ${projectionYears}-YEAR PROJECTIONS
   - Portfolio value projections (assume 5% growth)
   - Equity growth trajectory
   - Cashflow improvement path

8. STRATEGIC RECOMMENDATIONS
   - Short-term actions (0-12 months)
   - Medium-term strategy (1-3 years)
   - Long-term vision (3-10 years)

Format your response as valid JSON with this structure:
{
  "executiveSummary": {
    "overallHealth": "string (Excellent/Good/Fair/Poor)",
    "healthScore": number (0-100),
    "keyStrengths": ["string"],
    "keyConcerns": ["string"],
    "primaryRecommendation": "string"
  },
  "compositionAnalysis": {
    "assetAllocation": "string",
    "diversificationScore": number (0-100),
    "propertyMixAssessment": "string",
    "recommendations": ["string"]
  },
  "financialHealth": {
    "cashflowStatus": "string (Positive/Neutral/Negative)",
    "equityPosition": "string (Strong/Moderate/Weak)",
    "debtServiceability": "string (Comfortable/Manageable/Stressed)",
    "lvrRisk": "string (Low/Medium/High)",
    "analysis": "string"
  },
  "propertyRankings": [
    {
      "rank": number,
      "address": "string",
      "performanceRating": "string (Star/Good/Average/Underperformer)",
      "strengths": ["string"],
      "concerns": ["string"],
      "recommendation": "string"
    }
  ],
  "riskAssessment": {
    "overallRiskLevel": "string (Low/Medium/High)",
    "concentrationRisk": "string",
    "interestRateSensitivity": "string",
    "vacancyRisk": "string",
    "marketRisks": ["string"],
    "mitigationStrategies": ["string"]
  },
  "growthOpportunities": {
    "equityReleaseOptions": ["string"],
    "refinancingOpportunities": ["string"],
    "nextPurchaseRecommendations": ["string"],
    "optimizationStrategies": ["string"]
  },
  "projections": {
    "years": number,
    "projectedPortfolioValue": number,
    "projectedEquity": number,
    "projectedMonthlyCashflow": number,
    "assumptions": ["string"]
  },
  "strategicRecommendations": {
    "shortTerm": ["string"],
    "mediumTerm": ["string"],
    "longTerm": ["string"],
    "priorityActions": ["string"]
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

    console.log('Calling Lovable AI for portfolio analysis...');

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
            content: 'You are an expert property portfolio analyst. Provide detailed, actionable portfolio analysis. CRITICAL: Always respond with ONLY valid JSON - no markdown, no code blocks. Return pure JSON starting with { and ending with }.'
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
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded', details: 'Please wait and try again.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
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
      let jsonString = analysisText;
      const jsonMatch = analysisText.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        jsonString = jsonMatch[1];
      }
      analysis = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.log('Raw response:', analysisText);
      return new Response(
        JSON.stringify({ error: 'Failed to parse analysis results' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const processingTime = Date.now() - startTime;
    console.log(`✅ Portfolio analysis completed in ${processingTime}ms`);

    // Fetch the latest borrowing capacity assessment for this client
    let borrowingCapacity = null;
    try {
      const { data: bcData, error: bcError } = await supabase
        .from('borrowing_capacity_assessments')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (!bcError && bcData) {
        borrowingCapacity = {
          borrowingCapacity: bcData.borrowing_capacity || 0,
          monthlySurplus: bcData.monthly_surplus || 0,
          serviceabilityBand: (bcData.serviceability_band || 'unknown').toLowerCase(),
          dtiRatio: bcData.dti_ratio || 0,
          stressTestedCapacity: bcData.stress_tested_capacity || 0,
          assessmentRate: bcData.assessment_rate || 0,
          grossAnnualIncome: bcData.gross_annual_income || 0,
          shadedAnnualIncome: bcData.shaded_annual_income || 0,
          livingExpenses: bcData.living_expenses_monthly || 0,
          existingCommitments: bcData.existing_commitments_monthly || 0,
          recommendations: Array.isArray(bcData.recommendations) ? bcData.recommendations : [],
          warnings: Array.isArray(bcData.warnings) ? bcData.warnings : [],
          calculatedAt: bcData.created_at,
        };
        console.log('✓ Borrowing capacity assessment found');
      } else {
        console.log('ℹ No borrowing capacity assessment found for client');
      }
    } catch (bcFetchError) {
      console.warn('Could not fetch borrowing capacity:', bcFetchError);
    }

    // Return comprehensive response
    return new Response(
      JSON.stringify({
        success: true,
        clientId,
        clientName: `${client.primary_first_name} ${client.primary_surname}`,
        portfolioMetrics,
        propertyAnalyses,
        analysis,
        borrowingCapacity,
        generatedAt: new Date().toISOString(),
        processingTimeMs: processingTime,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Portfolio analysis error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
