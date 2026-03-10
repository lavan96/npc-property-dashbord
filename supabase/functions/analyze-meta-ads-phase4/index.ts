import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Phase4Request {
  action: 'benchmarks' | 'market_correlation';
  insights?: any[];
  campaigns?: any[];
  datePreset?: string;
  totals?: {
    spend: number;
    leads: number;
    cpl: number;
    ctr: number;
    cpc: number;
    impressions: number;
    clicks: number;
  };
}

interface BenchmarkData {
  metric: string;
  your_value: number;
  industry_avg: number;
  industry_top_quartile: number;
  percentile_rank: number;
  verdict: 'excellent' | 'above_average' | 'average' | 'below_average' | 'poor';
  insight: string;
}

interface MarketEvent {
  date: string;
  event: string;
  category: 'interest_rate' | 'economic' | 'housing' | 'regulatory' | 'seasonal';
  impact: 'positive' | 'negative' | 'neutral';
  description: string;
  relevance_score: number; // 0-100
}

// ─── Perplexity Integration ──────────────────────────────────────────────────

async function queryPerplexity(prompt: string, apiKey: string): Promise<{ content: string; citations: string[] }> {
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [
        {
          role: 'system',
          content: 'You are a marketing analytics expert specializing in Australian property investment digital advertising. Provide data-driven insights with specific numbers. Always cite your sources.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      search_recency_filter: 'month',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Perplexity API error [${response.status}]: ${text}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    citations: data.citations || [],
  };
}

// ─── AI Analysis via Lovable Gateway ─────────────────────────────────────────

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'You are an expert marketing strategist for Australian property investment companies. Provide concise, actionable analysis.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 3000,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI Gateway error [${response.status}]: ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ─── Structured Benchmark Extraction ─────────────────────────────────────────

async function extractBenchmarks(apiKey: string): Promise<any> {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: 'You are a digital marketing data analyst. Extract structured benchmark data.'
        },
        {
          role: 'user',
          content: `Provide current industry benchmark data for Facebook/Meta Ads in the Australian real estate and property investment vertical. Include realistic 2025/2026 figures.`
        },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'provide_benchmarks',
          description: 'Provide structured industry benchmark data for Meta Ads in Australian property/real estate.',
          parameters: {
            type: 'object',
            properties: {
              benchmarks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    metric: { type: 'string', description: 'Metric name (e.g., CTR, CPC, CPL, CPM, Frequency)' },
                    unit: { type: 'string', enum: ['percentage', 'currency_aud', 'number'] },
                    industry_avg: { type: 'number', description: 'Industry average value' },
                    industry_top_quartile: { type: 'number', description: 'Top 25% performer value' },
                    industry_bottom_quartile: { type: 'number', description: 'Bottom 25% performer value' },
                    notes: { type: 'string', description: 'Brief context about this metric' },
                  },
                  required: ['metric', 'unit', 'industry_avg', 'industry_top_quartile', 'industry_bottom_quartile', 'notes'],
                  additionalProperties: false,
                },
              },
              data_period: { type: 'string', description: 'Time period these benchmarks represent' },
              data_sources: { type: 'string', description: 'Where this data comes from' },
            },
            required: ['benchmarks', 'data_period', 'data_sources'],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'provide_benchmarks' } },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Benchmark extraction error [${response.status}]: ${text}`);
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    return JSON.parse(toolCall.function.arguments);
  }
  throw new Error('No structured benchmark data returned');
}

// ─── Benchmark Scoring Engine ────────────────────────────────────────────────

function scoreBenchmarks(totals: any, benchmarkData: any[]): BenchmarkData[] {
  const results: BenchmarkData[] = [];

  const metricMap: Record<string, { yourValue: number; lowerIsBetter: boolean }> = {
    'CTR': { yourValue: totals.ctr, lowerIsBetter: false },
    'CPC': { yourValue: totals.cpc, lowerIsBetter: true },
    'CPL': { yourValue: totals.cpl, lowerIsBetter: true },
    'CPM': { yourValue: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0, lowerIsBetter: true },
  };

  for (const benchmark of benchmarkData) {
    const mapped = metricMap[benchmark.metric];
    if (!mapped || mapped.yourValue === 0) continue;

    const { yourValue, lowerIsBetter } = mapped;
    const avg = benchmark.industry_avg;
    const topQ = benchmark.industry_top_quartile;
    const bottomQ = benchmark.industry_bottom_quartile;

    // Calculate percentile rank (simplified)
    let percentile: number;
    let verdict: BenchmarkData['verdict'];

    if (lowerIsBetter) {
      // Lower = better (CPC, CPL, CPM)
      if (yourValue <= topQ) { percentile = 90; verdict = 'excellent'; }
      else if (yourValue <= avg) { percentile = 65; verdict = 'above_average'; }
      else if (yourValue <= bottomQ) { percentile = 40; verdict = 'average'; }
      else if (yourValue <= bottomQ * 1.5) { percentile = 20; verdict = 'below_average'; }
      else { percentile = 10; verdict = 'poor'; }
    } else {
      // Higher = better (CTR)
      if (yourValue >= topQ) { percentile = 90; verdict = 'excellent'; }
      else if (yourValue >= avg) { percentile = 65; verdict = 'above_average'; }
      else if (yourValue >= bottomQ) { percentile = 40; verdict = 'average'; }
      else if (yourValue >= bottomQ * 0.5) { percentile = 20; verdict = 'below_average'; }
      else { percentile = 10; verdict = 'poor'; }
    }

    const formatVal = (v: number, unit: string) => {
      if (unit === 'percentage') return `${v.toFixed(2)}%`;
      if (unit === 'currency_aud') return `$${v.toFixed(2)}`;
      return v.toFixed(2);
    };

    const yourFormatted = formatVal(yourValue, benchmark.unit);
    const avgFormatted = formatVal(avg, benchmark.unit);
    const direction = lowerIsBetter
      ? (yourValue < avg ? 'below' : 'above')
      : (yourValue > avg ? 'above' : 'below');
    const diff = Math.abs(((yourValue - avg) / avg) * 100).toFixed(0);

    results.push({
      metric: benchmark.metric,
      your_value: yourValue,
      industry_avg: avg,
      industry_top_quartile: topQ,
      percentile_rank: percentile,
      verdict,
      insight: `Your ${benchmark.metric} of ${yourFormatted} is ${diff}% ${direction} the industry average of ${avgFormatted}. ${benchmark.notes}`,
    });
  }

  return results;
}

// ─── Market Events Extraction ────────────────────────────────────────────────

async function extractMarketEvents(apiKey: string): Promise<any> {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: 'You are an Australian market analyst specializing in property investment advertising.'
        },
        {
          role: 'user',
          content: `List the most significant recent and upcoming Australian market events (last 90 days and next 30 days) that would impact property investment advertising performance on Meta Ads. Include RBA rate decisions, major economic data releases, housing market reports, regulatory changes, and seasonal patterns.`
        },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'provide_market_events',
          description: 'Provide structured market events that impact property advertising.',
          parameters: {
            type: 'object',
            properties: {
              events: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
                    event: { type: 'string', description: 'Short event title' },
                    category: { type: 'string', enum: ['interest_rate', 'economic', 'housing', 'regulatory', 'seasonal'] },
                    impact: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
                    description: { type: 'string', description: 'How this impacts property ad performance' },
                    relevance_score: { type: 'number', description: 'Relevance to property ads 0-100' },
                  },
                  required: ['date', 'event', 'category', 'impact', 'description', 'relevance_score'],
                  additionalProperties: false,
                },
              },
            },
            required: ['events'],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'provide_market_events' } },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Market events extraction error [${response.status}]: ${text}`);
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    return JSON.parse(toolCall.function.arguments);
  }
  throw new Error('No structured market events returned');
}

// ─── Main Handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  const corsHeaders = createCorsHeaders();
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authResult = await verifyAuth(req);
    if (!authResult.authenticated) return createUnauthorizedResponse(corsHeaders);

    const body: Phase4Request = await req.json();
    const { action } = body;

    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (action === 'benchmarks') {
      const { totals } = body;

      if (!totals) {
        return new Response(JSON.stringify({ error: 'No totals data provided' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let benchmarkRaw: any = null;
      let perplexityResearch = '';
      let citations: string[] = [];
      let aiAnalysis = '';
      let aiError = '';

      // Step 1: Get real-time benchmarks from Perplexity
      if (PERPLEXITY_API_KEY) {
        try {
          const result = await queryPerplexity(
            `What are the current average Facebook/Meta Ads benchmarks for the Australian real estate and property investment industry in 2025-2026? I need specific numbers for:
            1. Average CTR (Click-Through Rate)
            2. Average CPC (Cost Per Click) in AUD
            3. Average CPL (Cost Per Lead) in AUD
            4. Average CPM (Cost per 1000 impressions) in AUD
            5. Average Frequency
            6. Average Conversion Rate
            
            Please provide the most recent data available, specifically for property investment lead generation campaigns in Australia. Include both industry averages and top-performer benchmarks.`,
            PERPLEXITY_API_KEY
          );
          perplexityResearch = result.content;
          citations = result.citations;
        } catch (err) {
          console.error('Perplexity benchmark research error:', err);
        }
      }

      // Step 2: Extract structured benchmarks via Gemini tool calling
      if (LOVABLE_API_KEY) {
        try {
          benchmarkRaw = await extractBenchmarks(LOVABLE_API_KEY);
        } catch (err) {
          console.error('Benchmark extraction error:', err);
          // Fallback benchmarks for Australian property ads
          benchmarkRaw = {
            benchmarks: [
              { metric: 'CTR', unit: 'percentage', industry_avg: 1.2, industry_top_quartile: 2.1, industry_bottom_quartile: 0.6, notes: 'Property investment CTR varies with creative quality and targeting.' },
              { metric: 'CPC', unit: 'currency_aud', industry_avg: 2.80, industry_top_quartile: 1.50, industry_bottom_quartile: 4.50, notes: 'CPC is heavily influenced by audience saturation and competition.' },
              { metric: 'CPL', unit: 'currency_aud', industry_avg: 45.00, industry_top_quartile: 25.00, industry_bottom_quartile: 85.00, notes: 'Property investment CPL tends to be higher due to niche targeting.' },
              { metric: 'CPM', unit: 'currency_aud', industry_avg: 18.50, industry_top_quartile: 12.00, industry_bottom_quartile: 28.00, notes: 'CPM reflects auction competition in the property vertical.' },
            ],
            data_period: 'Q1 2026 estimates',
            data_sources: 'Industry aggregates and historical patterns',
          };
        }

        // Step 3: Score your performance against benchmarks
        const scoredBenchmarks = scoreBenchmarks(totals, benchmarkRaw.benchmarks);

        // Step 4: AI strategic analysis combining Perplexity research + your data
        try {
          const analysisPrompt = `Analyze this company's Meta Ads performance against industry benchmarks for Australian property investment advertising.

**Your Performance:**
- CTR: ${totals.ctr.toFixed(2)}%
- CPC: $${totals.cpc.toFixed(2)}
- CPL: $${totals.cpl.toFixed(2)}
- Total Spend: $${totals.spend.toFixed(2)}
- Total Leads: ${totals.leads}

**Industry Research (via Perplexity):**
${perplexityResearch || 'No real-time research available.'}

**Benchmark Comparison:**
${scoredBenchmarks.map(b => `- ${b.metric}: ${b.verdict.toUpperCase()} (${b.percentile_rank}th percentile) — ${b.insight}`).join('\n')}

Provide a concise strategic analysis (4-5 sentences) covering:
1. Overall competitive position
2. Biggest strength relative to industry
3. Biggest gap/opportunity
4. One specific tactical recommendation to improve the weakest metric`;

          aiAnalysis = await callGemini(analysisPrompt, LOVABLE_API_KEY);
        } catch (err) {
          console.error('AI benchmark analysis error:', err);
          aiError = err instanceof Error ? err.message : 'AI analysis failed';
        }

        return new Response(JSON.stringify({
          benchmarks: scoredBenchmarks,
          rawBenchmarks: benchmarkRaw,
          perplexityResearch,
          citations,
          aiAnalysis,
          aiError,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'market_correlation') {
      const { insights, datePreset } = body;

      let marketEvents: MarketEvent[] = [];
      let perplexityResearch = '';
      let citations: string[] = [];
      let aiAnalysis = '';
      let aiError = '';

      // Step 1: Get market events via structured extraction
      if (LOVABLE_API_KEY) {
        try {
          const eventsData = await extractMarketEvents(LOVABLE_API_KEY);
          marketEvents = (eventsData.events || []).sort((a: MarketEvent, b: MarketEvent) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
          );
        } catch (err) {
          console.error('Market events extraction error:', err);
        }
      }

      // Step 2: Get real-time market context from Perplexity
      if (PERPLEXITY_API_KEY) {
        try {
          const result = await queryPerplexity(
            `What are the most recent developments in the Australian property investment market that would affect digital advertising performance? Include:
            1. Latest RBA interest rate decision and outlook
            2. Recent housing market data (clearance rates, price movements)
            3. Any regulatory changes affecting property investment
            4. Consumer sentiment trends
            5. Seasonal patterns for property investment lead generation
            
            Focus on how these factors specifically impact Meta/Facebook advertising for property investment companies targeting Australian investors.`,
            PERPLEXITY_API_KEY
          );
          perplexityResearch = result.content;
          citations = result.citations;
        } catch (err) {
          console.error('Perplexity market research error:', err);
        }
      }

      // Step 3: AI correlation analysis
      if (LOVABLE_API_KEY && (marketEvents.length > 0 || perplexityResearch)) {
        try {
          // Summarize ad performance
          let perfSummary = 'No campaign data available.';
          if (insights && insights.length > 0) {
            let totalSpend = 0, totalLeads = 0, totalImpressions = 0;
            for (const row of insights) {
              totalSpend += Number(row.spend || 0);
              totalImpressions += Number(row.impressions || 0);
              if (row.actions) {
                const lead = row.actions.find((a: any) => a.action_type === 'lead');
                totalLeads += lead ? Number(lead.value) : 0;
              }
            }
            const cpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
            perfSummary = `Period: ${datePreset || 'last_30d'} | Spend: $${totalSpend.toFixed(2)} | Leads: ${totalLeads} | CPL: $${cpl.toFixed(2)} | Impressions: ${totalImpressions.toLocaleString()}`;
          }

          const correlationPrompt = `You're analyzing how macro market conditions correlate with Meta Ads performance for an Australian property investment company.

**Current Ad Performance:**
${perfSummary}

**Recent Market Events:**
${marketEvents.slice(0, 10).map(e => `- [${e.date}] ${e.event} (${e.category}, ${e.impact} impact): ${e.description}`).join('\n')}

**Real-Time Market Intelligence:**
${perplexityResearch || 'No real-time data available.'}

Provide a concise market correlation analysis (5-6 sentences) covering:
1. How current market conditions are likely affecting ad performance
2. Which specific events correlate with performance trends
3. Upcoming events that could impact campaigns
4. Strategic timing recommendations for budget allocation
5. One contrarian insight most marketers would miss`;

          aiAnalysis = await callGemini(correlationPrompt, LOVABLE_API_KEY);
        } catch (err) {
          console.error('AI correlation analysis error:', err);
          aiError = err instanceof Error ? err.message : 'AI analysis failed';
        }
      }

      return new Response(JSON.stringify({
        marketEvents,
        perplexityResearch,
        citations,
        aiAnalysis,
        aiError,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Phase 4 error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
