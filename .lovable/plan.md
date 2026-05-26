
# Finance Portal v2 — Deal Execution System

## Vision

Today's portal answers *"Who are my clients?"*. v2 must answer:
*"Which clients are ready to buy, which files are at risk, what's missing, what milestone are we at, what's next?"*

The structural shift: **Client → Finance File → Purchase File (Deal Room)**. A client can have many purchase files over time; each is a self-contained workflow that mirrors the real acquisition journey and syncs back into Command Centre.

This is a large body of work. The plan below scopes it into 5 phases, prioritising the items the user nominated as MVP (§21 in the brief) and explicitly deferring nice-to-haves so we can ship value fast without overbuilding.

---

## Phase 1 — Foundation: Purchase Files + Finance Status (MVP core)

The single biggest unlock. Everything else hangs off this.

**Data model (new tables)**
- `purchase_files` — one row per acquisition. Belongs to a client. Fields: purchase_type (existing / OTP / H&L / land / build / dual-occ / SMSF / commercial / refinance), property_address, purchase_price, deposit, settlement_date, status, finance_status, assigned finance partner, assigned NPC consultant, lender, max_approved_budget, risk_level, archived_at.
- `purchase_file_critical_dates` — typed date rows (offer, contract, cooling-off, finance clause, B&P, deposit due, valuation due, loan approval target, settlement) with status (on_track / due_soon / overdue).
- `purchase_file_status_history` — append-only audit of finance_status transitions.
- Extend `client_finance_status` enum: not_started, docs_requested, docs_received, in_review, pre_approved, purchase_specific_review, application_lodged, conditional_approval, valuation_pending, valuation_returned, unconditional_approval, ready_for_settlement, settled, at_risk.

**Edge functions**
- New `finance-portal-purchase-files` (list / get / create / update / archive) — RLS-mediated via the same OR-merge permission resolver already shipped for global permissions. Add `purchase_files` to `ALLOWED_TABLES`.
- New permission scopes added to the matrix: `view_purchase_files`, `edit_purchase_files`, `set_finance_status`, `set_green_light`.

**UI**
- New finance-portal route **Active Purchase Files** (sidebar entry above "My Clients"). Card list grouped by status with urgency colour coding.
- Purchase File detail page = the **Deal Room** shell (tabs scaffolded but only Overview + Critical Dates filled in this phase).
- Client profile gets a new **Purchase Files** tab listing all files for that client.
- Command Centre: mirror page under `ClientDetailsModal` so internal staff see the same files and can create/edit them. Realtime publication added.

**Why first:** unblocks every later phase. Without a purchase-file entity there is nowhere to attach conditions, valuations, green lights, or critical-date alerts.

---

## Phase 2 — Document Matrix + Request-from-Client

Replaces the "upload anything" vault with a structured checklist.

- New table `document_requirements` (template rows per purchase_type) and `document_requirement_instances` (per purchase_file, with status: required / requested / uploaded / verified / expired, owner, visibility flags for finance / legal / NPC / client, expiry_date, notes).
- Document upload UI changes from a flat list into category groups (Identity, Income, Self-employed, Bank statements, Existing loans, Assets, Liabilities, Purchase docs, Deposit proof, Valuation, Loan approval, Settlement).
- "Request documents from client" action: finance partner ticks needed items → triggers existing notification + Web Push pipeline → client portal shows pending requests on dashboard.
- Verification toggle (finance partner only).
- Reuses existing `secure-storage-mediation` pattern — no new bucket policies needed.

---

## Phase 3 — Finance Green Light + Conditions + Valuation Trackers

The three trackers that make a file auditable.

**Green Light**
- New table `purchase_file_finance_decisions` — one row per decision event. Outcome enum: green_light / proceed_with_caution / not_suitable / need_more_info / subject_to_valuation / subject_to_lender_review / subject_to_equity / subject_to_deposit. Includes rationale, decided_by, decided_at. Latest row surfaces as the "current finance position" on the Deal Room overview.
- Big button on Deal Room → modal capturing property snapshot (price, rent, client contribution) + outcome + notes.

**Conditions tracker**
- `purchase_file_conditions` — title, owner (client / NPC / broker / legal), status (pending / in_progress / uploaded / satisfied / waived), due_date, linked document, notes.
- Auto-generated checklist when `finance_status` flips to `conditional_approval` (via DB trigger) using a per-lender template (lender templates added in Phase 5; defaults used until then).

**Valuation tracker**
- `purchase_file_valuations` — ordered_date, valuer, agent_contact, access_required, returned_date, contract_price, valuation_result, shortfall, risk_level, next_action, status.

All three render as collapsible cards inside the Deal Room. Each writes to `purchase_file_status_history` so the activity log gets it for free.

---

## Phase 4 — Operational Dashboard + Client List Upgrades

Make day-to-day work obvious.

**Dashboard widgets** (replace current "Recent clients" block, keep account-status card)
- Finance files requiring action
- Approvals due this week
- Documents pending (count + drill-down)
- Valuations pending
- At-risk files (red ribbon)
- Settlements upcoming (7 / 14 / 30 day toggle)
- Broker response required (where NPC is waiting)

Implemented via a single new edge function `finance-portal-dashboard-metrics` returning all widget data in one round-trip.

**My Clients table** — add columns: Finance status, Active purchase file, Max approved budget, Lender, Next deadline, Last activity, Risk flag, Assigned NPC consultant. New sort modes: Urgency, Settlement date, Finance clause expiry, Missing documents, Recently updated, Risk level.

**Client detail tab reorg** to match the brief (Profile / Finance Snapshot / Income / Expenses / Assets / Liabilities / Purchase Files / Documents / Notes & Activity). Existing tab content is moved, not rewritten.

---

## Phase 5 — Notes split, Activity log, Risk register, Borrowing snapshot, Commission linkage, Automations

Polish + accountability layer.

- **Notes** — add `visibility` enum on existing notes table (`shared` vs `internal_npc`). Finance portal only ever sees `shared`.
- **Activity log** — already half-built via `purchase_file_status_history`; broaden into `purchase_file_activity` capturing document uploads, decisions, condition updates, date changes, message events. Renders as a unified timeline on the Deal Room.
- **Risk register** — `purchase_file_risks` (category, severity, owner, due_date, resolution_note). Top 3 risks shown on Deal Room header.
- **Borrowing capacity snapshot** — small editable card on the client's Finance Snapshot tab; manual entry now, hook into existing borrowing-capacity engine later.
- **Commission linkage** — extend `commissions` with `purchase_file_id` and `milestone` (referred / lodged / approved / settled / statement_received / paid). Earnings page groups by file.
- **Automation triggers** — pg_cron + existing notification dispatcher:
  - Missing docs >48h → reminder
  - Finance clause T-5 / T-2 → alert + escalation
  - Valuation not returned >3d → follow-up task
  - Conditional approval received → auto-generate conditions checklist
  - Unconditional uploaded → notify legal + NPC
  - Settlement T-7 → readiness checklist
  - File marked settled → post-settlement workflow

**Explicitly deferred (mentioned in brief, not built yet)**
- Legal partner portal (§12) — schema designed so roles can be added later; no UI built.
- Per-lender condition templates (only defaults in Phase 3).
- Builder / PM / developer portals.

---

## Cross-cutting concerns

- **Permissions** — every new scope plugs into the existing OR-merge resolver (`mergePermissions`) so the global-permissions work from the previous turn keeps working unchanged.
- **Realtime** — all new tables added to `supabase_realtime` publication per project standards.
- **Notifications** — extend `notifications_type_check` with new types (purchase_file_*, condition_*, valuation_*, finance_decision_*). Reuse Web Push dispatcher.
- **Naming** — Australian English, "Postcode", `smartCapitalize` on all rendered names.
- **Theme** — semantic tokens only (dark-gold), no hardcoded colours.
- **No business-logic regressions** — Phase 1 ships behind the existing nav; old "My Clients" page stays intact until Phase 4's reorg.

---

## Build order recap (matches brief §21)

```text
Phase 1 → Purchase Files + Finance Status + Critical Dates
Phase 2 → Document Matrix + Request-from-Client
Phase 3 → Green Light + Conditions + Valuation trackers
Phase 4 → Dashboard widgets + Client list/detail reorg
Phase 5 → Notes split, Activity log, Risk register, Borrowing snapshot, Commissions, Automations
```

## What I recommend we do right now

Approve **Phase 1** and I'll start with the migration (new tables + enums + RLS + realtime), then the edge function, then the Active Purchase Files page and Deal Room shell with Critical Dates. Each subsequent phase will be its own approval so we can adjust scope as you see it land.
