import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    let body;
    let charts: ChartData[];
    
    try {
      body = await req.json();
      console.log('Parsed request as JSON:', body);
      charts = body.charts;
    } catch (jsonError) {
      console.log('Failed to parse as JSON, trying text...');
      const bodyText = await req.text();
      console.log('Raw request body as text:', bodyText);
      
      if (!bodyText) {
        throw new Error('Empty request body');
      }
      
      const parsed = JSON.parse(bodyText);
      charts = parsed.charts;
    }
    
    if (!charts || !Array.isArray(charts)) {
      throw new Error('Invalid charts data: charts must be an array');
    }
    
    console.log(`Generating ${charts.length} charts with JavaScript SVG`);

    const chartImages: Record<string, string> = {};

    // Generate each chart using SVG (server-side compatible)
    for (const chart of charts) {
      console.log(`Generating chart: ${chart.title}`);
      
      try {
        // Generate SVG-based chart that can be converted to base64
        const svgChart = generateSVGChart(chart);
        const base64Image = btoa(svgChart);
        
        // Store with a clean key
        const chartKey = chart.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
        chartImages[chartKey] = `data:image/svg+xml;base64,${base64Image}`;
        
        console.log(`Successfully generated chart: ${chartKey}`);
      } catch (error) {
        console.error(`Error generating chart "${chart.title}":`, error);
        // Create a simple text fallback
        const fallbackSVG = `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="300" fill="#f8f9fa" stroke="#e9ecef" stroke-width="1"/>
          <text x="200" y="150" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#333">
            Chart: ${chart.title}
          </text>
          <text x="200" y="180" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#666">
            ${chart.data.length} data points (${chart.type} chart)
          </text>
        </svg>`;
        
        const chartKey = chart.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
        chartImages[chartKey] = `data:image/svg+xml;base64,${btoa(fallbackSVG)}`;
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
      details: 'Failed to generate chart images with SVG'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function generateSVGChart(chart: ChartData): string {
  const { type, title, data, width = 600, height = 400 } = chart;
  
  // Chart dimensions
  const padding = 60;
  const chartWidth = width - 2 * padding;
  const chartHeight = height - 2 * padding - 40; // Extra space for title
  
  let chartContent = '';
  
  switch (type) {
    case 'bar':
      chartContent = generateBarChart(data, chartWidth, chartHeight, padding);
      break;
    case 'pie':
      chartContent = generatePieChart(data, chartWidth, chartHeight, padding);
      break;
    case 'line':
      chartContent = generateLineChart(data, chartWidth, chartHeight, padding);
      break;
    default:
      chartContent = `<text x="${width/2}" y="${height/2}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#666">
        Unsupported chart type: ${type}
      </text>`;
  }
  
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="white" stroke="#e5e7eb" stroke-width="1"/>
    
    <!-- Title -->
    <text x="${width/2}" y="30" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#1f2937">
      ${title}
    </text>
    
    <!-- Chart content -->
    ${chartContent}
  </svg>`;
}

function generateBarChart(data: Array<{ label: string; value: number; color?: string }>, width: number, height: number, padding: number): string {
  if (data.length === 0) return '';
  
  const maxValue = Math.max(...data.map(d => d.value));
  const barWidth = width / data.length * 0.8;
  const barSpacing = width / data.length * 0.2;
  
  let bars = '';
  let labels = '';
  
  data.forEach((item, index) => {
    const barHeight = (item.value / maxValue) * height;
    const x = padding + index * (barWidth + barSpacing);
    const y = padding + 40 + (height - barHeight);
    const color = item.color || '#3b82f6';
    
    // Bar
    bars += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${color}" opacity="0.8"/>`;
    
    // Value label
    bars += `<text x="${x + barWidth/2}" y="${y - 5}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#374151">
      ${item.value}
    </text>`;
    
    // X-axis label
    labels += `<text x="${x + barWidth/2}" y="${padding + height + 55}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#6b7280">
      ${item.label.length > 10 ? item.label.substring(0, 10) + '...' : item.label}
    </text>`;
  });
  
  // Y-axis and grid lines
  let gridLines = '';
  for (let i = 0; i <= 5; i++) {
    const y = padding + 40 + (height * i / 5);
    const value = Math.round(maxValue * (5 - i) / 5);
    gridLines += `<line x1="${padding}" y1="${y}" x2="${padding + width}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
    gridLines += `<text x="${padding - 10}" y="${y + 4}" text-anchor="end" font-family="Arial, sans-serif" font-size="10" fill="#6b7280">
      ${value}
    </text>`;
  }
  
  return gridLines + bars + labels;
}

function generatePieChart(data: Array<{ label: string; value: number; color?: string }>, width: number, height: number, padding: number): string {
  if (data.length === 0) return '';
  
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const centerX = padding + width / 2;
  const centerY = padding + 40 + height / 2;
  const radius = Math.min(width, height) / 2 - 20;
  
  let slices = '';
  let legends = '';
  let currentAngle = 0;
  
  data.forEach((item, index) => {
    const sliceAngle = (item.value / total) * 2 * Math.PI;
    const color = item.color || `hsl(${index * 360 / data.length}, 70%, 50%)`;
    
    // Calculate arc path
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;
    
    const x1 = centerX + radius * Math.cos(startAngle);
    const y1 = centerY + radius * Math.sin(startAngle);
    const x2 = centerX + radius * Math.cos(endAngle);
    const y2 = centerY + radius * Math.sin(endAngle);
    
    const largeArc = sliceAngle > Math.PI ? 1 : 0;
    
    slices += `<path d="M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z" 
      fill="${color}" stroke="white" stroke-width="2"/>`;
    
    // Percentage label
    const labelAngle = startAngle + sliceAngle / 2;
    const labelX = centerX + (radius * 0.7) * Math.cos(labelAngle);
    const labelY = centerY + (radius * 0.7) * Math.sin(labelAngle);
    const percentage = ((item.value / total) * 100).toFixed(1);
    
    slices += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="white">
      ${percentage}%
    </text>`;
    
    // Legend
    const legendY = padding + 60 + index * 20;
    legends += `<rect x="${padding + width + 20}" y="${legendY - 8}" width="12" height="12" fill="${color}"/>`;
    legends += `<text x="${padding + width + 40}" y="${legendY}" font-family="Arial, sans-serif" font-size="12" fill="#374151">
      ${item.label} (${item.value})
    </text>`;
    
    currentAngle += sliceAngle;
  });
  
  return slices + legends;
}

function generateLineChart(data: Array<{ label: string; value: number; color?: string }>, width: number, height: number, padding: number): string {
  if (data.length === 0) return '';
  
  const maxValue = Math.max(...data.map(d => d.value));
  const minValue = Math.min(...data.map(d => d.value));
  const valueRange = maxValue - minValue || 1;
  
  let path = '';
  let points = '';
  let labels = '';
  
  data.forEach((item, index) => {
    const x = padding + (index / (data.length - 1)) * width;
    const y = padding + 40 + height - ((item.value - minValue) / valueRange) * height;
    
    if (index === 0) {
      path = `M ${x} ${y}`;
    } else {
      path += ` L ${x} ${y}`;
    }
    
    // Data point
    points += `<circle cx="${x}" cy="${y}" r="4" fill="#3b82f6" stroke="white" stroke-width="2"/>`;
    
    // Value label
    points += `<text x="${x}" y="${y - 10}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#374151">
      ${item.value}
    </text>`;
    
    // X-axis label
    labels += `<text x="${x}" y="${padding + height + 55}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#6b7280">
      ${item.label.length > 8 ? item.label.substring(0, 8) + '...' : item.label}
    </text>`;
  });
  
  // Grid lines and Y-axis
  let gridLines = '';
  for (let i = 0; i <= 5; i++) {
    const y = padding + 40 + (height * i / 5);
    const value = Math.round(maxValue - (valueRange * i / 5));
    gridLines += `<line x1="${padding}" y1="${y}" x2="${padding + width}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
    gridLines += `<text x="${padding - 10}" y="${y + 4}" text-anchor="end" font-family="Arial, sans-serif" font-size="10" fill="#6b7280">
      ${value}
    </text>`;
  }
  
  return gridLines + `<path d="${path}" fill="none" stroke="#3b82f6" stroke-width="3"/>` + points + labels;
}