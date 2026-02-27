import { useMemo } from 'react';
import { format, differenceInDays, startOfMonth, endOfMonth, eachMonthOfInterval, addMonths, subMonths, isWithinInterval } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  FunnelChart,
  Funnel,
  LabelList,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
  Target,
  Zap,
  AlertTriangle,
  BarChart3,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import type { DealWithClient } from '@/hooks/useAllDeals';

interface Props {
  deals: DealWithClient[];
  isLoading: boolean;
}

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
];

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(val);

const formatCurrencyShort = (val: number) => {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val}`;
};

// ─── SECTION: KPI Cards ───
function AnalyticsKPIs({ deals }: { deals: DealWithClient[] }) {
  const kpis = useMemo(() => {
    const totalValue = deals.reduce((s, d) => s + (d.total_contract_price || 0), 0);
    const avgValue = deals.length > 0 ? totalValue / deals.length : 0;

    // Commission estimates
    const totalCommission = deals.reduce((s, d) => {
      const payments = d.buildPayments || [];
      return s + payments.reduce((ps, p) => ps + (p.commission_amount || 0), 0);
    }, 0);
    const commissionReceived = deals.reduce((s, d) => {
      const payments = d.buildPayments || [];
      return s + payments.filter(p => p.commission_received).reduce((ps, p) => ps + (p.commission_amount || 0), 0);
    }, 0);

    // Deal velocity — avg days from creation to now (or completion)
    const ages = deals.map(d => differenceInDays(new Date(), new Date(d.created_at)));
    const avgAge = ages.length > 0 ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length) : 0;

    // Conversion: deals with stages where all are complete
    const completedDeals = deals.filter(d => {
      const stages = d.stages || [];
      return stages.length > 0 && stages.every(s => s.status === 'complete' || s.status === 'skipped');
    });
    const conversionRate = deals.length > 0 ? Math.round((completedDeals.length / deals.length) * 100) : 0;

    // Deals created in last 30 days
    const recentDeals = deals.filter(d => differenceInDays(new Date(), new Date(d.created_at)) <= 30).length;

    return { totalValue, avgValue, totalCommission, commissionReceived, avgAge, conversionRate, completedDeals: completedDeals.length, recentDeals };
  }, [deals]);

  const cards = [
    { label: 'Pipeline Value', value: formatCurrency(kpis.totalValue), icon: DollarSign, color: 'text-primary' },
    { label: 'Avg Deal Value', value: formatCurrency(kpis.avgValue), icon: Target, color: 'text-chart-1' },
    { label: 'Est. Commission', value: formatCurrency(kpis.totalCommission), sub: `${formatCurrency(kpis.commissionReceived)} received`, icon: TrendingUp, color: 'text-success' },
    { label: 'Avg Deal Age', value: `${kpis.avgAge} days`, icon: Clock, color: 'text-chart-6' },
    { label: 'Conversion Rate', value: `${kpis.conversionRate}%`, sub: `${kpis.completedDeals} settled`, icon: Zap, color: 'text-warning' },
    { label: 'New (30d)', value: String(kpis.recentDeals), icon: Activity, color: 'text-chart-4' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
      {cards.map(c => (
        <Card key={c.label}>
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

// ─── SECTION: Conversion Funnel ───
function ConversionFunnel({ deals }: { deals: DealWithClient[] }) {
  const funnelData = useMemo(() => {
    // Aggregate stage categories across all deals
    const categories = ['Onboarding', 'Advisory', 'Acquisition', 'Deposit', 'Finance', 'Legal', 'Finalised'];
    
    return categories.map((cat, i) => {
      // Count deals that have reached or passed this category
      const count = deals.filter(d => {
        const stages = d.stages || [];
        return stages.some(s => {
          const sCat = (s.stage_category || '').toLowerCase();
          const catLower = cat.toLowerCase();
          if (sCat === catLower || (catLower === 'acquisition' && sCat === 'land')) {
            return s.status === 'complete' || s.status === 'in_progress';
          }
          return false;
        });
      }).length;

      // Also include deals whose current stage number puts them at or past this category
      const byStageNum = deals.filter(d => d.current_stage_number >= (i + 1)).length;
      const finalCount = Math.max(count, byStageNum);

      return {
        name: cat,
        value: finalCount,
        fill: CHART_COLORS[i % CHART_COLORS.length],
      };
    });
  }, [deals]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <ArrowRight className="h-4 w-4 text-primary" />
          Conversion Funnel
        </CardTitle>
        <CardDescription className="text-xs">Deals reaching each pipeline stage</CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="space-y-2">
          {funnelData.map((item, i) => {
            const maxVal = funnelData[0]?.value || 1;
            const pct = maxVal > 0 ? Math.round((item.value / maxVal) * 100) : 0;
            return (
              <div key={item.name} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-20 shrink-0 text-right">{item.name}</span>
                <div className="flex-1 relative">
                  <div
                    className="h-7 rounded-md flex items-center px-2 transition-all duration-500"
                    style={{
                      width: `${Math.max(pct, 8)}%`,
                      backgroundColor: item.fill,
                      opacity: 0.85,
                    }}
                  >
                    <span className="text-[10px] font-bold text-white drop-shadow-sm">{item.value}</span>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground w-10 shrink-0">{pct}%</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── SECTION: Revenue Forecast ───
function RevenueForecast({ deals }: { deals: DealWithClient[] }) {
  const chartData = useMemo(() => {
    const now = new Date();
    const start = subMonths(startOfMonth(now), 3);
    const end = addMonths(endOfMonth(now), 6);
    const months = eachMonthOfInterval({ start, end });

    return months.map(month => {
      const monthEnd = endOfMonth(month);
      const monthStart = startOfMonth(month);
      const isPast = monthEnd < now;
      const isCurrent = isWithinInterval(now, { start: monthStart, end: monthEnd });

      // Settled value: deals with settlement_date in this month
      const settledValue = deals
        .filter(d => {
          if (!d.settlement_date) return false;
          const sd = new Date(d.settlement_date);
          return isWithinInterval(sd, { start: monthStart, end: monthEnd });
        })
        .reduce((s, d) => s + (d.total_contract_price || 0), 0);

      // Commission from build payments
      const commissionValue = deals
        .filter(d => {
          if (!d.settlement_date) return false;
          const sd = new Date(d.settlement_date);
          return isWithinInterval(sd, { start: monthStart, end: monthEnd });
        })
        .reduce((s, d) => {
          const payments = d.buildPayments || [];
          return s + payments.reduce((ps, p) => ps + (p.commission_amount || 0), 0);
        }, 0);

      return {
        month: format(month, 'MMM yy'),
        settled: isPast || isCurrent ? settledValue : undefined,
        projected: !isPast ? settledValue : undefined,
        commission: commissionValue,
      };
    });
  }, [deals]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4 text-success" />
          Revenue Forecast
        </CardTitle>
        <CardDescription className="text-xs">Settlement values & projected commission by month</CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="settledGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-4))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--chart-4))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="projectedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={formatCurrencyShort} className="text-muted-foreground" width={50} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                formatter={(value: number, name: string) => [formatCurrency(value), name === 'settled' ? 'Settled' : name === 'projected' ? 'Projected' : 'Commission']}
                labelStyle={{ fontWeight: 600, fontSize: 11 }}
              />
              <Area type="monotone" dataKey="settled" stroke="hsl(var(--chart-4))" fill="url(#settledGrad)" strokeWidth={2} connectNulls={false} />
              <Area type="monotone" dataKey="projected" stroke="hsl(var(--chart-1))" fill="url(#projectedGrad)" strokeWidth={2} strokeDasharray="5 3" connectNulls={false} />
              <Line type="monotone" dataKey="commission" stroke="hsl(var(--success))" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-4 mt-2">
          <div className="flex items-center gap-1.5 text-[10px]">
            <div className="w-3 h-0.5 rounded bg-chart-4" />
            <span className="text-muted-foreground">Settled</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <div className="w-3 h-0.5 rounded bg-chart-1 opacity-70" style={{ borderTop: '1px dashed' }} />
            <span className="text-muted-foreground">Projected</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <div className="w-3 h-0.5 rounded bg-success" />
            <span className="text-muted-foreground">Commission</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── SECTION: Stage Velocity ───
function StageVelocity({ deals }: { deals: DealWithClient[] }) {
  const velocityData = useMemo(() => {
    const stageMap: Record<string, { totalDays: number; count: number }> = {};

    for (const deal of deals) {
      const stages = deal.stages || [];
      for (const stage of stages) {
        if (stage.status === 'complete' && stage.completed_at && stage.started_at) {
          const days = differenceInDays(new Date(stage.completed_at), new Date(stage.started_at));
          if (days >= 0) {
            const name = stage.stage_name || `Stage ${stage.stage_number}`;
            if (!stageMap[name]) stageMap[name] = { totalDays: 0, count: 0 };
            stageMap[name].totalDays += days;
            stageMap[name].count += 1;
          }
        }
      }
    }

    return Object.entries(stageMap)
      .map(([name, data]) => ({
        name: name.length > 20 ? name.substring(0, 18) + '…' : name,
        fullName: name,
        avgDays: Math.round(data.totalDays / data.count),
        count: data.count,
      }))
      .sort((a, b) => b.avgDays - a.avgDays)
      .slice(0, 8);
  }, [deals]);

  if (velocityData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-chart-6" />
            Stage Velocity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 text-xs text-muted-foreground italic">
            No completed stage data available yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-chart-6" />
          Stage Velocity
        </CardTitle>
        <CardDescription className="text-xs">Average days to complete each stage</CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={velocityData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} className="text-muted-foreground" />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} width={110} className="text-muted-foreground" />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                formatter={(value: number) => [`${value} days avg`, 'Duration']}
              />
              <Bar dataKey="avgDays" fill="hsl(var(--chart-6))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── SECTION: Deal Type Breakdown ───
function DealTypeBreakdown({ deals }: { deals: DealWithClient[] }) {
  const data = useMemo(() => {
    const types: Record<string, { count: number; value: number }> = {};
    for (const d of deals) {
      const label = d.deal_type === 'house_and_land' ? 'House & Land' : d.deal_type === 'refinance' ? 'Refinance' : 'Existing Property';
      if (!types[label]) types[label] = { count: 0, value: 0 };
      types[label].count += 1;
      types[label].value += d.total_contract_price || 0;
    }
    return Object.entries(types).map(([name, data], i) => ({
      name,
      count: data.count,
      value: data.value,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [deals]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <BarChart3 className="h-4 w-4 text-chart-2" />
          Deal Type Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={3}
                dataKey="count"
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                formatter={(value: number, name: string, props: any) => [
                  `${value} deals · ${formatCurrency(props.payload.value)}`,
                  props.payload.name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {data.map(d => (
            <div key={d.name} className="flex items-center gap-1.5 text-[10px]">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
              <span className="text-muted-foreground">{d.name}</span>
              <Badge variant="secondary" className="text-[9px] h-4 px-1">{d.count}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── SECTION: Risk Distribution ───
function RiskDistribution({ deals }: { deals: DealWithClient[] }) {
  const data = useMemo(() => {
    const onTrack = deals.filter(d => d.risk_status === 'on_track').length;
    const followUp = deals.filter(d => d.risk_status === 'needs_follow_up').length;
    const urgent = deals.filter(d => d.risk_status === 'urgent').length;
    return [
      { name: 'On Track', value: onTrack, fill: 'hsl(var(--success))', emoji: '🟢' },
      { name: 'Follow-Up', value: followUp, fill: 'hsl(var(--warning))', emoji: '🟠' },
      { name: 'Urgent', value: urgent, fill: 'hsl(var(--destructive))', emoji: '🔴' },
    ];
  }, [deals]);

  const total = deals.length || 1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Risk Distribution
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 space-y-3">
        {data.map(item => (
          <div key={item.name} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5">
                <span>{item.emoji}</span>
                <span className="text-muted-foreground">{item.name}</span>
              </span>
              <span className="font-semibold">{item.value} <span className="text-muted-foreground font-normal">({Math.round((item.value / total) * 100)}%)</span></span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${(item.value / total) * 100}%`, backgroundColor: item.fill }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── SECTION: Monthly Deal Flow ───
function MonthlyDealFlow({ deals }: { deals: DealWithClient[] }) {
  const chartData = useMemo(() => {
    const now = new Date();
    const start = subMonths(startOfMonth(now), 5);
    const months = eachMonthOfInterval({ start, end: endOfMonth(now) });

    return months.map(month => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);

      const created = deals.filter(d =>
        isWithinInterval(new Date(d.created_at), { start: monthStart, end: monthEnd })
      ).length;

      const settled = deals.filter(d =>
        d.settlement_date && isWithinInterval(new Date(d.settlement_date), { start: monthStart, end: monthEnd })
      ).length;

      return {
        month: format(month, 'MMM'),
        created,
        settled,
      };
    });
  }, [deals]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <Activity className="h-4 w-4 text-chart-3" />
          Monthly Deal Flow
        </CardTitle>
        <CardDescription className="text-xs">Deals created vs settled per month</CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" allowDecimals={false} width={30} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
              />
              <Bar dataKey="created" name="Created" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="settled" name="Settled" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-4 mt-2">
          <div className="flex items-center gap-1.5 text-[10px]">
            <div className="w-2.5 h-2.5 rounded bg-chart-1" />
            <span className="text-muted-foreground">Created</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <div className="w-2.5 h-2.5 rounded bg-chart-4" />
            <span className="text-muted-foreground">Settled</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── SECTION: Top Responsible Persons ───
function ResponsibleLeaderboard({ deals }: { deals: DealWithClient[] }) {
  const leaders = useMemo(() => {
    const map: Record<string, { count: number; value: number; urgent: number }> = {};
    for (const d of deals) {
      const person = d.responsible_person || 'Unassigned';
      if (!map[person]) map[person] = { count: 0, value: 0, urgent: 0 };
      map[person].count += 1;
      map[person].value += d.total_contract_price || 0;
      if (d.risk_status === 'urgent') map[person].urgent += 1;
    }
    return Object.entries(map)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [deals]);

  const maxValue = leaders[0]?.value || 1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <Target className="h-4 w-4 text-primary" />
          By Responsible Person
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 space-y-2">
        {leaders.map((person, i) => (
          <div key={person.name} className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-muted-foreground w-4 text-right">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-medium truncate">{person.name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] text-muted-foreground">{person.count} deals</span>
                  {person.urgent > 0 && (
                    <Badge variant="destructive" className="text-[8px] h-3.5 px-1">
                      {person.urgent} 🔴
                    </Badge>
                  )}
                </div>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${(person.value / maxValue) * 100}%` }}
                />
              </div>
              <p className="text-[9px] text-muted-foreground mt-0.5 font-mono">{formatCurrency(person.value)}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── MAIN COMPONENT ───
export function PipelineAnalytics({ deals, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-64 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">No deals to analyse</p>
          <p className="text-xs text-muted-foreground mt-1">Create some deals to see pipeline analytics</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI Strip */}
      <AnalyticsKPIs deals={deals} />

      {/* Row 1: Forecast + Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueForecast deals={deals} />
        <ConversionFunnel deals={deals} />
      </div>

      {/* Row 2: Velocity + Deal Flow */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StageVelocity deals={deals} />
        <MonthlyDealFlow deals={deals} />
      </div>

      {/* Row 3: Type Breakdown + Risk + Leaderboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <DealTypeBreakdown deals={deals} />
        <RiskDistribution deals={deals} />
        <ResponsibleLeaderboard deals={deals} />
      </div>
    </div>
  );
}
