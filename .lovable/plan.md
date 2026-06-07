# Finance Portal Audit — Status

## ✅ Shipped
- **#3** Borrowing capacity history removed
- **#6** "Activity / Documents" rename confirmed
- **#13** Export Clients (CSV) simplified to 6 fixed columns
- **#15a** Lender Playbooks deleted
- **#15b** Lender Intelligence rebuilt against `bank_lending_rates_cache` (live rate compare)
- **#16** Forecasting route + sidebar removed (edge fn kept)
- **#17** Mobile cockpit + scan-to-upload standalone removed
- **#11 (partial)** Kanban: mobile "Move to…" dropdown fallback + address visible on cards + `Card`→`PfCard` rename
- **#12** Client creation crash fixed (`source_surface/source_actor_*` → `lead_source`/`lead_source_detail`)
- **#5 (partial)** Income tab save hardened (`normalizeIncomeSourceFields` defaults + numeric coercion)
- **#1 (partial)** `notifications_type_check` widened: `note_added`, `message_sent`, `purchase_file_created`
- **#2** Per-note visibility picker (Internal / Client / Finance / All), no default; enum widened to `client_only` + `finance_only`; finance-portal note reader now returns `shared` ∪ `finance_only`

## ⏳ Pending — Need user repro / live error payloads
| # | Blocker |
|---|---|
| 8 | Secondary contact sync — exact failure point unknown; need toast text or edge response |
| 9 | Messages "invalid session" — no edge logs recorded; need a repro click in the preview |
| 10 | New Purchase File creation — code path looks correct (enum + columns verified); need the actual error message |
| 11 (rest) | Kanban blank/black screen after refresh — need to see when it happens (empty-state? specific PF?) |
| 5 (rest) | Income tab dropdown parity with CC + bidirectional `client_employment` sync |

## ⏳ Pending — Larger build, scoped
| # | Reason held |
|---|---|
| 1 (rest) | Realtime publication audit + per-portal subscribe wiring |
| 7 | Address propagation trigger — needs decision on `clients.current_address` (single text) vs split fields on `purchase_files` |
| 4 | Unified CC message composer (Client/Finance/Both/Internal fanout) |
| 14 | Unified Client Inbox aggregator (`finance_outbound_messages` + `client_portal_messages` + `finance_portal_thread_messages` + GHL cache) |
