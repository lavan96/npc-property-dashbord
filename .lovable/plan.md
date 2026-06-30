
# Mobile & Tablet Responsiveness Overhaul

Frontend-only. Desktop (≥1280px) is untouched. No backend, no business logic, no data-model changes. Every component remains fully functional.

## Audit findings

### A. Breakpoint strategy is desktop-first and inconsistent
- `useIsMobile` flips at **<768px** only — there is no "tablet" branch. Anything 768–1279px gets the desktop layout (sidebar visible, desktop header), but most pages were laid out for ≥1280.
- Tailwind breakpoints used across pages are scattered: `sm:` (640), `md:` (768), `lg:` (1024), `xl:` (1280). Many high-density pages only relax their grids at `xl:` (e.g. `xl:grid-cols-4`, `xl:grid-cols-7`), so tablet portrait/landscape gets cramped 2-up cards with horizontal pressure.
- 40+ pages use `grid-cols-3..9` without intermediate breakpoints. Calendar (10 occurrences), ApiUsage (8), Reports (7), ModelHub (6), Checklists (5), Overview (4) are the worst offenders.

### B. Tables overflow on every page that has one
- 30+ pages render shadcn `<Table>` (a real `<table>`) inside a card without a horizontal scroller, an md→stacked-card alternative, or column hiding. On mobile the layout either explodes width or gets clipped.
- Worst hits: `Listings`, `ClientTracker`, `Commissions`, `TokenAuditLog`, `TokenUsageHistory`, `ModelHub`, `Agreements`, `IndustrialProperties`, all admin tables, all finance-portal tables.

### C. Dialogs/Sheets/Modals are not mobile-shaped
- `DialogContent` default is `max-w-lg` centered with `sm:rounded-lg` — fine at sm+, but several heavy modals (CashFlow, GammaTemplateManager, EnvelopeStatus, ChecklistInstanceView, ReportQA modals, hero image studio, calculator scenario dialogs) override to `max-w-[90vw] h-[90vh]` which on a 424×788 viewport leaves cramped 8px gutters, and headers/footers eat the entire screen.
- Many dialogs put primary CTAs in a desktop right-aligned `DialogFooter`. On mobile they wrap awkwardly and are tappable but not thumb-reachable.

### D. Navigation chrome
- `MobileHeader` + `MobileNav` exist and are well-built, but only mount when `useIsMobile()` is true (<768). **Tablet portrait (768–1023) gets the desktop sidebar pushing content to <600px usable width** — that is the single biggest cause of "compressed" feel on iPad portrait.
- `DashboardSidebar` is not collapsible by default on tablet — it must be either collapsed-by-default at `<lg` or replaced with the mobile drawer below `lg`.
- Bottom `MobileNav` only renders below md. Many top-priority items (Pipeline, Agreements, Calendar) aren't in the 5-slot bottom bar.

### E. Tab strips, toolbars, filter bars
- `<TabsList>` instances across pages render as fixed grids (`grid-cols-4..7`) which crush text and break wrap. Need horizontal-scroll snap on small viewports.
- `DashboardThemeFrame variant="toolbar"` wraps but children are sized with fixed widths (search w-80, selects w-56). On mobile these stack but with no max-width, producing 100%-wide ugly columns.
- Filter dropdown rows on Listings, Conversations, CallLogs, ClientTracker, Pipeline use 4–6 controls inline with no collapse/"Filters" sheet on mobile.

### F. Typography & spacing
- Hero/section padding is locked at `p-4 sm:p-5 md:p-7`, but heading sizes are `text-2xl md:text-3xl xl:text-4xl` — readable, but cards inside heroes use `text-xs` for metrics on mobile, which is below comfortable size for fingertip scanning.
- Touch targets: many icon buttons in toolbars are `h-8 w-8` / `h-9 w-9`. Mobile guideline is 44px (we already use 11×11 = 44px in `MobileHeader`, but page-level toolbars don't).

### G. Forms
- Multi-column forms (`grid sm:grid-cols-2 md:grid-cols-3`) on Settings, WhiteLabel, PortalConfig, PropertyImportPanel, finance-portal settings cram inputs on tablet portrait. Inputs use default `h-9` which is fine, but date pickers and combo selects in side-by-side pairs collide with their labels.
- Number-heavy calculators (Commercial/Industrial cards) put inline inputs + units + sliders horizontally; on mobile the slider track shrinks below usable width.

### H. Charts (Recharts) & data viz
- `ResponsiveContainer` is used but parent cards have fixed `h-[300px]` / `h-[420px]` regardless of viewport. Axis labels and legends overlap on narrow widths. Need responsive heights and legend wrapping.

### I. Misc
- Drawers (Vaul) used in calculator prefill flows render full-height but content is built for desktop columns.
- Bottom-fixed action bars (e.g. `InvestmentReportMobileActionBar`) exist but only for one page — pattern should propagate.
- Several pages still set their own root `max-h-[calc(100dvh-...)] overflow-y-auto` (we already fixed two — DealPipeline & Agreements — but the same pattern lives in CallLogs, Conversations, ReportRequests, PortfolioReports, finance-portal pages). On mobile this creates inner viewport boxes.
- `.dashboard-content` padding (in index.css) is uniform; mobile needs tighter horizontal padding (px-3) and safe-area-inset awareness for iOS notch and bottom nav.

---

## Implementation plan — 7 batches

Each batch is self-contained, ships independently, can be verified visually. No dark-mode/colour-palette/font changes. All semantic tokens preserved.

### Batch 1 — Tablet-aware layout shell (foundation)
Goal: tablet portrait/landscape gets sensible chrome, not the desktop sidebar.

- Add `useBreakpoint()` hook returning `'mobile' | 'tablet' | 'desktop'` (<768 / 768–1023 / ≥1024). Keep existing `useIsMobile` working.
- `DashboardLayout`: at `<lg` (1024) render the mobile-style top bar + bottom nav drawer (reusing existing `MobileHeader` / `MobileNav` / `MobileSidebar`). At `≥lg` render the desktop shell.
- Sidebar: when shown at `lg` (1024–1279), force it `collapsed` by default (icon rail), with hover-expand. At `≥xl` use current expanded default.
- Extend `MobileNav` to a configurable 5-slot + overflow `More` sheet covering all primary routes (Pipeline, Agreements, Calendar, Clients, Reports). Active-route detection unchanged.
- Add `safe-area-inset-bottom` / `env(safe-area-inset-*)` padding to `.dashboard-content`, `MobileNav`, and bottom action bars.
- Tighten `.dashboard-content` padding: `px-3 py-3 sm:px-4 sm:py-4 md:px-6 md:py-6`.

### Batch 2 — Responsive grid normalisation
Goal: kill desktop-only grid breakpoints; introduce a consistent ladder.

- Sweep the high-density pages (Calendar, ApiUsage, Reports, ModelHub, Checklists, Overview, Charts, finance-portal dashboards, admin pages).
- Apply the ladder: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-N` (where N is current). KPI strips: `grid-cols-2 lg:grid-cols-4 xl:grid-cols-7`.
- Replace any `xl:grid-cols-*` that has no `lg:` step with an explicit `lg:` intermediate.
- Replace fixed `gap-6`/`gap-8` on small viewports with `gap-3 sm:gap-4 lg:gap-6`.

### Batch 3 — Table responsiveness
Goal: every data table is usable on mobile/tablet without sideways panning chaos.

- Create `<ResponsiveTable>` wrapper:
  - `<md`: render rows as stacked summary cards (label/value pairs) using a `columns` schema the caller provides.
  - `≥md`: render the current `<Table>` inside a horizontal scroller with sticky first column and shadow-gradient affordance.
- Migrate top 12 table pages first (Listings, ClientTracker, Commissions, TokenAuditLog, TokenUsageHistory, ModelHub, Agreements, IndustrialProperties, finance-portal Purchase Files / Reports / Commissions, admin UserManagement). Remaining tables get the simpler horizontal-scroller fallback in Batch 7.
- For tables with row-actions (kebab menus), promote actions to the card header on mobile.

### Batch 4 — Dialogs, Sheets, Drawers
Goal: modals feel native on phone.

- Patch `DialogContent` default: on `<sm` use `inset-0 h-[100dvh] max-w-none rounded-none` (full-screen sheet), on `≥sm` keep current centered modal. Keep API unchanged.
- Audit and migrate heavy modals to `<Sheet side="bottom">` or full-screen behaviour on `<sm`:
  - CashFlowAnalysisModal, EnvelopeStatusDialog, ChecklistInstanceView, GammaTemplateManager, hero image studio, report QA composer, calculator scenario dialogs, TemplateImportDialog, CreatePlanDialog/CreateReminderForm, AddPhaseDialog.
- Sticky `DialogHeader` and sticky `DialogFooter` with safe-area padding; primary CTA full-width on mobile.
- Drawers: ensure scroll lock and Vaul snap points at `[0.5, 0.95]` on mobile-heavy ones.

### Batch 5 — Toolbars, tabs, filter bars
Goal: tabs scroll, filters collapse into a "Filters" sheet on small viewports.

- Standardise `<TabsList>` for variable-count tabs: add `responsive` variant that becomes `overflow-x-auto snap-x snap-mandatory` with hidden scrollbar at `<md`.
- Build `<FiltersSheet>` mobile pattern: on `<md` collapse filter controls into a single "Filters" button → bottom sheet with the same controls; on `≥md` render inline as today. Wire into Listings, Conversations, CallLogs, ClientTracker, DealPipeline, Agreements, Reports, finance-portal lists.
- Toolbars: minimum touch target 44px on `<md`; remove fixed `w-80`/`w-56` widths below md (full-width); search expands inline.

### Batch 6 — Forms, calculators, charts
Goal: inputs and viz adapt.

- Forms: enforce `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` ladder on Settings, WhiteLabel, PortalConfig, PropertyImportPanel, finance-portal settings, all `Create*` dialogs. Number inputs grow to `h-11` on `<md`. Inline unit suffixes stay; sliders get full-width with 44px thumb.
- Calculators (commercial/industrial cards, depreciation, CGT, stamp duty, LMI): single-column layout `<md`, two-column `md`, current layout `xl`. Result panels move below inputs on mobile.
- Charts: card heights `h-[260px] sm:h-[320px] lg:h-[420px]`; pass `wrapperStyle={{ fontSize: 11 }}` on Legend at `<md`; hide axis label rotation; truncate long category labels.

### Batch 7 — Sweep, polish, regressions
- Visit remaining pages and apply standard ladder + table fallback.
- Remove every page-level `max-h-[calc(100dvh-…)] overflow-y-auto` root (lets the single layout scroller win) — CallLogs, Conversations, ReportRequests, PortfolioReports, finance-portal pages, portal pages.
- Sticky page headers on mobile (title + primary CTA) using `sticky top-0` inside `<main>` scroller.
- Bottom action-bar pattern (similar to `InvestmentReportMobileActionBar`) propagated to: DealDetailView, AgreementDetail, PurchaseFile detail, ChecklistInstanceView, ReportViewer, CommercialPropertyDetail, IndustrialPropertyDetail.
- Add `min-h-[44px]` and `touch-manipulation` to all primary actionable icon buttons under `<md`.
- Verify dark-mode, gold palette, and font stack untouched across changes (lint sweep for new hardcoded colour utilities).

---

## Technical guidance

### New shared utilities (small, frontend-only)
```text
src/hooks/use-breakpoint.tsx        // 'mobile' | 'tablet' | 'desktop'
src/components/ui/responsive-table.tsx   // schema-driven table → card on <md
src/components/ui/filters-sheet.tsx      // wrapper turning toolbar into bottom sheet on <md
src/components/ui/responsive-dialog.tsx  // dialog that becomes full-screen sheet on <sm
```

### CSS additions in `src/index.css` (no token changes)
- `.dashboard-content` padding ladder.
- `.safe-bottom { padding-bottom: max(env(safe-area-inset-bottom), 0.75rem); }`
- `.no-scrollbar` utility for the scrollable tab strips.
- `@media (pointer: coarse)` rule bumping `button[data-mobile-tap]` min-size to 44px.

### Breakpoint ladder used everywhere
```text
default → mobile (<640)
sm:     ≥640
md:     ≥768 (tablet portrait)
lg:     ≥1024 (tablet landscape / small laptop) — sidebar collapses
xl:     ≥1280 (desktop, untouched)
2xl:    ≥1536 (untouched)
```

### Out-of-scope (guardrails)
- No edge functions, no DB, no Supabase calls modified.
- No colour, gradient, shadow, or font token edits.
- No new dependencies — Vaul, shadcn Sheet/Dialog, Tailwind are sufficient.
- No desktop (≥1280) layout changes.
- No copy/content changes.

### Validation per batch
- `bun run build` clean.
- Manual Playwright pass at 390×844 (iPhone 14), 768×1024 (iPad portrait), 1024×768 (iPad landscape), 1280×800 (desktop baseline) — screenshot diff on representative pages.
- Smoke each migrated dialog/table for keyboard + click parity.

### Effort estimate
| Batch | Files touched | Risk |
|---|---|---|
| 1 Layout shell | ~6 | medium (touches root layout) |
| 2 Grid normalisation | ~25 | low |
| 3 Tables | ~12 priority + helper | medium |
| 4 Dialogs | ~12 + dialog primitive | medium |
| 5 Toolbars/Tabs/Filters | ~15 + 2 primitives | low |
| 6 Forms/Calculators/Charts | ~20 | low |
| 7 Sweep | ~40 | low |

---

Approve and I'll start with **Batch 1 (Tablet-aware layout shell)** at maximum effort.
