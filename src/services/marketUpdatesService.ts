import { supabase } from '@/integrations/supabase/client';
import type { MarketDigest24h, MarketDigestGenerationResult, MarketIngestionSummary, MarketQAMessage, MarketSource, MarketSourceHealth, MarketUpdate, MarketUpdateFilters } from '@/types/marketUpdates';

const safeArray = <T>(v: unknown): T[] => Array.isArray(v) ? v as T[] : [];
const db = supabase as any;
function warnMissing(context: string, error: any) { if (import.meta.env.DEV) console.warn(`[Market Updates] ${context}`, error?.message ?? error); }
const mapUpdate = (r: any): MarketUpdate => ({ ...r, geography: safeArray(r.geography), audience_tags: safeArray(r.audience_tags), key_points: safeArray(r.key_points), risk_flags: safeArray(r.risk_flags), citation_urls: safeArray(r.citation_urls), relevance_score: Number(r.relevance_score ?? 0) });
const mapDigest = (r: any): MarketDigest24h => ({ ...r, top_update_ids: safeArray(r.top_update_ids), finance_lending_highlights: safeArray(r.finance_lending_highlights), property_market_highlights: safeArray(r.property_market_highlights), construction_supply_highlights: safeArray(r.construction_supply_highlights), policy_regulation_highlights: safeArray(r.policy_regulation_highlights), political_economic_watchpoints: safeArray(r.political_economic_watchpoints), client_advisory_implications: safeArray(r.client_advisory_implications), recommended_watchlist_for_tomorrow: safeArray(r.recommended_watchlist_for_tomorrow), source_urls: safeArray(r.source_urls) });

export async function fetchMarketUpdates(filters: MarketUpdateFilters = {}): Promise<MarketUpdate[]> {
  try {
    let q = db.from('market_updates').select('*').eq('status', filters.status ?? 'published').order('source_published_at', { ascending: false, nullsFirst: false }).order('ingested_at', { ascending: false }).limit(filters.limit ?? 100);
    if (filters.category && filters.category !== 'all') q = q.eq('category', filters.category);
    if (filters.impact && filters.impact !== 'all') q = q.eq('impact_level', filters.impact);
    if (filters.geography && filters.geography !== 'all') q = q.contains('geography', [filters.geography]);
    if (filters.audience && filters.audience !== 'all') q = q.contains('audience_tags', [filters.audience]);
    if (filters.search) q = q.or(`title.ilike.%${filters.search}%,ai_summary.ilike.%${filters.search}%,source_name.ilike.%${filters.search}%`);
    if (filters.dateRange?.from) q = q.gte('source_published_at', filters.dateRange.from);
    if (filters.dateRange?.to) q = q.lte('source_published_at', filters.dateRange.to);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(mapUpdate);
  } catch (error) { warnMissing('Unable to fetch market_updates; returning empty feed.', error); return []; }
}
export async function fetchLatestMarketDigest(): Promise<MarketDigest24h | null> { try { const { data, error } = await db.from('market_digests').select('*').eq('status','published').order('generated_at',{ ascending:false }).limit(1).maybeSingle(); if (error) throw error; return data ? mapDigest(data) : null; } catch (e) { warnMissing('Unable to fetch latest market_digests.', e); return null; } }
export async function fetchMarketSources(): Promise<MarketSource[]> { try { const { data, error } = await db.from('market_sources').select('*').order('name'); if (error) throw error; return data ?? []; } catch (e) { warnMissing('Unable to fetch market_sources.', e); return []; } }
export async function fetchMarketSourceHealth(): Promise<MarketSourceHealth> { const sources = await fetchMarketSources(); const failed = sources.filter(s => Boolean(s.last_error)); const latest = (field: keyof MarketSource) => sources.map(s => s[field] as string | null | undefined).filter(Boolean).sort().pop() ?? null; return { totalSources: sources.length, enabledSources: sources.filter(s => s.enabled).length, failedSources: failed.length, lastFetchedAt: latest('last_fetched_at'), lastSuccessAt: latest('last_success_at'), lastError: failed[0]?.last_error ?? null }; }
export async function triggerMarketIngestion(options: { force?: boolean } = {}): Promise<MarketIngestionSummary> { try { const { data, error } = await db.functions.invoke('market-updates-ingest', { body: options }); if (error) throw error; return data as MarketIngestionSummary; } catch (e: any) { warnMissing('Ingestion function unavailable or not authorised.', e); return { ingested:0,published:0,candidates:0,ignored:0,failed:1,skippedDuplicates:0,sourceErrors:[],message:'Market ingestion is unavailable or you are not authorised to run it.' }; } }
export async function generateMarketDigest24h(): Promise<MarketDigestGenerationResult> { try { const { data, error } = await db.functions.invoke('market-updates-digest', { body: {} }); if (error) throw error; return data as MarketDigestGenerationResult; } catch (e) { warnMissing('Digest function unavailable.', e); return { digest: null, noData: true, message: 'No source-backed market updates were found in the last 24 hours.' }; } }
export async function answerMarketUpdateQuestion(question: string, updateIds?: string[]): Promise<MarketQAMessage> { try { const { data, error } = await db.functions.invoke('market-updates-qa', { body: { question, updateIds } }); if (error) throw error; return { id: crypto.randomUUID(), role:'assistant', content:data.answer, citations:safeArray(data.citations), source_update_ids:safeArray(data.source_update_ids), confidence_score:data.confidence_score, limitations:safeArray(data.limitations), created_at:new Date().toISOString() }; } catch (e) { warnMissing('Market Q&A function unavailable or insufficient context.', e); return { id: crypto.randomUUID(), role:'assistant', content:'I do not have enough sourced market updates to answer that yet.', citations:[], source_update_ids:[], confidence_score:0, limitations:['Market Q&A only answers from published, source-backed market updates.'], created_at:new Date().toISOString() }; } }
