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
| 1 — Classification metadata layer | **Done** (this PR) |
| 2 — Compass-40 section registry + UI tier | **Done** (this PR) |
| 3 — Financial Analysis Report generator branch | Next |
| 4 — Visual component library (scorecard, riskRegister, infraTimeline, matrices) | Pending |
| 5 — Word-cap enforcement (prompt + post-trim) | Pending |
| 6 — Page-pressure trimming engine | Pending |
| 7 — QA automation (page band, financial exclusion, duplicates, artefacts) | Pending |
