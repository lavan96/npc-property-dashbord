export type MarketSourceType = 'rss' | 'api' | 'manual' | 'partner_feed';
export type MarketUpdateCategory = 'finance' | 'property_market' | 'construction' | 'policy_regulation' | 'rental_market' | 'economy' | 'planning_supply' | 'political';
export type MarketGeography = 'Australia' | 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'TAS' | 'ACT' | 'NT';
export type MarketImpactLevel = 'low' | 'medium' | 'high';
export type MarketAudienceTag = 'investors' | 'owner_occupiers' | 'first_home_buyers' | 'smsf' | 'developers' | 'buyers_agents' | 'mortgage_brokers';
export type MarketUpdateStatus = 'draft' | 'published' | 'ignored';

export interface MarketSource {
  id: string;
  name: string;
  source_type: MarketSourceType;
  url: string;
  category: MarketUpdateCategory;
  geography: MarketGeography;
  reliability_tier: 'primary' | 'verified' | 'partner' | 'watchlist';
  enabled: boolean;
  refresh_frequency_hours: number;
  created_at: string;
  updated_at: string;
}

export interface MarketUpdate {
  id: string;
  title: string;
  slug: string;
  source_id: string;
  source_name: string;
  source_url?: string;
  source_published_at?: string;
  ingested_at: string;
  category: MarketUpdateCategory;
  geography: MarketGeography[];
  impact_level: MarketImpactLevel;
  audience_tags: MarketAudienceTag[];
  raw_excerpt?: string;
  ai_summary?: string;
  key_points: string[];
  why_it_matters?: string;
  property_implications?: string;
  finance_implications?: string;
  policy_implications?: string;
  risk_flags: string[];
  confidence_score?: number;
  citation_urls: string[];
  status: MarketUpdateStatus;
  dedupe_hash?: string;
  created_at: string;
  updated_at: string;
}

export interface MarketDigest24h {
  id: string;
  generated_at: string;
  period_start: string;
  period_end: string;
  executive_summary: string;
  top_update_ids: string[];
  finance_lending_highlights: string[];
  property_market_highlights: string[];
  construction_supply_highlights: string[];
  policy_regulation_highlights: string[];
  political_economic_watchpoints: string[];
  client_advisory_implications: string[];
  recommended_watchlist_for_tomorrow: string[];
  source_urls: string[];
}

export interface MarketQAMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: string[];
  created_at: string;
}
