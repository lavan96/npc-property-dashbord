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
