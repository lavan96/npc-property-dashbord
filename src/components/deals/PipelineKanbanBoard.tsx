import { useMemo } from 'react';
import { differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Building2,
  Home,
  RefreshCw,
  AlertTriangle,
  Clock,
  DollarSign,
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
        'group relative cursor-pointer overflow-hidden rounded-[1.1rem] border border-white/10 border-l-[5px] bg-[radial-gradient(circle_at_12%_0%,rgba(251,191,36,0.16),transparent_30%),linear-gradient(145deg,rgba(255,255,255,0.09),rgba(24,24,27,0.94)_50%,rgba(0,0,0,0.76))] shadow-[0_14px_36px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.08)] outline-none transition-all duration-300 hover:-translate-y-1 hover:border-amber-200/55 hover:shadow-[0_24px_52px_rgba(0,0,0,0.38),0_0_0_1px_rgba(251,191,36,0.24),0_0_32px_rgba(245,158,11,0.18)] focus-visible:-translate-y-1 focus-visible:border-amber-200/70 focus-visible:ring-2 focus-visible:ring-amber-300/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        deal.risk_status === 'urgent' && 'border-l-destructive',
        deal.risk_status === 'needs_follow_up' && 'border-l-warning',
        deal.risk_status === 'on_track' && 'border-l-success',
      )}
      onClick={onClick}
      tabIndex={0}
      role="button"
    >
      <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/35 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <CardContent className="space-y-3.5 p-3.5">
        {/* Header: Client name + type */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="line-clamp-2 break-words text-[15px] font-bold leading-snug tracking-[-0.01em] text-zinc-50 drop-shadow-sm">{deal.client_name}</p>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="h-5 min-w-0 max-w-full gap-1 rounded-full border-white/15 bg-white/[0.055] px-2 py-0 text-[10px] font-semibold text-zinc-200 shadow-inner">
                <span className="shrink-0 text-amber-200">{getDealTypeIcon(deal.deal_type)}</span>
                <span className="truncate">{getDealTypeLabel(deal.deal_type)}</span>
              </Badge>
            </div>
          </div>
          <Badge className={cn('h-6 shrink-0 gap-1 rounded-full border px-2 py-0 text-[10px] font-bold shadow-[0_0_18px_rgba(255,255,255,0.08)]', riskCfg.color)}>
            <span className="text-xs leading-none">{riskCfg.emoji}</span>
            <span className="sr-only">{riskCfg.label}</span>
          </Badge>
        </div>

        {/* Current stage */}
        <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-amber-200/15 bg-amber-300/[0.055] px-2 py-1.5">
          <Badge variant="outline" className="h-5 shrink-0 rounded-md border-amber-200/35 bg-amber-300/15 px-1.5 text-[9px] font-black text-amber-100">
            S{deal.current_stage_number}
          </Badge>
          <span className="min-w-0 truncate text-[11px] font-semibold text-zinc-200">{deal.current_stage}</span>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/20 p-2 shadow-inner">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Progress</span>
            <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 font-mono text-[11px] font-black text-emerald-100">{progressPct}%</span>
          </div>
          <Progress value={progressPct} className="h-2.5 overflow-hidden rounded-full bg-zinc-900/95 shadow-[inset_0_1px_3px_rgba(0,0,0,0.55)] [&>div]:bg-gradient-to-r [&>div]:from-teal-400 [&>div]:via-emerald-400 [&>div]:to-amber-300 [&>div]:shadow-[0_0_14px_rgba(52,211,153,0.45)]" />
          <span className="block text-[9px] text-muted-foreground">{completedStages}/{totalStages} stages</span>
        </div>

        {/* Key metrics row */}
        <div className="flex items-center gap-2 flex-wrap">
          {deal.total_contract_price && (
            <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.045] px-2 py-1.5 text-[10px] text-muted-foreground">
              <div className="flex min-w-0 items-center gap-1">
                <DollarSign className="h-3 w-3 shrink-0 text-amber-200" />
                <span className="truncate font-mono text-[12px] font-black text-zinc-50">{formatCurrency(deal.total_contract_price)}</span>
              </div>
            </div>
          )}
          {settlementDays !== null && (
            <div className={cn(
              'flex items-center gap-0.5 text-[10px]',
              settlementDays < 0 && 'text-red-300 font-semibold',
              settlementDays >= 0 && settlementDays <= 7 && 'text-amber-300 font-medium',
              settlementDays > 7 && settlementDays <= 14 && 'text-amber-200',
              settlementDays > 14 && 'text-teal-300',
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
        <div className="space-y-1.5 border-t border-white/10 pt-2">
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.035] px-2 py-1">
            <Megaphone className={cn("h-2.5 w-2.5 shrink-0", deal.leadSource ? "text-amber-200" : "text-zinc-500")} />
            <span className={cn("truncate text-[10px] font-medium", deal.leadSource ? "text-amber-100" : "text-zinc-500")}>
              {deal.leadSource || "Source not recorded"}
            </span>
          </div>
          {nextAction && (
            <p className="line-clamp-2 break-words rounded-lg border border-white/10 bg-black/15 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
              <span className="font-bold text-zinc-200">Next:</span> {nextAction}
            </p>
          )}
        </div>

        {/* Footer: responsible + age */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-[9px] text-muted-foreground pt-0.5">
          <div className="flex min-w-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.035] px-2 py-1">
            {deal.responsible_person ? (
              <>
                <User className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate break-all">{deal.responsible_person}</span>
              </>
            ) : (
              <span className="italic">Unassigned</span>
            )}
          </div>
          <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 font-semibold">{ageInDays}d old</span>
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
    <div className="flex min-w-[300px] max-w-[300px] shrink-0 flex-col xl:min-w-[320px] xl:max-w-[320px]">
      {/* Column header */}
      <div className={cn('relative overflow-hidden rounded-t-[1.2rem] border border-b-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.095),rgba(39,39,42,0.88)_44%,rgba(0,0,0,0.72))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] border-t-4', column.color)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{column.icon}</span>
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-100">{column.label}</h3>
          </div>
          <div className="flex items-center gap-1">
            {urgentCount > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="destructive" className="h-5 px-1.5 text-[9px] shadow-[0_0_18px_rgba(239,68,68,0.24)]">
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
            <Badge variant="secondary" className="h-6 rounded-full border border-amber-200/20 bg-amber-300/15 px-2 text-[10px] font-bold text-amber-100">
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
      <div className="min-h-[260px] flex-1 rounded-b-[1.2rem] border border-t-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(0,0,0,0.22))] shadow-[inset_0_18px_34px_rgba(0,0,0,0.18)]">
        <div className="h-[calc(100vh-360px)] min-h-[260px] overflow-y-auto p-2.5 pr-2 [scrollbar-color:rgba(245,158,11,0.45)_rgba(24,24,27,0.75)] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-amber-300/35 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-900/70">
          <div className="space-y-2.5">
            {deals.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center rounded-[1rem] border border-dashed border-amber-200/15 bg-white/[0.025] px-4 text-center text-[11px] text-zinc-500">
                <span className="text-lg opacity-60">{column.icon}</span>
                <span className="mt-1 font-medium not-italic">No active deals</span>
                <span className="mt-0.5 text-[10px]">Stage ready for the next opportunity.</span>
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
        </div>
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

  // Keep every configured stage visible, including empty stages.
  const activeColumns = KANBAN_COLUMNS;

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
      <div className="flex flex-wrap items-center gap-3 rounded-[1.1rem] border border-amber-200/15 bg-[linear-gradient(135deg,rgba(251,191,36,0.10),rgba(255,255,255,0.035)_42%,rgba(0,0,0,0.18))] px-4 py-3 text-xs text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
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
      <div className="-mx-3 overflow-x-auto px-3 pb-5 [scrollbar-color:rgba(245,158,11,0.50)_rgba(24,24,27,0.85)] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border [&::-webkit-scrollbar-thumb]:border-zinc-950 [&::-webkit-scrollbar-thumb]:bg-gradient-to-r [&::-webkit-scrollbar-thumb]:from-amber-500/70 [&::-webkit-scrollbar-thumb]:to-amber-200/55 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-900/90 sm:-mx-6 sm:px-6">
        <div className="flex items-start gap-5 pr-6">
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
