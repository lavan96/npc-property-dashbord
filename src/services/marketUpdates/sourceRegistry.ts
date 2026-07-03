import type { MarketSource, MarketSourceType } from '@/types/marketUpdates';
import { marketSourceSeeds } from './sourceSeeds';
export const supportedMarketSourceTypes: MarketSourceType[] = ['rss','api','manual','partner_feed'];
export function getSeedMarketSources(): Array<Omit<MarketSource,'id'|'created_at'|'updated_at'>> { return marketSourceSeeds; }
export function isSupportedMarketSourceType(type: string): type is MarketSourceType { return supportedMarketSourceTypes.includes(type as MarketSourceType); }
