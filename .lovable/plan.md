# Residential Borrowing Capacity — What-If Audit Fixes

Five defects from the audit doc, scoped to `src/components/borrowing-capacity/scenarios/*` and `src/utils/scenarioDeltaEngine.ts`. No DB or backend changes.

## 1. Re-introduce the 3 clickable "Solution Option" cards (top of What-If)

The old UX exposed 3 ranked recommendation cards (e.g. *Reduce Expenses*, *Extend Term*, *Release Equity*) that, on click, populated the underlying levers/Capital Flow Canvas. Currently the user must hand-build every scenario.

- Add `SolutionOptionCards.tsx` rendered above `AdditionalStrategyLevers`.
- Source the 3 options from a new `recommendSolutions(baseResult, ctx, target)` helper in `scenarioDeltaEngine.ts` — ranks expense-cut, term-extend, equity-release/portfolio-restructure, IO switch, rate-shock-relief, etc. by `Δ capacity / friction`.
- Each card shows: target action, projected scenario capacity, Δ vs base, key inputs (e.g. "release $245k from Property 2 @ 80% LVR").
- Clicking a card calls a new `applyRecommendation(rec)` that writes into the existing lever state + Capital Flow Canvas allocations so the user only confirms.

## 2. Equity Release must list ALL properties, not just 2

In the equity-release lever, Property 4 is missing from the per-property selector even though the portfolio overview shows it.

- Trace the property list source in `AdditionalStrategyLevers.tsx` (equity-release block). It currently filters to `properties.slice(0, 2)` / drops items where `currentLoan == null`. Replace with the full portfolio list, falling back loan = 0 when missing.
- Mirror the same fix in the Sell-to-Buy lever so all properties (incl. P4) are selectable.

## 3. Phantom baseline scenario capacity (+$429,644 with no levers)

Baseline screenshot shows *Scenario Borrowing Capacity = +$859,203* and *vs Base +$429,644* while "no levers applied". Two bugs:

- `+$859,203` is being rendered as `base + base` because the headline sums `baseCapacity + delta` while `delta` is initialised to `baseCapacity` instead of `0` when `levers.length === 0`.
- Fix in `StrategyScenarioModeling.tsx` (~line 2253): when `appliedLevers.length === 0`, force `scenarioResult = baseResult` and `delta = 0` before passing into `PurchasePowerHeadline`.
- Update `PurchasePowerHeadline` headline copy: when `capacityChange === 0`, hide the "+$" prefix and show "= base capacity".

## 4. Lever attribution math is broken

Screenshot (Page 6) shows every individual lever attributed at `+$429,644` (= base) and total `-$859,288`. Root cause: `runScenario` returns the *full scenario capacity* in `delta` instead of `scenarioCapacity - baseCapacity`, and the compounding-interaction residual is double-subtracted.

- In `scenarioDeltaEngine.ts`, normalise every `ScenarioDelta` to: `delta = isolatedScenarioCapacity - baseCapacity`.
- Compute compounding row as `combinedDelta - Σ isolatedDelta` (signed; can be negative).
- Total row = `Σ isolatedDelta + compoundingResidual` and MUST equal `scenarioCapacity - baseCapacity`. Add an invariant `assert` (dev-only `console.warn`) and a vitest unit test in `src/utils/__tests__/scenarioDeltaEngine.spec.ts`.
- When equity release is applied, also pipe the simulated new repayment into the liabilities array used by the isolated re-run so repayments cascade (currently the IO cost is recorded as a tag string but not added to liabilities).

## 5. Sell-to-Buy: cascade net proceeds into Capital Flow Canvas

Page 7: Combined Sale Impact shows Net Proceeds $568,400 but Capital Flow Canvas Pool shows $600,000 with Allocated $0 / Remaining $600,000 — proceeds aren't auto-routing and the headline figure ($847,785) doesn't move until the user nudges something.

- When a Sell lever is toggled, push a `{ source: 'sale_proceeds_<propId>', amount: netProceeds }` allocation into the Capital Flow Canvas state automatically (default sink = "next-purchase deposit"). User can override.
- Recompute scenario capacity synchronously on toggle (not on next render) so the headline updates immediately. Trace `useMemo([levers, allocations])` deps in `StrategyScenarioModeling.tsx`; currently `allocations` updates one tick late.

## Verification

- Vitest: new `scenarioDeltaEngine.spec.ts` covering (a) baseline → delta=0, (b) Σ isolated + residual = total, (c) sell+equity combined, (d) all properties surfaced.
- Manual QA in preview using the Rugesh Naidu client referenced in the doc:
  1. Open BC modal → What-If tab → confirm headline = base, delta = 0, 3 solution cards visible.
  2. Click "Release Equity" card → Capital Flow Canvas pre-fills allocations, headline updates.
  3. Equity Release lever → all 3 properties visible incl. Property 4.
  4. Sell Property 2 → Pool +$568,400 auto-allocates, headline updates instantly.
  5. Lever Attribution rows sum to the headline delta exactly.

## Out of scope

- Redesign of the Capital Flow Canvas itself (Phase K) — only the auto-allocation hook.
- Server-side BC engine changes (`supabase/functions/calculate-borrowing-capacity`) — the audit findings are all client-side scenario layer issues.

## Technical detail

| File | Change |
|---|---|
| `src/components/borrowing-capacity/scenarios/SolutionOptionCards.tsx` | NEW — 3 clickable recommendation cards |
| `src/utils/scenarioDeltaEngine.ts` | `recommendSolutions()`, delta normalisation, compounding residual fix, equity-release liabilities pipe-through |
| `src/components/borrowing-capacity/scenarios/AdditionalStrategyLevers.tsx` | Remove property slice cap; full portfolio in equity-release + sell-to-buy |
| `src/components/borrowing-capacity/scenarios/StrategyScenarioModeling.tsx` | Baseline guard (delta=0 when no levers); auto-allocate sale proceeds; tighten `useMemo` deps |
| `src/components/borrowing-capacity/scenarios/PurchasePowerHeadline.tsx` | Headline copy when delta=0; signed compounding row |
| `src/utils/__tests__/scenarioDeltaEngine.spec.ts` | NEW — invariants |
