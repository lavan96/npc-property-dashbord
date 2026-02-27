import { useMemo, useState } from 'react';
import { format, differenceInDays, differenceInCalendarDays, addMonths, isPast } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  ShieldAlert,
  Clock,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Timer,
  TrendingDown,
  Eye,
  ArrowUpDown,
  Building2,
  Home,
  RefreshCw,
  Shield,
  CalendarClock,
  CircleDot,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { RISK_STATUS_CONFIG } from '@/components/clients/deal-tracker/types';
import type { DealWithClient } from '@/hooks/useAllDeals';

interface Props {
  deals: DealWithClient[];
  isLoading: boolean;
  onDealClick?: (deal: DealWithClient) => void;
}

type ClawbackFilter = 'all' | 'active' | 'expiring_soon' | 'expired' | 'safe';
type SortBy = 'expiry' | 'commission' | 'risk' | 'client';

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

// ─── Derived clawback data per deal ───
interface ClawbackDealInfo {
  deal: DealWithClient;
  clawbackExpiryDate: Date | null;
  clawbackPeriodMonths: number;
  isClawbackActive: boolean;
  daysRemaining: number | null;
  totalDaysInPeriod: number;
  progressPct: number; // % of clawback period elapsed (100% = safe)
  commissionAtRisk: number;
  commissionReceived: number;
  trailCommission: number;
  status: 'expired_safe' | 'active_critical' | 'active_warning' | 'active_ok' | 'no_clawback';
  statusLabel: string;
  statusColor: string;
}

function deriveClawbackInfo(deal: DealWithClient): ClawbackDealInfo {
  const raw = deal as any;
  const clawbackExpiryStr = raw.clawback_expiry_date;
  const clawbackPeriodMonths = raw.clawback_period_months || 0;
  const clawbackRiskActive = raw.clawback_risk_active ?? false;
  const commissionEstimate = raw.commission_estimate || 0;
  const trailCommission = raw.trail_commission || 0;

  // Calculate commission from build payments
  const payments = deal.buildPayments || [];
  const commissionFromPayments = payments.reduce((s, p) => s + (p.commission_amount || 0), 0);
  const commissionReceived = payments.filter(p => p.commission_received).reduce((s, p) => s + (p.commission_amount || 0), 0);
  const totalCommission = commissionEstimate || commissionFromPayments;

  let clawbackExpiryDate: Date | null = null;
  let daysRemaining: number | null = null;
  let progressPct = 0;
  let totalDaysInPeriod = 0;

  if (clawbackExpiryStr) {
    clawbackExpiryDate = new Date(clawbackExpiryStr);
    daysRemaining = differenceInCalendarDays(clawbackExpiryDate, new Date());
    
    // Calculate total period in days
    if (clawbackPeriodMonths > 0 && deal.settlement_date) {
      const settlementDate = new Date(deal.settlement_date);
      totalDaysInPeriod = differenceInCalendarDays(clawbackExpiryDate, settlementDate);
      const daysElapsed = totalDaysInPeriod - (daysRemaining || 0);
      progressPct = totalDaysInPeriod > 0 ? Math.min(100, Math.max(0, Math.round((daysElapsed / totalDaysInPeriod) * 100))) : 0;
    }
  } else if (clawbackPeriodMonths > 0 && deal.settlement_date) {
    // Derive expiry from settlement + period
    const settlementDate = new Date(deal.settlement_date);
    clawbackExpiryDate = addMonths(settlementDate, clawbackPeriodMonths);
    daysRemaining = differenceInCalendarDays(clawbackExpiryDate, new Date());
    totalDaysInPeriod = differenceInCalendarDays(clawbackExpiryDate, settlementDate);
    const daysElapsed = totalDaysInPeriod - (daysRemaining || 0);
    progressPct = totalDaysInPeriod > 0 ? Math.min(100, Math.max(0, Math.round((daysElapsed / totalDaysInPeriod) * 100))) : 0;
  }

  // Determine status
  let status: ClawbackDealInfo['status'] = 'no_clawback';
  let statusLabel = 'No Clawback';
  let statusColor = 'text-muted-foreground';

  if (clawbackExpiryDate) {
    if (daysRemaining !== null && daysRemaining < 0) {
      status = 'expired_safe';
      statusLabel = 'Period Ended';
      statusColor = 'text-success';
    } else if (daysRemaining !== null && daysRemaining <= 30) {
      status = 'active_critical';
      statusLabel = `${daysRemaining}d remaining`;
      statusColor = 'text-destructive';
    } else if (daysRemaining !== null && daysRemaining <= 90) {
      status = 'active_warning';
      statusLabel = `${daysRemaining}d remaining`;
      statusColor = 'text-warning';
    } else {
      status = 'active_ok';
      statusLabel = daysRemaining !== null ? `${daysRemaining}d remaining` : 'Active';
      statusColor = 'text-chart-6';
    }
  }

  if (clawbackRiskActive && status !== 'expired_safe') {
    status = 'active_critical';
    statusColor = 'text-destructive';
  }

  return {
    deal,
    clawbackExpiryDate,
    clawbackPeriodMonths,
    isClawbackActive: status === 'active_critical' || status === 'active_warning' || status === 'active_ok',
    daysRemaining,
    totalDaysInPeriod,
    progressPct,
    commissionAtRisk: totalCommission,
    commissionReceived,
    trailCommission,
    status,
    statusLabel,
    statusColor,
  };
}

// ─── KPI Cards ───
function ClawbackKPIs({ items }: { items: ClawbackDealInfo[] }) {
  const kpis = useMemo(() => {
    const activeDeals = items.filter(i => i.isClawbackActive);
    const criticalDeals = items.filter(i => i.status === 'active_critical');
    const warningDeals = items.filter(i => i.status === 'active_warning');
    const safeDeals = items.filter(i => i.status === 'expired_safe');
    const totalAtRisk = activeDeals.reduce((s, i) => s + i.commissionAtRisk, 0);
    const totalReceived = items.reduce((s, i) => s + i.commissionReceived, 0);
    const totalTrail = items.reduce((s, i) => s + i.trailCommission, 0);
    const avgDaysRemaining = activeDeals.length > 0
      ? Math.round(activeDeals.reduce((s, i) => s + (i.daysRemaining || 0), 0) / activeDeals.length)
      : 0;

    return { activeDeals: activeDeals.length, criticalDeals: criticalDeals.length, warningDeals: warningDeals.length, safeDeals: safeDeals.length, totalAtRisk, totalReceived, totalTrail, avgDaysRemaining };
  }, [items]);

  const cards = [
    {
      label: 'Commission at Risk',
      value: formatCurrency(kpis.totalAtRisk),
      sub: `${kpis.activeDeals} active deal${kpis.activeDeals !== 1 ? 's' : ''}`,
      icon: ShieldAlert,
      color: 'text-destructive',
      bgColor: 'bg-destructive/5',
    },
    {
      label: 'Critical (≤30d)',
      value: String(kpis.criticalDeals),
      sub: 'Immediate attention',
      icon: AlertTriangle,
      color: 'text-destructive',
      bgColor: 'bg-destructive/5',
    },
    {
      label: 'Warning (≤90d)',
      value: String(kpis.warningDeals),
      sub: 'Monitor closely',
      icon: Timer,
      color: 'text-warning',
      bgColor: 'bg-warning/5',
    },
    {
      label: 'Safe / Expired',
      value: String(kpis.safeDeals),
      sub: 'Past clawback period',
      icon: CheckCircle2,
      color: 'text-success',
      bgColor: 'bg-success/5',
    },
    {
      label: 'Avg Days Left',
      value: `${kpis.avgDaysRemaining}d`,
      sub: 'Active deals',
      icon: Clock,
      color: 'text-chart-6',
      bgColor: 'bg-chart-6/5',
    },
    {
      label: 'Trail Commission',
      value: formatCurrency(kpis.totalTrail),
      sub: `${formatCurrency(kpis.totalReceived)} received`,
      icon: TrendingDown,
      color: 'text-primary',
      bgColor: 'bg-primary/5',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
      {cards.map(c => (
        <Card key={c.label} className={c.bgColor}>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <c.icon className={cn('h-3.5 w-3.5', c.color)} />
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{c.label}</p>
            </div>
            <p className="text-lg sm:text-xl font-bold leading-tight">{c.value}</p>
            {c.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{c.sub}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Countdown Timer Visual ───
function CountdownRing({ daysRemaining, totalDays, status }: { daysRemaining: number; totalDays: number; status: string }) {
  const pct = totalDays > 0 ? Math.min(100, Math.max(0, ((totalDays - daysRemaining) / totalDays) * 100)) : 0;
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  const strokeColor = status === 'active_critical'
    ? 'stroke-destructive'
    : status === 'active_warning'
    ? 'stroke-warning'
    : 'stroke-success';

  return (
    <div className="relative w-11 h-11 shrink-0">
      <svg className="w-11 h-11 -rotate-90" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={radius} fill="none" className="stroke-muted" strokeWidth="3" />
        <circle
          cx="22" cy="22" r={radius}
          fill="none"
          className={cn(strokeColor, 'transition-all duration-700')}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[9px] font-bold leading-none">{daysRemaining}d</span>
      </div>
    </div>
  );
}

// ─── Deal Row with Expandable Detail ───
function ClawbackDealRow({ info, onDealClick }: { info: ClawbackDealInfo; onDealClick?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const deal = info.deal;
  const riskCfg = RISK_STATUS_CONFIG[deal.risk_status];

  const statusBadgeVariant = info.status === 'active_critical' ? 'destructive'
    : info.status === 'active_warning' ? 'warning'
    : info.status === 'expired_safe' ? 'success'
    : 'secondary';

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <TableRow className={cn(
        'group transition-colors',
        info.status === 'active_critical' && 'bg-destructive/3',
        info.status === 'active_warning' && 'bg-warning/3',
      )}>
        {/* Expand toggle */}
        <TableCell className="w-8 px-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </CollapsibleTrigger>
        </TableCell>

        {/* Client */}
        <TableCell className="cursor-pointer" onClick={onDealClick}>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{getDealTypeIcon(deal.deal_type)}</span>
            <span className="text-xs font-semibold truncate">{deal.client_name}</span>
            <Badge className={cn('text-[8px] px-1 py-0 h-3.5 border shrink-0', riskCfg.color)}>
              {riskCfg.emoji}
            </Badge>
          </div>
        </TableCell>

        {/* Status */}
        <TableCell>
          <Badge variant={statusBadgeVariant as any} className="text-[10px] gap-1">
            {info.status === 'active_critical' && <AlertTriangle className="h-2.5 w-2.5" />}
            {info.status === 'active_warning' && <Timer className="h-2.5 w-2.5" />}
            {info.status === 'expired_safe' && <CheckCircle2 className="h-2.5 w-2.5" />}
            {info.status === 'active_ok' && <Shield className="h-2.5 w-2.5" />}
            {info.statusLabel}
          </Badge>
        </TableCell>

        {/* Countdown */}
        <TableCell className="hidden sm:table-cell">
          {info.daysRemaining !== null && info.isClawbackActive ? (
            <CountdownRing
              daysRemaining={Math.max(0, info.daysRemaining)}
              totalDays={info.totalDaysInPeriod}
              status={info.status}
            />
          ) : info.status === 'expired_safe' ? (
            <span className="text-[10px] text-success font-medium">✅ Safe</span>
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </TableCell>

        {/* Commission at Risk */}
        <TableCell className="text-right">
          <span className={cn('text-xs font-mono font-semibold', info.isClawbackActive ? 'text-destructive' : 'text-muted-foreground')}>
            {info.commissionAtRisk > 0 ? formatCurrency(info.commissionAtRisk) : '—'}
          </span>
        </TableCell>

        {/* Expiry Date */}
        <TableCell className="hidden md:table-cell">
          {info.clawbackExpiryDate ? (
            <span className="text-xs text-muted-foreground">{format(info.clawbackExpiryDate, 'dd MMM yy')}</span>
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </TableCell>

        {/* Progress */}
        <TableCell className="hidden lg:table-cell w-[120px]">
          {info.isClawbackActive || info.status === 'expired_safe' ? (
            <div className="space-y-0.5">
              <Progress value={info.progressPct} className="h-1.5" />
              <span className="text-[9px] text-muted-foreground">{info.progressPct}% elapsed</span>
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </TableCell>

        {/* View */}
        <TableCell className="w-8">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={onDealClick}>
            <Eye className="h-3 w-3 text-primary" />
          </Button>
        </TableCell>
      </TableRow>

      {/* Expanded detail */}
      <TableRow className={cn(!expanded && 'hidden')}>
        <TableCell colSpan={8} className="bg-muted/30 p-0">
          <CollapsibleContent>
            <div className="px-4 py-3 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Settlement Date</p>
                  <p className="text-xs font-medium">{deal.settlement_date ? format(new Date(deal.settlement_date), 'dd MMM yyyy') : '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Clawback Period</p>
                  <p className="text-xs font-medium">{info.clawbackPeriodMonths > 0 ? `${info.clawbackPeriodMonths} months` : '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Commission Received</p>
                  <p className="text-xs font-medium">{info.commissionReceived > 0 ? formatCurrency(info.commissionReceived) : '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Trail Commission</p>
                  <p className="text-xs font-medium">{info.trailCommission > 0 ? formatCurrency(info.trailCommission) : '—'}</p>
                </div>
              </div>

              {/* Build payment commission breakdown */}
              {(deal.buildPayments || []).some(p => p.commission_amount > 0) && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Commission Stages</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(deal.buildPayments || [])
                      .filter(p => p.commission_amount > 0)
                      .map((p, i) => (
                        <Badge
                          key={p.id || i}
                          variant={p.commission_received ? 'success' : 'outline'}
                          className="text-[9px] gap-1"
                        >
                          {p.stage_name}: {formatCurrency(p.commission_amount)}
                          {p.commission_received && <CheckCircle2 className="h-2 w-2" />}
                        </Badge>
                      ))}
                  </div>
                </div>
              )}

              {deal.notes && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Notes</p>
                  <p className="text-xs text-muted-foreground">{deal.notes}</p>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </TableCell>
      </TableRow>
    </Collapsible>
  );
}

// ─── MAIN COMPONENT ───
export function ClawbackRiskMonitor({ deals, isLoading, onDealClick }: Props) {
  const [filter, setFilter] = useState<ClawbackFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('expiry');

  // Derive clawback info for all deals
  const allItems = useMemo(() => deals.map(deriveClawbackInfo), [deals]);

  // Filter
  const filteredItems = useMemo(() => {
    let result = allItems;

    switch (filter) {
      case 'active':
        result = result.filter(i => i.isClawbackActive);
        break;
      case 'expiring_soon':
        result = result.filter(i => i.status === 'active_critical' || i.status === 'active_warning');
        break;
      case 'expired':
        result = result.filter(i => i.status === 'expired_safe');
        break;
      case 'safe':
        result = result.filter(i => i.status === 'expired_safe' || i.status === 'no_clawback');
        break;
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'expiry': {
          const aVal = a.daysRemaining ?? Infinity;
          const bVal = b.daysRemaining ?? Infinity;
          return aVal - bVal;
        }
        case 'commission':
          return b.commissionAtRisk - a.commissionAtRisk;
        case 'risk': {
          const order: Record<string, number> = { active_critical: 0, active_warning: 1, active_ok: 2, expired_safe: 3, no_clawback: 4 };
          return (order[a.status] ?? 4) - (order[b.status] ?? 4);
        }
        case 'client':
          return (a.deal.client_name || '').localeCompare(b.deal.client_name || '');
        default:
          return 0;
      }
    });

    return result;
  }, [allItems, filter, sortBy]);

  // Items with active clawback for KPIs (unfiltered)
  const itemsWithClawback = useMemo(() => allItems.filter(i => i.status !== 'no_clawback'), [allItems]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <ClawbackKPIs items={itemsWithClawback} />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['all', 'active', 'expiring_soon', 'expired', 'safe'] as ClawbackFilter[]).map(f => {
            const labels: Record<ClawbackFilter, string> = {
              all: 'All Deals',
              active: '🔴 Active Risk',
              expiring_soon: '⚠️ Expiring Soon',
              expired: '✅ Period Ended',
              safe: '🛡️ Safe',
            };
            const counts: Record<ClawbackFilter, number> = {
              all: allItems.length,
              active: allItems.filter(i => i.isClawbackActive).length,
              expiring_soon: allItems.filter(i => i.status === 'active_critical' || i.status === 'active_warning').length,
              expired: allItems.filter(i => i.status === 'expired_safe').length,
              safe: allItems.filter(i => i.status === 'expired_safe' || i.status === 'no_clawback').length,
            };
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-medium transition-all',
                  filter === f
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                )}
              >
                {labels[f]}
                <Badge variant="secondary" className={cn('h-3.5 px-1 text-[8px] min-w-[14px]', filter === f && 'bg-primary-foreground/20 text-primary-foreground')}>
                  {counts[f]}
                </Badge>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Sort:</span>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="h-7 w-[140px] text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expiry" className="text-xs">Days Remaining</SelectItem>
              <SelectItem value="commission" className="text-xs">Commission at Risk</SelectItem>
              <SelectItem value="risk" className="text-xs">Risk Level</SelectItem>
              <SelectItem value="client" className="text-xs">Client Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Deals table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto max-w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 px-2" />
                  <TableHead className="whitespace-nowrap text-xs">Client</TableHead>
                  <TableHead className="whitespace-nowrap text-xs">Status</TableHead>
                  <TableHead className="whitespace-nowrap text-xs hidden sm:table-cell">Countdown</TableHead>
                  <TableHead className="whitespace-nowrap text-xs text-right">At Risk</TableHead>
                  <TableHead className="whitespace-nowrap text-xs hidden md:table-cell">Expiry</TableHead>
                  <TableHead className="whitespace-nowrap text-xs hidden lg:table-cell">Progress</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <Shield className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm font-medium">No deals match this filter</p>
                      <p className="text-xs text-muted-foreground mt-1">Try adjusting the filter above</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map(info => (
                    <ClawbackDealRow
                      key={info.deal.id}
                      info={info}
                      onDealClick={() => onDealClick?.(info.deal)}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Summary footer */}
      <div className="text-[10px] text-muted-foreground flex items-center gap-2">
        <ShieldAlert className="h-3 w-3" />
        <span>
          Showing {filteredItems.length} of {allItems.length} deals · 
          Clawback data sourced from deal settings and settlement dates
        </span>
      </div>
    </div>
  );
}
