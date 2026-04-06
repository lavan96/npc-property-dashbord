import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReportRequest {
  session_token?: string;
}

interface PerplexityResult {
  content: string;
  citations: string[];
}

// ─── Perplexity Query ────────────────────────────────────────────────────────

async function queryPerplexity(
  prompt: string,
  apiKey: string,
  systemPrompt?: string
): Promise<PerplexityResult> {
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
          content: systemPrompt || 'You are a senior Australian property market analyst providing data-backed intelligence for property investment professionals. Always cite sources and use specific numbers.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      search_recency_filter: 'week',
      search_domain_filter: ['rba.gov.au', 'abs.gov.au', 'corelogic.com.au', 'domain.com.au', 'realestate.com.au', 'apra.gov.au', 'treasury.gov.au'],
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

// ─── Gemini AI ───────────────────────────────────────────────────────────────

async function callGemini(prompt: string, apiKey: string, maxTokens = 6000): Promise<string> {
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
          content: 'You are a senior Australian property market analyst writing premium client reports. Produce clear, professional, data-driven analysis with specific numbers. Use markdown formatting with headers, bold, bullet points, and tables.'
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI Gateway error [${response.status}]: ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ─── Structured Event Extraction ─────────────────────────────────────────────

async function extractMarketEvents(apiKey: string): Promise<any[]> {
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
          content: 'You are an Australian market analyst specializing in property investment.'
        },
        {
          role: 'user',
          content: `List the most significant recent and upcoming Australian market events (last 90 days and next 60 days) that would impact property investment decisions. Include RBA rate decisions, major economic data releases, housing market reports, APRA regulatory changes, state government policy changes, and seasonal patterns. Provide at least 15 events.`
        },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'provide_market_events',
          description: 'Provide structured market events.',
          parameters: {
            type: 'object',
            properties: {
              events: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    date: { type: 'string', description: 'YYYY-MM-DD' },
                    event: { type: 'string' },
                    category: { type: 'string', enum: ['interest_rate', 'economic', 'housing', 'regulatory', 'seasonal'] },
                    impact: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
                    description: { type: 'string', description: 'How this impacts property investors' },
                    relevance_score: { type: 'number', description: '0-100' },
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

  if (!response.ok) throw new Error(`Market events error [${response.status}]`);
  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    const parsed = JSON.parse(toolCall.function.arguments);
    return parsed.events || [];
  }
  return [];
}

// ─── Data Layer Fetchers ─────────────────────────────────────────────────────

async function fetchLayer1_RBA(perplexityKey: string): Promise<PerplexityResult> {
  return queryPerplexity(
    `Provide a comprehensive analysis of Australia's current interest rate environment:

1. **Current RBA Cash Rate** — exact rate and date of last decision
2. **Rate Decision History** — last 6 RBA decisions with dates and changes
3. **Forward Rate Expectations** — what ASX rate futures/market pricing suggests for the next 6 months
4. **Impact on Borrowing Capacity** — how the current rate affects typical borrower serviceability
5. **Impact on Investor Sentiment** — current investor activity levels relative to rate environment
6. **Comparison to Long-Term Average** — how current rates compare to 10yr and 20yr averages

Use specific numbers, dates, and percentages. Cite all data sources.`,
    perplexityKey
  );
}

async function fetchLayer2_Housing(perplexityKey: string): Promise<PerplexityResult> {
  return queryPerplexity(
    `Provide a comprehensive snapshot of Australia's current housing market:

1. **Auction Clearance Rates** — national and by capital city (Sydney, Melbourne, Brisbane, Perth, Adelaide) for the most recent weekend
2. **Median House Price Changes** — quarterly and annual change by capital city
3. **Days on Market** — average DOM by capital city, trend direction
4. **Rental Yields** — gross rental yields by capital city for houses and units
5. **Listing Volumes** — new listings vs. historical averages, supply pressure
6. **Regional vs. Metro Trends** — any divergence in performance

Use specific numbers in AUD. Include data from CoreLogic, Domain, REA Group, or SQM Research where available.`,
    perplexityKey
  );
}

async function fetchLayer3_Sentiment(perplexityKey: string): Promise<PerplexityResult> {
  return queryPerplexity(
    `Provide current Australian consumer and investor sentiment indicators:

1. **Westpac-Melbourne Institute Consumer Sentiment Index** — latest reading, monthly and annual change, sub-indices for 'time to buy a dwelling'
2. **ANZ-Roy Morgan Consumer Confidence** — latest reading and trend
3. **NAB Business Confidence** — latest property sector reading
4. **Property Investment Intent** — investor loan approvals trend (ABS data)
5. **First Home Buyer Activity** — FHB loan approvals vs historical average
6. **Rental Market Stress** — vacancy rates by capital city from SQM Research

Cite all specific readings with their publication dates.`,
    perplexityKey
  );
}

async function fetchLayer6_Economic(perplexityKey: string): Promise<PerplexityResult> {
  return queryPerplexity(
    `Provide the latest Australian economic indicators relevant to property investors:

1. **CPI / Inflation** — latest quarterly and annual reading, trimmed mean, RBA target comparison
2. **Unemployment Rate** — latest reading, monthly change, underemployment
3. **GDP Growth** — latest quarterly and annual reading
4. **Wage Growth (WPI)** — latest reading, real wage growth calculation
5. **Population Growth & Migration** — latest ABS NOM data, impact on housing demand
6. **AUD Exchange Rate** — current AUD/USD, impact on foreign investment appetite
7. **Building Approvals** — latest trend, supply pipeline implications

Use the most recent ABS, RBA, and Treasury data. Cite publication dates.`,
    perplexityKey
  );
}

// ─── Main Handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  const corsHeaders = createCorsHeaders();
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body: ReportRequest = await req.json();
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError || !userId) {
      return createUnauthorizedResponse(corsHeaders);
    }

    console.log(`[market-intel-report] Starting generation for user ${userId}`);

    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!PERPLEXITY_API_KEY || !LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'Required API keys not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create report record
    const now = new Date();
    const reportPeriod = now.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

    const { data: reportRow, error: insertError } = await supabase
      .from('marketing_intelligence_reports')
      .insert({
        generated_by: userId,
        status: 'generating',
        report_period: reportPeriod,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to create report record' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const reportId = reportRow.id;
    console.log(`[market-intel-report] Report ID: ${reportId}`);

    try {
      // ── Fetch all 6 layers in parallel ──────────────────────────────
      console.log('[market-intel-report] Fetching all data layers...');

      const [
        layer1Result,
        layer2Result,
        layer3Result,
        layer6Result,
        marketEvents,
      ] = await Promise.all([
        fetchLayer1_RBA(PERPLEXITY_API_KEY).catch(e => {
          console.error('Layer 1 (RBA) error:', e); return { content: '', citations: [] };
        }),
        fetchLayer2_Housing(PERPLEXITY_API_KEY).catch(e => {
          console.error('Layer 2 (Housing) error:', e); return { content: '', citations: [] };
        }),
        fetchLayer3_Sentiment(PERPLEXITY_API_KEY).catch(e => {
          console.error('Layer 3 (Sentiment) error:', e); return { content: '', citations: [] };
        }),
        fetchLayer6_Economic(PERPLEXITY_API_KEY).catch(e => {
          console.error('Layer 6 (Economic) error:', e); return { content: '', citations: [] };
        }),
        extractMarketEvents(LOVABLE_API_KEY).catch(e => {
          console.error('Market events error:', e); return [];
        }),
      ]);

      // ── Layer 4: Regulatory (Gemini — uses Perplexity context) ──────
      console.log('[market-intel-report] Generating regulatory analysis...');
      let layer4Regulatory = '';
      try {
        layer4Regulatory = await callGemini(
          `Based on the following market intelligence, provide a comprehensive Australian property regulatory and policy watch:

## Context:
${layer1Result.content.slice(0, 2000)}
${layer2Result.content.slice(0, 2000)}

## Required Analysis:
1. **APRA Lending Policy** — any recent or upcoming changes to macroprudential controls, serviceability buffers, lending standards
2. **State Stamp Duty Updates** — recent changes by state (NSW, VIC, QLD, WA, SA, ACT) including any concessions, surcharges for investors, or land tax changes
3. **First Home Buyer Schemes** — changes that affect investor competition (e.g., expanded eligibility, shared equity schemes)
4. **Foreign Investment Rules** — any FIRB changes, additional state surcharges
5. **Tax Policy** — any changes to negative gearing, CGT discount, depreciation rules under discussion
6. **Building & Planning** — changes to building codes, planning regulations, inclusionary zoning

For each item, specify: What changed, When, Which states affected, Impact rating (High/Medium/Low).
Format as a structured report with clear sections.`,
          LOVABLE_API_KEY
        );
      } catch (e) {
        console.error('Layer 4 (Regulatory) error:', e);
      }

      // ── Layer 5: Strategic Outlook (AI synthesis of all layers) ──────
      console.log('[market-intel-report] Generating strategic outlook...');
      let layer5Outlook = '';
      try {
        layer5Outlook = await callGemini(
          `You are writing the "90-Day Strategic Outlook" section of a premium Market Intelligence Report for property investors.

Synthesize ALL of the following data layers into a forward-looking strategic assessment:

## Layer 1 — Interest Rates:
${layer1Result.content.slice(0, 1500)}

## Layer 2 — Housing Market:
${layer2Result.content.slice(0, 1500)}

## Layer 3 — Sentiment:
${layer3Result.content.slice(0, 1500)}

## Layer 4 — Regulatory:
${layer4Regulatory.slice(0, 1500)}

## Layer 6 — Economic:
${layer6Result.content.slice(0, 1500)}

## Upcoming Events:
${marketEvents.filter((e: any) => new Date(e.date) > new Date()).slice(0, 10).map((e: any) => `- [${e.date}] ${e.event} (${e.impact})`).join('\n')}

## Required Output Structure:

### Market Outlook Summary
A 3-4 sentence executive view of the next 90 days.

### Risk/Opportunity Matrix
Create a table with columns: Factor | Risk Level (Low/Med/High) | Opportunity Level (Low/Med/High) | Key Insight
Include at least 6 factors.

### Timing Recommendations
- **Best time to buy**: Specific windows and reasoning
- **States to watch**: Which states offer best value
- **Property types**: Which segments (house/unit/land) are best positioned

### Key Dates to Watch
List the 5 most important upcoming dates/events with expected market impact.

### Contrarian Insights
2-3 non-obvious observations that most investors would miss.`,
          LOVABLE_API_KEY,
          8000
        );
      } catch (e) {
        console.error('Layer 5 (Outlook) error:', e);
      }

      // ── Executive Summary (AI synthesis) ────────────────────────────
      console.log('[market-intel-report] Generating executive summary...');
      let executiveSummary = '';
      try {
        executiveSummary = await callGemini(
          `Write a 1-page executive summary for a premium Market Intelligence Report dated ${reportPeriod}.

Key data points to synthesize:
- RBA: ${layer1Result.content.slice(0, 500)}
- Housing: ${layer2Result.content.slice(0, 500)}
- Sentiment: ${layer3Result.content.slice(0, 500)}
- Economic: ${layer6Result.content.slice(0, 500)}

Write 5-6 dense paragraphs covering:
1. The headline market story right now
2. Interest rate environment and outlook
3. Housing market performance snapshot
4. Key risks and opportunities for investors
5. The bottom line — what investors should do NOW

Tone: Authoritative, data-backed, actionable. Use bold for key figures.`,
          LOVABLE_API_KEY,
          3000
        );
      } catch (e) {
        console.error('Executive summary error:', e);
      }

      // ── Aggregate all citations ─────────────────────────────────────
      const allCitations = [
        ...layer1Result.citations,
        ...layer2Result.citations,
        ...layer3Result.citations,
        ...layer6Result.citations,
      ].filter((c, i, arr) => arr.indexOf(c) === i);

      // ── Build report data ───────────────────────────────────────────
      const reportData = {
        generatedAt: now.toISOString(),
        reportPeriod,
        executiveSummary,
        layer1_rba: {
          content: layer1Result.content,
          citations: layer1Result.citations,
        },
        layer2_housing: {
          content: layer2Result.content,
          citations: layer2Result.citations,
        },
        layer3_sentiment: {
          content: layer3Result.content,
          citations: layer3Result.citations,
        },
        layer4_regulatory: {
          content: layer4Regulatory,
        },
        layer5_outlook: {
          content: layer5Outlook,
        },
        layer6_economic: {
          content: layer6Result.content,
          citations: layer6Result.citations,
        },
        marketEvents: marketEvents.sort((a: any, b: any) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
        ),
        allCitations,
      };

      // ── Update report record ────────────────────────────────────────
      await supabase
        .from('marketing_intelligence_reports')
        .update({
          report_data: reportData,
          status: 'completed',
        })
        .eq('id', reportId);

      console.log(`[market-intel-report] Report ${reportId} completed successfully`);

      return new Response(JSON.stringify({
        success: true,
        reportId,
        reportData,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (genError) {
      console.error('[market-intel-report] Generation error:', genError);
      await supabase
        .from('marketing_intelligence_reports')
        .update({
          status: 'failed',
          error_message: genError instanceof Error ? genError.message : 'Unknown error',
        })
        .eq('id', reportId);

      return new Response(JSON.stringify({
        error: 'Report generation failed',
        reportId,
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('[market-intel-report] Fatal error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal error'
    }), {
      status: 500, headers: { ...createCorsHeaders(), 'Content-Type': 'application/json' },
    });
  }
});
