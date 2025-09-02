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
    dateRange?: string;
    geography?: string;
    marketConditions?: string;
  };
}

interface ProcessedChartData {
  summary: string;
  keyMetrics: string[];
  patterns: string[];
  outliers: string[];
  dataQuality: string;
}

// Process chart data to extract meaningful insights
function processChartData(chartData: any): ProcessedChartData {
  const { data, type, title } = chartData;
  
  if (!data || !Array.isArray(data)) {
    return {
      summary: 'Limited data available for analysis',
      keyMetrics: [],
      patterns: [],
      outliers: [],
      dataQuality: 'Low - insufficient data'
    };
  }

  const keyMetrics: string[] = [];
  const patterns: string[] = [];
  const outliers: string[] = [];
  
  try {
    if (type === 'bar' || type === 'column') {
      // Process bar/column chart data
      const values = data.map(item => typeof item.value === 'number' ? item.value : parseInt(item.value) || 0);
      const total = values.reduce((sum, val) => sum + val, 0);
      const max = Math.max(...values);
      const min = Math.min(...values);
      const avg = total / values.length;
      
      keyMetrics.push(`Total: ${total.toLocaleString()}`);
      keyMetrics.push(`Average: ${Math.round(avg).toLocaleString()}`);
      keyMetrics.push(`Range: ${min.toLocaleString()} - ${max.toLocaleString()}`);
      
      // Find top performers
      const sortedData = [...data].sort((a, b) => (b.value || 0) - (a.value || 0));
      if (sortedData.length > 0) {
        const topItem = sortedData[0];
        const topPercentage = ((topItem.value || 0) / total * 100).toFixed(1);
        patterns.push(`${topItem.name || topItem.label} leads with ${topPercentage}% of total`);
      }
      
      // Identify outliers
      values.forEach((value, index) => {
        if (value > avg * 2) {
          outliers.push(`${data[index].name || data[index].label}: significantly above average`);
        }
      });
      
    } else if (type === 'pie' || type === 'doughnut') {
      // Process pie chart data
      const values = data.map(item => typeof item.value === 'number' ? item.value : parseInt(item.value) || 0);
      const total = values.reduce((sum, val) => sum + val, 0);
      
      keyMetrics.push(`Total segments: ${data.length}`);
      keyMetrics.push(`Total value: ${total.toLocaleString()}`);
      
      // Calculate percentages and find dominant segments
      data.forEach(item => {
        const percentage = ((item.value || 0) / total * 100);
        if (percentage > 25) {
          patterns.push(`${item.name || item.label} dominates at ${percentage.toFixed(1)}%`);
        } else if (percentage < 5) {
          patterns.push(`${item.name || item.label} represents small segment at ${percentage.toFixed(1)}%`);
        }
      });
      
    } else if (type === 'line') {
      // Process line chart data
      if (data[0] && data[0].data) {
        const values = data[0].data.map(point => typeof point.y === 'number' ? point.y : parseInt(point.y) || 0);
        const trend = calculateTrend(values);
        
        keyMetrics.push(`Data points: ${values.length}`);
        keyMetrics.push(`Trend: ${trend.direction} (${trend.strength})`);
        
        if (trend.direction === 'increasing') {
          patterns.push('Positive upward trend observed');
        } else if (trend.direction === 'decreasing') {
          patterns.push('Declining trend identified');
        }
      }
    }
    
    return {
      summary: `Chart contains ${data.length} data points with ${keyMetrics.length} key metrics identified`,
      keyMetrics,
      patterns,
      outliers,
      dataQuality: data.length > 5 ? 'High' : data.length > 2 ? 'Medium' : 'Low'
    };
    
  } catch (error) {
    console.error('Error processing chart data:', error);
    return {
      summary: 'Error processing chart data',
      keyMetrics: [],
      patterns: [],
      outliers: [],
      dataQuality: 'Low - processing error'
    };
  }
}

// Calculate trend direction for line charts
function calculateTrend(values: number[]) {
  if (values.length < 2) return { direction: 'stable', strength: 'insufficient data' };
  
  const first = values[0];
  const last = values[values.length - 1];
  const change = ((last - first) / first) * 100;
  
  let direction = 'stable';
  let strength = 'weak';
  
  if (Math.abs(change) > 20) strength = 'strong';
  else if (Math.abs(change) > 10) strength = 'moderate';
  
  if (change > 5) direction = 'increasing';
  else if (change < -5) direction = 'decreasing';
  
  return { direction, strength };
}

// Generate chart-type specific system prompts
function getSystemPrompt(chartType: string): string {
  const basePrompt = 'You are an expert property market analyst with 15+ years of experience in real estate data interpretation and market trends. You provide professional, actionable insights for real estate professionals, investors, and agents.';
  
  switch (chartType) {
    case 'bar':
    case 'column':
      return `${basePrompt} You specialize in analyzing distribution data, market share analysis, comparative performance metrics, and identifying market leaders and underperformers in property markets.`;
    
    case 'pie':
    case 'doughnut':
      return `${basePrompt} You excel at interpreting market composition, property type distributions, price segment analysis, and identifying market dominance patterns and niche opportunities.`;
    
    case 'line':
      return `${basePrompt} You are skilled in temporal analysis, trend identification, seasonal patterns, market cycles, and forecasting based on historical property market data.`;
    
    default:
      return `${basePrompt} You provide comprehensive analysis across all chart types with focus on actionable market insights.`;
  }
}

// Generate enhanced, context-aware analysis prompts
function generateAnalysisPrompt(chartData: any, processedData: ProcessedChartData, reportContext?: any): string {
  const { title, type } = chartData;
  
  const contextSection = reportContext ? `
MARKET CONTEXT:
• Report: ${reportContext.title || 'Property Market Analysis'}
• Description: ${reportContext.description || 'Comprehensive market analysis'}
• Total Listings Analyzed: ${reportContext.listingCount?.toLocaleString() || 'N/A'}
• Geographic Focus: ${reportContext.geography || 'Regional market'}
• Time Period: ${reportContext.dateRange || 'Recent period'}
• Market Conditions: ${reportContext.marketConditions || 'Current market state'}
` : '';

  const dataInsightsSection = `
DATA INSIGHTS:
• Summary: ${processedData.summary}
• Key Metrics: ${processedData.keyMetrics.join(' | ')}
• Identified Patterns: ${processedData.patterns.join(' | ') || 'No clear patterns identified'}
• Notable Outliers: ${processedData.outliers.join(' | ') || 'No significant outliers'}
• Data Quality: ${processedData.dataQuality}
`;

  const chartSpecificGuidance = getChartSpecificGuidance(type);

  return `Analyze this ${type} chart titled "${title}" and provide professional market analysis.

${contextSection}
${dataInsightsSection}

ANALYSIS FRAMEWORK:
${chartSpecificGuidance}

REQUIREMENTS:
• Write 3-4 professional sentences (150-250 words)
• Focus on market implications and actionable insights
• Use real estate terminology appropriately
• Highlight the most significant finding first
• End with a practical recommendation for real estate professionals
• Be specific about numbers and percentages when relevant
• Avoid generic statements - make it data-driven and insightful

Provide your analysis now:`;
}

// Get chart-type specific analysis guidance
function getChartSpecificGuidance(chartType: string): string {
  switch (chartType) {
    case 'bar':
    case 'column':
      return `• Identify market leaders and their competitive advantages
• Analyze distribution patterns and market concentration
• Highlight performance gaps and opportunities
• Comment on market share dynamics and competitive positioning`;
    
    case 'pie':
    case 'doughnut':
      return `• Interpret market composition and segment dominance
• Identify emerging or declining property categories
• Assess market diversification and concentration risks
• Highlight niche opportunities or oversaturated segments`;
    
    case 'line':
      return `• Analyze trend direction, momentum, and sustainability
• Identify seasonal patterns or cyclical behavior
• Assess market volatility and stability indicators
• Provide forward-looking insights based on trend analysis`;
    
    default:
      return `• Interpret the data's market implications
• Identify key trends and patterns
• Assess opportunities and risks
• Provide actionable recommendations`;
  }
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

    console.log('Generating analysis for chart:', chartId, 'Type:', chartData.type);

    // Process chart data for better analysis
    const processedData = processChartData(chartData);
    
    // Generate chart-type specific prompt
    const prompt = generateAnalysisPrompt(chartData, processedData, reportContext);

    console.log('Generated prompt for analysis');

    // Call OpenAI API with enhanced configuration
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Using reliable model for better compatibility
        messages: [
          {
            role: 'system',
            content: getSystemPrompt(chartData.type)
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 300, // Using max_tokens for gpt-4o-mini
        temperature: 0.7, // Add temperature for better responses
      }),
    });

    if (!openAIResponse.ok) {
      const errorData = await openAIResponse.text();
      console.error('OpenAI API error status:', openAIResponse.status);
      console.error('OpenAI API error body:', errorData);
      throw new Error(`OpenAI API error: ${openAIResponse.status} - ${errorData}`);
    }

    const openAIData = await openAIResponse.json();
    console.log('OpenAI response structure:', JSON.stringify(openAIData, null, 2));
    
    const analysisText = openAIData.choices?.[0]?.message?.content;

    if (!analysisText || analysisText.trim().length === 0) {
      console.error('Empty or missing analysis text from OpenAI');
      console.error('Full OpenAI response:', JSON.stringify(openAIData, null, 2));
      throw new Error('No analysis generated from OpenAI - empty response');
    }

    console.log('Analysis text generated successfully:', analysisText.substring(0, 100) + '...');

    // Store analysis in Supabase
    const { data, error } = await supabase
      .from('chart_analysis')
      .insert({
        chart_id: chartId,
        analysis_text: analysisText,
        model_used: 'gpt-4o-mini',
        confidence_score: 0.85
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