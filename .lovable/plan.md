## Goal

Lift the **Compass Premium PDF** to the quality bar set by the two reference PDFs by replacing the accreted HTML/CSS in `render-investment-report-pdf` with one **canonical editorial template** that blends Ref A (magazine/editorial: serif display, mono eyebrows, dramatic negative space, full-bleed heroes) and Ref B (warm photo-led brochure: large imagery, calm two-column copy, running chrome) — all rendered in **our brand gold/navy/ink palette**.

jsPDF stays in place as the **fallback path** (toggle), so you can A/B compare until you're confident.

---

## What changes

### 1. Single source of truth: `report.css` + `report.html.ts`
Replace the ~600 lines of inline `<style>` strings in `index.ts` with two co-located files:

- `supabase/functions/render-investment-report-pdf/report.css` — one canonical stylesheet (~400 lines), versioned, no per-section overrides.
- `supabase/functions/render-investment-report-pdf/report.html.ts` — pure functions: `renderCover()`, `renderChapter()`, `renderKpiStrip()`, `renderTwoCol()`, `renderRunningHeader()`, etc. Each returns semantic HTML (`<section class="chapter">`, `<header class="eyebrow">`, `<aside class="callout">`).

### 2. Editorial system (the blend)

**Type scale** (brand-locked, bundled Playfair + Inter + IBM Plex Mono in the WeasyPrint container — already partially in `Dockerfile`, will add Plex Mono):
- Display: Playfair Display 48/56/72pt, italic accents allowed
- Eyebrow / chrome / page numbers: IBM Plex Mono 8.5pt UPPERCASE, 0.18em tracking, prefixed `— `
- Body: Inter 10.5pt / 15pt leading, hanging punctuation, OpenType lining numerals
- Pull-quote: Playfair italic 22pt

**Palette** (from `index.css` tokens, hard-coded into renderer since edge functions can't read CSS vars at runtime):
- `--ink: #0F0F10` (near-black, replaces pure black)
- `--paper: #FAF7F1` (warm cream, Ref B feel)
- `--gold: #D4A843` (brand primary)
- `--gold-soft: #E8C97A`
- `--navy: #14233A` (Ref A depth, brand-compatible)
- Tinted surfaces only — no flat white blocks

**Grid**: 12-column, 20mm outer margin, 6mm gutter. Asymmetric layouts (4+8, 5+7) by default; centered only on chapter openers.

**Running chrome on every body page**: top: `— COMPASS  ·  {{address}}`. Bottom: `{{brand}}  ·  {{page}} / {{pageCount}}` (mono). No chrome on cover / dividers / disclaimer.

### 3. Chapter templates (4 to start, drives the rest)

For Compass, rebuild the four highest-impact chapter types first; the remaining 13 Compass sections inherit the same primitives:

1. **Cover** — full-bleed hero photo, title overlay (Playfair, italic accent), eyebrow `— COMPASS  ·  LOCATION & PROPERTY FIT`, footer chip "Artist impression"
2. **Executive summary** — pull-quote + 3-col KPI strip + 2-col body
3. **Location & infrastructure** — full-bleed map/photo, marginalia rail with stat-blocks, body in single 70mm measure
4. **Financials** — ledger-style table (mono numerals, hairline rules, zebra off), commentary in right rail

### 4. Keep brand consistency
All colors/fonts/spacing resolved from a single `BRAND` object derived from the report's white-label tokens (`docs/WHITE_LABEL_TOKEN_CONTRACT.md` already defines the contract). White-labeled tenants automatically inherit their own gold/accent.

### 5. jsPDF stays
- No removal of the jsPDF generator
- The "Premium PDF" button continues to call WeasyPrint
- The existing "Standard PDF" / jsPDF path is untouched and remains the fallback
- A small footer note on Premium output reads `Rendered via WeasyPrint v62` so you can spot which engine produced any given file

### 6. Out of scope (this round)
- Briefing / Snapshot / Financial tier rebuilds (they inherit once Compass primitives are stable)
- Template Builder visual editor changes
- Any data/business-logic changes — only presentation
- Removing jsPDF

---

## Technical notes

- New files: `report.css`, `report.html.ts`, `report.brand.ts` under `supabase/functions/render-investment-report-pdf/`
- `index.ts` shrinks: the giant inline `<style>` blob and the per-section HTML builders are replaced by imports from the new modules. The data-gathering, scoring, and WeasyPrint POST logic are untouched.
- `weasyprint-service/Dockerfile`: add IBM Plex Mono to the bundled font set; rebuild + redeploy Cloud Run image.
- Token rotation issue from prior turn already fixed (per-request `Deno.env.get`).

---

## Deliverable

After this round, generating a Compass Premium PDF on any property produces a document that:
- Opens with a full-bleed cover in our gold/navy/cream palette
- Uses Playfair display + Inter body + Plex Mono chrome throughout
- Has running header/footer with mono page numbers `01 / 42` on every body page
- Renders the four pilot chapters in the new editorial layout; the remaining Compass sections render in the same type system but legacy layout (cleaned up in a follow-up)
- Is visibly in the same league as Ref A / Ref B

If the output meets the bar, the follow-up plan retrofits the remaining chapters and the other tiers.
