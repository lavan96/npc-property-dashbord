# PDF Import Phase 7D — Template Editor Fidelity

## 1. Objective

Identify the actual Template Builder editor rendering pipeline and harden the core
utilities that affect visual fidelity — page geometry, source-raster alignment,
editable-overlay alignment, layer ordering, font fallback, text consistency, and
the Visual QA capture surface — **without rewriting the editor or changing schema
structure**. This phase adds shared, unit-tested primitives that the renderer,
the editor canvas, and the Visual QA capture can converge on.

## 2. Renderer files identified

Traced from route `/admin/template-builder/:id`:

- **Editor route component:** `src/pages/admin/TemplateBuilderEdit.tsx`
- **Page renderer (interactive canvas):** `src/components/templateBuilder/EditorialCanvas.tsx`
- **Page/block renderer (production HTML → WeasyPrint):** `src/lib/reportTemplate/htmlRenderer.ts` (`renderTemplateToHtml`)
- **Legacy block renderer (jsPDF):** `src/lib/reportTemplate/pdfRenderer.ts`
- **Text renderer:** text blocks/overlays styled in `htmlRenderer.ts`; interactive text via `FloatingTextToolbar.tsx` / `BlockStylePanels.tsx`
- **Image renderer:** image blocks/overlays in `htmlRenderer.ts` and `EditorialCanvas.tsx`
- **Background / source-raster renderer:** `page.background` + `page.sourceRasterRef` (schema) drawn by `htmlRenderer.ts` / `EditorialCanvas.tsx`
- **Layer-order source of truth:** `src/lib/reportTemplate/paintOrder.ts` (`overlayPaintOrder`, `blockPaintOrder`)
- **Screen↔page coordinate mapping:** `src/lib/reportTemplate/overlayDropFactory.ts` (`screenToPagePoint`)
- **Visual QA capture surface:** `src/lib/reportTemplate/ingestion/visualQuality/generatedRenderCapture.ts`

`paintOrder.ts` is explicitly the single stacking source for the editor canvas,
the HTML/WeasyPrint renderer, and the jsPDF renderer — so any fidelity change that
touches stacking must go through it (or the new `layerOrdering.ts` above it), never
re-implemented per surface.

## 3. Current fidelity risks

- **Page scaling mismatch** — editor canvas zoom vs. renderer page box; if the two
  derive page size differently, overlays drift.
- **Background raster not matching page bounds** — a full-page PDF-import raster must
  fill the exact page box (`background-size:100% 100%`); any letterboxing shifts every
  overlay relative to the source.
- **Text overlays drifting from the source raster** — sub-pixel rounding / font metric
  differences accumulate down the page.
- **Inconsistent layer ordering** — background/source-raster/image/shape/table/text must
  stack identically across editor, export, and capture.
- **Browser font fallback mismatch** — a substituted font changes advance widths, so text
  wraps/positions differently than the source and than export.
- **Image crop/fit drift** — object-fit / crop rounding between editor and renderer.
- **Editor chrome accidentally included in capture** — selection handles, guides, and
  other `editor_control` layers must be excluded from the Visual QA render.

## 4. Fixes implemented

Phase 7D adds two shared, dependency-free, unit-tested primitives as the foundation
for the above (building blocks; deliberately **not** wired into the editor yet to avoid
a risky editor rewrite — wiring is a scoped follow-up):

- **`src/lib/reportTemplate/rendering/pageGeometry.ts`** — one definition of the page box
  and rect math: `normalizePageSize` (rejects non-finite / non-positive sizes),
  `getPageAspectRatio`, `pageBounds`, `scaleRect`, and `fitRectToPage` (clamps content
  inside the page, never producing negative extents). Directly targets *page scaling
  mismatch*, *raster/page-bounds mismatch*, and *image crop/fit drift*.
  Tests: `src/lib/reportTemplate/__tests__/pageGeometry.spec.ts`.

- **`src/lib/reportTemplate/rendering/layerOrdering.ts`** — a coarse render-layer taxonomy
  (`page_background < source_raster < image < shape < table < text < editor_control`, with
  `unknown` below text) plus `inferBlockLayerKind` and a stable `sortBlocksForRender`.
  Directly targets *inconsistent layer ordering* and *editor chrome in capture*
  (`editor_control` is a distinct, top-most, capture-excluded kind). Complements
  `paintOrder.ts` (which ranks within a layer) rather than replacing it.
  Tests: `src/lib/reportTemplate/__tests__/layerOrdering.spec.ts`.

## 5. Manual validation flow

```
Import PDF
→ Open editor
→ Compare source PDF against editor preview
→ Run Visual QA
→ Run Repair
→ Apply Repair
→ Compare again
```

## 6. Known remaining defects

- Font fallback still relies on browser/renderer substitution; no advance-width
  reconciliation yet (deferred — likely Phase 7D.4+).
- The two new primitives are not yet consumed by `EditorialCanvas` / `htmlRenderer` /
  `generatedRenderCapture`; wiring them in (behind the existing paint-order contract)
  is the next targeted step.
- Editor-control exclusion from the Visual QA capture is defined as a layer kind but not
  yet enforced in `generatedRenderCapture.ts`.
