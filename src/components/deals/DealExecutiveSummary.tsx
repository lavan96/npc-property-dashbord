import { useMemo, useState } from 'react';
import { format, differenceInDays, isPast } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Building2,
  Home,
  Filter,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RISK_STATUS_CONFIG } from '@/components/clients/deal-tracker/types';
import type { DealWithClient } from '@/hooks/useAllDeals';

interface Props {
  deals: DealWithClient[];
  isLoading: boolean;
  onDealClick?: (deal: DealWithClient) => void;
}

export function DealExecutiveSummary({ deals, isLoading, onDealClick }: Props) {
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return deals.filter(d => {
      if (riskFilter !== 'all' && d.risk_status !== riskFilter) return false;
      if (typeFilter !== 'all' && d.deal_type !== typeFilter) return false;
      return true;
    });
  }, [deals, riskFilter, typeFilter]);

  const stats = useMemo(() => {
    const total = deals.length;
    const onTrack = deals.filter(d => d.risk_status === 'on_track').length;
    const needsFollowUp = deals.filter(d => d.risk_status === 'needs_follow_up').length;
    const urgent = deals.filter(d => d.risk_status === 'urgent').length;
    const totalValue = deals.reduce((sum, d) => sum + (d.total_contract_price || 0), 0);
    const upcomingSettlements = deals.filter(d => {
      if (!d.settlement_date) return false;
      const days = differenceInDays(new Date(d.settlement_date), new Date());
      return days >= 0 && days <= 30;
    }).length;
    return { total, onTrack, needsFollowUp, urgent, totalValue, upcomingSettlements };
  }, [deals]);

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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-20 sm:h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-xl sm:text-2xl font-bold">{stats.total}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Total Deals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-xl sm:text-2xl font-bold text-green-600">{stats.onTrack}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">🟢 On Track</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-xl sm:text-2xl font-bold text-amber-600">{stats.needsFollowUp}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">🟠 Follow-Up</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-xl sm:text-2xl font-bold text-red-600">{stats.urgent}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">🔴 Urgent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold">{formatCurrency(stats.totalValue)}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Pipeline Value</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-xl sm:text-2xl font-bold">{stats.upcomingSettlements}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Settlements (30d)</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-[140px] sm:w-[160px] h-8 text-xs">
            <SelectValue placeholder="Risk Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="on_track">🟢 On Track</SelectItem>
            <SelectItem value="needs_follow_up">🟠 Needs Follow-Up</SelectItem>
            <SelectItem value="urgent">🔴 Urgent</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px] sm:w-[180px] h-8 text-xs">
            <SelectValue placeholder="Deal Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="existing_property">Existing Property</SelectItem>
            <SelectItem value="house_and_land">House & Land</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} deals</span>
      </div>

      {/* Deal Table - scrollable on mobile */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto max-w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Client</TableHead>
                  <TableHead className="whitespace-nowrap">Type</TableHead>
                  <TableHead className="whitespace-nowrap">Current Stage</TableHead>
                  <TableHead className="whitespace-nowrap hidden sm:table-cell">Next Action</TableHead>
                  <TableHead className="whitespace-nowrap hidden sm:table-cell">Responsible</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Value</TableHead>
                  <TableHead className="whitespace-nowrap hidden md:table-cell">Settlement</TableHead>
                  <TableHead className="whitespace-nowrap">Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No deals found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(deal => {
                    const riskCfg = RISK_STATUS_CONFIG[deal.risk_status];
                    const dateUrgency = getDateUrgency(deal.settlement_date);
                    const isHnL = deal.deal_type === 'house_and_land';

                    return (
                      <TableRow key={deal.id} className={cn(onDealClick && 'cursor-pointer hover:bg-muted/50')} onClick={() => onDealClick?.(deal)}>
                        <TableCell className="font-medium text-xs sm:text-sm whitespace-nowrap">{deal.client_name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs">
                            {isHnL ? <Home className="h-3.5 w-3.5 text-primary" /> : <Building2 className="h-3.5 w-3.5 text-primary" />}
                            <span className="hidden sm:inline">{isHnL ? 'H&L' : 'Existing'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-[10px]">S{deal.current_stage_number}</Badge>
                            <span className="text-xs sm:text-sm truncate max-w-[100px] sm:max-w-none">{deal.current_stage}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm text-muted-foreground max-w-[200px] truncate hidden sm:table-cell">
                          {getNextAction(deal)}
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm hidden sm:table-cell">{deal.responsible_person || '—'}</TableCell>
                        <TableCell className="text-right text-xs sm:text-sm font-mono whitespace-nowrap">
                          {deal.total_contract_price ? formatCurrency(deal.total_contract_price) : '—'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {deal.settlement_date ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs sm:text-sm whitespace-nowrap">{format(new Date(deal.settlement_date), 'dd MMM yy')}</span>
                              {(dateUrgency === 'overdue' || dateUrgency === 'urgent') && (
                                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('text-[10px] border whitespace-nowrap', riskCfg.color)}>
                            {riskCfg.emoji} <span className="hidden sm:inline">{riskCfg.label}</span>
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
