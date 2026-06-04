## Goal

Replace the current per-report "Manage Hero Images" dialog with a **Hero Image Studio**: a single cross-report gallery of every image ever generated, a Gamma-style generation panel (prompt + enhance + model + variations), and per-chapter placement controls (size, orientation, fit, alignment, height) that flow into the PDF renderer.

## What changes for the user

1. **One global gallery** — every generated image is reusable across any report. Filter by report, model, orientation, or free-text search.
2. **Gamma-style generation panel** — write your own prompt, click **Enhance** to have AI rewrite/optimise it, pick a model (GPT-Image-2, GPT-Image-1-mini, Gemini 3 Pro Image, Nano Banana 2), pick aspect ratio, and request **1–4 variations** at once. Live streaming previews while they render.
3. **Per-chapter placement** — for each chapter, pick any image from the gallery and tune how it appears in the PDF: height (compact/standard/tall/full-bleed), width (content/full-bleed), object-fit (cover/contain), focal alignment (top/center/bottom), and rounded vs flush corners.
4. **Backwards compatible** — existing per-chapter assets remain selectable; nothing is deleted.

## Data model

New tables (additive, no destructive changes to `report_visual_assets`):

- `hero_image_library` — the global pool.
  - prompt (raw), enhanced_prompt, model, aspect_ratio, width, height, status, storage_path, public_url, thumbnail_url, owner_user_id, source_report_id (nullable), tags text[], is_archived, created_at.
- `report_hero_placements` — which library image is placed in which chapter, with render controls.
  - report_id, section_key, section_title, library_image_id, render_height (`compact|standard|tall|full_bleed`), render_width (`content|full_bleed`), object_fit (`cover|contain`), focal (`top|center|bottom`), rounded boolean, position_order int, created_at.

`report_visual_assets` is kept for legacy reads; the renderer reads placements first and falls back to the legacy table when none exist.

## Edge functions

- **New** `hero-image-studio` (replaces the bulk of `prepare-report-hero-images`):
  - `enhance_prompt` → calls Lovable AI Gateway (`google/gemini-2.5-flash`) to rewrite the user prompt into an editorial, print-ready image brief; returns the enhanced text without generating.
  - `generate` → streams 1–N images via `/v1/images/generations` using the chosen model + aspect ratio, uploads each to storage, inserts a `hero_image_library` row per variation, returns ids + URLs.
  - `library_list` → paginated, filterable list (search, model, orientation, source_report_id, mine-only).
  - `library_update` / `library_archive` → tag/rename/archive.
  - `placement_set` / `placement_clear` / `placements_list` → manage `report_hero_placements`.
  - `chapters_list` → returns the chapter titles for a report so the dialog can show "place into chapter X".
- **Keep** `prepare-report-hero-images` as-is for any legacy callers, but the UI stops calling it.

## Renderer changes (`render-investment-report-pdf`)

- `loadReadyHeroImages` becomes `loadHeroPlacements(reportId)` returning `{ slug → { url, height, width, fit, focal, rounded } }`. Falls back to legacy `report_visual_assets` when no placements exist.
- `injectHeroImages` emits per-chapter classes driven by the placement record:
  - height: `.hero-h-compact` (180px) / `.hero-h-standard` (280px) / `.hero-h-tall` (380px) / `.hero-h-full` (100vh – full A4 bleed page).
  - width: `.hero-w-content` vs `.hero-w-bleed` (negative margins to page edges).
  - fit + focal applied via `object-fit` + `object-position`.
  - rounded toggles 8pt radius.
- `full_bleed` height inserts a forced page-break before/after so the image owns a full A4 page (like Gamma chapter intros).

## UI — `HeroImageStudio` (replaces `HeroImagesDialog`)

Three-pane dialog (`max-w-6xl h-[90vh]`):

1. **Left rail — Generate**
   - Prompt textarea, **Enhance** button (shows diff: original → enhanced, editable), model dropdown, aspect ratio dropdown (16:9 / 3:2 / 4:3 / 1:1 / 3:4 / 9:16), variations slider (1–4), **Generate** button. Live preview tiles populate as images stream in.
2. **Centre — Gallery**
   - Searchable, filterable grid of every `hero_image_library` row the user can access. Each tile shows thumbnail, model badge, orientation badge, source report (if any), and actions: **Place in chapter…**, **Regenerate variation**, **Archive**.
3. **Right rail — Chapter placements for current report**
   - Lists every chapter from the active report. Each row shows the currently placed image (or empty slot), with inline controls for height, width, fit, focal, rounded. Drag from gallery onto a chapter slot to place.

`PremiumPdfButton` keeps `includeHeroImages` and stays unchanged.

## Out of scope (flag for later)

- Sharing library images across users/teams beyond the current owner.
- Editing existing images (inpaint/outpaint). Today: regenerate as a new variation.

## Technical notes

- Streaming generation uses the SSE pattern from the ai-image-generation docs (`partial_images: 1` for OpenAI models, native partials for Gemini), with `flushSync` in the client so previews paint progressively.
- Storage path: `hero-library/{owner_user_id}/{library_id}.png` in the existing `investment-reports` bucket.
- New tables get `service_role`-only RLS; UI reads via a new `invokeSecureFunction("hero-image-studio", …)` mediator, scoped by `effectiveUserId`.
- `full_bleed` placements use `@page { size: A4; margin: 0 }` inside a wrapper so the image fills an entire page.

## Implementation order

1. Migration: `hero_image_library`, `report_hero_placements`, indexes, RLS, grants.
2. New edge function `hero-image-studio` with all actions above.
3. Renderer update to consume placements (with legacy fallback).
4. New `HeroImageStudio.tsx` UI; swap into `InvestmentReportView.tsx`. Remove old dialog import.
5. Smoke test: generate 2 variations, place into 2 chapters at different heights, render PDF.

Confirm and I'll build it in this order.