import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { verifyAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-session-token, x-portal-session-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are an expert Australian mortgage & borrowing capacity strategist embedded in a property investment CRM.

## Your Role
You analyse a client's financial snapshot (income, expenses, liabilities, properties) and recommend **exactly 3** actionable what-if scenarios to maximise their borrowing capacity.

## Domain Knowledge
- APRA serviceability buffer: typically 3% above the product rate
- Rental income shading: banks assess 80% of gross rental income
- Interest-Only (IO) vs Principal & Interest (P&I): IO reduces monthly servicing but doesn't reduce debt
- Debt consolidation: paying off high-servicing debts (car loans, credit cards) frees capacity
- Credit card limits: banks assess 3% of the card limit as monthly commitment regardless of balance
- HEM (Household Expenditure Measure): banks use the higher of declared expenses or HEM benchmark
- DTI (Debt-to-Income) ratio: most banks cap at 6-8x gross income
- Equity release: accessing equity from existing properties for deposits (up to ~80% LVR)
- Negative gearing: investment property losses offset taxable income

## Available Strategy Levers
You can recommend combinations of these adjustments:
1. **consolidatedLiabilityIds** — Pay off specific liabilities (provide their IDs)
2. **refinancedToIOPropertyIds** — Switch specific investment property loans to Interest-Only
3. **rateAdjustment** — Rate change in percentage points (e.g., -0.5 for a 0.5% rate reduction)
4. **incomeGrowthPercent** — Percentage increase in gross income (e.g., 10 for 10% growth)
5. **expenseReductionPercent** — Percentage decrease in living expenses (e.g., 15 for 15% cut)
6. **equityRelease** — { propertyId, targetLVR } to release equity from a property

## Conversation Guidelines
- Be conversational and ask clarifying questions if the user's request is vague
- Always reference specific numbers from the client's data
- Explain WHY each strategy works, not just what to do
- When you're ready to recommend scenarios, call the generate_scenarios tool
- Keep explanations concise but insightful — this is for professional mortgage brokers`;

const SCENARIO_TOOL = {
  type: "function",
  function: {
    name: "generate_scenarios",
    description:
      "Generate exactly 3 borrowing capacity improvement scenarios based on the client's financial data and the conversation.",
    parameters: {
      type: "object",
      properties: {
        scenarios: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Short descriptive name for this scenario (max 50 chars)",
              },
              reasoning: {
                type: "string",
                description:
                  "2-3 sentence explanation of why this strategy improves capacity",
              },
              adjustments: {
                type: "object",
                properties: {
                  consolidatedLiabilityIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "IDs of liabilities to pay off",
                  },
                  refinancedToIOPropertyIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "IDs of properties to refinance to IO",
                  },
                  rateAdjustment: {
                    type: "number",
                    description: "Rate adjustment in percentage points",
                  },
                  incomeGrowthPercent: {
                    type: "number",
                    description: "Income growth percentage",
                  },
                  expenseReductionPercent: {
                    type: "number",
                    description: "Expense reduction percentage",
                  },
                  equityRelease: {
                    type: "object",
                    properties: {
                      propertyId: { type: "string" },
                      targetLVR: { type: "number" },
                    },
                    required: ["propertyId", "targetLVR"],
                    description: "Equity release configuration",
                    nullable: true,
                  },
                },
                required: [
                  "consolidatedLiabilityIds",
                  "refinancedToIOPropertyIds",
                  "rateAdjustment",
                  "incomeGrowthPercent",
                  "expenseReductionPercent",
                ],
                additionalProperties: false,
              },
              estimatedImpact: {
                type: "string",
                description:
                  "Estimated capacity change e.g. '+$85,000' or '+12%'",
              },
            },
            required: ["name", "reasoning", "adjustments", "estimatedImpact"],
            additionalProperties: false,
          },
        },
      },
      required: ["scenarios"],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { messages, clientContext } = body;

    // Auth check
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      return new Response(JSON.stringify({ error: authError }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cap conversation length
    const cappedMessages = messages.slice(-20);

    // Build context summary from client data
    let contextBlock = "";
    if (clientContext) {
      const { baseInputs, baseResult, liabilities, properties } = clientContext;
      contextBlock = `\n\n## Client Financial Snapshot
**Current Borrowing Capacity**: $${baseResult?.borrowingCapacity?.toLocaleString() || "N/A"}
**Serviceability Band**: ${baseResult?.serviceabilityBand || "N/A"}
**Monthly Surplus**: $${baseResult?.monthlySurplus?.toLocaleString() || "N/A"}

**Income**: Gross $${baseInputs?.grossAnnualIncome?.toLocaleString() || 0}/yr | Shaded $${baseInputs?.shadedAnnualIncome?.toLocaleString() || 0}/yr
**Living Expenses**: $${baseInputs?.monthlyLivingExpenses?.toLocaleString() || 0}/mo
**Existing Commitments**: $${baseInputs?.monthlyCommitments?.toLocaleString() || 0}/mo
**Interest Rate**: ${baseInputs?.interestRate || 0}% + ${baseInputs?.bufferRate || 0}% buffer
**Loan Term**: ${baseInputs?.loanTermYears || 30} years

### Liabilities (${liabilities?.length || 0})
${(liabilities || []).map((l: any) => `- [${l.id}] ${l.label} (${l.type}): Balance $${l.balance?.toLocaleString()}, Servicing $${l.monthlyServicing?.toLocaleString()}/mo${l.limit ? `, Limit $${l.limit.toLocaleString()}` : ""}`).join("\n") || "None"}

### Properties (${properties?.length || 0})
${(properties || []).map((p: any) => `- [${p.id}] ${p.address} (${p.property_type}): Value $${p.current_value?.toLocaleString()}, Loan $${p.loan_remaining?.toLocaleString()}, LVR ${p.current_value > 0 ? ((p.loan_remaining / p.current_value) * 100).toFixed(0) : 0}%`).join("\n") || "None"}`;
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiMessages = [
      { role: "system", content: SYSTEM_PROMPT + contextBlock },
      ...cappedMessages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: aiMessages,
          tools: [SCENARIO_TOOL],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("[bc-scenario-agent] AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stream the response back
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("[bc-scenario-agent] Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
