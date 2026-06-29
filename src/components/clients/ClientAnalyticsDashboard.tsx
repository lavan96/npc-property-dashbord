import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';
import {
  Building2,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Percent,
  AlertCircle,
  CheckCircle,
  Clock3,
  Info,
  XCircle,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Client {
  id: string;
  total_portfolio_value: number;
  total_debt: number;
  net_monthly_cash_flow: number;
  client_properties?: { id: string }[];
  ghl_sync_status: string | null;
}

interface ClientAnalyticsDashboardProps {
  clients: Client[];
}

const CHART_PALETTE = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
];

export function ClientAnalyticsDashboard({ clients }: ClientAnalyticsDashboardProps) {
  const analytics = useMemo(() => {
    const totalPortfolioValue = clients.reduce((sum, c) => sum + (Number(c.total_portfolio_value) || 0), 0);
    const totalDebt = clients.reduce((sum, c) => sum + (Number(c.total_debt) || 0), 0);
    const totalCashFlow = clients.reduce((sum, c) => sum + (Number(c.net_monthly_cash_flow) || 0), 0);
    const totalProperties = clients.reduce((sum, c) => sum + (c.client_properties?.length || 0), 0);

    const positiveCashFlowClients = clients.filter((c) => Number(c.net_monthly_cash_flow) >= 0).length;
    const negativeCashFlowClients = clients.filter((c) => Number(c.net_monthly_cash_flow) < 0).length;
    const avgLTV = totalPortfolioValue > 0 ? (totalDebt / totalPortfolioValue) * 100 : 0;

    const portfolioDistribution = [
      { name: '< $500K', value: clients.filter((c) => Number(c.total_portfolio_value) < 500000).length },
      { name: '$500K-$1M', value: clients.filter((c) => Number(c.total_portfolio_value) >= 500000 && Number(c.total_portfolio_value) < 1000000).length },
      { name: '$1M-$2M', value: clients.filter((c) => Number(c.total_portfolio_value) >= 1000000 && Number(c.total_portfolio_value) < 2000000).length },
      { name: '$2M-$5M', value: clients.filter((c) => Number(c.total_portfolio_value) >= 2000000 && Number(c.total_portfolio_value) < 5000000).length },
      { name: '$5M+', value: clients.filter((c) => Number(c.total_portfolio_value) >= 5000000).length },
    ].filter((d) => d.value > 0);

    const propertyDistribution = [
      { name: '0 props', value: clients.filter((c) => (c.client_properties?.length || 0) === 0).length },
      { name: '1 prop', value: clients.filter((c) => (c.client_properties?.length || 0) === 1).length },
      { name: '2-3 props', value: clients.filter((c) => (c.client_properties?.length || 0) >= 2 && (c.client_properties?.length || 0) <= 3).length },
      { name: '4-5 props', value: clients.filter((c) => (c.client_properties?.length || 0) >= 4 && (c.client_properties?.length || 0) <= 5).length },
      { name: '6+ props', value: clients.filter((c) => (c.client_properties?.length || 0) >= 6).length },
    ].filter((d) => d.value > 0);

    const syncedCount = clients.filter((c) => c.ghl_sync_status === 'synced').length;
    const pendingCount = clients.filter((c) => c.ghl_sync_status === 'pending' || !c.ghl_sync_status).length;
    const errorCount = clients.filter((c) => c.ghl_sync_status === 'error').length;

    return {
      totalPortfolioValue,
      totalDebt,
      totalCashFlow,
      totalProperties,
      avgLTV,
      positiveCashFlowClients,
      negativeCashFlowClients,
      portfolioDistribution,
      propertyDistribution,
      cashFlowData: [
        { name: 'Positive', value: positiveCashFlowClients, color: 'hsl(var(--success))' },
        { name: 'Negative', value: negativeCashFlowClients, color: 'hsl(var(--destructive))' },
      ],
      syncedCount,
      pendingCount,
      errorCount,
    };
  }, [clients]);

  const formatCurrency = (value: number) => {
    if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  const summaryIconClass = {
    info: 'bg-info/12 text-info',
    success: 'bg-success/12 text-success',
    accent: 'bg-accent/12 text-accent',
  } as const;
  const chartTooltipStyle = {
    border: '1px solid rgba(245, 158, 11, 0.22)',
    borderRadius: '14px',
    background: 'hsl(var(--card) / 0.98)',
    boxShadow: '0 18px 44px rgba(0, 0, 0, 0.42)',
    color: 'hsl(var(--foreground))',
  };
  const chartLabelStyle = {
    color: 'hsl(var(--primary))',
    fontWeight: 700,
  };
  const chartItemStyle = {
    color: 'hsl(var(--foreground))',
    fontWeight: 600,
  };

  const syncStatusItems = [
    {
      label: 'Synced',
      value: analytics.syncedCount,
      Icon: CheckCircle,
      accent: 'emerald',
      description: 'Clients successfully synced to GoHighLevel.',
      containerClass: 'border-emerald-300/20 bg-emerald-400/10 hover:border-emerald-300/45 hover:bg-emerald-400/15',
      iconClass: 'border-emerald-300/25 bg-emerald-300/15 text-emerald-700 dark:text-emerald-200 shadow-emerald-950/20',
      labelClass: 'text-emerald-700 dark:text-emerald-100',
      valueClass: 'text-emerald-700 dark:text-emerald-100',
      progressClass: 'bg-emerald-950/70 shadow-inner shadow-[0_18px_48px_rgba(15,23,42,0.12)] dark:shadow-black/30 [&>div]:bg-gradient-to-r [&>div]:from-teal-300 [&>div]:via-emerald-300 [&>div]:to-emerald-500 [&>div]:shadow-[0_0_18px_rgba(45,212,191,0.42)]',
    },
    {
      label: 'Pending',
      value: analytics.pendingCount,
      Icon: Clock3,
      accent: 'amber',
      description: 'Clients waiting for the next GoHighLevel sync action.',
      containerClass: 'border-amber-300/20 bg-amber-400/10 hover:border-amber-300/45 hover:bg-amber-400/15',
      iconClass: 'border-amber-300/25 bg-amber-300/15 text-amber-700 dark:text-amber-200 shadow-amber-950/20',
      labelClass: 'text-amber-700 dark:text-amber-100',
      valueClass: 'text-amber-700 dark:text-amber-100',
      progressClass: 'bg-amber-950/70 shadow-inner shadow-[0_18px_48px_rgba(15,23,42,0.12)] dark:shadow-black/30 [&>div]:bg-gradient-to-r [&>div]:from-yellow-300 [&>div]:via-amber-400 [&>div]:to-orange-500 [&>div]:shadow-[0_0_18px_rgba(251,191,36,0.36)]',
    },
    {
      label: 'Errors',
      value: analytics.errorCount,
      Icon: XCircle,
      accent: 'red',
      description: 'Clients with GoHighLevel sync errors that need attention.',
      containerClass: analytics.errorCount > 0
        ? 'border-red-300/25 bg-red-500/10 hover:border-red-300/50 hover:bg-red-500/15'
        : 'border-slate-500/15 bg-slate-500/5 hover:border-slate-400/25 hover:bg-slate-500/10',
      iconClass: analytics.errorCount > 0
        ? 'border-red-300/25 bg-red-500/15 text-red-700 dark:text-red-200 shadow-red-950/20'
        : 'border-slate-500/20 bg-slate-500/10 text-muted-foreground dark:text-slate-400 shadow-black/10',
      labelClass: analytics.errorCount > 0 ? 'text-red-700 dark:text-red-100' : 'text-muted-foreground dark:text-slate-300',
      valueClass: analytics.errorCount > 0 ? 'text-red-700 dark:text-red-100' : 'text-muted-foreground dark:text-slate-300',
      progressClass: analytics.errorCount > 0
        ? 'bg-red-950/70 shadow-inner shadow-[0_18px_48px_rgba(15,23,42,0.12)] dark:shadow-black/30 [&>div]:bg-gradient-to-r [&>div]:from-red-300 [&>div]:via-red-500 [&>div]:to-rose-600 [&>div]:shadow-[0_0_18px_rgba(248,113,113,0.36)]'
        : 'bg-slate-800/70 shadow-inner shadow-[0_18px_48px_rgba(15,23,42,0.12)] dark:shadow-black/30 [&>div]:bg-slate-500/50',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="group relative overflow-hidden rounded-3xl border-amber-400/20 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.14),transparent_34%),linear-gradient(145deg,hsl(var(--card))_0%,hsl(var(--muted)/0.22)_100%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_34%),linear-gradient(145deg,rgba(24,24,27,0.95),rgba(3,7,18,0.9))] shadow-xl shadow-[0_14px_38px_rgba(15,23,42,0.08)] dark:shadow-black/20 transition-all duration-300 hover:-translate-y-1 hover:border-amber-300/45 hover:shadow-2xl hover:shadow-amber-950/25">
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/60 to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-100" />
          <CardContent className="relative p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-3">
                <div className="flex items-center gap-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-100/75">Total Assets Under Management</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 shrink-0 cursor-help text-amber-700 dark:text-amber-100/50 transition-colors hover:text-amber-800 dark:hover:text-amber-100" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[220px] text-xs">
                        Combined estimated value of all client properties across your portfolio.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="break-words text-3xl font-bold tracking-[-0.04em] text-amber-950 dark:text-amber-50 sm:text-4xl xl:text-3xl 2xl:text-4xl">{formatCurrency(analytics.totalPortfolioValue)}</p>
              </div>
              <div className={`rounded-2xl border border-amber-300/25 p-3 shadow-lg shadow-amber-950/20 transition-colors group-hover:border-amber-200/45 group-hover:bg-amber-300/15 ${summaryIconClass.info}`}>
                <DollarSign className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-5 h-px bg-gradient-to-r from-amber-300/70 via-amber-100/20 to-transparent" />
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden rounded-3xl border-border/60 dark:border-white/10 bg-[linear-gradient(145deg,hsl(var(--card))_0%,hsl(var(--muted)/0.22)_100%)] dark:bg-[linear-gradient(145deg,rgba(24,24,27,0.92),rgba(3,7,18,0.88))] shadow-xl shadow-[0_14px_38px_rgba(15,23,42,0.08)] dark:shadow-black/20 transition-all duration-300 hover:-translate-y-1 hover:border-amber-300/35 hover:shadow-2xl hover:shadow-amber-950/20">
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/45 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <CardContent className="relative p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground dark:text-slate-400">Total Properties</p>
                <p className="text-3xl font-bold tracking-[-0.04em] text-foreground dark:text-white sm:text-4xl">{analytics.totalProperties}</p>
              </div>
              <div className={`rounded-2xl border border-emerald-300/20 p-3 shadow-lg shadow-emerald-950/15 transition-colors group-hover:border-emerald-200/35 group-hover:bg-emerald-300/12 ${summaryIconClass.success}`}>
                <Building2 className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-5 h-px bg-gradient-to-r from-amber-300/55 via-amber-100/15 to-transparent" />
          </CardContent>
        </Card>

        <Card className={`group relative overflow-hidden rounded-3xl border-border/60 dark:border-white/10 bg-[linear-gradient(145deg,hsl(var(--card))_0%,hsl(var(--muted)/0.22)_100%)] dark:bg-[linear-gradient(145deg,rgba(24,24,27,0.92),rgba(3,7,18,0.88))] shadow-xl shadow-[0_14px_38px_rgba(15,23,42,0.08)] dark:shadow-black/20 transition-all duration-300 hover:-translate-y-1 hover:border-amber-300/35 hover:shadow-2xl ${analytics.totalCashFlow >= 0 ? 'hover:shadow-emerald-950/20' : 'hover:shadow-red-950/20'}`}>
          <div className={`pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent ${analytics.totalCashFlow >= 0 ? 'via-emerald-200/55' : 'via-red-200/55'} to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
          <CardContent className="relative p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground dark:text-slate-400">Total Monthly Cash Flow</p>
                <p className={`break-words text-3xl font-bold tracking-[-0.04em] sm:text-4xl xl:text-3xl 2xl:text-4xl ${analytics.totalCashFlow >= 0 ? 'text-emerald-700 dark:text-emerald-200' : 'text-red-700 dark:text-red-300'}`}>
                  {formatCurrency(analytics.totalCashFlow)}
                </p>
              </div>
              <div className={`rounded-2xl border p-3 shadow-lg transition-colors ${analytics.totalCashFlow >= 0 ? 'border-emerald-300/25 bg-emerald-400/12 text-emerald-700 dark:text-emerald-200 shadow-emerald-950/20 group-hover:border-emerald-200/45 group-hover:bg-emerald-300/15' : 'border-red-300/25 bg-red-500/12 text-red-700 dark:text-red-200 shadow-red-950/20 group-hover:border-red-200/45 group-hover:bg-red-500/15'}`}>
                {analytics.totalCashFlow >= 0 ? (
                  <TrendingUp className="h-5 w-5" />
                ) : (
                  <TrendingDown className="h-5 w-5" />
                )}
              </div>
            </div>
            <div className={`mt-5 h-px bg-gradient-to-r ${analytics.totalCashFlow >= 0 ? 'from-emerald-300/60' : 'from-red-300/60'} via-white/15 to-transparent`} />
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden rounded-3xl border-border/60 dark:border-white/10 bg-[linear-gradient(145deg,hsl(var(--card))_0%,hsl(var(--muted)/0.22)_100%)] dark:bg-[linear-gradient(145deg,rgba(24,24,27,0.92),rgba(3,7,18,0.88))] shadow-xl shadow-[0_14px_38px_rgba(15,23,42,0.08)] dark:shadow-black/20 transition-all duration-300 hover:-translate-y-1 hover:border-amber-300/35 hover:shadow-2xl hover:shadow-amber-950/20">
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/45 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <CardContent className="relative p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground dark:text-slate-400">Average LTV</p>
                <div className="flex items-end gap-1.5">
                  <p className="text-3xl font-bold tracking-[-0.04em] text-foreground dark:text-white sm:text-4xl">{analytics.avgLTV.toFixed(1)}</p>
                  <span className="pb-1 text-lg font-semibold text-muted-foreground dark:text-slate-400">%</span>
                </div>
              </div>
              <div className={`rounded-2xl border border-amber-300/20 p-3 shadow-lg shadow-amber-950/15 transition-colors group-hover:border-amber-200/35 group-hover:bg-amber-300/12 ${summaryIconClass.accent}`}>
                <Percent className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-5 h-px bg-gradient-to-r from-amber-300/55 via-amber-100/15 to-transparent" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="group relative overflow-hidden rounded-3xl border-border/60 dark:border-white/10 bg-[linear-gradient(145deg,hsl(var(--card))_0%,hsl(var(--muted)/0.22)_100%)] dark:bg-[linear-gradient(145deg,rgba(24,24,27,0.94),rgba(3,7,18,0.9))] shadow-xl shadow-[0_14px_38px_rgba(15,23,42,0.08)] dark:shadow-black/20 transition-all duration-300 hover:border-amber-300/35 hover:shadow-2xl hover:shadow-amber-950/20">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/45 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <CardHeader className="border-b border-border/60 dark:border-white/10 pb-3">
            <CardTitle className="text-base font-semibold tracking-tight text-foreground dark:text-white">Cash Flow Status</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div className="h-[230px] rounded-2xl border border-border/60 dark:border-white/10 bg-background/80 dark:bg-slate-950/45 p-3 shadow-inner shadow-[0_16px_44px_rgba(15,23,42,0.10)] dark:shadow-black/25" role="img" aria-label="Cash flow status chart showing positive and negative client counts">
              {clients.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics.cashFlowData}
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={86}
                      dataKey="value"
                      paddingAngle={4}
                      labelLine={false}
                      stroke="hsl(var(--background))"
                      strokeWidth={3}
                    >
                      {analytics.cashFlowData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={chartTooltipStyle} itemStyle={chartItemStyle} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-amber-300/15 bg-amber-300/[0.03] px-4 text-center">
                  <Info className="mb-3 h-8 w-8 text-amber-700 dark:text-amber-100/70" />
                  <p className="text-sm font-semibold text-foreground/90 dark:text-slate-200">No cash flow data yet</p>
                  <p className="mt-1 max-w-[220px] text-xs leading-5 text-muted-foreground/80 dark:text-slate-500">Import or add clients to populate this chart.</p>
                </div>
              )}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-2xl border border-emerald-300/15 bg-emerald-400/10 px-3 py-2">
                <span className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-100">
                <CheckCircle className="h-4 w-4 text-success" />
                  Positive
                </span>
                <span className="text-sm font-bold text-emerald-700 dark:text-emerald-200">{analytics.positiveCashFlowClients}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-red-300/15 bg-red-500/10 px-3 py-2">
                <span className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-100">
                <AlertCircle className="h-4 w-4 text-destructive" />
                  Negative
                </span>
                <span className="text-sm font-bold text-red-700 dark:text-red-200">{analytics.negativeCashFlowClients}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden rounded-3xl border-border/60 dark:border-white/10 bg-[linear-gradient(145deg,hsl(var(--card))_0%,hsl(var(--muted)/0.22)_100%)] dark:bg-[linear-gradient(145deg,rgba(24,24,27,0.94),rgba(3,7,18,0.9))] shadow-xl shadow-[0_14px_38px_rgba(15,23,42,0.08)] dark:shadow-black/20 transition-all duration-300 hover:border-amber-300/35 hover:shadow-2xl hover:shadow-amber-950/20">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/45 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <CardHeader className="border-b border-border/60 dark:border-white/10 pb-3">
            <CardTitle className="text-base font-semibold tracking-tight text-foreground dark:text-white">Portfolio Size Distribution</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div className="h-[230px] rounded-2xl border border-border/60 dark:border-white/10 bg-background/80 dark:bg-slate-950/45 p-3 shadow-inner shadow-[0_16px_44px_rgba(15,23,42,0.10)] dark:shadow-black/25" role="img" aria-label="Portfolio size distribution chart">
              {analytics.portfolioDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.portfolioDistribution} margin={{ top: 12, right: 8, left: -16, bottom: 8 }} barCategoryGap="22%">
                    <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'rgb(148, 163, 184)', fontWeight: 600 }} axisLine={{ stroke: 'rgba(148,163,184,0.18)' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'rgb(148, 163, 184)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <RechartsTooltip contentStyle={chartTooltipStyle} labelStyle={chartLabelStyle} itemStyle={chartItemStyle} cursor={{ fill: 'rgba(245, 158, 11, 0.08)' }} />
                    <Bar dataKey="value" fill="hsl(var(--chart-2))" radius={[8, 8, 2, 2]} activeBar={{ fill: 'rgb(251, 191, 36)' }} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-amber-300/15 bg-amber-300/[0.03] px-4 text-center">
                  <Info className="mb-3 h-8 w-8 text-amber-700 dark:text-amber-100/70" />
                  <p className="text-sm font-semibold text-foreground/90 dark:text-slate-200">No portfolio size data</p>
                  <p className="mt-1 max-w-[220px] text-xs leading-5 text-muted-foreground/80 dark:text-slate-500">Portfolio values will appear here once client records include property data.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden rounded-3xl border-border/60 dark:border-white/10 bg-[linear-gradient(145deg,hsl(var(--card))_0%,hsl(var(--muted)/0.22)_100%)] dark:bg-[linear-gradient(145deg,rgba(24,24,27,0.94),rgba(3,7,18,0.9))] shadow-xl shadow-[0_14px_38px_rgba(15,23,42,0.08)] dark:shadow-black/20 transition-all duration-300 hover:border-amber-300/35 hover:shadow-2xl hover:shadow-amber-950/20">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/45 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <CardHeader className="border-b border-border/60 dark:border-white/10 pb-3">
            <CardTitle className="text-base font-semibold tracking-tight text-foreground dark:text-white">Property Count Distribution</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div className="h-[230px] rounded-2xl border border-border/60 dark:border-white/10 bg-background/80 dark:bg-slate-950/45 p-3 shadow-inner shadow-[0_16px_44px_rgba(15,23,42,0.10)] dark:shadow-black/25" role="img" aria-label="Property count distribution chart">
              {analytics.propertyDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics.propertyDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={86}
                      dataKey="value"
                      paddingAngle={3}
                      labelLine={false}
                      stroke="hsl(var(--background))"
                      strokeWidth={3}
                    >
                      {analytics.propertyDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={chartTooltipStyle} itemStyle={chartItemStyle} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-amber-300/15 bg-amber-300/[0.03] px-4 text-center">
                  <Building2 className="mb-3 h-8 w-8 text-amber-700 dark:text-amber-100/70" />
                  <p className="text-sm font-semibold text-foreground/90 dark:text-slate-200">No property count data</p>
                  <p className="mt-1 max-w-[220px] text-xs leading-5 text-muted-foreground/80 dark:text-slate-500">Property distribution will populate as client portfolios are added.</p>
                </div>
              )}
            </div>
            {analytics.propertyDistribution.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {analytics.propertyDistribution.map((entry, index) => (
                  <span key={entry.name} className="inline-flex items-center gap-2 rounded-full border border-border/60 dark:border-white/10 bg-background/65 dark:bg-white/[0.035] px-3 py-1 text-xs font-semibold text-muted-foreground dark:text-slate-300">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_PALETTE[index % CHART_PALETTE.length] }} />
                    {entry.name}: {entry.value}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="group relative overflow-hidden rounded-3xl border-border/60 dark:border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.12),transparent_30%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_30%),linear-gradient(145deg,rgba(24,24,27,0.96),rgba(3,7,18,0.92))] shadow-xl shadow-[0_16px_44px_rgba(15,23,42,0.10)] dark:shadow-black/25 transition-all duration-300 hover:border-amber-300/35 hover:shadow-2xl hover:shadow-amber-950/20">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-teal-200/45 to-amber-200/45 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <CardHeader className="border-b border-border/60 dark:border-white/10 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold tracking-tight text-foreground dark:text-white">GoHighLevel Sync Status</CardTitle>
              <p className="mt-1 text-xs font-medium text-muted-foreground dark:text-slate-400">Operational health across {clients.length} client records</p>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border/60 dark:border-white/10 bg-background/70 dark:bg-white/[0.04] px-3 py-1 text-xs font-semibold text-muted-foreground dark:text-slate-300">
              <span className={`h-2 w-2 rounded-full ${analytics.errorCount > 0 ? 'bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.7)]' : analytics.pendingCount > 0 ? 'bg-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.65)]' : 'bg-teal-300 shadow-[0_0_12px_rgba(45,212,191,0.65)]'}`} />
              {analytics.errorCount > 0 ? 'Attention needed' : analytics.pendingCount > 0 ? 'Sync in progress' : 'Healthy'}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          <TooltipProvider>
            <div className="grid gap-4 md:grid-cols-3">
              {syncStatusItems.map(({ label, value, Icon, description, containerClass, iconClass, labelClass, valueClass, progressClass }) => {
                const percentage = (value / clients.length) * 100;

                return (
                  <Tooltip key={label}>
                    <TooltipTrigger asChild>
                      <div className={`space-y-4 rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${containerClass}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-lg ${iconClass}`}>
                              <Icon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <p className={`text-sm font-semibold ${labelClass}`}>{label}</p>
                              <p className="text-xs text-muted-foreground dark:text-slate-400">{Number.isFinite(percentage) ? percentage.toFixed(1) : '0.0'}% of clients</p>
                            </div>
                          </div>
                          <span className={`rounded-full border border-border/60 dark:border-white/10 bg-muted/45 dark:bg-black/20 px-3 py-1 text-sm font-bold tabular-nums ${valueClass}`}>{value}</span>
                        </div>
                        <Progress value={Number.isFinite(percentage) ? percentage : 0} className={`h-3 border border-border/60 dark:border-white/10 ${progressClass}`} />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[240px] text-xs">
                      {description} Count: {value}.
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>
    </div>
  );
}
