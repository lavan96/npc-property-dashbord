// Commercial / Industrial BC AI Scenario Agent
// Accepts current scenario snapshot + user prompt + chat history
// Returns 2-3 actionable scenario proposals with field overrides that can be
// cascaded into the calculator state on the client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth, createUnauthorizedResponse, createCorsHeaders } from "../_shared/auth.ts";

import { enforceCsrf, csrfDenied } from "../_shared/csrfGuard.ts";
interface ChatTurn { role: 'user' | 'assistant'; content: string; }

interface Snapshot {
  assetCategory?: string;
  assetSubtype?: string;
  state?: string;
  purpose?: string;
  leaseStatus?: string;
  purchasePrice?: number;
  estimatedValue?: number;
  proposedLoan?: number;
  availableEquity?: number;
  sponsorLiquidity?: number;
  businessEbitda?: number;
  businessDebt?: number;
  marketRent?: number;
  vacancy?: number;
  rate?: number;
  buffer?: number;
  term?: number;
  maxLvr?: number;
  minDscr?: number;
  minIcr?: number;
  profile?: string;
  gstTreatment?: string;
  riskRating?: string;
  borrowingCapacity?: number;
  dscr?: number;
  icr?: number;
  noi?: number;
  client?: { id?: string; name?: string };
  portfolio?: Record<string, unknown>;
}

interface RequestBody {
  prompt: string;
  history?: ChatTurn[];
  snapshot?: Snapshot;
  clientId?: string;
  session_token?: string;
}

const SYSTEM_PROMPT = `You are a senior Australian commercial / industrial property finance strategist.
Given a client's current borrowing-capacity snapshot, propose 2 to 3 distinct, actionable scenarios that could improve their position (e.g. increase borrowing capacity, reduce risk, improve DSCR/ICR/LVR, secure a different lender policy, restructure the deal).

Each proposal MUST be concrete and ready to cascade into a calculator. For each scenario:
- name: short, distinct label (max 60 chars)
- reasoning: 1-2 sentence why
- estimatedImpact: short qualitative summary (e.g. "+$420k capacity, DSCR 1.45x")
- executionRisk: low | medium | high
- evidenceRequired: 2-4 bullets of evidence the broker must gather
- adjustments: object with ONLY the fields the user should change (omit keys that should stay the same). Numbers as numbers, not strings.

Allowed adjustment keys (use exact names):
  purchasePrice, estimatedValue, proposedLoan, availableEquity, sponsorLiquidity,
  businessEbitda, businessDebt, currentRent, proposedRent,
  passingRent, marketRent, vacancy, recoveries, rates, water, landTax, insurance, management, repairs,
  rate, buffer, term, ioPeriod, amortisation, maxLvr, minIcr, minDscr, minDebtYield,
  profile (one of: mainstreamCommercialBank, secondTierLender, nonBankCommercial, smsfCommercial, privateCredit),
  gstTreatment (one of: gstInclusive, plusGst, gstFreeGoingConcern, marginScheme, unknown),
  leaseStatus (one of: fullyLeased, partiallyLeased, vacant, monthToMonth, relatedPartyLease, leasePending),
  guarantees (yes | no | unknown),
  relatedPartyTenant (yes | no),
  scenarioType (one of: Acquire Commercial Asset, Acquire Industrial Asset, Owner-Occupied Business Premises, Related-Party Lease Structure, Sell Existing Asset, Refinance Existing Debt, Equity Release, Debt Restructure, Cash Injection, Interest Rate Stress, Vacancy / Rent Stress, Capex Shock, Multi-Asset Strategy)

Keep responses concise. Do not hallucinate client portfolio details that were not provided in the snapshot.`;

Deno.serve(async (req) => {
  const corsHeaders = createCorsHeaders(req.headers.get('origin') || '');
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // SEC5-CSRF: reject cross-site cookie-authenticated mutations (exact-origin).
  // No-op for GET/HEAD/OPTIONS and any request without the session cookie.
  const __csrf = enforceCsrf(req);
  if (!__csrf.ok) return csrfDenied(corsHeaders, __csrf);

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body: RequestBody = await req.json();
    const { error: authError } = await verifyAuth(supabase, req.headers, body);
    if (authError) return createUnauthorizedResponse(authError, corsHeaders);

    const prompt = (body.prompt || '').trim();
    if (!prompt) {
      return new Response(JSON.stringify({ success: false, error: 'prompt is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: 'LOVABLE_API_KEY not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const userContext = `## Current snapshot
${JSON.stringify(body.snapshot ?? {}, null, 2)}

## Conversation so far
${(body.history ?? []).slice(-8).map(t => `${t.role}: ${t.content}`).join('\n')}

## User request
${prompt}`;

    const tools = [{
      type: 'function',
      function: {
        name: 'propose_scenarios',
        description: 'Return 2-3 commercial / industrial borrowing capacity scenario proposals.',
        parameters: {
          type: 'object',
          properties: {
            scenarios: {
              type: 'array',
              minItems: 2,
              maxItems: 3,
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  reasoning: { type: 'string' },
                  estimatedImpact: { type: 'string' },
                  executionRisk: { type: 'string', enum: ['low', 'medium', 'high'] },
                  evidenceRequired: { type: 'array', items: { type: 'string' } },
                  adjustments: { type: 'object', additionalProperties: true },
                },
                required: ['name', 'reasoning', 'estimatedImpact', 'executionRisk', 'adjustments'],
              },
            },
          },
          required: ['scenarios'],
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
        tool_choice: { type: 'function', function: { name: 'propose_scenarios' } },
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error('[commercial-bc-scenario-agent] AI error', aiResp.status, txt);
      const status = aiResp.status === 429 ? 429 : aiResp.status === 402 ? 402 : 502;
      return new Response(JSON.stringify({ success: false, error: aiResp.status === 429 ? 'AI rate limit hit, please retry shortly.' : aiResp.status === 402 ? 'Lovable AI credits exhausted. Add credits in Workspace → Usage.' : `AI gateway error: ${txt.slice(0, 300)}` }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    let scenarios: unknown[] = [];
    let assistantText = aiJson.choices?.[0]?.message?.content || '';
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        scenarios = Array.isArray(parsed.scenarios) ? parsed.scenarios : [];
      } catch (e) {
        console.error('[commercial-bc-scenario-agent] tool parse failed', e);
      }
    }
    if (!assistantText) {
      assistantText = scenarios.length
        ? `Drafted ${scenarios.length} scenario option${scenarios.length === 1 ? '' : 's'} based on the current snapshot. Review the cards below and click Apply to cascade into the calculator.`
        : 'No scenario proposals were generated. Try a more specific prompt (e.g. "How can we lift borrowing capacity if we sell the warehouse?").';
    }

    return new Response(JSON.stringify({ success: true, assistantText, scenarios }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[commercial-bc-scenario-agent] fatal', err);
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
