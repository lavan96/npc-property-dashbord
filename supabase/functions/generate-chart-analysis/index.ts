import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChartAnalysisRequest {
  chartId: string;
  chartData: {
    title: string;
    type: string;
    data: any;
    config?: any;
  };
  reportContext?: {
    title: string;
    description?: string;
    listingCount: number;
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { chartId, chartData, reportContext }: ChartAnalysisRequest = await req.json();

    // Generate analysis prompt based on chart data
    const prompt = `You are a property market analyst. Analyze the following chart data and provide insightful qualitative analysis.

Chart Details:
- Title: ${chartData.title}
- Type: ${chartData.type}
- Data: ${JSON.stringify(chartData.data, null, 2)}

Report Context:
- Report Title: ${reportContext?.title || 'Property Market Report'}
- Description: ${reportContext?.description || 'N/A'}
- Total Listings: ${reportContext?.listingCount || 'N/A'}

Please provide a concise but insightful analysis (2-3 sentences) that:
1. Interprets what the data shows about the property market
2. Highlights key trends or patterns
3. Provides actionable insights for real estate professionals

Keep the analysis professional, data-driven, and focused on market implications.`;

    console.log('Generating analysis for chart:', chartId);

    // Call OpenAI API
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a professional property market analyst with expertise in data interpretation and market trends.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (!openAIResponse.ok) {
      const errorData = await openAIResponse.text();
      console.error('OpenAI API error:', errorData);
      throw new Error(`OpenAI API error: ${openAIResponse.status}`);
    }

    const openAIData = await openAIResponse.json();
    const analysisText = openAIData.choices[0]?.message?.content;

    if (!analysisText) {
      throw new Error('No analysis generated from OpenAI');
    }

    // Store analysis in Supabase
    const { data, error } = await supabase
      .from('chart_analysis')
      .insert({
        chart_id: chartId,
        analysis_text: analysisText,
        model_used: 'gpt-4o-mini',
        confidence_score: 0.85 // Default confidence score
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      throw new Error(`Failed to store analysis: ${error.message}`);
    }

    console.log('Analysis generated and stored successfully');

    return new Response(JSON.stringify({
      success: true,
      analysis: data,
      analysisText
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-chart-analysis function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});