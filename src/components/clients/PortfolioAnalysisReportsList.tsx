import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { smartCapitalize } from '@/lib/nameUtils';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { secureStorageDownload } from '@/hooks/useSecureStorage';
import { FlattenPdfMenuItem } from '@/components/common/FlattenPdfMenuItem';
import { DashboardThemeFrame } from '@/components/layout/DashboardThemeFrame';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  FileText,
  Search,
  Download,
  Trash2,
  MoreVertical,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  RefreshCw,
  Loader2,
  Building2,
  Eye,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface PortfolioAnalysisReport {
  id: string;
  client_id: string;
  client_name: string;
  health_score: number | null;
  overall_health: string | null;
  portfolio_value: number | null;
  total_equity: number | null;
  net_monthly_cashflow: number | null;
  total_properties: number | null;
  average_lvr: number | null;
  average_yield: number | null;
  pdf_file_path: string | null;
  status: string;
  created_at: string;
}

interface PortfolioAnalysisReportsListProps {
  clientId?: string; // If provided, shows reports for specific client only
  showHeader?: boolean;
}

const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return '-';
  return '$' + value.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const getHealthBadgeVariant = (health: string | null): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (health?.toLowerCase()) {
    case 'excellent': return 'default';
    case 'good': return 'secondary';
    case 'fair': return 'outline';
    case 'poor': return 'destructive';
    default: return 'outline';
  }
};

const getHealthBadgeClassName = (health: string | null) => {
  switch (health?.toLowerCase()) {
    case 'excellent': return 'border-emerald-300/45 bg-emerald-400/12 text-emerald-100 ring-1 ring-inset ring-emerald-200/15 hover:bg-emerald-400/18';
    case 'good': return 'border-teal-300/45 bg-teal-400/12 text-teal-100 ring-1 ring-inset ring-teal-200/15 hover:bg-teal-400/18';
    case 'fair': return 'border-amber-300/50 bg-amber-400/13 text-amber-100 ring-1 ring-inset ring-amber-200/15 hover:bg-amber-400/18';
    case 'poor': return 'border-red-300/45 bg-red-500/13 text-red-100 ring-1 ring-inset ring-red-200/15 hover:bg-red-500/18';
    default: return 'border-slate-400/30 bg-slate-400/10 text-slate-200 ring-1 ring-inset ring-white/10 hover:bg-slate-400/15';
  }
};

const getHealthScoreMeterClassName = (health: string | null) => {
  switch (health?.toLowerCase()) {
    case 'excellent': return 'from-emerald-300 to-teal-300';
    case 'good': return 'from-teal-300 to-emerald-300';
    case 'fair': return 'from-amber-300 to-yellow-300';
    case 'poor': return 'from-red-300 to-rose-300';
    default: return 'from-slate-400 to-slate-300';
  }
};

const getCashflowIcon = (cashflow: number | null) => {
  if (cashflow === null) return <Minus className="h-4 w-4 text-muted-foreground" />;
  if (cashflow > 0) return <TrendingUp className="h-4 w-4 text-emerald-300" />;
  if (cashflow < 0) return <TrendingDown className="h-4 w-4 text-red-300" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
};

const getCashflowValueClassName = (cashflow: number | null) => {
  if (cashflow === null) return 'text-slate-300';
  if (cashflow > 0) return 'text-emerald-200';
  if (cashflow < 0) return 'text-red-300';
  return 'text-slate-300';
};

export function PortfolioAnalysisReportsList({ clientId, showHeader = true }: PortfolioAnalysisReportsListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [reportToDelete, setReportToDelete] = useState<PortfolioAnalysisReport | null>(null);
  const queryClient = useQueryClient();

  // Fetch portfolio analysis reports via secure function
  const { data: reports = [], isLoading, isError, error, isRefetching, refetch } = useQuery({
    queryKey: ['portfolio-analysis-reports', clientId],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('get-client-data', {
        listMode: true,
        listOptions: {
          table: 'portfolio_analysis_reports',
          select: '*',
          orderBy: 'created_at',
          order_asc: false,
          ...(clientId && { filters: { client_id: clientId } })
        }
      });
      if (error) throw new Error(error.message);
      return (data?.records || []) as PortfolioAnalysisReport[];
    },
  });

  // Delete mutation via secure function
  const deleteMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const { error } = await invokeSecureFunction('manage-client-data', {
        operation: 'delete',
        table: 'portfolio_analysis_reports',
        recordId: reportId
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio-analysis-reports'] });
      toast.success('Report deleted successfully');
      setReportToDelete(null);
    },
    onError: (error) => {
      toast.error('Failed to delete report: ' + error.message);
    },
  });

  // Filter reports by search
  const filteredReports = reports.filter(report => {
    const searchLower = searchQuery.toLowerCase();
    return (
      report.client_name.toLowerCase().includes(searchLower) ||
      report.overall_health?.toLowerCase().includes(searchLower)
    );
  });

  // Summary stats
  const totalReports = reports.length;
  const avgHealthScore = reports.length > 0
    ? Math.round(reports.reduce((acc, r) => acc + (r.health_score || 0), 0) / reports.length)
    : 0;
  const totalPortfolioValue = reports.reduce((acc, r) => acc + (Number(r.portfolio_value) || 0), 0);
  // Visual-only cue using the existing scorecard ranges; does not alter the average score calculation.
  const avgHealthAccent = avgHealthScore >= 80
    ? 'from-emerald-300 to-teal-300 shadow-emerald-500/20'
    : avgHealthScore >= 60
      ? 'from-amber-300 to-yellow-300 shadow-amber-500/20'
      : avgHealthScore >= 40
        ? 'from-orange-300 to-amber-300 shadow-orange-500/20'
        : 'from-red-300 to-rose-300 shadow-red-500/20';
  const avgHealthIconClass = avgHealthScore >= 80
    ? 'text-emerald-200'
    : avgHealthScore >= 60
      ? 'text-amber-200'
      : avgHealthScore >= 40
        ? 'text-orange-200'
        : 'text-red-200';

  const handleViewPDF = async (report: PortfolioAnalysisReport) => {
    if (!report.pdf_file_path) {
      toast.error('No PDF available for this report');
      return;
    }

    try {
      // Use secure storage download (service_role required due to RLS)
      const result = await secureStorageDownload('client-files', report.pdf_file_path);

      if (!result.success || !result.blob) {
        throw new Error(result.error || 'Download failed');
      }

      // Open PDF in new tab for viewing
      const url = URL.createObjectURL(result.blob);
      window.open(url, '_blank');
      toast.success('Opening report...');
    } catch (error: any) {
      toast.error('Failed to open PDF: ' + error.message);
    }
  };

  const handleDownloadPDF = async (report: PortfolioAnalysisReport) => {
    if (!report.pdf_file_path) {
      toast.error('No PDF available for this report');
      return;
    }

    try {
      // Use secure storage download (service_role required due to RLS)
      const result = await secureStorageDownload('client-files', report.pdf_file_path);

      if (!result.success || !result.blob) {
        throw new Error(result.error || 'Download failed');
      }

      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Portfolio_Analysis_${smartCapitalize(report.client_name).replace(/\s+/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded successfully');
    } catch (error: any) {
      toast.error('Failed to download PDF: ' + error.message);
    }
  };

  if (isLoading) {
    return (
      <div className="relative flex min-h-[320px] items-center justify-center overflow-hidden rounded-3xl border border-amber-400/15 bg-[linear-gradient(135deg,rgba(15,23,42,0.72),rgba(0,0,0,0.55))] p-8 shadow-xl shadow-black/20">
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/45 to-transparent" />
        <div className="flex flex-col items-center gap-4 text-center text-slate-300">
          <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4 shadow-lg shadow-amber-950/20">
            <Loader2 className="h-8 w-8 animate-spin text-amber-300" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-100">Loading portfolio intelligence...</p>
            <p className="mt-1 text-xs text-slate-500">Retrieving generated portfolio analysis reports.</p>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-red-300/20 bg-[linear-gradient(135deg,rgba(127,29,29,0.16),rgba(0,0,0,0.58))] p-6 shadow-xl shadow-black/20">
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-red-200/35 to-transparent" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl border border-red-300/25 bg-red-500/10 p-3 text-red-200">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-red-100">Unable to load portfolio reports</h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
                {error instanceof Error ? error.message : 'An unexpected error occurred while loading portfolio analysis reports.'}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="rounded-2xl border-red-300/25 bg-red-500/10 text-red-100 transition-all hover:border-red-300/45 hover:bg-red-500/15 hover:text-red-50 focus-visible:ring-2 focus-visible:ring-red-300/30 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {showHeader && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Card className="dashboard-theme-premium-card group relative overflow-hidden rounded-3xl border-border/70 bg-card/90 shadow-xl shadow-black/10 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:ring-1 hover:ring-primary/20 hover:shadow-[0_22px_60px_hsl(var(--primary)/0.14)] dark:border-white/10 dark:bg-slate-950/80 dark:shadow-black/25 sm:min-h-[168px]">
              <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Total Reports</CardTitle>
                <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-200 shadow-lg shadow-amber-950/20 transition-colors group-hover:border-amber-200/40 group-hover:bg-amber-300/15">
                  <FileText className="h-5 w-5" />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">{totalReports}</div>
                <div className="mt-5 h-px bg-gradient-to-r from-amber-300/70 via-amber-100/20 to-transparent" />
              </CardContent>
            </Card>

            <Card className="dashboard-theme-premium-card group relative overflow-hidden rounded-3xl border-border/70 bg-card/90 shadow-xl shadow-black/10 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:ring-1 hover:ring-primary/20 hover:shadow-[0_22px_60px_hsl(var(--primary)/0.14)] dark:border-white/10 dark:bg-slate-950/80 dark:shadow-black/25 sm:min-h-[168px]">
              <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Avg Health Score</CardTitle>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-lg shadow-black/20 transition-colors group-hover:border-amber-200/35 group-hover:bg-white/10">
                  <TrendingUp className={`h-5 w-5 ${avgHealthIconClass}`} />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">{avgHealthScore}</span>
                  <span className="pb-1.5 text-lg font-semibold text-slate-500">/100</span>
                </div>
                <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/8">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${avgHealthAccent}`}
                    style={{ width: `${Math.min(Math.max(avgHealthScore, 0), 100)}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="dashboard-theme-premium-card group relative overflow-hidden rounded-3xl border-primary/25 bg-gradient-to-br from-primary/15 via-card/90 to-card shadow-xl shadow-primary/10 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-primary/55 hover:ring-1 hover:ring-primary/25 hover:shadow-[0_24px_70px_hsl(var(--primary)/0.18)] sm:col-span-2 sm:min-h-[168px] xl:col-span-1">
              <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/70 to-transparent opacity-80" />
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-100/75">Combined Portfolio</CardTitle>
                <div className="rounded-2xl border border-amber-200/30 bg-amber-300/15 p-3 text-amber-100 shadow-lg shadow-amber-950/30 transition-colors group-hover:border-amber-100/50 group-hover:bg-amber-300/20">
                  <Building2 className="h-5 w-5" />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="break-words text-4xl font-bold tracking-[-0.05em] text-amber-50 sm:text-5xl xl:text-4xl 2xl:text-5xl">{formatCurrency(totalPortfolioValue)}</div>
                <div className="mt-5 h-px bg-gradient-to-r from-amber-200/80 via-amber-100/30 to-transparent" />
              </CardContent>
            </Card>
          </div>

          {/* Search and Actions */}
          <DashboardThemeFrame variant="toolbar" className="flex-col rounded-3xl p-3 transition-all duration-300 hover:border-primary/30 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="relative flex-1 sm:max-w-lg">
              <div className="pointer-events-none absolute left-3.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl border border-amber-300/15 bg-amber-300/10 text-amber-200/80">
                <Search className="h-4 w-4" />
              </div>
              <Input
                aria-label="Search portfolio reports by client name"
                placeholder="Search by client name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 rounded-2xl border-white/10 bg-slate-950/80 pl-14 pr-4 text-sm font-medium text-slate-100 shadow-inner shadow-black/20 transition-all placeholder:text-slate-500 hover:border-amber-300/25 focus-visible:border-amber-300/70 focus-visible:ring-2 focus-visible:ring-amber-300/30 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              aria-label="Refresh portfolio analysis reports"
              onClick={() => refetch()}
              className="h-12 justify-center rounded-2xl border-amber-300/25 bg-white/[0.03] px-5 font-semibold text-amber-100 shadow-sm shadow-black/10 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300/55 hover:bg-amber-300/12 hover:text-amber-50 hover:shadow-[0_14px_34px_rgba(245,158,11,0.12)] focus-visible:ring-2 focus-visible:ring-amber-300/35 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 active:translate-y-0 sm:min-w-[124px]"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching ? 'animate-spin text-amber-200' : 'text-amber-200/85'}`} />
              Refresh
            </Button>
          </DashboardThemeFrame>
        </>
      )}

      {/* Reports Table */}
      <Card className="group/register overflow-hidden rounded-3xl border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.10),transparent_34%),linear-gradient(180deg,rgba(12,12,14,0.98),rgba(0,0,0,0.94))] shadow-2xl shadow-black/30 transition-all duration-300 hover:border-amber-300/30 hover:ring-1 hover:ring-amber-300/10 hover:shadow-[0_24px_70px_rgba(0,0,0,0.42)]">
        <CardHeader className="relative border-b border-white/10 bg-white/[0.035] px-5 py-5 sm:px-6">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/50 to-transparent opacity-60 transition-opacity duration-300 group-hover/register:opacity-100" />
          <CardTitle className="flex min-w-0 items-center gap-3 text-xl font-semibold tracking-tight text-white">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10 text-amber-200 shadow-lg shadow-amber-950/20">
              <FileText className="h-5 w-5" />
            </span>
            {clientId ? 'Client Reports' : 'All Portfolio Analysis Reports'}
          </CardTitle>
          <CardDescription className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            {clientId
              ? 'Previously generated portfolio performance reports for this client'
              : 'View all generated portfolio performance analysis reports across all clients'
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="bg-black/15 p-0">
          {filteredReports.length === 0 ? (
            <div className="m-5 flex flex-col items-center justify-center rounded-3xl border border-dashed border-amber-300/20 bg-amber-400/[0.03] py-14 text-center transition-all duration-300">
              <div className="mb-4 rounded-3xl border border-white/10 bg-white/5 p-4">
                <FileText className="h-12 w-12 text-amber-200/80" />
              </div>
              <h3 className="text-lg font-semibold text-white">{searchQuery ? 'No matching reports found' : 'No reports found'}</h3>
              <p className="mt-1 max-w-md text-sm leading-6 text-slate-400">
                {searchQuery
                  ? 'Try adjusting the client name search to reveal matching portfolio analysis reports.'
                  : clientId
                    ? 'Generate a portfolio analysis to see reports here'
                    : 'No portfolio analysis reports have been generated yet'
                }
              </p>
            </div>
          ) : (
            <div className="max-w-full overflow-hidden p-3 sm:p-5">
              <ScrollArea className="h-[440px] max-w-full rounded-2xl border border-white/10 bg-slate-950/45 shadow-inner shadow-black/25">
              <Table aria-label="Portfolio analysis reports" className="min-w-[980px] text-sm">
                <TableHeader className="sticky top-0 z-20">
                  <TableRow className="border-b border-amber-300/15 bg-[linear-gradient(180deg,rgba(24,24,27,0.98),rgba(9,9,11,0.96))] shadow-[0_10px_24px_rgba(0,0,0,0.28)] backdrop-blur hover:bg-zinc-950/95">
                    {!clientId && <TableHead className="h-12 whitespace-nowrap px-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Client</TableHead>}
                    <TableHead className="h-12 whitespace-nowrap px-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Health</TableHead>
                    <TableHead className="h-12 whitespace-nowrap px-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Score</TableHead>
                    <TableHead className="h-12 whitespace-nowrap px-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Portfolio Value</TableHead>
                    <TableHead className="h-12 whitespace-nowrap px-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Equity</TableHead>
                    <TableHead className="h-12 whitespace-nowrap px-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Cashflow</TableHead>
                    <TableHead className="h-12 whitespace-nowrap px-4 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Properties</TableHead>
                    <TableHead className="h-12 whitespace-nowrap px-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Generated</TableHead>
                    <TableHead className="h-12 whitespace-nowrap px-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReports.map((report) => (
                    <TableRow key={report.id} className="group/row h-auto sm:h-16 border-white/10 border-l-2 border-l-transparent transition-all duration-200 hover:border-l-amber-300/80 hover:bg-amber-400/[0.07] hover:shadow-[inset_0_1px_0_rgba(245,158,11,0.10),inset_0_-1px_0_rgba(245,158,11,0.08)] data-[state=selected]:border-l-amber-300 data-[state=selected]:bg-amber-400/10">
                      {!clientId && (
                        <TableCell className="px-4 py-4 font-semibold text-slate-100 transition-colors group-hover/row:text-amber-50">
                          {smartCapitalize(report.client_name)}
                        </TableCell>
                      )}
                      <TableCell className="px-4 py-4">
                        <Badge variant={getHealthBadgeVariant(report.overall_health)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold leading-none tracking-wide shadow-sm transition-all duration-200 group-hover/row:shadow-[0_0_18px_rgba(245,158,11,0.10)] ${getHealthBadgeClassName(report.overall_health)}`}>
                          {report.overall_health || 'Unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-4 text-right tabular-nums">
                        <div className="ml-auto flex w-20 flex-col items-end gap-1.5">
                          <div>
                            <span className="font-semibold text-white">{report.health_score ?? '-'}</span>
                            <span className="text-slate-500 text-xs">/100</span>
                          </div>
                          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${getHealthScoreMeterClassName(report.overall_health)}`}
                              style={{ width: `${Math.min(Math.max(Number(report.health_score) || 0, 0), 100)}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-4 text-right font-semibold tabular-nums text-amber-50/95 transition-colors group-hover/row:text-amber-50">{formatCurrency(Number(report.portfolio_value))}</TableCell>
                      <TableCell className="px-4 py-4 text-right font-semibold tabular-nums text-slate-100 transition-colors group-hover/row:text-white">{formatCurrency(Number(report.total_equity))}</TableCell>
                      <TableCell className="px-4 py-4 text-right tabular-nums">
                        <div className="flex items-center justify-end gap-2.5 font-semibold">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
                            {getCashflowIcon(Number(report.net_monthly_cashflow))}
                          </span>
                          <span className={`${getCashflowValueClassName(Number(report.net_monthly_cashflow))} transition-colors group-hover/row:brightness-110`}>
                            {formatCurrency(Number(report.net_monthly_cashflow))}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-4 text-center font-medium tabular-nums text-slate-200">{report.total_properties || '-'}</TableCell>
                      <TableCell className="px-4 py-4">
                        <div className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors group-hover/row:border-amber-300/20 group-hover/row:bg-amber-300/[0.06] group-hover/row:text-slate-100">
                          <Calendar className="h-3.5 w-3.5 shrink-0 text-amber-200/80" />
                          {format(new Date(report.created_at), 'dd MMM yyyy')}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Open actions for ${smartCapitalize(report.client_name)}`}
                              className="h-10 w-10 rounded-xl border border-transparent text-slate-300 transition-all group-hover/row:border-amber-300/20 group-hover/row:bg-white/[0.04] group-hover/row:text-amber-100 hover:border-amber-300/35 hover:bg-amber-400/10 hover:text-amber-100 focus-visible:ring-2 focus-visible:ring-amber-300/35 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" sideOffset={8} collisionPadding={16} className="min-w-[210px] rounded-2xl border-white/10 bg-zinc-950/95 p-1.5 text-slate-100 shadow-2xl shadow-black/45 backdrop-blur-xl">
                            <DropdownMenuItem
                              className="rounded-xl transition-colors focus:bg-amber-400/10 focus:text-amber-100"
                              disabled={!report.pdf_file_path}
                              onClick={() => handleViewPDF(report)}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Report
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="rounded-xl transition-colors focus:bg-amber-400/10 focus:text-amber-100"
                              disabled={!report.pdf_file_path}
                              onClick={() => handleDownloadPDF(report)}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download PDF
                            </DropdownMenuItem>
                            <FlattenPdfMenuItem
                              disabled={!report.pdf_file_path}
                              getPdfBlob={async () => {
                                const r = await secureStorageDownload('client-files', report.pdf_file_path!);
                                if (!r.success || !r.blob) throw new Error(r.error || 'Download failed');
                                return r.blob;
                              }}
                              filename={`Portfolio_Analysis_${smartCapitalize(report.client_name).replace(/\s+/g, '_')}.pdf`}
                            />
                            <DropdownMenuItem
                              className="rounded-xl text-red-300 transition-colors focus:bg-red-500/10 focus:text-red-200"
                              onClick={() => setReportToDelete(report)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!reportToDelete} onOpenChange={() => setReportToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this portfolio analysis report for {smartCapitalize(reportToDelete?.client_name)}?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => reportToDelete && deleteMutation.mutate(reportToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
