# Stage 6 RLS Readiness Audit

This audit inventories **write paths** and checks whether newly added ownership
fields are currently populated by the UI/edge functions. It is intended to
prevent breakage before permissive RLS policies are removed.

## Legend
- ✅ Ownership set in all observed write paths
- ⚠️ Ownership set in some paths only
- ❌ Ownership not set (will break if RLS is tightened)
- ℹ️ Service‑role or backend‑only (verify edge functions)

## Client domain tables

| Table | Ownership field | Status | Notes / write paths |
|------|------------------|--------|---------------------|
| clients | created_by | ⚠️ | **ExcelDropzone** sets `created_by`; other flows (AddClientModal, ClientVownetUpload, ClientBulkActions, PersonalDetailsManualEntry) do not. |
| client_properties | created_by | ❌ | Inserts in PropertyManualEntry, ClientVownetForms, ExcelDropzone do **not** set `created_by`. |
| client_employment | created_by | ❌ | Inserts in EmploymentManualEntry, ClientVownetForms, ExcelDropzone do **not** set `created_by`. |
| client_income | created_by | ❌ | Inserts in IncomeManualEntry, ClientVownetForms, ExcelDropzone do **not** set `created_by`. |
| client_assets | created_by | ❌ | Inserts in AssetManualEntry, ClientVownetForms, ExcelDropzone do **not** set `created_by`. |
| client_liabilities | created_by | ❌ | Inserts in LiabilityManualEntry, ClientVownetForms, ExcelDropzone do **not** set `created_by`. |
| client_expenses | created_by | ❌ | Inserts in ExpenseManualEntry do **not** set `created_by`. |
| client_scores | created_by | ❌ | Upsert in ClientScoreCard does **not** set `created_by`. |
| client_files | uploaded_by | ⚠️ | Set in ClientVownetUpload + ClientVownetForms; **missing** in ClientFiles upload flow. |
| client_notes | created_by | ❌ | Inserts in ClientNotes + ActiveClientCard do **not** set `created_by`. |
| client_reminders | created_by | ❌ | Inserts in ClientReminders do **not** set `created_by`. |
| client_tags | created_by | ❌ | Inserts in ClientTags do **not** set `created_by`. |
| client_tag_assignments | assigned_by | ❌ | Inserts in ClientTags do **not** set `assigned_by`. |
| client_activities | created_by | ℹ️ | No UI insert found; verify edge functions/logging flows. |

## Reports & analytics

| Table | Ownership field | Status | Notes / write paths |
|------|------------------|--------|---------------------|
| portfolio_analysis_reports | generated_by | ❌ | Insert in PortfolioAnalysisPDFGenerator does **not** set `generated_by`. |
| investment_reports | generated_by | ⚠️ | Some flows set `generated_by` (EnhancedInvestmentReportModal, InvestmentReportModal); others set `null` or use Supabase Auth user. |
| cash_flow_analyses | created_by | ❌ | Inserts in CashFlowAnalysisModal do **not** set `created_by`. |
| report_qa_conversations | created_by | ⚠️ | Updates/deletes from UI; creation appears via `report-qa` edge function. Verify it sets `created_by`. |
| report_qa_messages | created_by | ❌ | Inserts in ReportQA do **not** set `created_by`. |

## Automation / system

| Table | Ownership field | Status | Notes / write paths |
|------|------------------|--------|---------------------|
| auto_report_generation_log | created_by | ℹ️ | Written by edge functions (auto-report-sync/webhook/generate-investment-report). Verify if `created_by` is set. |
| call_tags | created_by | ❌ | Inserts in CallTagging do **not** set `created_by`. |
| call_alert_rules | created_by | ❌ | Inserts in CallAlerts do **not** set `created_by`. |
| call_alert_history | created_by | ❌ | Inserts in CallAlerts do **not** set `created_by`. |
| notifications | created_by | ℹ️ | Inserted by edge functions (generate-investment-report, send-email-reply, regenerate-report-qualitative). Verify `created_by` on insert. |

## Settings / config

| Table | Ownership field | Status | Notes / write paths |
|------|------------------|--------|---------------------|
| whitelabel_settings | updated_by | ❌ | Updates in WhiteLabelContext do **not** set `updated_by`. |
| global_report_settings | updated_by | ❌ | Updates in useGlobalReportSettings do **not** set `updated_by`. |
| integration_configs | updated_by | ❌ | Inserts/updates in Integrations page do **not** set `updated_by`. |

## Summary: what must change before removing permissive RLS
1. Add ownership fields in **all client‑domain inserts/updates**.
2. Ensure **report writes** set `generated_by`/`created_by` consistently.
3. Update **Call Alerts / Tags** writes to include `created_by`.
4. Update **Settings tables** writes to include `updated_by`.
5. Confirm edge functions write `created_by` where applicable (or rely on service role access explicitly).

Once those are in place and backfill has run, permissive policies can be removed
with minimal risk of breakage.
