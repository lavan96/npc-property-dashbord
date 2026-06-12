
# Docling PDF Parsing Pipeline — Phased Implementation Plan

**Goal:** Replace the current deterministic PDF extractor (which causes blank Semantic output and statement timeouts on Hybrid/Pixel-Perfect) with a self-hosted Docling microservice, sitting alongside `weasyprint-service` and `render-source`. The edge function becomes a thin orchestrator; heavy parsing moves out of the 60s edge-function envelope.

---

## Outcomes (Definition of Done)

- **Semantic** mode produces an editor preview, editor canvas, and final PDF that all match the source.
- **Hybrid** and **Pixel-Perfect** modes complete end-to-end on the 6-page Cloverton package without statement timeouts.
- Table cells, multi-column flow, and font sizing match the source visually (≥95% SSIM on raster compare).
- `report_templates.schema` payload stays under 500 KB (rasters live in Storage; only URLs in DB).
- Pipeline is observable: every import has a trace ID, per-stage timings, and a downloadable diagnostics bundle.

---

## Phase 0 — Pre-flight & Guardrails (½ day)

1. Add `pdf_import_jobs` table (job id, status, stage, durations, error, diagnostics_url) so every import is asynchronous and auditable.
2. Create Storage bucket `pdf-import-diagnostics` (private; 7-day TTL) for raw Docling JSON, page rasters, and SSIM diffs.
3. Add a feature flag `pdf_import.engine` with values `legacy` and `docling` so we can dark-launch and fall back instantly.

**Exit criteria:** flag flips in UI for superadmins only; legacy path unchanged.

---

## Phase 1 — Stand Up the Docling Sidecar (1–2 days)

1. New directory `pdf-parse-service/` mirroring the `weasyprint-service` and `render-source` patterns.
2. `Dockerfile` based on `python:3.11-slim`; install `docling`, `fastapi`, `uvicorn`, `pydantic`.
3. `app.py` exposes:
   - `GET  /healthz` — readiness probe.
   - `POST /parse`  — multipart upload OR signed-URL pull; returns Docling JSON + per-page metadata.
   - `POST /raster` — optional page rasterisation (PNG/JPEG, target DPI) for Hybrid/Pixel modes.
4. Bearer-token auth via `PDF_PARSE_SERVICE_TOKEN` shared secret.
5. Deploy target: Cloud Run / Fly.io, 2 vCPU / 4 GB RAM, min-instances=0, concurrency=2, request timeout 300s.
6. Warm-start optimisation: pre-load Docling pipeline at boot (avoid first-request 30s cold).

**Exit criteria:** `curl /healthz` returns 200; `/parse` returns structured JSON for the Cloverton PDF in <60s warm.

---

## Phase 2 — Edge Function Orchestration (1 day)

1. Add secrets: `PDF_PARSE_SERVICE_URL`, `PDF_PARSE_SERVICE_TOKEN`.
2. Refactor `supabase/functions/template-import-pdf/index.ts` into a **dispatcher**:
   - Insert `pdf_import_jobs` row → return `{ jobId }` immediately (avoids edge timeout).
   - Spawn background work via `EdgeRuntime.waitUntil(...)` that:
     a. Uploads PDF to Storage (if not already there).
     b. Calls `pdf-parse-service` with the signed URL.
     c. Persists raw Docling JSON to diagnostics bucket.
     d. Hands JSON to the new adapter (Phase 3).
     e. Calls `template_finalize_v2` / `template_resync_v2` with the slim result.
     f. Updates `pdf_import_jobs.status`.
3. Frontend (`ExportPipelineDialog` / import UI) polls `pdf_import_jobs` by id and renders staged progress.

**Exit criteria:** import returns a job id within 2s; no statement timeouts under load.

---

## Phase 3 — Docling-to-Template Adapter (2 days)

New module `src/lib/reportTemplate/pdfImport/docling/`:

1. `doclingTypes.ts` — typed view of Docling `DoclingDocument` JSON.
2. `mapDoclingToRawBlocks.ts` — converts Docling elements → existing `RawImportBlock[]`:
   - `text` items → text overlay (preserve bbox, font family/size/weight, colour).
   - `table` → table overlay with cell grid (columns/rows from Docling's TableFormer output).
   - `picture` → image overlay (pull asset from Docling assets dir, upload to Storage, store URL).
   - `code` / `formula` / `list` → text overlay with role hint.
3. `mapDoclingToPagePlan.ts` — produces `TemplateImportPagePlan` per page, including:
   - Page size from Docling page metadata.
   - Background per mode:
     - **Semantic** → solid colour (no raster).
     - **Hybrid** → rasterised page as `background.imageUrl` (Storage URL).
     - **Pixel-Perfect** → high-DPI raster + overlays locked at low confidence.
4. Reuse existing `reconciliation/planBuilder.ts`, `repairLoop.ts`, `visualDiff.ts` — they remain untouched.

**Exit criteria:** unit tests on a fixture Docling JSON yield expected overlay counts, bboxes within ±2pt of source.

---

## Phase 4 — Mode Wiring & Confidence Policy (1 day)

1. **Semantic** — set `background.imageUrl = null`, lock no overlays; if Docling reports low confidence on >20% of a page, surface a warning chip in the editor.
2. **Hybrid** — raster background + editable overlays for everything Docling returned with confidence ≥0.7; lock the rest.
3. **Pixel-Perfect** — raster background + ALL overlays locked by default; user opts in to unlock.
4. Add `importSummary.engine = 'docling'` and `engineVersion` to the plan for traceability.

**Exit criteria:** all three modes render correctly in editor preview, editor canvas, and exported PDF for the Cloverton sample.

---

## Phase 5 — Quality Assurance Loop (1 day)

1. After raster background is written, run SSIM compare (existing `visualDiff.ts`) between Docling-reconstructed page and source page raster.
2. SSIM < 0.92 → auto-promote to next mode (Semantic → Hybrid → Pixel-Perfect) **once**, then surface to user.
3. Store SSIM score + side-by-side PNG in diagnostics bucket; link from `pdf_import_jobs`.
4. Add a `/admin/pdf-import-diagnostics` superadmin page listing recent jobs, stage timings, SSIM, and download buttons.

**Exit criteria:** failed imports produce an actionable diagnostics URL within 1 click.

---

## Phase 6 — Cutover & Hardening (½ day)

1. Flip `pdf_import.engine` flag to `docling` for superadmins, then beta users, then everyone.
2. Keep `legacy` path in code for 30 days as fallback.
3. Add edge-function structured logs (`stage`, `jobId`, `durationMs`).
4. Document the service in `pdf-parse-service/README.md` (env, deploy, scaling, cost model).
5. Add memory entry under `mem://architecture/pdf-import-pipeline` so future agents don't re-introduce the schema-bloat / edge-timeout footguns.

**Exit criteria:** 7 days at 100% rollout with zero P1 incidents; legacy path removable.

---

## Technical Details

### New files / directories
- `pdf-parse-service/{Dockerfile, app.py, requirements.txt, README.md}`
- `src/lib/reportTemplate/pdfImport/docling/{doclingTypes.ts, mapDoclingToRawBlocks.ts, mapDoclingToPagePlan.ts, index.ts}`
- `src/components/admin/PdfImportDiagnostics.tsx` + route `/admin/pdf-import-diagnostics`

### Modified
- `supabase/functions/template-import-pdf/index.ts` — async dispatcher.
- `src/lib/reportTemplate/pdfImport/extractPdfToTemplate.ts` — engine-switch (legacy vs docling adapter).
- `src/components/templateBuilder/ExportPipelineDialog.tsx` — job-polling UI.

### Database (one migration)
- `pdf_import_jobs` (id, user_id, file_path, engine, status, stage, started_at, finished_at, error_text, diagnostics_path, ssim_score, mode) with `service_role` grants + RLS scoped to creator/superadmin.
- Feature-flag row in `system_settings` (`pdf_import.engine`).
- Storage bucket `pdf-import-diagnostics` (private, 7-day lifecycle rule).

### Secrets
- `PDF_PARSE_SERVICE_URL`
- `PDF_PARSE_SERVICE_TOKEN`

### Cost / scale
- Cloud Run idle = $0 (min-instances=0). Per import: ~30–90s CPU = ~$0.003 each. Storage: ~5 MB per diagnostics bundle, auto-purged.

### Risk register
- **Cold start latency** → mitigate with min-instances=1 in prod if usage warrants.
- **Docling version drift** → pin version in `requirements.txt`; record `engineVersion` per job.
- **Large PDFs (>50 MB)** → reject at edge with clear error; documented limit in UI.
- **Asset URL breakage** → upload Docling-extracted images to Storage immediately; never embed base64.

---

## Out of Scope (explicit)
- OCR for purely scanned PDFs (handled by separate Claude-document path already shipped in `pdfDocumentReconstruct.ts`).
- Image/URL/Code ingestion sources — untouched.
- Editor UX for locked overlays — already works; we just feed it better data.

---

## Sequencing Summary

| Phase | Duration | Blocking? |
|---|---|---|
| 0 — Pre-flight | 0.5d | — |
| 1 — Sidecar service | 1–2d | Blocks 2+ |
| 2 — Edge orchestrator | 1d | Blocks 4+ |
| 3 — Adapter | 2d | Blocks 4+ |
| 4 — Mode wiring | 1d | Blocks 5+ |
| 5 — QA loop | 1d | — |
| 6 — Cutover | 0.5d | — |

**Total: ~7 working days end-to-end.** Phases 1 and 3 can run in parallel once Phase 0 lands.

---

## Approval needed before I start
- Confirm the deploy target for `pdf-parse-service` (Cloud Run vs Fly.io vs other) so I can shape the Dockerfile + README accordingly.
- Confirm you're happy with an async job pattern (frontend polls `pdf_import_jobs`) rather than the current synchronous wait.
