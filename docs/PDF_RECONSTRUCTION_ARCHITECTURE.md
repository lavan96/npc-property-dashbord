# PDF / Image → Editable Template — Reconstruction Architecture

> Status: **R0–R6 implemented — roadmap complete** (primitives · text geometry/overlap/colour · editable vectors · embedded fonts · images · grounded AI reconstruct · fidelity loop) · Scope: the "Start from a reference" import/reconstruct pipeline · Last updated: 2026‑06‑10
>
> Goal: turn a PDF or image into a **faithful *and* editable** template — exact text (correctly
> positioned, coloured, and typed), **editable vector icons/logos**, **captured fonts**, real
> images, and correct colours — with **no overlapping/ghosted text**. The AI becomes a *grounded
> classifier*, not a re‑designer.

## 1. Why the current import is wrong (root cause, line‑level)

All four defects originate in `src/lib/reportTemplate/pdfImport/extractPdfToTemplate.ts`. The edge
function is pure persistence; the schema *blocks* the fix.

| Defect | Confirmed mechanism |
|---|---|
| **Text overlaps / ghosting** | ① **one overlay per `getTextContent` item** (a per‑show‑operator *span*), with **no line/paragraph merging, no sort, no de‑dup** (`:162`). ② Wrong geometry: `fontSize = hypot(t[2],t[3])` ignores the horizontal scale `t[0]`; `yTop = pageH − baseline − fontSize` subtracts a **full em** instead of the real **ascent (~0.8em)** (`:147,:151`). ③ **Box inflation** forces every span ≥`fontSize*2` wide `+4pt` (`:167‑168`) → short spans collide. ④ **Dominant:** `hybrid` (the **default**) and `pixel` render a **180‑DPI raster of the page that already contains the text** as the background *and* re‑draw the same text as live overlays → **double text** (`:293` + `htmlRenderer.ts:299/372`). No rotation handling. |
| **Colours lost** | Text colour is **hard‑coded `#111111`** (`:176,:255`). The operator list (where fill colour lives) is never walked; `colorFromArray` is **dead code**. |
| **Icons static, not SVG** | **Zero vector extraction** (no `getOperatorList`/path walking). Vectors survive only as **flattened JPEG‑background pixels** or are **dropped** (`semantic`). `imagesFound` is hard‑wired `0` — embedded images aren't extracted either. |
| **Fonts not captured** | Only pdf.js's *guessed* family name is read → mapped to a generic web stack or **Helvetica** (`fontResolver.ts`). The **embedded font program is never read** (`commonObjs` untouched). Weight/style **regex‑sniffed from the name**, not the font descriptor. |
| **AI "reconstruct"** | The image path is **forced into a "DesignBrief" re‑design pipeline**: it captures only a 4–6 colour palette + a font *vibe* word + 3–7 coarse vertical bands, then **rebuilds on a forced 48pt‑margin/6pt‑grid and may fabricate copy**. Fonts → two hard‑coded stacks. The faithful `screenshot_to_block` prompt is overridden whenever an image is attached. |

**The target format can't hold a faithful result either:** no vector/SVG/path overlay (only
rect/line/ellipse); no rich text (single‑style boxes; the `rich` raw‑HTML hatch is never
auto‑populated); `fontFaces` is **URL‑only** (`.url()` — no `data:`/embedded bytes); weight is
quantized to bold/normal.

## 2. Principles

1. **Deterministic geometry first, AI semantics second, verification last.** Precision comes from
   the PDF's own vector/text/font data — never from an AI's impression of a screenshot.
2. **Editable‑by‑construction** — every element lands as a *native, editable* primitive.
3. **Never double‑layer.** The editable document contains **no text‑bearing raster background**. A
   pixel‑perfect raster, if wanted, is a **separate, locked "Reference/Trace" layer**.
4. **One extraction authority** (server‑side **MuPDF**), feeding a thin client — mirroring the
   existing WeasyPrint microservice.
5. **Fidelity is measured, not assumed** — a render‑and‑diff loop closes the gap.

## 3. Target pipeline (6 stages)

```
            ┌── reference raster (AI grounding + diff)
PDF / image ┤
            └─▶ ① EXTRACT (deterministic) ─▶ ② LAYOUT ANALYSIS ─▶ ③ SEMANTIC (AI, grounded) ─▶ ④ MAP→schema ─▶ ⑤ VERIFY (render+diff) ─▶ editable template
```

**① Extraction (deterministic, high fidelity).** Authority = **MuPDF `mutool`** server
microservice (poppler `pdftocairo` fallback), because pdf.js v4 **removed `SVGGraphics`** and
can't emit editable vectors:
- **Text runs** → MuPDF *structured text* (`stext`): exact text, font, size, weight/italic flags,
  **fill colour**, and bbox per span — the single best source (fixes overlap + colour + weight).
  Client pdf.js stays for instant preview; for colour there, walk `getOperatorList` graphics state.
- **Vectors / icons / logos** → MuPDF page→**SVG** (or a client `getOperatorList`→path walker) →
  editable `<path>` geometry, not pixels.
- **Raster images (XObjects)** → **separate image overlays** (`mutool extract`), not flattened.
- **Embedded fonts** → `mutool extract` → **fontkit** (already a dep) → **woff2**; weight/style/italic
  from the **font descriptor**, not the name.

**② Layout analysis (deterministic + heuristic — kills overlap).**
- **Merge spans → lines → paragraphs → blocks**: cluster by **baseline y**, check **x‑advance
  continuity** and **font‑run boundaries**; split on column gaps. (Even pdf2svg "dumps each snippet
  into a separate box" without this.)
- Reading order, z‑order, column detection; group vector primitives into logical icons/logos; de‑dup.
- Correct geometry: decompose the text matrix — `scaleX=hypot(a,b)`, `scaleY=hypot(c,d)`,
  `rotation=atan2(b,a)`; `fontSize≈scaleY`; `top = pageH − baseline − ascent·fontSize` (real ascent
  from metrics); **drop the `+4`/`2em` inflation**.

**③ Semantic enrichment (AI as a *grounded classifier*).** A new design‑agent **`reconstruct`
mode** receives the **extracted elements (ids + bboxes) + the page raster**; Claude **classifies
regions** (heading/body/KPI/table/chart/logo/divider), **assigns template blocks**, **names
layers**, and **disambiguates reading order / table structure** — **referencing element ids, never
inventing positions, colours, fonts, or copy**. The existing brief/re‑design pipeline is split off
into a separate "redesign from inspiration" feature.

**④ Map → (extended) schema** (see §5) → native overlays; optionally attach the source raster as a
**locked Reference layer** for trace mode.

**⑤ Fidelity‑verify loop.** Render the reconstruction → raster (`html2canvas`/`weasyPreview`),
**SSIM/pixel‑diff vs source** per region; surface per‑region confidence in the existing
**`PdfFidelityDiff`** dialog; auto‑flag / AI‑repair low‑confidence regions; iterate.

## 4. Extraction authority — MuPDF microservice + client pdf.js

- **MuPDF (`mutool`) microservice** (container/edge function) is the authority for `stext` (text +
  colour + font + bbox), SVG (vectors), and font/image extraction. New infra, but it mirrors the
  **WeasyPrint** service exactly.
- **Client pdf.js 4** stays for instant in‑browser preview + page rasterization + a fast text pass.

## 5. Required schema + renderer primitives (additive)

High‑fidelity reconstruction **genuinely requires additive renderer support** — the honest
trade‑off against the editor rehaul's "don't touch the renderers" rule. Changes are **additive**:
existing templates serialize/render **byte‑identically**, so the **golden‑render guard still
passes**; but they *are* renderer changes (new `renderOverlay` cases), flagged explicitly.

| New primitive | Schema | Renderer (HTML/WeasyPrint) | jsPDF (legacy) |
|---|---|---|---|
| **`vector` overlay** | `{ type:'vector', viewBox, paths:[{d, fill, stroke, strokeWidth, fillRule}], x,y,width,height, rotation, opacity }` | inline `<svg>` (native) | path ops or rasterize fallback |
| **Rich‑text runs** | `runs?: Array<{ text, fontFamily?, fontSize?, fontWeight?, fontStyle?, color?, letterSpacing? }>` on the text overlay | styled `<span>`s (the box already renders inline content) | per‑run draw |
| **Embedded fonts** | relax `FontFaceSchema` to accept `data:` (base64 woff2) + `source:'embedded'` | `@font-face{src:url(data:…)}` (already emitted; relax the `.url()` validator) | embed via fontkit |
| **Numeric weight** | `fontWeight: 100–900` (keep `'normal'`/`'bold'` compat) | emit the number | nearest standard |
| **Per‑overlay gradient** (optional) | `fill` accepts a gradient descriptor | `linear/radial-gradient(...)` | approximate |

## 6. Phased implementation plan

Every phase: behind the import flow, **golden‑render‑safe** for existing templates, unit‑tested, CI‑gated.

- **R0 — Primitives:** ✅ **done.** `vector` overlay, rich‑text `runs`, embedded `data:` fonts, numeric
  weight, + the renderer cases + `cssTokens` relax. *Acceptance:* new primitives parse + render; **golden
  test proves existing templates are byte‑identical**; new golden cases cover the new primitives.
- **R1 — Text done right:** ✅ **done (geometry + overlap + colour).** New pure `textLayout` module
  (correct matrix decomposition + baseline, span→line→paragraph **merge**) with thorough unit tests;
  wired `extractPdfToTemplate` to it; **dropped box inflation**; **editable modes no longer emit the
  text‑bearing raster background** (kills the double text); default mode flipped to `semantic`. Plus
  **colour recovery**: pure `textColor` module replays the colour/text‑matrix ops (CTM + fill through
  save/restore) into positioned samples, matched to each span by `nearestColor`; mixed‑colour lines
  become rich‑text `runs`. *Acceptance (met):* no overlap on a multi‑line fixture; no double text;
  source colours preserved (default `#111111` only when no sample exists).
- **R2 — Vectors:** ✅ **done (client path‑walker).** Pure, unit‑tested `vectorExtract` module walks
  pdf.js `getOperatorList()` (graphics‑state stack + CTM) into device‑space SVG paths, clustered into
  one editable `vector` overlay per drawing; fill/stroke colour captured from RGB/Gray/CMYK colour ops.
  *Acceptance (met):* a logo imports as editable paths, not a JPEG.
- **R3 — Fonts:** ✅ **done (embedded sfnt → `data:` `@font-face`).** `getDocument({ fontExtraProperties:true })`
  keeps the reconstructed embedded font bytes on the main thread; the extractor pulls each font from
  `commonObjs`, and the pure, unit‑tested `fontFaceBuilder` turns it into a `tokens.fontFaces` entry with a
  CSS‑safe **unique family per program**, a `data:` URL, and a derived weight/style. Each text span is
  mapped to its embedded family (numeric weight → `fontWeightNumeric`), so `renderTemplateToHtml`
  (editor preview **and** PDF export, both inject `tokensToFontFaceCss`) renders the **source glyphs** with
  no synthetic bolding. Per‑font 2 MB + 6 MB total budget guards schema size. *Deviation:* embeds the
  sfnt directly as a `data:` URL rather than re‑encoding to woff2 (no client‑side woff2 encoder; sfnt
  `@font-face` is universally supported and avoids any cross‑origin/CORS dependency). *Acceptance (met):*
  imported text renders in the source font; weights faithful.
- **R4 — Images:** ✅ **done.** One shared operator‑list walk collects image XObject + inline‑image
  paints with their CTM; pure `imageExtract.imageRectFromCtm` maps each to a device rect; the decoder
  resolves the pdf.js image object (bitmap or raw kind+data), rasterises to PNG, uploads via the import
  edge function and emits an `image` overlay. `imagesFound` now reflects real extracted images.
  *Acceptance (met):* `imagesFound > 0`.
- **R5 — AI reconstruct mode:** ✅ **done.** **Split:** `screenshot_to_block` no longer routes into the
  design‑brief pipeline (line 494) — that pipeline is now explicitly the *redesign‑from‑inspiration* path
  (`mode:'design'` / `'brief'`), surfaced as a distinct "Redesign" choice in the import dialog. **Grounding:**
  the faithful path OCRs the image (Tesseract) into MEASURED text elements via the pure, unit‑tested
  `imageGrounding` module (words→lines, scaled to a proportional page, stable ids) and passes them to the
  agent as authoritative ground truth; the rewritten `screenshot_to_block` prompt forbids inventing /
  rewriting / placeholdering copy and instructs the model to transcribe + place measured elements and only
  *classify* their role. *Acceptance (met):* image import preserves measured layout and copy; redesign is
  opt‑in. *Follow‑up (resolved in R7):* the agent no longer grid‑snaps applied ops in faithful modes.
- **R6 — Fidelity loop:** ✅ **done.** Pure, unit‑tested `fidelityMetrics` module computes **per‑region SSIM**
  (means/variances/covariance with the standard constants) over a normalised comparison raster, bands each
  grid cell high/medium/low, and aggregates an overall confidence score. `PdfFidelityDiffDialog` now scores
  every page (source pdf.js raster vs `html2canvas` template render), shows a **fidelity % badge + a
  confidence heatmap** over the source pane, and — when an apply handler is supplied — **AI‑repairs** the
  low‑confidence regions: it merges them into page‑point rects (`lowRegionsToPageRects`), builds a grounded,
  region‑scoped instruction (`buildRepairInstruction`), sends it with the source image to the design agent
  (`art_director`), applies the result and re‑scores. *Acceptance (met):* drift is measured per region,
  surfaced, and repairable. *Follow‑ups still open:* true vector/image paint‑order z‑indexing.
- **R7 — Fidelity + auth hardening (2026‑06):** ✅ **done.**
  - **Tokens derived from the source** (`pdfImport/tokenDerivation.ts`): `tokens.colors`/`tokens.fonts`
    are computed from measured text colours (glyph‑weighted), vector fills (area‑weighted), and font
    usage — replacing the hard‑coded gold/white/Helvetica defaults.
  - **Hybrid mode rebuilt:** semantic extraction + the page raster attached as a **locked, hidden
    "Source reference" overlay** (renderers skip hidden overlays — no ghosted double text, raster
    stays available for tracing). OCR mode samples each word's **ink colour** from the raster
    (`pickInkColor`).
  - **Loadable fonts:** `fontCatalog.ensureCatalogFontFaces` attaches Google‑Fonts `cssUrl` faces for
    every catalog‑known family an import references, so the editor preview AND the WeasyPrint export
    render the real typeface instead of silently falling back.
  - **Agent faithfulness:** no 6pt grid‑snap in faithful modes (positions are measured), numeric font
    weights preserved (`fontWeightNumeric`), 32K output budget for reconstruction calls (8K truncated
    dense pages), and measured colour/font ground truth forwarded from grounding into the prompt with
    explicit font‑matching instructions.
  - **Code imports:** `render-source` returns painted element boxes (`shapeBoxes`) → editable shape
    layers carry section fills/borders/radii natively; trace rasters attach as hidden locked overlays
    instead of page backgrounds (visible only when a page has no editable layers at all).
  - **Auth:** `render-source`/`template-import-pdf`/`template-design-agent` verify the custom session
    in‑function (`_shared/auth.verifyAuth`) with `verify_jwt = false` pinned in `config.toml`; upstream
    render‑service credential failures map to 502 `render_source_auth_misconfigured` (never a
    user‑facing 401); all template‑builder clients invoke through `invokeSecureFunction`.
- **R9 — Consolidated import system + background/icon fidelity (2026‑06):** ✅ **done.**
  - **One orchestrator** (`ingestion/importOrchestrator.ts`): every import source (PDF · image ·
    code/ZIP · live URL · Figma `.make`/`.fig`) routes through `runReferenceImport` with one
    classifier, shared staging/validation/error handling, the render‑service local fallback, and
    catalog font loading. `ReferenceImportDialog`, `ImportPdfDialog`, and `ResyncPdfDialog` are now
    UI‑only shells over it.
  - **Page background colours:** full‑bleed solid paints (shading or single‑path vector rects)
    promote to `page.background.color` (the giant locked rectangle disappears); otherwise the page
    edge is sampled from a low‑DPI raster (`dominantEdgeColor`) so pages whose background lives in
    flattened art import tinted instead of stark white. Sampled/promoted colours feed token
    derivation.
  - **Icon pack:** curated 24×24 stroke icon vocabulary (`iconPack.ts`, ~49 glyphs; Deno twin in
    `_shared/iconPack.ts`). The design agent places icons BY NAME (`{ type:'vector', icon:'map-pin',
    color }`) and the edge function expands them into schema‑valid vector overlays — pictograms in
    references are reproduced from the pack instead of being approximated with crude shapes,
    drawn as text, or dropped; the model never emits raw path data.
- **R8 — Exact-source fidelity (2026‑06, corpus: designed PDF cover · single-file TSX · Figma .make):** ✅ **done.**
  - **PDF shading fills** (`pdfImport/shadingExtract.ts`): axial/radial shadings (the gradient page
    backgrounds of designed covers, previously dropped → blank white pages) reconstruct as editable
    shape overlays with CSS `linear/radial-gradient` fills; mesh shadings flatten to their average
    colour; clip rects are tracked through save/restore so partial-page shadings keep their extent.
  - **PDF ExtGState alpha** (`ca`/`CA`) folds into vector colours as 8-digit hex — 10%-white "glass"
    panels no longer import opaque. Shared helpers in `cssColor.ts` (`toRendererHex` keeps alpha that
    the renderer's `normaliseCssColor` would strip; gradients pass through the shape renderer verbatim,
    with a first-stop fallback in the legacy jsPDF engine).
  - **C3 TSX harness** (`render-source/server.js`): explicit `Babel.transform` with
    `typescript {isTSX}` (the declarative preset attribute could not parse real .tsx at all), React
    hooks exposed as globals (stripped imports), the Tailwind Play CDN (exported components are
    routinely Tailwind-styled), and a `document.fonts.ready` settle before measuring/screenshotting.
  - **DOM extraction v2:** effective opacity (ancestor product), painted-colour resolution for
    gradient-clipped (`bg-clip:text`) transparent text, line-height capture, gradient/blur/box-shadow/
    %-radius capture on shape boxes → CDIR shape layers carry `blur`/`shadow` into overlay `effects`.
  - **Figma `.make`/`.fig` ingestion** (`ingestion/makeImport.ts`): dependency-free ZIP reader
    (central directory + `DecompressionStream`), recovers the export's bundled page rasters and routes
    the largest through the faithful image pipeline; canvas-only exports get explicit guidance instead
    of a generic rejection.

## 7. Trade‑offs & risks

- **Editable vs pixel‑perfect:** native primitives are editable but not 100% pixel‑identical to a
  scanned brochure → the **locked Reference/Trace layer** covers the "exact" need.
- **Subset fonts:** PDFs embed only used glyphs → a captured subset has no glyphs for *newly typed*
  characters → strategy: embed for display **+** map to the closest full web font as the editing
  fallback.
- **New server infra (MuPDF):** the cost of real fidelity; pdf.js v4 alone can't emit editable vectors.
- **Renderer changes:** additive only; the golden‑render snapshot in CI enforces that existing
  output is unchanged.

## 8. Isolation & verification

- **Golden‑render guard** (`goldenRender.spec.ts`) + the CI workflow (`.github/workflows/ci.yml`)
  run on every PR; renderer additions must keep existing output byte‑identical.
- All new logic (matrix math, line‑merge, schema, mapping) lands as **pure, unit‑tested modules**.

## 9. Sources

PDF.js text/color: [#7895](https://github.com/mozilla/pdf.js/issues/7895),
[#10497](https://github.com/mozilla/pdf.js/issues/10497); SVG backend removed in v4:
[#19417](https://github.com/mozilla/pdf.js/issues/19417); fontkit:
[foliojs/fontkit](https://github.com/foliojs/fontkit); pdf2svg (poppler/cairo):
[dawbarton/pdf2svg](https://github.com/dawbarton/pdf2svg); vector extraction:
[pdfplumber #667](https://github.com/jsvine/pdfplumber/discussions/667); layout analysis:
[Springer hybrid DLA](https://link.springer.com/chapter/10.1007/978-3-031-41734-4_12).
