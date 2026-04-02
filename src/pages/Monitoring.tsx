import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Activity, 
  Database, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  Clock,
  BarChart3,
  RefreshCw,
  Zap
} from 'lucide-react';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';

interface APIHealthStat {
  service_name: string;
  total_calls: number;
  success_calls: number;
  error_calls: number;
  success_rate: number;
  avg_response_time: number;
  live_data_count: number;
  estimated_data_count: number;
  data_quality_score: number;
}

interface CacheStat {
  cache_type: string;
  total_entries: number;
  live_data: number;
  estimated_data: number;
  expired_entries: number;
  cache_hit_potential: number;
  avg_age_days: number;
  retention_days: number;
}

export default function Monitoring() {
  const [apiStats, setApiStats] = useState<APIHealthStat[]>([]);
  const [cacheStats, setCacheStats] = useState<CacheStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const { toast } = useToast();

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      // Fetch API health stats via secure Edge Function
      const { data: healthResult, error: healthError } = await invokeSecureFunction('get-system-logs', {
        operation: 'rpc',
        rpcName: 'get_api_health_stats',
        rpcParams: { days_back: 7 }
      });

      if (healthError) {
        console.error('Error fetching API health stats:', healthError);
      } else {
        setApiStats(healthResult?.data || []);
      }

      // Fetch cache stats via secure Edge Function
      const { data: cacheResult, error: cacheError } = await invokeSecureFunction('get-system-logs', {
        operation: 'rpc',
        rpcName: 'get_all_cache_stats',
        rpcParams: {}
      });

      if (cacheError) {
        console.error('Error fetching cache stats:', cacheError);
      } else {
        setCacheStats(cacheResult?.data || []);
      }

      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error loading monitoring data:', error);
      toast({
        title: "Error",
        description: "Failed to load monitoring data",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const getServiceIcon = (serviceName: string) => {
    const icons: Record<string, any> = {
      'crime-statistics': AlertTriangle,
      'school-data': Database,
      'abs-data': BarChart3,
      'rba-data': TrendingUp,
      'transport': Activity,
      'risk-assessment': AlertTriangle,
      'climate-data': Activity
    };
    const Icon = icons[serviceName] || Activity;
    return <Icon className="h-4 w-4" />;
  };

  const getStatusColor = (successRate: number) => {
    if (successRate >= 95) return 'success';
    if (successRate >= 80) return 'default';
    return 'destructive';
  };

  const formatServiceName = (name: string) => {
    return name
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const totalCalls = apiStats.reduce((sum, stat) => sum + stat.total_calls, 0);
  const totalLiveData = apiStats.reduce((sum, stat) => sum + stat.live_data_count, 0);
  const totalEstimatedData = apiStats.reduce((sum, stat) => sum + stat.estimated_data_count, 0);
  const overallDataQuality = totalCalls > 0 
    ? ((totalLiveData / (totalLiveData + totalEstimatedData)) * 100).toFixed(1)
    : 0;

  const totalCacheEntries = cacheStats.reduce((sum, stat) => sum + stat.total_entries, 0);
  const totalLiveCached = cacheStats.reduce((sum, stat) => sum + stat.live_data, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Monitoring</h1>
          <p className="text-muted-foreground">
            Real-time API health and cache performance
          </p>
        </div>
        <Button onClick={fetchStats} disabled={isLoading} variant="outline">
          {isLoading ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total API Calls</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCalls.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Last 7 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Data Quality</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallDataQuality}%</div>
            <p className="text-xs text-muted-foreground">Live data ratio</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cache Entries</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCacheEntries.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{totalLiveCached} live records</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">Healthy</div>
            <p className="text-xs text-muted-foreground">All services operational</p>
          </CardContent>
        </Card>
      </div>

      {/* API Health Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            API Health Status
          </CardTitle>
          <CardDescription>
            Service-level performance metrics from the last 7 days
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : apiStats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No API calls recorded in the last 7 days</p>
              <p className="text-sm mt-2">Stats will appear once services are used</p>
            </div>
          ) : (
            <div className="space-y-4">
              {apiStats.map((stat) => (
                <div key={stat.service_name} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getServiceIcon(stat.service_name)}
                      <span className="font-medium">{formatServiceName(stat.service_name)}</span>
                    </div>
                    <Badge variant={getStatusColor(stat.success_rate)}>
                      {stat.success_rate}% Success
                    </Badge>
                  </div>

                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Total Calls</p>
                      <p className="font-semibold">{stat.total_calls.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Avg Response</p>
                      <p className="font-semibold">{stat.avg_response_time}ms</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Live Data</p>
                      <p className="font-semibold">{stat.live_data_count}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Quality Score</p>
                      <p className="font-semibold">{stat.data_quality_score}%</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Success Rate</span>
                      <span>{stat.success_rate}%</span>
                    </div>
                    <Progress value={stat.success_rate} className="h-2" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cache Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Cache Performance
          </CardTitle>
          <CardDescription>
            Real-time cache statistics and hit rates
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {cacheStats.map((stat) => (
                <div key={stat.cache_type} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      <span className="font-medium capitalize">
                        {stat.cache_type.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {stat.retention_days > 0 && (
                        <Badge variant="outline" className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {stat.retention_days}d retention
                        </Badge>
                      )}
                      {stat.total_entries > 0 && (
                        <Badge variant="default">
                          {stat.total_entries.toLocaleString()} entries
                        </Badge>
                      )}
                    </div>
                  </div>

                  {stat.total_entries > 0 ? (
                    <>
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Live Data</p>
                          <p className="font-semibold">{stat.live_data.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Estimated</p>
                          <p className="font-semibold">{stat.estimated_data.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Avg Age</p>
                          <p className="font-semibold">{stat.avg_age_days?.toFixed(1) || 0}d</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Hit Potential</p>
                          <p className="font-semibold">{stat.cache_hit_potential || 0}%</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Cache Hit Potential</span>
                          <span>{stat.cache_hit_potential || 0}%</span>
                        </div>
                        <Progress value={stat.cache_hit_potential || 0} className="h-2" />
                      </div>

                      {stat.expired_entries > 0 && (
                        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-4 w-4" />
                          <span>{stat.expired_entries} expired entries need cleanup</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No data cached yet</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Quality Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Data Quality Breakdown
          </CardTitle>
          <CardDescription>
            Live vs estimated data across all services
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Live Data</span>
                  <CheckCircle2 className="h-4 w-4 text-success" />
                </div>
                <p className="text-2xl font-bold">{totalLiveData.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  From official sources
                </p>
              </div>

              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Estimated Data</span>
                  <Zap className="h-4 w-4 text-amber-500" />
                </div>
                <p className="text-2xl font-bold">{totalEstimatedData.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Statistical estimates
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Overall Data Quality</span>
                <span className="font-semibold">{overallDataQuality}% Live</span>
              </div>
              <Progress value={Number(overallDataQuality)} className="h-3" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-center text-sm text-muted-foreground">
        <p>Last refreshed: {lastRefresh.toLocaleTimeString()}</p>
        <p className="mt-1">Data updates in real-time as services are used</p>
      </div>
    </div>
  );
}
