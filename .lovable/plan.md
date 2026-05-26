# Phase 6 — Link Internal Deals ↔ Finance Purchase Files (Option A)

## Goal

Stop the drift between `client_deals` (internal Deal Pipeline) and `purchase_files` (Finance Portal Deal Room) by adding a bidirectional link and lightweight cross-module surfaces. Both modules keep their specialised UIs; neither is migrated or rewritten.

## Scope

In scope:
- Bidirectional FK between `client_deals` and `purchase_files`
- "Link / Unlink / Create from" actions in both directions
- Read-only cross-module panels (Deal Room shows internal deal; Deal Pipeline row shows finance status)
- Shared-field divergence indicator (price / settlement date / address mismatch warning)
- Commission rollup honours the link (uses `purchase_file_id` already on `commissions`)

Explicitly out of scope:
- Auto-mirroring of shared fields (we surface drift, don't silently overwrite)
- Merging `deal_stages` into `purchase_files` or vice versa
- Touching build payments / builder invoices schema
- Legal/builder portal work

## Data model changes

```text
client_deals
  + purchase_file_id  uuid  nullable  FK → purchase_files(id) ON DELETE SET NULL
  + index on (purchase_file_id)

purchase_files
  + client_deal_id    uuid  nullable  FK → client_deals(id) ON DELETE SET NULL
  + index on (client_deal_id)
```

Both sides nullable because legacy rows exist on both. A trigger keeps the two sides consistent: setting one side populates the other; unlinking one clears the other. Unique partial indexes prevent a single deal or file being linked to more than one counterpart.

## Edge function changes

- `finance-portal-purchase-files`: add `link_to_deal` and `unlink_deal` operations; include linked deal summary in `get` responses (deal id, current_stage, risk_status, total_contract_price, settlement_date, stage count, build-payment count).
- `manage-client-data` / `get-client-data`: add `client_deals` link/unlink support and include `purchase_file` summary in deal payloads (finance_status, lender, latest finance_decision outcome, condition counts, next critical date).
- Add `client_deals` to `ALLOWED_TABLES` read path for the finance portal edge fn (read-only, scoped to linked rows only).

## UI changes

**Finance Portal — Deal Room (`PurchaseFileDetail`)**
- New "Internal Deal" card under the Overview tab. States:
  - Not linked → button "Link to existing deal" (searches `client_deals` for this client) and "Mark as standalone".
  - Linked → read-only summary: deal type, current stage, risk, build payments completed (N/M), commission estimate, link to open in Command Centre. Unlink button.
  - Drift warning chip if address / price / settlement date differ between the two rows.

**Internal Deal Pipeline (`/DealPipeline`)**
- New "Finance" column on the table: finance_status pill + lender. Empty when not linked.
- Row action menu: "Link finance file" / "Open finance Deal Room" / "Unlink".
- Filter by `has_finance_file` and by `finance_status`.

**Command Centre — `ClientDetailsModal`**
- Purchase Files tab already exists. Add a small "Linked deal" chip on each PF card.
- Deals tab gets the same "Linked finance file" chip.

**Picker component (shared)**
- `LinkCounterpartDialog` — lists candidate deals/files for the same `client_id`, shows address/price/date side-by-side, confirms link. Reused on both sides.

## Permissions

- Reuse existing OR-merge resolver. New scope keys:
  - `link_purchase_file_to_deal` (finance side, default allow for finance partners with `edit_purchase_files`)
  - `link_deal_to_purchase_file` (internal side, gated by existing `deals` edit permission)
- Read-only cross-module summary requires only view permission on the counterpart's parent client.

## Drift detection

A SQL view `v_purchase_file_deal_drift` returning rows where linked pairs disagree on:
- normalised address (lowercased, whitespace-collapsed)
- price (>$5k delta)
- settlement_date (different non-null values)

Surfaced as a Phase 4 dashboard widget ("Linked files with drift") and as the inline chip in both UIs. No auto-correction — user chooses which side is canonical and edits manually.

## Migration & backfill

- Migration adds columns + indexes + trigger + view.
- Backfill script (one-off, idempotent) attempts auto-link where:
  - same `client_id`
  - normalised address matches exactly
  - exactly one candidate on each side
- All auto-links written with `linked_by = 'auto_backfill'` audit field on a new `purchase_file_deal_link_audit` table so they can be reviewed and reversed.
- Ambiguous matches stay unlinked and appear in a "Needs review" widget for staff to resolve manually.

## Realtime & notifications

- Add updated tables to `supabase_realtime` publication.
- New notification type `purchase_file_linked` (notifies assigned NPC + finance partner when a link is created or broken).
- Extend `notifications_type_check`.

## Memory updates

After ship, add a memory note documenting the link contract, drift policy, and backfill audit table.

## Rollout order

1. Migration (columns, indexes, trigger, view, audit table, realtime, notification type)
2. Edge fn updates (link/unlink ops + summary payloads + ALLOWED_TABLES)
3. Shared `LinkCounterpartDialog` component
4. Finance Portal Deal Room "Internal Deal" card
5. Internal Deal Pipeline finance column + row actions
6. ClientDetailsModal chips on both tabs
7. Backfill script + drift widget
8. Notifications wiring + memory note

Each step is independently shippable; nothing breaks if we stop after step 4.

## What I'll do on approval

Start with step 1 — the migration — and pause for your review before moving to the edge function changes. After the migration approves, I'll proceed through steps 2–8 in one pass unless you tell me to gate further.