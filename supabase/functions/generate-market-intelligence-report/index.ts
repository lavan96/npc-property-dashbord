import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReportRequest {
  session_token?: string;
  report_type?: string;
  audience_segment?: string;
}

interface PerplexityResult {
  content: string;
  citations: string[];
}

// Report type configurations — which layers each type needs
const REPORT_TYPE_LAYERS: Record<string, string[]> = {
  full: ['layer1', 'layer2', 'layer3', 'layer4', 'layer5', 'layer6', 'layer7', 'layer8', 'events', 'executive', 'cta'],
  market_pulse: ['layer1', 'layer3', 'layer6', 'events', 'executive', 'cta'],
  hotspot_deep_dive: ['layer1', 'layer2', 'layer7', 'layer8', 'executive', 'cta'],
  strategy_insight: ['layer5', 'layer7', 'layer8', 'executive', 'cta'],
  finance_update: ['layer1', 'layer4', 'layer6', 'events', 'executive', 'cta'],
  deal_breakdown: ['layer2', 'layer7', 'layer8', 'executive', 'cta'],
  myth_busting: ['layer1', 'layer2', 'layer3', 'layer6', 'executive', 'cta'],
  development_spotlight: ['layer2', 'layer7', 'layer8', 'executive', 'cta'],
};

const AUDIENCE_SYSTEM_PROMPTS: Record<string, string> = {
  general: 'You are writing for a mixed audience of property investors and owner-occupiers. Provide balanced insights relevant to both groups.',
  investor: 'You are writing specifically for property investors. Focus on yield, capital growth, equity strategies, tax advantages, cash flow analysis, and portfolio positioning. Frame everything through an investment return lens.',
  owner_occupier: 'You are writing specifically for owner-occupiers and first home buyers. Focus on lifestyle factors, entry costs, suburb livability, future growth for personal wealth, and practical buying guidance. Avoid heavy investment jargon.',
};

const REPORT_TYPE_LABELS: Record<string, string> = {
  full: 'Full Market Intelligence Report',
  market_pulse: 'Market Pulse Update',
  hotspot_deep_dive: 'Hotspot Deep Dive',
  strategy_insight: 'Strategy Insight',
  finance_update: 'Finance & Lending Update',
  deal_breakdown: 'Deal Breakdown',
  myth_busting: 'Market Myths & Truths',
  development_spotlight: 'Development Spotlight',
};

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
      search_domain_filter: ['rba.gov.au', 'abs.gov.au', 'corelogic.com.au', 'domain.com.au', 'realestate.com.au', 'apra.gov.au', 'treasury.gov.au', 'sqmresearch.com.au'],
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

// ─── NEW: Layer 7 — Micro/Suburb Intelligence ───────────────────────────────

async function fetchLayer7_Micro(perplexityKey: string, audiencePrompt: string): Promise<PerplexityResult> {
  return queryPerplexity(
    `Identify the TOP 5 highest-performing suburbs or corridors in Australia right now for property investment. For EACH suburb provide:

1. **Suburb Name & State** — exact location and postcode
2. **Median House Price** — current median and 12-month change (%)
3. **Rental Yield** — current gross rental yield for houses and units
4. **Days on Market** — average DOM and whether it's tightening or loosening
5. **Vacancy Rate** — current rate from SQM Research or similar
6. **Growth Drivers** — infrastructure projects, transport links, employment hubs, amenities driving demand
7. **Supply-Demand Balance** — new listings vs buyer demand, development pipeline
8. **Comparable Sales** — 2-3 recent sale examples with prices
9. **Rental Performance** — median weekly rent and 12-month rental growth
10. **Entry Strategy** — recommended approach for entering this market

Also identify 3 emerging corridors showing early-stage growth signals (price momentum beginning, infrastructure announced, rezoning underway).

${audiencePrompt}

Use data from CoreLogic, Domain, SQM Research, and government infrastructure databases. Prioritise suburbs showing BOTH capital growth AND rental yield strength.`,
    perplexityKey,
    'You are a senior Australian property market analyst specialising in suburb-level intelligence. Provide granular, data-backed suburb analysis that helps investors identify specific opportunities. Always cite sources and use specific numbers.'
  );
}

// ─── NEW: Layer 8 — Competitive Edge (NPC Differentiation) ──────────────────

async function generateLayer8_CompetitiveEdge(
  lovableKey: string,
  layer2Content: string,
  layer7Content: string,
  audiencePrompt: string
): Promise<string> {
  return callGemini(
    `You are writing the "Competitive Strategic Edge" section of a premium NPC Services Market Intelligence Report. This section differentiates NPC from every other property advisory by revealing insights that typical buyers and competitors overlook.

## Context Data:
### Housing Market Overview:
${layer2Content.slice(0, 2000)}

### Suburb-Level Intelligence:
${layer7Content.slice(0, 3000)}

## Required Analysis (produce ALL sections):

### 1. Off-Market & Pre-Market Intelligence
Identify 2-3 opportunities that are likely available off-market or pre-market in the suburbs analysed. Explain what signals suggest off-market activity and how a strategic buyer would access these.

### 2. Development & Subdivision Potential
For the top suburbs identified, analyse:
- Which properties/sites have subdivision potential (lot sizes, zoning, frontage)
- Estimated uplift from a subdivide-and-hold or subdivide-and-sell strategy
- Planning approval likelihood and timeframes

### 3. Zoning & Overlay Opportunities
Identify zoning advantages in the target areas:
- Recent or upcoming rezoning that creates value
- Mixed-use or higher-density overlays that the general market hasn't priced in
- Heritage overlays that protect character (and values)

### 4. Strategic Structuring Recommendations
For each key opportunity, recommend the optimal approach:
- **Cash Flow Play** — best for income-focused investors
- **Growth Play** — best for equity/capital appreciation
- **Equity Play** — best for leveraging existing portfolio
- Risk mitigation strategies competitors don't highlight

### 5. Hidden Opportunities
3 non-obvious insights that most property buyers — and even competitors — would miss. These should be genuinely strategic, not surface-level observations.

### 6. How NPC Would Approach This
For the #1 opportunity identified, provide a detailed strategic playbook:
- Entry timing and approach
- Negotiation leverage points
- Structuring recommendations
- 12-month strategic outlook for this specific opportunity

${audiencePrompt}

Tone: Confident, strategic, authoritative. This is where NPC proves its value above the noise.`,
    lovableKey,
    8000
  );
}

// ─── NEW: CTA Generation ────────────────────────────────────────────────────

async function generateCTA(lovableKey: string, reportType: string, audienceSegment: string): Promise<string> {
  const ctaPrompts: Record<string, string> = {
    full: 'a comprehensive market intelligence review',
    market_pulse: 'discussing the current market conditions and their implications',
    hotspot_deep_dive: 'exploring the highlighted suburb opportunities in detail',
    strategy_insight: 'a tailored strategy discussion based on these insights',
    finance_update: 'reviewing your borrowing capacity in the current lending environment',
    deal_breakdown: 'analysing specific opportunities that match your investment criteria',
    myth_busting: 'separating fact from fiction for your property strategy',
    development_spotlight: 'exploring development and subdivision opportunities',
  };

  const audienceCtaFraming: Record<string, string> = {
    general: 'Appeal to both investors and homebuyers.',
    investor: 'Focus on ROI, portfolio growth, and tax efficiency.',
    owner_occupier: 'Focus on lifestyle, long-term wealth, and market timing.',
  };

  return callGemini(
    `Generate a compelling, professional Call to Action section for an NPC Services Market Intelligence Report.

Report Type: ${REPORT_TYPE_LABELS[reportType] || reportType}
Target Audience: ${audienceSegment}

The CTA should encourage the reader to take the next step toward ${ctaPrompts[reportType] || 'a strategy discussion'}.

${audienceCtaFraming[audienceSegment] || ''}

## Required Output:

### What Should You Do Next?
A 2-3 sentence compelling paragraph that creates urgency without being pushy.

### Your Next Steps:
3 clear, specific actions the reader can take:
1. **Book a Strategy Session** — with a specific benefit statement
2. **Request Detailed Analysis** — for a suburb or opportunity mentioned
3. **Connect With Our Team** — phone/email with a personal touch

### Why NPC Services?
A single powerful sentence that reinforces NPC's strategic advantage.

Keep it professional, warm, and action-oriented. No generic "contact us" language.`,
    lovableKey,
    1500
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
    const reportType = body.report_type || 'full';
    const audienceSegment = body.audience_segment || 'general';

    // Allow internal service calls (from dispatch function) without auth
    const authHeader = req.headers.get('Authorization') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const isServiceCall = authHeader.replace('Bearer ', '').trim() === serviceKey.trim();

    let userId = 'system';
    if (!isServiceCall) {
      const { error: authError, userId: authUserId } = await verifyAuth(supabase, req.headers, body);
      if (authError || !authUserId) {
        return createUnauthorizedResponse(corsHeaders);
      }
      userId = authUserId;
    }

    console.log(`[market-intel-report] Starting generation: type=${reportType}, audience=${audienceSegment}, user=${userId}`);

    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!PERPLEXITY_API_KEY || !LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'Required API keys not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requiredLayers = REPORT_TYPE_LAYERS[reportType] || REPORT_TYPE_LAYERS.full;
    const audiencePrompt = AUDIENCE_SYSTEM_PROMPTS[audienceSegment] || AUDIENCE_SYSTEM_PROMPTS.general;

    // Create report record
    const now = new Date();
    const reportPeriod = now.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

    const { data: reportRow, error: insertError } = await supabase
      .from('marketing_intelligence_reports')
      .insert({
        generated_by: userId,
        status: 'generating',
        report_period: reportPeriod,
        report_type: reportType,
        audience_segment: audienceSegment,
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
    console.log(`[market-intel-report] Report ID: ${reportId}, layers: ${requiredLayers.join(', ')}`);

    try {
      // ── Fetch required layers in parallel ───────────────────────────
      console.log('[market-intel-report] Fetching data layers...');

      const fetchPromises: Record<string, Promise<any>> = {};

      if (requiredLayers.includes('layer1')) {
        fetchPromises.layer1 = fetchLayer1_RBA(PERPLEXITY_API_KEY).catch(e => {
          console.error('Layer 1 (RBA) error:', e); return { content: '', citations: [] };
        });
      }
      if (requiredLayers.includes('layer2')) {
        fetchPromises.layer2 = fetchLayer2_Housing(PERPLEXITY_API_KEY).catch(e => {
          console.error('Layer 2 (Housing) error:', e); return { content: '', citations: [] };
        });
      }
      if (requiredLayers.includes('layer3')) {
        fetchPromises.layer3 = fetchLayer3_Sentiment(PERPLEXITY_API_KEY).catch(e => {
          console.error('Layer 3 (Sentiment) error:', e); return { content: '', citations: [] };
        });
      }
      if (requiredLayers.includes('layer6')) {
        fetchPromises.layer6 = fetchLayer6_Economic(PERPLEXITY_API_KEY).catch(e => {
          console.error('Layer 6 (Economic) error:', e); return { content: '', citations: [] };
        });
      }
      if (requiredLayers.includes('layer7')) {
        fetchPromises.layer7 = fetchLayer7_Micro(PERPLEXITY_API_KEY, audiencePrompt).catch(e => {
          console.error('Layer 7 (Micro) error:', e); return { content: '', citations: [] };
        });
      }
      if (requiredLayers.includes('events')) {
        fetchPromises.events = extractMarketEvents(LOVABLE_API_KEY).catch(e => {
          console.error('Market events error:', e); return [];
        });
      }

      const results = await Promise.all(
        Object.entries(fetchPromises).map(async ([key, promise]) => [key, await promise])
      );
      const layerResults: Record<string, any> = Object.fromEntries(results);

      const layer1Result: PerplexityResult = layerResults.layer1 || { content: '', citations: [] };
      const layer2Result: PerplexityResult = layerResults.layer2 || { content: '', citations: [] };
      const layer3Result: PerplexityResult = layerResults.layer3 || { content: '', citations: [] };
      const layer6Result: PerplexityResult = layerResults.layer6 || { content: '', citations: [] };
      const layer7Result: PerplexityResult = layerResults.layer7 || { content: '', citations: [] };
      const marketEvents: any[] = layerResults.events || [];

      // ── Layer 4: Regulatory (Gemini — uses Perplexity context) ──────
      let layer4Regulatory = '';
      if (requiredLayers.includes('layer4')) {
        console.log('[market-intel-report] Generating regulatory analysis...');
        try {
          layer4Regulatory = await callGemini(
            `Based on the following market intelligence, provide a comprehensive Australian property regulatory and policy watch:

## Context:
${layer1Result.content.slice(0, 2000)}
${layer2Result.content.slice(0, 2000)}

## Required Analysis:
1. **APRA Lending Policy** — any recent or upcoming changes to macroprudential controls, serviceability buffers, lending standards
2. **State Stamp Duty Updates** — recent changes by state (NSW, VIC, QLD, WA, SA, ACT) including any concessions, surcharges for investors, or land tax changes
3. **First Home Buyer Schemes** — changes that affect investor competition
4. **Foreign Investment Rules** — any FIRB changes, additional state surcharges
5. **Tax Policy** — any changes to negative gearing, CGT discount, depreciation rules under discussion
6. **Building & Planning** — changes to building codes, planning regulations, inclusionary zoning

For each item, specify: What changed, When, Which states affected, Impact rating (High/Medium/Low).`,
            LOVABLE_API_KEY
          );
        } catch (e) {
          console.error('Layer 4 (Regulatory) error:', e);
        }
      }

      // ── Layer 8: Competitive Edge (NPC Differentiation) ─────────────
      let layer8CompetitiveEdge = '';
      if (requiredLayers.includes('layer8')) {
        console.log('[market-intel-report] Generating competitive edge analysis...');
        try {
          layer8CompetitiveEdge = await generateLayer8_CompetitiveEdge(
            LOVABLE_API_KEY,
            layer2Result.content,
            layer7Result.content,
            audiencePrompt
          );
        } catch (e) {
          console.error('Layer 8 (Competitive Edge) error:', e);
        }
      }

      // ── Layer 5: Strategic Outlook (AI synthesis of all layers) ──────
      let layer5Outlook = '';
      if (requiredLayers.includes('layer5')) {
        console.log('[market-intel-report] Generating strategic outlook...');
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

## Layer 7 — Suburb Intelligence:
${layer7Result.content.slice(0, 1500)}

## Upcoming Events:
${marketEvents.filter((e: any) => new Date(e.date) > new Date()).slice(0, 10).map((e: any) => `- [${e.date}] ${e.event} (${e.impact})`).join('\n')}

${audiencePrompt}

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
      }

      // ── CTA Generation ──────────────────────────────────────────────
      let ctaContent = '';
      if (requiredLayers.includes('cta')) {
        console.log('[market-intel-report] Generating CTA...');
        try {
          ctaContent = await generateCTA(LOVABLE_API_KEY, reportType, audienceSegment);
        } catch (e) {
          console.error('CTA generation error:', e);
        }
      }

      // ── Executive Summary ───────────────────────────────────────────
      let executiveSummary = '';
      if (requiredLayers.includes('executive')) {
        console.log('[market-intel-report] Generating executive summary...');
        try {
          const reportLabel = REPORT_TYPE_LABELS[reportType] || 'Market Intelligence Report';
          executiveSummary = await callGemini(
            `Write a 1-page executive summary for a premium "${reportLabel}" dated ${reportPeriod}.

Key data points to synthesize:
- RBA: ${layer1Result.content.slice(0, 500)}
- Housing: ${layer2Result.content.slice(0, 500)}
- Sentiment: ${layer3Result.content.slice(0, 500)}
- Economic: ${layer6Result.content.slice(0, 500)}
- Suburb Intelligence: ${layer7Result.content.slice(0, 500)}
- Competitive Edge: ${layer8CompetitiveEdge.slice(0, 500)}

${audiencePrompt}

Write 5-6 dense paragraphs covering:
1. The headline market story right now
2. Interest rate environment and outlook
3. Housing market performance snapshot
4. Key risks and opportunities
5. Top suburb opportunities identified
6. The bottom line — what the reader should do NOW

Tone: Authoritative, data-backed, actionable. Use bold for key figures.`,
            LOVABLE_API_KEY,
            3000
          );
        } catch (e) {
          console.error('Executive summary error:', e);
        }
      }

      // ── Aggregate all citations ─────────────────────────────────────
      const allCitations = [
        ...layer1Result.citations,
        ...layer2Result.citations,
        ...layer3Result.citations,
        ...layer6Result.citations,
        ...layer7Result.citations,
      ].filter((c, i, arr) => arr.indexOf(c) === i);

      // ── Build report data ───────────────────────────────────────────
      const reportData = {
        generatedAt: now.toISOString(),
        reportPeriod,
        reportType,
        reportTypeLabel: REPORT_TYPE_LABELS[reportType] || reportType,
        audienceSegment,
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
        layer7_micro: {
          content: layer7Result.content,
          citations: layer7Result.citations,
        },
        layer8_competitive_edge: {
          content: layer8CompetitiveEdge,
        },
        ctaContent,
        marketEvents: marketEvents.sort((a: any, b: any) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
        ),
        allCitations,
        includedLayers: requiredLayers,
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
