# render-source — headless render microservice

Renders **HTML/CSS** (tier C1) or a **live URL** (tier C2) with Playwright/Chromium
and returns a **screenshot** + a **DOM box tree** (computed positions/styles in CSS
px). The client grounds that box tree into the same `GroundedReference` that OCR
image import produces (`src/lib/reportTemplate/codeGrounding.ts`), then reconstructs
it through the existing `screenshot_to_block` pipeline — so raw-codebase ingestion
reuses the whole reconstruction path unchanged.

Mirrors the `weasyprint-service/` pattern: a standalone container fronted by an
SSRF/auth-guarded Supabase edge function (`supabase/functions/render-source`).

## Endpoints

- `GET  /healthz` — liveness probe.
- `POST /render` — `Authorization: Bearer $RENDER_SOURCE_TOKEN`, JSON body
  `{ "html"?: "...", "css"?: "...", "url"?: "https://...", "width"?: 1280, "height"?: 1600, "fullPage"?: true }`,
  returns `{ raster: "<base64 png>", boxTree, pageWidthPx, pageHeightPx }`.

## Local run

```bash
cd render-source
docker build -t render-source .
docker run --rm -p 8080:8080 -e RENDER_SOURCE_TOKEN=dev-token render-source
curl -X POST http://localhost:8080/render \
  -H "Authorization: Bearer dev-token" -H "Content-Type: application/json" \
  -d '{"html":"<h1 style=\"font:48px Georgia\">Hello</h1>"}' | head -c 200
```

## Deploy — Google Cloud Run (recommended)

```bash
PROJECT_ID=your-gcp-project
REGION=australia-southeast1
TOKEN=$(openssl rand -hex 32)

gcloud builds submit --tag gcr.io/$PROJECT_ID/render-source ./render-source
gcloud run deploy render-source \
  --image gcr.io/$PROJECT_ID/render-source --region $REGION --platform managed \
  --allow-unauthenticated --memory 2Gi --cpu 2 --concurrency 2 --timeout 120 \
  --min-instances 0 --max-instances 10 \
  --set-env-vars RENDER_SOURCE_TOKEN=$TOKEN

# Then add these Supabase Edge Function secrets:
#   RENDER_SOURCE_URL   = https://render-source-xxxx.a.run.app
#   RENDER_SOURCE_TOKEN = <the TOKEN you generated>
```

Any container host that runs the Dockerfile works (Fly.io, Railway, Render).

## Edge function wiring

`supabase/functions/render-source/index.ts` authenticates the caller, re-applies
the SSRF guard, caps size/time, and proxies to this service using
`RENDER_SOURCE_URL` + `RENDER_SOURCE_TOKEN`. If those secrets are unset it returns
`503 { error, code: 'render_source_unconfigured' }`, which the import dialog
surfaces cleanly (raw-codebase ingestion stays "pending" until deployed).

## Security

- **Fail-closed auth:** no `RENDER_SOURCE_TOKEN` ⇒ every request is `401`.
- **SSRF:** private/reserved hosts are blocked in *both* the edge function and here.
- Runs Chromium with `--no-sandbox` as the non-root `pwuser`; deploy on an isolated
  service. For untrusted repo/zip builds (C4), build in a separate sandbox and only
  pass the built URL/HTML here.
