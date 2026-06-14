# Commercial / Industrial BC — Client Portfolio + AI Scenario Agent

Bring the unified Commercial/Industrial Borrowing Capacity card to feature parity with the residential `BCScenarioAgent` flow, replace the sample-data fallbacks with real client data, wire every button to a real action, and let AI-proposed scenarios cascade into the calculator fields and persist back to the client file.

## What's broken today

1. Client dropdown silently falls back to `sampleClientProfiles` (synthetic "Harper Family Group" etc.) when the secure `get-client-data` call returns empty/legacy shape — so what looks like a "real" client is fake data.
2. Imported portfolio only fills 4 fields (equity, sponsor liquidity, business EBITDA, business debt). Residential / commercial / industrial property arrays are loaded into the profile object but never cascade into the calculator inputs.
3. There is no AI scenario agent on this card — no chat, no voice transcription, no proposed scenarios, no cascade-back.
4. The "Save Back to Property", "Assumption Status" row buttons, and several scenario buttons fire `setSyncMessage(...)` strings instead of doing real work.
5. `persistCommittedScenarioAssessment` writes to `borrowing_capacity_assessments` directly with `supabase.from(...)` — RLS is service-role only on most tables in this project, so this likely fails silently in production.

## Scope (this plan)

### 1. Real client portfolio loader
- Replace fallback-to-samples behaviour with a clear "no clients found" empty state. Samples only show when explicitly toggled by a `Use sample profile` dev switch.
- Extend `mapClientDataToProfile` to capture: residential/commercial/industrial property arrays with rent/expenses/loan balance, total annual gross income, all liability classes (CC, BNPL, HECS, P&I), business financials. Source via existing `get-client-data` edge function with `include: { client, properties, employment, income, assets, liabilities, expenses, borrowingCapacity }` (already supported).
- Add `applyPortfolioCascade(profile, mode)` that fills calculator inputs derived from the imported portfolio: net available equity, sponsor liquidity, existing debt service, current rent paid, primary property valuation/areas, NOI from comparable existing assets, GST flag if known. Respects `mode='replace'` vs `mode='scenario'` (only blank fields).
- Tag every cascaded field with `Client Profile Source` in the assumption registry so the Status drawer reflects truth.

### 2. AI Scenario Agent (chat + voice)
- New component `CommercialBCScenarioAgent.tsx` modelled on the residential `BCScenarioAgent` but scoped to commercial/industrial levers:
  - Levers: `purchasePrice`, `proposedLoan`, `equityInjection`, `sponsorLiquidityTopUp`, `additionalGuarantor`, `relatedPartyLease`, `noiUplift` (rent review / vacancy reduction / outgoings recovery), `assetCategoryShift`, `lenderProfileSwitch`, `interestRateChange`, `loanTermChange`, `gstTreatmentSwitch`, `sellAssetIds[]` (from imported portfolio), `refinanceExistingDebt`.
  - Chat history persisted in `localStorage` keyed by `clientId` (mirrors residential pattern).
  - Voice transcription via the existing `<VoiceToTextButton>` component (already in repo).
  - AI call goes through a new edge function `commercial-bc-scenario-agent` that wraps Lovable AI gateway with `google/gemini-3-flash-preview`, tool-calling output for `propose_scenarios` (returns 2–3 `AIScenario`s with `name`, `reasoning`, `adjustments`, `estimatedImpact`, `rejectedLevers`, `executionRisk`, `evidenceRequired`).
  - Server-side preview pass that runs `calculateCommercialIndustrialBorrowing` + `buildClientScenario` + `comparePortfolioScenario` against each proposal so the UI shows engine-truth borrowing capacity / DSCR / surplus before the user clicks Apply.
- Proposal cards mirror residential `SolutionOptionCards`: headline metric delta, rationale, evidence, risk badge, "Apply scenario" button.

### 3. Cascade-back when a scenario is applied
- `applyScenario(proposal)` updates the relevant `useState` setters in `CommercialBorrowingCapacityCard` based on `proposal.adjustments`, recomputes `result`, refreshes the comparison table, then calls `saveScenario('Recommended')`.
- Every cascaded field is also tagged in the assumption registry as `AI Estimate` + verification required, so the Status drawer reflects provenance.
- New "Undo last AI cascade" button restores the pre-cascade snapshot.

### 4. Real persistence to the client file
- `persistClientScenario` keeps the `manage-bc-scenarios` edge function path. Drop the `supabase.from('bc_scenarios')` raw fallback (RLS will block it); surface the error instead.
- `persistCommittedScenarioAssessment` migrates to a new `commit-commercial-bc-scenario` edge function (service role) that writes both `bc_scenarios` (versioned) and `borrowing_capacity_assessments` atomically. Whitelisted in `ALLOWED_TABLES`.
- "Save Back to Property" cascades calculator values into the linked commercial/industrial property row when a `propertyId` is present (purchase_price, valuation, gfa/nla/site, industrial_specs).

### 5. Button audit — wire every button on this card
- `Import current portfolio` → real loader (above).
- `Run property-only` → switches `assessmentMode='propertyOnly'` and reruns engine without portfolio overlay.
- `Save Scenario` / `Mark Recommended` / `Commit to Client Profile` → edge function path (above).
- `Export Scenario Report` → downloads `buildScenarioReportPayload(activeScenario)` as JSON (currently builds payload but throws it away).
- Status-drawer per-row actions (`Estimate with AI`, `Mark as verified`, `Replace manual value`, `Revert to client profile`, `View source`) → real assumption-registry mutations.
- `Save back to property` → real `pushBack` (existing `<SaveBackButton>` plumbing).

### 6. Non-goals (deferred)
- Building a separate cash-flow / NOI AI agent (only borrowing-capacity scenarios here).
- Migrating residential `BCScenarioAgent` to share code (commercial gets its own component first; refactor into a shared lib in a follow-up).
- Multi-property selection picker (single-asset scenarios for this pass).

## Technical details

```text
src/components/commercial/calculators/
  CommercialBorrowingCapacityCard.tsx        ← extend handlers + scenario panel slot
  CommercialBCScenarioAgent.tsx              ← NEW: chat + voice + proposal cards
  CommercialScenarioProposalCard.tsx         ← NEW: one card per AI proposal
src/utils/commercial/
  clientPortfolioRepository.ts               ← real loader; drop silent sample fallback
  clientPortfolioCascade.ts                  ← NEW: applyPortfolioCascade()
  scenarioApplyEngine.ts                     ← NEW: maps AIScenario.adjustments → state setters
supabase/functions/
  commercial-bc-scenario-agent/index.ts      ← NEW: Lovable AI + tool-calling propose_scenarios
  commit-commercial-bc-scenario/index.ts     ← NEW: service-role atomic commit
```

- Edge functions use the project's existing CORS + `x-portal-session-token`/auth standards (`auth/edge-function-cors-and-auth-standard` memory).
- New tables added to `ALLOWED_TABLES` whitelist as needed.
- Voice input reuses `src/components/ui/VoiceToTextButton.tsx` (no new transcription stack).
- AI calls go through Lovable AI Gateway (`LOVABLE_API_KEY`), `google/gemini-3-flash-preview` for proposals, structured-output `Output.object`.
- Chat history per-client in `localStorage`, key `commercial-bc-scenario-chat:{clientId}` (no Supabase table).

## Verification

- Build clean (TypeScript + Vite).
- Import a real client → portfolio cascades into all relevant fields, Status drawer shows `Client Profile Source` tags.
- Speak a scenario into the voice button → transcribed into chat input.
- Submit "What if we drop purchase price to $3M and refinance the existing $1.2M loan?" → 2–3 proposal cards appear with engine-validated capacity numbers.
- Apply a proposal → calculator fields cascade, comparison table updates, "Undo" restores prior state.
- Commit → row appears in `bc_scenarios` AND `borrowing_capacity_assessments` for that client.
- Every button on the card produces a visible state change or toast (no more `setSyncMessage` stubs).

## Estimated rollout

Single batch, ~6 file additions + 3 edits + 2 edge functions. No DB migrations (uses existing `bc_scenarios` + `borrowing_capacity_assessments`).
