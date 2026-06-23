import { AlertTriangle, Sparkles } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { MISSION_CONTROL_TOPUP_URL, openMissionControl } from "@/lib/missionControl";

/**
 * Low-balance warning. Renders only when remaining tokens drop below 10% of allowance.
 * Mount near the top of report-generation pages.
 */
export function TokenBalanceBanner() {
  const { balance, lowBalance } = useTokenBalance();
  const { pathname } = useLocation();
  const isOverviewPage = pathname === "/";

  if (!lowBalance || !balance) return null;

  const pct = balance.allowance > 0
    ? Math.round((balance.available / balance.allowance) * 100)
    : 0;

  if (isOverviewPage) {
    return (
      <Alert className="relative overflow-hidden rounded-2xl border-amber-300/60 bg-gradient-to-r from-amber-50/90 via-card to-card px-4 py-3 shadow-sm shadow-amber-950/5 dark:border-amber-400/25 dark:from-amber-500/10 dark:via-slate-950/80 dark:to-slate-950/70">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/80 to-transparent" />
        <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-300" />
        <AlertTitle className="text-sm font-semibold text-amber-900 dark:text-amber-200">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl text-amber-950/75 dark:text-amber-100/75">
            <span className="font-semibold tabular-nums text-amber-950 dark:text-amber-100">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 border-amber-300/70 bg-amber-500 text-white shadow-sm shadow-amber-950/10 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-400 hover:bg-amber-600 hover:text-white focus-visible:ring-amber-400 active:translate-y-0 sm:w-auto dark:border-amber-300/40 dark:bg-amber-400 dark:text-amber-950 dark:hover:bg-amber-300"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="border-warning bg-warning/10">
      <AlertTriangle className="h-4 w-4 text-warning" />
      <AlertTitle className="text-warning">Token balance low</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">
          {balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).
          Top up to avoid interrupted report generation.
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
        >
          Top up
        </Button>
      </AlertDescription>
    </Alert>
  );
}
