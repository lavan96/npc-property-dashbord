# Finance Portal Audit — Status

## ✅ Shipped
- **#1 (partial)** `notifications_type_check` widened: `note_added`, `message_sent`, `purchase_file_created`
- **#2** Per-note visibility picker (Internal / Client / Finance / All), no default; enum widened to `client_only` + `finance_only`; finance-portal note reader now returns `shared` ∪ `finance_only`
- **#3** Borrowing capacity history removed
- **#4** Unified CC composer — single textarea with multi-select chips (Client / Internal / Finance), fans out in one click with per-channel toasts
- **#5 (partial)** Income tab save hardened (`normalizeIncomeSourceFields` defaults + numeric coercion)
- **#6** "Activity / Documents" rename confirmed
- **#7** Split address fields added to **clients** (`current_suburb` / `current_state` / `current_postcode` + `secondary_*`); `ContactAddressFields` exposes Suburb/State/Postcode inputs; DB trigger `trg_propagate_client_address` auto-fills `purchase_files.property_*` on insert when blank
- **#11 (partial)** Kanban: mobile "Move to…" dropdown fallback + address visible on cards + `Card`→`PfCard` rename
- **#12** Client creation crash fixed (`source_surface/source_actor_*` → `lead_source`/`lead_source_detail`)
- **#13** Export Clients (CSV) simplified to 6 fixed columns
- **#14** Cross-client Unified Inbox confirmed live at `/finance/client-inbox` (edge fn `finance-portal-client-comms` op `inbox_list` already wired)
- **#15a** Lender Playbooks deleted
- **#15b** Lender Intelligence rebuilt against `bank_lending_rates_cache`
- **#16** Forecasting route + sidebar removed
- **#17** Mobile cockpit + scan-to-upload standalone removed

## ⏳ Pending — Need user repro / live error payloads
| # | Blocker |
|---|---|
| 8 | Secondary contact sync — need toast text or edge response |
| 9 | Messages "invalid session" — need a repro click in the preview |
| 10 | New Purchase File creation — need actual error message |
| 11 (rest) | Kanban blank screen after refresh — need symptom context |
| 5 (rest) | Income tab dropdown parity with CC + bidirectional `client_employment` sync |
| 1 (rest) | Per-portal realtime subscribe wiring audit |
