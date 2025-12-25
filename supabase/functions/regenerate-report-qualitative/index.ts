import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RegenerateRequest {
  reportId: string;
  manualOverrides: Record<string, any>;
  currentReportContent: string;
  propertyAddress: string;
  financialCalculations?: Record<string, any>;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    if (!PERPLEXITY_API_KEY) {
      throw new Error('PERPLEXITY_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      reportId, 
      manualOverrides, 
      currentReportContent, 
      propertyAddress,
      financialCalculations 
    }: RegenerateRequest = await req.json();

    console.log('📝 Regenerating qualitative content for report:', reportId);
    console.log('📊 Manual overrides applied:', Object.keys(manualOverrides));

    // Build override summary for the AI
    const overrideSummary = buildOverrideSummary(manualOverrides, financialCalculations);
    
    // Extract section structure from current report
    const sectionStructure = extractSectionStructure(currentReportContent);
    
    console.log('📋 Detected sections:', sectionStructure.length);

    // Build the prompt for Perplexity
    const systemPrompt = `You are an expert investment property analyst. Your task is to update the qualitative analysis sections of an investment report to reflect new financial figures that have been manually adjusted.

CRITICAL INSTRUCTIONS:
1. PRESERVE the EXACT markdown structure, heading levels, and section order of the original report
2. PRESERVE all tables, lists, and formatting exactly as they appear
3. ONLY update the narrative/commentary text to reflect the new figures
4. DO NOT add new sections or remove existing ones
5. DO NOT change numerical data in tables - those are handled separately
6. Update qualitative assessments (e.g., "modest yield" → "strong yield" if rental income increased significantly)
7. Ensure recommendations and risk assessments align with the updated figures
8. Maintain the professional, analytical tone of the original report

The following values have been manually overridden by the user and should be treated as the source of truth for your analysis:
${overrideSummary}`;

    const userPrompt = `Here is the current investment report for ${propertyAddress}:

---
${currentReportContent}
---

Please regenerate this report with updated qualitative analysis that reflects the manually adjusted figures listed in the system prompt. 

Remember:
- Keep the EXACT same structure and section order
- Update narrative commentary to match the new figures
- Adjust recommendations if the investment profile has changed significantly
- Preserve all markdown formatting, tables, and lists exactly

Return the complete updated report.`;

    console.log('🔄 Calling Perplexity API with sonar-pro model...');

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 8000,
        temperature: 0.3, // Lower temperature for more consistent output
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Perplexity API error:', response.status, errorText);
      throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const updatedContent = data.choices?.[0]?.message?.content;
    const citations = data.citations || [];

    if (!updatedContent) {
      throw new Error('No content returned from Perplexity API');
    }

    console.log('✅ Received updated content from Perplexity');
    console.log('📚 Citations:', citations.length);

    // Update the report in the database
    // The existing archive_report_version trigger will handle versioning
    const { error: updateError } = await supabase
      .from('investment_reports')
      .update({
        report_content: updatedContent,
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);

    if (updateError) {
      console.error('❌ Database update error:', updateError);
      throw updateError;
    }

    console.log('✅ Report content updated successfully');

    return new Response(JSON.stringify({
      success: true,
      message: 'Qualitative analysis regenerated successfully',
      citations,
      contentLength: updatedContent.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Regenerate qualitative error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function buildOverrideSummary(overrides: Record<string, any>, financials?: Record<string, any>): string {
  const summaryLines: string[] = [];
  
  const fieldLabels: Record<string, string> = {
    purchasePrice: 'Purchase Price',
    weeklyRent: 'Weekly Rent',
    interestRate: 'Interest Rate',
    loanToValueRatio: 'Loan to Value Ratio (LVR)',
    capitalGrowth: 'Expected Capital Growth',
    stampDuty: 'Stamp Duty',
    councilRates: 'Council Rates',
    waterRates: 'Water Rates',
    bodyCorporateFees: 'Body Corporate/Strata Fees',
    landTax: 'Land Tax',
    buildingLandlordInsurance: 'Building & Landlord Insurance',
    propertyManagementFees: 'Property Management Fees',
    repairsMaintenance: 'Repairs & Maintenance',
    lettingFees: 'Letting Fees',
    depreciation: 'Annual Depreciation',
    taxRate: 'Marginal Tax Rate',
    occupancyRate: 'Occupancy Rate',
    loanAmount: 'Loan Amount',
    depositValue: 'Deposit Value',
    landPrice: 'Land Price',
    buildPrice: 'Build Price',
    buildType: 'Build Type',
  };

  const currencyFields = [
    'purchasePrice', 'weeklyRent', 'stampDuty', 'councilRates', 'waterRates',
    'bodyCorporateFees', 'landTax', 'buildingLandlordInsurance', 'repairsMaintenance',
    'lettingFees', 'depreciation', 'loanAmount', 'depositValue', 'landPrice', 'buildPrice'
  ];

  const percentFields = [
    'interestRate', 'loanToValueRatio', 'capitalGrowth', 'propertyManagementFees',
    'taxRate', 'occupancyRate'
  ];

  for (const [key, value] of Object.entries(overrides)) {
    // Skip internal toggle/config fields
    if (key.includes('Toggle') || key === 'cashFlowFieldToggles' || 
        key === 'includeDepreciationInCashFlow' || key === 'schedulePreset' ||
        key === 'customStageMonths' || key === 'cashFlowYearlyOverrides' ||
        key === 'depreciationSchedule' || key === 'depreciationMethod') {
      continue;
    }

    const label = fieldLabels[key] || key;
    
    if (value === null || value === undefined) continue;

    let formattedValue: string;
    if (currencyFields.includes(key)) {
      formattedValue = `$${Number(value).toLocaleString()}`;
    } else if (percentFields.includes(key)) {
      formattedValue = `${value}%`;
    } else {
      formattedValue = String(value);
    }

    summaryLines.push(`- ${label}: ${formattedValue}`);
  }

  // Add calculated metrics if available
  if (financials) {
    if (financials.grossRentalYield) {
      summaryLines.push(`- Gross Rental Yield: ${financials.grossRentalYield}%`);
    }
    if (financials.netRentalYield) {
      summaryLines.push(`- Net Rental Yield: ${financials.netRentalYield}%`);
    }
    if (financials.annualCashFlow) {
      summaryLines.push(`- Annual Cash Flow: $${Number(financials.annualCashFlow).toLocaleString()}`);
    }
    if (financials.weeklyCashFlow) {
      summaryLines.push(`- Weekly Cash Flow: $${Number(financials.weeklyCashFlow).toLocaleString()}`);
    }
  }

  return summaryLines.length > 0 
    ? summaryLines.join('\n') 
    : 'No specific overrides provided.';
}

function extractSectionStructure(content: string): string[] {
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  const sections: string[] = [];
  let match;
  
  while ((match = headingRegex.exec(content)) !== null) {
    sections.push(match[2]);
  }
  
  return sections;
}
