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
  const isChartsPage = pathname === "/charts";
  const isReportQAPage = pathname === "/report-qa";
  const isReportRequestsPage = pathname === "/report-requests";
  const isPortfolioReportsPage = pathname === "/portfolio-reports";
  const isClientsPage = pathname === "/clients";
  const isClientTrackerPage = pathname === "/client-tracker";
  const isMessagesPage = pathname === "/messages";
  const isCallLogsPage = pathname === "/call-logs";
  const isChecklistsPage = pathname === "/checklists";
  const isRemindersPage = pathname === "/reminders";
  const isAgreementsPage = pathname === "/agreements";
  const isMonitoringPage = pathname === "/monitoring";
  const isDataImportPage = pathname === "/data-import";
  const isActivityLogsPage = pathname === "/admin/activity-logs";

  if (!lowBalance || !balance) return null;

  const pct = balance.allowance > 0
    ? Math.round((balance.available / balance.allowance) * 100)
    : 0;


  if (isActivityLogsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-[1600px] min-w-0 overflow-hidden rounded-[1.5rem] border-warning/35 bg-[radial-gradient(circle_at_top_left,hsl(var(--warning)/0.18),transparent_34%),linear-gradient(135deg,hsl(var(--warning-light)/0.40),hsl(var(--card)/0.98)_44%,hsl(var(--dashboard-surface-elevated)/0.90))] px-4 py-3.5 shadow-[0_16px_44px_hsl(var(--foreground)/0.08)] backdrop-blur-xl dark:border-warning/30 dark:bg-[radial-gradient(circle_at_top_left,hsl(var(--warning)/0.16),transparent_34%),linear-gradient(135deg,hsl(var(--warning-light)/0.22),hsl(var(--card)/0.88)_44%,hsl(var(--background)/0.78))] dark:shadow-black/30 sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-warning/70 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-16 h-32 w-32 rounded-full bg-warning/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 bottom-0 h-28 w-28 rounded-full bg-primary/10 blur-3xl" />
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-warning/30 bg-warning/10 text-warning shadow-sm">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <AlertTitle className="min-w-0 text-sm font-semibold tracking-tight text-warning">Token balance low</AlertTitle>
        <AlertDescription className="flex min-w-0 flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="min-w-0 max-w-3xl break-words leading-6 text-foreground/80">
            <span className="font-semibold tabular-nums text-foreground">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-primary/35 bg-primary px-5 font-semibold text-primary-foreground shadow-[0_12px_30px_hsl(var(--warning)/0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary-hover hover:text-primary-foreground hover:shadow-[0_18px_42px_hsl(var(--warning)/0.30)] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-60 dark:border-primary/45 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isDataImportPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-[1600px] min-w-0 overflow-hidden rounded-[1.5rem] border-warning/35 ring-1 ring-warning/10 transition-shadow duration-300 hover:shadow-[0_20px_56px_hsl(var(--warning)/0.14)] bg-[radial-gradient(circle_at_top_left,hsl(var(--warning)/0.18),transparent_34%),linear-gradient(135deg,hsl(var(--warning-light)/0.36),hsl(var(--card)/0.96)_44%,hsl(var(--dashboard-surface-elevated)/0.88))] px-4 py-3.5 shadow-[0_16px_44px_hsl(var(--foreground)/0.08)] backdrop-blur-xl dark:border-warning/30 dark:bg-[radial-gradient(circle_at_top_left,hsl(var(--warning)/0.16),transparent_34%),linear-gradient(135deg,hsl(var(--warning-light)/0.22),hsl(var(--card)/0.88)_44%,hsl(var(--background)/0.78))] dark:shadow-black/30 sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-warning/70 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-16 h-32 w-32 rounded-full bg-warning/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 bottom-0 h-28 w-28 rounded-full bg-primary/10 blur-3xl" />
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-warning/30 bg-warning/10 text-warning shadow-sm">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <AlertTitle className="min-w-0 text-sm font-semibold tracking-tight text-warning">Token balance low</AlertTitle>
        <AlertDescription className="flex min-w-0 flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="min-w-0 max-w-3xl break-words leading-6 text-foreground/80">
            <span className="font-semibold tabular-nums text-foreground">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-primary/35 ring-1 ring-primary/10 bg-primary px-5 font-semibold text-primary-foreground shadow-[0_12px_30px_hsl(var(--warning)/0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary-hover hover:text-primary-foreground hover:shadow-[0_18px_42px_hsl(var(--warning)/0.30)] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-60 dark:border-primary/45 dark:bg-primary dark:hover:bg-primary-hover sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isErrorLogsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-[1600px] min-w-0 overflow-hidden rounded-[1.5rem] border-warning/35 bg-[radial-gradient(circle_at_top_left,hsl(var(--warning)/0.20),transparent_32%),linear-gradient(135deg,hsl(var(--warning-light)/0.40),hsl(var(--card)/0.96)_42%,hsl(var(--dashboard-surface-elevated)/0.90))] px-4 py-3.5 shadow-[0_18px_52px_hsl(var(--foreground)/0.09)] ring-1 ring-warning/10 backdrop-blur-xl transition-shadow duration-300 hover:shadow-[0_22px_62px_hsl(var(--warning)/0.16)] dark:border-warning/30 dark:bg-[radial-gradient(circle_at_top_left,hsl(var(--warning)/0.16),transparent_34%),linear-gradient(135deg,hsl(var(--warning-light)/0.22),hsl(var(--card)/0.88)_46%,hsl(var(--background)/0.80))] dark:shadow-black/30 sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-warning/70 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-16 h-32 w-32 rounded-full bg-warning/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 bottom-0 h-28 w-28 rounded-full bg-primary/10 blur-3xl" />
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-warning/30 bg-warning/10 text-warning shadow-sm">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <AlertTitle className="min-w-0 text-sm font-semibold tracking-tight text-warning">Token balance low</AlertTitle>
        <AlertDescription className="flex min-w-0 flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="min-w-0 max-w-3xl break-words leading-6 text-foreground/80 dark:text-foreground/82">
            <span className="font-semibold tabular-nums text-foreground">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-primary/35 bg-primary px-5 font-semibold text-primary-foreground shadow-[0_12px_30px_hsl(var(--warning)/0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary-hover hover:text-primary-foreground hover:shadow-[0_18px_42px_hsl(var(--warning)/0.30)] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-60 dark:border-primary/45 dark:bg-primary dark:hover:bg-primary-hover sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isMonitoringPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-[1600px] min-w-0 overflow-hidden rounded-[1.5rem] border-warning/35 bg-[radial-gradient(circle_at_top_left,hsl(var(--warning)/0.18),transparent_32%),linear-gradient(135deg,hsl(var(--warning-light)/0.42),hsl(var(--card)/0.96)_42%,hsl(var(--dashboard-surface-elevated)/0.90))] px-4 py-3.5 shadow-[0_16px_44px_hsl(var(--foreground)/0.08)] backdrop-blur-xl dark:border-warning/30 dark:bg-[radial-gradient(circle_at_top_left,hsl(var(--warning)/0.16),transparent_32%),linear-gradient(135deg,hsl(var(--warning-light)/0.24),hsl(var(--card)/0.88)_44%,hsl(var(--background)/0.82))] sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-warning/70 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-16 h-32 w-32 rounded-full bg-warning/15 blur-3xl" />
        <Sparkles className="h-4 w-4 text-warning" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-warning">Token balance low</AlertTitle>
        <AlertDescription className="flex min-w-0 flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="min-w-0 max-w-3xl break-words leading-6 text-foreground/78 dark:text-foreground/82">
            <span className="font-semibold tabular-nums text-foreground">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-primary/35 bg-primary px-5 font-semibold text-primary-foreground shadow-[0_12px_30px_hsl(var(--primary)/0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary-hover hover:text-primary-foreground hover:shadow-[0_18px_42px_hsl(var(--primary)/0.30)] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-60 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isAgreementsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-[1.75rem] border-amber-300/45 bg-[linear-gradient(135deg,hsl(43_84%_52%/0.18),hsl(var(--card)/0.96)_40%,hsl(var(--background)/0.88))] px-4 py-3.5 shadow-[0_18px_54px_hsl(43_74%_28%/0.13)] backdrop-blur-xl dark:border-amber-300/30 dark:bg-[linear-gradient(135deg,hsl(43_84%_52%/0.16),hsl(var(--card)/0.82)_42%,hsl(var(--background)/0.70))] dark:shadow-[0_18px_60px_hsl(0_0%_0%/0.34)] sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-16 h-32 w-32 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 bottom-0 h-28 w-28 rounded-full bg-primary/10 blur-3xl" />
        <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-950 dark:text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-950/76 dark:text-amber-50/78">
            <span className="font-semibold tabular-nums text-amber-950 dark:text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-300/75 bg-gradient-to-r from-amber-400 to-yellow-300 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_hsl(43_84%_52%/0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-200 hover:from-amber-300 hover:to-yellow-200 hover:text-amber-950 hover:shadow-[0_18px_42px_hsl(43_84%_52%/0.34)] focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isRemindersPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-[1.6rem] border-amber-300/40 bg-[linear-gradient(135deg,rgba(245,158,11,0.20),rgba(5,5,5,0.96)_44%,rgba(17,24,39,0.92))] px-4 py-3.5 shadow-[0_20px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-14 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 bottom-0 h-28 w-28 rounded-full bg-orange-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isChecklistsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isCallLogsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-[1800px] overflow-hidden rounded-3xl border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.94))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-gradient-to-r from-amber-300 to-yellow-400 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:from-amber-200 hover:to-yellow-300 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.38)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isMessagesPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-[1520px] overflow-hidden rounded-[1.35rem] border-amber-300/35 bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(9,9,11,0.96)_44%,rgba(23,23,23,0.92))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/85 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/70 bg-amber-300 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:bg-amber-200 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.34)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isClientTrackerPage) {
    return (
      <Alert className="relative overflow-hidden rounded-[1.35rem] border-amber-300/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.20),rgba(10,10,10,0.97)_42%,rgba(24,24,27,0.92))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-primary/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/75 bg-amber-300 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.26)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:bg-amber-200 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.36)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isClientsPage) {
    return (
      <Alert className="relative overflow-hidden rounded-3xl border-amber-300/40 bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(10,10,10,0.96)_44%,rgba(24,24,27,0.92))] px-4 py-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.32)] backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-12 -top-20 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
        <AlertTriangle className="h-4 w-4 text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-50/80">
            <span className="font-semibold tabular-nums text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-200/70 bg-amber-300 px-5 font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:bg-amber-200 hover:text-amber-950 hover:shadow-[0_18px_42px_rgba(245,158,11,0.34)] focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-0 sm:w-auto"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

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
            aria-label="Top up token balance"
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
            aria-label="Top up token balance"
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
            aria-label="Top up token balance"
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
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-300/70 ring-1 ring-amber-300/20 bg-amber-500 px-4 font-semibold text-foreground dark:text-white shadow-sm shadow-amber-950/10 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-400 hover:bg-amber-600 hover:text-white hover:shadow-[0_12px_28px_rgba(217,119,6,0.22)] focus-visible:ring-amber-400 active:translate-y-0 sm:w-auto dark:border-amber-300/40 dark:bg-amber-400 dark:text-amber-950 dark:hover:bg-amber-300"
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
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-300/70 ring-1 ring-amber-300/20 bg-amber-500 px-4 font-semibold text-foreground dark:text-white shadow-md shadow-amber-950/10 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-400 hover:bg-amber-600 hover:text-white hover:shadow-[0_14px_32px_rgba(217,119,6,0.24)] focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 sm:w-auto dark:border-amber-300/40 dark:bg-amber-300 dark:text-amber-950 dark:hover:bg-amber-200"
          >
            Top up
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isChartsPage) {
    return (
      <Alert className="relative mx-auto w-full max-w-[1700px] overflow-hidden rounded-[1.75rem] border-amber-300/45 bg-[linear-gradient(135deg,hsl(43_84%_52%/0.18),hsl(var(--card)/0.96)_42%,hsl(var(--background)/0.88))] px-4 py-3.5 shadow-[0_18px_50px_hsl(43_74%_28%/0.12)] backdrop-blur-xl dark:border-amber-300/30 dark:bg-[linear-gradient(135deg,hsl(43_84%_52%/0.16),hsl(220_22%_7%/0.97)_46%,hsl(32_28%_9%/0.94))] dark:shadow-[0_18px_55px_hsl(0_0%_0%/0.3)] sm:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
        <div className="pointer-events-none absolute -left-10 -top-16 h-32 w-32 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-primary/10 blur-3xl" />
        <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-200" />
        <AlertTitle className="text-sm font-semibold tracking-tight text-amber-950 dark:text-amber-100">Token balance low</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-3xl leading-6 text-amber-950/76 dark:text-amber-50/78">
            <span className="font-semibold tabular-nums text-amber-950 dark:text-amber-50">{balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).</span>{' '}
            Top up to avoid interrupted report generation.
          </span>
          <Button
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-300/75 bg-amber-500 px-5 font-semibold text-foreground dark:text-white shadow-[0_12px_30px_hsl(43_84%_52%/0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-400 hover:bg-amber-600 hover:text-white hover:shadow-[0_18px_42px_hsl(43_84%_52%/0.32)] focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 dark:border-amber-200/65 dark:bg-amber-300 dark:text-amber-950 dark:hover:border-amber-100 dark:hover:bg-amber-200 dark:hover:text-amber-950 sm:w-auto"
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
            aria-label="Top up token balance"
            variant="outline"
            size="sm"
            onClick={() => openMissionControl(MISSION_CONTROL_TOPUP_URL)}
            className="w-full shrink-0 rounded-full border-amber-300/70 ring-1 ring-amber-300/20 bg-amber-500 px-4 font-semibold text-foreground dark:text-white shadow-sm shadow-amber-950/10 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-400 hover:bg-amber-600 hover:text-white hover:shadow-[0_12px_28px_rgba(217,119,6,0.22)] focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 sm:w-auto dark:border-amber-300/35 dark:bg-amber-300 dark:text-amber-950 dark:hover:bg-amber-200"
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
