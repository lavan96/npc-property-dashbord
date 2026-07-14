import { useEffect, useState, useCallback, useRef } from "react";
import { fetchTokenBalance, type TokenBalance } from "@/lib/missionControl";
import { onTokensUsed, onOutOfTokens } from "@/lib/tokenEvents";
import { hasActiveSession } from "@/lib/secureInvoke";

interface UseTokenBalanceOptions {
  /** Auto-refetch interval in ms. 0 = no polling. Default 3 minutes. */
  pollMs?: number;
  /** Skip the initial fetch (e.g. while auth resolves). */
  enabled?: boolean;
  /** Also refetch when the tab regains focus / becomes visible. Default true. */
  refetchOnFocus?: boolean;
  /** Also refetch when a token event fires (tokens-used / out-of-tokens). Default true. */
  refetchOnTokenEvent?: boolean;
}

export function useTokenBalance(opts: UseTokenBalanceOptions = {}) {
  const {
    pollMs = 180_000,
    enabled = true,
    refetchOnFocus = true,
    refetchOnTokenEvent = true,
  } = opts;
  const [balance, setBalance] = useState<TokenBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const lastFetchRef = useRef(0);

  const refresh = useCallback(async () => {
    // Skip silently when no active session — avoids noisy 401s on public/auth screens.
    if (!hasActiveSession()) {
      setBalance(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    lastFetchRef.current = Date.now();
    try {
      const b = await fetchTokenBalance();
      setBalance(b);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Treat auth failures as "no balance yet" instead of a hard error to prevent UI crashes.
      if (/401|unauthor|session/i.test(msg)) {
        setBalance(null);
        setError(null);
      } else {
        setError(e instanceof Error ? e : new Error(msg));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial + polling
  useEffect(() => {
    if (!enabled) return;
    refresh();
    if (pollMs > 0) {
      const id = setInterval(refresh, pollMs);
      return () => clearInterval(id);
    }
  }, [enabled, pollMs, refresh]);

  // Refetch on tab focus / visibility (throttled to once / 30s)
  useEffect(() => {
    if (!enabled || !refetchOnFocus) return;
    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchRef.current < 30_000) return;
      refresh();
    };
    window.addEventListener("focus", maybeRefresh);
    document.addEventListener("visibilitychange", maybeRefresh);
    return () => {
      window.removeEventListener("focus", maybeRefresh);
      document.removeEventListener("visibilitychange", maybeRefresh);
    };
  }, [enabled, refetchOnFocus, refresh]);

  // Refetch immediately when a generator emits a token event so the pill reflects spend in real-time.
  useEffect(() => {
    if (!enabled || !refetchOnTokenEvent) return;
    const offUsed = onTokensUsed(() => {
      // small debounce so we don't hammer when multiple chunks land at once
      setTimeout(() => refresh(), 750);
    });
    const offOut = onOutOfTokens(() => refresh());
    return () => {
      offUsed();
      offOut();
    };
  }, [enabled, refetchOnTokenEvent, refresh]);

  const lowBalance =
    balance != null && !balance.exempt && balance.allowance > 0 &&
    balance.available / balance.allowance < 0.1;
  const criticalBalance =
    balance != null && !balance.exempt && balance.allowance > 0 &&
    balance.available / balance.allowance < 0.05;

  return { balance, loading, error, refresh, lowBalance, criticalBalance };
}
