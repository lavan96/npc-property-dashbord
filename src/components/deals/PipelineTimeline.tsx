import { useMemo, useState, useRef } from 'react';
import { format, differenceInDays, differenceInCalendarDays, addDays, startOfDay, min as minDate, max as maxDate, isWithinInterval, eachMonthOfInterval, startOfMonth, endOfMonth, isSameMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Building2,
  Home,
  RefreshCw,
  AlertTriangle,
  Clock,
  ChevronRight,
  CalendarDays,
  ZoomIn,
  ZoomOut,
  Milestone,
  Eye,
  CheckCircle2,
  Circle,
  ArrowRight,
  SkipForward,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RISK_STATUS_CONFIG } from '@/components/clients/deal-tracker/types';
import type { DealWithClient } from '@/hooks/useAllDeals';

interface Props {
  deals: DealWithClient[];
  isLoading: boolean;
  onDealClick?: (deal: DealWithClient) => void;
}

type ZoomLevel = 'weeks' | 'months' | 'quarters';
type SortBy = 'created' | 'settlement' | 'client' | 'risk' | 'progress';

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(val);

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

// Get the overall date range for a deal
function getDealDateRange(deal: DealWithClient): { start: Date; end: Date } {
  const dates: Date[] = [new Date(deal.created_at)];

  if (deal.settlement_date) dates.push(new Date(deal.settlement_date));
  if (deal.finance_clause_expiry) dates.push(new Date(deal.finance_clause_expiry));
  if (deal.land_settlement_date) dates.push(new Date(deal.land_settlement_date));
  if (deal.expected_build_start) dates.push(new Date(deal.expected_build_start));
  if (deal.estimated_completion) dates.push(new Date(deal.estimated_completion));

  const stages = deal.stages || [];
  for (const s of stages) {
    if (s.completed_at) dates.push(new Date(s.completed_at));
    if (s.started_at) dates.push(new Date(s.started_at));
  }

  // Ensure at least some span
  const start = minDate(dates);
  let end = maxDate(dates);
  if (differenceInCalendarDays(end, start) < 14) {
    end = addDays(start, 30);
  }

  return { start: startOfDay(start), end: startOfDay(end) };
}

// ─── Milestone markers ───
interface MilestoneMarker {
  date: Date;
  label: string;
  type: 'settlement' | 'finance' | 'build' | 'land' | 'stage';
  color: string;
  icon: React.ReactNode;
}

function getDealMilestones(deal: DealWithClient): MilestoneMarker[] {
  const markers: MilestoneMarker[] = [];

  if (deal.settlement_date) {
    markers.push({
      date: new Date(deal.settlement_date),
      label: `Settlement: ${format(new Date(deal.settlement_date), 'dd MMM')}`,
      type: 'settlement',
      color: 'bg-success',
      icon: <CheckCircle2 className="h-2.5 w-2.5" />,
    });
  }

  if (deal.finance_clause_expiry) {
    markers.push({
      date: new Date(deal.finance_clause_expiry),
      label: `Finance Expiry: ${format(new Date(deal.finance_clause_expiry), 'dd MMM')}`,
      type: 'finance',
      color: 'bg-warning',
      icon: <AlertTriangle className="h-2.5 w-2.5" />,
    });
  }

  if (deal.land_settlement_date) {
    markers.push({
      date: new Date(deal.land_settlement_date),
      label: `Land Settlement: ${format(new Date(deal.land_settlement_date), 'dd MMM')}`,
      type: 'land',
      color: 'bg-chart-1',
      icon: <Milestone className="h-2.5 w-2.5" />,
    });
  }

  if (deal.expected_build_start) {
    markers.push({
      date: new Date(deal.expected_build_start),
      label: `Build Start: ${format(new Date(deal.expected_build_start), 'dd MMM')}`,
      type: 'build',
      color: 'bg-chart-6',
      icon: <ArrowRight className="h-2.5 w-2.5" />,
    });
  }

  return markers;
}

// ─── Stage segment colors ───
const STAGE_STATUS_COLORS: Record<string, string> = {
  complete: 'bg-success',
  in_progress: 'bg-primary',
  pending: 'bg-muted-foreground/20',
  skipped: 'bg-muted-foreground/10',
};

// ─── Deal Row Component ───
function DealTimelineRow({
  deal,
  globalStart,
  globalEnd,
  totalDays,
  onClick,
}: {
  deal: DealWithClient;
  globalStart: Date;
  globalEnd: Date;
  totalDays: number;
  onClick?: () => void;
}) {
  const riskCfg = RISK_STATUS_CONFIG[deal.risk_status];
  const dealRange = getDealDateRange(deal);
  const milestones = getDealMilestones(deal);
  const stages = deal.stages || [];
  const completedStages = stages.filter(s => s.status === 'complete').length;
  const totalStages = stages.length;
  const progressPct = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;

  // Position calculations
  const startOffset = Math.max(0, differenceInCalendarDays(dealRange.start, globalStart));
  const dealSpan = Math.max(7, differenceInCalendarDays(dealRange.end, dealRange.start));
  const leftPct = (startOffset / totalDays) * 100;
  const widthPct = Math.min((dealSpan / totalDays) * 100, 100 - leftPct);

  // Today marker position within deal
  const today = new Date();
  const todayOffset = differenceInCalendarDays(today, dealRange.start);
  const todayPctInDeal = dealSpan > 0 ? (todayOffset / dealSpan) * 100 : 0;
  const isTodayInRange = todayPctInDeal >= 0 && todayPctInDeal <= 100;

  return (
    <div className="flex items-stretch border-b border-border/50 hover:bg-muted/30 transition-colors group min-h-[52px]">
      {/* Left panel: Deal info */}
      <div
        className={cn('w-[220px] sm:w-[260px] shrink-0 flex items-center gap-2 px-3 py-2 cursor-pointer border-r border-border/50')}
        onClick={onClick}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{getDealTypeIcon(deal.deal_type)}</span>
            <p className="text-xs font-semibold truncate leading-tight">{deal.client_name}</p>
            <Badge className={cn('text-[8px] px-1 py-0 h-3.5 border shrink-0', riskCfg.color)}>
              {riskCfg.emoji}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] text-muted-foreground">{getDealTypeLabel(deal.deal_type)}</span>
            <span className="text-[9px] text-muted-foreground">·</span>
            <span className="text-[9px] text-muted-foreground">S{deal.current_stage_number}</span>
            <span className="text-[9px] text-muted-foreground">·</span>
            <span className="text-[9px] font-medium">{progressPct}%</span>
          </div>
        </div>
        <Eye className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </div>

      {/* Right panel: Gantt bar */}
      <div className="flex-1 relative py-2 px-1 min-w-0">
        {/* Deal bar container */}
        <div
          className="absolute top-2 bottom-2 rounded-md overflow-hidden"
          style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 2)}%` }}
        >
          {/* Stage segments */}
          <TooltipProvider>
            <div className="h-full flex rounded-md overflow-hidden border border-border/30 shadow-sm">
              {stages.length > 0 ? (
                stages.map((stage, i) => {
                  const segWidth = 100 / stages.length;
                  return (
                    <Tooltip key={stage.id || i}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            'h-full transition-all relative',
                            STAGE_STATUS_COLORS[stage.status] || 'bg-muted',
                            i > 0 && 'border-l border-background/30',
                          )}
                          style={{ width: `${segWidth}%` }}
                        >
                          {stage.status === 'in_progress' && (
                            <div className="absolute inset-0 bg-primary/20 animate-pulse" />
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-[10px] max-w-[200px]">
                        <div className="space-y-0.5">
                          <p className="font-semibold">S{stage.stage_number}: {stage.stage_name}</p>
                          <p className="text-muted-foreground capitalize">{stage.status.replace('_', ' ')}</p>
                          {stage.status === 'complete' && stage.completed_at && (
                            <p className="text-muted-foreground">{format(new Date(stage.completed_at), 'dd MMM yy')}</p>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })
              ) : (
                <div className="h-full w-full bg-muted-foreground/15 rounded-md" />
              )}
            </div>
          </TooltipProvider>

          {/* Today indicator within bar */}
          {isTodayInRange && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-destructive z-10"
              style={{ left: `${todayPctInDeal}%` }}
            >
              <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-destructive" />
            </div>
          )}

          {/* Milestone markers */}
          <TooltipProvider>
            {milestones.map((m, i) => {
              const mOffset = differenceInCalendarDays(m.date, dealRange.start);
              const mPct = dealSpan > 0 ? (mOffset / dealSpan) * 100 : 0;
              if (mPct < 0 || mPct > 100) return null;
              return (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn('absolute top-0 bottom-0 flex items-end justify-center z-20')}
                      style={{ left: `${mPct}%` }}
                    >
                      <div className={cn('w-3 h-3 rounded-full border-2 border-background flex items-center justify-center text-white', m.color)}>
                        {m.icon}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[10px]">
                    {m.label}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}

// ─── Timeline Header (month grid) ───
function TimelineHeader({
  globalStart,
  globalEnd,
  totalDays,
}: {
  globalStart: Date;
  globalEnd: Date;
  totalDays: number;
}) {
  const months = eachMonthOfInterval({ start: globalStart, end: globalEnd });
  const today = new Date();
  const todayPct = (differenceInCalendarDays(today, globalStart) / totalDays) * 100;

  return (
    <div className="flex items-stretch border-b border-border sticky top-0 z-20 bg-card">
      {/* Label column */}
      <div className="w-[220px] sm:w-[260px] shrink-0 flex items-center px-3 py-1.5 border-r border-border/50">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Deal</span>
      </div>

      {/* Month columns */}
      <div className="flex-1 relative min-w-0">
        <div className="flex h-full">
          {months.map((month, i) => {
            const monthStart = i === 0 ? globalStart : startOfMonth(month);
            const monthEnd = i === months.length - 1 ? globalEnd : endOfMonth(month);
            const monthDays = differenceInCalendarDays(monthEnd, monthStart) + 1;
            const widthPct = (monthDays / totalDays) * 100;

            return (
              <div
                key={month.toISOString()}
                className={cn(
                  'flex items-center justify-center py-1.5 text-[10px] font-medium text-muted-foreground border-r border-border/30',
                  isSameMonth(today, month) && 'bg-primary/5 text-foreground font-semibold',
                )}
                style={{ width: `${widthPct}%` }}
              >
                {format(month, 'MMM yy')}
              </div>
            );
          })}
        </div>

        {/* Today line */}
        {todayPct >= 0 && todayPct <= 100 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-destructive/60 z-30"
            style={{ left: `${todayPct}%` }}
          >
            <div className="absolute -top-0 left-1/2 -translate-x-1/2 px-1 py-0 rounded-b bg-destructive text-[8px] text-destructive-foreground font-bold whitespace-nowrap">
              Today
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Legend ───
function TimelineLegend() {
  return (
    <div className="flex items-center gap-4 flex-wrap text-[10px] text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-2 rounded-sm bg-success" />
        <span>Complete</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-2 rounded-sm bg-primary" />
        <span>In Progress</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-2 rounded-sm bg-muted-foreground/20" />
        <span>Pending</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-2 rounded-sm bg-muted-foreground/10" />
        <span>Skipped</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-px h-3 bg-destructive" />
        <span>Today</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-success border border-background" />
        <span>Settlement</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-warning border border-background" />
        <span>Finance Expiry</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-chart-1 border border-background" />
        <span>Land Settlement</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-chart-6 border border-background" />
        <span>Build Start</span>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───
export function PipelineTimeline({ deals, isLoading, onDealClick }: Props) {
  const [sortBy, setSortBy] = useState<SortBy>('created');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sort deals
  const sortedDeals = useMemo(() => {
    const sorted = [...deals];
    const riskOrder: Record<string, number> = { urgent: 0, needs_follow_up: 1, on_track: 2 };

    switch (sortBy) {
      case 'settlement':
        sorted.sort((a, b) => {
          const aDate = a.settlement_date ? new Date(a.settlement_date).getTime() : Infinity;
          const bDate = b.settlement_date ? new Date(b.settlement_date).getTime() : Infinity;
          return aDate - bDate;
        });
        break;
      case 'client':
        sorted.sort((a, b) => (a.client_name || '').localeCompare(b.client_name || ''));
        break;
      case 'risk':
        sorted.sort((a, b) => (riskOrder[a.risk_status] ?? 2) - (riskOrder[b.risk_status] ?? 2));
        break;
      case 'progress':
        sorted.sort((a, b) => {
          const aPct = a.stages?.length ? a.stages.filter(s => s.status === 'complete').length / a.stages.length : 0;
          const bPct = b.stages?.length ? b.stages.filter(s => s.status === 'complete').length / b.stages.length : 0;
          return bPct - aPct;
        });
        break;
      case 'created':
      default:
        sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
    }
    return sorted;
  }, [deals, sortBy]);

  // Compute global date range across all deals
  const { globalStart, globalEnd, totalDays } = useMemo(() => {
    if (deals.length === 0) {
      const now = new Date();
      return { globalStart: addDays(now, -30), globalEnd: addDays(now, 90), totalDays: 120 };
    }

    let earliest = new Date();
    let latest = new Date();

    for (const deal of deals) {
      const range = getDealDateRange(deal);
      if (range.start < earliest) earliest = range.start;
      if (range.end > latest) latest = range.end;
    }

    // Add padding
    earliest = addDays(earliest, -7);
    latest = addDays(latest, 14);

    const days = Math.max(differenceInCalendarDays(latest, earliest), 30);
    return { globalStart: startOfDay(earliest), globalEnd: startOfDay(latest), totalDays: days };
  }, [deals]);

  // Summary stats
  const stats = useMemo(() => {
    const withSettlement = deals.filter(d => d.settlement_date);
    const upcoming = withSettlement.filter(d => {
      const days = differenceInDays(new Date(d.settlement_date!), new Date());
      return days >= 0 && days <= 30;
    });
    const overdue = withSettlement.filter(d => new Date(d.settlement_date!) < new Date());
    const financeExpiring = deals.filter(d => {
      if (!d.finance_clause_expiry) return false;
      const days = differenceInDays(new Date(d.finance_clause_expiry), new Date());
      return days >= 0 && days <= 14;
    });
    return { upcoming: upcoming.length, overdue: overdue.length, financeExpiring: financeExpiring.length };
  }, [deals]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-8 rounded-lg" />
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">No deals to display on timeline</p>
          <p className="text-xs text-muted-foreground mt-1">Create deals to visualise their lifecycle</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Alert badges */}
          {stats.upcoming > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1 border-success/40 text-success">
              <CheckCircle2 className="h-3 w-3" />
              {stats.upcoming} settling in 30d
            </Badge>
          )}
          {stats.overdue > 0 && (
            <Badge variant="destructive" className="text-[10px] gap-1">
              <AlertTriangle className="h-3 w-3" />
              {stats.overdue} overdue
            </Badge>
          )}
          {stats.financeExpiring > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1 border-warning/40 text-warning">
              <Clock className="h-3 w-3" />
              {stats.financeExpiring} finance expiring
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Sort:</span>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="h-7 w-[130px] text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created" className="text-xs">Date Created</SelectItem>
              <SelectItem value="settlement" className="text-xs">Settlement Date</SelectItem>
              <SelectItem value="client" className="text-xs">Client Name</SelectItem>
              <SelectItem value="risk" className="text-xs">Risk Status</SelectItem>
              <SelectItem value="progress" className="text-xs">Progress</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Legend */}
      <TimelineLegend />

      {/* Timeline chart */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin" ref={scrollRef}>
          <div style={{ minWidth: `${Math.max(800, totalDays * 4)}px` }}>
            {/* Header with month markers */}
            <TimelineHeader globalStart={globalStart} globalEnd={globalEnd} totalDays={totalDays} />

            {/* Deal rows */}
            <div>
              {sortedDeals.map(deal => (
                <DealTimelineRow
                  key={deal.id}
                  deal={deal}
                  globalStart={globalStart}
                  globalEnd={globalEnd}
                  totalDays={totalDays}
                  onClick={() => onDealClick?.(deal)}
                />
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Summary footer */}
      <div className="text-[10px] text-muted-foreground flex items-center gap-2">
        <CalendarDays className="h-3 w-3" />
        <span>
          Showing {deals.length} deal{deals.length !== 1 ? 's' : ''} from {format(globalStart, 'dd MMM yy')} to {format(globalEnd, 'dd MMM yy')} ({totalDays} days)
        </span>
      </div>
    </div>
  );
}
