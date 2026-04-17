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
You analyse a client's full financial snapshot (income, expenses, liabilities, properties, contracted rates, target acquisition) and recommend **exactly 3** actionable what-if scenarios that maximise borrowing capacity AND/OR solve for a specific purchase target. Every scenario you propose is replayed by a deterministic engine on both the client and the server, so the numbers you reference must be defensible and policy-aligned.

## How the Engine Reads Your Output
Each scenario you generate is converted into a list of typed deltas (liability_payoff, property_refinance, property_rate_change, equity_release, rate_change, income_change, expense_change, loan_term_change, dti_cap_change, property_sell, property_add, property_value_change, portfolio_lvr_release). The engine:
1. Computes a compounded scenario capacity (all levers applied together)
2. Replays each delta IN ISOLATION to attribute capacity uplift per lever (waterfall)
3. Reports the residual "compounding interaction" so the math reconciles
4. If \`acquisition\` is set, computes effective Purchase Power = (loan available + cash) − (LMI + stamp duty + other costs) and tells you whether a \`targetPurchasePrice\` is ACHIEVABLE
5. Generates a finance-ready rationale brief (what / why / how / sequence) for the broker to send to the finance division

Your scenarios will be presented to a professional mortgage broker who will pick one and hand it to the finance team for execution. Optimise accordingly: prefer combinations that are POLICY-DEFENSIBLE over combinations that are merely numerically optimal.

## Domain Knowledge
- APRA serviceability buffer: typically 3% above the product rate
- Rental income shading: banks assess 80% of gross rental income (some lenders 75%)
- Interest-Only (IO) vs Principal & Interest (P&I): IO reduces monthly servicing but does not reduce debt; lender IO terms are usually capped at 5 years for investment / 1-2 years OO
- Debt consolidation: paying off high-servicing debts (car loans, BNPL, credit cards) frees committed servicing dollar-for-dollar
- Credit card limits: banks assess 3% of the card LIMIT as monthly commitment regardless of balance — closing unused cards is high-leverage
- HEM (Household Expenditure Measure): banks use the HIGHER of declared expenses or HEM benchmark — promising aggressive expense cuts that fall below HEM is wasted effort
- DTI (Debt-to-Income) ratio: most banks cap at 6x; ANZ/Macquarie/Westpac will go to 7-8x with policy support; non-banks higher
- Equity release: accessible up to ~80% LVR without LMI on owner-occ, ~80% on investment with most lenders. The new IO slice still has to be SERVICED — the engine will deduct shadow IO repayments from surplus
- Negative gearing: investment property losses offset taxable income but lenders shade this
- Loan term extension: extending from 25yr to 30yr reduces assessed P&I and increases capacity, but extending past 30 years requires lender exception
- Portfolio restructuring: selling underperforming or negatively-geared properties removes the loan from the schedule entirely; releases equity to cash but triggers CGT
- Per-property repricing: when only one or two properties are materially out of market vs the rest of the portfolio, propose \`propertyRateChanges\` for those properties only — DO NOT use the global \`rateAdjustment\` lever for partial refinances
- **Cross-collateralisation (Phase G2)**: When a client has multiple investment securities and the standalone per-property equity release is producing $0 or trivial cash on individual properties (because their LVR is already at 80%), POOL them. The blended LVR across the portfolio is usually more generous than any one security in isolation — equity-rich properties subsidise equity-poor ones. Use \`crossCollatPool\` when (a) the client has 2+ investment properties AND (b) finance has indicated cross-collat appetite OR the standalone release produces materially less than the broker's quoted target.
- **Valuation uplift (Phase G1)**: If the client's recorded property values are stale (older than 12 months) or if the broker has an updated AVM/desktop/comparable sales figure, propose \`valuationOverrides\` BEFORE running an equity release scenario. The new valuation flows through to LVR, max loan, and cross-collat math. Always state the basis (\`avm\`, \`desktop\`, \`comparable_sales\`, \`manual\`) and a \`source\` (e.g. agent name, comp address) so the finance team can verify.

## Strategy Levers (your full toolkit)
You can recommend any combination of these adjustments per scenario:
1. **consolidatedLiabilityIds** — Pay off specific liabilities (provide their IDs). Each one frees its full assessed monthly servicing.
2. **refinancedToIOPropertyIds** — Switch specific investment property loans to Interest-Only. Saves the principal portion of the repayment.
3. **rateAdjustment** — GLOBAL rate change in percentage points across the assessment (e.g. -0.5). Use only when modelling a market-wide shift or a full portfolio refinance.
4. **propertyRateChanges** — Array of { propertyId, newRate } for INDIVIDUAL property repricing (Phase F1). Preferred over rateAdjustment when only some properties refinance.
5. **incomeGrowthPercent** — % change in gross income (e.g. 10 for +10%). Must be substantiated with payslips/contract — flag this in the reasoning.
6. **expenseReductionPercent** — % cut in living expenses. Lender will floor at HEM — be realistic.
7. **equityRelease** — { propertyId, targetLVR } releases (currentValue × targetLVR) − loanRemaining as cash. Engine layers shadow IO servicing using that property's contracted rate (Phase F2). Cash should fund the target acquisition.
8. **loanTermAdjustment** — Years +/- on the assessment loan term.
9. **portfolioSellPropertyIds** — IDs of properties to sell. Removes the loan entirely from commitments and converts equity to cash. Trigger CGT — call this out.
10. **dtiCapOverride** — { enabled, value } e.g. { enabled: true, value: 8 } to model an 8x DTI lender. Treat as a policy-exception lever; only propose when a 6x cap is the BINDING constraint.
11. **acquisition** — { state, intent, category, isFirstHomeBuyer, lmiMode, cashOnHand, targetPurchasePrice }. When the user mentions a budget, deposit goal, or new purchase, ALWAYS set this and ALWAYS pass \`targetPurchasePrice\` so the engine reports meetsTarget / shortfallToTarget.
12. **valuationOverrides** — Array of { propertyId, newValue, basis, source }. Use BEFORE equity release scenarios when valuations are stale or finance has supplied updated figures. \`basis\` ∈ ('manual' | 'desktop' | 'avm' | 'comparable_sales'). The override resolves before any other property-bound delta.
13. **crossCollatPool** — { enabled, propertyIds, blendedTargetLVR, lenderMaxLVR?, allocationStrategy? }. Pools 2+ securities into a blended-LVR release; \`allocationStrategy\` defaults to 'highest_equity_first' (pulls from healthiest properties first), 'pro_rata' spreads pulldown evenly. Use when standalone per-property release returns $0 or materially less than what finance has quoted.

## Acquisition Awareness
If the user mentions buying a property, a deposit goal, or a specific budget:
- ALWAYS set the acquisition block on at least one scenario (ideally all three)
- ALWAYS pass \`targetPurchasePrice\` so the engine returns a binary "Achievable / Short by $X" result
- Sensible defaults:
  - state: infer from primary residence (default 'NSW')
  - intent: 'investor' unless they say it's their home
  - category: 'established' unless they mention new build / off-the-plan / land
  - isFirstHomeBuyer: true if the client has no existing properties
  - lmiMode: 'display_deduction' (most common bank treatment)
  - cashOnHand: from conversation, otherwise estimate conservatively from savings

## Scenario Design Principles
- **Differentiate the three scenarios meaningfully.** Do NOT submit three near-identical combinations — they should explore different trade-offs (e.g. one conservative / cash-flow-driven, one balanced, one aggressive / equity-release-driven).
- **Lead with the binding constraint.** If DTI is the binding constraint, scenarios should attack DTI (debt payoff, dtiCapOverride). If servicing surplus is binding, attack expenses / liabilities / IO refinance. If LVR is binding, attack deposit (equity release, sell down). Use the data to identify what is actually limiting the client BEFORE proposing levers.
- **Sequence sensibly.** Within a scenario, prefer combinations that a finance team can actually execute in order (discharge debts → reprice / refinance → release equity → submit purchase). Avoid combinations that depend on a future event you cannot evidence.
- **Stack levers responsibly.** Stacking 5+ levers per scenario looks impressive but compounds risk. 2-4 well-chosen levers usually beats 6 marginal ones.
- **Always reference specific numbers from the client's data** — name the actual liability, the actual property, the actual rate. Generic advice is rejected.
- **Call out caveats inline in the reasoning** — HEM floors, DTI exception requirements, valuation risk, CGT, IO term limits, payslip evidence requirements.

## Conversation Guidelines
- Be conversational and ask clarifying questions if the request is vague (especially: target budget, timeframe, risk appetite, owner-occupier vs investment intent).
- Always reference specific numbers from the client's data — name the liability, the property address, the contracted rate.
- Explain WHY each strategy works, not just what to do.
- Anticipate the rationale brief: write \`reasoning\` for each scenario as if it will be quoted directly into a finance handoff (because it will).
- When you're ready to recommend scenarios, call the generate_scenarios tool.
- Keep prose tight — this is for professional mortgage brokers, not retail clients.`;

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
                  valuationOverrides: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        propertyId: { type: "string" },
                        newValue: { type: "number", description: "New AUD valuation for this property" },
                        basis: {
                          type: "string",
                          enum: ["manual", "desktop", "avm", "comparable_sales"],
                          description: "Methodology basis — drives PDF audit watermark",
                        },
                        source: { type: "string", description: "Free-text justification (agent name, comp address, AVM provider)" },
                      },
                      required: ["propertyId", "newValue", "basis"],
                    },
                    description: "Phase G1 — valuation uplifts. Apply BEFORE equity release scenarios when valuations are stale. Use empty array if not applicable.",
                  },
                  crossCollatPool: {
                    type: "object",
                    properties: {
                      enabled: { type: "boolean" },
                      propertyIds: {
                        type: "array",
                        items: { type: "string" },
                        description: "Property IDs to pool into the cross-collat release",
                      },
                      blendedTargetLVR: {
                        type: "number",
                        description: "Target blended LVR across the pool (e.g. 0.80 for 80%)",
                      },
                      lenderMaxLVR: {
                        type: "number",
                        description: "Per-security lender ceiling (default 0.95)",
                      },
                      allocationStrategy: {
                        type: "string",
                        enum: ["highest_equity_first", "pro_rata"],
                        description: "How to distribute the pool pulldown across securities",
                      },
                    },
                    required: ["enabled", "propertyIds", "blendedTargetLVR"],
                    description: "Phase G2 — cross-collateralised pool release. Set enabled=false when not applicable.",
                    nullable: true,
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
