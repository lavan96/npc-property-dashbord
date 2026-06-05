# Template Builder → Canva/Gamma-Class Editor

Everything from the brainstorm, structured into 12 phases. Each phase is independently shippable; phases are ordered so later work compounds on earlier foundations. We'll run them sequentially at "maximum effort" unless you say otherwise.

---

## Phase 1 — Foundations: Tokens, Theme & Brand Kits
Goal: every later block reads from a single design-token spine.
- `design_tokens` table (per-template + per-brand-kit): colors, fonts, type scale, spacing scale, radii, shadows, gradients.
- `brand_kits` table (org-scoped, reusable): logos, palettes, font pairings, default footer/disclaimer.
- Theme switcher in builder header (Light / Dark / Print-safe / Custom).
- Gradient editor, eyedropper, tint/shade ramps, WCAG contrast checker, Pantone/CMYK display values.
- CSS-variable pipeline: tokens → `cssTokens.ts` → both web preview and WeasyPrint render.

## Phase 2 — Canvas & Editing Surface
Goal: feels like Canva/Figma, not a form.
- True WYSIWYG canvas with zoom, pan, fit-to-page.
- Rulers, snap guides, grid overlay, bleed/trim/safe-area indicators.
- Drag-to-reorder, drag-to-resize, multi-select, group/frame, alignment + distribute tools.
- Outline panel (page → section → block tree) with drag reordering.
- Master pages + per-page overrides; section grouping; per-page background.
- Undo/redo stack, keyboard shortcuts, command palette (⌘K), saved selections.

## Phase 3 — Block Library Expansion
Goal: cover every report shape we'll ever need.
New blocks: Quote, Stat Card, Comparison Table, Timeline, Gantt, SWOT, 2×2 Matrix, Map (static + Mapbox), Mini-charts (spark/bar/donut), Icon, Tag/Badge Cloud, Author Bio, Image Collage, Video Poster, Embed Placeholder, AI Summary, Conditional, Repeater, Divider variants, Pull-quote, Footnote.
- Each ships with HTML renderer + builder inspector + sample data.
- Block search + categorized library panel + favorites.

## Phase 4 — Typography System
- Font picker (Google + uploaded), per-block overrides, paragraph styles, type scale presets.
- Drop caps, small caps, OpenType features, optical sizing, hyphenation, vertical rhythm.
- Per-template font loading optimized for WeasyPrint.

## Phase 5 — Layout & Spacing Controls
- Margin/padding per block, column layouts, auto-layout containers.
- Background per block/page, border, shadow, dividers, corner radii tokens.
- Responsive scaling rules for different page sizes (A4 / Letter / 16:9 / custom).

## Phase 6 — Images & Media
- Built-in image editor (crop, rotate, filters, brightness/contrast).
- Background remover, smart object-fit + focal point, image masks.
- Hero Image Studio integration (already live) + stock search + AI image generation + Lottie/static poster.

## Phase 7 — Data Binding & Logic
Goal: bindings become first-class, not magic strings.
- Visual binding panel: drag fields from a Data tree onto any block prop.
- Inline expressions, custom computed fields, conditionals, loops/repeaters.
- Sample data switcher (per template), missing-data linter, variant blocks.
- Binding autocomplete + type-safety against the source schema.

## Phase 8 — Component System & Reuse
- Reusable components with overrides (think Figma components).
- Slot system, component library per workspace, component marketplace seed.
- Theme inheritance + snippet library.

## Phase 9 — AI-Assisted Editing
- Layout suggestions, copy rewriting, translation, table auto-summarize.
- Auto-pick hero image, "improve aesthetics" one-click, page-quality score.
- Generative cover designer, auto-layout from outline, "style match" from reference PDF.

## Phase 10 — Versioning, Collaboration & Workflow
- Version history with diff + restore, branching.
- Realtime co-editing, comments, review/approval, audit log.
- Scheduled publish, A/B variants, template analytics (usage, edits heatmap, engagement).

## Phase 11 — Preview, QA & Export
- Side-by-side preview (web ↔ PDF), real-data preview, multi-format preview.
- Broken-binding linter, performance budget, print proof, accessibility audit.
- Exports: WeasyPrint PDF, PDF/A, PDF/X, PPTX, DOCX, HTML, watermark, password, auto TOC, cross-refs, cover variants.
- Per-section headers/footers, running headers, first/last-different, custom page-break rules.

## Phase 12 — Power-User & Polish
- Custom CSS per template + raw HTML block + CSS variable overrides.
- Plugin SDK + CLI/API.
- Asset DAM, locale/RTL, required-disclaimer rules, region-specific content.
- Onboarding tour, "Wow" generative cover designer, theme marketplace, live brand-sync.

---

## Execution Notes
- Each phase ends with: migration (if needed) + builder UI + renderer support + WeasyPrint parity test against the Compass pilot.
- Compass template stays the canary — every phase is verified by re-rendering it.
- Feature-flagged rollout per phase; old builder remains usable until Phase 2 lands.

Approve and I'll start Phase 1 immediately.