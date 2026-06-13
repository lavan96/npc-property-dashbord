
# Commercial/Industrial Portfolio + Hybrid BC Integration Plan

## Goal
Let commercial and industrial properties live inside a client's portfolio alongside residential ones, and let the Borrowing Capacity engine reconcile all three asset classes through a single hybrid pipeline — **without changing any existing residential behaviour, table shapes, or UI**.

## Guiding Principles
1. **Additive only**: no destructive schema changes, no renames, no removal of `client_properties` columns or `property_type` values.
2. **Residential is the default and unchanged**: if no commercial/industrial rows are linked, the BC engine produces byte-identical output to today.
3. **Asset class is a discriminator, not a fork**: one engine entry point, three segment evaluators, one merged result.
4. **Provenance preserved**: each contribution to BC is tagged with `assetClass` so the UI and PDFs can break it down.

---

## Architecture

```text
                       ┌────────────────────────────────┐
                       │  calculate-borrowing-capacity  │  (edge fn — single entry)
                       └────────────────┬───────────────┘
                                        │
                  ┌─────────────────────┼──────────────────────┐
                  │                     │                      │
        ┌─────────▼─────────┐ ┌─────────▼─────────┐ ┌──────────▼─────────┐
        │ Residential       │ │ Commercial         │ │ Industrial         │
        │ segment evaluator │ │ segment evaluator  │ │ segment evaluator  │
        │ (existing logic   │ │ (wraps             │ │ (wraps             │
        │  untouched)       │ │  commercialBorrow… │ │  industrialBc…)    │
        └─────────┬─────────┘ └─────────┬──────────┘ └──────────┬─────────┘
                  │                     │                       │
                  └─────────────────────┼───────────────────────┘
                                        │
                          ┌─────────────▼──────────────┐
                          │  Portfolio Reconciler      │
                          │  (merges income, debt-svc, │
                          │   DTI denominator, ICR/    │
                          │   DSCR overlays, capacity) │
                          └─────────────┬──────────────┘
                                        │
                          ┌─────────────▼──────────────┐
                          │ FullAssessmentResult       │
                          │ + segmentBreakdown[]       │
                          └────────────────────────────┘
```

---

## Phase 1 — Portfolio Link (schema + UI)

### 1.1 Schema (one additive migration)
- Add `client_id uuid REFERENCES clients(id) ON DELETE SET NULL` **constraint** to `commercial_properties` and `industrial_properties` (column already exists; only add the FK + index — nullable preserved).
- Add `linked_at timestamptz` on both tables (audit).
- Add a **lightweight view** `client_portfolio_properties` that UNIONs the three tables into a normalised shape:
  ```text
  (id, client_id, asset_class, address, value, loan_remaining,
   monthly_interest_repayment, monthly_rental_income, source_table)
  ```
  Commercial/industrial loan + repayment fields come from latest `commercial_dcf_runs.outputs` (commercial) / a new optional `industrial_financing` JSONB column (industrial).
- **No change** to `client_properties` schema or `property_type` enum values.

### 1.2 Linking UI
- In `PropertyEditSheet`, keep existing residential `property_type` selector untouched. Add a **separate top-level "Asset Class" toggle** above it: `Residential | Commercial | Industrial`.
  - `Residential` → renders today's form unchanged.
  - `Commercial` / `Industrial` → swaps the body for a slimmed "Link or Create" panel that calls existing `manage-commercial-data` / `manage-industrial-data` edge functions to either pick an existing user-owned property or create a new one with `client_id` pre-filled.
- On commercial/industrial property detail pages, add an "Attach to Client" picker (mirrors the calculator property bar pattern from last batch).

### 1.3 Hooks
- New `useClientPortfolio(clientId)` hook that fan-outs to `manage-client-data` + `manage-commercial-data` + `manage-industrial-data` and returns `{ residential, commercial, industrial, all }` — purely additive, existing `useSecureClientData` keeps working.

---

## Phase 2 — Hybrid BC Engine (edge function)

### 2.1 Segment evaluators (new files, no edits to existing logic)
- `supabase/functions/calculate-borrowing-capacity/segments/residential.ts` — extracted verbatim from current `assessPropertyContribution`. Same inputs, same outputs. **No behaviour change.**
- `supabase/functions/calculate-borrowing-capacity/segments/commercial.ts` — calls `calculateCommercialIndustrialBorrowing` from `src/utils/commercial/...` (mirrored under `_shared/`), returning a normalised `SegmentContribution`:
  ```text
  {
    assetClass: 'commercial',
    shadedAnnualIncome, annualDebtService,
    icr, dscr, maxLoanByIcr, maxLoanByDscr,
    propertyValue, loanBalance, lvr,
    warnings[], assumptions[]
  }
  ```
- `supabase/functions/calculate-borrowing-capacity/segments/industrial.ts` — same shape, wraps `calculateIndustrialBc`.

### 2.2 Portfolio reconciler (new)
- New module `segments/reconcile.ts`:
  1. Fetch residential rows from `client_properties` (existing path).
  2. Fetch commercial + industrial rows via service-role from the two new-FK'd tables filtered by `client_id`.
  3. Run each segment evaluator independently.
  4. **Merge rules** (hybrid):
     - **Income side**: residential rents continue to use `incomeShadingRules.rental_existing` (0.80). Commercial uses NOI net of recoverables (already net of GST in the commercial engine). Industrial uses per-sqm NOI from `industrialBc`. All three sum into `shadedAnnualIncome`.
     - **Debt service side**: residential uses stressed P&I as today. Commercial/industrial supply their own ICR/DSCR-stressed annual debt service; both add into `existingCommitments` (no double-count vs residential `loan_remaining` because we filter by `source_table`).
     - **DTI denominator**: extended via existing `dtiDenominator.ts` to include commercial NOI and industrial NOI (gross, pre-shading), behind a flag `dtiIncludeCommercialNoi` defaulting to **true** for new calcs, **false** for replayed historical assessments (preserves audit trail).
     - **Capacity cap**: `min(residentialCapacity, residentialCapacity + commercialHeadroom + industrialHeadroom)` where headroom = the segment's `maxLoanByIcr/Dscr` − its `loanBalance`. If a segment is negatively constrained (ICR < 1), it reduces overall capacity by the shortfall × policy `commercialDragFactor` (configurable, default 1.0).
     - **Serviceability band**: take the **worst** band across segments (red beats amber beats green).
  5. Return existing `FullAssessmentResult` shape **plus** a new optional `segmentBreakdown` array — additive, so old consumers ignore it.

### 2.3 Policy
- Extend `DEFAULT_POLICY` with a `segmentPolicy` block:
  ```text
  segmentPolicy: {
    enabled: true,            // master kill-switch
    commercial: { minIcr: 1.50, minDscr: 1.30, maxLvr: 0.65, ... },
    industrial: { minIcr: 1.75, minDscr: 1.35, maxLvr: 0.60, ... },
    dtiIncludeCommercialNoi: true,
    commercialDragFactor: 1.0,
  }
  ```
  When `enabled=false` or no commercial/industrial rows are linked, the reconciler short-circuits to the existing residential-only path → guarantees zero regression.

### 2.4 Persistence
- `borrowing_capacity_assessments` already has wide JSONB columns. Store `segmentBreakdown` inside the existing `details` (or whichever JSONB column holds the breakdown today) — **no schema change required.**

---

## Phase 3 — Front-End Reconciliation

### 3.1 BC display
- `useBorrowingCapacity` already returns the full assessment unchanged. Add an optional `getSegmentBreakdown()` selector that surfaces the new array. Existing consumers untouched.
- New presentational component `BorrowingCapacitySegmentCard` rendered **only when** `segmentBreakdown?.length > 1`, shown beneath the existing BC summary on the Client BC tab and on the commercial/industrial calculator pages (re-uses the calculator property bar's selected client).

### 3.2 Live recalc on portfolio change
- Invalidation already cascades through `['client-data', clientId]`. Add the two new query keys (`['commercial-properties', clientId]`, `['industrial-properties', clientId]`) to the invalidation list inside `calculateMutation.onSuccess` and the property-add/edit mutations on both sides → guarantees BC card refreshes when a commercial/industrial property is attached, detached, or its lease/financing changes.

### 3.3 Calculator ↔ BC loop
- Re-use the existing `SaveBackButton` pattern from last batch: when a commercial/industrial calculator saves NOI / loan / cap rate back to the property, it triggers BC invalidation for the linked `client_id` so the residential BC view updates within ~1s.

---

## Phase 4 — Safety Nets

1. **Feature flag** `pdfImportEngine`-style: `bcSegmentEngine` flag in `feature_flags` table. Off → reconciler skipped, residential-only. Allows staged rollout per user.
2. **Replay parity test**: a new test `bcSegmentReplay.test.ts` re-runs the 10 most recent stored assessments through the reconciler with `enabled=false` and asserts byte-for-byte identical outputs vs the stored result.
3. **Whitelist update**: add `commercial_properties`, `industrial_properties`, `commercial_leases`, `industrial_tenancies`, `commercial_dcf_runs` to the BC edge function's `ALLOWED_TABLES` (per the Edge Function Whitelists rule in memory).
4. **Realtime publication**: add the two property tables to `supabase_realtime` so the BC card live-updates (per the Realtime Standards rule).

---

## Out of Scope (explicitly)
- Any UI redesign of the existing residential properties tab.
- Any change to the `property_type` enum values or residential shading rates.
- Any change to existing BC assessment records.
- SMSF-commercial hybrid (separate follow-up).

---

## Migration Sequence
1. **Migration A** — additive FKs + `linked_at` + view + optional `industrial_financing` JSONB.
2. **Code merge** — segment evaluators + reconciler behind flag (default **off**).
3. **UI merge** — asset-class toggle + portfolio hook + segment card.
4. **Backfill** — surface any existing commercial/industrial rows that already have a `client_id` (`commercial_properties.client_id` is already populated for some users) in the new portfolio view.
5. **Enable flag** for internal users → replay parity test must pass → enable for all.
6. **Docs** — add `docs/BORROWING_CAPACITY_HYBRID.md` describing the segment merge rules.

---

## Risk Register
| Risk | Mitigation |
|---|---|
| Double-counting a commercial property whose loan was also entered manually as a residential `client_properties` row | Reconciler dedupes by normalised address + `source_table` precedence (commercial > residential when address matches within 0.85 similarity) |
| Commercial NOI inflates DTI denominator unrealistically for lenders that don't recognise it | `dtiIncludeCommercialNoi` policy flag, default true but overrideable per-lender via `lenderPolicyProfiles` |
| Edge function timeout when client has many commercial leases | Parallel fetch + 8s budget; fall back to "residential-only with warning" if any segment fetch exceeds budget |
| Existing stored assessments look "wrong" once flag flips on | Stored results are immutable; only new calcs use the hybrid path. Replay test guarantees the *engine* matches when flag is off |

---

Confirm and I'll implement Phase 1 → 4 in that order, each phase shippable independently.
