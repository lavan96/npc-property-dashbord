
# AI Borrowing Capacity Scenario Agent — Implementation Plan

## Overview
Embed a specialised AI chat interface at the top of the **Scenarios tab** inside `BorrowingCapacityModal`. The agent understands the client's full financial position and, through conversation, generates **3 tailored what-if scenarios**. Each scenario includes an "Apply" button that auto-populates the `StrategyScenarioModeling` levers below.

---

## Architecture

### 1. New Edge Function: `bc-scenario-agent`
- **Purpose**: Stateless AI endpoint that receives the client's current BC snapshot + conversation history and returns scenario recommendations.
- **Model**: Lovable AI Gateway → `google/gemini-3-flash-preview`
- **System Prompt**: Specialist prompt covering APRA rules, shading, DTI, IO vs P&I, debt consolidation, equity release, rate sensitivity — calibrated to the exact levers available in `StrategyScenarioModeling`.
- **Structured Output via Tool Calling**: The agent is given a `generate_scenarios` tool that returns exactly 3 scenarios, each with:
  ```json
  {
    "scenarios": [
      {
        "name": "Pay Off Car Loan + Refinance IP to IO",
        "reasoning": "Removing the $450/mo car loan servicing and switching the IP loan to IO saves $1,200/mo...",
        "adjustments": {
          "consolidatedLiabilityIds": ["uuid-1"],
          "refinancedToIOIds": ["uuid-2"],
          "rateAdjustment": 0,
          "incomeGrowthPercent": 0,
          "expenseReductionPercent": 0,
          "equityRelease": null
        },
        "estimatedCapacityChange": "+$85,000"
      }
    ]
  }
  ```
- **Context Payload**: The frontend sends `baseInputs`, `baseResult`, `liabilities[]`, `properties[]`, and the conversation `messages[]`.
- **Streaming**: SSE streaming for the conversational reply; structured scenarios extracted at the end.

### 2. New Frontend Component: `BCScenarioAgent.tsx`
- Location: `src/components/borrowing-capacity/scenarios/BCScenarioAgent.tsx`
- **UI**: Compact chat interface (collapsible, 300px max height) with:
  - Gold/dark themed header: "🤖 Strategy Advisor"
  - Message list with markdown rendering (`react-markdown`)
  - Input bar with send button
  - When scenarios are returned → 3 scenario cards rendered below the chat, each with:
    - Scenario name + reasoning summary
    - Key adjustments as badges
    - Estimated capacity impact (↑/↓)
    - **"Apply Scenario"** button
- **Apply Logic**: Clicking "Apply" maps the `adjustments` object to `StrategyState` and calls `onApplyScenario` (existing prop), which switches to the calculator tab with the values pre-filled.

### 3. Integration into `StrategyScenarioModeling.tsx`
- Import `BCScenarioAgent` and render it above the existing manual levers section.
- Pass through: `baseInputs`, `baseResult`, `liabilities`, `properties`, `onApplyScenario`.
- The manual levers remain fully functional below — the AI simply pre-fills them.

### 4. Cascade to BC Snapshot PDF
- Already supported: When a scenario is applied via `onApplyScenario`, it updates the calculator state → the next "Calculate & Save" writes the scenario-adjusted assessment to the DB → the BC PDF (`fetchAndGenerateBorrowingCapacityPDF`) already reads the latest saved assessment.
- **Enhancement**: Pass the AI-generated scenario `name` and `reasoning` into the saved assessment metadata so the PDF can include a "Strategy Applied" callout box.

### 5. Cascade to Portfolio Performance Report (PPR)
- **Feasibility**: The PPR already fetches the latest BC assessment via `fetchLatestBorrowingCapacity`. If the user applies an AI scenario → saves it → generates the PPR, it will automatically reflect the updated capacity.
- **No additional work needed** — the existing data flow handles this. We just need to make it clear in the UI that "Save & Calculate" must be triggered before generating the PPR.

---

## File Changes Summary

| File | Change |
|------|--------|
| `supabase/functions/bc-scenario-agent/index.ts` | **NEW** — Edge function with Lovable AI integration |
| `src/components/borrowing-capacity/scenarios/BCScenarioAgent.tsx` | **NEW** — Chat interface + scenario cards |
| `src/components/borrowing-capacity/scenarios/StrategyScenarioModeling.tsx` | Add `BCScenarioAgent` at top of component |
| `src/components/borrowing-capacity/BorrowingCapacityModal.tsx` | Minor — pass `clientId` to scenarios tab (already available) |

---

## Security & Performance
- Edge function validates auth via `verifyAuth()` (existing pattern)
- No client data persisted in the AI conversation — stateless per session
- Rate limiting handled by Lovable AI Gateway (429/402 surfaced to user)
- Conversation capped at 20 messages to control token usage

---

## What This Delivers
1. **Conversational scenario generation** — "My client wants to buy a $600k investment property, they have a car loan and 2 IPs" → 3 tailored strategies
2. **One-click application** — Each strategy maps directly to the existing manual levers
3. **Automatic cascade** — Applied scenarios flow into BC Snapshot PDF and PPR via the existing save → fetch pipeline
