/**
 * Frontend helper: pre-flight check + invoke a metered generator.
 * Handles insufficient_funds uniformly by surfacing the OutOfTokensBanner.
 */
import { invokeSecureFunction, type InvokeResult } from "@/lib/secureInvoke";
import {
  preflightTokens,
  estimateTokens,
  InsufficientTokensError,
  type TokenKind,
} from "@/lib/missionControl";
import { emitOutOfTokens } from "@/lib/tokenEvents";

export interface GenerateWithTokensOptions {
  kind: TokenKind;
  /** Friendly label, used in banners/toasts. */
  label?: string;
  /** Optional estimate overrides forwarded to estimateTokens. */
  estimate?: { extraSections?: number; aiNarrative?: boolean; multiplier?: number };
  /** Explicit estimate (bypasses heuristic). */
  estimatedTokens?: number;
  /** Skip preflight balance fetch (server still gates on reserve). */
  skipPreflight?: boolean;
  /** Timeout in ms. */
  timeoutMs?: number;
}

export async function generateWithTokens<T = any>(
  functionName: string,
  body: Record<string, any>,
  opts: GenerateWithTokensOptions,
): Promise<InvokeResult<T>> {
  const estimate = opts.estimatedTokens ?? estimateTokens(opts.kind, opts.estimate);

  if (!opts.skipPreflight) {
    try {
      await preflightTokens(estimate);
    } catch (e) {
      if (e instanceof InsufficientTokensError) {
        emitOutOfTokens({
          available: e.available,
          requested: e.requested,
          functionName,
          label: opts.label,
        });
        return {
          data: null,
          error: { message: `Insufficient tokens (need ${e.requested}, have ${e.available})` },
        };
      }
      // Balance fetch failed — let the server gate on reserve.
      console.warn("[generateWithTokens] preflight failed, continuing:", e);
    }
  }

  const result = await invokeSecureFunction<T>(functionName, body, {
    timeoutMs: opts.timeoutMs,
  });
  // Emit handled inside invokeSecureFunction; pass-through here.
  return result;
}
