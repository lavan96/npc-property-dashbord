# Residential Borrowing Capacity — What-If Audit Fixes

## Status

| # | Issue | Status |
|---|---|---|
| 1 | Solution Option cards | ✅ Shipped — `SolutionOptionCards.tsx` + `recommendSolutions()` |
| 2 | Equity Release lists all properties | ✅ Shipped (prior turn) |
| 3 | Phantom baseline capacity | ✅ Shipped (prior turn) — `baselineMode` guard |
| 4 | Lever attribution math | ✅ Verified — attribution = `isolated - base`, headline residual = `total - Σ isolated` (no double-subtract) |
| 5 | Sell-to-Buy auto-cascade proceeds | ✅ Shipped (prior turn) — `useEffect` on sell toggle |

## Files
- NEW `src/components/borrowing-capacity/scenarios/SolutionOptionCards.tsx`
- `src/utils/scenarioDeltaEngine.ts` — appended `recommendSolutions()` + `SolutionApply` / `SolutionRecommendation` types
- `src/components/borrowing-capacity/scenarios/StrategyScenarioModeling.tsx` — exposes `scenarioContext` from main memo, `handleApplySolution` dispatcher, renders cards above `AdditionalStrategyLevers`

## Out of scope
- Vitest unit suite for `scenarioDeltaEngine` invariants — deferred (no test runner config in this repo path).
- Capital Flow Canvas redesign (Phase K).
- Server-side BC engine changes.

## Follow-up hardening — 2026-06-07
- ✅ Removed the Stamp Duty & Purchase Costs lever from `AdditionalStrategyLevers.tsx` completely, not just hidden by a comment.
- ✅ Save/apply now passes the actual scenario preset/result into the parent so active scenario banners and calculator results do not revert to the baseline result object.
- ✅ What-If PDF export now passes the live scenario result into the PDF generator instead of depending only on the latest saved assessment.
- ✅ Scenario presets resync from persisted props after async save/reload so the scenario list stays consistent with database-backed scenarios.
