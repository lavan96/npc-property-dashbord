-- Add explicit occurrence metadata for generated checklist instances.
-- Templates remain reusable blueprints; instances are dated occurrences.
ALTER TABLE public.checklist_instances
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS recurrence_key TEXT;

-- Backfill existing instance dates so old checklist history is preserved and remains queryable.
UPDATE public.checklist_instances
SET due_date = created_at::date
WHERE due_date IS NULL;

UPDATE public.checklist_instances
SET recurrence_key = COALESCE(template_id::text, id::text) || ':' || due_date::text
WHERE recurrence_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_instances_recurrence_key
  ON public.checklist_instances(recurrence_key)
  WHERE recurrence_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checklist_instances_due_date
  ON public.checklist_instances(due_date);
