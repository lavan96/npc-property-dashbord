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
- Loan term extension: extending from 25yr to 30yr reduces monthly repayments and increases capacity
- Portfolio restructuring: selling underperforming or negatively-geared properties can free up capacity

## Available Strategy Levers
You can recommend combinations of these adjustments:
1. **consolidatedLiabilityIds** — Pay off specific liabilities (provide their IDs)
2. **refinancedToIOPropertyIds** — Switch specific investment property loans to Interest-Only
3. **rateAdjustment** — Global rate change in percentage points (e.g., -0.5 for a 0.5% rate reduction)
4. **incomeGrowthPercent** — Percentage increase in gross income (e.g., 10 for 10% growth)
5. **expenseReductionPercent** — Percentage decrease in living expenses (e.g., 15 for 15% cut)
6. **equityRelease** — { propertyId, targetLVR } to release equity from a property (cash freed = (currentValue × targetLVR) − loanRemaining; engine layers shadow IO servicing using that property's contracted rate)
7. **loanTermAdjustment** — Years to add or subtract from base loan term (e.g., 5 for extending 5 years, -5 for shortening)
8. **portfolioSellPropertyIds** — IDs of properties to sell (removes their loan servicing from commitments)
9. **dtiCapOverride** — { enabled, value } to model a different DTI cap (e.g., switching to a lender with 8x DTI vs 6x)
10. **propertyRateChanges** — Array of { propertyId, newRate } to reprice INDIVIDUAL property loans (e.g., refinancing one property to a sharper investor rate). Use this when only some properties refinance — leave the global rateAdjustment at 0 in that case.
11. **acquisition** — { state, intent, category, isFirstHomeBuyer, lmiMode, cashOnHand, targetPurchasePrice } — When the user is targeting a NEW PURCHASE, set this so the engine can derive a maximum purchase price (net of stamp duty, LMI, and acquisition costs). Set targetPurchasePrice when the user gives a budget (e.g. $700k) so the engine reports whether the strategy ACTUALLY hits it. Omit/null for pure capacity-improvement scenarios.

## Acquisition Awareness
If the user mentions buying a property, a deposit goal, or a specific budget, ALWAYS set the acquisition block in at least one scenario.
Stamp duty + LMI vary heavily by state and buyer profile — make sensible defaults:
- state: infer from the client's primary residence (default 'NSW')
- intent: 'investor' unless they say it's their home
- category: 'established' unless they mention new build / off-the-plan / land
- isFirstHomeBuyer: true if the client has no existing properties
- lmiMode: 'display_deduction' (most common bank treatment)
- cashOnHand: from the conversation, or estimate from savings

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
                    description: "Rate adjustment in percentage points (e.g., -0.5)",
                  },
                  incomeGrowthPercent: {
                    type: "number",
                    description: "Income growth percentage (e.g., 10 for +10%)",
                  },
                  expenseReductionPercent: {
                    type: "number",
                    description: "Expense reduction percentage (e.g., 15 for -15%)",
                  },
                  equityRelease: {
                    type: "object",
                    properties: {
                      propertyId: { type: "string" },
                      targetLVR: { type: "number", description: "Target LVR as decimal e.g. 0.8 for 80%" },
                    },
                    required: ["propertyId", "targetLVR"],
                    description: "Equity release configuration. Set to null if not applicable.",
                    nullable: true,
                  },
                  loanTermAdjustment: {
                    type: "number",
                    description: "Years to add (+) or subtract (-) from base loan term. E.g., 5 extends by 5 years, -5 shortens by 5 years. Use 0 for no change.",
                  },
                  portfolioSellPropertyIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "IDs of properties to sell — removes their loan servicing from commitments. Use empty array if not applicable.",
                  },
                  dtiCapOverride: {
                    type: "object",
                    properties: {
                      enabled: { type: "boolean", description: "Whether to enable a custom DTI cap" },
                      value: { type: "number", description: "DTI cap multiplier e.g. 8 for 8x gross income" },
                    },
                    required: ["enabled", "value"],
                    description: "Override DTI cap to model different lender policies. Set enabled=false if not applicable.",
                    nullable: true,
                  },
                  propertyRateChanges: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        propertyId: { type: "string" },
                        newRate: { type: "number", description: "New contracted annual rate in % (e.g. 5.89)" },
                      },
                      required: ["propertyId", "newRate"],
                    },
                    description: "Per-property rate changes for partial portfolio refinances. Use empty array if not applicable.",
                  },
                  acquisition: {
                    type: "object",
                    properties: {
                      state: {
                        type: "string",
                        enum: ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "NT", "ACT"],
                        description: "Australian state where the property will be purchased",
                      },
                      intent: {
                        type: "string",
                        enum: ["owner_occupier", "investor"],
                        description: "Purchase intent — investor uses harsher stamp duty in some states",
                      },
                      category: {
                        type: "string",
                        enum: ["established", "new", "vacant_land"],
                        description: "Property type — affects FHB concessions",
                      },
                      isFirstHomeBuyer: { type: "boolean" },
                      lmiMode: {
                        type: "string",
                        enum: ["none", "display_deduction", "debt_capitalised"],
                        description: "How LMI premium is applied",
                      },
                      cashOnHand: {
                        type: "number",
                        description: "Cash deposit available beyond any equity release (AUD)",
                      },
                      targetPurchasePrice: {
                        type: "number",
                        description: "Target purchase price the strategy is solving for (AUD). Set when the user provides a budget so the engine reports meetsTarget / shortfall.",
                      },
                    },
                    required: ["state", "intent"],
                    description: "Acquisition context for max purchase price math. ONLY include when the user is targeting a new property purchase. Omit otherwise.",
                    nullable: true,
                  },
                },
                required: [
                  "consolidatedLiabilityIds",
                  "refinancedToIOPropertyIds",
                  "rateAdjustment",
                  "incomeGrowthPercent",
                  "expenseReductionPercent",
                  "loanTermAdjustment",
                  "portfolioSellPropertyIds",
                ],
              },
              estimatedImpact: {
                type: "string",
                description:
                  "Estimated capacity change e.g. '+$85,000' or '+12%'",
              },
            },
            required: ["name", "reasoning", "adjustments", "estimatedImpact"],
          },
        },
      },
      required: ["scenarios"],
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

      // Phase E (M4): Pre-compute the binding constraint so the AI stops
      // proposing levers that don't move the actual ceiling.
      const grossAnnualIncome = Number(baseInputs?.grossAnnualIncome || 0);
      const dtiCap = Number(baseInputs?.dtiCapLimit || 6);
      const dtiCapEnabled = !!baseInputs?.dtiCapEnabled;
      const totalDebt = Number(baseInputs?.totalDebtBalances || 0);
      const capacity = Number(baseResult?.borrowingCapacity || 0);
      const dtiHeadroom = grossAnnualIncome > 0
        ? (grossAnnualIncome * dtiCap - totalDebt - capacity) / Math.max(1, grossAnnualIncome * dtiCap)
        : 1;
      const surplus = Number(baseResult?.monthlySurplus || 0);

      let bindingConstraint = "surplus (serviceability)";
      if (dtiCapEnabled && dtiHeadroom < 0.05) bindingConstraint = `DTI cap (${dtiCap}x gross income — capacity is hard-capped here, income-growth and debt-payoff levers help most)`;
      else if (surplus < 500) bindingConstraint = "monthly surplus (expense reduction or income growth move the needle most)";
      else if (capacity < 100000) bindingConstraint = "low absolute capacity — focus on commitment reduction";

      contextBlock = `\n\n## Client Financial Snapshot
**Current Borrowing Capacity**: $${capacity.toLocaleString()}
**Serviceability Band**: ${baseResult?.serviceabilityBand || "N/A"}
**Monthly Surplus**: $${surplus.toLocaleString()}
**DTI Ratio**: ${baseResult?.dtiRatio || "N/A"} (cap ${dtiCapEnabled ? `${dtiCap}x ENABLED` : `${dtiCap}x not enforced`})
**🎯 Binding Constraint**: ${bindingConstraint}

**Income**: Gross $${grossAnnualIncome.toLocaleString()}/yr | Shaded $${baseInputs?.shadedAnnualIncome?.toLocaleString() || 0}/yr
**Living Expenses**: $${baseInputs?.monthlyLivingExpenses?.toLocaleString() || 0}/mo
**Existing Commitments**: $${baseInputs?.monthlyCommitments?.toLocaleString() || 0}/mo
**Interest Rate**: ${baseInputs?.interestRate || 0}% + ${baseInputs?.bufferRate || 0}% buffer
**Loan Term**: ${baseInputs?.loanTermYears || 30} years

### Liabilities (${liabilities?.length || 0})
${(liabilities || []).map((l: any) => `- [${l.id}] ${l.label} (${l.type}): Balance $${l.balance?.toLocaleString()}, Servicing $${l.monthlyServicing?.toLocaleString()}/mo${l.limit ? `, Limit $${l.limit.toLocaleString()}` : ""}`).join("\n") || "None"}

### Properties (${properties?.length || 0})
${(properties || []).map((p: any) => `- [${p.id}] ${p.address} (${p.property_type}): Value $${p.current_value?.toLocaleString()}, Loan $${p.loan_remaining?.toLocaleString()}, LVR ${p.current_value > 0 ? ((p.loan_remaining / p.current_value) * 100).toFixed(0) : 0}%`).join("\n") || "None"}

## Scenario Discipline (Phase E)
- The binding constraint above tells you which lever moves capacity most. Prioritise it.
- Cap any single 'incomeGrowthPercent' at 25 and 'expenseReductionPercent' at 30 unless the user explicitly pushes higher.
- Always justify the assumption in 'reasoning' with concrete numbers from the snapshot.`;
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
