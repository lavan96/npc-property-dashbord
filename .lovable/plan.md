
# Phase 4: Market Intelligence Report — Email Distribution

## Architecture
Emails are sent through the existing `send-email-reply` edge function (Microsoft Graph API) with `source: 'agent'` to apply the NPC-branded HTML template (banner image, gold/navy accents, signature, disclaimer). The PDF report is attached as a base64 file attachment. Recipients are resolved from GHL pipeline contacts.

---

## Completed

### Phase 4A: Core Distribution Engine ✅
- Database tables: `marketing_report_schedules`, `marketing_report_distribution_log`
- Edge function: `dispatch-marketing-reports` (CRUD + dispatch + rotation)
- UI: `ReportDistributionPanel.tsx` with schedule management
- pg_cron automation (pending SQL editor setup)

### Phase 5: Content Engine v2 — Intelligence Layers Expansion ✅
- **Layer 7 (Micro Intelligence)**: Live suburb-level data via Perplexity — top 5 performing suburbs with yields, DOM, vacancy rates, comparable sales, infrastructure drivers, entry strategies
- **Layer 8 (Competitive Edge)**: NPC differentiation layer via Gemini — off-market insights, development/subdivision potential, zoning opportunities, strategic structuring, hidden opportunities
- **8 Report Type Variants**: full, market_pulse, hotspot_deep_dive, strategy_insight, finance_update, deal_breakdown, myth_busting, development_spotlight
- **Audience Segmentation**: general, investor, owner_occupier — with tailored system prompts and "What This Means For You" callouts
- **CTA Framework**: Dynamic calls-to-action generated per report type and audience
- **Content Rotation System**: Auto-cycles through 7 report types per schedule, creating varied communication rhythm
- **PDF Generator v2**: New section renderers for suburb intelligence, competitive edge, insight callouts, and CTA panels

### Database Schema
- `marketing_report_schedules`: Added `report_type`, `audience_segment`, `content_rotation_enabled`, `rotation_sequence`, `current_rotation_index`
- `marketing_intelligence_reports`: Added `report_type`, `audience_segment`
