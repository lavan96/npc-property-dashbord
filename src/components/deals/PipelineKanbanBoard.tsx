import { useMemo, useState } from 'react';
import { format, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Building2,
  Home,
  RefreshCw,
  AlertTriangle,
  Clock,
  DollarSign,
  GripVertical,
  ChevronRight,
  User,
  Eye,
  Megaphone,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { RISK_STATUS_CONFIG } from '@/components/clients/deal-tracker/types';
import type { DealWithClient } from '@/hooks/useAllDeals';

interface Props {
  deals: DealWithClient[];
  isLoading: boolean;
  onDealClick?: (deal: DealWithClient) => void;
}

/** Kanban columns derived from stage_category of deals' current stages */
const KANBAN_COLUMNS = [
  { id: 'onboarding', label: 'Onboarding', icon: '📋', color: 'border-t-chart-3' },
  { id: 'advisory', label: 'Advisory', icon: '🧭', color: 'border-t-chart-1' },
  { id: 'acquisition', label: 'Acquisition', icon: '🏠', color: 'border-t-primary' },
  { id: 'deposit', label: 'Deposit', icon: '💰', color: 'border-t-warning' },
  { id: 'finance', label: 'Finance', icon: '🏦', color: 'border-t-chart-6' },
  { id: 'legal', label: 'Legal', icon: '⚖️', color: 'border-t-chart-4' },
  { id: 'construction', label: 'Construction', icon: '🔨', color: 'border-t-chart-2' },
  { id: 'finalised', label: 'Finalised', icon: '✅', color: 'border-t-success' },
];

function getColumnForDeal(deal: DealWithClient): string {
  // Find the current stage's category from the deal's stages array
  const stages = deal.stages || [];
  const currentStage = stages.find(s => s.status === 'in_progress')
    || stages.find(s => s.status === 'pending');
  
  if (currentStage?.stage_category) {
    const cat = currentStage.stage_category.toLowerCase();
    const match = KANBAN_COLUMNS.find(c => c.id === cat);
    if (match) return match.id;
    // Handle "Land" category mapping to acquisition
    if (cat === 'land') return 'acquisition';
  }

  // Fallback: check if all stages complete
  const allComplete = stages.length > 0 && stages.every(s => s.status === 'complete' || s.status === 'skipped');
  if (allComplete) return 'finalised';

  // Infer from stage name/number
  if (deal.current_stage_number <= 1) return 'onboarding';
  if (deal.current_stage_number <= 2) return 'advisory';
  return 'finance';
}

function getDealTypeIcon(type: string) {
  switch (type) {
    case 'house_and_land': return <Home className="h-3 w-3" />;
    case 'refinance': return <RefreshCw className="h-3 w-3" />;
    default: return <Building2 className="h-3 w-3" />;
  }
}

function getDealTypeLabel(type: string) {
  switch (type) {
    case 'house_and_land': return 'H&L';
    case 'refinance': return 'Refi';
    default: return 'Existing';
  }
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(val);

function DealCard({ deal, onClick }: { deal: DealWithClient; onClick?: () => void }) {
  const riskCfg = RISK_STATUS_CONFIG[deal.risk_status];
  const stages = deal.stages || [];
  const completedStages = stages.filter(s => s.status === 'complete').length;
  const totalStages = stages.length;
  const progressPct = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;

  const ageInDays = differenceInDays(new Date(), new Date(deal.created_at));

  const nextAction = useMemo(() => {
    const inProgress = stages.find(s => s.status === 'in_progress');
    if (inProgress) return inProgress.internal_action || inProgress.stage_name;
    const pending = stages.find(s => s.status === 'pending');
    if (pending) return pending.internal_action || pending.stage_name;
    return null;
  }, [stages]);

  const settlementDays = deal.settlement_date
    ? differenceInDays(new Date(deal.settlement_date), new Date())
    : null;

  return (
    <Card
      className={cn(
        'cursor-pointer hover:shadow-md transition-all duration-200 group border-l-2',
        deal.risk_status === 'urgent' && 'border-l-destructive',
        deal.risk_status === 'needs_follow_up' && 'border-l-warning',
        deal.risk_status === 'on_track' && 'border-l-success',
      )}
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-2">
        {/* Header: Client name + type */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate leading-tight">{deal.client_name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-muted-foreground">{getDealTypeIcon(deal.deal_type)}</span>
              <span className="text-[10px] text-muted-foreground font-medium">{getDealTypeLabel(deal.deal_type)}</span>
            </div>
          </div>
          <Badge className={cn('text-[9px] px-1.5 py-0 h-4 border shrink-0', riskCfg.color)}>
            {riskCfg.emoji}
          </Badge>
        </div>

        {/* Current stage */}
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[9px] px-1 h-4 shrink-0">
            S{deal.current_stage_number}
          </Badge>
          <span className="text-[11px] text-muted-foreground truncate">{deal.current_stage}</span>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <Progress value={progressPct} className="h-1.5" />
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-muted-foreground">{completedStages}/{totalStages} stages</span>
            <span className="text-[9px] font-medium">{progressPct}%</span>
          </div>
        </div>

        {/* Key metrics row */}
        <div className="flex items-center gap-2 flex-wrap">
          {deal.total_contract_price && (
            <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <DollarSign className="h-2.5 w-2.5" />
              <span className="font-mono">{formatCurrency(deal.total_contract_price)}</span>
            </div>
          )}
          {settlementDays !== null && (
            <div className={cn(
              'flex items-center gap-0.5 text-[10px]',
              settlementDays < 0 && 'text-destructive font-semibold',
              settlementDays >= 0 && settlementDays <= 7 && 'text-destructive',
              settlementDays > 7 && settlementDays <= 14 && 'text-warning',
              settlementDays > 14 && 'text-muted-foreground',
            )}>
              <Clock className="h-2.5 w-2.5" />
              <span>
                {settlementDays < 0
                  ? `${Math.abs(settlementDays)}d overdue`
                  : `${settlementDays}d to settle`}
              </span>
            </div>
          )}
        </div>

        {/* Lead source + Next action */}
        <div className="pt-1.5 border-t border-border/50 space-y-0.5">
          {deal.leadSource && (
            <div className="flex items-center gap-1">
              <Megaphone className="h-2.5 w-2.5 text-primary shrink-0" />
              <span className="text-[10px] text-primary font-medium truncate">{deal.leadSource}</span>
            </div>
          )}
          {nextAction && (
            <p className="text-[10px] text-muted-foreground truncate">
              <span className="font-medium">Next:</span> {nextAction}
            </p>
          )}
        </div>

        {/* Footer: responsible + age */}
        <div className="flex items-center justify-between text-[9px] text-muted-foreground pt-0.5">
          <div className="flex items-center gap-1 truncate">
            {deal.responsible_person ? (
              <>
                <User className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{deal.responsible_person}</span>
              </>
            ) : (
              <span className="italic">Unassigned</span>
            )}
          </div>
          <span className="shrink-0">{ageInDays}d old</span>
        </div>

        {/* Hover reveal */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-end -mt-1">
          <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5 gap-0.5 text-primary">
            <Eye className="h-2.5 w-2.5" />
            View
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function KanbanColumn({
  column,
  deals,
  totalValue,
  onDealClick,
}: {
  column: (typeof KANBAN_COLUMNS)[0];
  deals: DealWithClient[];
  totalValue: number;
  onDealClick?: (deal: DealWithClient) => void;
}) {
  const urgentCount = deals.filter(d => d.risk_status === 'urgent').length;

  return (
    <div className="flex flex-col min-w-[260px] max-w-[300px] w-full shrink-0">
      {/* Column header */}
      <div className={cn('rounded-t-lg border border-b-0 bg-card p-2.5 border-t-4', column.color)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{column.icon}</span>
            <h3 className="text-xs font-semibold">{column.label}</h3>
          </div>
          <div className="flex items-center gap-1">
            {urgentCount > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="destructive" className="text-[9px] h-4 px-1">
                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                      {urgentCount}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {urgentCount} urgent deal{urgentCount !== 1 ? 's' : ''}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
              {deals.length}
            </Badge>
          </div>
        </div>
        {totalValue > 0 && (
          <p className="text-[10px] text-muted-foreground mt-1 font-mono">
            {formatCurrency(totalValue)}
          </p>
        )}
      </div>

      {/* Cards container */}
      <div className="flex-1 rounded-b-lg border border-t-0 bg-muted/30 min-h-[200px]">
        <ScrollArea className="h-[calc(100vh-340px)] min-h-[200px]">
          <div className="p-2 space-y-2">
            {deals.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-[11px] text-muted-foreground italic">
                No deals
              </div>
            ) : (
              deals.map(deal => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  onClick={() => onDealClick?.(deal)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

export function PipelineKanbanBoard({ deals, isLoading, onDealClick }: Props) {
  const columns = useMemo(() => {
    const grouped: Record<string, DealWithClient[]> = {};
    for (const col of KANBAN_COLUMNS) {
      grouped[col.id] = [];
    }

    for (const deal of deals) {
      const colId = getColumnForDeal(deal);
      if (grouped[colId]) {
        grouped[colId].push(deal);
      } else {
        // Fallback to first column
        grouped[KANBAN_COLUMNS[0].id].push(deal);
      }
    }

    // Sort within each column: urgent first, then by stage number
    for (const colId of Object.keys(grouped)) {
      grouped[colId].sort((a, b) => {
        const riskOrder: Record<string, number> = { urgent: 0, needs_follow_up: 1, on_track: 2 };
        const riskDiff = (riskOrder[a.risk_status] ?? 2) - (riskOrder[b.risk_status] ?? 2);
        if (riskDiff !== 0) return riskDiff;
        return a.current_stage_number - b.current_stage_number;
      });
    }

    return grouped;
  }, [deals]);

  // Filter out empty columns that aren't relevant
  const activeColumns = useMemo(() => {
    return KANBAN_COLUMNS.filter(col => {
      // Always show columns that have deals
      if (columns[col.id]?.length > 0) return true;
      // Show core columns even if empty
      return ['onboarding', 'finance', 'legal', 'finalised'].includes(col.id);
    });
  }, [columns]);

  // Summary stats
  const stats = useMemo(() => {
    const urgent = deals.filter(d => d.risk_status === 'urgent').length;
    const totalValue = deals.reduce((s, d) => s + (d.total_contract_price || 0), 0);
    return { urgent, totalValue };
  }, [deals]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="min-w-[260px] space-y-2">
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-32 rounded-lg" />
              <Skeleton className="h-32 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Board summary bar */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{deals.length} deal{deals.length !== 1 ? 's' : ''} across {activeColumns.length} stages</span>
        <span className="text-border">|</span>
        <span className="font-mono">{formatCurrency(stats.totalValue)} pipeline value</span>
        {stats.urgent > 0 && (
          <>
            <span className="text-border">|</span>
            <span className="text-destructive font-medium flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {stats.urgent} urgent
            </span>
          </>
        )}
      </div>

      {/* Kanban board - horizontal scroll */}
      <div className="overflow-x-auto scrollbar-thin -mx-3 sm:-mx-6 px-3 sm:px-6 pb-4">
        <div className="flex gap-3 items-start">
          {activeColumns.map(col => (
            <KanbanColumn
              key={col.id}
              column={col}
              deals={columns[col.id] || []}
              totalValue={(columns[col.id] || []).reduce((s, d) => s + (d.total_contract_price || 0), 0)}
              onDealClick={onDealClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
