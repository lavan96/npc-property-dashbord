import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Search, LayoutGrid, List, CheckSquare, X, FolderOpen, CalendarDays } from 'lucide-react';

interface ChartFiltersProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  chartTypeFilter: string;
  onChartTypeChange: (type: string) => void;
  reportFilter: string;
  onReportChange: (id: string) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
  dateRange: string;
  onDateRangeChange: (range: string) => void;
  viewMode: 'grid' | 'list' | 'grouped';
  onViewModeChange: (mode: 'grid' | 'list' | 'grouped') => void;
  selectionMode: boolean;
  onToggleSelectionMode: () => void;
  selectedCount: number;
  chartTypes: string[];
  reports: { id: string; title: string }[];
}

export function ChartFilters({
  searchQuery, onSearchChange,
  chartTypeFilter, onChartTypeChange,
  reportFilter, onReportChange,
  sortBy, onSortChange,
  dateRange, onDateRangeChange,
  viewMode, onViewModeChange,
  selectionMode, onToggleSelectionMode,
  selectedCount,
  chartTypes,
  reports,
}: ChartFiltersProps) {
  const filterTriggerClass = (isActive = false) => cn(
    'h-11 min-w-[9.25rem] justify-between rounded-xl border bg-background/80 px-3 text-sm font-semibold text-foreground shadow-sm shadow-black/5 transition-all duration-200',
    'hover:-translate-y-0.5 hover:border-amber-300/60 hover:bg-amber-500/10 hover:shadow-[0_12px_28px_hsl(43_74%_49%/0.13)]',
    'focus:ring-2 focus:ring-amber-300/35 focus:ring-offset-0 data-[state=open]:border-amber-300/70 data-[state=open]:bg-amber-500/10 data-[state=open]:shadow-[0_14px_32px_hsl(43_74%_49%/0.16)]',
    isActive
      ? 'border-amber-300/70 bg-gradient-to-r from-amber-500/18 to-primary/10 text-primary shadow-[0_10px_26px_hsl(43_74%_49%/0.14)]'
      : 'border-border/60'
  );

  return (
    <div className="rounded-[1.5rem] border border-primary/15 bg-card/90 p-3 shadow-2xl shadow-black/10 backdrop-blur-xl sm:p-4">
      <div className="pointer-events-none -mx-1 -mt-1 mb-3 h-px bg-gradient-to-r from-transparent via-amber-300/60 to-transparent" />
      {/* Search + filters */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-amber-500/85" />
          <Input
            placeholder="Search charts by title, report, or analysis..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-12 rounded-2xl border-primary/15 bg-background/85 pl-12 pr-11 text-base font-medium shadow-inner shadow-black/5 transition-all placeholder:text-muted-foreground/80 hover:border-amber-300/45 focus-visible:border-amber-300/80 focus-visible:ring-4 focus-visible:ring-amber-300/20"
          />
          {searchQuery && (
            <Button variant="ghost" size="icon" className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full hover:bg-amber-500/12 hover:text-primary" onClick={() => onSearchChange('')}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap xl:justify-end">
          <Select value={chartTypeFilter} onValueChange={onChartTypeChange}>
            <SelectTrigger className={filterTriggerClass(chartTypeFilter !== 'all')}>
              <SelectValue placeholder="Chart type" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-primary/15 bg-popover/95 shadow-xl backdrop-blur">
              <SelectItem value="all">All types</SelectItem>
              {chartTypes.map(t => (
                <SelectItem key={t} value={t} className="capitalize focus:bg-amber-500/10 focus:text-primary">{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={reportFilter} onValueChange={onReportChange}>
            <SelectTrigger className={cn(filterTriggerClass(reportFilter !== 'all'), 'sm:min-w-[10.75rem]')}>
              <SelectValue placeholder="All reports" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-primary/15 bg-popover/95 shadow-xl backdrop-blur">
              <SelectItem value="all">All reports</SelectItem>
              {reports.map(r => (
                <SelectItem key={r.id} value={r.id} className="focus:bg-amber-500/10 focus:text-primary">
                  <span className="block max-w-[13rem] truncate">{r.title}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date range filter (Enhancement #5) */}
          <Select value={dateRange} onValueChange={onDateRangeChange}>
            <SelectTrigger className={filterTriggerClass(dateRange !== 'all')}>
              <CalendarDays className="mr-1.5 h-3.5 w-3.5 shrink-0 text-amber-500/85" />
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-primary/15 bg-popover/95 shadow-xl backdrop-blur">
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="6m">Last 6 months</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger className={filterTriggerClass(sortBy !== 'newest')}>
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-primary/15 bg-popover/95 shadow-xl backdrop-blur">
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="title_asc">Title A–Z</SelectItem>
              <SelectItem value="title_desc">Title Z–A</SelectItem>
              <SelectItem value="type">By type</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Action row */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
        <div className="flex overflow-hidden rounded-xl border border-border/60 bg-background/75 p-1 shadow-inner shadow-black/5">
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="sm"
            className={cn('h-9 rounded-lg px-3 transition-all', viewMode === 'grid' && 'bg-amber-500/15 text-primary shadow-sm')}
            onClick={() => onViewModeChange('grid')}
            title="Grid view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            className={cn('h-9 rounded-lg px-3 transition-all', viewMode === 'list' && 'bg-amber-500/15 text-primary shadow-sm')}
            onClick={() => onViewModeChange('list')}
            title="List view"
          >
            <List className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={viewMode === 'grouped' ? 'secondary' : 'ghost'}
            size="sm"
            className={cn('h-9 rounded-lg px-3 transition-all', viewMode === 'grouped' && 'bg-amber-500/15 text-primary shadow-sm')}
            onClick={() => onViewModeChange('grouped')}
            title="Group by report"
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Button
          variant={selectionMode ? 'default' : 'outline'}
          size="sm"
          className={cn(
            'h-10 gap-1.5 rounded-xl border-primary/25 px-3 text-xs font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:border-amber-300/60 hover:bg-amber-500/10 hover:text-primary',
            selectionMode && 'bg-gradient-to-r from-primary to-amber-500 text-primary-foreground shadow-[0_12px_26px_hsl(43_74%_49%/0.18)] hover:text-primary-foreground'
          )}
          onClick={onToggleSelectionMode}
        >
          <CheckSquare className="h-3.5 w-3.5" />
          {selectionMode ? `${selectedCount} selected` : 'Select'}
        </Button>
      </div>
    </div>
  );
}
