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

// Report section definitions - mirroring generate-investment-report structure
const REPORT_SECTIONS = [
  {
    id: 'section1',
    name: 'Location & Market Overview',
    sections: ['Location Overview', 'Current Market Performance', 'Current Economic Context', 'Demographics & Demand Drivers'],
    maxTokens: 4000,
  },
  {
    id: 'section2', 
    name: 'Amenities & Infrastructure',
    sections: ['Schools & Education', 'Healthcare & Shopping', 'Recreational Amenities', 'Transport & Accessibility', 'Environmental Risks & Climate', 'Crime & Safety'],
    maxTokens: 4000,
  },
  {
    id: 'section3',
    name: 'Property & Financial Analysis',
    sections: ['Property-Level Information', 'Purchase & Ongoing Costs', 'Rental Assessment & Yield Calculation', 'Loan Structure & Repayment Analysis', 'Cashflow Analysis'],
    maxTokens: 4000,
  },
  {
    id: 'section4',
    name: 'Projections & Recommendations',
    sections: ['10-Year Investment Projections', 'SWOT Analysis', 'Top 3 Opportunities', 'Top 3 Risks', 'Data Transparency Statement', 'Investment Recommendations', 'Investment Suitability Screening', 'Final Conclusion', 'Data Sources'],
    maxTokens: 5000,
  }
];

// Helper function to extract content for a specific section from the original report
function extractSectionContent(fullContent: string, sectionNames: string[]): string {
  let extractedContent = '';
  
  for (const sectionName of sectionNames) {
    // Try to find the section by heading (supports # ## ### headings)
    const patterns = [
      new RegExp(`^#{1,3}\\s*${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=^#{1,3}\\s|$)`, 'gmi'),
      new RegExp(`\\*\\*${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*[\\s\\S]*?(?=\\*\\*[A-Z]|^#{1,3}|$)`, 'gmi'),
    ];
    
    for (const pattern of patterns) {
      const matches = fullContent.match(pattern);
      if (matches && matches.length > 0) {
        extractedContent += matches[0] + '\n\n';
        break;
      }
    }
  }
  
  return extractedContent.trim();
}

// Generate a single section with context
async function regenerateSection(
  sectionDef: typeof REPORT_SECTIONS[0],
  originalSectionContent: string,
  overrideSummary: string,
  perplexityApiKey: string,
  previousSections: string,
  propertyAddress: string,
  financialCalculations?: Record<string, any>
): Promise<{ content: string; citations: any[]; error?: string }> {
  
  // Build section-specific context
  let financialContext = '';
  if (sectionDef.id === 'section3' || sectionDef.id === 'section4') {
    if (financialCalculations) {
      financialContext = `
**FINANCIAL DATA FOR CALCULATIONS:**
- Purchase Price: $${financialCalculations.purchasePrice?.toLocaleString() || 'N/A'}
- Weekly Rent: $${financialCalculations.weeklyRent?.toLocaleString() || 'N/A'}
- Gross Yield: ${financialCalculations.grossRentalYield || 'N/A'}%
- Net Yield: ${financialCalculations.netRentalYield || 'N/A'}%
- Annual Cash Flow: $${financialCalculations.annualCashFlow?.toLocaleString() || 'N/A'}
- Weekly Cash Flow: $${financialCalculations.weeklyCashFlow?.toLocaleString() || 'N/A'}
`;
    }
  }

  const sectionPrompt = `You are regenerating a specific section of an investment property report for: ${propertyAddress}

**SECTION TO REGENERATE:** ${sectionDef.name}
**Subsections to include:** ${sectionDef.sections.join(', ')}

**MANUAL OVERRIDES (Use these EXACT values in your analysis):**
${overrideSummary}

${financialContext}

**ORIGINAL CONTENT FOR THIS SECTION:**
${originalSectionContent || 'No original content available - generate fresh content based on the overrides.'}

${previousSections ? `**CONTEXT FROM PREVIOUSLY REGENERATED SECTIONS (for consistency, DO NOT repeat):**
${previousSections.substring(0, 2500)}...
` : ''}

**CRITICAL INSTRUCTIONS:**
1. PRESERVE the exact markdown structure and heading hierarchy (# for main, ## for sub)
2. UPDATE all narrative text to reflect the manual overrides provided
3. RECALCULATE and UPDATE all financial figures based on the overrides
4. Keep the same section order and structure as the original
5. Update qualitative assessments to match the new figures (e.g., yield assessments, cashflow commentary)
6. Ensure tables are complete with actual numbers - no placeholders like "XX" or "N/A"
7. Be thorough and professional - this is a premium client-facing report
8. Start immediately with the first section heading - no preamble or introduction

Generate the ${sectionDef.name} sections now:`;

  const systemMessage = `You are an expert Australian property investment analyst for Naidu Property Consulting Services. You are regenerating sections of an investment report with updated financial figures from manual overrides. 

Your task is to:
1. Preserve the structure and format of the original report sections
2. Update ALL narrative commentary to reflect the new financial figures
3. Ensure calculations, tables, and projections use the override values
4. Maintain professional, analytical tone throughout
5. Be data-driven and specific - avoid vague statements`;

  try {
    console.log(`📝 Regenerating section: ${sectionDef.name}...`);
    
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        max_tokens: sectionDef.maxTokens,
        temperature: 0.2, // Slightly higher than generation for consistency with original
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: sectionPrompt }
        ]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Section ${sectionDef.id} API error:`, response.status, errorText);
      return { content: '', citations: [], error: `API error ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const citations = data.citations || [];
    
    console.log(`✓ Section ${sectionDef.name} regenerated: ${content.length} chars`);
    
    return { content, citations };
  } catch (error: any) {
    console.error(`❌ Error regenerating section ${sectionDef.id}:`, error?.message);
    return { content: '', citations: [], error: error?.message };
  }
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

    console.log('=== MULTI-SECTION REPORT REGENERATION ===');
    console.log('📝 Report ID:', reportId);
    console.log('📍 Property:', propertyAddress);
    console.log('📊 Manual overrides:', Object.keys(manualOverrides).length, 'fields');
    console.log('📄 Original content length:', currentReportContent?.length || 0, 'chars');

    // Build override summary for the AI
    const overrideSummary = buildOverrideSummary(manualOverrides, financialCalculations);
    console.log('📋 Override summary built:', overrideSummary.split('\n').length, 'lines');

    // Generate report header
    const reportHeader = `# NAIDU PROPERTY CONSULTING SERVICES

YOUR DEDICATED PROPERTY PARTNER

# Investment Report: ${propertyAddress}

---

`;

    let combinedContent = reportHeader;
    let allCitations: any[] = [];
    let generationErrors: string[] = [];

    console.log('🔄 Regenerating report in', REPORT_SECTIONS.length, 'sections...');

    for (let i = 0; i < REPORT_SECTIONS.length; i++) {
      const sectionDef = REPORT_SECTIONS[i];
      console.log(`\n📄 Regenerating section ${i + 1}/${REPORT_SECTIONS.length}: ${sectionDef.name}`);
      
      // Extract original content for this section
      const originalSectionContent = extractSectionContent(currentReportContent, sectionDef.sections);
      console.log(`  Original section content: ${originalSectionContent.length} chars`);
      
      // Pass context from previously regenerated sections for consistency
      const previousContext = combinedContent.length > 500 ? combinedContent.substring(combinedContent.length - 2000) : '';
      
      const result = await regenerateSection(
        sectionDef,
        originalSectionContent,
        overrideSummary,
        PERPLEXITY_API_KEY,
        previousContext,
        propertyAddress,
        financialCalculations
      );
      
      if (result.error) {
        console.error(`⚠️ Section ${sectionDef.name} failed:`, result.error);
        generationErrors.push(`${sectionDef.name}: ${result.error}`);
        
        // If we have original content, use it as fallback
        if (originalSectionContent) {
          console.log(`  Using original content as fallback for ${sectionDef.name}`);
          combinedContent += originalSectionContent + '\n\n---\n\n';
        }
        continue;
      }
      
      if (result.content) {
        // Clean the content - remove any preamble or meta-text
        let cleanContent = result.content
          .replace(/^(Here|I will|Let me|Now|The following).*?:\s*/im, '')
          .replace(/^(Certainly|Sure|Of course).*?\n/im, '')
          .trim();
        
        combinedContent += cleanContent + '\n\n---\n\n';
        allCitations = [...allCitations, ...result.citations];
      }
      
      // Small delay between sections to avoid rate limiting
      if (i < REPORT_SECTIONS.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Check if we have substantial content
    if (combinedContent.length < 5000) {
      const errorMsg = `Regeneration produced insufficient content (${combinedContent.length} chars). Errors: ${generationErrors.join('; ')}`;
      console.error('❌', errorMsg);
      throw new Error(errorMsg);
    }

    console.log(`\n✓ Multi-section regeneration complete`);
    console.log(`  Total content length: ${combinedContent.length} chars`);
    console.log(`  Total citations: ${allCitations.length}`);
    console.log(`  Sections with errors: ${generationErrors.length}`);

    // Add sources section if we have citations
    if (allCitations.length > 0) {
      combinedContent += '\n\n## SOURCES & REFERENCES\n\n### Citations:\n';
      const uniqueCitations = [...new Set(allCitations.map((c: any) => c.url || c.title || c))];
      uniqueCitations.forEach((citation: any, index: number) => {
        combinedContent += `${index + 1}. ${citation}\n`;
      });
    }

    // Update the report in the database
    const { error: updateError } = await supabase
      .from('investment_reports')
      .update({
        report_content: combinedContent,
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
      message: 'Report regenerated successfully with multi-section approach',
      citations: allCitations,
      contentLength: combinedContent.length,
      sectionsGenerated: REPORT_SECTIONS.length,
      sectionsWithErrors: generationErrors.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Regenerate report error:', error);
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
    loanTermYears: 'Loan Term (Years)',
    isNewBuild: 'New Build Property',
    isFirstHomeBuyer: 'First Home Buyer',
    landSizeSqm: 'Land Size (sqm)',
    buildSizeSqm: 'Build Size (sqm)',
    bedrooms: 'Bedrooms',
    bathrooms: 'Bathrooms',
    carSpaces: 'Car Spaces',
    propertyType: 'Property Type',
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
    
    if (value === null || value === undefined || value === '') continue;

    let formattedValue: string;
    if (currencyFields.includes(key)) {
      formattedValue = `$${Number(value).toLocaleString()}`;
    } else if (percentFields.includes(key)) {
      formattedValue = `${value}%`;
    } else if (typeof value === 'boolean') {
      formattedValue = value ? 'Yes' : 'No';
    } else {
      formattedValue = String(value);
    }

    summaryLines.push(`- ${label}: ${formattedValue}`);
  }

  // Add calculated metrics if available
  if (financials) {
    summaryLines.push('\n**Calculated Financial Metrics:**');
    if (financials.grossRentalYield) {
      summaryLines.push(`- Gross Rental Yield: ${financials.grossRentalYield}%`);
    }
    if (financials.netRentalYield) {
      summaryLines.push(`- Net Rental Yield: ${financials.netRentalYield}%`);
    }
    if (financials.annualCashFlow !== undefined) {
      const cashFlowStr = financials.annualCashFlow >= 0 
        ? `$${Number(financials.annualCashFlow).toLocaleString()}`
        : `($${Math.abs(Number(financials.annualCashFlow)).toLocaleString()})`;
      summaryLines.push(`- Annual Cash Flow: ${cashFlowStr}`);
    }
    if (financials.weeklyCashFlow !== undefined) {
      const weeklyCashFlowStr = financials.weeklyCashFlow >= 0 
        ? `$${Number(financials.weeklyCashFlow).toLocaleString()}`
        : `($${Math.abs(Number(financials.weeklyCashFlow)).toLocaleString()})`;
      summaryLines.push(`- Weekly Cash Flow: ${weeklyCashFlowStr}`);
    }
    if (financials.totalAnnualExpenses) {
      summaryLines.push(`- Total Annual Expenses: $${Number(financials.totalAnnualExpenses).toLocaleString()}`);
    }
    if (financials.annualRentalIncome) {
      summaryLines.push(`- Annual Rental Income: $${Number(financials.annualRentalIncome).toLocaleString()}`);
    }
  }

  return summaryLines.length > 0 
    ? summaryLines.join('\n') 
    : 'No specific overrides provided - regenerate based on original report data.';
}
