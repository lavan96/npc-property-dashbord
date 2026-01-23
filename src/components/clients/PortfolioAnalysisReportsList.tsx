import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { secureStorageDownload } from '@/hooks/useSecureStorage';
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

const getCashflowIcon = (cashflow: number | null) => {
  if (cashflow === null) return <Minus className="h-4 w-4 text-muted-foreground" />;
  if (cashflow > 0) return <TrendingUp className="h-4 w-4 text-green-600" />;
  if (cashflow < 0) return <TrendingDown className="h-4 w-4 text-red-600" />;
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
      a.download = `Portfolio_Analysis_${report.client_name.replace(/\s+/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded successfully');
    } catch (error: any) {
      toast.error('Failed to download PDF: ' + error.message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showHeader && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Reports</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalReports}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Health Score</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{avgHealthScore}/100</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Combined Portfolio</CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(totalPortfolioValue)}</div>
              </CardContent>
            </Card>
          </div>

          {/* Search and Actions */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by client name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </>
      )}

      {/* Reports Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            {clientId ? 'Client Reports' : 'All Portfolio Analysis Reports'}
          </CardTitle>
          <CardDescription>
            {clientId
              ? 'Previously generated portfolio performance reports for this client'
              : 'View all generated portfolio performance analysis reports across all clients'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No reports found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {clientId
                  ? 'Generate a portfolio analysis to see reports here'
                  : 'No portfolio analysis reports have been generated yet'
                }
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    {!clientId && <TableHead>Client</TableHead>}
                    <TableHead>Health</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Portfolio Value</TableHead>
                    <TableHead>Equity</TableHead>
                    <TableHead>Cashflow</TableHead>
                    <TableHead>Properties</TableHead>
                    <TableHead>Generated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReports.map((report) => (
                    <TableRow key={report.id}>
                      {!clientId && (
                        <TableCell className="font-medium">
                          {report.client_name}
                        </TableCell>
                      )}
                      <TableCell>
                        <Badge variant={getHealthBadgeVariant(report.overall_health)}>
                          {report.overall_health || 'Unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold">{report.health_score || '-'}</span>
                        <span className="text-muted-foreground text-xs">/100</span>
                      </TableCell>
                      <TableCell>{formatCurrency(Number(report.portfolio_value))}</TableCell>
                      <TableCell>{formatCurrency(Number(report.total_equity))}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {getCashflowIcon(Number(report.net_monthly_cashflow))}
                          <span className={Number(report.net_monthly_cashflow) < 0 ? 'text-red-600' : ''}>
                            {formatCurrency(Number(report.net_monthly_cashflow))}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{report.total_properties || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-muted-foreground text-sm">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(report.created_at), 'dd MMM yyyy')}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={!report.pdf_file_path}
                              onClick={() => handleViewPDF(report)}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Report
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!report.pdf_file_path}
                              onClick={() => handleDownloadPDF(report)}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download PDF
                            </DropdownMenuItem>
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
              Are you sure you want to delete this portfolio analysis report for {reportToDelete?.client_name}?
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
