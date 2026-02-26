import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Search,
  X,
  Building2,
  Home,
  RefreshCw,
  ArrowUpDown,
  SlidersHorizontal,
  RotateCcw,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { DealWithClient } from '@/hooks/useAllDeals';

export type DealTypeFilter = 'all' | 'existing_property' | 'house_and_land' | 'refinance';
export type RiskFilter = 'all' | 'on_track' | 'needs_follow_up' | 'urgent';
export type SortField = 'created_at' | 'settlement_date' | 'total_contract_price' | 'client_name' | 'current_stage_number' | 'risk_status';
export type SortDirection = 'asc' | 'desc';

export interface PipelineFilters {
  search: string;
  dealType: DealTypeFilter;
  riskStatus: RiskFilter;
  responsiblePerson: string;
  sortField: SortField;
  sortDirection: SortDirection;
}

export const DEFAULT_FILTERS: PipelineFilters = {
  search: '',
  dealType: 'all',
  riskStatus: 'all',
  responsiblePerson: 'all',
  sortField: 'created_at',
  sortDirection: 'desc',
};

interface PipelineToolbarProps {
  deals: DealWithClient[];
  filters: PipelineFilters;
  onFiltersChange: (filters: PipelineFilters) => void;
  filteredCount: number;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

const DEAL_TYPE_OPTIONS: { value: DealTypeFilter; label: string; shortLabel: string; icon: React.ReactNode }[] = [
  { value: 'existing_property', label: 'Existing Property', shortLabel: 'Existing', icon: <Building2 className="h-3 w-3" /> },
  { value: 'house_and_land', label: 'House & Land', shortLabel: 'H&L', icon: <Home className="h-3 w-3" /> },
  { value: 'refinance', label: 'Refinance', shortLabel: 'Refi', icon: <RefreshCw className="h-3 w-3" /> },
];

const RISK_OPTIONS: { value: RiskFilter; label: string; emoji: string; activeClass: string }[] = [
  { value: 'on_track', label: 'On Track', emoji: '🟢', activeClass: 'bg-green-500/15 text-green-700 border-green-500/40 dark:text-green-400' },
  { value: 'needs_follow_up', label: 'Follow-Up', emoji: '🟠', activeClass: 'bg-amber-500/15 text-amber-700 border-amber-500/40 dark:text-amber-400' },
  { value: 'urgent', label: 'Urgent', emoji: '🔴', activeClass: 'bg-red-500/15 text-red-700 border-red-500/40 dark:text-red-400' },
];

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'created_at', label: 'Date Created' },
  { value: 'settlement_date', label: 'Settlement Date' },
  { value: 'total_contract_price', label: 'Contract Value' },
  { value: 'client_name', label: 'Client Name' },
  { value: 'current_stage_number', label: 'Stage Progress' },
  { value: 'risk_status', label: 'Risk Status' },
];

export function PipelineToolbar({
  deals,
  filters,
  onFiltersChange,
  filteredCount,
  isExpanded,
  onExpandedChange,
}: PipelineToolbarProps) {
  // Compute counts for badges
  const counts = useMemo(() => {
    const byType: Record<string, number> = { existing_property: 0, house_and_land: 0, refinance: 0 };
    const byRisk: Record<string, number> = { on_track: 0, needs_follow_up: 0, urgent: 0 };
    const responsibleSet = new Set<string>();

    for (const d of deals) {
      byType[d.deal_type] = (byType[d.deal_type] || 0) + 1;
      byRisk[d.risk_status] = (byRisk[d.risk_status] || 0) + 1;
      if (d.responsible_person) responsibleSet.add(d.responsible_person);
    }

    return {
      byType,
      byRisk,
      responsiblePersons: Array.from(responsibleSet).sort(),
      total: deals.length,
    };
  }, [deals]);

  const hasActiveFilters =
    filters.search !== '' ||
    filters.dealType !== 'all' ||
    filters.riskStatus !== 'all' ||
    filters.responsiblePerson !== 'all' ||
    filters.sortField !== 'created_at' ||
    filters.sortDirection !== 'desc';

  const update = (partial: Partial<PipelineFilters>) => {
    onFiltersChange({ ...filters, ...partial });
  };

  const resetFilters = () => {
    onFiltersChange(DEFAULT_FILTERS);
  };

  const toggleSort = (field: SortField) => {
    if (filters.sortField === field) {
      update({ sortDirection: filters.sortDirection === 'asc' ? 'desc' : 'asc' });
    } else {
      update({ sortField: field, sortDirection: 'desc' });
    }
  };

  return (
    <div className="space-y-2">
      {/* Row 1: Search + Filter toggle + Reset */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search client, stage, person..."
            value={filters.search}
            onChange={e => update({ search: e.target.value })}
            className="pl-8 h-8 text-xs sm:text-sm"
          />
          {filters.search && (
            <button
              onClick={() => update({ search: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Collapsible open={isExpanded} onOpenChange={onExpandedChange}>
          <CollapsibleTrigger asChild>
            <Button
              variant={hasActiveFilters ? 'default' : 'outline'}
              size="sm"
              className="h-8 gap-1.5 text-xs"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Filters</span>
              {hasActiveFilters && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px] min-w-[16px] flex items-center justify-center">
                  {[filters.dealType !== 'all', filters.riskStatus !== 'all', filters.responsiblePerson !== 'all', filters.sortField !== 'created_at'].filter(Boolean).length}
                </Badge>
              )}
            </Button>
          </CollapsibleTrigger>
        </Collapsible>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 gap-1 text-xs text-muted-foreground">
            <RotateCcw className="h-3 w-3" />
            <span className="hidden sm:inline">Reset</span>
          </Button>
        )}

        {/* Results count */}
        <div className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
          {filteredCount === counts.total ? (
            <span>{counts.total} deal{counts.total !== 1 ? 's' : ''}</span>
          ) : (
            <span>
              <strong className="text-foreground">{filteredCount}</strong> of {counts.total}
            </span>
          )}
        </div>
      </div>

      {/* Row 2: Expandable filter controls */}
      <Collapsible open={isExpanded} onOpenChange={onExpandedChange}>
        <CollapsibleContent>
          <div className="rounded-lg border bg-card p-3 space-y-3 animate-in slide-in-from-top-1 duration-200">
            {/* Deal Type Chips */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Deal Type</span>
              <div className="flex flex-wrap gap-1.5">
                {DEAL_TYPE_OPTIONS.map(opt => {
                  const isActive = filters.dealType === opt.value;
                  const count = counts.byType[opt.value] || 0;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => update({ dealType: isActive ? 'all' : opt.value })}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all',
                        isActive
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {opt.icon}
                      <span className="hidden sm:inline">{opt.label}</span>
                      <span className="sm:hidden">{opt.shortLabel}</span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'h-4 px-1 text-[10px] min-w-[16px] flex items-center justify-center',
                          isActive && 'bg-primary-foreground/20 text-primary-foreground'
                        )}
                      >
                        {count}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Risk Status Chips */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Risk Status</span>
              <div className="flex flex-wrap gap-1.5">
                {RISK_OPTIONS.map(opt => {
                  const isActive = filters.riskStatus === opt.value;
                  const count = counts.byRisk[opt.value] || 0;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => update({ riskStatus: isActive ? 'all' : opt.value })}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all',
                        isActive
                          ? opt.activeClass + ' shadow-sm'
                          : 'bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <span>{opt.emoji}</span>
                      <span>{opt.label}</span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'h-4 px-1 text-[10px] min-w-[16px] flex items-center justify-center',
                          isActive && 'bg-transparent border border-current/20'
                        )}
                      >
                        {count}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Row 3: Responsible Person + Sort */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Responsible Person */}
              <div className="space-y-1">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Responsible</span>
                <Select
                  value={filters.responsiblePerson}
                  onValueChange={v => update({ responsiblePerson: v })}
                >
                  <SelectTrigger className="w-[160px] sm:w-[180px] h-8 text-xs">
                    <SelectValue placeholder="All People" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All People</SelectItem>
                    {counts.responsiblePersons.map(person => (
                      <SelectItem key={person} value={person}>
                        {person}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sort */}
              <div className="space-y-1 ml-auto">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Sort By</span>
                <div className="flex items-center gap-1">
                  <Select
                    value={filters.sortField}
                    onValueChange={v => update({ sortField: v as SortField })}
                  >
                    <SelectTrigger className="w-[140px] sm:w-[160px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SORT_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => update({ sortDirection: filters.sortDirection === 'asc' ? 'desc' : 'asc' })}
                    title={filters.sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                  >
                    <ArrowUpDown className={cn('h-3.5 w-3.5 transition-transform', filters.sortDirection === 'asc' && 'rotate-180')} />
                  </Button>
                </div>
              </div>
            </div>

            {/* Active filter summary pills */}
            {hasActiveFilters && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t">
                <span className="text-[10px] text-muted-foreground">Active:</span>
                {filters.dealType !== 'all' && (
                  <Badge variant="secondary" className="text-[10px] gap-1 pr-1">
                    {DEAL_TYPE_OPTIONS.find(o => o.value === filters.dealType)?.shortLabel}
                    <button onClick={() => update({ dealType: 'all' })} className="hover:text-destructive">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                )}
                {filters.riskStatus !== 'all' && (
                  <Badge variant="secondary" className="text-[10px] gap-1 pr-1">
                    {RISK_OPTIONS.find(o => o.value === filters.riskStatus)?.label}
                    <button onClick={() => update({ riskStatus: 'all' })} className="hover:text-destructive">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                )}
                {filters.responsiblePerson !== 'all' && (
                  <Badge variant="secondary" className="text-[10px] gap-1 pr-1">
                    👤 {filters.responsiblePerson}
                    <button onClick={() => update({ responsiblePerson: 'all' })} className="hover:text-destructive">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                )}
                {filters.search && (
                  <Badge variant="secondary" className="text-[10px] gap-1 pr-1">
                    🔍 "{filters.search}"
                    <button onClick={() => update({ search: '' })} className="hover:text-destructive">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
