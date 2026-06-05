# Template Builder → WeasyPrint (Pilot: Investment Compass)

## Goal

Let users edit Investment Compass PDFs visually in the existing Template Builder, with WeasyPrint as the production renderer. The `ReportTemplate` JSON schema stays the single source of truth — jsPDF drives the in-editor live preview, WeasyPrint drives the "Render production PDF" button and the real generation pipeline.

## Architecture

```text
       ┌─────────────────────────┐
       │  Template Builder UI    │  edits ReportTemplate JSON
       └───────────┬─────────────┘
                   │
                   ▼
       ┌─────────────────────────┐
       │   ReportTemplate JSON    │  (single source of truth)
       │   pages → blocks → props │
       └─────┬───────────────┬────┘
             │               │
   live preview            production
     (in editor)           (export + Compass generation)
             │               │
             ▼               ▼
   pdfRenderer.ts       htmlRenderer.ts  ──►  WeasyPrint  ──►  PDF
     (jsPDF)               (HTML+CSS)         (Python svc)
```

Both renderers walk the **same** schema. Drift is bounded by per-block unit tests that snapshot props → output.

## Phased delivery

### Phase 1 — HTML compiler skeleton (foundation)

- New `src/lib/reportTemplate/htmlRenderer.ts` — pure `(template, data, brand) → { html, css }`
- New `src/lib/reportTemplate/blocks/*.html.ts` siblings for each block type
- Token → CSS variables compiler: `tokens.colors/fonts/spacing` → `:root { --primary: …; }`
- Per-template free-form `customCss` field (escape hatch, lint-scoped)
- Page layout via WeasyPrint `@page` rules driven by `template.pages[].size`
- Block coverage in Phase 1: cover, text, kpiGrid, dataTable, divider, spacer, footer, pageNumber

### Phase 2 — Remaining block coverage

Port all remaining blocks in `src/lib/reportTemplate/blocks/`:
hero, chart, image, gallery, callout, twoColumn, badgeList, toc, signature, slot, disclaimer, qrCode, scorecard, strengthsWatch, riskRegister, decisionBox, ddChecklist, infraTimeline, planningTable, amenityMatrix.

Charts: render via QuickChart image URL (already used elsewhere) so WeasyPrint just embeds an `<img>`.

### Phase 3 — Edge function + storage

- New edge function `render-template-pdf` (mirrors `render-investment-report-pdf` shape):
  - Input: `{ templateId, reportData, brand, mode: 'preview' | 'final' }`
  - Loads template via `manage-templates`, runs htmlRenderer, POSTs to WeasyPrint service, returns signed URL of stored PDF
- Add `engine` column to `report_templates` (`'jspdf' | 'weasyprint'`, default `'jspdf'`)
- ALLOWED_TABLES untouched (read uses existing `manage-templates`)

### Phase 4 — Editor wiring

- Existing jsPDF preview stays as the live in-editor canvas (fast)
- Add **"Preview WeasyPrint output"** button in the editor header → opens generated PDF in new tab
- Add Engine selector to template settings (jspdf | weasyprint) — chooses which renderer is used at production time
- Add "Custom CSS" tab next to Tokens / Slots / Versions

### Phase 5 — Investment Compass pilot

- Seed one `report_templates` row: `report_type = 'investment'`, `tier = 'compass'`, `engine = 'weasyprint'`
- Initial schema: port the existing `report.html.ts` cover + a representative chapter as blocks, so editors immediately have a usable starting point
- Add feature flag in `render-investment-report-pdf`: when a Compass report has an active template with `engine = 'weasyprint'`, route through `render-template-pdf` instead of the hard-coded HTML builders
- All non-Compass reports untouched

## Technical details

**Files added**
- `src/lib/reportTemplate/htmlRenderer.ts`
- `src/lib/reportTemplate/blocks/*.html.ts` (one per block)
- `src/lib/reportTemplate/cssTokens.ts` (token → CSS var compiler)
- `supabase/functions/render-template-pdf/index.ts`

**Files modified**
- `src/pages/admin/TemplateBuilderEditor.tsx` (add WeasyPrint preview button + engine selector + custom CSS tab)
- `src/hooks/useReportTemplates.ts` (surface `engine`, `custom_css`)
- `supabase/functions/render-investment-report-pdf/index.ts` (Compass-only feature-flag fork)
- `weasyprint-service/app.py` — only if we need to accept inline CSS (already does)

**DB migration** (one migration, awaiting approval)
- `report_templates` add `engine text not null default 'jspdf' check (engine in ('jspdf','weasyprint'))`
- `report_templates` add `custom_css text`

**Risks / known tradeoffs**
- Absolute-positioned overlays from the editor canvas need translation to `position: absolute` inside a `position: relative` page — pixel parity with jsPDF preview is approximate, not exact. Acceptable for v1.
- WeasyPrint cold start ~1–2s on the existing service; the editor preview button shows a spinner.
- Charts via QuickChart introduce an external dependency in the PDF render path (already true elsewhere).

## Scope guardrails

- No changes to non-Compass report generation
- jsPDF renderer untouched
- No schema breaking changes — `engine` and `custom_css` are additive with safe defaults
- WeasyPrint service container itself is not modified

## Out of scope (future phases)

- Migrating other report types (Cash Flow, Q&A, Borrowing) — same pattern, separate ticket
- Removing jsPDF entirely
- Visual diff regression tests between jsPDF and WeasyPrint outputs
