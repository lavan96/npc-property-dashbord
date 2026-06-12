# pdf-parse-service

A Docling-powered sidecar that converts PDFs into a structured `DoclingDocument`
JSON plus, on demand, page rasters. It is called only by the
`template-import-pdf` Supabase Edge Function as part of the template import
pipeline. Mirrors the existing `weasyprint-service` and `render-source`
patterns.

---

## Endpoints

| Method | Path        | Purpose |
| ------ | ----------- | ------- |
| GET    | `/healthz`  | Liveness/readiness probe (no auth). |
| POST   | `/parse`    | Returns `{ engine_version, page_count, pages[], docling_document }`. Input: `url` (signed Storage URL) **or** `pdf_base64`. |
| POST   | `/raster`   | Returns `{ pages: [{ page_no, mime, base64, width_px, height_px }] }`. Input: same as `/parse` plus `dpi` (72–300) and optional `pages` filter and `format` (`png`/`jpeg`). |

All endpoints other than `/healthz` and `/` require:

```
Authorization: Bearer ${PDF_PARSE_SERVICE_TOKEN}
```

Max input size: **50 MB** (matches the diagnostics bucket cap).

---

## Local development

```bash
cd pdf-parse-service
docker build -t pdf-parse-service .
docker run --rm -p 8080:8080 -e PDF_PARSE_SERVICE_TOKEN=dev pdf-parse-service

# Smoke test
curl http://localhost:8080/healthz

curl -X POST http://localhost:8080/parse \
  -H "Authorization: Bearer dev" \
  -H "Content-Type: application/json" \
  -d "{\"pdf_base64\":\"$(base64 -w0 sample.pdf)\"}" | jq .page_count
```

Models (~500 MB) download at **image build** time so the first request is fast.

---

## Deploying to Google Cloud Run

Pre-reqs: a GCP project, `gcloud` authenticated, billing on, Cloud Run + Artifact Registry APIs enabled.

```bash
# 1. One-time setup ----------------------------------------------------------
PROJECT_ID="your-gcp-project"
REGION="australia-southeast1"          # closest to AU users
REPO="lovable-sidecars"
SERVICE="pdf-parse-service"
gcloud auth configure-docker ${REGION}-docker.pkg.dev
gcloud artifacts repositories create $REPO \
  --repository-format=docker --location=$REGION \
  --description="Lovable sidecar containers"

# 2. Build & push -----------------------------------------------------------
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:$(date +%Y%m%d-%H%M)"
docker build -t $IMAGE pdf-parse-service
docker push $IMAGE

# 3. Generate a strong service token (save this — you'll add it as a
#    Supabase secret named PDF_PARSE_SERVICE_TOKEN below).
SERVICE_TOKEN=$(openssl rand -hex 32)
echo "PDF_PARSE_SERVICE_TOKEN=$SERVICE_TOKEN"

# 4. Deploy -----------------------------------------------------------------
gcloud run deploy $SERVICE \
  --image=$IMAGE \
  --region=$REGION \
  --project=$PROJECT_ID \
  --platform=managed \
  --no-allow-unauthenticated=false \
  --allow-unauthenticated \
  --cpu=2 \
  --memory=4Gi \
  --concurrency=2 \
  --min-instances=0 \
  --max-instances=10 \
  --timeout=300 \
  --port=8080 \
  --set-env-vars="PDF_PARSE_SERVICE_TOKEN=${SERVICE_TOKEN}"

# 5. Grab the URL — you'll set this as PDF_PARSE_SERVICE_URL in Supabase.
gcloud run services describe $SERVICE --region=$REGION --format='value(status.url)'
```

> Why `--allow-unauthenticated`? Auth is enforced inside the container via the
> bearer token. Using GCP IAM would require the edge function to mint Google
> identity tokens, which adds friction without security gain here because the
> token is only known to two systems.

### Scale tuning

* `concurrency=2` — Docling holds large models in RAM. More than 2 parallel
  pipelines per instance risks OOM at 4 GiB.
* `min-instances=0` — costs ~$0 idle. Bump to `1` if cold starts (~10–15 s with
  pre-downloaded models) hurt UX.
* `max-instances=10` — caps blast radius. Adjust based on real usage.

### Cost model (indicative)

| Scenario               | Per import | Per 1k imports |
| ---------------------- | ---------- | -------------- |
| Warm, 6-page PDF, ~40s | ~$0.003    | ~$3            |
| Cold start (+15s)      | ~$0.004    | — (only first) |
| Idle                   | $0         | $0             |

---

## Supabase wiring

After deploy, add two edge-function secrets in Supabase:

| Name                       | Value |
| -------------------------- | ----- |
| `PDF_PARSE_SERVICE_URL`    | Cloud Run service URL (no trailing slash) |
| `PDF_PARSE_SERVICE_TOKEN`  | The bearer token printed above |

The `template-import-pdf` edge function uses these to call `/parse` and
`/raster`, then persists the structured output into the existing
template-import reconciliation pipeline.

---

## Versioning

Update `ENGINE_VERSION` in `app.py` and the Docling pin in `requirements.txt`
together. The version is returned with every response and recorded in
`pdf_import_jobs.engine_version` for traceability across template versions.
