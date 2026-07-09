
# OpenRouter Tab Facelift — Model Hub

Goal: turn the OpenRouter tab from a truncated 60-card grid into a premium, fully browsable catalog that exposes the rich metadata OpenRouter already returns, matches the Aurixa aurora-gold language, and lets users page through every model without needing to search.

Scope is strictly the OpenRouter tab of `src/pages/ModelHub.tsx`, the `OpenRouterCatalog` component, its supporting card, and the OpenRouter branch of the `check-model-availability` edge function. No changes to Gateway/Native tabs, Agent Bindings, routing, RLS, or agent binding writes.

---

## Phase 1 — Data enrichment (edge function, additive only)

`supabase/functions/check-model-availability/index.ts` → `probeOpenRouter`

Extend the `ProbedModel` mapping to persist the fields OpenRouter already returns but we currently discard:

- `description` (short model blurb)
- `input_modalities` / `output_modalities` (from `architecture`)
- `tokenizer` (from `architecture.tokenizer`)
- `top_provider.name`, `top_provider.max_completion_tokens`, `top_provider.is_moderated`
- `per_request_limits` (rate/quota when published)
- `pricing.image`, `pricing.request` (in addition to prompt/completion)
- `created` → normalized `released_at` ISO string
- Derived `family` (first path segment) and `series` (e.g. `claude-3.5`, `gpt-4o`) for grouping

Add a lightweight `ProbedModelExtras` type; keep existing fields to preserve Gateway/Native shape. `raw_metadata` already flows through — the UI will read the new named fields instead of digging into `raw_metadata` so we get typing.

No schema/DB changes. Response contract is a superset — existing consumers unaffected.

## Phase 2 — Type + selector updates (client)

- Extend `CatalogModel` in `ModelHub.tsx` with the new optional fields.
- Add a small helper `src/lib/openrouter/format.ts`:
  - `formatPricePerMTok(n?: number)`
  - `formatContext(n?: number)` → `128K`, `1M`
  - `modalityIcons(inputs, outputs)` → lucide icon set
  - `familyFromId(id)` and `providerBrandColor(family)` (semantic token map — no hardcoded hex)
  - `sortComparators`: `popular` (default from OpenRouter order), `newest` (released_at), `context-desc`, `price-asc`, `name-asc`

## Phase 3 — Visual redesign (aurora-gold, on-brand)

Rebuild `OpenRouterCatalog` as three stacked regions inside an `aurixa-aurora-bg` frame:

1. **Hero strip** — serif `AurixaSectionHeader` "OpenRouter Catalog", live count (`{orModels.length} models · {families.length-1} providers`), last-probed timestamp chip, and a compact provider-mix sparkline (top 6 families as gold hairline bars).
2. **Command bar** — glass toolbar with: search (debounced 200ms via existing `useDebounce`), family multi-select, modality chips (Text/Vision/Audio/Image-out), capability chips (Reasoning/Tools/JSON), context-window slider (min ctx), sort dropdown, and a view toggle (Grid ⇄ Table).
3. **Results region** — either grid of new `OpenRouterModelCard` or a dense `OpenRouterModelTable`.

`OpenRouterModelCard` (glass, 20px radius, gold hairline on hover):
- Header: family medallion (tinted by family via semantic tokens), model display name in display-serif, `model_id` monospaced under it.
- Meta row: context pill, modality icon cluster, moderated/unmoderated pill, "new" gold pill if released ≤ 30 days.
- Pricing strip: `$/1M in` and `$/1M out`, plus image-price when present, with a subtle bar visualising cost relative to the cheapest model in the current filtered set.
- Description clamped to 3 lines; expandable inline.
- Footer: "Assign to agent" ghost button (opens existing Agent Bindings deep link — no new write logic), copy-id icon button, OpenRouter docs external link.

`OpenRouterModelTable` (dense mode): columns Name / Family / Context / Modalities / In $ / Out $ / Released — sortable headers reuse the same comparators.

All colors via existing tokens (`--aurixa-*`, `--primary`, `--muted`, `--accent`). Reduced-motion respected on hover/entry animations.

## Phase 4 — Pagination (the core ask)

Replace the current `.slice(0, 60)` hard cap and the "refine search to see more" note with real pagination:

- Default page size 24, selectable 24 / 48 / 96 / All.
- Compact pager: `‹ 1 2 … 7 8 9 … 42 ›`, page-of-total, jump-to-page input for >10 pages.
- Page state stored in URL (`?or_page=3&or_size=48&or_sort=newest&or_family=anthropic`) so refresh/back preserves position and links are shareable.
- Filter/sort/search changes reset to page 1 with smooth scroll to results top.
- Grid uses `contain: content` + fixed min-height per row to prevent layout thrash between pages.
- "All" mode virtualises via `@tanstack/react-virtual` (already a common shadcn companion — add if not present) so 300+ cards stay smooth; falls back to plain map under 60 items.

## Phase 5 — Empty / loading / error polish

- Skeleton grid of 6 shimmer cards during initial load (reuse existing shimmer keyframe).
- Filtered-empty state stays but gains a "Clear all filters" gold button.
- Not-configured alert reworked to match aurora hero style with a direct link to Integrations → OpenRouter.
- Toast on copy-id success; graceful fallback if a model row is missing pricing (show `—`, never `NaN`).

## Phase 6 — QA sweep

- Verify no hardcoded colors (rg check).
- Verify Gateway/Native tabs unchanged (visual diff).
- Playwright: load `/model-hub` → OpenRouter tab → page through, toggle family filter, switch to table view, verify URL sync and screenshot at 1280×1800.
- Confirm edge function response unchanged for Gateway/Native consumers (`check-model-availability` shape is a superset).

---

## Technical notes

- Files touched:
  - `supabase/functions/check-model-availability/index.ts` (OpenRouter mapping only)
  - `src/pages/ModelHub.tsx` (OpenRouter section + `CatalogModel` type)
  - `src/lib/openrouter/format.ts` (new)
  - `src/components/model-hub/OpenRouterModelCard.tsx` (new)
  - `src/components/model-hub/OpenRouterModelTable.tsx` (new)
  - `src/components/model-hub/OpenRouterPager.tsx` (new)
- Dependency: add `@tanstack/react-virtual` only if not already installed (used only in "All" mode).
- No DB migrations, no secret changes, no changes to agent binding writes.
- Data contract stays backward compatible: all new OpenRouter fields are optional.

Ready to proceed to Phase 1 on approval.
