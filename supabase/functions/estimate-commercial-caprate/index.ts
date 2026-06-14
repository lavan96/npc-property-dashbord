// Commercial / Industrial Cap Rate AI Estimator
// Returns a defensible cap-rate range (low / mid / high) and target cap rate
// for the supplied property snapshot, grounded in 2025 AU market evidence.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth, createUnauthorizedResponse, createCorsHeaders } from "../_shared/auth.ts";

interface Snapshot {
  propertyId?: string;
  address?: string;
  state?: string | null;
  assetCategory?: string;
  assetSubtype?: string | null;
  gstTreatment?: string | null;
  purchasePrice?: number | null;
  valuation?: number | null;
  gfaSqm?: number | null;
  nlaSqm?: number | null;
  glaSqm?: number | null;
  siteAreaSqm?: number | null;
  hardstandSqm?: number | null;
  officePct?: number | null;
  parkingBays?: number | null;
  clearanceMetres?: number | null;
  yearBuilt?: number | null;
  zoning?: string | null;
  walesYears?: number | null;
  passingNoi?: number | null;
  marketNoi?: number | null;
  current?: Record<string, number | string | null | undefined>;
}

const SYSTEM_PROMPT = `You are an Australian commercial / industrial property valuer specialising in capitalisation rate benchmarking for lender-grade feasibilities.

Given a specific property snapshot, return a defensible 2025 capitalisation-rate range in AUD market terms. Ground your estimate in:
- Current AU yield evidence by asset sub-type and state/metro
- Lease covenant / WALE strength implied by the snapshot
- Building grade, age and location signals (year built, zoning, area, office %, clearance, hardstand)
- Liquidity / risk premium for the sub-market

Hard rules:
- capRateLowPct, capRateMidPct, capRateHighPct and targetCapRatePct are percentages (e.g. 6.25 means 6.25%).
- The range must be plausible (low < mid < high) and within 3.5% – 12% for AU commercial/industrial assets.
- targetCapRatePct must sit inside [low, high] and reflect the most likely transactional cap for this asset today.
- If passingNoi / marketNoi are present, the implied value at targetCapRatePct should be sense-checked against any purchasePrice / valuation; mention any material gap in reasoning.
- Never invent comparable transactions or tenant covenants not present in the snapshot.
- If the snapshot lacks critical data, still return a best-evidence estimate and flag confidence as 'low'.`;

Deno.serve(async (req) => {
  const corsHeaders = createCorsHeaders(req.headers.get('origin') || '');
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body: { snapshot?: Snapshot; session_token?: string } = await req.json();
    const { error: authError } = await verifyAuth(supabase, req.headers, body);
    if (authError) return createUnauthorizedResponse(authError, corsHeaders);

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: 'LOVABLE_API_KEY not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const snap = body.snapshot ?? {};
    const userContext = `Estimate the capitalisation rate range for this specific property:\n\n${JSON.stringify(snap, null, 2)}\n\nReturn a single JSON object via the tool call. Be precise to this property's location, asset sub-type, covenant and grade. Do not return generic averages.`;

    const tools = [{
      type: 'function',
      function: {
        name: 'return_cap_rate_estimate',
        description: 'Return a precise capitalisation rate range for the given commercial / industrial property.',
        parameters: {
          type: 'object',
          properties: {
            capRateLowPct: { type: 'number', description: 'Low end of the market cap-rate range (%).' },
            capRateMidPct: { type: 'number', description: 'Mid of the market cap-rate range (%).' },
            capRateHighPct: { type: 'number', description: 'High end of the market cap-rate range (%).' },
            targetCapRatePct: { type: 'number', description: 'Single recommended target cap rate (%).' },
            impliedValueAtTarget: { type: 'number', description: 'Implied AUD value at targetCapRatePct using marketNoi if provided.' },
            evidenceBasis: { type: 'string', description: 'Short label of evidence type used (e.g. "Metro industrial 2025 yield band").' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            reasoning: { type: 'string', description: '2-4 sentences explaining yield assumptions, covenant, grade, liquidity.' },
          },
          required: ['capRateLowPct', 'capRateMidPct', 'capRateHighPct', 'targetCapRatePct', 'confidence', 'reasoning'],
        },
      },
    }];

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContext },
        ],
        tools,
        tool_choice: { type: 'function', function: { name: 'return_cap_rate_estimate' } },
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error('[estimate-commercial-caprate] AI error', aiResp.status, txt);
      const status = aiResp.status === 429 ? 429 : aiResp.status === 402 ? 402 : 502;
      const msg = aiResp.status === 429
        ? 'AI rate limit hit, please retry shortly.'
        : aiResp.status === 402
          ? 'Lovable AI credits exhausted. Add credits in Workspace → Usage.'
          : `AI gateway error: ${txt.slice(0, 300)}`;
      return new Response(JSON.stringify({ success: false, error: msg }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ success: false, error: 'AI returned no estimate' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let estimate: any;
    try {
      estimate = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error('[estimate-commercial-caprate] parse fail', e);
      return new Response(JSON.stringify({ success: false, error: 'Failed to parse AI estimate' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, estimate }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[estimate-commercial-caprate] fatal', err);
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
