# PDF Import Phase 9C — Regression History + Baseline Comparison

## Objective

Phase 9C adds durable, queryable history for golden corpus regression runs and a
baseline comparison that detects regressions between a new run and the previous
run for the same corpus.

Phase 8D persists only the **latest** golden regression summary onto
`template_imports.meta.golden_regression_summary` (fast dashboard display). Phase
9C keeps that summary and adds a dedicated ledger — one row per persisted run in
`public.pdf_import_golden_runs` — so history, trends, and baselines survive beyond
the single latest summary.

## What Phase 9C Does

- Adds one new table: `public.pdf_import_golden_runs` (the regression ledger).
- Adds four secure edge operations on `template-import-pdf`:
  `save_golden_run_history`, `list_golden_run_history`, `get_golden_run_history`,
  `get_latest_golden_run_baselines`.
- Adds pure history modules: types, summary/normalizer, persistence invokers, and a
  baseline comparator.
- Wires `saveHistory` / `compareBaseline` into the Phase 9A orchestrator with three
  new steps (`load_baseline`, `compare_baseline`, `save_history`) and four new
  result fields (`baselineComparison`, `historyPersistenceResult`, `historyRecord`,
  `historySaved`).
- Surfaces baseline outcome + a run-history table in the Phase 9B operator console.

## What Phase 9C Does NOT Do

- Does not remove `template_imports.meta.golden_regression_summary`.
- Does not store source PDFs, screenshots, raster images, or generated PDFs — the
  ledger holds **metadata only**.
- Does not mutate `report_templates`. It only inserts history rows and (via Phase
  8D) the latest summary when `persist` is requested.
- Does not add more than one table.

## The Ledger Table

`public.pdf_import_golden_runs` — one row per persisted golden run.

- Identity: `run_id`, `run_batch_id`, `corpus_id`, `category`, `import_id`
  (FK → `template_imports`, `ON DELETE CASCADE`), `template_id`
  (FK → `report_templates`, `ON DELETE SET NULL`).
- Versions: `engine_version`, `orchestrator_version`, `summary_version`.
- Status: `import_status`, `run_status`, `run_decision`, `quality_gate_status`
  (checked), `operator_decision` (checked).
- Metrics: `visual_qa_score`, `repair_final_score`, `export_vs_source_score`,
  `editor_vs_source_score`, `export_vs_editor_score` (each `0..1` when not null).
- Flags: `visual_qa_manual_review_required`, `repair_requires_fallback`,
  `repair_requires_manual_review`.
- Counts / arrays: `warning_count`, `failure_count` (`>= 0`), `warnings`,
  `failures`.
- JSON: `gate_summary`, `triage_summary`, `golden_regression_summary`,
  `baseline_comparison` (nullable).
- Audit: `created_by`, `created_at`, `updated_at` (trigger-maintained).

There is intentionally **no unique constraint on `run_id`** — the ledger is
append-only and the same run may be recorded more than once across reruns.

### Row-level security

RLS is enabled. Reads follow ownership of the linked import — the same model as
`template_imports` (owner via `user_id = auth.uid()` or an admin via `has_role`):

```sql
EXISTS (
  SELECT 1 FROM public.template_imports ti
  WHERE ti.id = pdf_import_golden_runs.import_id
    AND (ti.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
)
```

Writes are service-role only; the secure `template-import-pdf` edge function
performs ownership-checked inserts. The browser client is anonymous under this
app's custom-auth flow, so all privileged reads/writes go through the edge
function (service role), which enforces the same ownership rules server-side.

## Edge Operations

All four are added to the existing `template-import-pdf` handler (no new function).

| Operation | Input | Returns |
| --- | --- | --- |
| `save_golden_run_history` | `import_id`, `history{…}` (camelCase) | `{ ok, history_id, history }` |
| `list_golden_run_history` | `corpus_id?`, `import_id?`, `limit` (default 50, max 200) | `{ ok, history: [] }` |
| `get_golden_run_history` | `history_id` | `{ ok, history }` or `404 not found` |
| `get_latest_golden_run_baselines` | `corpus_id?` | `{ ok, baselines: [] }` (latest run per corpus) |

`save` validates ownership of the import, requires a non-empty `runId` /
`corpusId` / `category`, and validates `qualityGateStatus` / `operatorDecision`
against the allowed sets before inserting. The read operations enforce ownership
via an inner join to `template_imports` (owner or admin); there are no broad
unauthenticated reads.

## Baseline Comparison

`compareGoldenRunToBaseline({ current, baseline, tolerance })` compares a run to
the previous baseline for the same corpus. It is pure and network-free.

- **Rank-based** quality-gate and operator-decision direction (higher is better):
  - Gate: `blocked` < `fail` < `not_evaluated` < `warning` < `pass`.
  - Decision: `rejected` < `needs_rerun` < `not_reviewed` < `accepted_with_warnings` < `accepted`.
- **Metric** direction for `visualQa`, `repairFinal`, and `exportParity`
  (export-vs-source) using a per-metric score-drop `tolerance` (default `0.02`):
  a drop beyond tolerance is `degraded`, a rise beyond tolerance is `improved`,
  otherwise `stable`; a missing score on either side is `unknown`.
- **Counts**: `failureCountDelta` and `warningCountDelta`.

### Outcome resolution

- `no_baseline` — there is no previous run.
- `degraded` — any gate/decision/metric degraded, `failureCountDelta > 0`, or
  `warningCountDelta > 2`.
- `improved` — nothing degraded and at least one signal improved.
- `stable` — at least one comparable signal, none moved materially.
- `unknown` — not enough comparable data.

## Orchestrator Integration

Two request flags drive the history phase (async-only; the pure core stays
network-free):

- `saveHistory` — after building the summary, records the run in the ledger.
- `compareBaseline` — loads the latest baseline for the corpus and attaches
  `baselineComparison`. Defaults to `saveHistory` when omitted.

Behaviour:

- History runs independently of `persist` (evaluate-only can still compare a
  baseline; the console only enables **save** on persist).
- No baseline yet → warning `no_baseline_found` → `completed_with_warnings`.
- Baseline load failure → warning `baseline_load_failed` (non-blocking).
- A `degraded` outcome adds a `baseline_regression_detected` warning.
- `saveHistory` with no summary → failure `history_summary_missing` (status
  `failed`).
- History save failure → failure `history_persistence_failed` (status `failed`).

## Console

The Phase 9B console adds:

- **Compare to baseline** and **Save to history ledger** toggles.
- A **History** tab (`GoldenRegressionHistoryPanel`) showing the baseline
  comparison for the current run and the run-history table for the corpus/import.
- Baseline-outcome and history-saved badges on the result panel.

## Deployment

Phase 9C requires **both**:

1. The migration `supabase/migrations/20260704000000_create_pdf_import_golden_runs.sql`.
2. A redeploy of the `template-import-pdf` edge function (four new operations).

## Validation

`scripts/regression/pdf-import-phase-9c-history-check.sql` (read-only) inspects the
ledger: table/index/policy presence, per-corpus history counts, latest-run
baselines, degraded outcomes, and orphan checks.

## Acceptance Criteria

- One new table with RLS, indexes, and an `updated_at` trigger.
- Four ownership-checked edge operations; no broad unauthenticated reads.
- History modules + baseline comparator are pure and unit-tested.
- Orchestrator saves history and compares baselines behind explicit flags without
  breaking the pure snapshot path.
- Console surfaces baseline outcome and history.
- `template_imports.meta.golden_regression_summary` is untouched.
- tests pass; build passes.

## Recommended Next Phase

**Phase 9D — Regression trend dashboard:** aggregate the ledger into per-corpus
trend charts (score-over-time, gate/decision distribution) and alerting on
sustained `degraded` streaks.
