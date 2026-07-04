-- Phase 9C Golden Run History + Baseline Check
-- Run in the Supabase SQL Editor. This SQL is READ-ONLY.
--
-- Purpose:
-- Validate the Phase 9C regression-history ledger (public.pdf_import_golden_runs):
-- schema/RLS presence, per-corpus history, latest baselines, degraded outcomes,
-- and referential integrity. Each section is self-contained (no cross-statement
-- CTE references).

-- ---------------------------------------------------------------------------
-- 1. Schema, index, policy, and trigger presence
-- ---------------------------------------------------------------------------
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'pdf_import_golden_runs') as column_count,
  (select count(*) from pg_indexes
     where schemaname = 'public' and tablename = 'pdf_import_golden_runs') as index_count,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'pdf_import_golden_runs') as policy_count,
  (select count(*) from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     where c.relname = 'pdf_import_golden_runs' and not t.tgisinternal) as trigger_count,
  (select relrowsecurity from pg_class where relname = 'pdf_import_golden_runs') as rls_enabled;

-- ---------------------------------------------------------------------------
-- 2. Check constraints (quality gate / operator decision / score ranges)
-- ---------------------------------------------------------------------------
select conname as constraint_name, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.pdf_import_golden_runs'::regclass
  and contype = 'c'
order by conname;

-- ---------------------------------------------------------------------------
-- 3. Recent history rows
-- ---------------------------------------------------------------------------
select
  id,
  created_at,
  corpus_id,
  category,
  run_id,
  run_batch_id,
  import_id,
  template_id,
  quality_gate_status,
  operator_decision,
  visual_qa_score,
  repair_final_score,
  export_vs_source_score,
  warning_count,
  failure_count,
  (baseline_comparison ->> 'outcome') as baseline_outcome
from public.pdf_import_golden_runs
order by created_at desc
limit 100;

-- ---------------------------------------------------------------------------
-- 4. Per-corpus history counts
-- ---------------------------------------------------------------------------
select
  corpus_id,
  count(*) as run_count,
  count(*) filter (where quality_gate_status = 'pass') as pass_count,
  count(*) filter (where quality_gate_status = 'warning') as warning_count,
  count(*) filter (where quality_gate_status = 'fail') as fail_count,
  count(*) filter (where quality_gate_status = 'blocked') as blocked_count,
  min(created_at) as first_run_at,
  max(created_at) as latest_run_at
from public.pdf_import_golden_runs
group by corpus_id
order by latest_run_at desc;

-- ---------------------------------------------------------------------------
-- 5. Latest run per corpus (the baseline used for the next comparison)
-- ---------------------------------------------------------------------------
select distinct on (corpus_id)
  corpus_id,
  id as latest_history_id,
  run_id,
  created_at,
  quality_gate_status,
  operator_decision,
  visual_qa_score,
  repair_final_score,
  export_vs_source_score,
  warning_count,
  failure_count
from public.pdf_import_golden_runs
order by corpus_id, created_at desc;

-- ---------------------------------------------------------------------------
-- 6. Runs whose stored baseline comparison flagged a regression
-- ---------------------------------------------------------------------------
select
  id,
  created_at,
  corpus_id,
  run_id,
  quality_gate_status,
  operator_decision,
  (baseline_comparison ->> 'outcome') as baseline_outcome,
  (baseline_comparison ->> 'baselineRunId') as baseline_run_id,
  (baseline_comparison -> 'reasons') as reasons
from public.pdf_import_golden_runs
where baseline_comparison ->> 'outcome' = 'degraded'
order by created_at desc
limit 80;

-- ---------------------------------------------------------------------------
-- 7. Integrity: rows must reference a real import; scores must stay in range
-- ---------------------------------------------------------------------------
select
  count(*) as total_rows,
  count(*) filter (where not exists (
    select 1 from public.template_imports ti where ti.id = gr.import_id
  )) as orphan_import_rows,
  count(*) filter (where visual_qa_score is not null and (visual_qa_score < 0 or visual_qa_score > 1)) as out_of_range_visual_qa,
  count(*) filter (where repair_final_score is not null and (repair_final_score < 0 or repair_final_score > 1)) as out_of_range_repair,
  count(*) filter (where export_vs_source_score is not null and (export_vs_source_score < 0 or export_vs_source_score > 1)) as out_of_range_export,
  count(*) filter (where warning_count < 0 or failure_count < 0) as negative_counts
from public.pdf_import_golden_runs gr;

-- ---------------------------------------------------------------------------
-- 8. Phase 9C note
-- ---------------------------------------------------------------------------
select
  'phase_9c_regression_history' as phase,
  'Ledger complements template_imports.meta.golden_regression_summary; metadata only, never source PDFs or raster artifacts. Written via the template-import-pdf save_golden_run_history operation (service role, ownership-checked).' as note;
