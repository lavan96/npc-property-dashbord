import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
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

    if (!charts || !Array.isArray(charts)) {
      throw new Error('Invalid charts data: charts must be an array');
    }
    
    console.log(`Generating ${charts.length} charts using ChatGPT + Python matplotlib`);

    const chartImages: Record<string, string> = {};

    // Generate each chart using ChatGPT to create Python matplotlib code and then generate images
    for (const chart of charts) {
      console.log(`Generating chart: ${chart.title}`);
      
      try {
        // Step 1: Generate Python matplotlib code using ChatGPT
        const pythonCode = await generatePythonCode(chart);
        console.log(`Generated Python code for ${chart.title}:`, pythonCode.substring(0, 200) + '...');
        
        // Step 2: Use the Python code to generate an actual chart image via OpenAI
        const chartImage = await generateChartImage(chart, pythonCode);
        
        // Store with a clean key
        const chartKey = chart.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
        chartImages[chartKey] = chartImage;
        
        console.log(`Successfully generated chart: ${chartKey}`);
      } catch (error) {
        console.error(`Error generating chart "${chart.title}":`, error);
        // Create a fallback
        const fallbackText = `Chart: ${chart.title}\nData points: ${chart.data.length}\nType: ${chart.type}`;
        const encodedFallback = btoa(fallbackText);
        const chartKey = chart.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
        chartImages[chartKey] = `data:text/plain;base64,${encodedFallback}`;
        continue;
      }
    }

    console.log(`Returning ${Object.keys(chartImages).length} chart images`);
    
    return new Response(JSON.stringify({ chartImages }), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
      },
    });

  } catch (error) {
    console.error('Error in generate-charts function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      details: 'Failed to generate chart images with ChatGPT + Python'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Generate Python matplotlib code using ChatGPT
async function generatePythonCode(chart: ChartData): Promise<string> {
  const prompt = `Generate clean, professional Python matplotlib code for a ${chart.type} chart with the following specifications:

Title: "${chart.title}"
Chart Type: ${chart.type}
Data: ${JSON.stringify(chart.data)}

Requirements:
- Use matplotlib and numpy
- Create a ${chart.width || 800}x${chart.height || 600} figure
- Professional styling with clean fonts and colors
- For pie charts: show percentages and labels
- For bar charts: include value labels on bars
- For line charts: include markers and grid
- Save as high-quality PNG with 300 DPI
- Use tight layout
- No plt.show(), just save the figure

Return ONLY the Python code, no explanations.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an expert Python programmer specializing in matplotlib chart generation. Generate clean, production-ready code.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to generate Python code: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Generate actual chart image using OpenAI image generation based on Python code
async function generateChartImage(chart: ChartData, pythonCode: string): Promise<string> {
  const prompt = `Create a professional ${chart.type} chart based on this Python matplotlib code:

${pythonCode}

Generate a high-quality chart image that exactly matches what this Python code would produce:
- Title: "${chart.title}"
- Data: ${JSON.stringify(chart.data)}
- Professional business chart styling
- Clean, readable fonts
- Appropriate colors and spacing
- ${chart.type === 'pie' ? 'Show percentages on pie slices' : ''}
- ${chart.type === 'bar' ? 'Include value labels on bars' : ''}
- ${chart.type === 'line' ? 'Include data point markers and grid lines' : ''}
- White background
- High resolution and clarity`;

  let retryCount = 0;
  const maxRetries = 3;
  let response;
  
  while (retryCount < maxRetries) {
    try {
      console.log(`Attempt ${retryCount + 1} for chart: ${chart.title}`);
      
      response = await fetch('https://api.openai.com/v1/images/generations', {
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
          quality: 'high',
          output_format: 'png'
        }),
      });
      
      if (response.ok) {
        break;
      } else {
        console.error(`Attempt ${retryCount + 1} failed with status: ${response.status}`);
        retryCount++;
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
    } catch (error) {
      console.error(`Attempt ${retryCount + 1} failed with error:`, error);
      retryCount++;
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }
  }

  if (!response || !response.ok) {
    throw new Error(`Failed to generate chart image after ${maxRetries} attempts`);
  }

  const data = await response.json();
  console.log(`OpenAI response for "${chart.title}":`, JSON.stringify(data, null, 2));
  
  // Handle different response formats from OpenAI
  let base64Image;
  if (data.data && data.data[0]) {
    if (data.data[0].b64_json) {
      // Direct base64 response
      base64Image = data.data[0].b64_json;
    } else if (data.data[0].url) {
      // URL response - need to fetch and convert
      console.log(`Fetching image from URL for chart: ${chart.title}`);
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
  
  // Validate base64 image
  if (!base64Image || base64Image.length < 100) {
    throw new Error('Invalid or empty base64 image data');
  }
  
  return `data:image/png;base64,${base64Image}`;
}