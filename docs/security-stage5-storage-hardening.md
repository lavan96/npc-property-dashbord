# Stage 5 Storage Hardening

This stage tightens storage **write** policies while keeping **read** behavior unchanged to avoid breaking existing public URLs.

## What changed
- Added migration: `20260124121500_storage_write_policies.sql`
- Writes (INSERT/UPDATE/DELETE) now require:
  - `auth.role()` in `('authenticated', 'service_role')`
  - bucket match
- Reads are **not** changed in this stage

Buckets affected:
- `client-files`
- `investment-reports`
- `report-templates`
- `branding-assets`
- `vownet-forms`

## Required runtime behavior
Because the app uses **custom auth** (session tokens) rather than Supabase Auth,
the browser cannot satisfy `auth.role() = 'authenticated'` for direct storage writes.

To avoid breakage:
1. Ensure the **signed storage edge function** is deployed:
   - `storage-signed-url`
2. Ensure the frontend uses signed storage:
   - `VITE_USE_SIGNED_STORAGE` should **not** be set to `false`
3. Users must have a valid `session_token` in localStorage.

## Rollout guidance
- Deploy edge functions first
- Deploy frontend changes (Stage 3 + Stage 4)
- Then apply the migration

## Known limitations
Read policies remain public for now. Tightening reads will require:
- Converting public URLs to signed URLs
- Updating any stored `pdf_url` or template URLs
