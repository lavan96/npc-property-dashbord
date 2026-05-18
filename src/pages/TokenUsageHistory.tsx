import { useEffect, useState, useMemo } from "react";
import { invokeSecureFunction } from "@/lib/secureInvoke";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Search, Coins } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/useAuth";

interface UsageRow {
  id: string;
  created_at: string;
  function_name: string;
  kind: string;
  idempotency_key: string;
  estimated_tokens: number;
  reserved_tokens: number;
  actual_tokens: number;
  duration_ms: number;
  status: string;
  error_message?: string | null;
}

const FN_LABEL: Record<string, string> = {
  "generate-investment-report": "Investment Report",
  "generate-bulk-reports": "Bulk Reports",
  "generate-market-intelligence-report": "Market Intelligence",
  "generate-portfolio-analysis": "Portfolio Analysis",
  "generate-chart-analysis": "Chart Analysis",
  "regenerate-report-qualitative": "Report Regeneration",
};

function StatusBadge({ status }: { status: string }) {
  const v =
    status === "success" ? "default" :
    status === "insufficient_funds" ? "destructive" :
    status === "failed" ? "destructive" : "secondary";
  return <Badge variant={v as any}>{status.replace(/_/g, " ")}</Badge>;
}

function fmtMs(ms: number) {
  if (!ms) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

export default function TokenUsageHistory() {
  const { isSuperadmin } = useAuth() as any;
  const [scope, setScope] = useState<"mine" | "agency">("mine");
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await invokeSecureFunction<{ rows: UsageRow[] }>(
      "list-token-usage", { scope, limit: 200 },
    );
    if (!error && data?.rows) setRows(data.rows);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [scope]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.function_name, r.kind, r.idempotency_key, r.status].some((v) =>
        String(v ?? "").toLowerCase().includes(q),
      ),
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    const used = filtered.reduce((s, r) => s + (r.actual_tokens || 0), 0);
    const reserved = filtered.reduce((s, r) => s + (r.reserved_tokens || 0), 0);
    return { used, reserved, count: filtered.length };
  }, [filtered]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Coins className="h-6 w-6 text-primary" />
            Token Usage History
          </h1>
          <p className="text-sm text-muted-foreground">
            Every metered report generation, with estimated vs actual tokens and duration.
          </p>
        </div>
        <Button onClick={load} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Generations</p>
          <p className="text-2xl font-semibold">{totals.count.toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Tokens Used</p>
          <p className="text-2xl font-semibold">{totals.used.toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Tokens Reserved</p>
          <p className="text-2xl font-semibold">{totals.reserved.toLocaleString()}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Click a row's idempotency key to copy.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={scope} onValueChange={(v) => setScope(v as any)}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <TabsList>
                <TabsTrigger value="mine">My usage</TabsTrigger>
                {isSuperadmin && <TabsTrigger value="agency">Agency-wide</TabsTrigger>}
              </TabsList>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search by kind, function, status…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <TabsContent value={scope} className="mt-4">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No usage recorded yet.</p>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Report</TableHead>
                        <TableHead>Kind</TableHead>
                        <TableHead className="text-right">Estimated</TableHead>
                        <TableHead className="text-right">Reserved</TableHead>
                        <TableHead className="text-right">Used</TableHead>
                        <TableHead className="text-right">Duration</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                          </TableCell>
                          <TableCell className="font-medium">
                            {FN_LABEL[r.function_name] ?? r.function_name}
                          </TableCell>
                          <TableCell className="text-xs">{r.kind}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.estimated_tokens.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.reserved_tokens.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">{r.actual_tokens.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-xs">{fmtMs(r.duration_ms)}</TableCell>
                          <TableCell><StatusBadge status={r.status} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
