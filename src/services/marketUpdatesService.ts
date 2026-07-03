import type { MarketDigest24h, MarketSource, MarketUpdate, MarketQAMessage } from '@/types/marketUpdates';

export const MARKET_RELEVANCE_THRESHOLD = 60;

const relevanceTerms = [
  'australian property market', 'interest rates', 'lending policy', 'mortgage serviceability',
  'rba', 'inflation', 'construction costs', 'housing supply', 'rental market', 'planning approvals',
  'land releases', 'housing policy', 'first home buyer', 'stamp duty', 'tax changes', 'smsf',
  'investor lending', 'building approvals', 'migration', 'population growth', 'infrastructure',
  'real estate regulation',
];

export async function fetchMarketSources(): Promise<MarketSource[]> {
  // TODO: Phase 2 - load enabled source registry rows from Supabase/API.
  return [];
}

export async function fetchMarketUpdates(): Promise<MarketUpdate[]> {
  // TODO: Phase 2 - replace empty adapter with persisted market_updates query.
  return [];
}

export function normaliseSourceItems(_items: unknown[]): Partial<MarketUpdate>[] {
  // TODO: Phase 2 - normalise RSS/API/manual/partner feed payloads into MarketUpdate candidates.
  return [];
}

export function scoreMarketRelevance(input: { title?: string; excerpt?: string; body?: string }): number {
  const haystack = `${input.title ?? ''} ${input.excerpt ?? ''} ${input.body ?? ''}`.toLowerCase();
  const matches = relevanceTerms.filter((term) => haystack.includes(term)).length;
  return Math.min(100, Math.round((matches / 6) * 100));
}

export async function summariseMarketUpdate(candidate: Partial<MarketUpdate>): Promise<Partial<MarketUpdate>> {
  // TODO: Phase 2 - call source-grounded AI with MARKET_NEWS_API_KEY/MARKET_DATA_API_KEY/AI_SUMMARY_MODEL as needed.
  if (!candidate.raw_excerpt && !candidate.source_url) {
    return { ...candidate, ai_summary: 'Insufficient source detail to generate a reliable analysis.', confidence_score: 0 };
  }
  return candidate;
}

export async function ingestMarketUpdates(): Promise<{ ingested: number; published: number; ignored: number }> {
  // TODO: Phase 2 - schedule every 24h using cron/serverless infrastructure guarded by MARKET_UPDATE_CRON_SECRET.
  const sources = await fetchMarketSources();
  return { ingested: sources.length ? 0 : 0, published: 0, ignored: 0 };
}

export async function generateMarketDigest24h(updates: MarketUpdate[]): Promise<MarketDigest24h | null> {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recent = updates.filter((update) => new Date(update.ingested_at).getTime() >= dayAgo);
  if (recent.length === 0) return null;
  return {
    id: `digest-${new Date().toISOString()}`,
    generated_at: new Date().toISOString(),
    period_start: new Date(dayAgo).toISOString(),
    period_end: new Date().toISOString(),
    executive_summary: 'Digest generation will use source-grounded summaries once ingestion is connected.',
    top_update_ids: recent.slice(0, 5).map((update) => update.id),
    finance_lending_highlights: [], property_market_highlights: [], construction_supply_highlights: [],
    policy_regulation_highlights: [], political_economic_watchpoints: [], client_advisory_implications: [],
    recommended_watchlist_for_tomorrow: [], source_urls: recent.flatMap((update) => update.citation_urls),
  };
}

export function retrieveRelevantMarketUpdates(question: string, updates: MarketUpdate[]): MarketUpdate[] {
  const terms = question.toLowerCase().split(/\W+/).filter((term) => term.length > 3);
  return updates.filter((update) => terms.some((term) => `${update.title} ${update.ai_summary ?? ''}`.toLowerCase().includes(term)));
}

export function buildMarketQAPrompt(question: string, updates: MarketUpdate[]): string {
  return `Answer only from the supplied sourced market updates. If unsupported, say: “I do not have enough sourced market updates to answer that yet.”\nQuestion: ${question}\nSources: ${updates.map((u) => `${u.title} (${u.citation_urls.join(', ')})`).join('\n')}`;
}

export async function answerMarketUpdateQuestion(question: string, updates: MarketUpdate[]): Promise<MarketQAMessage> {
  const relevant = retrieveRelevantMarketUpdates(question, updates);
  return {
    id: `qa-${Date.now()}`,
    role: 'assistant',
    content: relevant.length ? 'Market Q&A engine will activate once source-grounded ingestion is connected.' : 'I do not have enough sourced market updates to answer that yet.',
    citations: relevant.flatMap((update) => update.citation_urls),
    created_at: new Date().toISOString(),
  };
}
