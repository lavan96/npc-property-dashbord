# Compass-40 Report Architecture

Implements the **NPC Compass Report 40-Page Condensation Brief (v1.0)**. The
brief is a rendering-layer specification — backend APIs, calculations and
financial engines are preserved.

## Two reports, one data set

| Report | Purpose | Pages | Section registry |
|---|---|---|---|
| **Compass Report** (`tier=compass`) | Client-facing macro / suburb / planning / risk / non-financial property fit | 40 (band 38–42) | `COMPASS_40_SECTIONS` |
| **Financial Analysis Report** (`tier=financial`) | Yield, loan, cashflow, sensitivity, 10-yr, tax, serviceability | ~20 | `FINANCIAL_ANALYSIS_SECTIONS` |

Both render from the same upstream API / calculation outputs. Selection happens
at the **rendering layer** via the section registry.

## Source of truth

- Edge runtime: `supabase/functions/_shared/compassSectionRegistry.ts`
- Frontend mirror: `src/lib/reports/compassSectionRegistry.ts`

**These two files must stay in sync.** Edge functions cannot import from
`src/`, so they are duplicated by design. Any structural change must be made
in both places.

## Classification metadata (per section)

| Field | Purpose |
|---|---|
| `includeInCompass` / `includeInFinancialReport` / `includeInAppendix` / `isInternalOnly` | Routing flags |
| `sectionPriority` | `Protected \| High \| Medium \| Low \| Excluded` — controls page-pressure trimming |
| `maxWordCount` | Per-section narrative cap (excludes tables / visuals) |
| `pageBudget` | Target page allocation in the 40-page layout |
| `visualComponents` | Required visual blocks (scorecard, riskRegister, infraTimeline, …) |
| `allowDecisionBox` | Single "What This Means" box per section (rule from §6) |

## Compass-40 section order (21 sections, 40pt)

```
 1  Cover                                       1pt
 2  Contents & Reading Guide                    1pt
 3  Executive Summary                           2pt
 4  Property Snapshot (non-financial)           1pt
 5  Macro Investment Scorecard                  1pt
 6  Strengths & Watch Points                    1pt
 7  Location Overview                           3pt
 8  Future Infrastructure & Growth Pipeline     2pt   [PROTECTED]
 9  Population & Development Trends             2pt
10  Suburb Character & Lifestyle                1pt
11  Market Performance & Macro Demand           3pt
12  Economic Context                            1pt
13  Demographics, SEIFA, Employment, Demand     3pt
14  Education & Family Demand                   2pt
15  Amenity & Livability Matrix                 2pt
16  Connectivity & Transport                    2pt
17  Crime/Climate/Environmental Risk Register   4pt   [PROTECTED]
18  Property-Level Non-Financial Assessment     2pt   [PROTECTED]
19  Zoning & Planning Analysis                  3pt   [PROTECTED]
20  Due Diligence & Final Recommendation        2pt   [PROTECTED]
21  Disclaimer & Source Appendix                1pt
                                       Total: 40pt
```

## Page-pressure trim order

When the rendered page count exceeds the 38–42 band, sections are trimmed in
this strict order. **Protected sections are never reduced.**

1. Strip repeated transition paragraphs
2. Collapse duplicate "What This Means" boxes
3. Cap school / amenity / transport lists to top 5
4. Merge duplicate demographic / employment commentary
5. Move long lists to appendix
6. Reduce economic context to 1 page
7. Reduce lifestyle narrative to 1 page

## Word caps (`COMPASS_WORD_CAPS`)

| Block | Cap |
|---|---|
| Executive Summary (total) | 450–600 |
| Section opening takeaway | 35–50 |
| Standard paragraph | 45–80 |
| "What This Means" box | 40–60 |
| Risk item explanation | 25–45 |
| Planning item explanation | 40–70 |
| Final recommendation | 150–250 |

## Approved hand-off copy

A single non-calculation sentence appears at the end of the Compass executive
summary pointing to the Financial Analysis Report
(`COMPASS_FINANCIAL_HANDOFF_COPY`).

## Roadmap

| Phase | Status |
|---|---|
| 1 — Classification metadata layer | **Done** |
| 2 — Compass-40 section registry + UI tier | **Done** |
| 3 — Financial Analysis Report generator branch | **Done** |
| 4 — Visual component library (scorecard, riskRegister, infraTimeline, matrices) | **Done** — 8 blocks live: `scorecard`, `strengths-watch`, `risk-register`, `infra-timeline`, `amenity-matrix`, `planning-table`, `dd-checklist`, `decision-box`. Registered in `BLOCK_RENDERERS` + `BLOCK_DEFS` + Template Builder palette |
| 5 — Word-cap enforcement (prompt + post-trim) | **Done** |
| 6 — Page-pressure trimming engine | **Done** |
| 7 — QA automation (page band, financial exclusion, duplicates, artefacts) | **Done** |

## Phase 4 block reference

| Block type | Compass section | Visual |
|---|---|---|
| `scorecard` | §5 Macro Scorecard | 8-row table with Strong / Moderate / Watch chips |
| `strengths-watch` | §6 Strengths & Watch Points | Two-column green/amber lists |
| `infra-timeline` | §8 Infrastructure Pipeline (PROTECTED) | Horizontal timeline: Existing → Long-term, with confidence chips |
| `amenity-matrix` | §15 Amenity Matrix | Amenity / Current / Future / Relevance grid |
| `risk-register` | §17 Risk Register (PROTECTED) | Risk / Rating / Confidence / Why / DD Action |
| `planning-table` | §19 Planning (PROTECTED) | Item / Status pill / Relevance / Action |
| `dd-checklist` | §20 Due Diligence (PROTECTED) | Checkbox list with owner + timing |
| `decision-box` | Every section ("What this means") | Accent-bar panel, ≤60 words enforced |

All blocks share `src/lib/reportTemplate/blocks/_shared.ts` for rating chips,
confidence chips, and colour parsing. Each is bindable (`{{path | filter}}`)
and theme-token aware (`token:primary`).


## Phase 5 + 6 — Post-processor (`compassPostProcessor.ts`)

Shared module at `supabase/functions/_shared/compassPostProcessor.ts`
(mirrored at `src/lib/reports/compassPostProcessor.ts`). Wired into
`condense-investment-report` for both `compass-40` and `financial-analysis` tiers.

**Phase 5 — Word-cap enforcement**
- Decision-box governance: at most one `What this means` per section, hard-capped to 60 words; removed entirely from sections where `allowDecisionBox=false`.
- Executive Summary: hard-capped to 600 words.
- Per-section narrative cap: each section trimmed to `maxWordCount`. Tables, bullets and headings are preserved.

**Phase 6 — Page-pressure trimming engine**
Estimator: `320 words/page + 18 words/table-row + 30 words/heading`. If pages > band max (Compass 42, Financial 22), runs `PAGE_PRESSURE_TRIM_ORDER` in sequence until under budget:
1. Strip transition paragraphs
2. Collapse duplicate decision boxes
3. Cap school / amenity / transport lists to top 5
4. Merge duplicate demographic / employment subsections
5. Move long lists to appendix (second-pass cap)
6. Reduce Economic Context to one page
7. Reduce Suburb Character / Lifestyle to one page

Sections in `PROTECTED_SECTION_IDS` (`futureInfrastructure`, `riskRegister`,
`zoningPlanning`, `dueDiligence`, `propertyAssessment`) are NEVER trimmed.

Returns a `PostProcessReport` (initial/final word count, estimated pages,
trims applied, sections trimmed, warnings) which is logged and returned in
the function response for QA / observability.


## Phase 7 — QA validator (`compassQAValidator.ts`)

Shared module at `supabase/functions/_shared/compassQAValidator.ts` (mirrored at
`src/lib/reports/compassQAValidator.ts`). Returns a `QAReport` with severity-tagged
findings; wired into the `condense-investment-report` response as `qaReport`.

**Rules enforced**
1. **page-band** — Compass 38–42, Financial 18–22 (error if over, warning if under)
2. **financial-exclusion** — Compass markdown must not match `gross yield`, `LVR`, `LMI`, `P&I`, `weekly rent`, `10-year cashflow`, `sensitivity analysis`, `after-tax cashflow`, `depreciation schedule`
3. **suburb-exclusion** — Financial Analysis must not match `SEIFA`, `school catchment`, `crime`, `flood`, `bushfire`, `demograph`, `infrastructure pipeline`, `zoning overlay`
4. **duplicate-h2** — no repeated H2 headings
5. **duplicate-decision-box** / **forbidden-decision-box** — per-section governance
6. **missing-protected-section** — Compass must include all `PROTECTED_SECTION_IDS`
7. **word-cap** — per-section narrative ≤ 110% of `maxWordCount`

**Test coverage** (`compassPostProcessor_test.ts`, 9 tests, all passing):
- Exec summary cap • Forbidden decision-box removal • Duplicate decision-box collapse
- Bullet cap under page pressure • Protected sections immune to trims
- QA: financial-content detection, duplicate H2, missing protected section
- Page estimator sanity bounds
