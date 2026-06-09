# PDF Template Builder

A visual editor for all PDF reports. The same `ReportTemplate` JSON drives the live editor (canvas + inspector) and the production renderer. Production PDFs are rendered through the **HTML → WeasyPrint** pipeline; the legacy `jsPDF` / `pdf-lib` renderer remains as a secondary/fallback path that does not support every block. Preview and export stay in sync **for the selected production engine** — blocks that are only `partial` or `unsupported` on that engine are flagged by the linter (`renderer-partial` / `renderer-unsupported`) and block activation. See [Print-safety lint](#print-safety-lint-phase-5) and [Governance and activation safety](#governance-and-activation-safety) below.

## Quick start

1. Visit `/admin/template-builder` with `templates` module access. Creating, editing, importing, and deleting templates require the matching `templates` edit/delete permissions; superadmins retain full access.
2. Create a template, pick a report type and tier.
3. Drop blocks from the Insert panel onto the active page.
4. Bind any field to live data with `{{property.address}}` or to a brand token with `token:primary`.
5. Use ⌘Z / ⌘⇧Z to undo/redo, ⌘C / ⌘V / ⌘D to copy/paste/duplicate the selected block.

## Bindings

Every text/image/colour field accepts:

| Form | Example | Notes |
|------|---------|-------|
| Literal | `Hello world` | Rendered as-is |
| Data binding | `{{property.address}}` | Resolved against report data at render time |
| Filter | `{{financials.weeklyRent \| currency}}` | Filters: `currency`, `number`, `percent`, `date`, `upper`, `lower`, `default` |
| Brand token | `token:primary` | Looked up in `template.tokens` (with brand fallback) |
| Conditional (block-level) | `tier === 'compass'` | Sandboxed expression; block hidden when false |

Open the **bindings popover** in the header to see every unresolved binding and click to jump straight to the offending block.

## Block library

Cover · Hero · KPI grid · Data table · Chart · Image · Text · Footer · Disclaimer · Divider · Callout · Two-column · Gallery · Page number · Spacer · QR code · Badge list · Contents (TOC) · Signature · Slot · Free overlays.

Each block exposes its own inspector schema (`BLOCK_DEFS`) — extend the registry by adding a renderer + def in `src/lib/reportTemplate/blocks/`. The block registry also declares renderer capabilities for HTML, WeasyPrint, and jsPDF so the builder can warn when a block is production-safe only in the HTML/WeasyPrint pipeline or fully unsupported.

## Reusable slots (Phase 4)

Define a Header / Footer / etc. once in the **Slots** tab, then drop a `slot` block on any page with the matching `slotKey`. Editing the slot updates every page that references it.

## Brand tokens

The **Tokens** tab manages the `tokens.colors`, `tokens.fonts`, and `tokens.spacing` records. Click **Sync from brand** to pull the active `BrandProvider` primary/accent into the `primary` and `accent` token slots. Tokens can be exported / imported as JSON to share themes between templates.

## Print-safety lint (Phase 5)

The **Print safe / N lint** badge in the header surfaces issues that would break the printed PDF:

- `bleed` — overlay extends outside page bounds
- `overlap-edge` — overlay sits within 12pt of the page edge
- `missing-font` — font not bundled with jsPDF (Helvetica / Times / Courier); will fall back
- `tiny-text` — font size below 7pt
- `low-contrast` — text vs page background contrast under WCAG AA (4.5:1)
- `missing-slot` — `slot` block references a key that isn't defined
- `renderer-partial` — block is production-safe but has a renderer caveat, such as a jsPDF placeholder
- `renderer-unsupported` — block has no production HTML/WeasyPrint renderer and blocks activation

Click any issue to jump to the exact block / overlay. Activation readiness separates production renderer blockers from general print-safety errors so reviewers can distinguish export-fidelity caveats from hard activation failures. The **Compatibility** tab provides the same renderer findings grouped by page plus a block capability matrix for every block type currently used in the template. Activation and export actions run renderer pre-flight checks: unsupported production renderers block the action, while partial/legacy renderer caveats require confirmation before continuing. Heavy binding/lint/compatibility analysis is deferred during editing so large templates remain responsive, while activation/export pre-flight runs against the current template state. The secure template API repeats the production-renderer validation during activation so unsupported block types cannot be activated outside the editor UI.

## Versions

Every save can optionally **snapshot** the current schema into `report_template_versions`. From the Versions tab you can:

- **Load** a version into the editor (no save)
- **Restore** a version (snapshots the current schema first, then writes the restored one)
- **Clone as new** (creates a new template from the version's schema)

## Local drafts & recovery

While you edit, the builder **autosaves a local draft to IndexedDB** (per template, debounced ~2s after the last change). This never touches the server — you still **Save** the server copy manually — so autosave can't cause version conflicts.

- If you reload, crash, or navigate away and come back, and the local draft differs from the saved server version, a **recovery dialog** offers to **Restore draft**, **Discard draft**, **Compare JSON**, or **Save as branch**.
- If the server moved on since the draft was taken (someone else saved), the dialog warns that the draft is based on an older version.
- The local draft is cleared automatically after a successful **Save**, or when you explicitly discard it / choose **Review latest** in a save conflict.
- The toolbar status shows `autosaved HH:MM` while there are unsaved changes; hover the status chip for last-saved, last-autosaved, and "unsaved since" times.

Drafts are browser-local (IndexedDB) — they are not shared across devices or users, and degrade to a no-op where IndexedDB is unavailable.

## Report type adapters (Phase 7)

Template Builder production routing is adapter-driven. The generic router never reaches directly into a report table; it asks the adapter registry in `src/lib/reportTemplate/adapters/` to resolve routing metadata and build the binding context for a real report.

| Report type | Status | Notes |
|-------------|--------|-------|
| Investment Report | Production enabled | Uses `investment_reports`, builds the existing `report/property/financials/scores/...` binding shape, and preserves the legacy fallback when no active WeasyPrint template matches. |
| Portfolio Analysis | Preview only | Listed in the builder and can be designed with sample data, but activation is blocked until an adapter is implemented. |
| Cash Flow | Preview only | Legacy generator remains the production path until an adapter is added. |
| Borrowing Capacity | Preview only | Legacy generator remains the production path until an adapter is added. |
| Q&A Export | Preview only | Legacy generator remains the production path until an adapter is added. |
| Suburb / Postcode / Statewide / Comparison / Vownet | Preview only | Available for template design and sample-data validation; production routing is intentionally disabled. |

The editor settings panel shows the selected report type's adapter status as **Production enabled**, **Preview only**, or **Not configured**. Activation readiness also blocks preview-only types so production cannot accidentally route through an incomplete adapter.

### Adding an adapter

1. Create an adapter file under `src/lib/reportTemplate/adapters/` that implements `ReportTemplateAdapter`.
2. Implement `resolveRoutingContext({ reportId })` to return the report type, variant, tier, source table, and fallback descriptor used by the production router.
3. Implement `buildBindingContext({ reportId, brand })` to return the exact binding data shape templates should consume.
4. Register the adapter in `REPORT_TEMPLATE_ADAPTERS` in `src/lib/reportTemplate/adapters/index.ts`.
5. Mark `supportsProduction: true` only after the report type has a real routing context, binding context, fallback story, and sample/report loading path.
6. Add adapter tests that verify route context, binding context shape, sample presets, and fallback behavior.

## Governance and activation safety

Templates locked for review cannot be edited, snapshotted, or deleted until unlocked. Activating a template or marking it as the default requires superadmin access, an approved template status, a report type, and a production-enabled adapter for that report type. Active templates must be deactivated before deletion.

## Performance

The editor is tuned to stay responsive on large, multi-page templates:

- **Deferred analysis** — binding/print-safety/renderer linting runs against a `useDeferredValue` copy of the template and sample data, so typing and dragging are never blocked by validation. Issue panels show an "Updating…" state while analysis catches up; activation/export pre-flight always runs against the live state.
- **Content-keyed previews** — both the live HTML preview and the editorial canvas render their iframe `srcDoc` through a render that is memoized on a *content* signature (`makePreviewKey` / `makeCanvasRenderKey` in `previewCache.ts`), not object identity. Editing one page no longer re-renders the others.
- **Overlay drags don't reload the canvas** — the canvas hides overlays and draws its own handles, so its render key deliberately excludes overlay geometry. Moving/resizing/adding/removing an overlay updates only the React handle layer; the page-background iframe is not rebuilt on every pointer tick.

## Architecture

```
report_templates (DB)
  ├─ tokens   { colors, fonts, spacing }
  ├─ slots    { header, footer, ... } (Phase 4)
  └─ pages[]
       ├─ size, background
       └─ blocks[]
            ├─ type, props
            ├─ overlays[]
            └─ conditional?
```

- **`templateSchema.ts`** — Zod schema + types
- **`bindingResolver.ts`** — `{{path | filter}}`, `token:xxx`, conditional evaluator
- **`bindingValidation.ts`** — pre-export binding linter
- **`lintTemplate.ts`** — print-safety linter
- **`pdfRenderer.ts`** — pure `(template, data, brand) → Blob`
- **`adapters/`** — report-type registry and production binding/routing adapters
- **`blocks/*.ts`** — one file per block type (renderer + def)

## Adding a new block type

1. Create `src/lib/reportTemplate/blocks/myBlock.ts` exporting `drawMyBlock(block, ctx)`.
2. Register the renderer in `BLOCK_RENDERERS` in `blocks/index.ts`.
3. Add a `BLOCK_DEFS` entry: `defaultProps()` + `fields[]` (drives the inspector UI).
4. Add to the `PALETTE` in `PagesPanel.tsx` so users can insert it.

## Migration of legacy generators

Existing PDF generators (`PixelPerfectPDFGenerator`, cash-flow, Q&A, borrowing, disclaimer page) remain the production path. The plan is to wrap each as a seeded default template behind a per-report-type feature flag in a follow-up phase. The `disclaimer` block already ports the legacy `drawJsPDFDisclaimerPage` 1:1 as the reference implementation.
