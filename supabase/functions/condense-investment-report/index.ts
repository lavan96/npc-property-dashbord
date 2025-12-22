import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Report tier configurations
const TIER_CONFIG = {
  briefing: {
    name: 'Executive Briefing',
    targetPages: 20,
    contentRatio: 0.4, // 40% of original content
    sections: [
      'Executive Summary',
      'Property Overview',
      'Location Profile',
      'Market Performance Summary',
      'Financial Analysis',
      'Investment Score',
      'Key Risks & Opportunities',
      'Recommendation'
    ]
  },
  snapshot: {
    name: 'Snapshot',
    targetPages: 5,
    contentRatio: 0.15, // 15% of original content
    sections: [
      'Executive Summary',
      'Property Overview',
      'Investment Score',
      'Key Highlights',
      'Recommendation'
    ]
  }
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('=== Condense Investment Report Function Started ===');

  try {
    const requestBody = await req.json();
    const { parentReportId, targetTier } = requestBody;

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

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    // Build the condensation prompt
    const systemPrompt = `You are an expert investment property analyst. Your task is to condense a comprehensive property investment report into a ${tierConfig.name} format.

CRITICAL REQUIREMENTS:
1. Maintain the EXACT SAME section structure and formatting as the original report
2. Use the SAME markdown heading styles (##, ###, etc.)
3. Preserve all numerical data, statistics, and key facts
4. Keep the same professional tone and language
5. Remove redundant explanations and verbose descriptions
6. Focus on the most critical information for investors
7. Target approximately ${tierConfig.targetPages} pages of content (roughly ${Math.round(tierConfig.contentRatio * 100)}% of original)

SECTIONS TO INCLUDE:
${tierConfig.sections.map((s, i) => `${i + 1}. ${s}`).join('\n')}

OUTPUT REQUIREMENTS:
- Start directly with the content (no preamble)
- Maintain all tables and key data points
- Keep investment scores and ratings exactly as they appear
- Preserve any warnings, risks, or red flags
- End with a clear recommendation section`;

    const userPrompt = `Please condense the following comprehensive investment report into a ${tierConfig.name} format:

---
ORIGINAL REPORT:
${parentReport.report_content}
---

Remember:
- Keep the same section headings and structure
- Preserve all key numbers, percentages, and scores
- Focus on the most actionable insights
- Target ~${tierConfig.targetPages} pages of content`;

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
