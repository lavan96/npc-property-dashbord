import { useState, useEffect, useMemo } from 'react';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  Server,
  AlertTriangle,
  Coins,
  Brain,
  Hash,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// Service colors using HSL tokens that align with the theme
const SERVICE_COLORS: Record<string, string> = {
  'abs-census': 'hsl(217, 91%, 60%)',
  'crime-statistics': 'hsl(0, 84%, 60%)',
  'public-transport': 'hsl(142, 71%, 45%)',
  'climate-data': 'hsl(45, 93%, 47%)',
  'domain-data': 'hsl(280, 67%, 55%)',
  'openai': 'hsl(171, 77%, 44%)',
  'perplexity': 'hsl(199, 89%, 48%)',
  'gemini': 'hsl(31, 97%, 55%)',
  'vapi': 'hsl(328, 73%, 56%)',
  'twilio': 'hsl(262, 83%, 58%)',
  'microsoft-graph': 'hsl(207, 90%, 54%)',
  'airtable': 'hsl(154, 60%, 50%)',
  'cloudflare': 'hsl(25, 95%, 53%)',
};

const getServiceColor = (service: string) =>
  SERVICE_COLORS[service] || `hsl(${Math.abs(service.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 360}, 70%, 55%)`;

const formatServiceName = (name: string) =>
  name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

interface ConsumptionData {
  summary: {
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    activeServices: number;
  };
  breakdown: Array<{
    service: string;
    requests: number;
    tokens: number;
    promptTokens: number;
    completionTokens: number;
    cost: number;
    topModel: string;
    models: Record<string, number>;
  }>;
  dailyConsumption: Array<Record<string, any>>;
  consumptionServices: string[];
  modelDistribution: Array<{ model: string; count: number }>;
  recentUsageLogs: Array<{
    id: string;
    service: string;
    endpoint: string;
    model: string;
    tokens: number;
    promptTokens: number;
    completionTokens: number;
    cost: number;
    status: string;
    createdAt: string;
    metadata: any;
  }>;
}

interface ApiUsageData {
  summary: {
    totalCalls: number;
    successCalls: number;
    errorCalls: number;
    successRate: number;
    avgResponseTime: number;
    activeServices: number;
    period: string;
  };
  serviceBreakdown: Array<{
    service: string;
    total: number;
    success: number;
    errors: number;
    successRate: number;
    avgResponseTime: number;
  }>;
  dailyVolume: Array<Record<string, any>>;
  dataQuality: Record<string, number>;
  services: string[];
  recentLogs: Array<{
    id: string;
    service: string;
    endpoint: string;
    status: string;
    responseTime: number;
    dataQuality: string;
    error: string | null;
    createdAt: string;
  }>;
  consumption?: ConsumptionData;
}

export default function ApiUsage() {
  const [data, setData] = useState<ApiUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState('30');
  const [activeTab, setActiveTab] = useState('overview');

  const fetchData = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data: result, error } = await invokeSecureFunction('get-api-usage-stats', {
        mode: 'overview',
        days: parseInt(timeRange),
      });
      if (error) throw new Error(error.message);
      if (result?.success) setData(result);
    } catch (err) {
      console.error('Failed to load API usage stats:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, [timeRange]);

  // ========== Health chart data ==========
  const volumeChartData = useMemo(() => {
    if (!data) return [];
    return data.dailyVolume.map(entry => {
      const row: Record<string, any> = { date: entry.date };
      for (const svc of data.services) {
        row[svc] = entry[svc] || 0;
      }
      return row;
    });
  }, [data]);

  const responseTimeData = useMemo(() => {
    if (!data) return [];
    return data.dailyVolume.map(entry => {
      const row: Record<string, any> = { date: entry.date };
      for (const svc of data.services) {
        row[svc] = entry[`${svc}_avgTime`] || 0;
      }
      return row;
    });
  }, [data]);

  const successErrorData = useMemo(() => {
    if (!data) return [];
    return data.dailyVolume.map(entry => {
      let totalSuccess = 0;
      let totalErrors = 0;
      for (const svc of data.services) {
        totalSuccess += entry[`${svc}_success`] || 0;
        totalErrors += entry[`${svc}_errors`] || 0;
      }
      return { date: entry.date, success: totalSuccess, errors: totalErrors };
    });
  }, [data]);

  const donutData = useMemo(() => {
    if (!data) return [];
    return data.serviceBreakdown
      .sort((a, b) => b.total - a.total)
      .map(s => ({ name: formatServiceName(s.service), value: s.total, service: s.service }));
  }, [data]);

  const qualityData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.dataQuality).map(([key, value]) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      value,
    }));
  }, [data]);

  // ========== Consumption chart data ==========
  const tokenChartData = useMemo(() => {
    if (!data?.consumption) return [];
    return data.consumption.dailyConsumption.map(entry => {
      const row: Record<string, any> = { date: entry.date };
      for (const svc of data.consumption!.consumptionServices) {
        row[svc] = entry[`${svc}_tokens`] || 0;
      }
      return row;
    });
  }, [data]);

  const costChartData = useMemo(() => {
    if (!data?.consumption) return [];
    return data.consumption.dailyConsumption.map(entry => ({
      date: entry.date,
      cost: entry.totalCost || 0,
    }));
  }, [data]);

  const modelDonutData = useMemo(() => {
    if (!data?.consumption) return [];
    return data.consumption.modelDistribution.map(m => ({
      name: m.model,
      value: m.count,
    }));
  }, [data]);

  const MODEL_COLORS = [
    'hsl(171, 77%, 44%)', 'hsl(199, 89%, 48%)', 'hsl(31, 97%, 55%)',
    'hsl(328, 73%, 56%)', 'hsl(262, 83%, 58%)', 'hsl(142, 71%, 45%)',
    'hsl(45, 93%, 47%)', 'hsl(0, 84%, 60%)',
  ];
  const QUALITY_COLORS = ['hsl(142, 71%, 45%)', 'hsl(45, 93%, 47%)', 'hsl(0, 84%, 60%)', 'hsl(217, 91%, 60%)'];

  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6 px-1 sm:px-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-4 sm:p-6"><Skeleton className="h-16" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-4 sm:p-6"><Skeleton className="h-64" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 px-1 sm:px-0">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">API Usage</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor API health, token consumption, and costs across all integrations
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[130px] min-h-[40px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24h</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={refreshing} className="gap-2 min-h-[40px]">
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Zap className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium uppercase tracking-wider">Total Calls</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-foreground">{data.summary.totalCalls.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">{data.summary.period}</p>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-xs font-medium uppercase tracking-wider">Success Rate</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-foreground">{data.summary.successRate}%</p>
              <div className="flex items-center gap-1 mt-1">
                {data.summary.successRate >= 95 ? (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-destructive" />
                )}
                <span className="text-xs text-muted-foreground">{data.summary.errorCalls} errors</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Hash className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium uppercase tracking-wider">Total Tokens</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-foreground">
                {data.consumption ? data.consumption.summary.totalTokens.toLocaleString() : '—'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {data.consumption ? `${data.consumption.summary.totalRequests} LLM calls` : 'No data yet'}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Coins className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium uppercase tracking-wider">Est. Cost</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-foreground">
                ${data.consumption ? data.consumption.summary.totalCost.toFixed(2) : '0.00'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {data.consumption ? `${data.consumption.summary.activeServices} services` : 'No data yet'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50 overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="consumption">Consumption</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="logs">Recent Logs</TabsTrigger>
        </TabsList>

        {/* ==================== Overview Tab ==================== */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {data && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Call Volume Area Chart */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Call Volume Over Time
                  </CardTitle>
                  <CardDescription className="text-xs">Daily API calls per service</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px] sm:h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={volumeChartData}>
                        <defs>
                          {data.services.map(svc => (
                            <linearGradient key={svc} id={`gradient-${svc}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={getServiceColor(svc)} stopOpacity={0.3} />
                              <stop offset="95%" stopColor={getServiceColor(svc)} stopOpacity={0} />
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => v.slice(5)} />
                        <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} labelStyle={{ color: 'hsl(var(--foreground))' }} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        {data.services.map(svc => (
                          <Area key={svc} type="monotone" dataKey={svc} name={formatServiceName(svc)} stackId="1" stroke={getServiceColor(svc)} fill={`url(#gradient-${svc})`} strokeWidth={2} />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Success vs Errors */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    Success vs Errors
                  </CardTitle>
                  <CardDescription className="text-xs">Daily success and failure breakdown</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px] sm:h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={successErrorData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => v.slice(5)} />
                        <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} labelStyle={{ color: 'hsl(var(--foreground))' }} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Bar dataKey="success" name="Success" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} stackId="a" />
                        <Bar dataKey="errors" name="Errors" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Usage Distribution Donut */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Server className="h-4 w-4 text-primary" />
                    Usage Distribution
                  </CardTitle>
                  <CardDescription className="text-xs">Proportional usage by service</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px] sm:h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={donutData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`} labelLine={{ stroke: 'hsl(var(--muted-foreground))' }}>
                          {donutData.map((entry) => (<Cell key={entry.service} fill={getServiceColor(entry.service)} />))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Data Quality */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Data Quality Breakdown
                  </CardTitle>
                  <CardDescription className="text-xs">Live vs estimated data across calls</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px] sm:h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={qualityData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`} labelLine={{ stroke: 'hsl(var(--muted-foreground))' }}>
                          {qualityData.map((_, idx) => (<Cell key={idx} fill={QUALITY_COLORS[idx % QUALITY_COLORS.length]} />))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ==================== Consumption Tab (NEW - V2) ==================== */}
        <TabsContent value="consumption" className="space-y-4 mt-4">
          {data?.consumption && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Token Usage Stacked Area */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" />
                    Token Consumption Over Time
                  </CardTitle>
                  <CardDescription className="text-xs">Daily token usage per service (stacked)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[320px] sm:h-[380px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={tokenChartData}>
                        <defs>
                          {data.consumption.consumptionServices.map(svc => (
                            <linearGradient key={svc} id={`tok-gradient-${svc}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={getServiceColor(svc)} stopOpacity={0.4} />
                              <stop offset="95%" stopColor={getServiceColor(svc)} stopOpacity={0} />
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => v.slice(5)} />
                        <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} labelStyle={{ color: 'hsl(var(--foreground))' }} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        {data.consumption.consumptionServices.map(svc => (
                          <Area key={svc} type="monotone" dataKey={svc} name={formatServiceName(svc)} stackId="1" stroke={getServiceColor(svc)} fill={`url(#tok-gradient-${svc})`} strokeWidth={2} />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Cost Trend Line */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Coins className="h-4 w-4 text-primary" />
                    Estimated Cost Trend
                  </CardTitle>
                  <CardDescription className="text-xs">Daily estimated spend (USD)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px] sm:h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={costChartData}>
                        <defs>
                          <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => v.slice(5)} />
                        <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${v}`} />
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} formatter={(v: any) => [`$${Number(v).toFixed(4)}`, 'Cost']} />
                        <Area type="monotone" dataKey="cost" stroke="hsl(142, 71%, 45%)" fill="url(#costGradient)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Model Distribution Donut */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" />
                    Model Distribution
                  </CardTitle>
                  <CardDescription className="text-xs">Which AI models are used most</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px] sm:h-[320px]">
                    {modelDonutData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={modelDonutData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`} labelLine={{ stroke: 'hsl(var(--muted-foreground))' }}>
                            {modelDonutData.map((_, idx) => (<Cell key={idx} fill={MODEL_COLORS[idx % MODEL_COLORS.length]} />))}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No model data yet</div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Service Consumption Cards */}
              <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.consumption.breakdown
                  .sort((a, b) => b.tokens - a.tokens)
                  .map(svc => (
                    <Card key={svc.service} className="border-border/50 bg-card/80 backdrop-blur-sm">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getServiceColor(svc.service) }} />
                            <span className="text-sm font-medium text-foreground">{formatServiceName(svc.service)}</span>
                          </div>
                          <Badge variant="secondary" className="text-[10px]">{svc.topModel}</Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="text-lg font-bold text-foreground">{svc.requests}</p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Requests</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold text-foreground">{(svc.tokens / 1000).toFixed(1)}k</p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tokens</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold text-foreground">${svc.cost.toFixed(3)}</p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                {data.consumption.breakdown.length === 0 && (
                  <div className="lg:col-span-3 p-8 text-center text-muted-foreground text-sm">
                    No consumption data logged yet. Usage will appear here as API calls are made.
                  </div>
                )}
              </div>

              {/* Recent Usage Logs */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    Recent LLM Calls
                  </CardTitle>
                  <CardDescription className="text-xs">Last 50 external API consumption entries</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Service</th>
                          <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Model</th>
                          <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Tokens</th>
                          <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Cost</th>
                          <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                          <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.consumption.recentUsageLogs.map(log => (
                          <tr key={log.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getServiceColor(log.service) }} />
                                <span className="text-foreground text-xs sm:text-sm">{formatServiceName(log.service)}</span>
                              </div>
                            </td>
                            <td className="p-3 text-muted-foreground text-xs font-mono hidden sm:table-cell">{log.model || '—'}</td>
                            <td className="p-3 text-foreground text-xs font-medium">{(log.tokens || 0).toLocaleString()}</td>
                            <td className="p-3 text-muted-foreground text-xs hidden md:table-cell">{log.cost ? `$${log.cost.toFixed(4)}` : '—'}</td>
                            <td className="p-3">
                              {log.status === 'success' ? (
                                <Badge variant="outline" className="border-green-500/30 text-green-400 bg-green-500/10 text-[10px]">
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> OK
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-red-500/30 text-red-400 bg-red-500/10 text-[10px]">
                                  <XCircle className="h-3 w-3 mr-1" /> Error
                                </Badge>
                              )}
                            </td>
                            <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                              {new Date(log.createdAt).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}{' '}
                              <span className="hidden sm:inline">{new Date(log.createdAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {data.consumption.recentUsageLogs.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                      No LLM usage logged yet. Start using AI features and data will appear here.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
          {!data?.consumption && (
            <div className="p-12 text-center text-muted-foreground">
              <Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No consumption data available</p>
              <p className="text-sm mt-1">Token and cost tracking will populate as API calls are made.</p>
            </div>
          )}
        </TabsContent>

        {/* ==================== Performance Tab ==================== */}
        <TabsContent value="performance" className="space-y-4 mt-4">
          {data && (
            <div className="grid grid-cols-1 gap-4">
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    Response Time Trends
                  </CardTitle>
                  <CardDescription className="text-xs">Average response time (ms) per service over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[320px] sm:h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={responseTimeData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => v.slice(5)} />
                        <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} unit="ms" />
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} labelStyle={{ color: 'hsl(var(--foreground))' }} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        {data.services.map(svc => (
                          <Line key={svc} type="monotone" dataKey={svc} name={formatServiceName(svc)} stroke={getServiceColor(svc)} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.serviceBreakdown
                  .sort((a, b) => b.avgResponseTime - a.avgResponseTime)
                  .map(svc => (
                    <Card key={svc.service} className="border-border/50 bg-card/80 backdrop-blur-sm">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getServiceColor(svc.service) }} />
                            <span className="text-sm font-medium text-foreground">{formatServiceName(svc.service)}</span>
                          </div>
                          <Badge variant="outline" className={svc.successRate >= 95 ? 'border-green-500/30 text-green-400 bg-green-500/10' : svc.successRate >= 80 ? 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10' : 'border-red-500/30 text-red-400 bg-red-500/10'}>
                            {svc.successRate}%
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="text-lg font-bold text-foreground">{svc.total}</p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Calls</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold text-foreground">{svc.avgResponseTime}ms</p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Time</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold text-destructive">{svc.errors}</p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Errors</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ==================== Services Tab ==================== */}
        <TabsContent value="services" className="space-y-4 mt-4">
          {data && (
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Service Breakdown
                </CardTitle>
                <CardDescription className="text-xs">Total calls, successes, and errors per service</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[400px] sm:h-[500px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.serviceBreakdown.sort((a, b) => b.total - a.total).map(s => ({ ...s, name: formatServiceName(s.service) }))} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={120} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} labelStyle={{ color: 'hsl(var(--foreground))' }} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="success" name="Success" fill="hsl(142, 71%, 45%)" radius={[0, 4, 4, 0]} stackId="a" />
                      <Bar dataKey="errors" name="Errors" fill="hsl(0, 84%, 60%)" radius={[0, 4, 4, 0]} stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ==================== Logs Tab ==================== */}
        <TabsContent value="logs" className="space-y-4 mt-4">
          {data && (
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  Recent API Calls
                </CardTitle>
                <CardDescription className="text-xs">Last 50 logged health check interactions</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Service</th>
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Endpoint</th>
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Response</th>
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Quality</th>
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentLogs.map(log => (
                        <tr key={log.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getServiceColor(log.service) }} />
                              <span className="text-foreground text-xs sm:text-sm truncate max-w-[100px] sm:max-w-none">{formatServiceName(log.service)}</span>
                            </div>
                          </td>
                          <td className="p-3 text-muted-foreground text-xs font-mono hidden sm:table-cell truncate max-w-[150px]">{log.endpoint || '—'}</td>
                          <td className="p-3">
                            {log.status === 'success' ? (
                              <Badge variant="outline" className="border-green-500/30 text-green-400 bg-green-500/10 text-[10px]">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> OK
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-red-500/30 text-red-400 bg-red-500/10 text-[10px]">
                                <XCircle className="h-3 w-3 mr-1" /> Error
                              </Badge>
                            )}
                          </td>
                          <td className="p-3 text-muted-foreground text-xs hidden md:table-cell">{log.responseTime ? `${log.responseTime}ms` : '—'}</td>
                          <td className="p-3 hidden lg:table-cell">
                            <Badge variant="secondary" className="text-[10px]">{log.dataQuality || '—'}</Badge>
                          </td>
                          <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}{' '}
                            <span className="hidden sm:inline">{new Date(log.createdAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.recentLogs.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    No API calls logged in this period
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
