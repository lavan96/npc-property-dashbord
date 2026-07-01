import { useCallback, useEffect, useState, useMemo } from "react";
import { invokeSecureFunction } from "@/lib/secureInvoke";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardThemeFrame } from "@/components/layout/DashboardThemeFrame";
import { cn } from "@/lib/utils";
import { AlertTriangle, Clock3, DatabaseZap, FileKey2, Filter, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { TokenEventDetailsDrawer } from "@/components/billing/TokenEventDetailsDrawer";

interface AuditRow {
  id: string;
  created_at: string;
  event: "reserve" | "commit" | "cancel" | string;
  user_id: string | null;
  function_name: string | null;
  kind: string | null;
  idempotency_key: string;
  job_id: string | null;
  requested_tokens: number;
  reserved_tokens: number;
  used_tokens: number;
  available_tokens: number;
  status: string | null;
  reason: string | null;
  error_message: string | null;
}

function EventBadge({ event }: { event: string }) {
  const className =
    event === "reserve"
      ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : event === "commit"
        ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        : event === "cancel"
          ? "border-destructive/25 bg-destructive/10 text-destructive"
          : "border-border/70 bg-muted/60 text-muted-foreground";

  return (
    <Badge variant="outline" className={cn("max-w-full rounded-full px-2.5 py-0.5 capitalize", className)} title={event}>
      <span className="min-w-0 truncate">{event}</span>
    </Badge>
  );
}

const PREMIUM_SCROLLBAR = "[scrollbar-color:hsl(var(--primary)/0.35)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-primary/35 [&::-webkit-scrollbar-track]:bg-transparent";

export default function TokenAuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [users, setUsers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await invokeSecureFunction<{ rows: AuditRow[]; users: Record<string, string> }>(
      "list-token-audit",
      { limit: 500, event: eventFilter === "all" ? null : eventFilter },
    );
    if (!error && data) {
      setRows(data.rows ?? []);
      setUsers(data.users ?? {});
    } else if (error) {
      setLoadError(typeof error === "string" ? error : "Unable to load token audit events.");
    }
    setLoading(false);
  }, [eventFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.idempotency_key, r.function_name, r.kind, r.job_id, r.reason, users[r.user_id || ""]]
        .some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  }, [rows, search, users]);

  const isInitialLoading = loading && rows.length === 0;
  const activeFilterLabel = eventFilter === "all" ? "All events" : eventFilter;

  return (
    <>
      <DashboardThemeFrame variant="page" className="max-w-none space-y-6 pt-1 sm:space-y-7 sm:pt-2">
        <DashboardThemeFrame as="header" variant="hero" className="flex min-w-0 flex-col gap-5 border-primary/25 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.20),transparent_30%),radial-gradient(circle_at_bottom_right,hsl(var(--primary)/0.10),transparent_34%),linear-gradient(135deg,hsl(var(--card)/0.98),hsl(var(--background)/0.92)_56%,hsl(var(--primary)/0.12))] p-5 shadow-[0_22px_60px_rgba(15,23,42,0.10)] ring-1 ring-primary/10 dark:shadow-black/35 sm:p-6 lg:flex-row lg:items-center lg:justify-between lg:p-8">
          <div className="flex min-w-0 items-start gap-4">
            <div className="relative shrink-0 rounded-2xl border border-primary/25 bg-primary/10 p-3 text-primary shadow-[0_14px_35px_hsl(var(--primary)/0.16)] ring-1 ring-primary/15">
              <ShieldCheck className="h-7 w-7" />
              <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary shadow-sm">
                <DatabaseZap className="h-3.5 w-3.5" />
                Mission Control event ledger
              </div>
              <div className="min-w-0">
                <h1 className="min-w-0 truncate text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Token Audit Log
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Every Mission Control reserve / commit / cancel event, per user, per agency.
                </p>
              </div>
            </div>
          </div>
          <Button
            onClick={load}
            variant="outline"
            size="sm"
            disabled={loading}
            className="min-h-11 w-full shrink-0 rounded-xl border-primary/25 bg-background/90 px-4 font-medium shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/10 hover:text-primary hover:shadow-[0_12px_28px_hsl(var(--primary)/0.14)] focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 sm:w-auto"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </DashboardThemeFrame>

        <Card className="min-w-0 overflow-hidden rounded-[1.75rem] border-border/70 bg-card/95 shadow-[0_22px_60px_rgba(15,23,42,0.10)] ring-1 ring-black/5 transition-shadow duration-200 hover:shadow-[0_28px_75px_rgba(15,23,42,0.13)] dark:border-white/10 dark:bg-slate-950/75 dark:shadow-black/35 dark:ring-white/5">
          <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--muted)/0.28),hsl(var(--card)/0.55))] px-4 py-5 sm:px-6">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1.5">
                <CardTitle className="flex min-w-0 items-center gap-2 text-xl tracking-tight">
                  <span className="rounded-xl border border-primary/20 bg-primary/10 p-2 text-primary">
                    <Clock3 className="h-5 w-5" />
                  </span>
                  <span className="truncate">Events</span>
                </CardTitle>
                <CardDescription className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  Most recent 500 events. Filter by type or search by key / user.
                </CardDescription>
              </div>
              <Badge variant="outline" className="w-fit rounded-full border-primary/20 bg-primary/10 px-3 py-1 text-primary">
                {filtered.length.toLocaleString()} visible
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="min-w-0 space-y-5 p-4 sm:p-6">
            <DashboardThemeFrame variant="toolbar" className="min-w-0 flex-col items-stretch gap-4 border-primary/10 bg-[linear-gradient(135deg,hsl(var(--muted)/0.30),hsl(var(--background)/0.72))] p-3 shadow-inner sm:p-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-end">
                <div className="min-w-0 shrink-0 space-y-2 md:w-[220px]">
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground" htmlFor="token-audit-event-filter">
                    <Filter className="h-3.5 w-3.5 text-primary" />
                    Event type
                  </label>
                  <Select value={eventFilter} onValueChange={setEventFilter} disabled={loading}>
                    <SelectTrigger id="token-audit-event-filter" className="min-h-11 w-full rounded-2xl border-border/70 bg-background/90 px-3 shadow-sm transition-all duration-200 hover:border-primary/35 hover:bg-background hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)] focus:ring-2 focus:ring-primary/30" aria-label="Filter token audit events by type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All events</SelectItem>
                      <SelectItem value="reserve">Reserve</SelectItem>
                      <SelectItem value="commit">Commit</SelectItem>
                      <SelectItem value="cancel">Cancel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground" htmlFor="token-audit-search">
                    <Search className="h-3.5 w-3.5 text-primary" />
                    Keyword search
                  </label>
                  <div className="group relative min-w-0">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                    <Input
                      id="token-audit-search"
                      className="min-h-11 min-w-0 rounded-2xl border-border/70 bg-background/90 pl-10 pr-3 shadow-sm transition-all duration-200 placeholder:text-muted-foreground/75 hover:border-primary/35 hover:bg-background hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)] focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/30"
                      placeholder="Search by idempotency key, user, function…"
                      aria-label="Search token audit events by idempotency key, user, or function"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      disabled={loading && rows.length === 0}
                    />
                  </div>
                </div>
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-2 rounded-2xl border border-border/60 bg-card/70 p-2 text-xs shadow-sm sm:min-w-[220px]">
                <div className="rounded-xl bg-muted/35 px-3 py-2">
                  <span className="block text-muted-foreground">Loaded</span>
                  <span className="font-semibold tabular-nums text-foreground">{rows.length.toLocaleString()}</span>
                </div>
                <div className="rounded-xl bg-primary/10 px-3 py-2">
                  <span className="block text-primary/80">Visible</span>
                  <span className="font-semibold tabular-nums text-primary">{filtered.length.toLocaleString()}</span>
                </div>
              </div>
            </DashboardThemeFrame>

            <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border/60 bg-muted/25 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0 truncate">Viewing: <span className="font-semibold capitalize text-foreground">{activeFilterLabel}</span></span>
              <span className="min-w-0 truncate">Click an idempotency key to inspect the reserve / commit / cancel trail.</span>
            </div>

            {loadError && (
              <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-xs text-destructive sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-words">{loadError}</span>
                </div>
                <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10" onClick={load} disabled={loading}>
                  Retry
                </Button>
              </div>
            )}

            {isInitialLoading ? (
              <div className="space-y-3 rounded-2xl border border-border/60 bg-background/45 p-3">
                <div className="flex items-center justify-between gap-3 px-1">
                  <Skeleton className="h-4 w-36 rounded-lg" />
                  <Skeleton className="h-4 w-24 rounded-lg" />
                </div>
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
              </div>
            ) : loadError && rows.length === 0 ? (
              <div className="flex min-h-[16rem] items-center justify-center rounded-3xl border border-destructive/25 bg-destructive/10 px-4 py-10 text-center">
                <div className="mx-auto max-w-md space-y-3">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-destructive/25 bg-destructive/10 text-destructive">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">Unable to load token audit events.</p>
                  <p className="break-words text-xs leading-5 text-destructive">{loadError}</p>
                  <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={load} disabled={loading}>Retry</Button>
                </div>
              </div>
            ) : rows.length === 0 ? (
              <div className="flex min-h-[18rem] items-center justify-center rounded-3xl border border-dashed border-border/70 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.10),transparent_42%),hsl(var(--muted)/0.18)] px-4 py-12 text-center">
                <div className="mx-auto max-w-sm space-y-3">
                  <div className="mx-auto w-fit rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-primary">Audit ready</div>
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm">
                    <FileKey2 className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">No events recorded.</p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Mission Control reserve, commit and cancel events will appear here once available. Use the filter, search and Refresh controls to interrogate the audit ledger.
                  </p>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex min-h-[16rem] items-center justify-center rounded-3xl border border-dashed border-primary/20 bg-primary/5 px-4 py-10 text-center">
                <div className="mx-auto max-w-md space-y-3">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                    <Search className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">No matching audit events.</p>
                  <p className="break-words text-xs leading-5 text-muted-foreground">
                    No token audit events match “{search.trim()}”. Adjust the search by idempotency key, user or function.
                  </p>
                </div>
              </div>
            ) : (
              <div className="min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-background/45">
                <div className={cn("overflow-x-auto overscroll-x-contain", PREMIUM_SCROLLBAR)}>
                  <Table className="min-w-[1320px] table-fixed" aria-label="Token audit events">
                    <TableHeader>
                      <TableRow className="bg-muted/35 hover:bg-muted/35">
                        <TableHead className="w-[150px]">Time</TableHead>
                        <TableHead className="w-[110px]">Event</TableHead>
                        <TableHead className="w-[190px]">User</TableHead>
                        <TableHead className="w-[210px]">Function</TableHead>
                        <TableHead className="w-[250px]">Idempotency key</TableHead>
                        <TableHead className="w-[112px] text-right">Requested</TableHead>
                        <TableHead className="w-[112px] text-right">Reserved</TableHead>
                        <TableHead className="w-[100px] text-right">Used</TableHead>
                        <TableHead className="w-[112px] text-right">Available</TableHead>
                        <TableHead className="w-[185px]">Status / Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((r) => {
                        const isOpen = activeKey === r.idempotency_key;
                        return (
                          <TableRow
                            key={r.id}
                            className={cn(
                              "group border-l-2 border-l-transparent transition-all duration-200 hover:border-l-primary/60 hover:bg-primary/5 hover:shadow-[inset_4px_0_0_hsl(var(--primary)/0.10)] focus-within:bg-primary/5",
                              isOpen && "border-l-primary bg-primary/10 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.16)]",
                            )}
                          >
                            <TableCell className="align-top text-xs text-muted-foreground">
                              <span className="block whitespace-nowrap font-medium text-foreground" title={r.created_at}>{format(new Date(r.created_at), "MMM d, HH:mm:ss")}</span>
                              <span className="block truncate" title={r.created_at}>{new Date(r.created_at).toLocaleString()}</span>
                            </TableCell>
                            <TableCell className="align-top"><EventBadge event={r.event} /></TableCell>
                            <TableCell className="min-w-0 align-top text-xs">
                              <span className="block truncate font-medium text-foreground" title={r.user_id ?? undefined}>{r.user_id ? (users[r.user_id] ?? r.user_id.slice(0, 8)) : "—"}</span>
                              {r.user_id && <span className="block truncate pt-1 text-muted-foreground" title={r.user_id}>{r.user_id}</span>}
                            </TableCell>
                            <TableCell className="min-w-0 align-top text-xs">
                              <span className="block truncate font-medium" title={r.function_name ?? undefined}>{r.function_name ?? "—"}</span>
                              {r.kind && <span className="mt-1 inline-flex max-w-full rounded-full border border-border/60 bg-muted/45 px-2 py-0.5 text-[11px] text-muted-foreground"><span className="truncate" title={r.kind}>{r.kind}</span></span>}
                            </TableCell>
                            <TableCell className="min-w-0 align-top">
                              <button
                                type="button"
                                className={cn(
                                  "flex min-h-9 max-w-full items-center truncate rounded-xl border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-left font-mono text-xs text-primary shadow-sm underline-offset-4 transition-all duration-200 hover:-translate-y-px hover:border-primary/45 hover:bg-primary/10 hover:shadow-[0_0_0_3px_hsl(var(--primary)/0.10),0_10px_22px_hsl(var(--primary)/0.12)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
                                  isOpen && "border-primary/45 bg-primary/15",
                                )}
                                title={r.idempotency_key}
                                aria-label={`Open token audit trail for ${r.idempotency_key}`}
                                onClick={() => setActiveKey(r.idempotency_key)}
                              >
                                <span className="min-w-0 truncate">{r.idempotency_key}</span>
                              </button>
                            </TableCell>
                            <TableCell className="align-top text-right tabular-nums text-muted-foreground">{r.requested_tokens.toLocaleString()}</TableCell>
                            <TableCell className="align-top text-right font-semibold tabular-nums text-amber-700 dark:text-amber-300">{r.reserved_tokens.toLocaleString()}</TableCell>
                            <TableCell className="align-top text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{r.used_tokens.toLocaleString()}</TableCell>
                            <TableCell className="align-top text-right tabular-nums text-muted-foreground">{r.available_tokens.toLocaleString()}</TableCell>
                            <TableCell className="min-w-0 align-top text-xs">
                              <span className="block truncate font-medium text-foreground" title={r.status ?? undefined}>{r.status ?? "—"}</span>
                              {r.reason ? <span className="block truncate pt-1 text-muted-foreground" title={r.reason}>{r.reason}</span> : null}
                              {r.error_message ? <span className="block truncate pt-1 text-destructive" title={r.error_message}>{r.error_message}</span> : null}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </DashboardThemeFrame>
      <TokenEventDetailsDrawer
        idempotencyKey={activeKey}
        open={!!activeKey}
        onOpenChange={(o) => !o && setActiveKey(null)}
        premiumTimeline
      />
    </>
  );
}
