# Composite-First Report + Fork Strategy

## Goal

Keep generating **one composite Investment Report** as today (single source of truth), then **deterministically derive two client-facing reports** from it:

1. **Client Investment Feasibility & Financial Performance Report** (FIN)
2. **Property & Location Due Diligence Report** (PLDD)

The derivation is a **routing/transform pass** over the composite's existing content + data, not a second generation run. This guarantees the two child reports never disagree with each other or with the composite.

The existing half-wired `FINANCIAL_ANALYSIS_SECTIONS` registry and `tier === 'financial-analysis'` generator branch are **superseded** by this plan and will be removed in Phase 1.

---

## Architecture

```text
                ┌──────────────────────────────────────┐
                │  generate-investment-report          │
                │  (composite, unchanged)              │
                │  → investment_reports.report_content │
                │  → investment_score / fin_calcs JSON │
                └────────────────┬─────────────────────┘
                                 │
                                 ▼
                ┌──────────────────────────────────────┐
                │  fork-investment-report (NEW)         │
                │  - parse composite markdown into      │
                │    H2 sections                        │
                │  - apply SPLIT_REGISTRY routing       │
                │  - reframe / retitle each section     │
                │  - rebuild exec summary + scorecard   │
                │    per variant                        │
                │  - write 2 child rows:                │
                │      report_variant = 'financial'     │
                │      report_variant = 'due_diligence' │
                │      parent_report_id = composite.id  │
                └────────────────┬─────────────────────┘
                                 │
                  ┌──────────────┴───────────────┐
                  ▼                              ▼
        render-investment-report-pdf   render-investment-report-pdf
        (variant='financial')          (variant='due_diligence')
        → FIN PDF                      → PLDD PDF
```

**Key design choices:**

- **One renderer, variant-aware.** No second PDF function. Renderer learns to read `report_variant` and apply variant cover/TOC/CSS-accent/footer wording. Composite stays renderable as today.
- **Child rows, not blob columns.** Each fork is a real `investment_reports` row with its own `report_content`, `investment_score`, `pdf_url`, and `parent_report_id` pointing at the composite. This reuses every existing UI surface (viewer, hero studio, send-to-client, QA) for free.
- **Deterministic routing**, no LLM in the fork step. Reframing is template-based string transforms + section header rewrites driven by the mapping table in the user's spec doc.
- **Hero images cascade.** Forks inherit `report_hero_placements` from parent by default; user can override per-fork from Hero Studio.
- **Scorecard split** is a pure function of the existing `investment_score` JSON — no new data sources required.

---

## Phase Plan

### Phase 0 — Decommission existing finance path
- Delete `FINANCIAL_ANALYSIS_SECTIONS` from `_shared/compassSectionRegistry.ts` and its frontend mirror.
- Remove `tier === 'financial-analysis'` branches from `generate-investment-report`, `compassPostProcessor`, `compassQAValidator`.
- Remove `'financial-analysis'` from `normaliseGenerationTier`. Keep `'compass-40'` (composite) as the only path.
- No DB enum drop yet — leave `report_tier` alone; we add a new orthogonal column instead.

### Phase 1 — Schema additions (single migration)
Add to `investment_reports`:
- `report_variant text` — values: `'composite' | 'financial' | 'due_diligence'`, default `'composite'`
- `derived_from_report_id uuid` — FK → `investment_reports.id` (the composite parent for forks)
- `variant_generated_at timestamptz`
- Index on `(derived_from_report_id, report_variant)` for fast lookup.

Add `report_split_registry` table (seeded, editable):
- `id`, `composite_section_key text`, `composite_heading text`, `target_variant text` (`'financial' | 'due_diligence' | 'both'`), `new_heading_financial text`, `new_heading_due_diligence text`, `reframe_rule text` (enum: `verbatim | financial_lens | property_lens | summarise_only | drop`), `ordinal_financial int`, `ordinal_due_diligence int`, `notes text`
- Seeded from the spec doc (~60 rows: §5–§9 mapping tables of `NPC_Report_Split_Strategy_and_Title_Mapping.docx`).
- Editable so the rebuild is non-fragile when sections evolve.

`report_hero_placements`: no schema change. Resolver in renderer falls back to parent's placements when the fork has none.

### Phase 2 — Split registry shared module
`supabase/functions/_shared/reportSplitRegistry.ts` (+ frontend mirror `src/lib/reports/reportSplitRegistry.ts`):
- Loads rows from `report_split_registry` once per request (cached).
- Exposes `routeCompositeSection(heading) → { variant, newHeadingFin, newHeadingPldd, rule }`.
- Hard-codes a typed fallback (in-file constant) so it works before DB seed and survives outage.
- Includes the structural correction noted in the spec (TOC `01 Executive Strengths` → body `01 Executive Summary` mismatch is normalised here, not carried forward).

### Phase 3 — Fork edge function `fork-investment-report`
Inputs: `{ composite_report_id, force?: boolean }`. Behaviour:

1. Load composite row; assert `status='completed'`.
2. Parse `report_content` into ordered H2 sections (reuse the existing marked-based splitter already used in `condense-investment-report`).
3. For each section, call `routeCompositeSection` → bucket into `financialSections[]` and `dueDiligenceSections[]`. `'both'` sections are emitted to both buckets with their respective reframed heading and a lens-specific intro paragraph (template strings, not LLM).
4. Rebuild per-variant front matter:
   - **FIN**: new Exec Summary ("Client Investment Decision Summary"), new "Financial Strengths, Trade-Offs & Holding Capacity", new "Financial Recommendation & Portfolio Fit", **Financial Investment Scorecard** (see Phase 4).
   - **PLDD**: new "Client Property & Location Snapshot", new "Property Strengths & Occupier Appeal", new "Property Due Diligence Recommendation", **Property Fundamentals Scorecard**.
   - Both built deterministically by extracting bullets / metrics that already exist in the composite's exec summary, strengths, and recommendation sections.
5. Append per-variant standard tone footer: financial uses "indicative / subject to verification / not financial advice"; PLDD uses "due diligence checklist, verification required".
6. Upsert two child rows (`report_variant`, `derived_from_report_id`, fresh `id`, copy `property_address`, `financial_calculations`, `demographics_data`, etc.; new `report_content`; new `investment_score`).
7. Idempotent: if children exist and `force=false`, refresh `report_content`/`investment_score` in place rather than duplicate.

### Phase 4 — Variant-weighted scorecards
Extract current scoring into `_shared/investmentScoreEngine.ts` (today it's duplicated in `backfill-investment-scores` and inline in `generate-investment-report`). Single source of truth, then expose:

- `scoreComposite(input)` — current 15/40/25/15/5 weights, unchanged.
- `scoreFinancial(input)` — Yield 30 / Cashflow 25 / Serviceability 20 / Risk 15 / Growth-on-capital 10.
- `scorePropertyFundamentals(input)` — Location 30 / Demand 25 / Tenant/Occupier Fit 20 / Planning & Risk 15 / Liveability 10.

Weight maps live in registry constants so they're tweakable without redeploying logic. Confidence-weighting/missing-dimension rebalancing rules (from existing memory) apply unchanged.

Update `backfill-investment-scores` to call the shared engine and to also score forks when present.

### Phase 5 — Renderer variant awareness (`render-investment-report-pdf`)
Single change set, no fork:

- Read `report_variant` from the row.
- Variant-specific cover title, subtitle, footer wording, and accent label ("Financial Feasibility" vs "Due Diligence"). Same dark-gold palette and CSS — no second design system.
- TOC builder uses the variant's section order; composite TOC unchanged.
- Hero placement resolver: if `report_variant !== 'composite'` and no placements for this row, fall back to `derived_from_report_id`'s placements.
- `autoInjectVisualShortcodes` runs unchanged on the variant's `report_content`.
- Variant-specific final-page boilerplate ("Client interpretation / Adviser takeaway" framing replaces generic "What This Means" — per spec §10).

No change to WeasyPrint/Api2PDF orchestration.

### Phase 6 — UI surfaces
Minimal, additive:

- **Reports list** (`Reports.tsx`, `GeneratedReports.tsx`): add a "Variant" badge column showing Composite / FIN / PLDD; group children under parent composite row.
- **Composite viewer** (`InvestmentReportView.tsx`): add a **"Generate Client Reports"** button that invokes `fork-investment-report`. Disabled until composite `status='completed'`. Shows progress + links to the two child rows on success.
- **Variant viewer**: same component, reads variant content. Add a "Back to composite" link and a "Re-fork from composite" action (calls fork fn with `force=true`).
- **`PremiumPdfButton`**: when viewing a fork, renders that variant's PDF. When viewing composite, optionally exposes a "Render all three" combo.
- **Hero Studio**: scope toggle "Apply to: Composite / FIN / PLDD / All".
- **`TierSwitcher`**: leave alone (orthogonal — that switches `report_tier` Premium/Standard, not variant).
- **`SendToClientModal`**: variant picker — default sends both FIN + PLDD, allow one or the other.

### Phase 7 — QA & migration
- Backfill: for the latest ~5 composite reports per workspace, run `fork-investment-report` so users see immediate value.
- QA path (`QualityAssurance.tsx`): add per-variant QA tabs reusing existing review machinery.
- Add unit-style Deno tests for `reportSplitRegistry.routeCompositeSection` and `investmentScoreEngine` weight maps.
- Visual QA: render one composite + both forks for `4 Thompson Street, Muswellbrook` (the spec's reference property), screenshot every page, fix overflows/centring/SVG-leakage regressions in the same renderer pass.

---

## Why this stays clean in one pass

- **Single generation pipeline**, no parallel prompt trees to keep in sync.
- **Routing is data, not code** — the split registry table can be edited without redeploys when the spec evolves.
- **Forks are pure derivations** — re-running the fork is safe and idempotent; if a section is renamed or reweighted later, one click re-derives both children.
- **Renderer stays one file** — variant differences are localised to cover/TOC/footer/scorecard-block; everything else (shortcodes, hero pipeline, WeasyPrint chain, alignment fixes from prior turns) is reused.
- **Existing UI surfaces light up automatically** because forks are real `investment_reports` rows.
- **The half-built `FINANCIAL_ANALYSIS_SECTIONS` path is removed up front**, so we don't carry two conflicting financial-report concepts.

---

## Technical Details / Open Calls Before I Build

1. **Spec doc is the source of truth for the split registry seed.** I'll codify every row from the mapping tables in §5–§9 of `NPC_Report_Split_Strategy_and_Title_Mapping.docx` into the seed migration (~60 rows). Where the spec marks "Both - tailor lens", both `new_heading_financial` and `new_heading_due_diligence` get populated and `reframe_rule = financial_lens | property_lens` on the respective output.
2. **Section numbering**: spec calls out the existing TOC vs body numbering bug ("01 Executive Strengths" mismatch). I'll normalise during the parse step so neither fork inherits the bug.
3. **No new LLM calls in the fork step.** If you later want LLM-polished per-variant intros, that's a clean Phase 8 add-on (one prompt per variant, reads section list, returns intro string) without disturbing anything above.
4. **Scorecard weight numbers** above are my proposed defaults from the spec's intent; they live in registry constants so you can tune them via a single PR or even via DB later if you want them editable.

If this plan looks right I'll start with Phase 0 + Phase 1 (decommission + migration) in the first build pass so the rest is unblocked.
