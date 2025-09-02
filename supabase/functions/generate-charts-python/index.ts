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
    const { charts }: { charts: ChartData[] } = await req.json();
    console.log(`Generating ${charts.length} charts with Python/Matplotlib`);

    const chartImages: Record<string, string> = {};

    // Generate each chart using Python
    for (const chart of charts) {
      console.log(`Generating chart: ${chart.title}`);
      
      // Prepare Python script for chart generation
      const pythonScript = generatePythonScript(chart);
      
      try {
        // Execute Python script
        const process = new Deno.Command("python3", {
          args: ["-c", pythonScript],
          stdout: "piped",
          stderr: "piped",
        });

        const { code, stdout, stderr } = await process.output();
        
        if (code !== 0) {
          const errorOutput = new TextDecoder().decode(stderr);
          console.error(`Python script failed for chart "${chart.title}":`, errorOutput);
          continue;
        }

        // Get base64 image from Python output
        const base64Image = new TextDecoder().decode(stdout).trim();
        
        if (!base64Image || base64Image.length < 100) {
          console.error(`Invalid base64 output for chart "${chart.title}"`);
          continue;
        }

        // Store with a clean key
        const chartKey = chart.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
        chartImages[chartKey] = `data:image/png;base64,${base64Image}`;
        
        console.log(`Successfully generated chart: ${chartKey}`);
      } catch (error) {
        console.error(`Error generating chart "${chart.title}":`, error);
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
    console.error('Error in generate-charts-python function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      details: 'Failed to generate chart images with Python'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function generatePythonScript(chart: ChartData): string {
  const { type, title, data, width = 800, height = 600 } = chart;
  
  // Prepare data for Python
  const labels = data.map(d => d.label);
  const values = data.map(d => d.value);
  const colors = data.map(d => d.color || '#3b82f6');
  
  return `
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import io
import base64
import numpy as np

# Set up the figure
plt.figure(figsize=(${width/100}, ${height/100}), dpi=100)
plt.style.use('default')

# Data
labels = ${JSON.stringify(labels)}
values = ${JSON.stringify(values)}
colors = ${JSON.stringify(colors)}

# Create ${type} chart
${generateChartCode(type)}

# Style the chart
plt.title('${title}', fontsize=16, fontweight='bold', pad=20)
plt.tight_layout()

# Convert to base64
buffer = io.BytesIO()
plt.savefig(buffer, format='png', bbox_inches='tight', dpi=150, facecolor='white')
buffer.seek(0)
image_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
plt.close()

print(image_base64)
`;
}

function generateChartCode(type: string): string {
  switch (type) {
    case 'bar':
      return `
x_pos = np.arange(len(labels))
bars = plt.bar(x_pos, values, color=colors, alpha=0.8, edgecolor='white', linewidth=1)
plt.xlabel('Categories', fontsize=12)
plt.ylabel('Count', fontsize=12)
plt.xticks(x_pos, labels, rotation=45, ha='right')
plt.grid(axis='y', alpha=0.3)

# Add value labels on bars
for bar, value in zip(bars, values):
    height = bar.get_height()
    plt.text(bar.get_x() + bar.get_width()/2., height + 0.5,
             f'{int(value)}', ha='center', va='bottom', fontsize=10)
`;

    case 'pie':
      return `
wedges, texts, autotexts = plt.pie(values, labels=labels, colors=colors, autopct='%1.1f%%',
                                   startangle=90, textprops={'fontsize': 10})
plt.axis('equal')

# Improve text positioning
for autotext in autotexts:
    autotext.set_color('white')
    autotext.set_fontweight('bold')
`;

    case 'line':
      return `
x_pos = np.arange(len(labels))
plt.plot(x_pos, values, color=colors[0], marker='o', linewidth=2, markersize=6, alpha=0.8)
plt.xlabel('Categories', fontsize=12)
plt.ylabel('Values', fontsize=12)
plt.xticks(x_pos, labels, rotation=45, ha='right')
plt.grid(True, alpha=0.3)

# Add value labels on points
for i, value in enumerate(values):
    plt.annotate(f'{int(value)}', (i, value), textcoords="offset points",
                xytext=(0,10), ha='center', fontsize=10)
`;

    default:
      return `
plt.text(0.5, 0.5, 'Unsupported chart type: ${type}', ha='center', va='center',
         transform=plt.gca().transAxes, fontsize=14)
`;
  }
}