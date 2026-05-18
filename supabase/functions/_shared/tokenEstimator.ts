// Token estimation heuristics. Reserve generously — commit reconciles.
import type { TokenKind } from "./missionControl.ts";

const BASE: Record<TokenKind, number> = {
  "report.investment.compass": 12000,
  "report.investment.executive": 8000,
  "report.investment.snapshot": 4000,
  "report.suburb.compass": 10000,
  "report.postcode.compass": 10000,
  "report.market-intelligence": 6000,
  "report.portfolio-review": 8000,
  "report.bulk-item": 8000, // averaged; caller should override per-item
  "report.chart-analysis": 2000,
  "report.qualitative-regen": 3000,
};

export interface EstimateOptions {
  extraSections?: number;       // +20% each
  aiNarrative?: boolean;        // +50%
  multiplier?: number;          // arbitrary multiplier (e.g. bulk count)
}

export function estimateTokens(kind: TokenKind, opts: EstimateOptions = {}): number {
  let n = BASE[kind] ?? 5000;
  if (opts.extraSections && opts.extraSections > 0) {
    n = n * (1 + 0.2 * opts.extraSections);
  }
  if (opts.aiNarrative) n = n * 1.5;
  if (opts.multiplier && opts.multiplier > 0) n = n * opts.multiplier;
  return Math.ceil(n);
}

export function estimateBulk(items: Array<{ kind: TokenKind; opts?: EstimateOptions }>): number {
  return items.reduce((sum, it) => sum + estimateTokens(it.kind, it.opts), 0);
}

/** Heuristic for actual usage when no model usage object is returned. */
export function fallbackActual(estimated: number, success: boolean): number {
  // Assume ~80% of estimate on success, 0 on failure (cancel path handles that).
  return success ? Math.ceil(estimated * 0.8) : 0;
}
