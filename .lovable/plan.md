## Market Updates — Real-Data Intelligence Overhaul

### Goal
Turn Market Updates from an empty shell into a live, source-cited AU real-estate intelligence workspace segmented by **Finance, Property, Construction/Supply, Political, Economic, Social, Policy/Regulation, Rental**, with **cited sources, freshness timestamps**, and digests for **24h / weekly / biweekly / monthly / quarterly / annual** periods.

---

### 1. Data Ingestion (server-side)

**Sources (`market_sources` seed expansion)** — free/legal RSS + APIs first, licensed providers behind flags:
- Finance: RBA, APRA, ABS Lending Indicators, AFR RSS, Livewire
- Property: CoreLogic/Cotality blog RSS, PropTrack/REA Insights, Domain Research, SQM Research
- Construction/Supply: HIA, Master Builders, ABS Building Approvals, Infrastructure Australia
- Political: Parliament of Australia RSS (housing committee), state planning ministers' feeds
- Economic: ABS CPI/GDP/Wages, Treasury releases, RBA SoMP
- Social: AHURI, ACOSS housing, Productivity Commission
- Policy/Regulation: NCCP/ASIC media, state revenue offices, First Home schemes
- Rental: Tenants Union feeds, PropTrack rental report, SQM vacancy

**Ingestion pipeline** (extend existing `market-updates-ingest`):
1. Fetch enabled sources on cron (hourly for high-freq, daily for others via `refresh_frequency_hours`).
2. Normalise → dedupe by `dedupe_hash` → relevance score (existing) → **AI classification** into 8 segments via Lovable AI (`google/gemini-3-flash-preview`), returning: `category`, `segments[]` (multi-tag), `geography[]`, `impact_level`, `audience_tags[]`, `ai_summary`, `key_points[]`, `why_it_matters`, `property_implications`, `finance_implications`, `policy_implications`, `risk_flags[]`, `confidence_score`, `citation_urls[]` (must include original source URL).
3. Persist to `market_updates` with `status='published'` if confidence ≥ threshold, else `candidate` for review.
4. Every update card **must** render: source name, source URL (clickable), `source_published_at`, `ingested_at` ("Ingested 2h ago"), and citation chips linking to originals.

**Schema additions** (new migration):
- `market_updates.segments text[]` (multi-segment tagging; keep `category` for primary).
- `market_updates.freshness_tier text` (`breaking` <6h, `today` <24h, `this_week`, `older`) — computed on read or via trigger.
- New table `market_digests` gains `period text` enum: `24h | weekly | biweekly | monthly | quarterly | annual`, plus `period_start`, `period_end`, `segment_breakdown jsonb`. Unique on `(period, period_start)`.

### 2. Digests — Multi-Period

Extend `market-updates-digest` edge function:
- Accept `{ period: '24h'|'weekly'|'biweekly'|'monthly'|'quarterly'|'annual' }`.
- Query published updates in the window, group by segment, feed to AI for an executive summary + per-segment highlights + client-advisory implications + citations.
- Store one row per `(period, period_start)`; return latest per period.
- Cron schedule: 24h daily, weekly Mon, biweekly alt Mon, monthly 1st, quarterly Jan/Apr/Jul/Oct 1st, annual Jan 1.

### 3. Frontend (`src/pages/MarketUpdates.tsx`)

Rebuild layout using **branded semantic tokens only** (no slate/cyan hardcodes — consistent with recent Branding refactor):

- **Header:** title, freshness badge ("Live · Last sync 4m ago"), Refresh + Sources buttons.
- **Digest selector:** Tabs `24h | Weekly | Biweekly | Monthly | Quarterly | Annual`. Each tab shows the latest digest for that period with Generate/Regenerate button + export.
- **Segment filter chips:** Finance, Property, Construction/Supply, Political, Economic, Social, Policy/Regulation, Rental, All. Multi-select.
- **Secondary filters:** Geography, Impact, Audience, Freshness (Breaking/Today/This week/All), Search.
- **KPI strip:** Updates today, Breaking (<6h), High-impact, per-segment counts.
- **Update cards** show: segment badge(s), impact, geography, **source name + logo**, **"Published" timestamp + relative age**, **"Ingested" timestamp**, AI summary, why-it-matters, citation chips (each links to source), Open Analysis / Ask AI / Source buttons.
- **Sidebar:** Segment breakdown, High-impact watchlist, Ask-AI (source-grounded), Source Health.
- **Analysis dialog:** full AI breakdown + all citations rendered as clickable list with source + accessed date.

### 4. Citation & Freshness Guarantees
- Every card enforces `source_url` + `source_published_at` presence (fallback to `ingested_at` + "publication date unknown" flag).
- Q&A responses only cite from `citation_urls` of matched updates; refuse if none.
- Never render an update lacking a source URL.

### 5. Technical File Map

**Backend**
- `supabase/migrations/<ts>_market_updates_segments_and_periods.sql` — add `segments`, `freshness_tier`, extend `market_digests.period`, seed new sources.
- `supabase/functions/market-updates-ingest/index.ts` — add AI classification step via Lovable AI Gateway.
- `supabase/functions/market-updates-digest/index.ts` — accept `period`, window logic, per-segment grouping.
- Cron schedules via pg_cron for each period.

**Frontend**
- `src/types/marketUpdates.ts` — add `MarketDigestPeriod`, `segments`, `freshness_tier`.
- `src/services/marketUpdatesService.ts` — `generateMarketDigest(period)`, `fetchLatestMarketDigest(period)`, `fetchMarketDigestsByPeriod`.
- `src/pages/MarketUpdates.tsx` — full rebuild per §3.
- New components: `src/components/market-updates/{DigestPeriodTabs,SegmentFilterChips,MarketUpdateCard,CitationList,FreshnessBadge,SourceHealthPanel,AskMarketAI}.tsx`.
- Styling via semantic tokens (`bg-card`, `text-foreground`, `border-border`, `bg-warning/10`, etc.) — respects Branding page.

### 6. Rollout Phases
1. **Schema + seeds** migration (segments, periods, extra sources — disabled by default).
2. **Ingestion AI classification** wired to Lovable AI Gateway; enable 3–5 official free RSS sources (RBA, ABS, APRA, HIA, Parliament).
3. **Multi-period digest** edge function + cron.
4. **Frontend rebuild** with segments, period tabs, citations, freshness, branded tokens.
5. **Q&A hardening** to enforce source-only answers.
6. **Ops:** source health alerts + admin toggle for enabling additional sources after licensing review.

### Open Confirmations
- OK to use **Lovable AI Gateway (`google/gemini-3-flash-preview`)** for classification + digest summarisation? (default per project standards)
- Any licensed providers (CoreLogic/Cotality/PropTrack/Domain) you already have keys for that we should wire beyond RSS?
- Should Political/Social segments include state-level parliament and ACOSS/AHURI, or restrict to federal + peak bodies initially?
