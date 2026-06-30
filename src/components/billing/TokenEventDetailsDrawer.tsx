import { useEffect, useState } from "react";
import { invokeSecureFunction } from "@/lib/secureInvoke";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Copy, Check, ShieldCheck, CheckCircle2, Ban, AlertTriangle, Clock3 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AuditEvent {
  id: string;
  created_at: string;
  event: "reserve" | "commit" | "cancel" | string;
  user_id: string | null;
  function_name: string | null;
  kind: string | null;
  job_id: string | null;
  requested_tokens: number;
  reserved_tokens: number;
  used_tokens: number;
  available_tokens: number;
  status: string | null;
  reason: string | null;
  error_message: string | null;
}

interface Outcome {
  id: string;
  created_at: string;
  user_id: string | null;
  function_name: string;
  kind: string;
  estimated_tokens: number;
  reserved_tokens: number;
  actual_tokens: number;
  duration_ms: number;
  status: string;
  error_message: string | null;
  job_id: string | null;
}

interface Payload {
  idempotencyKey: string;
  events: AuditEvent[];
  outcomes: Outcome[];
  users: Record<string, string>;
}

function eventTone(value: string | null | undefined) {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("cancel") || normalized.includes("fail") || normalized.includes("error") || normalized === "insufficient_funds") {
    return {
      badge: "border-destructive/25 bg-destructive/10 text-destructive",
      dot: "border-destructive/30 bg-destructive/15 text-destructive",
      line: "bg-destructive/20",
      Icon: Ban,
    };
  }
  if (normalized.includes("commit") || normalized.includes("success") || normalized.includes("complete")) {
    return {
      badge: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      dot: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      line: "bg-emerald-500/20",
      Icon: CheckCircle2,
    };
  }
  if (normalized.includes("reserve") || normalized.includes("pending") || normalized.includes("progress")) {
    return {
      badge: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      dot: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      line: "bg-amber-500/20",
      Icon: ShieldCheck,
    };
  }
  return {
    badge: "border-border/70 bg-muted/60 text-muted-foreground",
    dot: "border-border/70 bg-muted/60 text-muted-foreground",
    line: "bg-border/60",
    Icon: Clock3,
  };
}

function EventBadge({ event }: { event: string }) {
  return <Badge variant="outline" className={cn("max-w-full rounded-full px-2.5 capitalize", eventTone(event).badge)} title={event}>{event}</Badge>;
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  return (
    <Badge variant="outline" className={cn("max-w-full shrink-0 truncate rounded-full capitalize", eventTone(status).badge)} title={status}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

function fmtMs(ms: number) {
  if (!ms) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

export function TokenEventDetailsDrawer({
  idempotencyKey,
  open,
  onOpenChange,
}: {
  idempotencyKey: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !idempotencyKey) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setData(null);
      const { data: res } = await invokeSecureFunction<Payload>(
        "get-token-event-trail", { idempotencyKey },
      );
      if (!cancelled && res) setData(res);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, idempotencyKey]);

  const copy = async () => {
    if (!idempotencyKey) return;
    try {
      await navigator.clipboard.writeText(idempotencyKey);
      setCopied(true);
      toast.success("Idempotency key copied");
      setTimeout(() => setCopied(false), 1500);
    } catch { /* */ }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden border-border/70 bg-card/95 p-0 sm:max-w-2xl dark:border-white/10">
        <SheetHeader className="min-w-0 border-b border-border/60 bg-muted/20 px-6 py-5 text-left">
          <SheetTitle className="flex min-w-0 items-center gap-2 text-xl"><ShieldCheck className="h-5 w-5 text-primary" />Generation Trail</SheetTitle>
          <SheetDescription className="leading-6">
            Reserve / commit / cancel events and final outcome for this idempotency key.
          </SheetDescription>
          {idempotencyKey && (
            <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-primary/15 bg-primary/5 p-2">
              <code className="min-w-0 flex-1 truncate rounded-xl bg-background/80 px-2.5 py-1.5 font-mono text-xs text-primary" title={idempotencyKey}>
                {idempotencyKey}
              </code>
              <Button size="icon" variant="outline" className="h-7 w-7 shrink-0 rounded-lg" onClick={copy}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )}
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1 px-6 py-5">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : !data ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No trail data.</p>
          ) : (
            <div className="min-w-0 space-y-6 pb-8">
              {/* Outcome */}
              <section className="min-w-0">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />Outcome</h3>
                {data.outcomes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No outcome row yet.</p>
                ) : (
                  data.outcomes.map((o) => (
                    <div key={o.id} className="min-w-0 space-y-3 rounded-2xl border border-border/70 bg-background/55 p-4 text-sm shadow-sm">
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <span className="min-w-0 truncate font-medium" title={o.function_name}>{o.function_name}</span>
                        <StatusBadge status={o.status} />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(o.created_at), "PPpp")}
                        {o.user_id && data.users[o.user_id] && <> · {data.users[o.user_id]}</>}
                      </div>
                      <Separator />
                      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                        <div><p className="text-muted-foreground">Estimated</p><p className="font-semibold tabular-nums">{o.estimated_tokens.toLocaleString()}</p></div>
                        <div><p className="text-muted-foreground">Reserved</p><p className="font-semibold tabular-nums">{o.reserved_tokens.toLocaleString()}</p></div>
                        <div><p className="text-muted-foreground">Used</p><p className="font-semibold tabular-nums">{o.actual_tokens.toLocaleString()}</p></div>
                        <div><p className="text-muted-foreground">Duration</p><p className="font-semibold tabular-nums">{fmtMs(o.duration_ms)}</p></div>
                      </div>
                      {o.error_message && (
                        <p className="break-words rounded-lg bg-destructive/10 p-2 text-xs text-destructive">{o.error_message}</p>
                      )}
                      {o.job_id && (
                        <p className="truncate font-mono text-xs text-muted-foreground" title={o.job_id}>job: {o.job_id}</p>
                      )}
                    </div>
                  ))
                )}
              </section>

              {/* Audit trail */}
              <section className="min-w-0">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Audit events ({data.events.length})
                </h3>
                {data.events.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No audit events.</p>
                ) : (
                  <ol className="relative space-y-3 before:absolute before:bottom-4 before:left-5 before:top-4 before:w-px before:bg-border/70">
                    {data.events.map((e) => {
                      const tone = eventTone(e.error_message ? "error" : e.event || e.status);
                      const Icon = tone.Icon;
                      return (
                        <li key={e.id} className="relative grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] gap-3 text-xs">
                          <div className="relative z-10 flex justify-center pt-3">
                            <span className={cn("flex h-10 w-10 items-center justify-center rounded-2xl border shadow-sm", tone.dot)}>
                              <Icon className="h-4 w-4" />
                            </span>
                          </div>
                          <div className="min-w-0 space-y-3 rounded-2xl border border-border/70 bg-background/60 p-4 shadow-sm transition-colors hover:border-primary/25 hover:bg-primary/5">
                            <div className="flex min-w-0 items-center justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-2">
                                <EventBadge event={e.event} />
                                <span className="min-w-0 truncate text-muted-foreground" title={e.created_at}>
                                  {format(new Date(e.created_at), "MMM d, HH:mm:ss.SSS")}
                                </span>
                              </div>
                              <StatusBadge status={e.status} />
                            </div>
                            {e.user_id && data.users[e.user_id] && (
                              <p className="truncate text-muted-foreground" title={data.users[e.user_id]}>User: {data.users[e.user_id]}</p>
                            )}
                            <div className="grid min-w-0 grid-cols-2 gap-2 rounded-2xl border border-border/50 bg-muted/20 p-3 sm:grid-cols-4">
                              <div><p className="text-muted-foreground">Requested</p><p className="font-medium tabular-nums">{e.requested_tokens.toLocaleString()}</p></div>
                              <div><p className="text-muted-foreground">Reserved</p><p className="font-medium tabular-nums text-amber-700 dark:text-amber-300">{e.reserved_tokens.toLocaleString()}</p></div>
                              <div><p className="text-muted-foreground">Used</p><p className="font-medium tabular-nums text-emerald-700 dark:text-emerald-300">{e.used_tokens.toLocaleString()}</p></div>
                              <div><p className="text-muted-foreground">Available</p><p className="font-medium tabular-nums">{e.available_tokens.toLocaleString()}</p></div>
                            </div>
                            {e.reason && <p className="break-words text-muted-foreground">Reason: {e.reason}</p>}
                            {e.error_message && <p className="break-words rounded-xl border border-destructive/20 bg-destructive/10 p-2 text-destructive"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{e.error_message}</p>}
                            {e.job_id && <p className="truncate rounded-lg bg-muted/35 px-2 py-1 font-mono text-muted-foreground" title={e.job_id}>job: {e.job_id}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
