# GHL Marketing Asset Deep-Harvest — Implementation Plan

Goal: extract the maximum possible reconstructable data from the legacy GHL account for **forms, surveys/quizzes, funnels, funnel pages, and workflows**, by combining every available data source: public API, undocumented LeadConnector endpoints, Firecrawl rendering, raw CSS bundle fetching, asset (image/video/font) downloads, and a clear "snapshot bridge" path for the parts that are genuinely API-locked.

## What we're building

A rebuilt `ghl-marketing-raw-dump` pipeline that, per asset, produces a self-contained "rebuild kit" — metadata + field schema + rendered HTML + inlined CSS + screenshot + downloaded assets + extracted copy — stored in DB and downloadable as a single `.zip` per asset or one master `.zip` for everything.

## Deliverables

1. **Async job runner** — dump moves from "fire and forget edge function" to a worker-backed job (`ghl_marketing_dump_jobs` table) with progress, resumability, and per-asset retry. Edge function is short-lived; a worker drains the queue with chunked work to avoid the 60-90s timeout we're hitting now (the reason tabs are empty).
2. **Per-asset deep harvester** with the strategy table below.
3. **Asset downloader** — every image/video/font/css URL referenced by the rendered HTML is fetched and stored in Supabase Storage (`ghl-marketing-dump/{asset_type}/{asset_id}/...`), and the HTML is rewritten to point at the local copies. Result: a fully portable, offline-viewable snapshot.
4. **UI rebuild** — `GhlMarketingRawDump.tsx` gets a real progress view, per-asset detail with all tabs populated (Overview, Fields, Submissions, Rendered HTML, Inlined CSS, Screenshot, Asset Manifest, Raw JSON, Reconstruction Notes), and three export modes: single asset `.zip`, bulk `.zip`, master `.json` index.
5. **Workflow snapshot bridge panel** — explicit UI explaining the GHL Snapshot path with side-by-side legacy↔new workflow ID mapping (so you can rebuild manually and we record the new ID).

## Per-asset strategy

| Asset | API endpoints probed | Render strategy | Stored outputs |
|---|---|---|---|
| Forms | `/forms/`, `/forms/{id}`, `/forms/submissions?formId=`, `/forms/{id}/fields` (undoc) | Firecrawl `https://api.leadconnectorhq.com/widget/form/{id}` with `formats:[rawHtml,html,screenshot,links]` | metadata, fields[], last 50 submissions, rendered HTML, inlined CSS, screenshot, embed snippet |
| Surveys/Quizzes | `/surveys/`, `/surveys/{id}`, `/surveys/{id}/submissions`, quiz scoring detection | Firecrawl `/widget/survey/{id}` per page step | metadata, pages[], fields[], branching logic, quiz rules, submissions, rendered HTML+CSS+screenshot per step |
| Funnels | `/funnels/funnel/list`, `/funnels/funnel/{id}` | none (container only) | metadata + page index |
| Funnel pages | `/funnels/page?funnelId=`, `/funnels/page/{id}`, attempted `/funnels/page/{id}/builder` (will 401, logged) | Firecrawl the **public live URL** (`https://{domain}/{slug}`) with `formats:[rawHtml,html,markdown,screenshot,links]`, `waitFor:3000`, `onlyMainContent:false` | metadata, full DOM, inlined CSS bundle, full-page screenshot, downloaded image/video/font manifest, extracted copy as markdown, all CTA/link map, embedded form/calendar references |
| Workflows | `/workflows/`, attempted `/workflows/{id}/versions`, `/workflows/{id}/triggers`, `/workflows/{id}/actions` | none (API-locked) | metadata, trigger summary, step count, snapshot bridge entry created in `ghl_workflow_snapshot_bridge` table |

## Asset downloader (the part that makes it actually portable)

For every funnel page and form/survey render:
1. Parse the rendered HTML, collect all `<img src>`, `<video src>`, `<source src>`, `<link rel="stylesheet" href>`, `@font-face url()`, inline `background-image: url()`.
2. Fetch each URL (with concurrency cap of 5, polite 200ms delay, skip > 25 MB).
3. Upload to Supabase Storage bucket `ghl-marketing-dump` under `{asset_type}/{asset_id}/assets/{hash}.{ext}`.
4. Rewrite HTML/CSS to use the storage URLs. Store the rewritten HTML as the canonical "portable" version, keep the original as `rendered.original.html`.
5. Inline external CSS into a single `<style>` block in the portable HTML so the file works standalone.

## Database changes

New table `ghl_marketing_dump_jobs`:
- `id`, `status` (queued/running/completed/failed/partial), `requested_resources[]`, `total_assets`, `processed_assets`, `failed_assets`, `started_at`, `finished_at`, `error_log jsonb`, `created_by`.

New columns on `ghl_marketing_raw_dumps`:
- `portable_html_path` (storage path), `inlined_css` (text), `asset_manifest` (jsonb: `[{original_url, storage_path, bytes, content_type}]`), `reconstruction_notes` (text), `harvest_job_id` (fk).

New table `ghl_workflow_snapshot_bridge`:
- `legacy_workflow_id`, `legacy_name`, `trigger_summary`, `step_count`, `new_workflow_id` (nullable, filled in manually after snapshot import), `notes`, `status` (pending/imported/verified).

New storage bucket `ghl-marketing-dump` (private, signed URLs only, RLS via secure mediation).

## Edge function architecture

- `ghl-marketing-dump-enqueue` — creates a job row, returns job id (fast).
- `ghl-marketing-dump-worker` — pulls one queued job, processes assets in chunks of 5, updates progress, schedules itself again until done. Time-budgeted at 50s per invocation, then re-enqueues. This is the same chunked pattern used by the conversations export worker.
- `ghl-marketing-dump-export` — given a job id (or single asset id), assembles a `.zip` (using `jsr:@zip-js/zip-js` in Deno) with folder structure: `forms/{id}/`, `funnels/{id}/pages/{slug}/`, `workflows/snapshot-bridge.csv`, plus a top-level `INDEX.md` explaining what's where and reconstruction notes per asset type.

## UI changes (`GhlMarketingRawDump.tsx`)

- Header: "Start fresh dump" → creates job, shows live progress bar with `processed / total` and current asset name (poll job row every 2s).
- Asset list: badges for `has_html`, `has_screenshot`, `has_assets (N)`, `submissions (N)`, `partial reason`.
- Detail dialog tabs (all populated this time):
  1. Overview — name, type, IDs, dates, embed code
  2. Fields / Steps — structured table
  3. Submissions — table + JSON
  4. Rendered HTML — syntax-highlighted, downloadable
  5. Inlined CSS — syntax-highlighted, downloadable
  6. Screenshot — image
  7. Asset manifest — table of downloaded files with size + signed-URL preview
  8. Raw JSON — merged payload from all probed endpoints
  9. Reconstruction notes — what's recoverable, what's not, manual steps
- New "Workflow Snapshot Bridge" panel: table of legacy workflows with trigger/step summary, an editable "new workflow ID" cell, and a one-click "Mark imported" button that updates `ghl_workflow_snapshot_bridge.status`.
- Export buttons: "Download this asset (.zip)", "Download all (.zip)", "Download master index (.json)".

## Honest limits (called out in UI)

- Workflow steps / email / SMS bodies → API-locked. Snapshot bridge is the only path. UI will say so explicitly.
- Funnel page builder JSON → API-locked. We deliver pixel-accurate render + assets instead.
- GHL form/survey "builder style blob" → not exposed; rendered HTML+CSS is the substitute.

## Rollout order

1. DB migration (new table, columns, bucket, RLS).
2. Edge functions (enqueue + worker + export).
3. UI rebuild (progress, tabs, exports, snapshot bridge).
4. Run a fresh dump end-to-end and verify each tab is populated.

## Risks / mitigations

- **Storage cost** — funnel pages can be heavy with video. Cap per-asset download at 100 MB, skip videos > 25 MB and just record their URL in the manifest.
- **Firecrawl credits** — one render per form/survey/page. If the account is large, we'll batch and let the worker resume. Surface remaining credits if the API exposes it.
- **GHL rate limits** — reuse the existing `ghl-worker-fetch` shared helper with circuit breaker.
- **Long-running** — handled by chunked worker re-enqueue pattern.
