import { Search, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import type { BuildTypeFilter, DateRangeFilter } from './types';

interface CashFlowToolbarProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  dateRange: DateRangeFilter;
  onDateRangeChange: (value: DateRangeFilter) => void;
  buildTypeFilter: BuildTypeFilter;
  onBuildTypeFilterChange: (value: BuildTypeFilter) => void;
}

export function CashFlowToolbar({ searchQuery, onSearchQueryChange, dateRange, onDateRangeChange, buildTypeFilter, onBuildTypeFilterChange }: CashFlowToolbarProps) {
  return (
    <Card className="border-slate-200/80 bg-background/95 shadow-sm">
      <CardContent className="p-3 md:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground lg:w-44">
            <SlidersHorizontal className="h-4 w-4" />
            Command filters
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by property address..." value={searchQuery} onChange={(e) => onSearchQueryChange(e.target.value)} className="h-11 pl-10" />
          </div>
          <Select value={dateRange} onValueChange={onDateRangeChange}>
            <SelectTrigger className="h-11 w-full lg:w-[170px]"><SelectValue placeholder="Date range" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Last 30 days</SelectItem><SelectItem value="90">Last 90 days</SelectItem><SelectItem value="180">Last 6 months</SelectItem><SelectItem value="365">Last 12 months</SelectItem><SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Select value={buildTypeFilter} onValueChange={onBuildTypeFilterChange}>
            <SelectTrigger className="h-11 w-full lg:w-[190px]"><SelectValue placeholder="Build Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Build Types</SelectItem><SelectItem value="new_build">New Build</SelectItem><SelectItem value="existing_property">Existing Property</SelectItem><SelectItem value="land_only">Land Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
