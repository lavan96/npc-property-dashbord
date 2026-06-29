import { useMemo } from 'react';
import { format, differenceInDays, isPast } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Home,
  Layers3,
  RefreshCw,
  Siren,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RISK_STATUS_CONFIG } from '@/components/clients/deal-tracker/types';
import { DealLoadingState, NoResultsState } from '@/components/deals/DealStatePresentation';
import type { DealWithClient } from '@/hooks/useAllDeals';

interface Props {
  deals: DealWithClient[];
  allDeals?: DealWithClient[];
  isLoading: boolean;
  onDealClick?: (deal: DealWithClient) => void;
}

export function DealExecutiveSummary({ deals, allDeals, isLoading, onDealClick }: Props) {
  // Use allDeals for stats if provided (so KPIs reflect full pipeline), otherwise use deals
  const statsSource = allDeals || deals;

  const stats = useMemo(() => {
    const total = statsSource.length;
    const onTrack = statsSource.filter(d => d.risk_status === 'on_track').length;
    const needsFollowUp = statsSource.filter(d => d.risk_status === 'needs_follow_up').length;
    const urgent = statsSource.filter(d => d.risk_status === 'urgent').length;
    const totalValue = statsSource.reduce((sum, d) => sum + (d.total_contract_price || 0), 0);
    const upcomingSettlements = statsSource.filter(d => {
      if (!d.settlement_date) return false;
      const days = differenceInDays(new Date(d.settlement_date), new Date());
      return days >= 0 && days <= 30;
    }).length;
    return { total, onTrack, needsFollowUp, urgent, totalValue, upcomingSettlements };
  }, [statsSource]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(val);

  function getNextAction(deal: DealWithClient): string {
    const stages = deal.stages || [];
    const inProgress = stages.find(s => s.status === 'in_progress');
    if (inProgress) return inProgress.internal_action || inProgress.stage_name;
    const nextPending = stages.find(s => s.status === 'pending');
    if (nextPending) return nextPending.internal_action || nextPending.stage_name;
    return 'All complete';
  }

  function getDateUrgency(dateStr: string | null): 'overdue' | 'urgent' | 'warning' | 'ok' | null {
    if (!dateStr) return null;
    const days = differenceInDays(new Date(dateStr), new Date());
    if (isPast(new Date(dateStr))) return 'overdue';
    if (days <= 5) return 'urgent';
    if (days <= 14) return 'warning';
    return 'ok';
  }

  function getDealTypeIcon(type: string) {
    switch (type) {
      case 'house_and_land': return <Home className="h-3.5 w-3.5 text-primary" />;
      case 'refinance': return <RefreshCw className="h-3.5 w-3.5 text-primary" />;
      default: return <Building2 className="h-3.5 w-3.5 text-primary" />;
    }
  }

  function getDealTypeShortLabel(type: string) {
    switch (type) {
      case 'house_and_land': return 'H&L';
      case 'refinance': return 'Refi';
      default: return 'Existing';
    }
  }

  if (isLoading) {
    return (
      <DealLoadingState title="Loading executive summary" description="Assembling KPIs, risk signals and next actions from the current deal set." />
    );
  }

  const kpiCardClass = "overflow-hidden border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.10),rgba(24,24,27,0.84)_48%,rgba(0,0,0,0.88))] shadow-[0_18px_42px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.10)]";
  const kpiLabelClass = "text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400";

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
        <Card className={kpiCardClass}>
          <CardContent className="relative p-3 sm:p-4">
            <Layers3 className="mb-3 h-4 w-4 text-amber-200" />
            <p className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{stats.total}</p>
            <p className={kpiLabelClass}>Total Deals</p>
          </CardContent>
        </Card>
        <Card className={cn(kpiCardClass, 'border-emerald-300/20')}>
          <CardContent className="relative p-3 sm:p-4">
            <CheckCircle2 className="mb-3 h-4 w-4 text-emerald-300" />
            <p className="text-2xl font-bold tracking-tight text-emerald-300 sm:text-3xl">{stats.onTrack}</p>
            <p className={kpiLabelClass}>On Track</p>
          </CardContent>
        </Card>
        <Card className={cn(kpiCardClass, 'border-amber-300/25')}>
          <CardContent className="relative p-3 sm:p-4">
            <Clock3 className="mb-3 h-4 w-4 text-amber-300" />
            <p className="text-2xl font-bold tracking-tight text-amber-300 sm:text-3xl">{stats.needsFollowUp}</p>
            <p className={kpiLabelClass}>Follow-Up</p>
          </CardContent>
        </Card>
        <Card className={cn(kpiCardClass, 'border-red-300/25')}>
          <CardContent className="relative p-3 sm:p-4">
            <Siren className="mb-3 h-4 w-4 text-red-300" />
            <p className="text-2xl font-bold tracking-tight text-red-300 sm:text-3xl">{stats.urgent}</p>
            <p className={kpiLabelClass}>Urgent</p>
          </CardContent>
        </Card>
        <Card className={cn(kpiCardClass, 'col-span-2 border-amber-200/25 bg-[linear-gradient(145deg,rgba(251,191,36,0.18),rgba(24,24,27,0.88)_44%,rgba(0,0,0,0.9))] lg:col-span-1')}>
          <CardContent className="relative p-3 sm:p-4">
            <CircleDollarSign className="mb-3 h-4 w-4 text-amber-200" />
            <p className="text-2xl font-black tracking-[-0.04em] text-amber-100 sm:text-3xl lg:text-[1.65rem]">{formatCurrency(stats.totalValue)}</p>
            <p className={kpiLabelClass}>Pipeline Value</p>
          </CardContent>
        </Card>
        <Card className={kpiCardClass}>
          <CardContent className="relative p-3 sm:p-4">
            <CalendarClock className="mb-3 h-4 w-4 text-sky-200" />
            <p className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{stats.upcomingSettlements}</p>
            <p className={kpiLabelClass}>Settlements (30d)</p>
          </CardContent>
        </Card>
      </div>

      {/* Deal Table — filters now handled by parent toolbar */}
      <Card className="overflow-hidden rounded-[1.25rem] border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(9,9,11,0.92))] shadow-[0_20px_60px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.08)]">
        <CardContent className="p-0">
          <div className="max-w-full overflow-auto overscroll-contain [scrollbar-color:rgba(245,158,11,0.42)_rgba(24,24,27,0.78)] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-amber-300/40 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-900/70">
            <Table className="min-w-[880px]">
              <TableHeader className="bg-black/30">
                <TableRow className="border-amber-100/10 hover:bg-transparent">
                  <TableHead className="whitespace-nowrap py-4 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-100/80">Client</TableHead>
                  <TableHead className="whitespace-nowrap py-4 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-100/80">Type</TableHead>
                  <TableHead className="whitespace-nowrap py-4 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-100/80">Current Stage</TableHead>
                  <TableHead className="whitespace-nowrap py-4 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-100/80">Next Action</TableHead>
                  <TableHead className="whitespace-nowrap py-4 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-100/80">Responsible</TableHead>
                  <TableHead className="whitespace-nowrap py-4 text-right text-[11px] font-bold uppercase tracking-[0.16em] text-amber-100/80">Value</TableHead>
                  <TableHead className="whitespace-nowrap py-4 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-100/80">Settlement</TableHead>
                  <TableHead className="whitespace-nowrap py-4 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-100/80">Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.length === 0 ? (
                  <TableRow className="border-white/10">
                    <TableCell colSpan={8} className="p-4">
                      <NoResultsState title="No deals found" description="Your current search or filters do not return any deals. Reset filters to review the full pipeline." />
                    </TableCell>
                  </TableRow>
                ) : (
                  deals.map(deal => {
                    const riskCfg = RISK_STATUS_CONFIG[deal.risk_status];
                    const dateUrgency = getDateUrgency(deal.settlement_date);

                    return (
                      <TableRow key={deal.id} className={cn('border-white/10 transition-colors hover:bg-amber-300/10', onDealClick && 'cursor-pointer')} onClick={() => onDealClick?.(deal)}>
                        <TableCell className="whitespace-nowrap py-4 text-xs font-semibold text-white sm:text-sm">{deal.client_name}</TableCell>
                        <TableCell className="py-4">
                          <Badge variant="outline" className="gap-1.5 border-amber-200/20 bg-amber-100/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100">
                            {getDealTypeIcon(deal.deal_type)}
                            {getDealTypeShortLabel(deal.deal_type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="flex min-w-[150px] items-center gap-2">
                            <Badge variant="outline" className="border-sky-200/25 bg-sky-400/10 text-[10px] font-bold text-sky-100">S{deal.current_stage_number}</Badge>
                            <span className="max-w-[180px] truncate text-xs font-medium text-zinc-100 sm:text-sm">{deal.current_stage}</span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate py-4 text-xs text-zinc-300 sm:text-sm">
                          {getNextAction(deal)}
                        </TableCell>
                        <TableCell className="py-4 text-xs sm:text-sm">
                          {deal.responsible_person ? (
                            <span className="block max-w-[180px] break-words rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-medium leading-snug text-zinc-100">{deal.responsible_person}</span>
                          ) : (
                            <span className="rounded-full border border-dashed border-white/15 px-2 py-0.5 text-xs text-zinc-500">—</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-4 text-right text-xs font-bold text-amber-100 sm:text-sm">
                          {deal.total_contract_price ? formatCurrency(deal.total_contract_price) : <span className="rounded-full border border-dashed border-white/15 px-2 py-0.5 text-xs font-normal text-zinc-500">—</span>}
                        </TableCell>
                        <TableCell className="py-4">
                          {deal.settlement_date ? (
                            <div className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', dateUrgency === 'overdue' || dateUrgency === 'urgent' ? 'border-red-300/25 bg-red-400/10 text-red-100' : dateUrgency === 'warning' ? 'border-amber-300/25 bg-amber-400/10 text-amber-100' : 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100')}>
                              <span className="whitespace-nowrap">{format(new Date(deal.settlement_date), 'dd MMM yy')}</span>
                              {(dateUrgency === 'overdue' || dateUrgency === 'urgent') && (
                                <AlertTriangle className="h-3.5 w-3.5" />
                              )}
                            </div>
                          ) : (
                            <span className="rounded-full border border-dashed border-white/15 px-2 py-0.5 text-xs text-zinc-500">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-4">
                          <Badge className={cn('border px-2.5 py-1 text-[10px] font-bold whitespace-nowrap shadow-sm', riskCfg.color)}>
                            {riskCfg.emoji} <span>{riskCfg.label}</span>
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
