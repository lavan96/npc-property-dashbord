import { useEffect, useState, useCallback } from "react";
import { fetchTokenBalance, type TokenBalance } from "@/lib/missionControl";

interface UseTokenBalanceOptions {
  /** Auto-refetch interval in ms. 0 = no polling. Default 60s. */
  pollMs?: number;
  /** Skip the initial fetch (e.g. while auth resolves). */
  enabled?: boolean;
}

export function useTokenBalance(opts: UseTokenBalanceOptions = {}) {
  const { pollMs = 60_000, enabled = true } = opts;
  const [balance, setBalance] = useState<TokenBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const b = await fetchTokenBalance();
      setBalance(b);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    if (pollMs > 0) {
      const id = setInterval(refresh, pollMs);
      return () => clearInterval(id);
    }
  }, [enabled, pollMs, refresh]);

  const lowBalance =
    balance != null && balance.allowance > 0 && balance.available / balance.allowance < 0.1;

  return { balance, loading, error, refresh, lowBalance };
}
