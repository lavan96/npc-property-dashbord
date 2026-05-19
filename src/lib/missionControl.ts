/**
 * Frontend client for Mission Control token balance + top-up packs.
 * All requests go through the `mission-control-*` edge functions so the clone API key
 * never leaves the server. Pre-flight estimates live here so UI can gate "Generate" CTAs.
 */
import { supabase } from "@/integrations/supabase/client";

export type TokenKind =
  | "report.investment.compass"
  | "report.investment.executive"
  | "report.investment.snapshot"
  | "report.suburb.compass"
  | "report.postcode.compass"
  | "report.market-intelligence"
  | "report.portfolio-review"
  | "report.bulk-item"
  | "report.chart-analysis"
  | "report.qualitative-regen";

export interface TokenBalance {
  available: number;
  allowance: number;
  used: number;
  reserved: number;
  // Optional extended fields surfaced by mission-control-balance.
  lifetimeGranted?: number;
  lifetimeSpent?: number;
  planName?: string | null;
  overagePolicy?: string | null;
  currentPeriodEnd?: string | null;
}

export interface TopupPack {
  id: string;
  slug: string;
  name: string;
  tokens: number;
  priceCents: number;
  currency: string;
  expiresAfterDays: number | null;
}

export interface TopupPacksResult {
  packs: TopupPack[];
  topupUrl: string | null;
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
}

export class InsufficientTokensError extends Error {
  constructor(public available: number, public requested: number) {
    super(`Insufficient tokens: need ${requested}, have ${available}`);
    this.name = "InsufficientTokensError";
  }
}

/** Mirror of server-side estimator. Keep in sync with supabase/functions/_shared/tokenEstimator.ts. */
const BASE: Record<TokenKind, number> = {
  "report.investment.compass": 12000,
  "report.investment.executive": 8000,
  "report.investment.snapshot": 4000,
  "report.suburb.compass": 10000,
  "report.postcode.compass": 10000,
  "report.market-intelligence": 6000,
  "report.portfolio-review": 8000,
  "report.bulk-item": 8000,
  "report.chart-analysis": 2000,
  "report.qualitative-regen": 3000,
};

export function estimateTokens(
  kind: TokenKind,
  opts: { extraSections?: number; aiNarrative?: boolean; multiplier?: number } = {},
): number {
  let n = BASE[kind] ?? 5000;
  if (opts.extraSections && opts.extraSections > 0) n *= 1 + 0.2 * opts.extraSections;
  if (opts.aiNarrative) n *= 1.5;
  if (opts.multiplier && opts.multiplier > 0) n *= opts.multiplier;
  return Math.ceil(n);
}

export async function fetchTokenBalance(): Promise<TokenBalance> {
  const { invokeSecureFunction } = await import("@/lib/secureInvoke");
  const { data, error } = await invokeSecureFunction<TokenBalance>(
    "mission-control-balance",
    {},
  );
  if (error) throw new Error(error.message ?? "Failed to fetch balance");
  if (!data || typeof (data as any).available !== "number") {
    throw new Error("Invalid balance response");
  }
  return data as TokenBalance;
}

export async function fetchTopupPacks(): Promise<TopupPacksResult> {
  const { invokeSecureFunction } = await import("@/lib/secureInvoke");
  const { data, error } = await invokeSecureFunction<TopupPacksResult>(
    "mission-control-packs",
    {},
  );
  if (error) throw new Error(error.message ?? "Failed to fetch top-up packs");
  return (
    data ?? {
      packs: [],
      topupUrl: null,
      pagination: { limit: 50, offset: 0, total: 0, hasMore: false, nextOffset: null },
    }
  );
}

/** Throws InsufficientTokensError if available < estimate. Returns balance otherwise. */
export async function preflightTokens(estimate: number): Promise<TokenBalance> {
  const balance = await fetchTokenBalance();
  if (balance.available < estimate) {
    throw new InsufficientTokensError(balance.available, estimate);
  }
  return balance;
}

/** Mission Control billing/top-up URL — override per deployment if needed. */
export const MISSION_CONTROL_BILLING_URL =
  "https://aurixa-mission-control.lovable.app/billing";
export const MISSION_CONTROL_TOPUP_URL =
  "https://aurixa-mission-control.lovable.app/billing/topup";
