# Finance Portal Audit — Execution Plan

Decisions captured from your answers:
- **Notes (#2)**: per-note visibility picker (Internal / Client / Finance / All), no default.
- **Messages (#4 v2)**: multi-target composer (Client, Finance Partner, Both, Internal note).
- **Client Inbox (#14)**: "cleanest + most optimized" — I'll build a unified per-client thread (chronological, channel chips for SMS/WhatsApp/Email/Portal/Note) **plus** a cross-client filterable list with unread/channel filters and a detail pane.
- **Lender Intelligence (#15)**: pull live lender + rate data from CC's lenders/bank rates tables; **remove Playbooks**.

---

## Phase 1 — Quick removals & renames (low risk, fast wins)
| # | Change |
|---|---|
| 3 | Remove **Assessment History** block from Finance Portal Borrowing Capacity tab. |
| 6 | Rename CC client "Activity" tab → **"Activity / Documents"**. |
| 15b | Delete **Playbooks** component + `LenderPlaybookCard` references. |
| 16 | Delete **Forecasting** route, sidebar item, and `/finance/forecasting` page (keep edge fn for now — used by daily-engagement goals). |
| 17 | Delete **Mobile Cockpit** route `/finance/mobile`, sidebar item, ScanToUpload/VoiceMemo standalone entries; keep voice memo invokable from QuickAddFab if you want — confirm during execution. |

## Phase 2 — Bug fixes (broken interactions blocking workflow)
| # | Fix |
|---|---|
| 8 / v2-8 | Secondary contact creation: capture & surface real error, then fix sync to `clients`/finance/client portals. |
| 9 | Messages tab "invalid session" — finance portal token not being attached on the per-client messages route. |
| 10 | New Purchase File creation failing — capture validation/edge errors, fix mandatory-field handling, surface destination in CC. |
| 11 | Pipeline Kanban refresh → blank/black screen, DnD broken. Fix `finance-portal-pipeline kanban_board` empty-state + DnD handlers, link refresh button. |
| 12 | New client creation (Finance Portal): fix internal error; on success notify CC + create matching `clients` row with `source = 'finance_portal'`. |
| 5 / v2-5 | Income tab save error in Finance Portal + dropdown/UI parity with CC; bidirectional sync via `client_employment` (single source of truth). |

## Phase 3 — Tri-portal sync foundations
| # | Change |
|---|---|
| 1 | Notifications: ensure all three portals subscribe to the same `notifications` channel(s); add missing trigger types (`message_sent`, `note_added`, `purchase_file_created`, etc.) to `notifications_type_check`; verify all relevant tables are in `supabase_realtime` publication. |
| 7 / v2-7 | Address 3-way sync: `purchase_files.property_address` ↔ `clients.address_*` ↔ client portal personal tab; surface latest address on CC Personal tab + Finance Portal Pipeline Kanban cards. |

## Phase 4 — Notes & Messages overhaul
| # | Change |
|---|---|
| 2 | CC notes get a **visibility picker** chip (Internal / Client / Finance / All). Default = unselected (forces choice). Backend: extend `client_notes.visibility` enum + RLS-style filtering in the read edge fns for client-portal and finance-portal. |
| 4 / v2-4 | Unified message composer in CC: target chips (Client / Finance / Both / Internal). Single send fans out to `client_portal_messages` and/or `finance_portal_thread_messages`. Fix "invalid session" on Finance Portal side (token resolver). Fix client-portal compose UI not persisting (state reset on send). Wire notifications + bell icon for outbound. |

## Phase 5 — Client Inbox revamp (#14)
- **Per-client thread**: chronological merge of SMS / WhatsApp / Email / Portal / Internal-note rows with channel chips, unread badge, reply composer pre-selecting last channel.
- **Cross-client `/finance/client-inbox`**: left rail = clients ordered by last activity, channel filters (All/SMS/WA/Email/Portal), unread toggle, search. Right pane = the per-client thread.
- Data: aggregate from `finance_outbound_messages`, `client_portal_messages`, `finance_portal_thread_messages`, GHL conversation cache (already mirrored).

## Phase 6 — Lender Intelligence rebuild (#15) + Export UX (#13)
- **Lender Intelligence**: replace stub with a comparison table sourced from `lenders` + `bank_lending_rates` (already in CC). Inputs: loan amount, LVR, product type → ranked list with rate, comparison rate, fees, turnaround (from `lender_submissions` aggregate). Remove Playbooks card entirely.
- **#13 Export UX**: rename "Export finance portal clients for GHL" → "Export Clients (CSV)". Replace per-field dropdowns with **fixed labelled checkboxes** (First name, Last name, Email, Phone, Tags, Source). Live row-count + column-count updates on toggle. CSV writer honours selected columns only.

---

## Technical scaffolding
- Migrations: `client_notes.visibility` enum widen; `notifications_type_check` add types; `purchase_files.property_address` propagation trigger; ensure realtime publication coverage.
- Edge fn touches: `finance-portal-messages`, `finance-portal-client-comms`, `client-portal-messages`, `manage-clients`, `manage-client-employment`, `finance-portal-pipeline`, `finance-portal-lender-intelligence`, `finance-portal-borrowing`, `finance-portal-batch6/7/9-10`, plus new `finance-portal-unified-inbox` aggregator.
- Frontend touches (~25 files): sidebar/router, BorrowingCapacityTab, NotesPanel + composer, MessagesThread + composer, ClientInbox, LenderIntelligence page, ExportDialog, KanbanBoard, ClientCreateDialog, SecondaryContactDialog, IncomeTab, NewPurchaseFileDialog, ClientDetailsModal tab labels.

## Out of scope (flagging now)
- v2-7 mentions Kanban should populate **address**: I'll add it to the card render, but the data root is the existing `purchase_files.property_address`.
- Voice memo persistence (#17 partial): being removed with Mobile Cockpit anyway.

## Delivery order
I'll commit per phase so each is reviewable. Phases 1–2 first (fastest visible wins + unblockers), then 3, then 4, then 5, then 6. After phase 1 lands, I'll proceed straight into phase 2 unless you stop me.

Approve to proceed.
