
# Aurixa AML/CTF Tri-Portal — Implementation Plan

Additive compliance layer on top of the existing Command Centre, Client Portal and Finance Portal. **No existing feature is altered or removed.** All new surfaces sit behind a per-tenant `aml_ctf` feature flag (off by default), a new `aml_*` schema namespace, and dedicated permission keys — nothing ships to end users until the tenant explicitly activates it.

---

## 1. Guiding Principles (apply to every phase)

1. **Command Centre is the sole authoritative control plane.** Client Portal and Finance Portal read/write into the same `aml_*` case engine via edge functions; they never own AML decisions.
2. **Purely additive.** New tables in an `aml_*` namespace, new edge functions, new routes, new nav entries. Zero changes to existing tables' columns, RLS, or business logic beyond adding nullable FK references where needed.
3. **Tenant-aware from day one.** Every `aml_*` table carries `tenant_id`; RLS uses the existing `mission_control` / agency scoping pattern already in `finance_portal_*` and `pdf_import_*`.
4. **Feature-flagged.** New `feature_flags` row `aml_ctf` + per-module `dashboard_modules` entries; `ModuleGuard` gates every route. Off in production until the tenant's compliance officer accepts UAT.
5. **Reuse existing infra.** Auth (`useAuth`/portal session tokens), Storage (private buckets), Realtime, `invokeSecureFunction`, `finance-portal-audit` chain, Mission Control tokens for metered provider calls, brand tokens for UI, `agent-*` tables for AI reasoning.
6. **No legal auto-compliance claims** in any UI copy. All decisions require human approval; AI is advisory only.
7. **One phase at a time.** Each phase ends with: migration + rollback notes, RLS proof, automated tests, UAT screenshots, regression confirmation for non-AML surfaces, and flag still off.

---

## 2. Codebase Fit (where each phase attaches)

```text
Command Centre  → src/pages/aml/*                 new routes under /aml
                  src/components/aml/*            case workspace, queues, dashboards
                  DashboardSidebar.tsx            new "AML/CTF Compliance" group (flag-gated)
                  ModuleGuard                     new perm keys: aml.view / aml.investigate / aml.report / aml.configure
Client Portal   → src/pages/portal/PortalAML*.tsx guided wizard, doc centre
                  client-portal-aml edge fn       write-through to aml_* via portal session token
Finance Portal  → src/pages/finance-portal/*      Limited-status panel + finance-contribution form
                  finance-portal-aml edge fn      contribution + comparison only
Shared          → supabase/functions/_shared/aml/ policy engine, state machine, audit chain, provider adapters
                  aml_* schema (new tables only)  no changes to clients / purchase_files / user_roles
Governance      → reuses finance-portal-audit hash-chain pattern for aml_audit_events
Tokens          → Mission Control reserve→commit for every metered IDV/PEP/sanctions call
```

Existing tables touched (**additive only**): none altered. New nullable FK columns like `clients.aml_case_id` are added, defaulted null, never populated for legacy rows unless a case is opened.

---

## 3. Phased Delivery (0–14)

Phases 0–9 follow the source report verbatim. Phases 10–14 are drawn from the report's Contents (§15–17, §24) and executive summary since the parsed content ends at Phase 9.

### Phase 0 — Regulatory, Tenant & Product Configuration Foundation
- New Command Centre page: `Settings → AML/CTF Configuration` (Legal Entity, AUSTRAC enrolment, Designated Services, Governance, Program/Policy versioning, Providers, Branding, Permissions).
- Tables: `aml_tenants`, `aml_tenant_entities`, `aml_tenant_branches`, `aml_designated_services`, `aml_program_versions`, `aml_policy_versions`, `aml_tenant_branding`, `aml_feature_entitlements`, `aml_provider_configurations`.
- Locked mandatory-control flags (cannot be toggled off).
- Client/Finance portals: branding preview only; no active workflow.
- Acceptance: tenant provisioning, versioned config, mandatory locks, tenant isolation.

### Phase 1 — Core AML Data Foundation & Case Engine
- `aml_cases`, `aml_case_status_history`, `aml_case_assignments`, `aml_parties`, `aml_party_relationships`, `aml_tasks`, `aml_case_deadlines`, `aml_audit_events` (hash-chained), `aml_retention_schedules`, `aml_legal_holds`.
- State-machine helper in `_shared/aml/state-machine.ts` with allowed-transition map.
- Immutable audit-event writer reusing the `finance-portal-audit` SHA-256 chain pattern.
- Link (not duplicate) existing `clients.id` via `aml_cases.client_id` (nullable FK, no existing row mutation).
- Internal admin-only case inspector page; no user-facing UI yet.

### Phase 2 — Command Centre Module Shell & Role Controls
- Sidebar group "AML/CTF Compliance" with: Overview, Intake Queue, Customer Cases, Verification, Screening, Risk, Counterparty, Monitoring, Investigations, AUSTRAC Reporting, Governance, Configuration.
- ModuleGuard perms: `aml.view`, `aml.investigate` (restricted routes), `aml.report` (AUSTRAC hub), `aml.configure`.
- Step-up auth placeholder on restricted routes.
- Dashboard shell + intake queue + case-detail tabs (data still empty).

### Phase 3 — Client Portal AML Onboarding & Document Centre
- New routes: `/portal/aml/*` (landing, consent, purchasing structure, personal details, purchase profile, funding declaration, joint-purchaser invitation, document upload, review/submit).
- Tables: `aml_consents`, `aml_questionnaire_responses`, `aml_submission_versions`, `aml_document_requirements`, `aml_documents`, `aml_document_versions`, `aml_client_requests`.
- Prefill from existing `clients` fields but always require active user confirmation (never marked "verified").
- Client-safe statuses only — no risk/screening surfaced.
- Command Centre gets Send Invitation / Review Submission / Request Additional Info actions.

### Phase 4 — Identity Verification, PEP & Sanctions Integrations
- Provider-agnostic adapters under `_shared/aml/providers/` (IDV + screening); secrets via `add_secret`, never exposed to browser.
- Signed webhook receiver with idempotency + replay protection.
- Tables: `aml_identity_checks`, `aml_identity_documents`, `aml_screening_checks`, `aml_screening_matches`, `aml_match_resolutions`, `aml_provider_events`.
- Match-resolution queue in Command Centre; provider-outage fallback never returns false-pass.
- Mission Control token reserve→commit around every paid provider call.

### Phase 5 — Risk Engine, Mandatory Holds & Purchase-Ready Gate
- Tenant-configurable risk factors + thresholds; separate completion / verification / ML-TF outputs.
- Mandatory hold rules that override any numeric score.
- Approval + override workflow with senior-authority gating.
- Immutable decision snapshot; purchase-ready status becomes prerequisite for the existing property/engagement workflow (soft gate: additive check, feature-flag-guarded, off by default).
- Tables: `aml_risk_assessments`, `aml_risk_factors`, `aml_mandatory_triggers`, `aml_risk_overrides`, `aml_decisions`, `aml_approvals`, `aml_case_conditions`.

### Phase 6 — Companies, Trusts, SMSFs, Beneficial Owners & Representatives
- Extend party graph for organisations, trusts, partnerships, SMSFs, corporate trustees, nested ownership.
- Beneficial-owner identification tasks; authority docs + expiry.
- Visual ownership/control graph (Recharts/D3 within existing chart kernel).
- Tables: `aml_organisations`, `aml_trusts`, `aml_partnerships`, `aml_beneficial_owners`, `aml_representatives`, `aml_authorities`, `aml_entity_checks`.
- Client Portal gains conditional entity/trust branches and multi-party invitations.

### Phase 7 — Finance Portal Loan & Funding Integration
- New Finance Portal panel: **Limited AML Status** (status pill only, no restricted data).
- Finance contribution form: loan/lender/LVR/contribution/refi-equity/gift/SMSF-LRBA + doc refs. Writes to `aml_finance_comparisons`, `aml_finance_discrepancies`, `evidence_reference`.
- Command Centre gets "Finance Comparison" tab + discrepancy queue.
- Purchasing-entity change triggers mandatory reassessment event.
- **Reuses** existing `purchase_files` / `finance_portal_*` — no schema change to those tables, only new FK columns linking finance evidence to `aml_cases`.

### Phase 8 — Property Transaction, Seller/Counterparty CDD & Settlement Gates
- Trigger on accepted offer / signed contract from existing deal + purchase-file surfaces.
- New tables: `aml_transactions`, `aml_transaction_parties`, `aml_transaction_events`, `aml_counterparty_cases`, `aml_counterparty_requests`, `aml_counterparty_attempts`.
- Deadline calculator recalcs on settlement change with audit trail.
- Pre-settlement compliance gate blocks Finance Portal "unconditional/settlement" transitions when mandatory holds exist (additive check inside existing settlement runner — feature-flag-gated).

### Phase 9 — Ongoing CDD, Monitoring, EDD & Existing-Client Remediation
- Monitoring rules + event subscriptions off existing buyer/finance/transaction event streams.
- Rescreening + stale-verification jobs (pg_cron, same pattern as `finance-portal-automations-hourly`).
- EDD case + source-of-funds / source-of-wealth tasks; adverse-media provider abstraction.
- PRE_COMMENCEMENT classification + remediation queue for legacy clients.
- Tipping-off-safe customer templates.
- Tables: `aml_monitoring_rules`, `aml_monitoring_events`, `aml_alerts`, `aml_edd_cases`, `aml_source_of_funds`, `aml_source_of_wealth`, `aml_existing_customer_reviews`.

### Phase 10 — AUSTRAC Reporting & Submissions Hub (report §15)
- Restricted Command Centre route (`aml.report` perm + step-up).
- SMR, TTR, IFTI, Compliance/Annual Report drafters + receipt manager.
- Tables: `aml_reports`, `aml_report_versions`, `aml_report_submissions`, `aml_report_receipts`.
- Export bundles (PDF + JSON) signed and versioned; nothing auto-submits — human sign-off required.

### Phase 11 — Records, Privacy, Retention & Tipping-Off (report §16)
- Retention engine driven by `aml_retention_schedules` (dry-run scan first, mirroring PDF Import Retention pattern).
- Legal-hold enforcement across all `aml_*` and referenced storage objects.
- Privacy request handler (access/correction), tipping-off suppression rules across notifications + client-visible copy.
- Deletion review + authorised approval workflow — no physical deletion without approval.

### Phase 12 — White-Label & Multi-Tenant Commercialisation (report §17)
- Extend existing `brand_kits`/`whitelabel_settings` with AML terminology overrides (never overrides locked control names).
- Per-tenant provider selection + cost/failure metrics dashboard.
- Feature-entitlement matrix per tenant plan.

### Phase 13 — Security, Resilience, AI Boundaries & Governance
- Step-up auth enforcement, secret rotation runbook, backup/restore drill, provider-outage runbook.
- Aurixa Agent boundary: AI may summarise/suggest inside AML workspace but **cannot** advance case status, submit reports, or resolve matches — all such actions require human confirmation logged in `aml_audit_events`.
- Release-gate integration (mirroring PDF Import Phase 11D) with an `aml-release-gate` CLI + optional GitHub Action.

### Phase 14 — Launch, Operations & Change Management (report §24)
- Runbooks + SOPs (operator quick start, daily/weekly ops, escalation matrix, shift handoff — same template family as `docs/pdf-import/phase-11f-*`).
- End-to-end acceptance scenarios (report §22) executed as Playwright + Vitest suites.
- Traceability matrix + risk register (report §23).
- Progressive rollout: internal_dev_only → admin_limited → controlled_team_rollout → broad_production, gated per tenant.

---

## 4. Cross-Cutting Technical Details

- **Schema hygiene:** every `CREATE TABLE public.aml_*` migration ships with `GRANT`s (service_role always; authenticated where user policies apply; anon only for public share links) + RLS enable + policies in the mandated order.
- **RLS pattern:** `tenant_id = current_tenant()` + role check via existing `has_role()` security-definer function; restricted routes additionally require `has_role('aml_investigator'|'aml_reporter')` — new roles added to `app_role` enum.
- **Realtime:** `aml_cases`, `aml_tasks`, `aml_alerts`, `aml_counterparty_requests` added to `supabase_realtime` publication (queue live-updates).
- **Notifications:** reuse existing `notifications` + `client_portal_notifications` + `finance_portal_notifications`; add new `type` values guarded through `notifications_type_check`.
- **Storage:** private buckets `aml-documents`, `aml-reports` with signed-URL mediation via secure edge fn (mirrors `secure-storage-mediation`).
- **Tokens/billing:** Mission Control catalog gains AML meters (IDV check, PEP screen, sanctions screen, adverse media, report submission). Reserve→commit/cancel exactly as existing metered generators.
- **Audit chain:** reuse `_shared/finance-portal-audit.ts` pattern → `_shared/aml/audit.ts` with per-case prev_hash/row_hash chain + verify endpoint.
- **AI guardrails:** all Aurixa Agent AML actions traverse a new "aml_readonly" tool profile; write actions require `approval_required` in agent governance.
- **Testing:** each phase adds Vitest coverage for state machine + risk engine + policy resolvers, a Playwright end-to-end for the tri-portal happy path, and a regression sweep asserting non-AML routes render unchanged.
- **Rollback:** each migration has a paired `down` note in the phase doc; because everything is additive, rollback = drop new tables + remove new routes/edge fns + flip the flag off. No legacy data affected.

---

## 5. Deliverables Per Phase (fixed contract)

For every phase the ticket must include:

1. Files/components/edge functions changed (list).
2. Migration + rollback SQL.
3. RLS + permission proof (screenshot or SQL).
4. Automated test output (Vitest + Playwright).
5. Manual UAT screenshots for each portal touched.
6. Known limitations / deferred scope.
7. Confirmation that `feature_flags.aml_ctf` remains **off** in production until the tenant's compliance officer signs UAT.
8. Regression checklist proving Command Centre, Client Portal, and Finance Portal core flows behave identically.

---

## 6. What This Plan Explicitly Does Not Do

- Does not modify existing `clients`, `purchase_files`, `finance_*`, `client_portal_*`, `report_*`, or agent tables beyond adding nullable FKs.
- Does not claim regulatory compliance in UI copy; every screen carries "Configured to implement your approved AML/CTF program — not a substitute for legal advice."
- Does not auto-submit anything to AUSTRAC or auto-resolve any AML decision.
- Does not turn any feature on for existing tenants until they explicitly activate `aml_ctf`.
- Does not implement Phases 10–14 in detail beyond the sketch above; each will be re-scoped against the corresponding report section before we start building it, once the parsed source (pages 51+) is confirmed.

---

Ready to start on **Phase 0** on your go-ahead.
