import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Search,
  X,
  Building2,
  Home,
  RefreshCw,
  ArrowUpDown,
  SlidersHorizontal,
  RotateCcw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { DealWithClient } from "@/hooks/useAllDeals";

export type DealTypeFilter =
  | "all"
  | "existing_property"
  | "house_and_land"
  | "refinance";
export type RiskFilter = "all" | "on_track" | "needs_follow_up" | "urgent";
export type SortField =
  | "created_at"
  | "settlement_date"
  | "total_contract_price"
  | "client_name"
  | "current_stage_number"
  | "risk_status";
export type SortDirection = "asc" | "desc";

export interface PipelineFilters {
  search: string;
  dealType: DealTypeFilter;
  riskStatus: RiskFilter;
  responsiblePerson: string;
  sortField: SortField;
  sortDirection: SortDirection;
}

export const DEFAULT_FILTERS: PipelineFilters = {
  search: "",
  dealType: "all",
  riskStatus: "all",
  responsiblePerson: "all",
  sortField: "created_at",
  sortDirection: "desc",
};

interface PipelineToolbarProps {
  deals: DealWithClient[];
  filters: PipelineFilters;
  onFiltersChange: (filters: PipelineFilters) => void;
  filteredCount: number;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

const DEAL_TYPE_OPTIONS: {
  value: DealTypeFilter;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "existing_property",
    label: "Existing Property",
    shortLabel: "Existing",
    icon: <Building2 className="h-3 w-3" />,
  },
  {
    value: "house_and_land",
    label: "House & Land",
    shortLabel: "H&L",
    icon: <Home className="h-3 w-3" />,
  },
  {
    value: "refinance",
    label: "Refinance",
    shortLabel: "Refi",
    icon: <RefreshCw className="h-3 w-3" />,
  },
];

const RISK_OPTIONS: {
  value: RiskFilter;
  label: string;
  emoji: string;
  activeClass: string;
}[] = [
  {
    value: "on_track",
    label: "On Track",
    emoji: "🟢",
    activeClass:
      "bg-green-500/15 text-green-700 border-green-500/40 dark:text-green-400",
  },
  {
    value: "needs_follow_up",
    label: "Follow-Up",
    emoji: "🟠",
    activeClass:
      "bg-amber-500/15 text-amber-700 border-amber-500/40 dark:text-amber-400",
  },
  {
    value: "urgent",
    label: "Urgent",
    emoji: "🔴",
    activeClass:
      "bg-red-500/15 text-red-700 border-red-500/40 dark:text-red-400",
  },
];

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "created_at", label: "Date Created" },
  { value: "settlement_date", label: "Settlement Date" },
  { value: "total_contract_price", label: "Contract Value" },
  { value: "client_name", label: "Client Name" },
  { value: "current_stage_number", label: "Stage Progress" },
  { value: "risk_status", label: "Risk Status" },
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
    const byType: Record<string, number> = {
      existing_property: 0,
      house_and_land: 0,
      refinance: 0,
    };
    const byRisk: Record<string, number> = {
      on_track: 0,
      needs_follow_up: 0,
      urgent: 0,
    };
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
    filters.search !== "" ||
    filters.dealType !== "all" ||
    filters.riskStatus !== "all" ||
    filters.responsiblePerson !== "all" ||
    filters.sortField !== "created_at" ||
    filters.sortDirection !== "desc";

  const update = (partial: Partial<PipelineFilters>) => {
    onFiltersChange({ ...filters, ...partial });
  };

  const resetFilters = () => {
    onFiltersChange(DEFAULT_FILTERS);
  };

  return (
    <div className="space-y-4" role="search" aria-label="Deal pipeline search and filters">
      {/* Row 1: Search + Filter toggle + Reset */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative w-full flex-1 lg:max-w-2xl">
          <div className="pointer-events-none absolute left-3.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-amber-300/15 bg-amber-300/10 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.14)]">
            <Search className="h-4 w-4" />
          </div>
          <Input
            id="deal-pipeline-search"
            type="search"
            aria-label="Search deals by client, stage, or responsible person"
            placeholder="Search client, stage, person..."
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            className="h-12 rounded-2xl border-amber-200/15 bg-gradient-to-r from-zinc-950/95 via-zinc-950/80 to-zinc-900/70 pl-14 pr-11 text-sm font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_42px_rgba(0,0,0,0.24)] outline-none placeholder:text-muted-foreground/85 hover:border-amber-200/25 focus-visible:border-amber-300/55 focus-visible:ring-2 focus-visible:ring-amber-300/30 focus-visible:ring-offset-0"
          />
          {filters.search && (
            <button
              onClick={() => update({ search: "" })}
              className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
              aria-label="Clear deal search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 lg:justify-end" aria-label="Filter actions">
          <Collapsible open={isExpanded} onOpenChange={onExpandedChange}>
            <CollapsibleTrigger asChild>
              <Button
                variant={hasActiveFilters ? "default" : "outline"}
                size="sm"
                className={cn(
                  "h-12 gap-2 rounded-2xl px-4 text-sm font-semibold shadow-[0_14px_34px_rgba(0,0,0,0.22)] transition-all",
                  hasActiveFilters
                    ? "border-amber-300/50 bg-gradient-to-r from-amber-300 to-yellow-500 text-amber-950 hover:from-amber-200 hover:to-yellow-400"
                    : "border-amber-200/20 bg-white/[0.04] text-amber-100 hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-amber-50",
                )}
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">Filters</span>
                {hasActiveFilters && (
                  <Badge
                    variant="secondary"
                    className="h-4 px-1 text-[10px] min-w-[16px] flex items-center justify-center"
                  >
                    {
                      [
                        filters.dealType !== "all",
                        filters.riskStatus !== "all",
                        filters.responsiblePerson !== "all",
                        filters.sortField !== "created_at",
                      ].filter(Boolean).length
                    }
                  </Badge>
                )}
              </Button>
            </CollapsibleTrigger>
          </Collapsible>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-12 gap-1.5 rounded-2xl px-3 text-xs font-semibold text-muted-foreground hover:bg-white/10 hover:text-amber-100"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </Button>
          )}

          {/* Results count */}
          <div className="flex h-12 items-center whitespace-nowrap rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-xs font-semibold text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:text-sm">
            {filteredCount === counts.total ? (
              <span>
                {counts.total} deal{counts.total !== 1 ? "s" : ""}
              </span>
            ) : (
              <span>
                <strong className="text-foreground">{filteredCount}</strong> of{" "}
                {counts.total}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Expandable filter controls */}
      <Collapsible open={isExpanded} onOpenChange={onExpandedChange}>
        <CollapsibleContent>
          <div id="deal-pipeline-filters" className="animate-in slide-in-from-top-1 space-y-4 rounded-[1.35rem] border border-amber-300/20 bg-gradient-to-br from-zinc-950/90 via-zinc-950/80 to-amber-950/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_46px_rgba(0,0,0,0.22)] duration-200">
            {/* Deal Type Chips */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Deal Type
              </span>
              <div className="flex flex-wrap gap-1.5">
                {DEAL_TYPE_OPTIONS.map((opt) => {
                  const isActive = filters.dealType === opt.value;
                  const count = counts.byType[opt.value] || 0;
                  return (
                    <button
                      key={opt.value}
                      onClick={() =>
                        update({ dealType: isActive ? "all" : opt.value })
                      }
                      aria-pressed={isActive}
                      aria-label={`Filter deal type: ${opt.label} (${count})`}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                        isActive
                          ? "border-amber-300 bg-gradient-to-r from-amber-300 to-yellow-500 text-amber-950 shadow-[0_10px_24px_rgba(245,158,11,0.22)]"
                          : "border-white/10 bg-black/35 text-muted-foreground hover:border-amber-300/25 hover:bg-amber-300/10 hover:text-amber-100",
                      )}
                    >
                      {opt.icon}
                      <span className="hidden sm:inline">{opt.label}</span>
                      <span className="sm:hidden">{opt.shortLabel}</span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "h-4 px-1 text-[10px] min-w-[16px] flex items-center justify-center",
                          isActive &&
                            "bg-primary-foreground/20 text-primary-foreground",
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
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Risk Status
              </span>
              <div className="flex flex-wrap gap-1.5">
                {RISK_OPTIONS.map((opt) => {
                  const isActive = filters.riskStatus === opt.value;
                  const count = counts.byRisk[opt.value] || 0;
                  return (
                    <button
                      key={opt.value}
                      onClick={() =>
                        update({ riskStatus: isActive ? "all" : opt.value })
                      }
                      aria-pressed={isActive}
                      aria-label={`Filter risk status: ${opt.label} (${count})`}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                        isActive
                          ? opt.activeClass + " shadow-sm"
                          : "border-white/10 bg-black/35 text-muted-foreground hover:border-amber-300/25 hover:bg-amber-300/10 hover:text-amber-100",
                      )}
                    >
                      <span>{opt.emoji}</span>
                      <span>{opt.label}</span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "h-4 px-1 text-[10px] min-w-[16px] flex items-center justify-center",
                          isActive && "bg-transparent border border-current/20",
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
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Responsible
                </span>
                <Select
                  value={filters.responsiblePerson}
                  onValueChange={(v) => update({ responsiblePerson: v })}
                >
                  <SelectTrigger aria-label="Filter by responsible person" className="h-11 w-full min-w-[170px] rounded-xl border-white/10 bg-black/45 text-xs shadow-inner hover:border-amber-300/25 focus:ring-amber-300/30 sm:w-[190px]">
                    <SelectValue placeholder="All People" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All People</SelectItem>
                    {counts.responsiblePersons.map((person) => (
                      <SelectItem key={person} value={person}>
                        {person}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sort */}
              <div className="w-full space-y-1 sm:w-auto sm:ml-auto">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Sort By
                </span>
                <div className="flex w-full items-center gap-1 sm:w-auto">
                  <Select
                    value={filters.sortField}
                    onValueChange={(v) => update({ sortField: v as SortField })}
                  >
                    <SelectTrigger aria-label="Sort deals by" className="h-11 w-full min-w-[150px] rounded-xl border-white/10 bg-black/45 text-xs shadow-inner hover:border-amber-300/25 focus:ring-amber-300/30 sm:w-[170px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SORT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Toggle sort direction, currently ${filters.sortDirection === "asc" ? "ascending" : "descending"}`}
                    className="h-11 w-11 rounded-xl border-white/10 bg-black/45 p-0 hover:border-amber-300/30 hover:bg-amber-300/10"
                    onClick={() =>
                      update({
                        sortDirection:
                          filters.sortDirection === "asc" ? "desc" : "asc",
                      })
                    }
                    title={
                      filters.sortDirection === "asc"
                        ? "Ascending"
                        : "Descending"
                    }
                  >
                    <ArrowUpDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        filters.sortDirection === "asc" && "rotate-180",
                      )}
                    />
                  </Button>
                </div>
              </div>
            </div>

            {/* Active filter summary pills */}
            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-2.5 shadow-inner">
                <span className="text-[10px] text-muted-foreground">
                  Active:
                </span>
                {filters.dealType !== "all" && (
                  <Badge
                    variant="secondary"
                    className="gap-1 rounded-full border border-amber-300/25 bg-amber-300/10 pr-1 text-[10px] text-amber-100"
                  >
                    {
                      DEAL_TYPE_OPTIONS.find(
                        (o) => o.value === filters.dealType,
                      )?.shortLabel
                    }
                    <button
                      onClick={() => update({ dealType: "all" })}
                      aria-label="Remove deal type filter"
                      className="min-h-6 min-w-6 rounded-full hover:text-destructive"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                )}
                {filters.riskStatus !== "all" && (
                  <Badge
                    variant="secondary"
                    className="gap-1 rounded-full border border-amber-300/25 bg-amber-300/10 pr-1 text-[10px] text-amber-100"
                  >
                    {
                      RISK_OPTIONS.find((o) => o.value === filters.riskStatus)
                        ?.label
                    }
                    <button
                      onClick={() => update({ riskStatus: "all" })}
                      aria-label="Remove risk status filter"
                      className="min-h-6 min-w-6 rounded-full hover:text-destructive"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                )}
                {filters.responsiblePerson !== "all" && (
                  <Badge
                    variant="secondary"
                    className="gap-1 rounded-full border border-amber-300/25 bg-amber-300/10 pr-1 text-[10px] text-amber-100"
                  >
                    👤 {filters.responsiblePerson}
                    <button
                      onClick={() => update({ responsiblePerson: "all" })}
                      aria-label="Remove responsible person filter"
                      className="min-h-6 min-w-6 rounded-full hover:text-destructive"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                )}
                {filters.search && (
                  <Badge
                    variant="secondary"
                    className="gap-1 rounded-full border border-amber-300/25 bg-amber-300/10 pr-1 text-[10px] text-amber-100"
                  >
                    🔍 "{filters.search}"
                    <button
                      onClick={() => update({ search: "" })}
                      aria-label="Remove search filter"
                      className="min-h-6 min-w-6 rounded-full hover:text-destructive"
                    >
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
