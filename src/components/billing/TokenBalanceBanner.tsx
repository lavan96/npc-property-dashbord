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
  const isListingsPage = pathname === "/listings";
  const isCalendarPage = pathname === "/calendar";
  const isReportsPage = pathname === "/reports";
  const isReportQAPage = pathname === "/report-qa";
  const isReportRequestsPage = pathname === "/report-requests";
  const isPortfolioReportsPage = pathname === "/portfolio-reports";

  if (!lowBalance || !balance) return null;

  const pct = balance.allowance > 0
    ? Math.round((balance.available / balance.allowance) * 100)
    : 0;

  if (isPortfolioReportsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/35 bg-[linear-gradient(135deg,hsl(43_84%_52%/0.16),hsl(220_22%_7%/0.97)_46%,hsl(32_28%_9%/0.94))] px-4 py-3.5 shadow-[0_18px_55px_hsl(0_0%_0%/0.28)] backdrop-blur-xl dark:border-amber-300/30 sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/85 to-transparent" />
        <div className="pointer-events-none absolute -left-10 -top-16 h-32 w-32 rounded-full bg-amber-300/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/78">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/65 bg-amber-300 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_hsl(43_84%_52%/0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:bg-amber-200 hover:text-amber-950 hover:shadow-[0_18px_42px_hsl(43_84%_52%/0.34)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isReportRequestsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-[1.75rem] border-amber-300/35 bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(9,9,11,0.96)_42%,rgba(24,24,27,0.9))] px-4 py-3 shadow-[0_18px_55px_rgba(0,0,0,0.34)] backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -right-12 -top-20 h-36 w-36 rounded-full bg-amber-300/20 blur-3xl" />
        <Sparkles className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/70 bg-amber-300 px-5 font-semibold text-amber-950 shadow-[0_10px_28px_rgba(245,158,11,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:bg-amber-200 hover:text-amber-950 hover:shadow-[0_16px_38px_rgba(245,158,11,0.34)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isReportQAPage) {
    return (
      <Alert className="relative overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,hsl(43_74%_49%/0.18),hsl(220_18%_7%/0.96)_48%,hsl(30_22%_8%/0.94))] px-4 py-3 shadow-[0_18px_55px_hsl(0_0%_0%/0.35)] backdrop-blur-xl dark:border-amber-300/30">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -right-10 -top-16 h-32 w-32 rounded-full bg-amber-300/15 blur-3xl" />
        <Sparkles className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl text-amber-50/78">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/60 bg-amber-300 px-4 font-semibold text-amber-950 shadow-[0_10px_28px_hsl(43_74%_49%/0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:bg-amber-200 hover:text-amber-950 hover:shadow-[0_16px_36px_hsl(43_74%_49%/0.32)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isOverviewPage || isListingsPage) {
    return (
      <Alert className="relative overflow-hidden rounded-2xl border-amber-300/55 bg-gradient-to-r from-amber-50/85 via-card/90 to-card/85 px-4 py-3 shadow-[0_10px_30px_rgba(146,64,14,0.07)] backdrop-blur dark:border-amber-400/25 dark:from-amber-500/10 dark:via-slate-950/80 dark:to-slate-950/70">
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
            className="w-full shrink-0 rounded-full border-amber-300/70 bg-amber-500 px-4 font-semibold text-white shadow-sm shadow-amber-950/10 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-400 hover:bg-amber-600 hover:text-white hover:shadow-[0_12px_28px_rgba(217,119,6,0.22)] focus-visible:ring-amber-400 active:translate-y-0 sm:w-auto dark:border-amber-300/40 dark:bg-amber-400 dark:text-amber-950 dark:hover:bg-amber-300"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isReportsPage) {
    return (
      <Alert className="relative overflow-hidden rounded-3xl border-amber-300/50 bg-gradient-to-r from-amber-50/85 via-card/95 to-card/90 px-4 py-3 shadow-lg shadow-amber-950/5 backdrop-blur dark:border-amber-400/25 dark:from-amber-500/10 dark:via-zinc-950/85 dark:to-zinc-950/70">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/80 to-transparent" />
        <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-300" />
        <AlertTitle className="text-sm font-semibold text-amber-900 dark:text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl text-amber-950/75 dark:text-amber-100/75">
            <span className="font-semibold tabular-nums text-amber-950 dark:text-amber-100">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-300/70 bg-amber-500 px-4 font-semibold text-white shadow-md shadow-amber-950/10 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-400 hover:bg-amber-600 hover:text-white hover:shadow-[0_14px_32px_rgba(217,119,6,0.24)] focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 sm:w-auto dark:border-amber-300/40 dark:bg-amber-300 dark:text-amber-950 dark:hover:bg-amber-200"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isCalendarPage) {
    return (
      <Alert className="relative overflow-hidden rounded-2xl border-amber-300/45 bg-gradient-to-r from-amber-50/80 via-card/90 to-card/85 px-4 py-3 shadow-[0_10px_30px_rgba(146,64,14,0.06)] backdrop-blur dark:border-amber-400/20 dark:from-amber-500/10 dark:via-zinc-950/85 dark:to-zinc-950/75">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
        <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-300" />
        <AlertTitle className="text-sm font-semibold text-amber-900 dark:text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl text-amber-950/75 dark:text-amber-100/75">
            <span className="font-semibold tabular-nums text-amber-950 dark:text-amber-100">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-300/70 bg-amber-500 px-4 font-semibold text-white shadow-sm shadow-amber-950/10 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-400 hover:bg-amber-600 hover:text-white hover:shadow-[0_12px_28px_rgba(217,119,6,0.22)] focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 sm:w-auto dark:border-amber-300/35 dark:bg-amber-300 dark:text-amber-950 dark:hover:bg-amber-200"
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
