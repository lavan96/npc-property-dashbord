/**
 * PdfImportDiagnostics — superadmin observability for the Docling pipeline.
 *
 * Phase 7 of the Docling pipeline plan. Surfaces every PDF import run with:
 *   - 7-day rollup (success rate, p50/p95 latency, average SSIM, engine mix)
 *   - Recent jobs table with status / engine / stage / duration / SSIM
 *   - Filter by status + engine
 *   - One-click signed-URL download of the diagnostics bundle for the row
 *   - Realtime updates via the existing `pdf_import_jobs` publication
 *
 * Reads through `pdf-import-diagnostics` edge fn (service-role mediated; the
 * table's RLS scopes to auth.uid() which doesn't fire for custom-auth users).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  RefreshCw,
  Download,
  Zap,
  Cpu,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { invokeSecureFunction, describeAuthError } from '@/lib/secureInvoke';
import { supabase } from '@/integrations/supabase/client';

type EngineValue = 'legacy' | 'docling';
type StatusValue =
  | 'queued'
  | 'uploading'
  | 'parsing'
  | 'mapping'
  | 'finalizing'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

interface JobRow {
  id: string;
  user_id: string;
  template_id: string | null;
  source_file_name: string | null;
  source_file_size_bytes: number | null;
  engine: EngineValue;
  engine_version: string | null;
  mode: 'semantic' | 'hybrid' | 'pixel_perfect';
  status: StatusValue;
  stage: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  page_count: number | null;
  ssim_score: number | null;
  error_code: string | null;
  error_text: string | null;
  diagnostics_path: string | null;
  created_at: string;
  updated_at: string;
}

interface StatsResponse {
  totals: {
    total: number;
    succeeded: number;
    failed: number;
    inflight: number;
    legacy: number;
    docling: number;
  };
  latency: { p50_ms: number | null; p95_ms: number | null };
  ssim: { avg: number | null; sample_count: number };
}

const STATUS_COLOR: Record<StatusValue, string> = {
  queued: 'bg-muted text-muted-foreground',
  uploading: 'bg-blue-500/10 text-blue-500',
  parsing: 'bg-blue-500/10 text-blue-500',
  mapping: 'bg-blue-500/10 text-blue-500',
  finalizing: 'bg-blue-500/10 text-blue-500',
  succeeded: 'bg-success/10 text-success',
  failed: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-muted text-muted-foreground',
};

function formatMs(ms: number | null): string {
  if (!ms || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function formatBytes(b: number | null): string {
  if (!b) return '—';
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / (1024 * 1024)).toFixed(1)}MB`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60_000) return `${Math.floor(diffMs / 1000)}s ago`;
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}

export default function PdfImportDiagnostics() {
  const [rows, setRows] = useState<JobRow[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [engineFilter, setEngineFilter] = useState<string>('all');
  const [downloading, setDownloading] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    const res = await invokeSecureFunction<StatsResponse>('pdf-import-diagnostics', {
      operation: 'stats',
    });
    if (res.error) {
      const msg = res.error.message;
      const friendly = describeAuthError(msg);
      if (friendly) toast.error(friendly);
      return;
    }
    if (res.data) setStats(res.data);
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invokeSecureFunction<{ rows: JobRow[] }>('pdf-import-diagnostics', {
        operation: 'list',
        status: statusFilter === 'all' ? null : statusFilter,
        engine: engineFilter === 'all' ? null : engineFilter,
        limit: 100,
      });
      if (res.error) {
        const msg = res.error.message;
        const friendly = describeAuthError(msg);
        toast.error(friendly ?? msg);
        setRows([]);
        return;
      }
      setRows(res.data?.rows ?? []);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, engineFilter]);


  useEffect(() => {
    loadStats();
    loadRows();
  }, [loadStats, loadRows]);

  // Realtime — patch a row in-place when its status/stage changes.
  useEffect(() => {
    const channel = supabase
      .channel('pdf-import-diagnostics')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pdf_import_jobs' },
        (payload) => {
          const next = (payload.new ?? payload.old) as JobRow | undefined;
          if (!next?.id) return;
          setRows((prev) => {
            const idx = prev.findIndex((r) => r.id === next.id);
            if (payload.eventType === 'DELETE') {
              return idx >= 0 ? prev.filter((r) => r.id !== next.id) : prev;
            }
            if (idx >= 0) {
              const merged = [...prev];
              merged[idx] = { ...merged[idx], ...(payload.new as JobRow) };
              return merged;
            }
            // INSERT: prepend, keep current size
            return [payload.new as JobRow, ...prev].slice(0, 100);
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleDownload = useCallback(async (path: string | null, jobId: string) => {
    if (!path) {
      toast.error('No diagnostics bundle for this job');
      return;
    }
    setDownloading(jobId);
    try {
      const res = await invokeSecureFunction<{ signedUrl: string }>('pdf-import-diagnostics', {
        operation: 'download',
        diagnosticsPath: path,
        expiresIn: 600,
      });
      if (res.error || !res.data?.signedUrl) {
        toast.error(res.error?.message ?? 'Failed to sign URL');

        return;
      }
      window.open(res.data.signedUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloading(null);
    }
  }, []);

  const successRate = useMemo(() => {
    if (!stats || stats.totals.total === 0) return null;
    return (stats.totals.succeeded / stats.totals.total) * 100;
  }, [stats]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">PDF Import Diagnostics</h1>
          <p className="text-sm text-muted-foreground">
            7-day observability for the Docling pipeline. Inspect every import, download
            raw Docling JSON + page rasters, and compare engine performance.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            loadStats();
            loadRows();
          }}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Imports (7d)</div>
            <div className="text-2xl font-bold">{stats?.totals.total ?? '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Success rate</div>
            <div className="text-2xl font-bold">
              {successRate !== null ? `${successRate.toFixed(1)}%` : '—'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">In-flight</div>
            <div className="text-2xl font-bold">{stats?.totals.inflight ?? '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">p50 / p95</div>
            <div className="text-sm font-semibold">
              {formatMs(stats?.latency.p50_ms ?? null)} /{' '}
              {formatMs(stats?.latency.p95_ms ?? null)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Avg SSIM</div>
            <div className="text-2xl font-bold">
              {stats?.ssim.avg !== null && stats?.ssim.avg !== undefined
                ? stats.ssim.avg.toFixed(3)
                : '—'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Engine mix</div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                {stats?.totals.legacy ?? 0}
              </span>
              <span className="flex items-center gap-1">
                <Cpu className="h-3 w-3" />
                {stats?.totals.docling ?? 0}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Recent imports</CardTitle>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="succeeded">Succeeded</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="parsing">Parsing</SelectItem>
                <SelectItem value="mapping">Mapping</SelectItem>
                <SelectItem value="finalizing">Finalizing</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={engineFilter} onValueChange={setEngineFilter}>
              <SelectTrigger className="w-[120px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All engines</SelectItem>
                <SelectItem value="legacy">Legacy</SelectItem>
                <SelectItem value="docling">Docling</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Engine</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Pages</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="text-right">SSIM</TableHead>
                  <TableHead className="text-right">Diagnostics</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                      No imports match the current filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatRelative(row.created_at)}
                      </TableCell>
                      <TableCell className="max-w-[240px]">
                        <div className="truncate text-sm font-medium">
                          {row.source_file_name ?? row.id.slice(0, 8)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatBytes(row.source_file_size_bytes)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          {row.engine === 'docling' ? (
                            <Cpu className="h-3 w-3" />
                          ) : (
                            <Zap className="h-3 w-3" />
                          )}
                          {row.engine}
                          {row.engine_version ? (
                            <span className="text-[10px] text-muted-foreground ml-1">
                              {row.engine_version}
                            </span>
                          ) : null}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{row.mode}</TableCell>
                      <TableCell>
                        <Badge className={`gap-1 ${STATUS_COLOR[row.status]}`}>
                          {row.status === 'succeeded' ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : row.status === 'failed' ? (
                            <XCircle className="h-3 w-3" />
                          ) : row.status === 'queued' || row.status === 'cancelled' ? (
                            <Clock className="h-3 w-3" />
                          ) : (
                            <Activity className="h-3 w-3 animate-pulse" />
                          )}
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                        {row.stage ?? '—'}
                        {row.error_text ? (
                          <div className="text-destructive truncate">{row.error_text}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {row.page_count ?? '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatMs(row.duration_ms)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {row.ssim_score !== null && row.ssim_score !== undefined
                          ? row.ssim_score.toFixed(3)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!row.diagnostics_path || downloading === row.id}
                          onClick={() => handleDownload(row.diagnostics_path, row.id)}
                        >
                          {downloading === row.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Download className="h-3 w-3" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
