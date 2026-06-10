# page-render service

A tiny headless-Chromium (Playwright) screenshot service so **code-built designs**
— Figma public embeds, Canva/Gamma public views, any interactive web page — can be
imported. It renders the page to a PNG; the `import-from-url` edge function then
feeds that image into the importer's OCR-grounded reconstruct path.

This is a sibling to the existing WeasyPrint microservice: it can't run inside a
Supabase Deno edge function (no headless browser), so it deploys as its own container.

## API
- `GET /health` → `{ ok: true }`
- `POST /render` (header `x-render-key: $RENDER_API_KEY`)
  - body: `{ "url": "https://…", "width"?: 1280, "scale"?: 2, "waitMs"?: 3000, "maxHeight"?: 12000, "selectors"?: string[], "maxSegments"?: 60 }`
  - 200: `{ "images": [{ "dataBase64": "…", "width": 1280, "height": 720 }, …], "mode": "single" | "segments", "contentType": "image/png" }`
  - 4xx: `{ "error": "…" }`
  - **Slide splitting:** when `selectors` are supplied, each *slide-sized* element matching them is
    captured as its own image (reading order), so a deck imports as one page per slide. If nothing
    matches, it falls back to a single capped-height capture.

## Security
- **Shared-secret auth** via `x-render-key` (`RENDER_API_KEY`).
- **SSRF**: navigation + every sub-request is restricted to public `http(s)` hosts;
  private / reserved / link-local / metadata / CGNAT / IPv6 ULA targets are aborted
  (`src/security.mjs`, unit-tested in `src/security.test.mjs`).
- Downloads disabled, navigation timeout, request-body cap, output height capped.
- Runs as the non-root `pwuser`.

> Still validate at the network layer too (egress firewall / private VPC) — DNS
> rebinding is only mitigated at the hostname level here.

## Run
```bash
npm install
RENDER_API_KEY=$(openssl rand -hex 24) npm start   # listens on :8080
npm test                                            # security unit tests
```

## Docker
```bash
docker build -t page-render services/page-render
docker run -p 8080:8080 -e RENDER_API_KEY=secret page-render
```

## Wire it to the importer
Set these on the `import-from-url` edge function (Supabase project secrets):
```
RENDER_SERVICE_URL = https://<your-deployed-host>
RENDER_API_KEY     = <same secret as the service>
# optional, enables Figma frame export instead of a screenshot:
FIGMA_TOKEN        = <a Figma personal access token>
```
With those set, pasting a Figma/Canva/Gamma (or any page) link in **Start from a
reference** renders the page and reconstructs it. Without them, those links fall
back to "export to PDF" guidance.
