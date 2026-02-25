import { useState, useEffect, useMemo } from 'react';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { MultiSelectFilter } from '@/components/api-usage/MultiSelectFilter';
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
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  DollarSign,
  CalendarDays,
  Mail,
  Database,
  X,
  Filter,
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
  ComposedChart,
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

interface VapiData {
  totalCalls: number;
  totalMinutes: number;
  totalCost: number;
  inbound: number;
  outbound: number;
  avgCostPerCall: number;
  dailyTrend: Array<{ date: string; calls: number; minutes: number; cost: number }>;
}

interface ProjectionsData {
  dailyAvgCost: number;
  projectedMonthlyCost: number;
  projectedMonthlyVapi: number;
  serviceProjections: Array<{ service: string; currentCost: number; dailyAvg: number; projectedMonthly: number }>;
  totalProjectedMonthly: number;
}

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
  vapi?: VapiData;
  projections?: ProjectionsData;
}

const BUDGET_LIMITS: Record<string, number> = {
  openai: 50,
  perplexity: 30,
  gemini: 20,
  vapi: 100,
  'microsoft-graph': 0,
  airtable: 0,
};

export default function ApiUsage() {
  const [data, setData] = useState<ApiUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState('30');
  const [activeTab, setActiveTab] = useState('overview');
  
  // Multi-select filter state (empty array = all selected)
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);

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

  // ========== Filter Options ==========
  const serviceFilterOptions = useMemo(() => {
    if (!data) return [];
    const allServices = new Set<string>();
    data.services.forEach(s => allServices.add(s));
    data.consumption?.consumptionServices.forEach(s => allServices.add(s));
    data.consumption?.breakdown.forEach(b => allServices.add(b.service));
    return [...allServices].sort().map(s => ({
      value: s,
      label: formatServiceName(s),
      color: getServiceColor(s),
      count: data.serviceBreakdown.find(b => b.service === s)?.total || 
             data.consumption?.breakdown.find(b => b.service === s)?.requests || 0,
    }));
  }, [data]);

  const modelFilterOptions = useMemo(() => {
    if (!data?.consumption) return [];
    return data.consumption.modelDistribution.map(m => ({
      value: m.model,
      label: m.model,
      count: m.count,
    }));
  }, [data]);

  const statusFilterOptions = useMemo(() => [
    { value: 'success', label: 'Success', color: 'hsl(142, 71%, 45%)' },
    { value: 'error', label: 'Error', color: 'hsl(0, 84%, 60%)' },
  ], []);

  // ========== Filtered data helpers ==========
  const filteredHealthServices = useMemo(() => {
    if (!data) return [];
    if (selectedServices.length === 0) return data.services;
    return data.services.filter(s => selectedServices.includes(s));
  }, [data, selectedServices]);

  const filteredConsumptionServices = useMemo(() => {
    if (!data?.consumption) return [];
    if (selectedServices.length === 0) return data.consumption.consumptionServices;
    return data.consumption.consumptionServices.filter(s => selectedServices.includes(s));
  }, [data, selectedServices]);

  // ========== Health chart data (filtered) ==========
  const volumeChartData = useMemo(() => {
    if (!data) return [];
    return data.dailyVolume.map(entry => {
      const row: Record<string, any> = { date: entry.date };
      for (const svc of filteredHealthServices) {
        row[svc] = entry[svc] || 0;
      }
      return row;
    });
  }, [data, filteredHealthServices]);

  const responseTimeData = useMemo(() => {
    if (!data) return [];
    return data.dailyVolume.map(entry => {
      const row: Record<string, any> = { date: entry.date };
      for (const svc of filteredHealthServices) {
        row[svc] = entry[`${svc}_avgTime`] || 0;
      }
      return row;
    });
  }, [data, filteredHealthServices]);

  const successErrorData = useMemo(() => {
    if (!data) return [];
    return data.dailyVolume.map(entry => {
      let totalSuccess = 0;
      let totalErrors = 0;
      for (const svc of filteredHealthServices) {
        totalSuccess += entry[`${svc}_success`] || 0;
        totalErrors += entry[`${svc}_errors`] || 0;
      }
      return { date: entry.date, success: totalSuccess, errors: totalErrors };
    });
  }, [data, filteredHealthServices]);

  const donutData = useMemo(() => {
    if (!data) return [];
    return data.serviceBreakdown
      .filter(s => selectedServices.length === 0 || selectedServices.includes(s.service))
      .sort((a, b) => b.total - a.total)
      .map(s => ({ name: formatServiceName(s.service), value: s.total, service: s.service }));
  }, [data, selectedServices]);

  const qualityData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.dataQuality).map(([key, value]) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      value,
    }));
  }, [data]);

  // ========== Consumption chart data (filtered) ==========
  const tokenChartData = useMemo(() => {
    if (!data?.consumption) return [];
    return data.consumption.dailyConsumption.map(entry => {
      const row: Record<string, any> = { date: entry.date };
      for (const svc of filteredConsumptionServices) {
        row[svc] = entry[`${svc}_tokens`] || 0;
      }
      return row;
    });
  }, [data, filteredConsumptionServices]);

  const costChartData = useMemo(() => {
    if (!data?.consumption) return [];
    return data.consumption.dailyConsumption.map(entry => {
      let dayCost = 0;
      if (selectedServices.length === 0) {
        dayCost = entry.totalCost || 0;
      } else {
        for (const svc of filteredConsumptionServices) {
          dayCost += entry[`${svc}_cost`] || 0;
        }
      }
      return { date: entry.date, cost: Math.round(dayCost * 10000) / 10000 };
    });
  }, [data, filteredConsumptionServices, selectedServices]);

  const modelDonutData = useMemo(() => {
    if (!data?.consumption) return [];
    return data.consumption.modelDistribution
      .filter(m => selectedModels.length === 0 || selectedModels.includes(m.model))
      .map(m => ({
        name: m.model,
        value: m.count,
      }));
  }, [data, selectedModels]);

  const filteredConsumptionBreakdown = useMemo(() => {
    if (!data?.consumption) return [];
    return data.consumption.breakdown
      .filter(b => selectedServices.length === 0 || selectedServices.includes(b.service))
      .sort((a, b) => b.tokens - a.tokens);
  }, [data, selectedServices]);

  const filteredUsageLogs = useMemo(() => {
    if (!data?.consumption) return [];
    return data.consumption.recentUsageLogs.filter(log => {
      const serviceMatch = selectedServices.length === 0 || selectedServices.includes(log.service);
      const modelMatch = selectedModels.length === 0 || (log.model && selectedModels.includes(log.model));
      const statusMatch = selectedStatuses.length === 0 || selectedStatuses.includes(log.status);
      return serviceMatch && modelMatch && statusMatch;
    });
  }, [data, selectedServices, selectedModels, selectedStatuses]);

  const filteredHealthLogs = useMemo(() => {
    if (!data) return [];
    return data.recentLogs.filter(log => {
      const serviceMatch = selectedServices.length === 0 || selectedServices.includes(log.service);
      const statusMatch = selectedStatuses.length === 0 || selectedStatuses.includes(log.status);
      return serviceMatch && statusMatch;
    });
  }, [data, selectedServices, selectedStatuses]);

  const filteredServiceBreakdown = useMemo(() => {
    if (!data) return [];
    return data.serviceBreakdown
      .filter(s => selectedServices.length === 0 || selectedServices.includes(s.service))
      .sort((a, b) => b.total - a.total);
  }, [data, selectedServices]);

  // Compute combined total cost for header
  const totalCombinedCost = useMemo(() => {
    if (!data) return 0;
    const apiCost = data.consumption?.summary.totalCost || 0;
    const vapiCost = data.vapi?.totalCost || 0;
    return Math.round((apiCost + vapiCost) * 100) / 100;
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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          {[...Array(5)].map((_, i) => (
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
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">API Usage & Costs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor health, tokens, VAPI calls, and projected costs across all integrations
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

      {/* Multi-Select Filters */}
      {data && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mr-1">Filters:</span>
          <MultiSelectFilter
            label="Services"
            options={serviceFilterOptions}
            selected={selectedServices}
            onChange={setSelectedServices}
            icon={<Server className="h-3.5 w-3.5" />}
          />
          {modelFilterOptions.length > 0 && (
            <MultiSelectFilter
              label="Models"
              options={modelFilterOptions}
              selected={selectedModels}
              onChange={setSelectedModels}
              icon={<Brain className="h-3.5 w-3.5" />}
            />
          )}
          <MultiSelectFilter
            label="Status"
            options={statusFilterOptions}
            selected={selectedStatuses}
            onChange={setSelectedStatuses}
            icon={<Activity className="h-3.5 w-3.5" />}
          />
          {(selectedServices.length > 0 || selectedModels.length > 0 || selectedStatuses.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSelectedServices([]); setSelectedModels([]); setSelectedStatuses([]); }}
              className="text-xs text-muted-foreground hover:text-foreground gap-1 h-9"
            >
              <X className="h-3 w-3" /> Clear all
            </Button>
          )}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Zap className="h-4 w-4 text-primary" />
                <span className="text-[10px] font-medium uppercase tracking-wider">API Calls</span>
              </div>
              <p className="text-xl font-bold text-foreground">{data.summary.totalCalls.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{data.summary.successRate}% success</p>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Phone className="h-4 w-4 text-pink-500" />
                <span className="text-[10px] font-medium uppercase tracking-wider">VAPI Calls</span>
              </div>
              <p className="text-xl font-bold text-foreground">{data.vapi?.totalCalls || 0}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{data.vapi?.totalMinutes || 0} min</p>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Hash className="h-4 w-4 text-primary" />
                <span className="text-[10px] font-medium uppercase tracking-wider">LLM Tokens</span>
              </div>
              <p className="text-xl font-bold text-foreground">
                {data.consumption ? (data.consumption.summary.totalTokens / 1000).toFixed(1) + 'k' : '—'}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {data.consumption ? `${data.consumption.summary.totalRequests} calls` : 'No data'}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <DollarSign className="h-4 w-4 text-green-500" />
                <span className="text-[10px] font-medium uppercase tracking-wider">Total Spend</span>
              </div>
              <p className="text-xl font-bold text-foreground">${totalCombinedCost.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{data.summary.period}</p>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/80 backdrop-blur-sm col-span-2 sm:col-span-1">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <CalendarDays className="h-4 w-4 text-orange-500" />
                <span className="text-[10px] font-medium uppercase tracking-wider">Projected /mo</span>
              </div>
              <p className="text-xl font-bold text-foreground">
                ${data.projections?.totalProjectedMonthly?.toFixed(2) || '0.00'}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Based on {data.summary.period} avg
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50 overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="consumption">LLM Costs</TabsTrigger>
          <TabsTrigger value="vapi">VAPI & Voice</TabsTrigger>
          <TabsTrigger value="budget">Budget</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
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
                          {filteredHealthServices.map(svc => (
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
                        {filteredHealthServices.map(svc => (
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

        {/* ==================== LLM Costs Tab ==================== */}
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
                          {filteredConsumptionServices.map(svc => (
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
                        {filteredConsumptionServices.map(svc => (
                          <Area key={svc} type="monotone" dataKey={svc} name={formatServiceName(svc)} stackId="1" stroke={getServiceColor(svc)} fill={`url(#tok-gradient-${svc})`} strokeWidth={2} />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Cost Trend */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Coins className="h-4 w-4 text-primary" />
                    Estimated Cost Trend
                  </CardTitle>
                  <CardDescription className="text-xs">Daily estimated LLM spend (USD)</CardDescription>
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
                {filteredConsumptionBreakdown
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
                {filteredConsumptionBreakdown.length === 0 && (
                  <div className="lg:col-span-3 p-8 text-center text-muted-foreground text-sm">
                    No consumption data logged yet.
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
                        {filteredUsageLogs.map(log => (
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
                  {filteredUsageLogs.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                      No LLM usage logged yet.
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

        {/* ==================== VAPI & Voice Tab (NEW) ==================== */}
        <TabsContent value="vapi" className="space-y-4 mt-4">
          {data?.vapi && data.vapi.totalCalls > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* VAPI Summary Cards */}
              <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                  <CardContent className="p-4 text-center">
                    <Phone className="h-5 w-5 mx-auto mb-2 text-pink-500" />
                    <p className="text-2xl font-bold text-foreground">{data.vapi.totalCalls}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Total Calls</p>
                    <div className="flex justify-center gap-3 mt-2">
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <PhoneIncoming className="h-3 w-3" /> {data.vapi.inbound}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <PhoneOutgoing className="h-3 w-3" /> {data.vapi.outbound}
                      </span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                  <CardContent className="p-4 text-center">
                    <Clock className="h-5 w-5 mx-auto mb-2 text-blue-500" />
                    <p className="text-2xl font-bold text-foreground">{data.vapi.totalMinutes}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Total Minutes</p>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      ~{data.vapi.totalCalls > 0 ? Math.round(data.vapi.totalMinutes / data.vapi.totalCalls) : 0} min/call avg
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                  <CardContent className="p-4 text-center">
                    <DollarSign className="h-5 w-5 mx-auto mb-2 text-green-500" />
                    <p className="text-2xl font-bold text-foreground">${data.vapi.totalCost.toFixed(2)}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Total Cost</p>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      ${data.vapi.avgCostPerCall.toFixed(2)}/call
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                  <CardContent className="p-4 text-center">
                    <CalendarDays className="h-5 w-5 mx-auto mb-2 text-orange-500" />
                    <p className="text-2xl font-bold text-foreground">${data.projections?.projectedMonthlyVapi?.toFixed(2) || '0'}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Projected /mo</p>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      incl. Twilio telephony
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* VAPI Call Volume + Cost Trend (Composed Chart) */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Phone className="h-4 w-4 text-pink-500" />
                    Daily VAPI Call Volume & Cost
                  </CardTitle>
                  <CardDescription className="text-xs">Calls (bars) and cost (line) over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[320px] sm:h-[380px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={data.vapi.dailyTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => v.slice(5)} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${v}`} />
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Bar yAxisId="left" dataKey="calls" name="Calls" fill="hsl(328, 73%, 56%)" radius={[4, 4, 0, 0]} opacity={0.7} />
                        <Line yAxisId="right" type="monotone" dataKey="cost" name="Cost ($)" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* VAPI Minutes Trend */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-500" />
                    Daily Call Minutes
                  </CardTitle>
                  <CardDescription className="text-xs">Minutes consumed per day (Twilio telephony)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px] sm:h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.vapi.dailyTrend}>
                        <defs>
                          <linearGradient id="minutesGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => v.slice(5)} />
                        <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} unit=" min" />
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} formatter={(v: any) => [`${v} min`, 'Minutes']} />
                        <Area type="monotone" dataKey="minutes" stroke="hsl(262, 83%, 58%)" fill="url(#minutesGradient)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="p-12 text-center text-muted-foreground">
              <Phone className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No VAPI call data yet</p>
              <p className="text-sm mt-1">Call logs will appear here as voice calls are made through VAPI.</p>
            </div>
          )}
        </TabsContent>

        {/* ==================== Budget Tab (NEW) ==================== */}
        <TabsContent value="budget" className="space-y-4 mt-4">
          {data?.projections ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Monthly Projection Summary */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-orange-500" />
                    Projected Monthly Spend
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Based on {data.summary.period} average daily usage extrapolated to 30 days
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    <div className="text-center p-4 rounded-lg bg-muted/30 border border-border/30">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">LLM APIs</p>
                      <p className="text-2xl font-bold text-foreground">${data.projections.projectedMonthlyCost.toFixed(2)}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">${data.projections.dailyAvgCost.toFixed(4)}/day avg</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-muted/30 border border-border/30">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">VAPI + Twilio</p>
                      <p className="text-2xl font-bold text-foreground">${data.projections.projectedMonthlyVapi.toFixed(2)}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">Voice & telephony</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-primary/10 border border-primary/20">
                      <p className="text-[10px] text-primary uppercase tracking-wider mb-1 font-semibold">Total Projected</p>
                      <p className="text-2xl font-bold text-primary">${data.projections.totalProjectedMonthly.toFixed(2)}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">per month</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Per-Service Budget Bars */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-500" />
                    Service Budget Tracking
                  </CardTitle>
                  <CardDescription className="text-xs">Current spend vs projected monthly by service</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* VAPI budget */}
                    {data.vapi && data.vapi.totalCost > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getServiceColor('vapi') }} />
                            <span className="text-sm font-medium text-foreground">VAPI + Twilio</span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-bold text-foreground">${data.projections.projectedMonthlyVapi.toFixed(2)}</span>
                            {BUDGET_LIMITS.vapi > 0 && (
                              <span className="text-xs text-muted-foreground ml-1">/ ${BUDGET_LIMITS.vapi}</span>
                            )}
                          </div>
                        </div>
                        {BUDGET_LIMITS.vapi > 0 && (
                          <Progress
                            value={Math.min(100, (data.projections.projectedMonthlyVapi / BUDGET_LIMITS.vapi) * 100)}
                            className="h-2"
                          />
                        )}
                        {BUDGET_LIMITS.vapi > 0 && data.projections.projectedMonthlyVapi > BUDGET_LIMITS.vapi * 0.8 && (
                          <p className="text-[10px] text-destructive mt-1 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {data.projections.projectedMonthlyVapi > BUDGET_LIMITS.vapi ? 'Over budget!' : 'Approaching budget limit'}
                          </p>
                        )}
                      </div>
                    )}

                    {/* LLM service budgets */}
                    {data.projections.serviceProjections
                      .sort((a, b) => b.projectedMonthly - a.projectedMonthly)
                      .map(svc => {
                        const limit = BUDGET_LIMITS[svc.service] || 0;
                        const pct = limit > 0 ? Math.min(100, (svc.projectedMonthly / limit) * 100) : 0;
                        const isWarning = limit > 0 && svc.projectedMonthly > limit * 0.8;
                        const isOver = limit > 0 && svc.projectedMonthly > limit;
                        return (
                          <div key={svc.service}>
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getServiceColor(svc.service) }} />
                                <span className="text-sm font-medium text-foreground">{formatServiceName(svc.service)}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-sm font-bold text-foreground">${svc.projectedMonthly.toFixed(2)}</span>
                                {limit > 0 && (
                                  <span className="text-xs text-muted-foreground ml-1">/ ${limit}</span>
                                )}
                              </div>
                            </div>
                            {limit > 0 && <Progress value={pct} className="h-2" />}
                            {isWarning && (
                              <p className="text-[10px] text-destructive mt-1 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                {isOver ? 'Over budget!' : 'Approaching budget limit'}
                              </p>
                            )}
                            <div className="flex justify-between mt-1">
                              <span className="text-[10px] text-muted-foreground">Current: ${svc.currentCost.toFixed(4)}</span>
                              <span className="text-[10px] text-muted-foreground">${svc.dailyAvg.toFixed(4)}/day</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="p-12 text-center text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No budget data available</p>
              <p className="text-sm mt-1">Cost projections will appear as usage data accumulates.</p>
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
                        {filteredHealthServices.map(svc => (
                          <Line key={svc} type="monotone" dataKey={svc} name={formatServiceName(svc)} stroke={getServiceColor(svc)} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredServiceBreakdown
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
                    <BarChart data={filteredServiceBreakdown.map(s => ({ ...s, name: formatServiceName(s.service) }))} layout="vertical">
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
                      {filteredHealthLogs.map(log => (
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
                {filteredHealthLogs.length === 0 && (
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
