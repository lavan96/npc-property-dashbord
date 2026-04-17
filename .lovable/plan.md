# Batches 7D + 7E — Combined Plan

Sequential build: **7D first → then 7E**. Each batch ships DB migrations, edge functions, hooks, and UI together. You approve each migration before code lands.

---

## 🏦 Batch 7D — Lender Integrations (Full Suite)

Combines: CDR rates polish + broker pipeline + full submission portal + comparison sheets.

### 7D.1 — Database
**New tables**
- `lender_favourites` — `(user_id, lender_id, lender_name, notes)` — broker's pinned lenders.
- `lender_rate_alerts` — `(user_id, lender_id, threshold_rate, loan_purpose, repayment_type, lvr_band, last_triggered_at, is_enabled)` — push alert when a tracked lender drops below threshold.
- `lender_submissions` — main submission record:
  - `client_id`, `deal_id`, `lender_id`, `lender_name`, `product_name`, `loan_amount`, `lvr`, `interest_rate`, `comparison_rate`, `loan_purpose`, `repayment_type`, `loan_term_years`
  - `status` (`draft`, `pre_assessment`, `submitted`, `conditional_approval`, `unconditional_approval`, `loan_docs_issued`, `settled`, `declined`, `withdrawn`)
  - `submitted_at`, `assessed_at`, `approved_at`, `settled_at`, `decline_reason`
  - `assigned_broker_id`, `external_reference`, `notes`
- `lender_submission_documents` — `(submission_id, doc_type, doc_name, status [required|received|verified|waived], storage_path, uploaded_at, verified_by)`
- `lender_submission_timeline` — `(submission_id, event_type, event_label, actor_id, payload jsonb, created_at)` — auto-populated by trigger on status change.
- `lender_comparison_sheets` — `(deal_id, name, lender_ids[], rate_snapshot jsonb, created_by, shared_with_client bool)` — saved side-by-side comparisons attachable to a deal.

**Triggers / functions**
- `trg_lender_submission_status_change` → writes timeline + creates `notifications` row + (if mapped) calls `sync-client-to-ghl` to advance pipeline stage.
- `trg_lender_rate_alert_check` on `bank_lending_rates_cache` update → enqueue alert via `pg_net` to `send-web-push` for matching `lender_rate_alerts`.

**RLS:** strict `service_role`-only (per project standard). Add all 5 tables to `ALLOWED_TABLES` whitelist + `supabase_realtime` publication.

### 7D.2 — Edge Functions
- `manage-lender-favourites` — list/add/remove favourites.
- `manage-lender-submissions` — CRUD + status transitions (validates allowed transitions, writes timeline, triggers GHL sync).
- `manage-submission-documents` — list/upload/verify/waive; uses `secure-storage` bucket `lender-docs`.
- `manage-comparison-sheets` — create/save/share comparison snapshots; can render a client-portal-visible PDF.
- Extend `cdr-lending-rates-service` with `check-alerts` action invoked nightly via `pg_cron`.

### 7D.3 — UI
- **`/lenders` hub** (replaces basic rates view):
  - Favourites strip (pinned lenders + lowest rate)
  - "Best rate today" leaderboard with filters
  - Alert manager (set threshold, lender, purpose)
- **Deal detail → "Lender Comparison" tab**: pick 2–4 lenders, snapshot rates, save sheet, optionally publish to client portal.
- **Deal detail → "Submission" panel**: status pipeline (kanban-style), documents checklist with upload/verify, timeline feed, decline reason capture.
- **Client portal** (read-only): submission status + outstanding documents list (uses existing portal auth).
- **`LenderCombobox`** — extend to read favourites first, then full list.

### 7D.4 — Notifications & GHL
- Add `lender_submission_status` and `lender_rate_alert` to `notifications_type_check` enum.
- Map submission stages → GHL pipeline stages in `ghl-webhook-receiver` (reuse existing pipeline sync architecture).

---

## 💰 Batch 7E — Commission, Compliance, Reporting, Document Automation

Combines all four focus areas.

### 7E.1 — Database
**Commission**
- `commission_ledger` — `(deal_id, submission_id, lender_id, type [upfront|trail|bonus], gross_amount, broker_split_pct, broker_amount, aggregator_fee, gst_amount, net_amount, expected_date, received_date, status [forecast|invoiced|received|reconciled], reference)`.
- `commission_payouts` — `(broker_id, period_start, period_end, total_gross, total_net, status, paid_at, payment_reference)`.

**Compliance**
- `compliance_records` — `(client_id, type [bid|fact_find|preliminary_assessment|credit_guide|privacy_consent|fha], version, content jsonb, generated_at, signed_at, signed_pdf_path, signature_method [docusign|wet|portal_consent], status)`.
- `compliance_versions` — append-only history (immutable trigger blocks UPDATE/DELETE on rows older than current).
- `compliance_pack_exports` — `(client_id, generated_by, included_records[], pdf_path, generated_at)`.

**Document automation**
- `document_templates` (extend existing): add `template_type` enum (`loan_application`, `supporting_docs_cover`, `bid`, `credit_guide`, `cost_disclosure`, `consent_form`).
- `generated_documents` — `(client_id, deal_id, submission_id, template_id, template_type, status [draft|generated|sent|signed|voided], docusign_envelope_id, pdf_path, sent_to[], audit jsonb)`.
- `document_signature_events` — webhook capture from DocuSign (extends existing agency_agreements pattern).

**Analytics** (views, not tables)
- `vw_pipeline_funnel` — counts per stage per period.
- `vw_lender_mix` — submission share + approval rate per lender.
- `vw_broker_scorecard` — submissions, approvals, settlements, avg time-to-settle, commission YTD.
- `vw_revenue_dashboard` — forecast vs received commission rolled up monthly.

### 7E.2 — Edge Functions
- `manage-commission-ledger` — CRUD, auto-forecast on submission `submitted` event, reconcile on `settled`.
- `generate-commission-payout` — period close, generates payout PDF.
- `manage-compliance-records` — versioned writes (always inserts new version).
- `generate-compliance-pack` — bundles latest versions of selected record types into single signed PDF (premium dark-gold style per project standard).
- `generate-loan-document` — renders templates with client+deal+submission data into PDF, optionally posts to DocuSign.
- `docusign-webhook` — captures signature events into `document_signature_events`.
- `analytics-query` — read-only proxy over the four views, gated by role.

### 7E.3 — UI
- **`/commissions` page**:
  - Ledger table with filters (broker, lender, status, period)
  - Forecast vs received chart
  - Payout generator (period picker → PDF)
- **Client detail → "Compliance" tab**:
  - Records list with versions, status badges
  - One-click "Generate Compliance Pack" → PDF
  - DocuSign send / re-send
- **Client/Deal detail → "Documents" tab**:
  - Template picker → preview → generate → send for signature
  - Status tracking with signature events
- **`/reports/analytics` dashboard** (admin/broker scoped):
  - Pipeline funnel
  - Lender mix donut + approval rate bar
  - Broker scorecard table
  - Revenue dashboard with forecast/received split

### 7E.4 — Integrations & Permissions
- Reuse existing DocuSign envelope pattern from `agency_agreements`.
- All new pages registered in `dashboard_module_registry` with permissions; analytics dashboard restricted to admin + manager roles.
- Realtime publication for `commission_ledger`, `generated_documents`, `compliance_records`.

---

## Sequencing & Approvals

1. **7D.1 migration** (await approval) → 7D.2 edge functions → 7D.3 UI → 7D.4 wiring → verify.
2. **7E.1 migration** (await approval) → 7E.2 edge functions → 7E.3 UI → 7E.4 wiring → verify.
3. Each migration ships in a single approval; each batch ends with a smoke test pass.

**Estimated touch:** ~14 new tables/views, ~12 edge functions, ~18 UI components/pages across both batches.

Reply **"approved"** to start with the 7D.1 migration.
