import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowUpRight, ArrowDownRight, Minus, CalendarRange, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, subDays, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subWeeks } from 'date-fns';

const PERIOD_OPTIONS = [
  { value: 'this_vs_last_7d', label: 'This 7 Days vs Previous 7 Days' },
  { value: 'this_vs_last_14d', label: 'This 14 Days vs Previous 14 Days' },
  { value: 'this_vs_last_30d', label: 'This 30 Days vs Previous 30 Days' },
  { value: 'this_vs_last_month', label: 'This Month vs Last Month' },
  { value: 'this_vs_last_week', label: 'This Week vs Last Week' },
];

function computeRanges(period: string): { current: { since: string; until: string }; previous: { since: string; until: string }; currentLabel: string; previousLabel: string } {
  const today = new Date();
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

  switch (period) {
    case 'this_vs_last_7d': {
      const cEnd = today;
      const cStart = subDays(today, 6);
      const pEnd = subDays(cStart, 1);
      const pStart = subDays(pEnd, 6);
      return { current: { since: fmt(cStart), until: fmt(cEnd) }, previous: { since: fmt(pStart), until: fmt(pEnd) }, currentLabel: 'Current 7 Days', previousLabel: 'Previous 7 Days' };
    }
    case 'this_vs_last_14d': {
      const cEnd = today;
      const cStart = subDays(today, 13);
      const pEnd = subDays(cStart, 1);
      const pStart = subDays(pEnd, 13);
      return { current: { since: fmt(cStart), until: fmt(cEnd) }, previous: { since: fmt(pStart), until: fmt(pEnd) }, currentLabel: 'Current 14 Days', previousLabel: 'Previous 14 Days' };
    }
    case 'this_vs_last_30d': {
      const cEnd = today;
      const cStart = subDays(today, 29);
      const pEnd = subDays(cStart, 1);
      const pStart = subDays(pEnd, 29);
      return { current: { since: fmt(cStart), until: fmt(cEnd) }, previous: { since: fmt(pStart), until: fmt(pEnd) }, currentLabel: 'Current 30 Days', previousLabel: 'Previous 30 Days' };
    }
    case 'this_vs_last_month': {
      const cStart = startOfMonth(today);
      const cEnd = today;
      const pStart = startOfMonth(subMonths(today, 1));
      const pEnd = endOfMonth(subMonths(today, 1));
      return { current: { since: fmt(cStart), until: fmt(cEnd) }, previous: { since: fmt(pStart), until: fmt(pEnd) }, currentLabel: format(cStart, 'MMMM'), previousLabel: format(pStart, 'MMMM') };
    }
    case 'this_vs_last_week': {
      const cStart = startOfWeek(today, { weekStartsOn: 1 });
      const cEnd = today;
      const pStart = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
      const pEnd = endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
      return { current: { since: fmt(cStart), until: fmt(cEnd) }, previous: { since: fmt(pStart), until: fmt(pEnd) }, currentLabel: 'This Week', previousLabel: 'Last Week' };
    }
    default:
      return computeRanges('this_vs_last_7d');
  }
}

function extractAction(actions: any[] | undefined, type: string): number {
  if (!actions) return 0;
  const action = actions.find((a: any) => a.action_type === type);
  return action ? Number(action.value) : 0;
}

function calcTotals(insights: any[]) {
  const t = { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, ctr: 0, cpc: 0, cpl: 0 };
  for (const row of insights) {
    t.spend += Number(row.spend || 0);
    t.impressions += Number(row.impressions || 0);
    t.clicks += Number(row.clicks || 0);
    t.reach += Number(row.reach || 0);
    t.leads += extractAction(row.actions, 'lead');
  }
  t.ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
  t.cpc = t.clicks > 0 ? t.spend / t.clicks : 0;
  t.cpl = t.leads > 0 ? t.spend / t.leads : 0;
  return t;
}

function formatCurrency(val: number) {
  return `$${val.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNum(val: number) {
  return val.toLocaleString('en-AU');
}

function formatPct(val: number) {
  return `${val.toFixed(2)}%`;
}

export function PeriodOverPeriodPanel() {
  const [period, setPeriod] = useState('this_vs_last_7d');
  const ranges = computeRanges(period);

  const { data: currentData, isLoading: currentLoading } = useQuery({
    queryKey: ['pop-current', ranges.current.since, ranges.current.until],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('fetch-meta-ads', {
        level: 'account',
        timeRange: ranges.current,
        limit: 1,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: previousData, isLoading: previousLoading } = useQuery({
    queryKey: ['pop-previous', ranges.previous.since, ranges.previous.until],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('fetch-meta-ads', {
        level: 'account',
        timeRange: ranges.previous,
        limit: 1,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = currentLoading || previousLoading;
  const currentTotals = currentData?.insights ? calcTotals(currentData.insights) : null;
  const previousTotals = previousData?.insights ? calcTotals(previousData.insights) : null;

  const metrics = [
    { key: 'spend', label: 'Spend', format: formatCurrency, lowerIsBetter: true },
    { key: 'impressions', label: 'Impressions', format: formatNum, lowerIsBetter: false },
    { key: 'clicks', label: 'Clicks', format: formatNum, lowerIsBetter: false },
    { key: 'ctr', label: 'CTR', format: formatPct, lowerIsBetter: false },
    { key: 'cpc', label: 'CPC', format: formatCurrency, lowerIsBetter: true },
    { key: 'reach', label: 'Reach', format: formatNum, lowerIsBetter: false },
    { key: 'leads', label: 'Leads', format: formatNum, lowerIsBetter: false },
    { key: 'cpl', label: 'Cost/Lead', format: formatCurrency, lowerIsBetter: true },
  ];

  const getDelta = (key: string) => {
    if (!currentTotals || !previousTotals) return null;
    const curr = (currentTotals as any)[key];
    const prev = (previousTotals as any)[key];
    if (prev === 0) return curr > 0 ? 100 : 0;
    return ((curr - prev) / prev) * 100;
  };

  // Chart data
  const chartData = metrics.filter(m => ['spend', 'clicks', 'leads'].includes(m.key)).map(m => {
    const curr = currentTotals ? (currentTotals as any)[m.key] : 0;
    const prev = previousTotals ? (previousTotals as any)[m.key] : 0;
    return { metric: m.label, [ranges.currentLabel]: curr, [ranges.previousLabel]: prev };
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarRange className="h-5 w-5 text-primary" />
              Period-over-Period
            </CardTitle>
            <CardDescription className="mt-1">Compare performance across time periods</CardDescription>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!isLoading && (
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-[10px] gap-1">
              <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
              {ranges.currentLabel}: {ranges.current.since} → {ranges.current.until}
            </Badge>
            <Badge variant="outline" className="text-[10px] gap-1">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: 'hsl(220, 70%, 55%)' }} />
              {ranges.previousLabel}: {ranges.previous.since} → {ranges.previous.until}
            </Badge>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Comparing periods...</span>
          </div>
        ) : !currentTotals || !previousTotals ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No data available for comparison
          </div>
        ) : (
          <div className="space-y-6">
            {/* Delta Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {metrics.map(m => {
                const delta = getDelta(m.key);
                const curr = (currentTotals as any)[m.key];
                const prev = (previousTotals as any)[m.key];
                const isPositive = delta !== null && ((m.lowerIsBetter && delta < 0) || (!m.lowerIsBetter && delta > 0));
                const isNegative = delta !== null && ((m.lowerIsBetter && delta > 0) || (!m.lowerIsBetter && delta < 0));

                return (
                  <div key={m.key} className="rounded-lg border border-border p-3 space-y-1.5">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{m.label}</p>
                    <p className="text-lg font-bold text-foreground">{m.format(curr)}</p>
                    <div className="flex items-center gap-1.5">
                      {delta !== null && Math.abs(delta) > 0.1 ? (
                        <>
                          {isPositive ? (
                            <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
                          ) : isNegative ? (
                            <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
                          ) : (
                            <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <span className={`text-xs font-mono font-medium ${
                            isPositive ? 'text-emerald-600 dark:text-emerald-400' :
                            isNegative ? 'text-red-600 dark:text-red-400' :
                            'text-muted-foreground'
                          }`}>
                            {delta > 0 ? '+' : ''}{delta?.toFixed(1)}%
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">No change</span>
                      )}
                      <span className="text-[10px] text-muted-foreground ml-auto">was {m.format(prev)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Visual Comparison Chart */}
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="metric" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey={ranges.currentLabel} stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 5 }} />
                  <Line type="monotone" dataKey={ranges.previousLabel} stroke="hsl(220, 70%, 55%)" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
