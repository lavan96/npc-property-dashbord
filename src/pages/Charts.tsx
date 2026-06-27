import { useEffect, useState, useMemo, useCallback } from 'react';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { BarChart3, Download, RefreshCw, ChevronDown, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { subDays, subMonths, subYears } from 'date-fns';
import { ChartCard, type ChartData } from '@/components/charts/ChartCard';
import { ChartListRow } from '@/components/charts/ChartListRow';
import { ChartLightbox } from '@/components/charts/ChartLightbox';
import { ChartFilters } from '@/components/charts/ChartFilters';
import { ChartStats } from '@/components/charts/ChartStats';
import { useChartExport } from '@/components/charts/useChartExport';

const CHARTS_PER_PAGE = 24;

export default function Charts() {
  const { canEdit: canEditCharts } = useModulePermissions('charts');
  const [charts, setCharts] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & view state
  const [searchQuery, setSearchQuery] = useState('');
  const [chartTypeFilter, setChartTypeFilter] = useState('all');
  const [reportFilter, setReportFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [dateRange, setDateRange] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'grouped'>('grid');
  const [visibleCount, setVisibleCount] = useState(CHARTS_PER_PAGE);

  // Selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Lightbox
  const [expandedChart, setExpandedChart] = useState<ChartData | null>(null);

  // Delete confirmation
  const [chartToDelete, setChartToDelete] = useState<ChartData | null>(null);

  const { exportSingle, exportBulk } = useChartExport();

  const fetchCharts = useCallback(async () => {
    try {
      setLoading(true);
      const { data: chartsResult, error: chartsError } = await invokeSecureFunction('manage-templates', {
        operation: 'list',
        table: 'charts',
        listOptions: { orderBy: 'created_at', orderAsc: false, limit: 500 }
      });

      if (chartsError) {
        console.error('Error fetching charts:', chartsError);
        toast.error('Failed to load charts');
        return;
      }

      const chartsData = chartsResult?.records || [];

      // Fetch linked reports
      const reportIds = [...new Set(chartsData.map((c: any) => c.report_id).filter(Boolean))];
      let reportsMap = new Map();

      if (reportIds.length > 0) {
        const { data: reportsResult, error: reportsError } = await invokeSecureFunction('get-investment-reports', {
          table: 'generated_reports',
          reportIds,
          listOptions: { select: 'id, title, created_at' }
        });
        if (!reportsError && reportsResult?.reports) {
          reportsResult.reports.forEach((r: any) => reportsMap.set(r.id, r));
        }
      }

      // Fetch chart analysis (Enhancement #1)
      const chartIds = chartsData.map((c: any) => c.id);
      let analysisMap = new Map<string, string>();

      if (chartIds.length > 0) {
        try {
          const { data: analysisResult } = await invokeSecureFunction('manage-templates', {
            operation: 'list',
            table: 'chart_analysis',
            listOptions: { orderBy: 'created_at', orderAsc: false, limit: 500 }
          });
          if (analysisResult?.records) {
            analysisResult.records.forEach((a: any) => {
              if (a.chart_id && a.analysis_text) {
                analysisMap.set(a.chart_id, a.analysis_text);
              }
            });
          }
        } catch (e) {
          console.log('No chart analysis available');
        }
      }

      const transformed: ChartData[] = chartsData.map((chart: any) => ({
        ...chart,
        generated_reports: chart.report_id ? reportsMap.get(chart.report_id) || null : null,
        analysis_text: analysisMap.get(chart.id) || null,
      }));

      setCharts(transformed);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to load charts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCharts(); }, [fetchCharts]);

  // Derived data
  const chartTypes = useMemo(() => [...new Set(charts.map(c => c.chart_type))].sort(), [charts]);
  const uniqueReports = useMemo(() => {
    const map = new Map<string, string>();
    charts.forEach(c => {
      if (c.generated_reports) map.set(c.report_id, c.generated_reports.title);
    });
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [charts]);

  // Date range cutoff
  const dateCutoff = useMemo(() => {
    const now = new Date();
    switch (dateRange) {
      case '7d': return subDays(now, 7);
      case '30d': return subDays(now, 30);
      case '90d': return subDays(now, 90);
      case '6m': return subMonths(now, 6);
      case '1y': return subYears(now, 1);
      default: return null;
    }
  }, [dateRange]);

  // Filtering + sorting
  const filteredCharts = useMemo(() => {
    let result = [...charts];

    // Search — also searches analysis text
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.chart_type.toLowerCase().includes(q) ||
        c.generated_reports?.title.toLowerCase().includes(q) ||
        c.analysis_text?.toLowerCase().includes(q)
      );
    }

    if (chartTypeFilter !== 'all') {
      result = result.filter(c => c.chart_type === chartTypeFilter);
    }

    if (reportFilter !== 'all') {
      result = result.filter(c => c.report_id === reportFilter);
    }

    // Date range filter (Enhancement #5)
    if (dateCutoff) {
      result = result.filter(c => new Date(c.created_at) >= dateCutoff);
    }

    // Sort
    switch (sortBy) {
      case 'newest':
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'oldest':
        result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'title_asc':
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'title_desc':
        result.sort((a, b) => b.title.localeCompare(a.title));
        break;
      case 'type':
        result.sort((a, b) => a.chart_type.localeCompare(b.chart_type) || a.title.localeCompare(b.title));
        break;
    }

    return result;
  }, [charts, searchQuery, chartTypeFilter, reportFilter, sortBy, dateCutoff]);

  // Pagination (Enhancement #9)
  const paginatedCharts = useMemo(() => filteredCharts.slice(0, visibleCount), [filteredCharts, visibleCount]);
  const hasMore = visibleCount < filteredCharts.length;

  // Reset pagination when filters change
  useEffect(() => { setVisibleCount(CHARTS_PER_PAGE); }, [searchQuery, chartTypeFilter, reportFilter, sortBy, dateRange]);

  // Grouped view data (Enhancement #2)
  const groupedByReport = useMemo(() => {
    if (viewMode !== 'grouped') return [];
    const groups = new Map<string, { reportTitle: string; reportId: string; charts: ChartData[] }>();
    const ungrouped: ChartData[] = [];

    paginatedCharts.forEach(c => {
      if (c.generated_reports) {
        const key = c.report_id;
        if (!groups.has(key)) {
          groups.set(key, { reportTitle: c.generated_reports.title, reportId: c.report_id, charts: [] });
        }
        groups.get(key)!.charts.push(c);
      } else {
        ungrouped.push(c);
      }
    });

    const result = Array.from(groups.values());
    if (ungrouped.length > 0) {
      result.push({ reportTitle: 'Unlinked Charts', reportId: 'none', charts: ungrouped });
    }
    return result;
  }, [viewMode, paginatedCharts]);

  // Selection handlers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredCharts.map(c => c.id)));
  }, [filteredCharts]);

  // Lightbox navigation
  const expandedIndex = expandedChart ? filteredCharts.findIndex(c => c.id === expandedChart.id) : -1;
  const handleLightboxPrev = useCallback(() => {
    if (expandedIndex > 0) setExpandedChart(filteredCharts[expandedIndex - 1]);
  }, [expandedIndex, filteredCharts]);
  const handleLightboxNext = useCallback(() => {
    if (expandedIndex < filteredCharts.length - 1) setExpandedChart(filteredCharts[expandedIndex + 1]);
  }, [expandedIndex, filteredCharts]);

  const handleBulkExport = useCallback(() => {
    const selectedCharts = charts.filter(c => selectedIds.has(c.id));
    exportBulk(selectedCharts);
  }, [charts, selectedIds, exportBulk]);

  // Delete handler (Enhancement #4)
  const handleDeleteConfirm = useCallback(async () => {
    if (!chartToDelete) return;
    try {
      await invokeSecureFunction('manage-templates', {
        operation: 'delete',
        table: 'charts',
        recordId: chartToDelete.id,
      });
      setCharts(prev => prev.filter(c => c.id !== chartToDelete.id));
      toast.success(`Deleted "${chartToDelete.title}"`);
    } catch (error) {
      toast.error('Failed to delete chart');
    } finally {
      setChartToDelete(null);
    }
  }, [chartToDelete]);

  // Shared card/row props
  const cardProps = useCallback((chart: ChartData) => ({
    chart,
    isSelected: selectedIds.has(chart.id),
    onToggleSelect: toggleSelect,
    onExpand: setExpandedChart,
    onExport: exportSingle,
    onDelete: canEditCharts ? setChartToDelete : undefined,
    selectionMode,
  }), [selectedIds, toggleSelect, exportSingle, canEditCharts, selectionMode]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="min-h-screen animate-fade-in space-y-6 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_34%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--background)))] p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-primary via-amber-400 to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20 ring-1 ring-primary/40">
            <BarChart3 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Charts</h1>
            <p className="text-sm text-muted-foreground">Loading chart data...</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse"><CardContent className="p-3"><div className="h-14 bg-muted rounded" /></CardContent></Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4 space-y-3">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
                <div className="h-48 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen animate-fade-in bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_32%),radial-gradient(circle_at_85%_10%,rgba(245,158,11,0.09),transparent_28%)] p-4 sm:p-6">
      <div className="mx-auto max-w-[1700px] space-y-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card/80 p-4 shadow-2xl shadow-black/20 backdrop-blur sm:p-5">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-amber-400 to-primary/70 shadow-lg shadow-primary/20 ring-1 ring-primary/40">
                <BarChart3 className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Charts</h1>
                <p className="text-sm text-muted-foreground">Visual analytics generated from reports</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
          <Badge variant="secondary" className="border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{charts.length} charts</Badge>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 border-primary/25 bg-background/60 hover:border-primary/50 hover:bg-primary/10 hover:text-primary" onClick={fetchCharts}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
            </div>
          </div>
        </div>

        {/* Stats */}
      {charts.length > 0 && <ChartStats charts={charts} />}

        {/* Filters */}
      {charts.length > 0 && (
        <ChartFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          chartTypeFilter={chartTypeFilter}
          onChartTypeChange={setChartTypeFilter}
          reportFilter={reportFilter}
          onReportChange={setReportFilter}
          sortBy={sortBy}
          onSortChange={setSortBy}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          selectionMode={selectionMode}
          onToggleSelectionMode={toggleSelectionMode}
          selectedCount={selectedIds.size}
          chartTypes={chartTypes}
          reports={uniqueReports}
        />
      )}

        {/* Bulk actions bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/10 p-3 shadow-lg shadow-primary/5 backdrop-blur">
          <Badge variant="default" className="text-xs">{selectedIds.size} selected</Badge>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={selectAll}>
            Select all ({filteredCharts.length})
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
          <div className="flex-1" />
          <Button size="sm" className="h-7 text-xs gap-1" onClick={handleBulkExport}>
            <Download className="h-3 w-3" /> Export selected
          </Button>
        </div>
      )}

        {/* Content */}
      {charts.length === 0 ? (
        <Card className="border-dashed border-primary/20 bg-card/80 shadow-xl shadow-black/10">
          <CardContent className="flex flex-col items-center justify-center h-80 space-y-4">
            <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
              <BarChart3 className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-semibold">No charts generated yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Charts are automatically generated when you create investment reports. Generate your first report to see visual analytics here.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : filteredCharts.length === 0 ? (
        <Card className="border-dashed border-primary/20 bg-card/80 shadow-xl shadow-black/10">
          <CardContent className="flex flex-col items-center justify-center h-48 space-y-3">
            <p className="text-muted-foreground text-sm">No charts match your filters</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setSearchQuery(''); setChartTypeFilter('all'); setReportFilter('all'); setDateRange('all'); }}
            >
              Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === 'grouped' ? (
        /* Grouped by Report view (Enhancement #2) */
        <div className="space-y-4">
          {groupedByReport.map(group => (
            <Collapsible key={group.reportId} defaultOpen>
              <CollapsibleTrigger asChild>
                <button className="group/trigger flex w-full items-center gap-2 rounded-xl border border-border/60 bg-card/80 p-3 text-left shadow-sm transition-all hover:border-primary/30 hover:bg-primary/5 hover:shadow-lg hover:shadow-primary/5">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-medium text-sm flex-1 truncate">{group.reportTitle}</span>
                  <Badge variant="secondary" className="text-[10px] shrink-0">{group.charts.length}</Badge>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]/trigger:rotate-180" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.charts.map(chart => (
                    <ChartCard key={chart.id} {...cardProps(chart)} />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {paginatedCharts.map(chart => (
            <ChartCard key={chart.id} {...cardProps(chart)} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {paginatedCharts.map(chart => (
            <ChartListRow key={chart.id} {...cardProps(chart)} />
          ))}
        </div>
      )}

        {/* Load more (Enhancement #9) */}
      {hasMore && viewMode !== 'grouped' && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-primary/25 bg-card/80 hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
            onClick={() => setVisibleCount(prev => prev + CHARTS_PER_PAGE)}
          >
            Load more ({filteredCharts.length - visibleCount} remaining)
          </Button>
        </div>
      )}

        {/* Results count */}
      {filteredCharts.length > 0 && filteredCharts.length !== charts.length && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {Math.min(visibleCount, filteredCharts.length)} of {filteredCharts.length} charts
          {filteredCharts.length !== charts.length && ` (${charts.length} total)`}
        </p>
      )}

        {/* Lightbox (includes keyboard navigation — Enhancement #3) */}
      <ChartLightbox
        chart={expandedChart}
        onClose={() => setExpandedChart(null)}
        onExport={exportSingle}
        onPrev={handleLightboxPrev}
        onNext={handleLightboxNext}
        hasPrev={expandedIndex > 0}
        hasNext={expandedIndex < filteredCharts.length - 1}
      />

        {/* Delete confirmation dialog (Enhancement #4) */}
      <AlertDialog open={!!chartToDelete} onOpenChange={(open) => !open && setChartToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chart?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{chartToDelete?.title}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </div>
  );
}
