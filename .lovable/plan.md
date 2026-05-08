# Legacy GHL Account: Full Wipe + Atomic Cutover

A superadmin-only "kill switch" surfaced inside `/integrations/ghl-migration`. It performs an exhaustive deletion of every resource inside the legacy GHL location, then atomically flips every code path to the new account.

## Scope of "total destruction"

Every deletable resource type in the legacy location, deleted via authenticated DELETE calls using the existing `GOHIGHLEVEL_API_KEY` + `GOHIGHLEVEL_LOCATION_ID` (the legacy creds, still live in this project's env):

1. Opportunities (all pipelines)
2. Conversations / messages
3. Notes & tasks (per contact)
4. Appointments / bookings
5. Calendars & calendar groups
6. Workflows (disable + delete where API permits; snapshot-only otherwise)
7. Forms & funnels (delete where API permits)
8. Tags
9. Custom fields & custom values
10. Pipelines & stages
11. Contacts (LAST — many other resources cascade off contacts)

Note: GHL's API does NOT expose a "delete location" endpoint to sub-account tokens. Full location deletion must be done manually in the GHL UI by the agency owner after the wipe — we will surface this as a final step in the UI with explicit instructions. Everything *inside* the location will be gone.

## Architecture

### 1. New edge function: `ghl-legacy-wipe-orchestrator`
- Superadmin-only (verifyAuth + role check, mirrors `migration-orchestrator`)
- Body: `{ confirmation: "DESTROY-LEGACY", dry_run?: boolean }`
- Requires literal typed token `DESTROY-LEGACY` to proceed with live deletes
- Creates a `legacy_wipe_jobs` row, dispatches `ghl-legacy-wipe-worker` async, returns job_id
- Pre-leases job (matches existing migration-orchestrator pattern)

### 2. New edge function: `ghl-legacy-wipe-worker`
- Forces `account: 'legacy'` on every GHL call (uses `_shared/ghl-account.ts` with explicit legacy)
- Iterates resources in dependency order (above)
- For each resource: paginate list → DELETE each → log count to `legacy_wipe_jobs.progress` JSONB
- Heartbeats every 10s, resumable on timeout (claims via `worker_lock_until`)
- Per-resource counters: `{found, deleted, failed, skipped_no_endpoint}`
- On final success → calls a Postgres function `finalize_ghl_cutover()` (see step 4)

### 3. New table: `legacy_wipe_jobs`
- `id`, `status` (pending|processing|completed|failed|cancelled), `progress` JSONB, `started_at`, `finished_at`, `created_by`, `worker_lock_until`, `last_error`, `dry_run`, `confirmation_received`
- Service-role-only RLS (matches existing pattern)
- Added to `supabase_realtime` publication for live UI updates
- Whitelisted in `invokeSecureFunction` `ALLOWED_TABLES`

### 4. Atomic cutover: `finalize_ghl_cutover()` Postgres function + resolver flip
- DB function flips a single row in a new `ghl_account_config` table: `default_account = 'new'`, `legacy_disabled_at = now()`
- `_shared/ghl-account.ts` resolver updated to read `default_account` from this config (cached 60s) instead of hardcoded `'legacy'`
- Once `legacy_disabled_at IS NOT NULL`: any call that explicitly requests `account: 'legacy'` throws `LegacyAccountDisabledError` — fail-loud, no silent fallback
- Lead magnet pushes, client sync, all workers automatically resolve to `'new'` from this point on with zero code changes elsewhere

### 5. UI: Kill Switch panel in `/integrations/ghl-migration`
- New "Decommission Legacy Account" section, superadmin-only, gated behind:
  - Big red warning card ("This is irreversible. The legacy account will be wiped to zero.")
  - Required typed confirmation input: must type `DESTROY-LEGACY` exactly
  - "Run dry-run first" button (default) → shows resource counts that *would* be deleted
  - "Execute live wipe" button (disabled until dry-run completed in last 30 min)
- Live progress: per-resource progress bars from realtime subscription
- On completion: green success card + "Cutover complete — new account is now active" + manual instruction to delete the empty legacy location in GHL UI

### 6. Post-cutover cleanup (deferred, surfaced in UI)
- After 7-day cool-off, prompt to delete legacy secrets `GOHIGHLEVEL_API_KEY` + `GOHIGHLEVEL_LOCATION_ID` via secrets tool
- Until then: secrets remain so wipe can be re-run if anything was missed

## Safety rails

- **Dry-run mandatory** before live wipe (worker counts only, no DELETEs)
- **Typed confirmation token** at both UI and edge function layers
- **Superadmin role check** at edge function (not just UI)
- **Pre-flight scope probe** on legacy token (calls existing `ghl-test-credentials` with `account: 'legacy'`) — abort if missing delete scopes
- **Resource counts captured BEFORE deletion** and stored in `progress` JSONB for audit trail
- **Single in-flight job guard**: reject new wipe if a non-completed job exists
- **No cutover on partial failure**: `finalize_ghl_cutover()` only fires if every resource type completes (or is explicitly skipped due to no-endpoint)

## Files to create
- `supabase/migrations/<ts>_legacy_wipe.sql` — `legacy_wipe_jobs` table + `ghl_account_config` table + `finalize_ghl_cutover()` function + RLS + realtime publication
- `supabase/functions/ghl-legacy-wipe-orchestrator/index.ts`
- `supabase/functions/ghl-legacy-wipe-worker/index.ts`
- `src/components/marketing/LegacyAccountKillSwitch.tsx` (or wherever the migration page composes panels)

## Files to modify
- `supabase/functions/_shared/ghl-account.ts` — read default account from `ghl_account_config`, throw `LegacyAccountDisabledError` post-cutover
- `src/pages/.../GhlMigration.tsx` (existing migration page) — mount the new kill switch panel
- `invokeSecureFunction` `ALLOWED_TABLES` — add `legacy_wipe_jobs`, `ghl_account_config`
- Memory: update `mem://integrations/dual-ghl-migration` and `mem://integrations/ghl-dual-account-resolver` to record the cutover mechanism

## Out of scope (explicit)
- Deleting the empty GHL location shell (no API; manual UI step)
- Removing legacy secrets from this project (deferred 7 days)
- Removing dual-ID columns / `ghl_id_mapping` rosetta (kept for historical lookups)
