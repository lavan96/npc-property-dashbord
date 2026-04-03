
# Investment Report Quality Improvement Plan

## Problem 1: Inaccurate Research Data (Cash Rate & Economic Figures)

### Root Cause
The `rba-data-service` edge function **never actually parses** the RBA data it fetches. It downloads an Excel file from `rba.gov.au/statistics/tables/xls/f01hist.xls` but then returns **hardcoded values** (cash rate 4.35%, inflation 3.4%, etc.) regardless of what the file contains. These values are stale and inaccurate.

Additionally, Perplexity (sonar-pro) is relied on for qualitative research figures, but its training data may lag behind real-time changes.

### Solution: Live Economic Data via Perplexity Search

Replace the fake RBA data service with a **Perplexity-powered economic data fetcher** that uses real-time web search to get current figures:

1. **Rewrite `rba-data-service`** to use Perplexity's `sonar` model with structured JSON output to fetch:
   - Current RBA cash rate (from rba.gov.au)
   - Current CPI/inflation rate (from ABS)
   - Unemployment rate, GDP growth, credit growth
   - Domain-filter to authoritative sources: `rba.gov.au`, `abs.gov.au`, `treasury.gov.au`

2. **Cache with 24-hour TTL** (down from 7 days) — economic data changes more frequently than the current 7-day cache assumes. The RBA meets monthly and can change rates at any meeting.

3. **Inject verified data into the Perplexity prompt** — Instead of relying on Perplexity to independently research these figures during report generation, we inject the pre-fetched verified data as **authoritative context** so the AI uses exact numbers rather than potentially outdated training data.

4. **Add date stamping** — Each data point includes its source URL and retrieval date, so the report can cite "RBA Cash Rate as of [date]: X.XX%".

### Files Changed
- `supabase/functions/rba-data-service/index.ts` — Rewrite to use Perplexity structured search
- `supabase/functions/generate-investment-report/index.ts` — Enhance economic data injection into prompts

---

## Problem 2: Reports Too Dense & Not Client-Friendly

### Root Cause
The system message and section prompts instruct Perplexity to be "data-driven" with "extensive markdown tables" and "detailed bullet points." This produces reports packed with numbers/figures that read like analyst notes, not client deliverables.

### Solution: Consultative Narrative Tone Shift

1. **Update the system message** to shift from "analyst producing data tables" to "trusted advisor writing for property investors who are NOT analysts":
   - Lead with plain-English insights before showing supporting data
   - Use narrative paragraphs with selective data highlights (not raw data dumps)
   - Replace dense tables with focused comparison tables (max 4-5 rows)
   - Add "What This Means For You" callout sections after technical data
   - Use analogies and context to make numbers meaningful (e.g., "growing 40% faster than the metro average")

2. **Add a readability directive** to each section prompt:
   - Executive Summary: Conversational, action-oriented, no tables
   - Location/Demographics: Storytelling with selective stats
   - Financial sections: Keep tables but add plain-English summaries above each
   - Market sections: Lead with narrative, support with data
   - Risk sections: Clear, prioritized, with actionable mitigations

3. **Reduce table density** — Add explicit instruction: "Use tables ONLY for direct comparisons or financial breakdowns. Never use a table when a sentence would suffice."

4. **Add section transitions** — Instruct the AI to include brief connecting sentences between sections for narrative flow.

### Files Changed
- `supabase/functions/generate-investment-report/index.ts` — Update system message and section prompt templates

---

## Implementation Order

1. **Phase A**: Rewrite `rba-data-service` with Perplexity-powered live data (accuracy fix)
2. **Phase B**: Update report generation prompts for client-friendly tone (readability fix)
3. **Phase C**: Deploy and test with a sample report generation

### Estimated Scope
- 2 edge functions modified
- No database schema changes required
- No frontend changes required (report rendering stays the same, content quality improves)
