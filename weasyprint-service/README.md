# WeasyPrint PDF Microservice

Self-hosted Python service that renders the premium investment-report HTML to
PDF using WeasyPrint. Replaces the Api2PDF (Headless Chrome) path so we keep
full control over typography, page layout, and engine version.

## Endpoints

- `GET  /healthz` — liveness probe.
- `POST /render`  — `Authorization: Bearer $WEASYPRINT_SERVICE_TOKEN`, JSON
  body `{ "html": "...", "base_url": "https://..." }`, returns
  `application/pdf` bytes.

## Local run

```bash
cd weasyprint-service
docker build -t weasyprint-service .
docker run --rm -p 8080:8080 \
  -e WEASYPRINT_SERVICE_TOKEN=dev-token \
  weasyprint-service
curl -X POST http://localhost:8080/render \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{"html":"<h1>Hello</h1>"}' \
  -o out.pdf
```

## Deploy — Google Cloud Run (recommended)

```bash
PROJECT_ID=your-gcp-project
REGION=australia-southeast1
TOKEN=$(openssl rand -hex 32)

gcloud builds submit --tag gcr.io/$PROJECT_ID/weasyprint-service ./weasyprint-service

gcloud run deploy weasyprint-service \
  --image gcr.io/$PROJECT_ID/weasyprint-service \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi --cpu 2 \
  --concurrency 4 --timeout 600 \
  --min-instances 0 --max-instances 10 \
  --set-env-vars WEASYPRINT_SERVICE_TOKEN=$TOKEN

# Note the deployed URL, then add these as Supabase Edge Function secrets:
#   WEASYPRINT_SERVICE_URL   = https://weasyprint-service-xxxx.a.run.app
#   WEASYPRINT_SERVICE_TOKEN = <the TOKEN you generated>
```

Cloud Run scales to zero — typical cost is a few cents per thousand renders.

## Deploy — Fly.io / Railway / Render alternatives

Any container host that runs the Dockerfile works. Set the same two env vars
(`WEASYPRINT_SERVICE_TOKEN` on the service, `WEASYPRINT_SERVICE_URL` +
`WEASYPRINT_SERVICE_TOKEN` on Supabase) and you're done.

## Edge function wiring

`supabase/functions/render-investment-report-pdf/index.ts` automatically
prefers WeasyPrint when both secrets are set, uploads the returned bytes to
the `investment-reports` storage bucket, and returns a signed URL to the
client. If the secrets are missing or the service errors out, it falls back
to the legacy Api2PDF path so generation never breaks during cutover.
