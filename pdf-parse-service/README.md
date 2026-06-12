# pdf-parse-service

Self-hosted Docling sidecar that backs the **Docling** engine of the Lovable PDF
import pipeline (see `mem://architecture/pdf-import-pipeline`). Sits alongside
`weasyprint-service` and `render-source` and is called from the
`pdf-parse-dispatch` Supabase edge function.

## Endpoints

| Method | Path        | Purpose                                                            |
| ------ | ----------- | ------------------------------------------------------------------ |
| GET    | `/healthz`  | Readiness probe — returns `{ok: true, version: "<docling-ver>"}`.  |
| POST   | `/parse`    | Multipart upload **or** signed-URL pull. Returns Docling JSON +    |
|        |             | per-page metadata (page size, bbox tree, table grids, asset refs). |
| POST   | `/raster`   | Page rasterisation for Hybrid / Pixel-Perfect modes.               |

All requests must include `Authorization: Bearer $PDF_PARSE_SERVICE_TOKEN`.

## Deployment

- **Target:** Cloud Run (preferred) or Fly.io.
- **Resources:** 2 vCPU / 4 GB RAM, concurrency 2, request timeout 300s.
- **Min instances:** `0` (cold-start ~30s once we pre-load the pipeline at boot,
  bump to `1` in prod only if usage warrants it).
- **Image:** `python:3.11-slim` + `docling`, `fastapi`, `uvicorn`, `pydantic`.
- **Cost envelope:** ~$0.003 per import, ~5 MB diagnostics bundle per job
  (auto-purged after 7 days from the `pdf-import-diagnostics` Storage bucket).

## Required environment

| Var                          | Owner             |
| ---------------------------- | ----------------- |
| `PDF_PARSE_SERVICE_TOKEN`    | Service + edge fn |
| `PDF_PARSE_SERVICE_URL`      | Edge fn only      |
| `PDF_PARSE_DIAGNOSTICS_PATH` | Service           |

The matching secrets on the Supabase project are `PDF_PARSE_SERVICE_URL` and
`PDF_PARSE_SERVICE_TOKEN`.

## Operating

- **Job ledger:** every dispatch writes a `pdf_import_jobs` row. The UI polls
  it; superadmins can browse the full ledger at
  `/admin/pdf-import-diagnostics` (Phase 7).
- **Feature flag:** `feature_flags.pdf_import.engine` (`legacy` | `docling`)
  with per-superadmin override and an allowlist. Edit at
  `/admin/pdf-import-engine`.
- **Fallback:** the `legacy` pdf.js path stays in code for 30 days after 100%
  rollout so we can flip back instantly.

## Diagnostics bundle layout

```
<job_id>/
  docling.json     # raw Docling DoclingDocument payload
  rasters.json     # per-page raster manifest (Storage URLs)
  ssim.json        # optional fidelity scores per page
  source.pdf       # original upload (only if uploaded base64)
```

Signed URLs are issued by the `pdf-import-diagnostics` edge function on demand
(superadmin only, 10-minute expiry).
