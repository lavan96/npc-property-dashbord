import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { BuildTypeFilter, DateRangeFilter } from './types';
import { BUILD_TYPE_FILTER_OPTIONS, DATE_RANGE_OPTIONS } from './utils';

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
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by property address..."
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          className="pl-10"
        />
      </div>
      <Select value={dateRange} onValueChange={(value) => onDateRangeChange(value as DateRangeFilter)}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Date range" />
        </SelectTrigger>
        <SelectContent>
          {DATE_RANGE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={buildTypeFilter} onValueChange={(value) => onBuildTypeFilterChange(value as BuildTypeFilter)}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Build Type" />
        </SelectTrigger>
        <SelectContent>
          {BUILD_TYPE_FILTER_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
