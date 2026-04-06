
# Market Intelligence Report v2 — Comprehensive Expansion Plan

## Current State (What's Built)
- ✅ **Macro Layer**: 6 data layers via Perplexity + Gemini (RBA, Housing, Sentiment, Regulatory, Strategic Outlook, Economic)
- ✅ **PDF Generator**: Premium Navy/Gold branded PDF via jsPDF (client-side)
- ✅ **Distribution Engine**: Bulk email via `dispatch-marketing-reports` → Email Copilot gateway
- ✅ **Scheduling**: Weekly/fortnightly/monthly with pg_cron orchestration
- ✅ **DB Tables**: `marketing_intelligence_reports`, `marketing_report_schedules`, `marketing_report_distribution_log`

## What's Missing (Gap Analysis from Vision Document)

### 1. Micro Layer (Suburb-Level Intelligence) — **HIGH PRIORITY**
> "Where are the opportunities right now"

**Not present at all.** Need to add:
- High-growth suburb/corridor identification
- Rental yield vs capital growth analysis per suburb
- Infrastructure & development pipeline mapping
- Days on market, vacancy rates, comparable sales
- Entry strategy recommendations per suburb
- Budget range & investor-type suitability

### 2. Competitive Edge Layer (NPC Differentiation) — **HIGH PRIORITY**
> "Why NPC sees what others don't"

**Not present at all.** Need to add:
- Off-market / pre-market intelligence framing
- Development & subdivision potential analysis
- Zoning / overlays / land use opportunities
- Strategic structuring (cashflow vs growth vs equity play)
- Risk mitigation insights competitors miss
- "How NPC would approach this" strategic commentary

### 3. Rotational Content System — **MEDIUM PRIORITY**
> Each cycle should rotate through 7 content categories

Currently: Single report format every time.
Need: A category rotation system where each scheduled dispatch selects the appropriate content type:
1. Market Pulse Update (Macro-heavy)
2. Hotspot Deep Dive (Micro-heavy)
3. Deal Breakdown / Case Study
4. Strategy Insight
5. Development / Subdivision Opportunity
6. Myth Busting / Market Truths
7. Finance & Lending Update

### 4. Audience Segmentation — **MEDIUM PRIORITY**
> "What this means for you" per investor/OO profile

Currently: Generic report, no audience targeting.
Need: Client-type aware framing:
- Investor-focused lens (yield, equity, tax)
- Owner-occupier lens (lifestyle, growth, entry cost)
- Budget-tier targeting (< $600K, $600K–$1M, $1M+)

### 5. CTA Framework — **MEDIUM PRIORITY**
> Each communication should lead into a clear call to action

Currently: No CTAs embedded in reports.
Need: Dynamic CTAs per content type:
- "Book a strategy session"
- "Request further analysis on [suburb]"
- "Explore this opportunity"

---

## Implementation Plan

### Phase 5A: Data Engine Expansion (Edge Function)
**File**: `supabase/functions/generate-market-intelligence-report/index.ts`

1. **Add Layer 7 — Micro Intelligence** (new Perplexity query)
   - Query: Top 5 performing suburbs nationally with rental yields, DOM, vacancy rates, comparable sales, infrastructure pipeline
   - Source filtering: corelogic.com.au, domain.com.au, realestate.com.au, sqmresearch.com.au
   - Output: Structured suburb cards with "Why it's outperforming", "Who it suits", "Entry strategy"

2. **Add Layer 8 — Competitive Edge** (Gemini synthesis)
   - Takes Layer 7 micro data + Layer 2 housing data
   - Generates: Off-market framing, development/subdivision potential, zoning opportunities, strategic structuring
   - Output: "Hidden opportunity" insights, "Strategic angle most buyers miss", "How NPC would approach this"

3. **Add `report_type` parameter** to the edge function
   - Accepts: `full` (all layers), `market_pulse`, `hotspot_deep_dive`, `strategy_insight`, `finance_update`, `deal_breakdown`, `myth_busting`, `development_spotlight`
   - Each type fetches only the relevant layers (saves API costs + time)

4. **Add `audience_segment` parameter**
   - Accepts: `investor`, `owner_occupier`, `general`
   - Injects audience-specific system prompts into Gemini synthesis layers
   - Adds "What This Means For You" sections tailored to segment

5. **Add CTA generation** in the strategic outlook layer
   - Dynamically generated based on report_type and audience_segment
   - CTAs embedded in report data for PDF rendering

### Phase 5B: Database Schema Update
**Migration**: Add new fields to support content rotation

```sql
-- Add report_type and audience fields to schedules
ALTER TABLE marketing_report_schedules 
  ADD COLUMN report_type TEXT DEFAULT 'full',
  ADD COLUMN audience_segment TEXT DEFAULT 'general',
  ADD COLUMN content_rotation_enabled BOOLEAN DEFAULT false,
  ADD COLUMN rotation_sequence TEXT[] DEFAULT ARRAY['market_pulse','hotspot_deep_dive','strategy_insight','finance_update','deal_breakdown','myth_busting','development_spotlight'],
  ADD COLUMN current_rotation_index INTEGER DEFAULT 0;

-- Add report_type to intelligence reports table
ALTER TABLE marketing_intelligence_reports
  ADD COLUMN report_type TEXT DEFAULT 'full',
  ADD COLUMN audience_segment TEXT DEFAULT 'general';
```

### Phase 5C: PDF Generator Expansion
**File**: `src/components/marketing/MarketIntelligencePDFGenerator.ts`

1. **New section renderers**:
   - `renderMicroIntelligence()` — Suburb spotlight cards with KPIs (yield, DOM, vacancy, growth %)
   - `renderCompetitiveEdge()` — Strategic insight panels with gold "Hidden Opportunity" callouts
   - `renderCTAPanel()` — Full-width CTA with NPC contact details and next-step prompts
   - `renderAudienceInsights()` — "What This Means For You" panels styled with audience-specific headers

2. **Report type variants**:
   - Full report: All sections (8 layers + exec summary + events + CTA)
   - Market Pulse: Layers 1, 3, 6 + exec summary + CTA (shorter, macro-focused)
   - Hotspot Deep Dive: Layer 7 (micro) as hero + supporting context from Layers 1, 2 + CTA
   - Strategy Insight: Layer 8 (competitive edge) as hero + Layer 5 (outlook) + CTA
   - Finance Update: Layer 1 (RBA) + Layer 4 (regulatory) deep-focus + CTA
   - Deal Breakdown: Layer 7 single-suburb deep dive + Layer 8 strategic angle + CTA
   - Development Spotlight: Layer 8 subdivision/zoning focus + Layer 7 location context + CTA

3. **Dynamic cover page** — Subtitle changes based on report_type (e.g., "Hotspot Deep Dive — April 2026")

### Phase 5D: Distribution UI Updates
**File**: `src/components/marketing/ReportDistributionPanel.tsx`

1. **Schedule creation/edit dialog** — Add:
   - Report type selector (dropdown with 7 types + "Full")
   - Audience segment selector (Investor / Owner-Occupier / General)
   - Content rotation toggle (when enabled, auto-cycles through report types)
   - Preview of rotation sequence

2. **Visual indicators** — Show report type badge and audience segment on schedule cards

### Phase 5E: Dispatch Engine Updates
**File**: `supabase/functions/dispatch-marketing-reports/index.ts`

1. Pass `report_type` and `audience_segment` from schedule to `generate-market-intelligence-report`
2. When `content_rotation_enabled = true`:
   - Read `current_rotation_index` from schedule
   - Use `rotation_sequence[current_rotation_index]` as `report_type`
   - Increment index (wrap around) after successful dispatch
3. Update email subject template to include report type name

---

## Execution Order
1. **Phase 5B** — Database migration (add columns) ← Do first, types must update
2. **Phase 5A** — Edge function expansion (Layer 7 + 8, report_type param, audience param)
3. **Phase 5C** — PDF generator expansion (new renderers, report variants)
4. **Phase 5D** — Distribution UI updates (new selectors)
5. **Phase 5E** — Dispatch engine updates (rotation logic)

## Quality Standards
- All Perplexity queries use `search_recency_filter: 'week'` for live data
- Gemini synthesis uses audience-aware system prompts
- PDF maintains Navy/Gold NPC branding consistency across all report types
- Each report type has a distinct visual identity while sharing the design system
- CTA copy is contextual, not generic
- Content rotation creates a "rhythm of communication" as specified in the vision
