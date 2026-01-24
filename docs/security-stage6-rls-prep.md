# Stage 6 RLS Preparation (Non‑Breaking)

This stage prepares the database for future RLS tightening **without changing current behavior**.
Existing permissive policies still allow access, so no functional breakage is expected.

## What changed
- Added ownership columns to key tables (nullable).
- Added indexes for those ownership columns.
- Added owner‑based **shadow policies** (do not enforce yet due to existing permissive policies).
- Added helper SQL function `public.matches_auth_uid(uuid)` for policy checks.

## Tables updated (ownership columns)
Client data:
- `client_properties`, `client_employment`, `client_income`, `client_assets`, `client_liabilities`
- `client_expenses`, `client_scores`

System tables:
- `auto_report_generation_log`
- `call_tags`, `call_alert_rules`, `call_alert_history`
- `notifications`
- `whitelabel_settings` (updated_by)
- `global_report_settings` (updated_by)
- `integration_configs` (updated_by)

## Shadow policies added
Owner-based policies are added for:
- Clients + client related tables (notes, files, reminders, scores, activities)
- Portfolio analysis reports
- Investment reports
- Cash flow analyses
- Report Q&A conversations/messages

These policies **do not restrict access yet** because the existing permissive `USING (true)` policies remain.

## Why this is safe
No existing policy is removed. All new policies are additive and allow `created_by IS NULL`
to avoid blocking legacy rows until backfilling is completed.

## Next steps (later stages)
- Backfill `created_by`/`updated_by` from session metadata.
- Remove permissive policies once ownership fields are populated.
