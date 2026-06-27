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
  Info,
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

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="group relative overflow-hidden rounded-3xl border-amber-400/20 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_34%),linear-gradient(145deg,rgba(24,24,27,0.95),rgba(3,7,18,0.9))] shadow-xl shadow-black/20 transition-all duration-300 hover:-translate-y-1 hover:border-amber-300/45 hover:shadow-2xl hover:shadow-amber-950/25">
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/60 to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-100" />
          <CardContent className="relative p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-3">
                <div className="flex items-center gap-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-100/75">Total Assets Under Management</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 shrink-0 cursor-help text-amber-100/50 transition-colors hover:text-amber-100" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[220px] text-xs">
                        Combined estimated value of all client properties across your portfolio.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="break-words text-3xl font-bold tracking-[-0.04em] text-amber-50 sm:text-4xl xl:text-3xl 2xl:text-4xl">{formatCurrency(analytics.totalPortfolioValue)}</p>
              </div>
              <div className={`rounded-2xl border border-amber-300/25 p-3 shadow-lg shadow-amber-950/20 transition-colors group-hover:border-amber-200/45 group-hover:bg-amber-300/15 ${summaryIconClass.info}`}>
                <DollarSign className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-5 h-px bg-gradient-to-r from-amber-300/70 via-amber-100/20 to-transparent" />
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden rounded-3xl border-white/10 bg-[linear-gradient(145deg,rgba(24,24,27,0.92),rgba(3,7,18,0.88))] shadow-xl shadow-black/20 transition-all duration-300 hover:-translate-y-1 hover:border-amber-300/35 hover:shadow-2xl hover:shadow-amber-950/20">
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/45 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <CardContent className="relative p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Total Properties</p>
                <p className="text-3xl font-bold tracking-[-0.04em] text-white sm:text-4xl">{analytics.totalProperties}</p>
              </div>
              <div className={`rounded-2xl border border-emerald-300/20 p-3 shadow-lg shadow-emerald-950/15 transition-colors group-hover:border-emerald-200/35 group-hover:bg-emerald-300/12 ${summaryIconClass.success}`}>
                <Building2 className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-5 h-px bg-gradient-to-r from-amber-300/55 via-amber-100/15 to-transparent" />
          </CardContent>
        </Card>

        <Card className={`group relative overflow-hidden rounded-3xl border-white/10 bg-[linear-gradient(145deg,rgba(24,24,27,0.92),rgba(3,7,18,0.88))] shadow-xl shadow-black/20 transition-all duration-300 hover:-translate-y-1 hover:border-amber-300/35 hover:shadow-2xl ${analytics.totalCashFlow >= 0 ? 'hover:shadow-emerald-950/20' : 'hover:shadow-red-950/20'}`}>
          <div className={`pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent ${analytics.totalCashFlow >= 0 ? 'via-emerald-200/55' : 'via-red-200/55'} to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
          <CardContent className="relative p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Total Monthly Cash Flow</p>
                <p className={`break-words text-3xl font-bold tracking-[-0.04em] sm:text-4xl xl:text-3xl 2xl:text-4xl ${analytics.totalCashFlow >= 0 ? 'text-emerald-200' : 'text-red-300'}`}>
                  {formatCurrency(analytics.totalCashFlow)}
                </p>
              </div>
              <div className={`rounded-2xl border p-3 shadow-lg transition-colors ${analytics.totalCashFlow >= 0 ? 'border-emerald-300/25 bg-emerald-400/12 text-emerald-200 shadow-emerald-950/20 group-hover:border-emerald-200/45 group-hover:bg-emerald-300/15' : 'border-red-300/25 bg-red-500/12 text-red-200 shadow-red-950/20 group-hover:border-red-200/45 group-hover:bg-red-500/15'}`}>
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

        <Card className="group relative overflow-hidden rounded-3xl border-white/10 bg-[linear-gradient(145deg,rgba(24,24,27,0.92),rgba(3,7,18,0.88))] shadow-xl shadow-black/20 transition-all duration-300 hover:-translate-y-1 hover:border-amber-300/35 hover:shadow-2xl hover:shadow-amber-950/20">
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/45 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <CardContent className="relative p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Average LTV</p>
                <div className="flex items-end gap-1.5">
                  <p className="text-3xl font-bold tracking-[-0.04em] text-white sm:text-4xl">{analytics.avgLTV.toFixed(1)}</p>
                  <span className="pb-1 text-lg font-semibold text-slate-400">%</span>
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

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cash Flow Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics.cashFlowData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {analytics.cashFlowData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex justify-center gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-success" />
                <span className="text-sm">{analytics.positiveCashFlowClients} Positive</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <span className="text-sm">{analytics.negativeCashFlowClients} Negative</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Portfolio Size Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.portfolioDistribution}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <RechartsTooltip />
                  <Bar dataKey="value" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Property Count Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics.propertyDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {analytics.propertyDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">GoHighLevel Sync Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Synced</span>
                <span className="text-success">{analytics.syncedCount}</span>
              </div>
              <Progress value={(analytics.syncedCount / clients.length) * 100} className="h-2" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Pending</span>
                <span className="text-warning">{analytics.pendingCount}</span>
              </div>
              <Progress value={(analytics.pendingCount / clients.length) * 100} className="h-2" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Errors</span>
                <span className="text-destructive">{analytics.errorCount}</span>
              </div>
              <Progress value={(analytics.errorCount / clients.length) * 100} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
