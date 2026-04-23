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
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2 ${summaryIconClass.info}`}>
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <p className="text-xs text-muted-foreground">Total Assets Under Management</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 cursor-help text-muted-foreground/60" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[220px] text-xs">
                        Combined estimated value of all client properties across your portfolio.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-xl font-bold">{formatCurrency(analytics.totalPortfolioValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2 ${summaryIconClass.success}`}>
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Properties</p>
                <p className="text-xl font-bold">{analytics.totalProperties}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2 ${analytics.totalCashFlow >= 0 ? 'bg-success/12 text-success' : 'bg-destructive/12 text-destructive'}`}>
                {analytics.totalCashFlow >= 0 ? (
                  <TrendingUp className="h-5 w-5" />
                ) : (
                  <TrendingDown className="h-5 w-5" />
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Monthly Cash Flow</p>
                <p className={`text-xl font-bold ${analytics.totalCashFlow >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(analytics.totalCashFlow)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2 ${summaryIconClass.accent}`}>
                <Percent className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Average LTV</p>
                <p className="text-xl font-bold">{analytics.avgLTV.toFixed(1)}%</p>
              </div>
            </div>
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
