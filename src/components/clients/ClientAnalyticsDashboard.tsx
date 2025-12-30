import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  Tooltip,
  Legend
} from 'recharts';
import { 
  Building2, 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  Percent,
  AlertCircle,
  CheckCircle
} from 'lucide-react';

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

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export function ClientAnalyticsDashboard({ clients }: ClientAnalyticsDashboardProps) {
  const analytics = useMemo(() => {
    const totalPortfolioValue = clients.reduce((sum, c) => sum + (Number(c.total_portfolio_value) || 0), 0);
    const totalDebt = clients.reduce((sum, c) => sum + (Number(c.total_debt) || 0), 0);
    const totalCashFlow = clients.reduce((sum, c) => sum + (Number(c.net_monthly_cash_flow) || 0), 0);
    const totalProperties = clients.reduce((sum, c) => sum + (c.client_properties?.length || 0), 0);

    const positiveCashFlowClients = clients.filter(c => Number(c.net_monthly_cash_flow) >= 0).length;
    const negativeCashFlowClients = clients.filter(c => Number(c.net_monthly_cash_flow) < 0).length;

    const avgLTV = totalPortfolioValue > 0 ? (totalDebt / totalPortfolioValue) * 100 : 0;

    // Portfolio size distribution
    const portfolioDistribution = [
      { name: '< $500K', value: clients.filter(c => Number(c.total_portfolio_value) < 500000).length },
      { name: '$500K-$1M', value: clients.filter(c => Number(c.total_portfolio_value) >= 500000 && Number(c.total_portfolio_value) < 1000000).length },
      { name: '$1M-$2M', value: clients.filter(c => Number(c.total_portfolio_value) >= 1000000 && Number(c.total_portfolio_value) < 2000000).length },
      { name: '$2M-$5M', value: clients.filter(c => Number(c.total_portfolio_value) >= 2000000 && Number(c.total_portfolio_value) < 5000000).length },
      { name: '$5M+', value: clients.filter(c => Number(c.total_portfolio_value) >= 5000000).length },
    ].filter(d => d.value > 0);

    // Property count distribution
    const propertyDistribution = [
      { name: '0 props', value: clients.filter(c => (c.client_properties?.length || 0) === 0).length },
      { name: '1 prop', value: clients.filter(c => (c.client_properties?.length || 0) === 1).length },
      { name: '2-3 props', value: clients.filter(c => (c.client_properties?.length || 0) >= 2 && (c.client_properties?.length || 0) <= 3).length },
      { name: '4-5 props', value: clients.filter(c => (c.client_properties?.length || 0) >= 4 && (c.client_properties?.length || 0) <= 5).length },
      { name: '6+ props', value: clients.filter(c => (c.client_properties?.length || 0) >= 6).length },
    ].filter(d => d.value > 0);

    // Cash flow distribution
    const cashFlowData = [
      { name: 'Positive', value: positiveCashFlowClients, color: '#10B981' },
      { name: 'Negative', value: negativeCashFlowClients, color: '#EF4444' },
    ];

    // Sync status
    const syncedCount = clients.filter(c => c.ghl_sync_status === 'synced').length;
    const pendingCount = clients.filter(c => c.ghl_sync_status === 'pending' || !c.ghl_sync_status).length;
    const errorCount = clients.filter(c => c.ghl_sync_status === 'error').length;

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
      cashFlowData,
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

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total AUM</p>
                <p className="text-xl font-bold">{formatCurrency(analytics.totalPortfolioValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Building2 className="h-5 w-5 text-green-600" />
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
              <div className={`p-2 rounded-lg ${analytics.totalCashFlow >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                {analytics.totalCashFlow >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-green-600" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-600" />
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Monthly Cash Flow</p>
                <p className={`text-xl font-bold ${analytics.totalCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(analytics.totalCashFlow)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Percent className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Average LTV</p>
                <p className="text-xl font-bold">{analytics.avgLTV.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Cash Flow Status */}
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
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 mt-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm">{analytics.positiveCashFlowClients} Positive</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm">{analytics.negativeCashFlowClients} Negative</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Portfolio Distribution */}
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
                  <Tooltip />
                  <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Property Distribution */}
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
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* GHL Sync Status */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">GoHighLevel Sync Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Synced</span>
                <span className="text-green-600">{analytics.syncedCount}</span>
              </div>
              <Progress 
                value={(analytics.syncedCount / clients.length) * 100} 
                className="h-2"
              />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Pending</span>
                <span className="text-yellow-600">{analytics.pendingCount}</span>
              </div>
              <Progress 
                value={(analytics.pendingCount / clients.length) * 100} 
                className="h-2"
              />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Errors</span>
                <span className="text-red-600">{analytics.errorCount}</span>
              </div>
              <Progress 
                value={(analytics.errorCount / clients.length) * 100} 
                className="h-2"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
