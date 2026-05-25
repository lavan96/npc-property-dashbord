
# Compass Report 40-Page Condensation — Implementation Plan

## What the brief is asking for

The brief is a **rendering-layer specification**, not a backend rewrite. Three core directives:

1. **Condense** the current ~87–90 page Compass output to a **~40 page** client-facing report focused on suburb / macro / infrastructure / planning / zoning / risk / non-financial property fit.
2. **Split out** all detailed financial content (yield, LVR, loan, cashflow, sensitivity, 10-yr, tax) into a **separate "Financial Analysis Report"** generated from the same underlying data.
3. **Preserve** every existing API, data source, calculation engine, and the user's ability to generate the full financial breakdown when needed.

The transformation is achieved through: section classification flags, word caps, structured visual components (scorecards / matrices / risk registers), confidence tags, and priority-driven page-pressure trimming.

---

## Target 40-page architecture (21 sections, fixed page budget)

```text
1.  Cover                                        1pt
2.  Contents & Reading Guide                     1pt
3.  Executive Summary                            2pt
4.  Property Snapshot (non-financial)            1pt
5.  Macro Investment Scorecard                   1pt
6.  Strengths & Watch Points                     1pt
7.  Location Overview                            3pt
8.  Future Infrastructure & Growth Pipeline      2pt   [PROTECTED]
9.  Population & Development Trends              2pt
10. Suburb Character & Lifestyle                 1pt
11. Market Performance & Macro Demand            3pt
12. Economic Context                             1pt
13. Demographics, SEIFA, Employment, Demand      3pt
14. Education & Family Demand                    2pt
15. Amenity & Livability Matrix                  2pt
16. Connectivity & Transport                     2pt
17. Crime/Climate/Environmental Risk Register    4pt   [PROTECTED]
18. Property-Level Non-Financial Assessment      2pt
19. Zoning & Planning Analysis                   3pt   [PROTECTED]
20. Due Diligence & Final Recommendation         2pt   [PROTECTED]
21. Disclaimer & Source Appendix                 1pt
                                          Total: 40pt
```

---

## Implementation plan (7 phases)

### Phase 1 — Content classification layer
Add per-block metadata so the same generated content can be routed across three render modes:

- `includeInCompass`, `includeInFinancialReport`, `includeInAppendix`, `isInternalOnly`
- `sectionPriority` = `Protected | High | Medium | Low | Excluded`
- `maxWordCount` per block
- `confidence` = `Verified | Indicative | Planned | UnderConstruction | Unverified | NotAvailable`

Apply to the section registry in `generate-investment-report` and to `report_content` JSON.

### Phase 2 — Compass 40-page template
Create a new `report_tier` (or schema preset) named **`compass-40`** in `report_templates` with the 21-section structure above, fixed page budgets, and the "What This Means" box rule (max **one** per section).

### Phase 3 — Financial Analysis Report split
- Add a separate report tier **`financial-analysis`** that renders only the financial blocks (purchase costs, yield, LVR, loan, cashflow, sensitivity, 10-yr projections, tax, equity, buffers).
- Add a "Generate Financial Analysis Report" action next to the existing Compass generator on the property/listing/client surfaces.
- Compass shows a single approved sentence pointing the client to the financial report.

### Phase 4 — Visual components library
Build reusable PDF/UI block renderers (jsPDF + on-screen viewer):

| Component | Used in |
|---|---|
| KPI tile grid (4–6 tiles) | Exec Summary, Snapshot, Market |
| Macro Scorecard (8 categories, Strong/Moderate/Watch) | §5 |
| Strengths / Watch-Points two-column | §6, lifestyle, property |
| Infrastructure Pipeline timeline (Existing → Long-Term + confidence) | §8 |
| Amenity Matrix (Amenity / Current / Future / Relevance) | §15 |
| Risk Register (Rating / Confidence / Why / DD Action) | §17 |
| Planning Action Table (Item / Status / Relevance / Action) | §19 |
| Due-Diligence Checklist | §20 |
| Decision Box (≤60 words, one per section) | every section |
| Confidence chips ("Indicative", "Planned", "Unverified") | infra/risk/planning |

### Phase 5 — Word-cap governance
Enforce caps at generation time (prompt-level + post-generation trim):

| Block | Cap |
|---|---|
| Executive Summary total | 450–600 |
| Section opening takeaway | 35–50 |
| Standard paragraph | 45–80 |
| "What This Means" box | 40–60 |
| Risk item explanation | 25–45 |
| Planning item | 40–70 |
| Final recommendation | 150–250 |

Strip thesis-style transitions ("As we move into…", "This flows naturally…"), repeated address mentions, "[citation]" / "pre-calculated" artefacts.

### Phase 6 — Page-pressure trimming engine
If rendered page count > 42, trim in this strict order before touching protected sections:
1. Repeated transition paragraphs
2. Collapse duplicate "What This Means" boxes
3. Cap school / amenity / transport lists to top 5
4. Merge duplicate demographic/employment commentary
5. Move long lists to appendix
6. Reduce economic context to 1 page
7. Reduce lifestyle narrative to 1 page

Never trim §8, §17, §19, §20.

### Phase 7 — QA automation & acceptance
Automated post-render checks:
- 38 ≤ pages ≤ 42
- Zero financial calculation blocks in Compass
- No duplicate Education / Transport / Employment / Amenity sections
- No internal artefacts (`[citation]`, prompt fragments, debug labels)
- §8, §17, §19 present (or explicitly marked unavailable)
- Final recommendation is macro-only, not financial advice
- Financial Analysis Report generates successfully from same input

---

## Technical surface affected

- **Edge functions**: `generate-investment-report` (section registry, prompts, scope branch), new `generate-financial-analysis-report` (or a `report_tier` branch in the same function), `regenerate-report-qualitative` (word caps).
- **DB**: extend `report_templates` schema with `report_tier in ('compass-40','financial-analysis')`; add classification fields to section JSON (no schema break — JSON metadata).
- **Frontend**: `ReportScopeTierPicker`, `InvestmentReportGenerator`, `InvestmentReportViewer`, `ClientPDFGenerator` / `PixelPerfectPDFGenerator` to render the new components and the two-report toggle.
- **Renderer**: new block types in `src/lib/reportTemplate/blocks/` (scorecard, riskRegister, infraTimeline, amenityMatrix, planningTable, ddChecklist, decisionBox, confidenceChip).
- **No removal** of existing financial calculation, API integration, or backend logic.

---

## Acceptance criteria (from brief)

> A Compass Report is successful when a client can understand the opportunity, suburb logic, future infrastructure, planning position, property fit and major risks within 15–20 minutes, while the detailed financial analysis remains available as a separate document.

---

## Recommended sequencing

I suggest we execute in this order, with your approval gate between each:

1. **Phase 1 + 2** together (classification + Compass template skeleton) — foundation.
2. **Phase 3** (Financial Analysis Report split) — unblocks dual-report generation.
3. **Phase 4** (visual components) — biggest readability uplift.
4. **Phase 5 + 6** (word caps + trimming) — locks 40-page target.
5. **Phase 7** (QA automation) — production hardening.

Approve this plan and I'll start with Phase 1 + 2.
