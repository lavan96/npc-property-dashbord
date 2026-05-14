# PDF Template Builder — Implementation Plan

A Canva × Gamma hybrid editor for all report templates, using **tldraw** as the canvas, **data bindings** as a core primitive, and a **shared JSON schema** that drives both the live editor and the production `jsPDF` / `pdf-lib` output.

## Guiding principles

- **One schema, two renderers.** Editor + PDF output read the same `ReportTemplate` JSON. No drift.
- **Bindings everywhere.** Any text/image/style can resolve to a literal, a brand token, or a data path. Sample data in editor, real data at generation.
- **Print-perfect.** A live PDF preview pane (real jsPDF blob) sits next to the editor — the source of truth for "what the user gets."
- **Backward-compatible.** Existing generators (`PixelPerfectPDFGenerator`, cash-flow, Q&A, borrowing, disclaimer page) become **default templates** that users can fork.

## Architecture

```text
┌──────── report_templates (DB) ────────┐
│ id, name, report_type, tier, version  │
│ tokens  { colors, fonts, spacing }    │
│ pages[] { size, bg, blocks[] }        │
│   blocks[] { type, props,             │
│              overlays[],              │
│              binding?, conditional? } │
└────────────────┬──────────────────────┘
                 │
       ┌─────────┴──────────┐
       ▼                    ▼
  TldrawEditor        pdfRenderer.ts
  (custom shapes)    (jsPDF + pdf-lib
   live preview       drawing primitives)
```

- **`templateSchema.ts`** — Zod schema + TypeScript types for `ReportTemplate`, `Page`, `Block`, `Overlay`, `Binding`, `Token`.
- **`pdfRenderer.ts`** — pure function `(template, data, brand) → Blob`. Resolves tokens + bindings, dispatches per-block to draw helpers (port existing `drawJsPDFDisclaimerPage` first).
- **`bindingResolver.ts`** — `{{property.address}}`, filters (`| currency`, `| date`, `| percent`), conditional eval (sandboxed expression).
- **`TemplateEditor.tsx`** — three-pane layout: Pages sidebar | tldraw canvas | Inspector + Live PDF preview tab.

## Phased delivery

**Phase 1 — Foundation (schema + dual renderer)**
- DB migration: `report_templates` table (id, name, report_type, tier, schema jsonb, version, is_active, created_by, timestamps) with RLS via `invokeSecureFunction` pattern + `ALLOWED_TABLES` whitelist.
- `templateSchema.ts` + `pdfRenderer.ts` with one block type: `disclaimer` (port existing function). Round-trip test: JSON → PDF matches current output byte-equivalent intent.
- Minimal admin route `/admin/template-builder` (gated by superadmin).

**Phase 2 — tldraw editor shell**
- Embed tldraw with custom page size constrained to A4 (595×842pt scaled to display).
- Custom tldraw shapes: `TextOverlayShape`, `ImageOverlayShape`, `BlockShape` (renders block preview thumbnail). Lock shapes inside page bounds.
- Bidirectional sync: tldraw store ⇄ `ReportTemplate` JSON (debounced).
- Inspector panel (right): properties for selected shape — position, size, font, color, **with token-binding dropdown** for every value.
- Live PDF preview tab (regenerates blob on debounce, renders via `<iframe>`).

**Phase 3 — Block library + bindings**
- Block types: `hero`, `kpi-grid`, `data-table`, `chart` (QuickChart URL), `image`, `text-block`, `disclaimer`, `footer`, `cover`.
- Each block ships with: editor preview, jsPDF draw function, default props, JSON schema for inspector.
- Binding picker UI: tree view of available data paths (introspected from sample report payload), filters dropdown, live preview.
- Conditional rendering: per-block `conditional` expression (e.g. `tier === 'compass'`), evaluated at render time.

**Phase 4 — Brand tokens + multi-page**
- Pull from existing `BrandProvider` / `useTokens` — surface as bindable tokens (`token:primary`, `token:bodyFont`, `token:gold`).
- Pages sidebar: reorder, duplicate, delete, conditional pages.
- Reusable component slots (Header / Footer): edit once, applied to all pages that reference them.

**Phase 5 — Polish & migration**
- Print-safety linter sidebar: bleed, contrast, missing fonts, low-DPI images.
- Version history (snapshot per save, restore, diff).
- Wrap each existing generator as a seeded default template; old generators stay as fallback behind a feature flag per report type.
- Docs + onboarding tour.

## Out of scope for v1 (per your decisions)

- AI section generation, AI restyle, AI critique → Phase 6+.
- A/B variant branching → Phase 6+.
- Real-time multiplayer editing → Phase 6+ (tldraw makes this easy later via yjs).

## Key technical notes

- **tldraw canvas units ≠ PDF points.** Store everything in **PDF points** (or % of page); the editor applies a display scale. Keeps the renderer authoritative.
- **Font parity.** jsPDF ships Helvetica/Times/Courier; for custom fonts (e.g. `Playfair`, `Cinzel` from your `cover-editor/types.ts`) we register VFS fonts in jsPDF and load matching webfonts in the editor. Linter warns when a chosen font has no jsPDF mapping.
- **pdf-lib vs jsPDF.** Continue current split: `pdf-lib` for cover-page/disclaimer (vector + image quality), `jsPDF` for body/tables (existing infra). The renderer dispatches per-block to whichever engine fits.
- **Security.** All template CRUD goes through `manage-templates` edge function; new table added to `ALLOWED_TABLES`. Conditional expressions evaluated in a sandboxed expression evaluator (e.g. `expr-eval`), never `eval`.
- **Performance.** PDF preview regen debounced 600ms; rendered in a Web Worker if it blocks UI.

## Deliverables checklist

- [ ] `report_templates` table + RLS + edge function whitelist
- [ ] `templateSchema.ts` + Zod validation
- [ ] `pdfRenderer.ts` with disclaimer block (parity test vs current output)
- [ ] tldraw editor with custom shapes + JSON sync
- [ ] Inspector with token + data binding picker
- [ ] Block library (9 block types)
- [ ] Live PDF preview pane
- [ ] Brand token integration
- [ ] Multi-page management + reusable slots
- [ ] Lint sidebar + version history
- [ ] Migration: existing generators wrapped as default templates

## Estimated scope

Roughly 5 phases × ~1 sprint each. Phase 1+2 alone get a usable internal tool; Phase 3 is when it becomes "wow."

Approve this plan and I'll start with Phase 1 (schema + dual renderer + DB migration).
