import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChartData {
  type: 'bar' | 'pie' | 'line';
  title: string;
  data: Array<{ label: string; value: number; color?: string }>;
  width?: number;
  height?: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { charts }: { charts: ChartData[] } = await req.json();

    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const chartImages: Record<string, string> = {};

    // Generate each chart image using OpenAI
    for (const chart of charts) {
      console.log(`Generating chart: ${chart.title}`);
      
      const prompt = `Create a ${chart.type} chart with the following specifications:
- Title: "${chart.title}"
- Data: ${JSON.stringify(chart.data)}
- Style: Clean, professional, with clear labels and legend
- Size: ${chart.width || 800}x${chart.height || 600} pixels
- Format: High-quality chart suitable for business reports
${chart.type === 'pie' ? '- Show percentages on segments' : ''}
${chart.type === 'bar' ? '- Include value labels on bars' : ''}
${chart.type === 'line' ? '- Include data point markers' : ''}`;

      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt: prompt,
          n: 1,
          size: '1024x1024',
          quality: 'high'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('OpenAI API Error:', errorData);
        throw new Error(`OpenAI API Error: ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      console.log('OpenAI response:', JSON.stringify(data, null, 2));
      
      // Handle different response formats from OpenAI
      let base64Image;
      if (data.data && data.data[0]) {
        if (data.data[0].b64_json) {
          // Direct base64 response
          base64Image = data.data[0].b64_json;
        } else if (data.data[0].url) {
          // URL response - need to fetch and convert
          const imageResponse = await fetch(data.data[0].url);
          if (!imageResponse.ok) {
            throw new Error(`Failed to fetch image from URL: ${imageResponse.status}`);
          }
          const imageBuffer = await imageResponse.arrayBuffer();
          base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
        } else {
          throw new Error('No valid image data in OpenAI response');
        }
      } else {
        throw new Error('Invalid OpenAI API response structure');
      }
      
      // Store with a clean key (remove spaces and special characters)
      const chartKey = chart.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
      chartImages[chartKey] = `data:image/png;base64,${base64Image}`;
      
      console.log(`Generated chart: ${chartKey}`);
    }

    return new Response(JSON.stringify({ chartImages }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-chart-images function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      details: 'Failed to generate chart images'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});