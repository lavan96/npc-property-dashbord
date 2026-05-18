import { useEffect, useState, useMemo } from "react";
import { invokeSecureFunction } from "@/lib/secureInvoke";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Search, ShieldCheck } from "lucide-react";
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
  const v =
    event === "reserve" ? "secondary" :
    event === "commit" ? "default" :
    event === "cancel" ? "destructive" : "outline";
  return <Badge variant={v as any}>{event}</Badge>;
}

export default function TokenAuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [users, setUsers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await invokeSecureFunction<{ rows: AuditRow[]; users: Record<string, string> }>(
      "list-token-audit",
      { limit: 500, event: eventFilter === "all" ? null : eventFilter },
    );
    if (!error && data) {
      setRows(data.rows ?? []);
      setUsers(data.users ?? {});
    }
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [eventFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.idempotency_key, r.function_name, r.kind, r.job_id, r.reason, users[r.user_id || ""]]
        .some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  }, [rows, search, users]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Token Audit Log
          </h1>
          <p className="text-sm text-muted-foreground">
            Every Mission Control reserve / commit / cancel event, per user, per agency.
          </p>
        </div>
        <Button onClick={load} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>Most recent 500 events. Filter by type or search by key / user.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                <SelectItem value="reserve">Reserve</SelectItem>
                <SelectItem value="commit">Commit</SelectItem>
                <SelectItem value="cancel">Cancel</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search by idempotency key, user, function…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No events recorded.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Function</TableHead>
                    <TableHead>Idempotency key</TableHead>
                    <TableHead className="text-right">Requested</TableHead>
                    <TableHead className="text-right">Reserved</TableHead>
                    <TableHead className="text-right">Used</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead>Status / Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {format(new Date(r.created_at), "MMM d, HH:mm:ss")}
                      </TableCell>
                      <TableCell><EventBadge event={r.event} /></TableCell>
                      <TableCell className="text-xs">
                        {r.user_id ? (users[r.user_id] ?? r.user_id.slice(0, 8)) : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{r.function_name ?? "—"}</TableCell>
                      <TableCell
                        className="text-xs font-mono max-w-[220px] truncate cursor-pointer text-primary hover:underline"
                        title={r.idempotency_key}
                        onClick={() => setActiveKey(r.idempotency_key)}
                      >
                        {r.idempotency_key}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.requested_tokens.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.reserved_tokens.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.used_tokens.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.available_tokens.toLocaleString()}</TableCell>
                      <TableCell className="text-xs">
                        {r.status ?? "—"}
                        {r.reason ? <span className="text-muted-foreground"> · {r.reason}</span> : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
      <TokenEventDetailsDrawer
        idempotencyKey={activeKey}
        open={!!activeKey}
        onOpenChange={(o) => !o && setActiveKey(null)}
      />
    </>
  );
}
