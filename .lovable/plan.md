# GHL Account Migration — Implementation Plan
**Old GHL → New GHL (post-ejection data restoration & forward-push)**

_Last updated: 2026-04-25_

---

## 0. Context & Problem Statement

We've ejected from the previous GHL sub-account into a new, fully-owned GHL account. During the ejection, **the old account's data became inaccessible from the GHL UI** and is non-recoverable on GHL's side.

However, because this dashboard has been continuously caching GHL data via webhooks, cron syncs, and proxy functions, **we are the system of record** for a large portion of historical data. The new GHL account already has:

- ✅ Contacts (manually re-imported)
- ✅ Pipelines (manually re-created)
- ✅ Opportunities (manually re-created — but **stage placement is wrong / inconsistent**)

What still needs to be migrated **from our cache → into the new GHL account**:

| Asset | Volume in Cache | Source of Truth |
|---|---|---|
| Opportunity stage placements | 118 cached opps across 8 stages | `ghl_client_opportunities` |
| Client notes | 171 notes (170 with old GHL note IDs) | `client_notes` |
| Conversations (SMS/email/etc) | 513 threads / 7,182 messages | `ghl_conversations` + `ghl_conversation_messages` |
| Calendar appointments (historical) | 5 cached secondary recipients only — **gap** | `appointment_secondary_recipients` (sparse) |

What was **never cached** and must be pulled fresh from the old GHL account (if any access remains) or rebuilt manually:

- ❌ Automation workflows
- ❌ Funnels
- ❌ Forms
- ❌ Quizzes
- ❌ Calendar definitions (slots, availability rules)
- ❌ Full appointment history (only 5 secondary-recipient rows exist)

---

## 1. Guiding Principles

1. **Idempotent everything.** Every migration step must be safely re-runnable. We track status per-row, never assume a clean slate.
2. **Dry-run first, write second.** Each phase has a `--dry-run` mode that produces a diff report before any GHL write happens.
3. **Cache-first writes.** We push from our DB → new GHL, then store the new GHL ID back on our row. Never the other way around during migration.
4. **Rate-limited & resumable.** GHL's API limits (~100 req/10s burst, 200k/day). We batch with backoff and persist `migration_cursor` so a crash resumes cleanly.
5. **Audit trail.** Every write logs: old_ghl_id → new_ghl_id, timestamp, operator, payload hash. Stored in a new `ghl_migration_log` table.
6. **No destructive ops on cache.** The dashboard cache is the system of record until migration is verified complete. We do not delete or overwrite cached rows.
7. **Two-way sync stays paused** during migration to prevent race conditions with the existing webhook/cron infrastructure.

---

## 2. Architecture — Migration Control Plane

### 2.1 New tables (single migration)

```
ghl_migration_runs
├─ id, run_type (opportunities|notes|conversations|appointments|workflows|...)
├─ status (pending|running|paused|completed|failed)
├─ dry_run boolean
├─ started_at, completed_at, started_by
├─ total_items, processed, succeeded, failed, skipped
├─ cursor jsonb           -- resumability checkpoint
└─ summary jsonb          -- final report

ghl_migration_log
├─ id, run_id → ghl_migration_runs
├─ entity_type, entity_id (our internal UUID)
├─ old_ghl_id, new_ghl_id
├─ action (create|update|skip|error)
├─ status_code, response_body jsonb
├─ payload_hash text
├─ error_message
└─ created_at

ghl_id_remap
├─ entity_type           -- 'contact' | 'opportunity' | 'pipeline' | 'stage' | 'conversation' | 'message' | 'note' | 'appointment' | 'calendar'
├─ old_ghl_id (PK part)
├─ new_ghl_id
├─ mapped_at, mapped_by, confidence ('exact'|'fuzzy'|'manual')
└─ notes
```

`ghl_id_remap` is the **Rosetta Stone** of the migration. Before any push, we resolve old IDs → new IDs through this table. It's populated by:
- Bulk import of the manual contact/pipeline re-import (CSV from GHL or API scrape of new account)
- Fuzzy matching pass (email + phone normalization for contacts; name + position for stages)
- Manual reconciliation UI for ambiguous matches

### 2.2 New edge functions (small, focused, named consistently `migrate-ghl-*`)

| Function | Purpose |
|---|---|
| `migrate-ghl-bootstrap` | Pulls new-account contacts/pipelines/stages → seeds `ghl_id_remap` |
| `migrate-ghl-opportunities` | For each cached opp, finds its new contact + stage, PATCHes the opp into correct stage |
| `migrate-ghl-notes` | For each `client_notes` row, POSTs a note to the new contact, stores `new_ghl_id` |
| `migrate-ghl-conversations` | Two modes: (a) re-create conversation thread metadata; (b) append messages as inbound/outbound history |
| `migrate-ghl-appointments` | Re-creates calendar events from cached data into matching new-account calendars |
| `migrate-ghl-control` | Single orchestrator — accepts `{phase, mode: dry-run\|execute, batch_size, resume}` and dispatches |

All follow our standard auth + CORS + rate-limit pattern (per `mem://auth/edge-function-cors-and-auth-standard`).

### 2.3 Admin UI — Migration Console (`/admin/ghl-migration`)

A single page with one card per phase:

```
┌────────────────────────────────────────────────────┐
│ Phase 2 — Opportunities (118 cached)               │
│ ─────────────────────────────────────────────────  │
│ Last run: 2026-04-25 14:02 UTC (dry-run)           │
│ Matched: 116 / 118   Unresolved: 2                 │
│                                                    │
│ [ View Diff ]  [ Run Dry-Run ]  [ Execute ]        │
│ [ Resume ]  [ Reconcile Unresolved (2) ]           │
└────────────────────────────────────────────────────┘
```

Real-time progress via realtime subscription on `ghl_migration_runs.processed`.

---

## 3. Phased Execution Plan

### **Phase 0 — Prep & Safety** (½ day)

1. **Pause incoming GHL writes.** Disable cron jobs (`conversation-sync-cron`, `ghl-conversations-cron`, `email-sync-cron` for GHL channel) and webhook receiver writes (queue-only mode — log incoming webhooks to a side table for replay, don't process them).
2. **Snapshot.** `pg_dump` of all `ghl_*`, `client_notes`, `clients`, `appointment_secondary_recipients` to cold storage. (One-line note in admin console.)
3. **Confirm new-account API key** is in secrets (`GOHIGHLEVEL_API_KEY_NEW`, `GOHIGHLEVEL_LOCATION_ID_NEW`). Old key stays as `GOHIGHLEVEL_API_KEY_OLD` for any read-only repair operations.
4. **Deploy migration tables + functions** (no behaviour change yet, just infra).

### **Phase 1 — Build the Rosetta Stone** (1 day)

`migrate-ghl-bootstrap` runs against the new account:

- `GET /contacts/` (paginated) → match to our `clients` rows by:
  1. Exact email match (case-insensitive, normalized)
  2. Exact phone match (E.164 normalized)
  3. Manual reconciliation queue for the rest
- `GET /opportunities/pipelines` → match by name to our `ghl_pipelines` rows (case-insensitive)
- For each pipeline, match stages by **name + position** to our `ghl_pipeline_stages`
- Write all matches into `ghl_id_remap`

**Output:** A coverage report — "732 contacts in cache → 728 matched in new account, 4 unresolved." User reconciles unresolved entries in UI before proceeding.

### **Phase 2 — Opportunity Stage Repair** (½ day execute)

This is the **first real write phase** and the highest immediate-value fix.

For each row in `ghl_client_opportunities`:

```
1. Resolve client_id → new contact_id via ghl_id_remap (or via clients.email)
2. Resolve cached stage_id → new stage's GHL id via ghl_id_remap
3. Search new account for opportunity on that contact in matching pipeline:
   GET /opportunities/search?contactId=X&pipelineId=Y
4. If found:
     If current stage ≠ desired → PATCH /opportunities/{id} { pipelineStageId: NEW }
     Else → skip (already correct)
   If not found:
     POST /opportunities/ to create it (using cached opportunity_name, monetary_value, status)
5. Log every call to ghl_migration_log
6. Update ghl_client_opportunities.ghl_opportunity_id with the new ID
```

**Dry-run output** = a CSV: client name, pipeline, current new-account stage, desired stage, action (move/create/skip).

### **Phase 3 — Notes Migration** (½ day, throttled)

171 notes total. Push to new account:

```
For each client_notes WHERE ghl_note_id IS NOT NULL (170 rows):
  contact_id = resolve(client_id) via ghl_id_remap
  POST /contacts/{contact_id}/notes { body: content, userId: created_by_mapped }
  → store returned id as ghl_note_id_new (new column)
  → mark sync_status = 'migrated'
```

We do **not** delete the old `ghl_note_id` — we add `ghl_note_id_new` for traceability. After migration completes & is verified, a cleanup migration renames `ghl_note_id_new` → `ghl_note_id`.

Throttle: 5 req/sec, ~6 minutes total.

### **Phase 4 — Conversations & Messages** (1–2 days, the heaviest phase)

This is the trickiest phase because **GHL doesn't expose a public API to inject historical messages with custom timestamps into a conversation thread.** Two viable approaches:

#### Option A — "Synthetic History" via Notes (recommended)
For each cached conversation, POST a single rich-text note to the contact summarizing the thread, with full message history formatted as:

```
=== SMS THREAD (migrated 2026-04-25) ===
[2024-08-12 14:33 inbound]  "Hi, calling about the property…"
[2024-08-12 14:35 outbound] "Thanks for reaching out…"
…
```

Plus attach the raw message JSON as a downloadable attachment if GHL note attachments are supported. **Pros:** preserves all data, searchable in GHL UI. **Cons:** not a "live" thread.

#### Option B — Custom Object / Custom Field
Push the thread JSON into a custom field on the contact (`migrated_conversation_history`). **Pros:** machine-readable. **Cons:** invisible to support staff in normal GHL views.

#### Option C — Inbound message replay (NOT recommended)
GHL `POST /conversations/messages/inbound` accepts historical messages but timestamps to "now" — would corrupt timeline.

**Recommendation: do A + B.** The note is for humans, the custom field is for machines. Both are reversible.

Throttle: 3 req/sec (513 conversations ≈ 3 min).

### **Phase 5 — Appointments & Calendars** (1 day)

Our cache here is **thin** (5 secondary-recipient rows, no full appointments table). So this phase is mostly about:

1. Pulling whatever fragments we have (`appointment_secondary_recipients`, plus any leftover GHL-keyed data on clients).
2. For each, resolving contact + calendar (calendar match by name in `ghl_id_remap`).
3. POSTing as historical events via `POST /calendars/events/appointments`.
4. Producing a "missing appointments" report for the user to manually fill any critical gaps.

Realistically, this is a **best-effort phase** — we should set the user's expectation that historical bookings will be sparse.

### **Phase 6 — Workflows / Funnels / Forms / Quizzes — manual rebuild + tooling** (timeline depends on volume)

These were never cached. Two parallel tracks:

**Track A — Last-chance pull from old account (if any read access remains).**
Build a one-shot edge function `salvage-old-ghl-assets` that:
- Lists all workflows: `GET /workflows/`
- Lists all funnels: `GET /funnels/`
- Lists all forms / surveys: `GET /forms/`, `GET /surveys/`
- Dumps each as JSON to a new `ghl_legacy_assets` table for offline reference

If we have even temporary read-only access via the old API key, this is **the highest-priority salvage operation** and should run first, in parallel with Phase 0. **Run before old API key access is fully revoked.**

**Track B — Reconstruction guide.**
The dumped JSON is not directly importable into another GHL account (GHL has no native import API for these). We provide the user a **reconstruction console** that displays:
- Side-by-side: old asset JSON | new GHL UI deep-link
- Checklist of required fields, triggers, actions
- Export-as-markdown for handing to a VA to recreate

### **Phase 7 — Cutover & Resume Live Sync** (½ day)

1. Verify all migration runs status = `completed`, failed = 0 (or all failures triaged).
2. Update `GOHIGHLEVEL_API_KEY` secret → point to new account (drop the `_NEW` suffix).
3. Re-enable webhook processing & cron syncs.
4. Replay queued webhooks captured during Phase 0 (with dedupe via `ghl_id_remap`).
5. Run a 24-hour shadow-monitoring window — log any drift between cache and new GHL.
6. Archive `ghl_id_remap` and migration tables (don't drop — keep for forensic).

---

## 4. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Old API key revoked before workflow salvage | High | High | Run Phase 6 Track A in parallel with Phase 0 |
| Contact match ambiguity (same email, different person) | Medium | Medium | Manual reconciliation UI; dry-run reports |
| GHL rate-limit lockout mid-run | Medium | Low | Token bucket; resume from cursor |
| Duplicate opportunities created if search misses existing | Medium | High | Dual lookup (contactId + name fuzzy) before create |
| Webhook race during cutover | Low | Medium | Queue-only mode in Phase 0; replay with dedupe |
| Note ordering lost in GHL UI (no createdAt override) | High | Low | Embed original timestamp in note body |
| Conversation history not displayed natively | High | Medium | Option A+B hybrid; clearly label migrated content |

---

## 5. Open Questions for User

Before any implementation, confirm:

1. **Old API key access** — do we still have any working credentials for the old GHL sub-account? (Determines Phase 6 Track A viability and urgency.)
2. **Conversation strategy** — Approve Option A+B (note + custom field) for conversation history? Or is Option B alone sufficient?
3. **Match confidence threshold** — for fuzzy contact matching, auto-accept exact email/phone matches, or queue everything for manual review?
4. **Workflow rebuild scope** — how many active workflows existed? (Drives whether we need the reconstruction console or whether the user will rebuild from memory.)
5. **Cutover window** — preferred maintenance window for Phase 7? (Affects when we pause webhooks.)

---

## 6. Effort & Sequencing Summary

| Phase | Duration | Blocking | Can run parallel with |
|---|---|---|---|
| 0 — Prep | ½ day | — | 6A salvage |
| 1 — Rosetta Stone | 1 day | 0 | 6A salvage |
| 2 — Opportunities | ½ day | 1 | — |
| 3 — Notes | ½ day | 1 | 2 |
| 4 — Conversations | 1–2 days | 1 | 3 |
| 5 — Appointments | 1 day | 1 | 4 |
| 6A — Salvage | ½ day | API access | 0, 1 |
| 6B — Rebuild console | 2–3 days | 6A | any |
| 7 — Cutover | ½ day | 2,3,4,5 | — |

**Critical path: ~6 working days** (excluding 6B reconstruction work, which is human-bound).

---

## 7. Next Step (awaiting approval)

Answer the 5 open questions in §5. Once confirmed, first deliverable is the database migration for the three new control-plane tables (`ghl_migration_runs`, `ghl_migration_log`, `ghl_id_remap`) plus the `migrate-ghl-bootstrap` function — **no destructive ops, no GHL writes yet.** Everything from there gates on dry-run reports.
