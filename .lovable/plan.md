
# Market Intelligence Report — Implementation Plan

## Overview
Build a premium, branded PDF report ("Market Intelligence Report") powered by 6 live data layers, exportable on-demand from the Marketing Analytics page, with future automated bulk email distribution to GHL pipeline contacts.

---

## Phase 1: Data Engine (Edge Function)

### New Edge Function: `generate-market-intelligence-report`
Pulls all 6 data layers live at generation time:

| Layer | Data Source | Method |
|-------|-----------|--------|
| **1. RBA & Interest Rate Deep Dive** | Perplexity (sonar) — queries rba.gov.au, ASX rate futures, cash rate history | Live API call |
| **2. Housing Market Pulse** | Perplexity — auction clearance rates, median prices by capital city, days on market, rental yields | Live API call |
| **3. Consumer & Investor Sentiment** | Perplexity — Westpac/ANZ confidence index, Google Trends "investment property", buyer enquiry trends | Live API call |
| **4. Regulatory & Policy Watch** | Gemini structured extraction — APRA changes, stamp duty/land tax updates, FHOG changes | Live API call |
| **5. Strategic Outlook (AI)** | Gemini — 90-day forward outlook, risk/opportunity matrix, timing recommendations | Generated from Layers 1-4 |
| **6. Economic Indicators** | Perplexity — CPI, unemployment, GDP, AUD exchange rate | Live API call |

Each layer returns structured JSON + narrative markdown. All queries are Australia-specific with cited sources.

---

## Phase 2: PDF Generator

### New Utility: `MarketIntelligencePDFGenerator.tsx`
Uses `jsPDF` (matching existing investment report pattern) with the NPC navy/gold design system:

**Page Structure (~12-15 pages):**
1. **Cover Page** — "Market Intelligence Report", date, NPC branding
2. **Executive Summary** — AI-synthesised 1-page overview of all 6 layers
3. **RBA & Interest Rates** — Cash rate chart placeholder, forward expectations, impact analysis
4. **Housing Market Pulse** — State-by-state table (clearance rates, median prices, DOM, yields)
5. **Consumer & Investor Sentiment** — Confidence index, search trends, enquiry volumes
6. **Regulatory & Policy Watch** — Event timeline with impact badges (positive/negative/neutral)
7. **Economic Indicators** — CPI, unemployment, GDP, AUD — table + trend commentary
8. **90-Day Strategic Outlook** — Risk/opportunity matrix, timing recommendations
9. **Market Events Timeline** — Recent + upcoming events (reuses existing MarketEvent structure)
10. **Sources & Citations** — Full Perplexity citation list
11. **Disclaimer & Contact** — Reuses existing `drawJsPDFDisclaimerPage()`

**Design tokens:** Navy headers (#0D264D), gold accents (#BF9B50), gold-bordered KPI boxes, styled tables with navy headers and gold-tinted alternating rows — all matching `PixelPerfectPDFGenerator`.

---

## Phase 3: UI — Export Button & Generation Flow

### Marketing Analytics Page Updates
- Add "Generate Market Report" button next to the Market Correlation panel header
- Loading state with progress indicator during live data fetching
- On completion: auto-download PDF + store in Supabase Storage (`marketing-reports` bucket)

### Database Table: `marketing_intelligence_reports`
- `id`, `generated_by`, `generated_at`
- `report_data` (JSONB — all 6 layers cached)
- `pdf_storage_path`
- `status` (generating / completed / failed)
- `report_period` (e.g., "April 2026")

---

## Phase 4: Email Distribution (Future — after email service confirmed)

### Depends on: Team confirming bulk email provider (Resend/SendGrid/other)

**Components to build once confirmed:**
1. **Distribution Schedule UI** — Select GHL pipeline + stage, set frequency (weekly/monthly/ad-hoc)
2. **Database Table:** `marketing_report_schedules` — pipeline_id, stage_id, frequency, last_sent
3. **Edge Function:** `dispatch-marketing-reports` — resolves recipients from `ghl_client_opportunities`, attaches PDF, sends bulk emails
4. **pg_cron job** — Triggers dispatch on schedule

---

## Execution Order

| Step | What | Depends On |
|------|------|-----------|
| 1 | Database migration (`marketing_intelligence_reports` table + storage bucket) | — |
| 2 | Edge function: `generate-market-intelligence-report` (6-layer data engine) | Step 1 |
| 3 | PDF generator component (`MarketIntelligencePDFGenerator.tsx`) | Step 2 |
| 4 | UI: Export button + generation flow on Marketing Analytics page | Steps 2 & 3 |
| 5 | Email distribution (Phase 4) | Team confirms email provider |

**Estimated scope:** Steps 1-4 are self-contained and can be built now. Step 5 is parked until the email service decision is made.
