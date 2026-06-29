# pdf-parse-service — Deployment Guide (Phase D)

Complete, copy-pasteable instructions to deploy the Docling sidecar to Google
Cloud Run with all **Phase A–D** enrichments active (formula + code, sharp
picture crops at 2× scale, table accuracy, OCR fallback, DocTags + Markdown
exports, outline + cross-references + per-page language, streaming progress).

The sidecar is called by the `pdf-parse-dispatch` Supabase edge function via
two secrets stored on the Supabase project:

- `PDF_PARSE_SERVICE_URL` → the Cloud Run HTTPS URL (no trailing slash)
- `PDF_PARSE_SERVICE_TOKEN` → a long random bearer token (you generate it)

---

## 0. Prerequisites

- Google Cloud project with billing enabled.
- `gcloud` CLI ≥ 470 installed and authenticated:
  ```bash
  gcloud auth login
  gcloud config set project <YOUR_GCP_PROJECT_ID>
  ```
- Docker (only required if you build locally; otherwise Cloud Build does it).
- Access to the Supabase project `dduzbchuswwbefdunfct` (to update the two
  secrets above after the URL is known).

Pick a region close to your Supabase project (Supabase is in AWS but Cloud Run
latency is dominated by Docling parse time, so `us-central1` or `australia-southeast1`
both work well — pick the one closest to your users).

```bash
export GCP_PROJECT=<YOUR_GCP_PROJECT_ID>
export REGION=us-central1
export SERVICE=pdf-parse-service
export IMAGE=gcr.io/$GCP_PROJECT/$SERVICE:docling-2.14.0-phaseD-waveD
```

---

## 1. Generate the bearer token

```bash
export PDF_PARSE_SERVICE_TOKEN=$(openssl rand -hex 48)
echo "$PDF_PARSE_SERVICE_TOKEN"
```

Copy this value — you need it in step 4 and step 6. Treat it like a password.

---

## 2. Enable required Google APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  containerregistry.googleapis.com
```

---

## 3. Build the container image

From the repo root:

```bash
cd pdf-parse-service
gcloud builds submit --tag "$IMAGE" .
```

This uploads the `pdf-parse-service/` directory (Dockerfile, `app.py`,
`requirements.txt`) to Cloud Build, builds the image, and pushes it to GCR.
First build takes ~6–10 minutes because Docling pulls its layout, table, and
enrichment models into the image cache.

> **Tip:** if you change `requirements.txt`, rebuild with a new tag
> (e.g. `:phaseD-2`) to bust Cloud Run's revision cache cleanly.

---

## 4. Deploy to Cloud Run

```bash
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --cpu 2 \
  --memory 4Gi \
  --concurrency 2 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 10 \
  --startup-probe-http-path /healthz \
  --set-env-vars "PDF_PARSE_SERVICE_TOKEN=$PDF_PARSE_SERVICE_TOKEN" \
  --set-env-vars "ENABLE_PICTURE_CLASSIFICATION=true" \
  --set-env-vars "ENABLE_PICTURE_DESCRIPTION=false" \
  --set-env-vars "ENABLE_FORMULA_ENRICHMENT=true" \
  --set-env-vars "ENABLE_CODE_ENRICHMENT=true" \
  --set-env-vars "ENABLE_OCR_FALLBACK=true" \
  --set-env-vars "DOCLING_PREWARM_ON_STARTUP=true" \
  --set-env-vars "DOCLING_IMAGES_SCALE=2.0" \
  --set-env-vars "DOCLING_TABLE_MODE=ACCURATE"
```

Notes:

- `--allow-unauthenticated` is safe because every request must carry the
  `Authorization: Bearer $PDF_PARSE_SERVICE_TOKEN` header — Cloud Run IAM is
  bypassed but our app-level auth blocks anything else.
- `--concurrency 2` keeps Docling memory bounded (each request can hold
  ~1.5 GB while parsing a large PDF).
- `--timeout 300` is the production request deadline; very large scanned PDFs
  should fail cleanly with the sidecar error taxonomy instead of monopolising a
  worker indefinitely.
- `--max-instances 10` bounds worst-case parallel Docling memory use while
  still allowing twenty in-flight requests at `--concurrency 2`.
- `--startup-probe-http-path /healthz` lets Cloud Run defer traffic until the
  FastAPI process is accepting requests; app startup also pre-warms Docling with
  a one-page sample unless `DOCLING_PREWARM_ON_STARTUP=false`.
- Bump `--min-instances 1` only once usage justifies the ~$25/mo idle cost —
  cold starts are ~30 s.

When the command finishes, copy the printed **Service URL**:

```
Service URL: https://pdf-parse-service-xxxxxxxx-uc.a.run.app
```

Export it for the next step:

```bash
export PDF_PARSE_SERVICE_URL="https://pdf-parse-service-xxxxxxxx-uc.a.run.app"
```

---

## 5. Smoke-test the sidecar

```bash
# Health probe (no auth required)
curl -s "$PDF_PARSE_SERVICE_URL/healthz" | jq

# Parse a small public PDF (auth required)
curl -s -X POST "$PDF_PARSE_SERVICE_URL/parse" \
  -H "Authorization: Bearer $PDF_PARSE_SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://arxiv.org/pdf/2206.01062.pdf"}' \
  | jq '{engine: .engine_version, pages: (.pages|length), has_outline: (.outline|length>0), has_doctags: (.doctags|length>0), has_summary: (.summary != null)}'
```

Expected output:

```json
{
  "engine": "docling-2.14.0+phaseD+waveD",
  "pages": 9,
  "has_outline": true,
  "has_doctags": true,
  "has_summary": true
}
```

If you see `401 Unauthorized`, the token doesn't match. If you see `500`,
check logs:

```bash
gcloud run services logs read "$SERVICE" --region "$REGION" --limit 50
```

---

## 6. Wire the secrets into Supabase

In the Lovable chat, add (or update) the two secrets so the
`pdf-parse-dispatch` edge function can reach the new sidecar:

1. `PDF_PARSE_SERVICE_URL` → value of `$PDF_PARSE_SERVICE_URL` from step 4.
2. `PDF_PARSE_SERVICE_TOKEN` → value of `$PDF_PARSE_SERVICE_TOKEN` from step 1.

After they're saved the dispatcher picks them up automatically — no redeploy
needed because edge functions read `Deno.env.get(...)` per invocation.

You can also set them via the dashboard:
<https://supabase.com/dashboard/project/dduzbchuswwbefdunfct/settings/functions>

---

## 7. End-to-end verification from the app

1. Open `/admin/pdf-import-engine` (superadmin only) and confirm the engine
   toggle is set to **Docling**.
2. Open any template import surface and upload a PDF.
3. Watch the job ledger at `/admin/pdf-import-diagnostics` — you should see
   stage breadcrumbs progress through:
   `hashing → parsing → persisting → rastering → finalizing`.
4. Re-upload the **same** PDF — the second job should complete in <2 s with
   `cache_hit: true` and `source_file_hash` populated (Phase C cache).
5. Open the diagnostics bundle for the first job; it should contain:
   ```
   <job_id>/docling.json
   <job_id>/rasters.json
   <job_id>/doctags.md        ← Phase D
   <job_id>/outline.json      ← Phase D
   <job_id>/document.md       ← Phase D
   ```

---

## 8. Updating the sidecar later

Any change to `pdf-parse-service/app.py`, `requirements.txt`, or `Dockerfile`:

```bash
cd pdf-parse-service
export IMAGE=gcr.io/$GCP_PROJECT/$SERVICE:phaseD-$(date +%Y%m%d-%H%M)
gcloud builds submit --tag "$IMAGE" .
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --concurrency 2 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 10 \
  --startup-probe-http-path /healthz
```

Cloud Run will roll the new revision in atomically and drain the old one.

To roll back:

```bash
gcloud run revisions list --service "$SERVICE" --region "$REGION"
gcloud run services update-traffic "$SERVICE" \
  --region "$REGION" \
  --to-revisions <PREVIOUS_REVISION_NAME>=100
```

---

## 9. Environment variable reference

| Var | Default | Purpose |
| --- | --- | --- |
| `PDF_PARSE_SERVICE_TOKEN` | _(required)_ | Bearer token enforced on `/parse` and `/raster`. |
| `ENABLE_PICTURE_CLASSIFICATION` | `true` | Classify pictures (chart/table/photo/etc). |
| `ENABLE_PICTURE_DESCRIPTION` | `false` | VLM-generated captions (slow; opt-in per job). |
| `ENABLE_FORMULA_ENRICHMENT` | `true` | Emit LaTeX for detected formulas. |
| `ENABLE_CODE_ENRICHMENT` | `true` | Detect code blocks + language. |
| `ENABLE_OCR_FALLBACK` | `false` | Run EasyOCR on text-less pages (heavy). |
| `DOCLING_PREWARM_ON_STARTUP` | `true` | Convert a one-page sample at boot so Docling models are loaded before the first real import. |
| `DOCLING_IMAGES_SCALE` | `2.0` | Picture crop DPI multiplier (1.0 = 72 dpi). |
| `DOCLING_LAYOUT_MODEL` | _(unset)_ | Override layout model id, e.g. `docling-models/layout-heron`. |
| `DOCLING_TABLE_MODE` | `ACCURATE` | `FAST` or `ACCURATE` TableFormer mode. |
| `DOCLING_ENABLE_FITZ_LAYERS` | `true` | Phase 2: PyMuPDF vector-graphics + span-typography pass. Set `false` to fall back to Docling-only output. |
| `DOCLING_RASTER_DPI` | `300` | Phase 2: reference-raster DPI (was 200). Lower to 200/240 if cold-starts or memory regress. |
| `DOCLING_MAX_VECTORS_PER_PAGE` | `400` | Phase 2: cap on extracted vector items per page (prevents overlay explosion). |
| `DOCLING_MIN_VECTOR_SIZE_PT` | `1.0` | Phase 2: drop vector drawings smaller than this (pt) in both width and height. |

Override per deploy with `--update-env-vars KEY=VALUE` on `gcloud run deploy`.

---

## 10. Cost & quota expectations

- ~$0.003 per import (median 8-page report, no OCR).
- ~$0.012 per import with OCR fallback on a 30-page scanned PDF.
- 5 MB diagnostics bundle per job, auto-purged after 7 days from the
  `pdf-import-diagnostics` Storage bucket.
- Cloud Run free tier covers ~2 M requests/month at this size; expect
  <$15/mo until you cross ~50 K imports.

### Sidecar token rotation runbook

1. Generate the replacement token: `openssl rand -hex 48`.
2. Redeploy Cloud Run with the current `PDF_PARSE_SERVICE_TOKEN` and the replacement as `PDF_PARSE_SERVICE_TOKEN_NEXT`.
3. Update the Supabase edge-function secret `PDF_PARSE_SERVICE_TOKEN` to the replacement token.
4. Run `/healthz`, `/parse`, and `/raster` smoke tests and verify request IDs in Cloud Run logs.
5. Redeploy Cloud Run with the replacement as `PDF_PARSE_SERVICE_TOKEN` and remove `PDF_PARSE_SERVICE_TOKEN_NEXT`.

During the grace window, the sidecar accepts either bearer token. Do not leave `PDF_PARSE_SERVICE_TOKEN_NEXT` set after rotation is complete.

---

## 11. Phase 2 deploy delta — vector graphics + typography (PyMuPDF)

This release adds a **PyMuPDF (`fitz`)** pass that extracts vector graphics
(logos, rule lines, fills) and real span typography (line-height, letter
spacing, alignment, embedded font names) on top of Docling. PyMuPDF is
**AGPL-3.0** — see `pdf-parse-service/NOTICE.md`.

Three components changed and each must be deployed:

### 11.1 Rebuild + redeploy the Cloud Run sidecar (required)

`requirements.txt` now pins `PyMuPDF==1.24.14`, so the image **must** be
rebuilt — a config-only revision will not pick it up.

```bash
cd pdf-parse-service
export GCP_PROJECT=<YOUR_GCP_PROJECT_ID>
export REGION=us-central1            # whatever you deployed to originally
export SERVICE=pdf-parse-service
export IMAGE=gcr.io/$GCP_PROJECT/$SERVICE:phase2-fitz-$(date +%Y%m%d-%H%M)

gcloud builds submit --tag "$IMAGE" .

gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --memory 4Gi \
  --concurrency 2 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 10 \
  --startup-probe-http-path /healthz \
  --update-env-vars "DOCLING_ENABLE_FITZ_LAYERS=true,DOCLING_RASTER_DPI=300,DOCLING_MAX_VECTORS_PER_PAGE=400,DOCLING_MIN_VECTOR_SIZE_PT=1.0"
```

Notes:
- `--update-env-vars` preserves the existing env (token, Docling toggles) and
  only adds/overrides the Phase 2 keys. Do **not** use `--set-env-vars` here or
  you will wipe `PDF_PARSE_SERVICE_TOKEN`.
- The default raster DPI rose 200 → 300. If you observe Cloud Run OOM/cold-start
  regressions, set `DOCLING_RASTER_DPI=240` (or bump `--memory 6Gi`).
- No secret/token change; the Supabase secrets from section 6 still apply.

### 11.2 Redeploy the `pdf-parse-chunk-callback` edge function (required)

The chunk-merge for large PDFs now carries `vectors` through the merged
document. Without this, PDFs large enough to be chunked (>20 pages) would lose
vectors.

```bash
# Supabase CLI (from repo root). Project ref: dduzbchuswwbefdunfct
supabase functions deploy pdf-parse-chunk-callback --project-ref dduzbchuswwbefdunfct
```

(or deploy it from the Lovable/Supabase functions UI). No other edge function
changed; `pdf-parse-dispatch` / `pdf-parse-callback` are untouched.

### 11.3 Frontend (standard deploy, no migration)

The frontend changes are additive — a new optional `Page.background.imageFit`
schema field and new vector/typography mapping. There is **no database
migration**. Deploy the app the usual way (Vite build / Lovable publish).

### 11.4 Smoke-test the new extraction

```bash
curl -s -X POST "$PDF_PARSE_SERVICE_URL/parse" \
  -H "Authorization: Bearer $PDF_PARSE_SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://arxiv.org/pdf/2206.01062.pdf"}' \
  | jq '{engine: .engine_version, vectors: (.docling_document.vectors|length), vector_count: .summary.vector_count, fitz: .parse_options.fitz_layers, sample_font: (.docling_document.texts[0].font)}'
```

Expect `engine` to end with `+phase2-fitz-vectors-typography`, `fitz: true`,
`vectors` > 0 on a design-rich PDF, and `sample_font` to include
`line_height`/`letter_spacing` when the source had detectable leading.

### 11.5 End-to-end verification in the app

1. Import a brand-heavy template (e.g. one of `public/templates/*.pdf`).
2. On the builder canvas you should now see **vector logos/rule lines** and
   text laid out with the source's real leading/alignment — not just the flat
   raster. (Tables and vectors render via `OverlayPreview` from Phase 1.)
3. Open `PdfFidelityDiffDialog` and confirm reduced drift / higher SSIM vs. a
   pre-Phase-2 import of the same file.

### 11.6 Rollback

- **Fastest:** set `DOCLING_ENABLE_FITZ_LAYERS=false` via
  `gcloud run services update "$SERVICE" --region "$REGION" --update-env-vars DOCLING_ENABLE_FITZ_LAYERS=false`
  — the sidecar reverts to Docling-only output with no rebuild. The frontend
  simply receives no `vectors` and unchanged typography (graceful).
- **Full:** roll Cloud Run traffic back to the previous revision (section 8) and
  redeploy the prior `pdf-parse-chunk-callback`.
