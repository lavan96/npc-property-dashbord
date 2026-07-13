
# Charts Page — Live Rendering Migration Plan

## Problem

The Charts gallery (`src/pages/Charts.tsx` + `src/components/charts/*`) currently stores each chart as a rasterised image (`chart_images.image_data` — PNG/SVG base64 from QuickChart or the report generator). Cards render `<img>`s; only the expanded/export views opportunistically upgrade to `LiveChartRenderer` when `chart_config` happens to be parseable. Results: blurry cards at high DPR, no theming, no interactivity, no dark‑mode adaptation, huge DB payloads, inconsistent sizing.

Meanwhile, other surfaces (10‑Year Cash Flow, Portfolio Performance Review, Borrowing Capacity Snapshot, Finance Portal Insights, Marketing Analytics) render live Recharts from typed config objects — crisp, themed, interactive, exportable on demand.

## Goal

Standardise the Charts page on the same **config‑first, render‑live** pipeline used elsewhere. Static images become a fallback for legacy rows only. New charts persist a normalised `chart_config` (labels + datasets + type + options) and are rendered live at every zoom level, with on‑the‑fly PNG export for downloads.

## Phased Execution

### Phase 1 — Shared Live Chart Kernel
- Extract a single `LiveChart` primitive under `src/components/charts/live/` that wraps `ResponsiveContainer` + Recharts (Bar/Line/Area/Pie/Donut/Scatter/Radar) driven by a strict `NormalisedChartConfig` type.
- Move the ad‑hoc logic in `ChartRenderer.tsx` (`normaliseConfig`, `canRenderLiveChart`) into `src/lib/charts/normaliseChartConfig.ts` with unit tests. Accept both legacy QuickChart shape and the shape used by Cash Flow / Portfolio components.
- Add semantic token adapter (`useChartPalette`) that pulls colours from `--brand-*`, `--success`, `--info`, `--accent`, `--muted-foreground` — no hardcoded hex. Respect dark‑gold theme and reduced‑motion.
- Add `LiveChartSkeleton` + `LiveChartError` states.

### Phase 2 — Normalisation & Backfill of `chart_config`
- Guarantee every new `chart_images` row is written with a complete `chart_config` (type, labels, datasets, options, palette hint) alongside `image_data`. Update all producers:
  - `supabase/functions/*` that write into `chart_images` (report generation, quantitative report pipeline).
  - `src/lib/quickchart.ts` (`generateChartUrls`) — persist the config alongside the URL.
- One‑off SQL backfill: for rows where `chart_config` is null but `image_data` is a QuickChart URL, decode the `c=` param and store the parsed config. Rows that can't be recovered stay image‑only and use the fallback renderer.

### Phase 3 — Charts Page Rewrite (card, list, expanded)
- `ChartCard` grid tile now defaults to `<LiveChart variant="card">`; only falls back to `<ChartBitmapImage>` when `canRenderLiveChart(chart) === false` (legacy).
- `ChartListRow` mirrors the same rule for its inline preview.
- `ChartLightbox` (expanded modal) always uses `LiveChart variant="expanded"` with legend + tooltips + axis labels; toolbar gains a "View data" table for accessibility.
- Preserve current selection, filter, delete, and analysis‑text UX untouched.

### Phase 4 — Export Pipeline Rebuild
- Replace `useChartExport` bitmap download with an on‑demand render:
  - PNG: render `LiveChart variant="export"` into a hidden 1920×1080 container, snapshot via `html-to-image` (already in deps for other exports; otherwise use `dom-to-image-more`).
  - SVG: pull Recharts' own SVG node — sharp at any zoom.
  - CSV: emit the underlying dataset for the row.
- Bulk export ("Export selected") reuses the same path so downloads match on‑screen rendering exactly.

### Phase 5 — Producer Alignment (Report Generator)
- Update the quantitative report generator so it stops sending QuickChart PNG URLs into `chart_images`. Instead:
  - Compute the same `NormalisedChartConfig` server‑side (already have the data — it's fed to QuickChart today).
  - Stop persisting `image_data` for new rows (or keep only a small placeholder). `image_data` becomes optional.
  - The Reports page and PDF pipeline continue to receive QuickChart URLs *only* where a rasterised image is genuinely needed (PDF embedding), computed on demand from the stored config via a shared `configToQuickChartUrl()` helper — not stored.

### Phase 6 — Cleanup, Perf & QA
- Virtualise the grid (`react-virtual`) so >200 charts render smoothly; live charts only mount when in viewport.
- Remove now‑dead code (`ChartBitmapImage` fallback stays but its callers shrink; the `Chart preview unavailable` error state stays for legacy rows).
- Regression matrix: light/dark mode, 100 %/125 %/150 % zoom, mobile 423 px, legacy image‑only rows, mixed bar/pie/line/area, empty datasets, 500+ chart pagination.
- Add Vitest coverage for `normaliseChartConfig` + a Playwright smoke test for Charts page render + export.

## Technical Details

- **Files added:** `src/components/charts/live/LiveChart.tsx`, `src/components/charts/live/LiveChartSkeleton.tsx`, `src/lib/charts/normaliseChartConfig.ts`, `src/lib/charts/configToQuickChartUrl.ts`, `src/lib/charts/useChartPalette.ts`, `src/lib/charts/__tests__/normaliseChartConfig.spec.ts`.
- **Files edited:** `src/components/charts/ChartRenderer.tsx` (thin re‑export), `ChartCard.tsx`, `ChartListRow.tsx`, `ChartLightbox.tsx`, `useChartExport.tsx`, `src/pages/Charts.tsx`, `src/lib/quickchart.ts`, quantitative‑report edge functions writing `chart_images`.
- **DB:** additive migration only — no schema change needed (`chart_config` column already exists as `any`). One backfill migration decoding QuickChart URLs.
- **Non‑regression:** existing static images continue to render; download filenames, selection state, filters, delete flow, analysis text, ReportViewer usage unchanged.
- **Design tokens:** all colours via semantic CSS vars — no `#hex` in components. Reduced‑motion honoured via `prefers-reduced-motion`.
- **Rollout:** ship phase by phase; each phase is independently deployable and the page stays functional at every step.
