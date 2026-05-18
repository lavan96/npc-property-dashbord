import { useEffect, useState, useMemo } from "react";
import { invokeSecureFunction } from "@/lib/secureInvoke";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw, Search, Coins, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { TokenEventDetailsDrawer } from "@/components/billing/TokenEventDetailsDrawer";

interface UsageRow {
  id: string;
  created_at: string;
  user_id: string | null;
  function_name: string;
  kind: string;
  idempotency_key: string;
  estimated_tokens: number;
  reserved_tokens: number;
  actual_tokens: number;
  duration_ms: number;
  status: string;
  error_message?: string | null;
  job_id?: string | null;
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

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function TokenUsageHistory() {
  const [scope, setScope] = useState<"mine" | "agency">("mine");
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [agencyDenied, setAgencyDenied] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await invokeSecureFunction<{ rows: UsageRow[]; error?: string }>(
      "list-token-usage", { scope, limit: 500 },
    );
    if (error && scope === "agency") {
      setAgencyDenied(true);
      setScope("mine");
    } else if (!error && data?.rows) {
      setRows(data.rows);
      setAgencyDenied(false);
    }
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [scope]);
  useEffect(() => { setPage(1); }, [scope, search, pageSize]);

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageRows = filtered.slice(pageStart, pageStart + pageSize);

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
          <CardDescription>Click an idempotency key to see the full reserve / commit / cancel trail.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={scope} onValueChange={(v) => setScope(v as any)}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <TabsList>
                <TabsTrigger value="mine">My usage</TabsTrigger>
                <TabsTrigger value="agency">Agency-wide</TabsTrigger>
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

            <TabsContent value={scope} className="mt-4 space-y-3">
              {agencyDenied && (
                <p className="text-xs text-muted-foreground">
                  Agency-wide view requires admin permission — showing your usage instead.
                </p>
              )}
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No usage recorded yet.</p>
              ) : (
                <>
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
                        {pageRows.map((r) => (
                          <TableRow
                            key={r.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setActiveKey(r.idempotency_key)}
                          >
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

                  {/* Pagination */}
                  <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Rows per page</span>
                      <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                        <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PAGE_SIZE_OPTIONS.map((n) => (
                            <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="ml-2">
                        {filtered.length === 0 ? 0 : pageStart + 1}–{Math.min(pageStart + pageSize, filtered.length)} of {filtered.length.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-8 w-8"
                        disabled={safePage === 1} onClick={() => setPage(1)}>
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8"
                        disabled={safePage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-xs px-2 tabular-nums">
                        Page {safePage} / {totalPages}
                      </span>
                      <Button variant="outline" size="icon" className="h-8 w-8"
                        disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8"
                        disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}>
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <TokenEventDetailsDrawer
        idempotencyKey={activeKey}
        open={!!activeKey}
        onOpenChange={(o) => !o && setActiveKey(null)}
      />
    </div>
  );
}
