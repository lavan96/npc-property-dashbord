import { useEffect, useState, useMemo, useCallback } from 'react';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BarChart3, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ChartCard, type ChartData } from '@/components/charts/ChartCard';
import { ChartListRow } from '@/components/charts/ChartListRow';
import { ChartLightbox } from '@/components/charts/ChartLightbox';
import { ChartFilters } from '@/components/charts/ChartFilters';
import { ChartStats } from '@/components/charts/ChartStats';
import { useChartExport } from '@/components/charts/useChartExport';

export default function Charts() {
  const { canEdit: canEditCharts } = useModulePermissions('charts');
  const [charts, setCharts] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & view state
  const [searchQuery, setSearchQuery] = useState('');
  const [chartTypeFilter, setChartTypeFilter] = useState('all');
  const [reportFilter, setReportFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Lightbox
  const [expandedChart, setExpandedChart] = useState<ChartData | null>(null);

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

      const transformed: ChartData[] = chartsData.map((chart: any) => ({
        ...chart,
        generated_reports: chart.report_id ? reportsMap.get(chart.report_id) || null : null,
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

  // Filtering + sorting
  const filteredCharts = useMemo(() => {
    let result = [...charts];

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.chart_type.toLowerCase().includes(q) ||
        c.generated_reports?.title.toLowerCase().includes(q)
      );
    }

    // Type filter
    if (chartTypeFilter !== 'all') {
      result = result.filter(c => c.chart_type === chartTypeFilter);
    }

    // Report filter
    if (reportFilter !== 'all') {
      result = result.filter(c => c.report_id === reportFilter);
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
  }, [charts, searchQuery, chartTypeFilter, reportFilter, sortBy]);

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

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
            <BarChart3 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Charts</h1>
            <p className="text-sm text-muted-foreground">Loading chart data...</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
    <div className="space-y-5 animate-fade-in p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
            <BarChart3 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Charts</h1>
            <p className="text-sm text-muted-foreground">
              Visual analytics generated from reports
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">{charts.length} charts</Badge>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={fetchCharts}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
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
        <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
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

      {/* Empty state */}
      {charts.length === 0 ? (
        <Card className="border-dashed">
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
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center h-48 space-y-3">
            <p className="text-muted-foreground text-sm">No charts match your filters</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setSearchQuery(''); setChartTypeFilter('all'); setReportFilter('all'); }}
            >
              Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredCharts.map(chart => (
            <ChartCard
              key={chart.id}
              chart={chart}
              isSelected={selectedIds.has(chart.id)}
              onToggleSelect={toggleSelect}
              onExpand={setExpandedChart}
              onExport={exportSingle}
              selectionMode={selectionMode}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredCharts.map(chart => (
            <ChartListRow
              key={chart.id}
              chart={chart}
              isSelected={selectedIds.has(chart.id)}
              onToggleSelect={toggleSelect}
              onExpand={setExpandedChart}
              onExport={exportSingle}
              selectionMode={selectionMode}
            />
          ))}
        </div>
      )}

      {/* Results count */}
      {filteredCharts.length > 0 && filteredCharts.length !== charts.length && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {filteredCharts.length} of {charts.length} charts
        </p>
      )}

      {/* Lightbox */}
      <ChartLightbox
        chart={expandedChart}
        onClose={() => setExpandedChart(null)}
        onExport={exportSingle}
        onPrev={handleLightboxPrev}
        onNext={handleLightboxNext}
        hasPrev={expandedIndex > 0}
        hasNext={expandedIndex < filteredCharts.length - 1}
      />
    </div>
  );
}
