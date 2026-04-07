import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  return (
    <div className="space-y-3">
      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search charts by title, report, or analysis..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9"
          />
          {searchQuery && (
            <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => onSearchChange('')}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Select value={chartTypeFilter} onValueChange={onChartTypeChange}>
            <SelectTrigger className="w-[120px] h-9">
              <SelectValue placeholder="Chart type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {chartTypes.map(t => (
                <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={reportFilter} onValueChange={onReportChange}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue placeholder="All reports" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reports</SelectItem>
              {reports.map(r => (
                <SelectItem key={r.id} value={r.id}>
                  <span className="truncate max-w-[130px] block">{r.title}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date range filter (Enhancement #5) */}
          <Select value={dateRange} onValueChange={onDateRangeChange}>
            <SelectTrigger className="w-[130px] h-9">
              <CalendarDays className="h-3.5 w-3.5 mr-1.5 shrink-0" />
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="6m">Last 6 months</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger className="w-[120px] h-9">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
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
      <div className="flex items-center gap-2">
        <div className="flex border rounded-md overflow-hidden">
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 rounded-none px-2.5"
            onClick={() => onViewModeChange('grid')}
            title="Grid view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 rounded-none px-2.5"
            onClick={() => onViewModeChange('list')}
            title="List view"
          >
            <List className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={viewMode === 'grouped' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 rounded-none px-2.5"
            onClick={() => onViewModeChange('grouped')}
            title="Group by report"
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Button
          variant={selectionMode ? 'default' : 'outline'}
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={onToggleSelectionMode}
        >
          <CheckSquare className="h-3.5 w-3.5" />
          {selectionMode ? `${selectedCount} selected` : 'Select'}
        </Button>
      </div>
    </div>
  );
}
