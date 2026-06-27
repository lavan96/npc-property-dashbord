import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { smartCapitalize } from '@/lib/nameUtils';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { secureStorageDownload } from '@/hooks/useSecureStorage';
import { FlattenPdfMenuItem } from '@/components/common/FlattenPdfMenuItem';
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
    case 'excellent': return 'border-emerald-300/40 bg-emerald-400/15 text-emerald-100 shadow-emerald-950/20 hover:bg-emerald-400/20';
    case 'good': return 'border-teal-300/40 bg-teal-400/15 text-teal-100 shadow-teal-950/20 hover:bg-teal-400/20';
    case 'fair': return 'border-amber-300/45 bg-amber-400/15 text-amber-100 shadow-amber-950/20 hover:bg-amber-400/20';
    case 'poor': return 'border-red-300/45 bg-red-500/15 text-red-100 shadow-red-950/20 hover:bg-red-500/20';
    default: return 'border-slate-400/30 bg-slate-400/10 text-slate-200 hover:bg-slate-400/15';
  }
};

const getCashflowIcon = (cashflow: number | null) => {
  if (cashflow === null) return <Minus className="h-4 w-4 text-muted-foreground" />;
  if (cashflow > 0) return <TrendingUp className="h-4 w-4 text-emerald-300" />;
  if (cashflow < 0) return <TrendingDown className="h-4 w-4 text-red-300" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
};

export function PortfolioAnalysisReportsList({ clientId, showHeader = true }: PortfolioAnalysisReportsListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [reportToDelete, setReportToDelete] = useState<PortfolioAnalysisReport | null>(null);
  const queryClient = useQueryClient();

  // Fetch portfolio analysis reports via secure function
  const { data: reports = [], isLoading, refetch } = useQuery({
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
  const avgHealthAccent = avgHealthScore >= 75
    ? 'from-emerald-300 to-teal-300 shadow-emerald-500/20'
    : avgHealthScore >= 50
      ? 'from-amber-300 to-yellow-300 shadow-amber-500/20'
      : 'from-red-300 to-rose-300 shadow-red-500/20';
  const avgHealthIconClass = avgHealthScore >= 75
    ? 'text-emerald-200'
    : avgHealthScore >= 50
      ? 'text-amber-200'
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
      <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-amber-400/15 bg-black/30 p-8 shadow-xl shadow-black/20">
        <div className="flex flex-col items-center gap-3 text-slate-300">
          <Loader2 className="h-8 w-8 animate-spin text-amber-300" />
          <p className="text-sm font-medium">Loading portfolio intelligence...</p>
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
            <Card className="group relative overflow-hidden rounded-3xl border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.96),rgba(10,10,12,0.94)_52%,rgba(0,0,0,0.9))] shadow-xl shadow-black/25 transition-all duration-300 hover:-translate-y-1 hover:border-amber-300/40 hover:shadow-[0_22px_60px_rgba(245,158,11,0.14)] sm:min-h-[168px]">
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

            <Card className="group relative overflow-hidden rounded-3xl border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.96),rgba(10,10,12,0.94)_52%,rgba(0,0,0,0.9))] shadow-xl shadow-black/25 transition-all duration-300 hover:-translate-y-1 hover:border-amber-300/40 hover:shadow-[0_22px_60px_rgba(245,158,11,0.14)] sm:min-h-[168px]">
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

            <Card className="group relative overflow-hidden rounded-3xl border-amber-300/20 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.24),transparent_34%),linear-gradient(145deg,rgba(24,18,8,0.98),rgba(10,10,12,0.96)_55%,rgba(0,0,0,0.92))] shadow-xl shadow-black/25 transition-all duration-300 hover:-translate-y-1 hover:border-amber-200/55 hover:shadow-[0_24px_70px_rgba(245,158,11,0.18)] sm:col-span-2 sm:min-h-[168px] xl:col-span-1">
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
          <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-black/30 p-3 shadow-lg shadow-black/15 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="relative flex-1 sm:max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-200/70" />
              <Input
                placeholder="Search by client name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 rounded-2xl border-white/10 bg-slate-950/70 pl-10 text-slate-100 placeholder:text-slate-500 transition-all focus-visible:border-amber-300/60 focus-visible:ring-amber-300/25"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="h-11 rounded-2xl border-amber-400/30 bg-amber-400/10 px-5 text-amber-100 transition-all hover:border-amber-300 hover:bg-amber-400/20 hover:text-amber-50 active:scale-[0.98]">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </>
      )}

      {/* Reports Table */}
      <Card className="overflow-hidden rounded-3xl border-white/10 bg-gradient-to-b from-zinc-950/95 to-black/90 shadow-2xl shadow-black/30">
        <CardHeader className="border-b border-white/10 bg-white/[0.03] pb-4">
          <CardTitle className="text-xl font-semibold text-white">
            {clientId ? 'Client Reports' : 'All Portfolio Analysis Reports'}
          </CardTitle>
          <CardDescription className="text-slate-400">
            {clientId
              ? 'Previously generated portfolio performance reports for this client'
              : 'View all generated portfolio performance analysis reports across all clients'
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {filteredReports.length === 0 ? (
            <div className="m-5 flex flex-col items-center justify-center rounded-3xl border border-dashed border-amber-300/20 bg-amber-400/[0.03] py-14 text-center transition-all duration-300">
              <div className="mb-4 rounded-3xl border border-white/10 bg-white/5 p-4">
                <FileText className="h-12 w-12 text-amber-200/80" />
              </div>
              <h3 className="text-lg font-semibold text-white">No reports found</h3>
              <p className="mt-1 text-sm text-slate-400">
                {clientId
                  ? 'Generate a portfolio analysis to see reports here'
                  : 'No portfolio analysis reports have been generated yet'
                }
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[440px]">
              <Table className="min-w-[980px]">
                <TableHeader>
                  <TableRow className="border-white/10 bg-white/[0.02] hover:bg-white/[0.02]">
                    {!clientId && <TableHead className="text-slate-300">Client</TableHead>}
                    <TableHead className="text-slate-300">Health</TableHead>
                    <TableHead className="text-slate-300">Score</TableHead>
                    <TableHead className="text-slate-300">Portfolio Value</TableHead>
                    <TableHead className="text-slate-300">Equity</TableHead>
                    <TableHead className="text-slate-300">Cashflow</TableHead>
                    <TableHead className="text-slate-300">Properties</TableHead>
                    <TableHead className="text-slate-300">Generated</TableHead>
                    <TableHead className="text-right text-slate-300">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReports.map((report) => (
                    <TableRow key={report.id} className="border-white/10 transition-colors duration-200 hover:bg-amber-400/[0.06] data-[state=selected]:bg-amber-400/10">
                      {!clientId && (
                        <TableCell className="font-semibold text-slate-100">
                          {smartCapitalize(report.client_name)}
                        </TableCell>
                      )}
                      <TableCell>
                        <Badge variant={getHealthBadgeVariant(report.overall_health)} className={`rounded-full border px-3 py-1 text-xs font-semibold shadow-sm transition-all ${getHealthBadgeClassName(report.overall_health)}`}>
                          {report.overall_health || 'Unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold text-white">{report.health_score || '-'}</span>
                        <span className="text-slate-500 text-xs">/100</span>
                      </TableCell>
                      <TableCell className="font-medium text-slate-200">{formatCurrency(Number(report.portfolio_value))}</TableCell>
                      <TableCell className="font-medium text-slate-200">{formatCurrency(Number(report.total_equity))}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 font-medium">
                          {getCashflowIcon(Number(report.net_monthly_cashflow))}
                          <span className={Number(report.net_monthly_cashflow) < 0 ? 'text-red-300' : Number(report.net_monthly_cashflow) > 0 ? 'text-emerald-200' : 'text-slate-300'}>
                            {formatCurrency(Number(report.net_monthly_cashflow))}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-200">{report.total_properties || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm text-slate-400">
                          <Calendar className="h-3.5 w-3.5 text-amber-200/70" />
                          {format(new Date(report.created_at), 'dd MMM yyyy')}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="rounded-xl text-slate-300 hover:bg-amber-400/10 hover:text-amber-100 focus-visible:ring-amber-300/30">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="border-white/10 bg-zinc-950/95 text-slate-100 shadow-2xl shadow-black/40 backdrop-blur">
                            <DropdownMenuItem
                              className="focus:bg-amber-400/10 focus:text-amber-100"
                              disabled={!report.pdf_file_path}
                              onClick={() => handleViewPDF(report)}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Report
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="focus:bg-amber-400/10 focus:text-amber-100"
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
                              className="text-destructive"
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
