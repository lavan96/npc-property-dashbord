import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  AlertTriangle, 
  AlertCircle,
  XCircle,
  RefreshCw,
  Search,
  FileText,
  Phone,
  Zap,
  Mail,
  Bot,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Filter,
  TrendingDown,
  CheckCircle2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow, subDays } from 'date-fns';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Link } from 'react-router-dom';
import { useSecureCallLogs } from '@/hooks/useSecureCallLogs';

// Error source types
type ErrorSource = 'investment_report' | 'bulk_generation' | 'vapi_call' | 'api_service' | 'email_sync' | 'automation';
type ErrorSeverity = 'critical' | 'error' | 'warning';

interface UnifiedError {
  id: string;
  source: ErrorSource;
  severity: ErrorSeverity;
  errorCode: string;
  errorMessage: string;
  rawError?: string;
  entityId?: string;
  entityType?: string;
  entityLabel?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  resolved?: boolean;
}

interface ErrorStats {
  total: number;
  critical: number;
  error: number;
  warning: number;
  bySource: Record<ErrorSource, number>;
  trend: 'up' | 'down' | 'stable';
  last24h: number;
  last7d: number;
}

const SOURCE_CONFIG: Record<ErrorSource, { label: string; icon: React.ElementType; color: string }> = {
  investment_report: { label: 'Investment Reports', icon: FileText, color: 'text-blue-500' },
  bulk_generation: { label: 'Bulk Generation', icon: Zap, color: 'text-purple-500' },
  vapi_call: { label: 'Voice AI (Vapi)', icon: Phone, color: 'text-green-500' },
  api_service: { label: 'API Services', icon: Bot, color: 'text-orange-500' },
  email_sync: { label: 'Email Sync', icon: Mail, color: 'text-cyan-500' },
  automation: { label: 'Automation', icon: RefreshCw, color: 'text-pink-500' },
};

const SEVERITY_CONFIG: Record<ErrorSeverity, { label: string; variant: 'destructive' | 'default' | 'outline'; icon: React.ElementType }> = {
  critical: { label: 'Critical', variant: 'destructive', icon: XCircle },
  error: { label: 'Error', variant: 'destructive', icon: AlertCircle },
  warning: { label: 'Warning', variant: 'outline', icon: AlertTriangle },
};

export default function ErrorLogs() {
  const [errors, setErrors] = useState<UnifiedError[]>([]);
  const [stats, setStats] = useState<ErrorStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState<ErrorSource | 'all'>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<ErrorSeverity | 'all'>('all');
  const [dateRange, setDateRange] = useState<'24h' | '7d' | '30d'>('7d');
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { fetchErrorCalls } = useSecureCallLogs();

  const fetchErrors = useCallback(async () => {
    setIsLoading(true);
    try {
      const cutoffDate = subDays(new Date(), dateRange === '24h' ? 1 : dateRange === '7d' ? 7 : 30);
      const unifiedErrors: UnifiedError[] = [];

      // 1. Fetch investment report generation errors
      const { data: reportGenErrors } = await supabase
        .from('auto_report_generation_log')
        .select('*')
        .eq('status', 'failed')
        .gte('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(100);

      if (reportGenErrors) {
        reportGenErrors.forEach(err => {
          const severity = determineSeverity(err.error_message);
          unifiedErrors.push({
            id: `report-gen-${err.id}`,
            source: 'investment_report',
            severity,
            errorCode: extractErrorCode(err.error_message),
            errorMessage: cleanErrorMessage(err.error_message),
            rawError: err.error_message,
            entityId: err.report_id,
            entityType: 'investment_report',
            entityLabel: err.listing_address,
            metadata: { switchName: err.switch_name, listingId: err.listing_id },
            createdAt: new Date(err.created_at),
          });
        });
      }

      // 2. Fetch bulk generation item errors
      const { data: bulkErrors } = await supabase
        .from('bulk_generation_items')
        .select('*')
        .eq('status', 'failed')
        .gte('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(100);

      if (bulkErrors) {
        bulkErrors.forEach(err => {
          const severity = determineSeverity(err.error_message);
          unifiedErrors.push({
            id: `bulk-${err.id}`,
            source: 'bulk_generation',
            severity,
            errorCode: extractErrorCode(err.error_message),
            errorMessage: cleanErrorMessage(err.error_message),
            rawError: err.error_message,
            entityId: err.report_id,
            entityType: 'investment_report',
            entityLabel: err.property_address,
            metadata: { jobId: err.job_id, processingTime: err.processing_time_seconds },
            createdAt: new Date(err.created_at),
          });
        });
      }

      // 3. Fetch API health errors
      const { data: apiErrors } = await supabase
        .from('api_health_log')
        .select('*')
        .eq('status', 'error')
        .gte('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(100);

      if (apiErrors) {
        apiErrors.forEach(err => {
          unifiedErrors.push({
            id: `api-${err.id}`,
            source: 'api_service',
            severity: 'error',
            errorCode: `${err.service_name?.toUpperCase()}_ERROR`,
            errorMessage: err.error_message || `${err.service_name} service failed`,
            rawError: err.error_message,
            entityLabel: err.service_name,
            metadata: { endpoint: err.endpoint, responseTime: err.response_time_ms },
            createdAt: new Date(err.created_at),
          });
        });
      }

      // 4. Fetch Vapi call errors via secure hook
      const { data: vapiErrors } = await fetchErrorCalls(cutoffDate.toISOString(), 100);

      if (vapiErrors) {
        vapiErrors.forEach(err => {
          const severity = err.call_outcome === 'failed' || err.call_outcome === 'error' ? 'error' : 'warning';
          unifiedErrors.push({
            id: `vapi-${err.id}`,
            source: 'vapi_call',
            severity,
            errorCode: `VAPI_${err.call_outcome?.toUpperCase() || 'UNKNOWN'}`,
            errorMessage: `Call ${err.call_outcome}: ${err.customer_name || err.phone_number || 'Unknown caller'}`,
            entityId: err.id,
            entityType: 'vapi_call',
            entityLabel: err.phone_number,
            metadata: { 
              agentName: err.agent_name, 
              duration: err.duration_seconds,
              direction: err.call_direction,
              squadName: err.squad_name
            },
            createdAt: new Date(err.created_at),
          });
        });
      }

      // 5. Fetch stuck investment reports (processing for >30 min)
      const stuckThreshold = new Date(Date.now() - 30 * 60 * 1000);
      const { data: stuckReports } = await supabase
        .from('investment_reports')
        .select('id, property_address, status, created_at, updated_at, error_message')
        .eq('status', 'processing')
        .lt('created_at', stuckThreshold.toISOString())
        .gte('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(50);

      if (stuckReports) {
        stuckReports.forEach(report => {
          unifiedErrors.push({
            id: `stuck-${report.id}`,
            source: 'investment_report',
            severity: 'warning',
            errorCode: 'REPORT_STUCK_PROCESSING',
            errorMessage: `Report stuck in processing for ${formatDistanceToNow(new Date(report.created_at))}`,
            entityId: report.id,
            entityType: 'investment_report',
            entityLabel: report.property_address,
            metadata: { status: report.status },
            createdAt: new Date(report.created_at),
          });
        });
      }

      // 6. Fetch failed investment reports
      const { data: failedReports } = await supabase
        .from('investment_reports')
        .select('id, property_address, status, created_at, error_message')
        .eq('status', 'failed')
        .gte('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(50);

      if (failedReports) {
        failedReports.forEach(report => {
          unifiedErrors.push({
            id: `failed-report-${report.id}`,
            source: 'investment_report',
            severity: 'error',
            errorCode: extractErrorCode(report.error_message),
            errorMessage: report.error_message || 'Report generation failed',
            rawError: report.error_message,
            entityId: report.id,
            entityType: 'investment_report',
            entityLabel: report.property_address,
            createdAt: new Date(report.created_at),
          });
        });
      }

      // Sort all errors by date
      unifiedErrors.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      // Calculate stats
      const now = new Date();
      const last24h = unifiedErrors.filter(e => e.createdAt > subDays(now, 1)).length;
      const last7d = unifiedErrors.filter(e => e.createdAt > subDays(now, 7)).length;

      const bySource = Object.keys(SOURCE_CONFIG).reduce((acc, source) => {
        acc[source as ErrorSource] = unifiedErrors.filter(e => e.source === source).length;
        return acc;
      }, {} as Record<ErrorSource, number>);

      setStats({
        total: unifiedErrors.length,
        critical: unifiedErrors.filter(e => e.severity === 'critical').length,
        error: unifiedErrors.filter(e => e.severity === 'error').length,
        warning: unifiedErrors.filter(e => e.severity === 'warning').length,
        bySource,
        trend: last24h > (last7d / 7) ? 'up' : last24h < (last7d / 7) ? 'down' : 'stable',
        last24h,
        last7d,
      });

      setErrors(unifiedErrors);
    } catch (error) {
      console.error('Error fetching error logs:', error);
      toast({
        title: "Error",
        description: "Failed to load error logs",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, toast]);

  useEffect(() => {
    fetchErrors();
  }, [fetchErrors]);

  const toggleExpanded = (id: string) => {
    setExpandedErrors(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleRetryReport = async (reportId: string, address: string) => {
    try {
      // First, reset the report status to pending
      await supabase
        .from('investment_reports')
        .update({ status: 'pending', error_message: null })
        .eq('id', reportId);

      // Call the edge function to regenerate
      const { error } = await supabase.functions.invoke('generate-investment-report', {
        body: { reportId }
      });

      if (error) throw error;

      toast({
        title: "Report generation started",
        description: `Retrying generation for ${address}`,
      });

      // Refresh errors list after a short delay
      setTimeout(fetchErrors, 2000);
    } catch (error) {
      console.error('Retry failed:', error);
      toast({
        title: "Retry failed",
        description: error instanceof Error ? error.message : "Failed to retry report generation",
        variant: "destructive"
      });
    }
  };

  // Filter errors
  const filteredErrors = errors.filter(err => {
    if (selectedSource !== 'all' && err.source !== selectedSource) return false;
    if (selectedSeverity !== 'all' && err.severity !== selectedSeverity) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        err.errorMessage.toLowerCase().includes(query) ||
        err.errorCode.toLowerCase().includes(query) ||
        err.entityLabel?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Error Logs</h1>
          <p className="text-muted-foreground">
            Unified error monitoring across all integrations
          </p>
        </div>
        <Button onClick={fetchErrors} disabled={isLoading} variant="outline">
          {isLoading ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Errors</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">
                Last {dateRange === '24h' ? '24 hours' : dateRange === '7d' ? '7 days' : '30 days'}
              </p>
            </CardContent>
          </Card>

          <Card className="border-red-200 dark:border-red-900">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Critical</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">{stats.critical}</div>
              <p className="text-xs text-muted-foreground">Require immediate attention</p>
            </CardContent>
          </Card>

          <Card className="border-orange-200 dark:border-orange-900">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Errors</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500">{stats.error}</div>
              <p className="text-xs text-muted-foreground">Failed operations</p>
            </CardContent>
          </Card>

          <Card className="border-yellow-200 dark:border-yellow-900">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Warnings</CardTitle>
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-500">{stats.warning}</div>
              <p className="text-xs text-muted-foreground">Potential issues</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Trend</CardTitle>
              {stats.trend === 'down' ? (
                <TrendingDown className="h-4 w-4 text-green-500" />
              ) : stats.trend === 'up' ? (
                <TrendingDown className="h-4 w-4 text-red-500 rotate-180" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              )}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.trend === 'down' ? '↓ Improving' : stats.trend === 'up' ? '↑ Increasing' : '→ Stable'}
              </div>
              <p className="text-xs text-muted-foreground">{stats.last24h} in last 24h</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search errors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <Select value={selectedSource} onValueChange={(v) => setSelectedSource(v as ErrorSource | 'all')}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {Object.entries(SOURCE_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedSeverity} onValueChange={(v) => setSelectedSeverity(v as ErrorSeverity | 'all')}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All Severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
              </SelectContent>
            </Select>

            <Select value={dateRange} onValueChange={(v) => setDateRange(v as '24h' | '7d' | '30d')}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Error Tabs by Source */}
      <Tabs defaultValue="all">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="all" className="gap-2">
            All
            <Badge variant="secondary" className="ml-1">{filteredErrors.length}</Badge>
          </TabsTrigger>
          {Object.entries(SOURCE_CONFIG).map(([key, config]) => {
            const count = filteredErrors.filter(e => e.source === key).length;
            if (count === 0) return null;
            const Icon = config.icon;
            return (
              <TabsTrigger key={key} value={key} className="gap-2">
                <Icon className={`h-4 w-4 ${config.color}`} />
                {config.label}
                <Badge variant="secondary" className="ml-1">{count}</Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <ErrorList 
            errors={filteredErrors} 
            expandedErrors={expandedErrors}
            toggleExpanded={toggleExpanded}
            isLoading={isLoading}
            onRetryReport={handleRetryReport}
          />
        </TabsContent>

        {Object.keys(SOURCE_CONFIG).map(key => (
          <TabsContent key={key} value={key} className="mt-4">
            <ErrorList 
              errors={filteredErrors.filter(e => e.source === key)} 
              expandedErrors={expandedErrors}
              toggleExpanded={toggleExpanded}
              isLoading={isLoading}
              onRetryReport={handleRetryReport}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// Error List Component
function ErrorList({ 
  errors, 
  expandedErrors, 
  toggleExpanded,
  isLoading,
  onRetryReport
}: { 
  errors: UnifiedError[]; 
  expandedErrors: Set<string>;
  toggleExpanded: (id: string) => void;
  isLoading: boolean;
  onRetryReport: (reportId: string, address: string) => Promise<void>;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (errors.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
          <h3 className="text-lg font-semibold">No errors found</h3>
          <p className="text-muted-foreground">All systems operating normally</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {errors.map(error => (
        <ErrorCard 
          key={error.id} 
          error={error} 
          isExpanded={expandedErrors.has(error.id)}
          onToggle={() => toggleExpanded(error.id)}
          onRetryReport={onRetryReport}
        />
      ))}
    </div>
  );
}

// Error Card Component
function ErrorCard({ 
  error, 
  isExpanded, 
  onToggle,
  onRetryReport
}: { 
  error: UnifiedError; 
  isExpanded: boolean;
  onToggle: () => void;
  onRetryReport: (reportId: string, address: string) => Promise<void>;
}) {
  const [isRetrying, setIsRetrying] = useState(false);
  const sourceConfig = SOURCE_CONFIG[error.source];
  const severityConfig = SEVERITY_CONFIG[error.severity];
  const SourceIcon = sourceConfig.icon;
  const SeverityIcon = severityConfig.icon;

  const getEntityLink = () => {
    if (error.entityType === 'investment_report' && error.entityId) {
      return `/investment-report/${error.entityId}`;
    }
    if (error.entityType === 'vapi_call') {
      return '/call-logs';
    }
    return null;
  };

  const entityLink = getEntityLink();
  const canRetry = error.entityType === 'investment_report' && error.entityId;

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!error.entityId) return;
    setIsRetrying(true);
    try {
      await onRetryReport(error.entityId, error.entityLabel || 'Unknown address');
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card className={`transition-all ${
        error.severity === 'critical' ? 'border-red-500/50 bg-red-500/5' :
        error.severity === 'error' ? 'border-orange-500/30 bg-orange-500/5' :
        'border-yellow-500/30 bg-yellow-500/5'
      }`}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className={`mt-0.5 ${sourceConfig.color}`}>
                  <SourceIcon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant={severityConfig.variant} className="gap-1">
                      <SeverityIcon className="h-3 w-3" />
                      {severityConfig.label}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-xs">
                      {error.errorCode}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(error.createdAt, { addSuffix: true })}
                    </span>
                  </div>
                  <p className="font-medium truncate">{error.errorMessage}</p>
                  {error.entityLabel && (
                    <p className="text-sm text-muted-foreground truncate mt-0.5">
                      {error.entityLabel}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canRetry && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-1"
                    onClick={handleRetry}
                    disabled={isRetrying}
                  >
                    <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
                    {isRetrying ? 'Retrying...' : 'Retry'}
                  </Button>
                )}
                {entityLink && (
                  <Link to={entityLink} onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="gap-1">
                      <ExternalLink className="h-4 w-4" />
                      View
                    </Button>
                  </Link>
                )}
                {isExpanded ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            <div className="border-t pt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h4 className="text-sm font-medium mb-2">Details</h4>
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Source:</dt>
                      <dd>{sourceConfig.label}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Time:</dt>
                      <dd>{format(error.createdAt, 'PPpp')}</dd>
                    </div>
                    {error.entityId && (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Entity ID:</dt>
                        <dd className="font-mono text-xs">{error.entityId.slice(0, 8)}...</dd>
                      </div>
                    )}
                  </dl>
                </div>

                {error.metadata && Object.keys(error.metadata).length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Metadata</h4>
                    <dl className="space-y-1 text-sm">
                      {Object.entries(error.metadata).map(([key, value]) => (
                        value && (
                          <div key={key} className="flex justify-between">
                            <dt className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</dt>
                            <dd className="truncate max-w-[150px]">{String(value)}</dd>
                          </div>
                        )
                      ))}
                    </dl>
                  </div>
                )}
              </div>

              {error.rawError && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Raw Error</h4>
                  <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto whitespace-pre-wrap break-all max-h-40">
                    {error.rawError}
                  </pre>
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// Helper functions
function determineSeverity(errorMessage: string | null): ErrorSeverity {
  if (!errorMessage) return 'error';
  const msg = errorMessage.toLowerCase();
  if (msg.includes('critical') || msg.includes('fatal') || msg.includes('crash')) return 'critical';
  if (msg.includes('timeout') || msg.includes('deprecated') || msg.includes('stuck')) return 'warning';
  return 'error';
}

function extractErrorCode(errorMessage: string | null): string {
  if (!errorMessage) return 'UNKNOWN_ERROR';
  
  // Try to extract specific error codes
  if (errorMessage.includes('invalid_model')) return 'PERPLEXITY_INVALID_MODEL';
  if (errorMessage.includes('rate_limit')) return 'API_RATE_LIMIT';
  if (errorMessage.includes('timeout')) return 'REQUEST_TIMEOUT';
  if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) return 'AUTH_ERROR';
  if (errorMessage.includes('403') || errorMessage.includes('forbidden')) return 'PERMISSION_DENIED';
  if (errorMessage.includes('404')) return 'NOT_FOUND';
  if (errorMessage.includes('500')) return 'SERVER_ERROR';
  if (errorMessage.includes('Perplexity')) return 'PERPLEXITY_API_ERROR';
  if (errorMessage.includes('OpenAI')) return 'OPENAI_API_ERROR';
  
  return 'GENERATION_FAILED';
}

function cleanErrorMessage(errorMessage: string | null): string {
  if (!errorMessage) return 'Unknown error occurred';
  
  // Try to extract the most relevant part of the error
  try {
    // Check if it's a JSON error
    if (errorMessage.includes('{')) {
      const jsonMatch = errorMessage.match(/\{.*\}/s);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.error?.message) return parsed.error.message;
        if (parsed.message) return parsed.message;
      }
    }
  } catch {
    // Not JSON, continue
  }
  
  // Remove "Report generation failed:" prefix
  let cleaned = errorMessage.replace(/^Report generation failed:\s*/i, '');
  
  // Truncate if too long
  if (cleaned.length > 200) {
    cleaned = cleaned.slice(0, 200) + '...';
  }
  
  return cleaned;
}
