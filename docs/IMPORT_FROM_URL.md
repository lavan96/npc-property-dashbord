# Import from URL

Paste a share/view link and reconstruct it into an editable template — no manual download.

> Status: **v1 implemented** · Last updated: 2026‑06‑10

## Flow
1. **Client normalises** the link with the pure, unit‑tested `src/lib/reportTemplate/importUrl.ts`
   (`normalizeImportUrl`) → a directly‑fetchable URL + expected kind + provider.
2. **`import-from-url` edge function** does the cross‑origin fetch the browser can't, behind
   `verifyAuth` + **SSRF guards** (private/reserved hosts blocked on every redirect hop) + 30 MB / 20 s
   limits, and returns the bytes as base64 (or guidance).
3. The client turns the bytes into a `File` and drops it into the existing import flow
   (`extractPdfToTemplate` for PDFs, the OCR‑grounded path for images).

## Provider support
| Provider | Handling |
|---|---|
| **Google Drive** | `…/file/d/{id}/view` → `uc?export=download&id={id}` |
| **Google Docs / Slides / Sheets** | `…/export?format=pdf` (Slides `…/export/pdf`) |
| **Dropbox** | content host + `dl=1` |
| **OneDrive / SharePoint** | `?download=1` (best‑effort; link must be "anyone with the link") |
| **Generic `.pdf` / image URL** | fetched directly |
| **Figma** | Figma REST API frame export when `FIGMA_TOKEN` is set → else headless **page render** of the public embed → else guidance |
| **Canva / Gamma** | headless **page render** of the public view when the render service is configured → else guidance to export PDF |
| **Any interactive page** (HTML response) | headless **page render** → image |

## Security
- All fetching is **server‑side**; `isLikelyPrivateHost` (mirrored in the edge function) blocks
  localhost, RFC‑1918, link‑local/`169.254.169.254`, CGNAT, multicast and IPv6 ULA/link‑local.
- Redirects are followed **manually** so every hop is re‑validated (defeats public→internal redirects).
- Only `http(s)`; size + timeout capped.

## Headless render (Figma / Canva / Gamma / any page)
Interactive "code‑built" designs have no file to fetch, so they're **rendered to an image** by the
`services/page-render` microservice (Node + Playwright/Chromium) and then run through the OCR‑grounded
reconstruct path. The `import-from-url` function calls it when `RENDER_SERVICE_URL` (+ `RENDER_API_KEY`)
are configured; Figma additionally tries the REST‑API frame export first when `FIGMA_TOKEN` is set.
Deploy/config: see `services/page-render/README.md`. Without the service, these links fall back to
"export to PDF" guidance.

## Multi‑page decks
Decks import as **one page per slide**, not one tall image:
- **Figma** (with `FIGMA_TOKEN`) exports each top‑level frame as its own image.
- **Canva/Gamma/any page** are split by the render service capturing each *slide‑sized* element that
  matches the provider selectors (env‑overridable: `RENDER_SELECTORS_CANVA`, `RENDER_SELECTORS_GAMMA`);
  if nothing matches it falls back to a single capture.
- The client assembles the slide images into a multi‑page PDF (`pdf-lib`, one image per page) and runs
  it through `extractPdfToTemplate`; **OCR mode** is auto‑selected so each page keeps the slide image as
  its background *and* gets editable recognised‑text overlays.

## Not yet
- Canva/Gamma slide selectors are best‑effort heuristics (their DOM is obfuscated) — tune via the
  `RENDER_SELECTORS_*` env vars if a particular deck doesn't split cleanly.
- DNS‑rebinding is mitigated at the hostname level only (no IP pinning) — pair with egress firewalling.
