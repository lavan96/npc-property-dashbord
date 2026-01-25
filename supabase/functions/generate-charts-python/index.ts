import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

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
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Verify authentication
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log('=== CHART GENERATION FUNCTION START ===');
    
    const body = await req.json();
    const { charts }: { charts: ChartData[] } = body;
    
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.log('[generate-charts-python] Auth failed:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }
    console.log(`[generate-charts-python] Authenticated user: ${userId}`);
    
    if (!charts || !Array.isArray(charts)) {
      throw new Error('Invalid charts data: charts must be an array');
    }
    
    console.log(`Generating ${charts.length} charts using pure SVG`);

    const chartImages: Record<string, string> = {};

    // Generate each chart as optimized SVG
    for (const chart of charts) {
      console.log(`Generating chart: ${chart.title}`);
      
      try {
        const svgChart = generateOptimizedSVGChart(chart);
        const base64Image = btoa(svgChart);
        
        // Store with a clean key
        const chartKey = chart.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
        chartImages[chartKey] = `data:image/svg+xml;base64,${base64Image}`;
        
        console.log(`Successfully generated chart: ${chartKey}`);
      } catch (error) {
        console.error(`Error generating chart "${chart.title}":`, error);
        // Create a simple fallback
        const fallbackSVG = createFallbackChart(chart);
        const chartKey = chart.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
        chartImages[chartKey] = `data:image/svg+xml;base64,${btoa(fallbackSVG)}`;
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage,
      details: 'Failed to generate chart images'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function generateOptimizedSVGChart(chart: ChartData): string {
  const { type, title, data, width = 800, height = 600 } = chart;
  
  // Enhanced styling and layout
  const padding = 80;
  const chartWidth = width - 2 * padding;
  const chartHeight = height - 2 * padding - 60; // Extra space for title
  
  let chartContent = '';
  
  switch (type) {
    case 'bar':
      chartContent = generateEnhancedBarChart(data, chartWidth, chartHeight, padding);
      break;
    case 'pie':
      chartContent = generateEnhancedPieChart(data, chartWidth, chartHeight, padding);
      break;
    case 'line':
      chartContent = generateEnhancedLineChart(data, chartWidth, chartHeight, padding);
      break;
    default:
      chartContent = `<text x="${width/2}" y="${height/2}" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#666">
        Unsupported chart type: ${type}
      </text>`;
  }
  
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" style="background: white;">
    <!-- Background -->
    <rect width="${width}" height="${height}" fill="white" stroke="none"/>
    
    <!-- Title -->
    <text x="${width/2}" y="40" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#1f2937">
      ${title}
    </text>
    
    <!-- Chart content -->
    ${chartContent}
  </svg>`;
}

function generateEnhancedBarChart(data: Array<{ label: string; value: number; color?: string }>, width: number, height: number, padding: number): string {
  if (data.length === 0) return '';
  
  const maxValue = Math.max(...data.map(d => d.value));
  const barWidth = (width / data.length) * 0.7;
  const barSpacing = (width / data.length) * 0.3;
  
  let bars = '';
  let labels = '';
  let gridLines = '';
  
  // Grid lines and Y-axis labels
  for (let i = 0; i <= 5; i++) {
    const y = padding + 60 + (height * i / 5);
    const value = Math.round(maxValue * (5 - i) / 5);
    gridLines += `<line x1="${padding}" y1="${y}" x2="${padding + width}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
    gridLines += `<text x="${padding - 15}" y="${y + 5}" text-anchor="end" font-family="Arial, sans-serif" font-size="12" fill="#6b7280">
      ${value}
    </text>`;
  }
  
  // Y-axis
  gridLines += `<line x1="${padding}" y1="${padding + 60}" x2="${padding}" y2="${padding + 60 + height}" stroke="#374151" stroke-width="2"/>`;
  // X-axis
  gridLines += `<line x1="${padding}" y1="${padding + 60 + height}" x2="${padding + width}" y2="${padding + 60 + height}" stroke="#374151" stroke-width="2"/>`;
  
  data.forEach((item, index) => {
    const barHeight = maxValue > 0 ? (item.value / maxValue) * height : 0;
    const x = padding + index * (barWidth + barSpacing) + barSpacing / 2;
    const y = padding + 60 + (height - barHeight);
    const color = item.color || '#3b82f6';
    
    // Bar with gradient
    bars += `
      <defs>
        <linearGradient id="grad${index}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${color};stop-opacity:0.7" />
        </linearGradient>
      </defs>
      <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="url(#grad${index})" stroke="${color}" stroke-width="1" rx="3"/>
    `;
    
    // Value label on top of bar
    if (item.value > 0) {
      bars += `<text x="${x + barWidth/2}" y="${y - 8}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#374151">
        ${item.value}
      </text>`;
    }
    
    // X-axis label (rotated if long)
    const labelLength = item.label.length;
    const displayLabel = labelLength > 12 ? item.label.substring(0, 12) + '...' : item.label;
    const labelY = padding + 60 + height + 20;
    const labelX = x + barWidth/2;
    
    if (labelLength > 8) {
      labels += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#6b7280" transform="rotate(-45, ${labelX}, ${labelY})">
        ${displayLabel}
      </text>`;
    } else {
      labels += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#6b7280">
        ${displayLabel}
      </text>`;
    }
  });
  
  return gridLines + bars + labels;
}

function generateEnhancedPieChart(data: Array<{ label: string; value: number; color?: string }>, width: number, height: number, padding: number): string {
  if (data.length === 0) return '';
  
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return '';
  
  const centerX = padding + width / 2;
  const centerY = padding + 60 + height / 2;
  const radius = Math.min(width, height) / 2 - 40;
  
  let slices = '';
  let legends = '';
  let currentAngle = 0;
  
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];
  
  data.forEach((item, index) => {
    const sliceAngle = (item.value / total) * 2 * Math.PI;
    const color = item.color || colors[index % colors.length];
    
    if (sliceAngle < 0.01) return; // Skip very small slices
    
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;
    
    const x1 = centerX + radius * Math.cos(startAngle);
    const y1 = centerY + radius * Math.sin(startAngle);
    const x2 = centerX + radius * Math.cos(endAngle);
    const y2 = centerY + radius * Math.sin(endAngle);
    
    const largeArc = sliceAngle > Math.PI ? 1 : 0;
    
    // Create slice with gradient
    slices += `
      <defs>
        <radialGradient id="pieGrad${index}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${color};stop-opacity:0.8" />
        </radialGradient>
      </defs>
      <path d="M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z" 
        fill="url(#pieGrad${index})" stroke="white" stroke-width="2"/>
    `;
    
    // Percentage label
    if (sliceAngle > 0.2) { // Only show percentage for slices > ~11%
      const labelAngle = startAngle + sliceAngle / 2;
      const labelX = centerX + (radius * 0.6) * Math.cos(labelAngle);
      const labelY = centerY + (radius * 0.6) * Math.sin(labelAngle);
      const percentage = ((item.value / total) * 100).toFixed(1);
      
      slices += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="white">
        ${percentage}%
      </text>`;
    }
    
    // Legend
    const legendY = padding + 80 + index * 25;
    const legendX = centerX + radius + 40;
    legends += `<rect x="${legendX}" y="${legendY - 8}" width="16" height="16" fill="${color}" rx="2"/>`;
    legends += `<text x="${legendX + 25}" y="${legendY + 4}" font-family="Arial, sans-serif" font-size="12" fill="#374151">
      ${item.label} (${item.value})
    </text>`;
    
    currentAngle += sliceAngle;
  });
  
  return slices + legends;
}

function generateEnhancedLineChart(data: Array<{ label: string; value: number; color?: string }>, width: number, height: number, padding: number): string {
  if (data.length === 0) return '';
  
  const maxValue = Math.max(...data.map(d => d.value));
  const minValue = Math.min(...data.map(d => d.value));
  const valueRange = maxValue - minValue || 1;
  
  let path = '';
  let points = '';
  let labels = '';
  let gridLines = '';
  
  // Grid lines and Y-axis
  for (let i = 0; i <= 5; i++) {
    const y = padding + 60 + (height * i / 5);
    const value = Math.round(maxValue - (valueRange * i / 5));
    gridLines += `<line x1="${padding}" y1="${y}" x2="${padding + width}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
    gridLines += `<text x="${padding - 15}" y="${y + 5}" text-anchor="end" font-family="Arial, sans-serif" font-size="12" fill="#6b7280">
      ${value}
    </text>`;
  }
  
  // Y and X axes
  gridLines += `<line x1="${padding}" y1="${padding + 60}" x2="${padding}" y2="${padding + 60 + height}" stroke="#374151" stroke-width="2"/>`;
  gridLines += `<line x1="${padding}" y1="${padding + 60 + height}" x2="${padding + width}" y2="${padding + 60 + height}" stroke="#374151" stroke-width="2"/>`;
  
  data.forEach((item, index) => {
    const x = padding + (index / (data.length - 1)) * width;
    const y = padding + 60 + height - ((item.value - minValue) / valueRange) * height;
    
    if (index === 0) {
      path = `M ${x} ${y}`;
    } else {
      path += ` L ${x} ${y}`;
    }
    
    // Data point
    points += `<circle cx="${x}" cy="${y}" r="6" fill="#3b82f6" stroke="white" stroke-width="3"/>`;
    
    // Value label
    points += `<text x="${x}" y="${y - 15}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#374151">
      ${item.value}
    </text>`;
    
    // X-axis label
    const displayLabel = item.label.length > 10 ? item.label.substring(0, 10) + '...' : item.label;
    labels += `<text x="${x}" y="${padding + height + 80}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#6b7280">
      ${displayLabel}
    </text>`;
  });
  
  return gridLines + `<path d="${path}" fill="none" stroke="#3b82f6" stroke-width="3"/>` + points + labels;
}

function createFallbackChart(chart: ChartData): string {
  return `<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg" style="background: white;">
    <rect width="600" height="400" fill="#f8f9fa" stroke="#e9ecef" stroke-width="1"/>
    <text x="300" y="180" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#333">
      Chart: ${chart.title}
    </text>
    <text x="300" y="210" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#666">
      ${chart.data.length} data points (${chart.type} chart)
    </text>
    <text x="300" y="240" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#999">
      Chart generation temporarily unavailable
    </text>
  </svg>`;
}