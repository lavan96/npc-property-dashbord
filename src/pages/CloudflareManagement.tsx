import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import {
  Loader2, RefreshCw, Trash2, Shield, Globe, Activity,
  BarChart3, Zap, FileCode, AlertTriangle, CheckCircle2,
  XCircle, Eye, TrendingUp, HardDrive, ShieldAlert, Plus
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

// ==================== TYPES ====================
interface CloudflareState {
  loading: boolean;
  error: string | null;
}

// ==================== HOOK ====================
function useCloudflareAction<T = any>() {
  const [state, setState] = useState<CloudflareState & { data: T | null }>({
    loading: false,
    error: null,
    data: null,
  });

  const execute = useCallback(async (action: string, params?: any) => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const { data, error } = await invokeSecureFunction<{ success: boolean; data: any }>('cloudflare-proxy', {
        action,
        params,
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.data?.errors?.[0]?.message || 'Cloudflare API error');
      setState({ loading: false, error: null, data: data.data });
      return data.data;
    } catch (err: any) {
      setState(s => ({ ...s, loading: false, error: err.message }));
      return null;
    }
  }, []);

  return { ...state, execute };
}

// ==================== ANALYTICS TAB ====================
function AnalyticsTab() {
  const analytics = useCloudflareAction();
  const [period, setPeriod] = useState('24h');

  const fetchAnalytics = useCallback(() => {
    const now = new Date();
    let since: Date;
    switch (period) {
      case '7d': since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
      case '30d': since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
      default: since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    analytics.execute('analytics_dashboard', {
      since: since.toISOString(),
      until: now.toISOString(),
    });
  }, [period]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  const totals = analytics.data?.result?.totals;
  const timeseries = analytics.data?.result?.timeseries;

  const stats = totals ? [
    { label: 'Total Requests', value: totals.requests?.all?.toLocaleString() || '0', icon: <Globe className="h-5 w-5" />, color: 'text-blue-400' },
    { label: 'Cached Requests', value: totals.requests?.cached?.toLocaleString() || '0', icon: <HardDrive className="h-5 w-5" />, color: 'text-green-400' },
    { label: 'Total Bandwidth', value: formatBytes(totals.bandwidth?.all || 0), icon: <TrendingUp className="h-5 w-5" />, color: 'text-purple-400' },
    { label: 'Threats Blocked', value: totals.threats?.all?.toLocaleString() || '0', icon: <ShieldAlert className="h-5 w-5" />, color: 'text-red-400' },
    { label: 'Page Views', value: totals.pageviews?.all?.toLocaleString() || '0', icon: <Eye className="h-5 w-5" />, color: 'text-amber-400' },
    { label: 'Unique Visitors', value: totals.uniques?.all?.toLocaleString() || '0', icon: <Activity className="h-5 w-5" />, color: 'text-cyan-400' },
  ] : [];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base sm:text-lg font-semibold">Traffic Analytics</h3>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchAnalytics} disabled={analytics.loading}>
            <RefreshCw className={`h-4 w-4 ${analytics.loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {analytics.error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{analytics.error}</AlertDescription>
        </Alert>
      )}

      {analytics.loading && !analytics.data ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : stats.length > 0 ? (
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-3">
          {stats.map(stat => (
            <Card key={stat.label}>
              <CardContent className="p-4 sm:pt-6 sm:px-6">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <div className={`${stat.color} mb-1 sm:mb-0`}>{stat.icon}</div>
                  <div className="min-w-0">
                    <p className="text-xl sm:text-2xl font-bold truncate">{stat.value}</p>
                    <p className="text-[11px] sm:text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !analytics.loading && (
        <p className="text-center text-muted-foreground py-8">No analytics data available.</p>
      )}

      {/* HTTP Status breakdown */}
      {totals?.requests?.http_status && (
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-base">HTTP Status Codes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {Object.entries(totals.requests.http_status).map(([code, count]) => (
                <Badge key={code} variant="outline" className={
                  code.startsWith('2') ? 'border-green-500/30 text-green-400' :
                  code.startsWith('3') ? 'border-blue-500/30 text-blue-400' :
                  code.startsWith('4') ? 'border-yellow-500/30 text-yellow-400' :
                  'border-red-500/30 text-red-400'
                }>
                  {code}: {(count as number).toLocaleString()}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ==================== CDN TAB ====================
function CdnTab() {
  const { toast } = useToast();
  const cacheSettings = useCloudflareAction();
  const purgeAll = useCloudflareAction();
  const purgeUrls = useCloudflareAction();
  const [urls, setUrls] = useState('');

  useEffect(() => {
    cacheSettings.execute('cache_settings');
  }, []);

  const handlePurgeAll = async () => {
    const result = await purgeAll.execute('purge_cache_all');
    if (result?.success) {
      toast({ title: 'Cache Purged', description: 'Entire cache has been purged successfully.' });
    }
  };

  const handlePurgeUrls = async () => {
    const urlList = urls.split('\n').map(u => u.trim()).filter(Boolean);
    if (urlList.length === 0) {
      toast({ title: 'No URLs', description: 'Enter at least one URL to purge.', variant: 'destructive' });
      return;
    }
    const result = await purgeUrls.execute('purge_cache_urls', { urls: urlList });
    if (result?.success) {
      toast({ title: 'URLs Purged', description: `${urlList.length} URL(s) purged from cache.` });
      setUrls('');
    }
  };

  const settings = cacheSettings.data?.result || [];

  return (
    <div className="space-y-4 sm:space-y-6">
      <h3 className="text-base sm:text-lg font-semibold">CDN & Caching</h3>

      {/* Cache Settings */}
      {settings.length > 0 && (
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-base">Current Cache Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:gap-3 sm:grid-cols-2">
              {settings.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between gap-2 p-2.5 sm:p-3 rounded-lg border bg-muted/30">
                  <span className="text-xs sm:text-sm font-medium capitalize truncate">{s.id.replace(/_/g, ' ')}</span>
                  <Badge variant="outline" className="flex-shrink-0 text-[11px] sm:text-xs max-w-[120px] sm:max-w-none truncate">
                    {typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value)}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Purge Controls */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-base">Purge Everything</CardTitle>
            <CardDescription>Clear the entire CDN cache for your zone</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={handlePurgeAll}
              disabled={purgeAll.loading}
              className="w-full"
            >
              {purgeAll.loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Purge All Cache
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-base">Purge by URL</CardTitle>
            <CardDescription>Enter URLs to purge (one per line)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              className="w-full min-h-[80px] p-2 rounded-md border bg-background text-sm resize-y"
              placeholder="https://example.com/page1&#10;https://example.com/page2"
              value={urls}
              onChange={e => setUrls(e.target.value)}
            />
            <Button
              onClick={handlePurgeUrls}
              disabled={purgeUrls.loading || !urls.trim()}
              className="w-full"
            >
              {purgeUrls.loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Purge URLs
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ==================== WORKERS & PAGES TAB ====================
function WorkersTab() {
  const workers = useCloudflareAction();
  const pages = useCloudflareAction();

  useEffect(() => {
    workers.execute('list_workers');
    pages.execute('list_pages');
  }, []);

  const workersList = workers.data?.result || [];
  const pagesList = pages.data?.result || [];
  const isLoading = workers.loading || pages.loading;

  return (
    <div className="space-y-4 sm:space-y-6">
      <h3 className="text-base sm:text-lg font-semibold">Workers & Pages</h3>

      {isLoading && !workers.data && !pages.data ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Workers */}
          <Card>
            <CardHeader className="pb-3 sm:pb-6">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-400" />
                <CardTitle className="text-base">Workers ({workersList.length})</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {workersList.length === 0 ? (
                <p className="text-sm text-muted-foreground">No Workers deployed.</p>
              ) : (
                <div className="space-y-2">
                  {workersList.map((w: any) => (
                    <div key={w.id} className="flex items-center justify-between gap-2 p-2.5 sm:p-3 rounded-lg border bg-muted/30">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <FileCode className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-medium truncate">{w.id}</p>
                          <p className="text-[11px] sm:text-xs text-muted-foreground">
                            Modified: {w.modified_on ? new Date(w.modified_on).toLocaleDateString() : 'N/A'}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30 flex-shrink-0 text-[11px] sm:text-xs">
                        Active
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pages */}
          <Card>
            <CardHeader className="pb-3 sm:pb-6">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-blue-400" />
                <CardTitle className="text-base">Pages Projects ({pagesList.length})</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {pagesList.length === 0 ? (
                <p className="text-sm text-muted-foreground">No Pages projects found.</p>
              ) : (
                <div className="space-y-2">
                  {pagesList.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 p-2.5 sm:p-3 rounded-lg border bg-muted/30">
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-medium truncate">{p.name}</p>
                        <p className="text-[11px] sm:text-xs text-muted-foreground truncate">
                          {p.subdomain}.pages.dev
                        </p>
                      </div>
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 flex-shrink-0 text-[11px] sm:text-xs">
                        {p.latest_deployment?.environment || 'production'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ==================== FIREWALL TAB ====================
function FirewallTab() {
  const { toast } = useToast();
  const rules = useCloudflareAction();
  const createRule = useCloudflareAction();
  const deleteRule = useCloudflareAction();

  const [showForm, setShowForm] = useState(false);
  const [newRule, setNewRule] = useState({
    description: '',
    expression: '',
    action: 'block',
  });

  const fetchRules = useCallback(() => {
    rules.execute('list_firewall_rules');
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleCreate = async () => {
    if (!newRule.expression.trim()) {
      toast({ title: 'Expression Required', description: 'Enter a valid firewall expression.', variant: 'destructive' });
      return;
    }
    const result = await createRule.execute('create_firewall_rule', {
      expression: newRule.expression,
      action: newRule.action,
      description: newRule.description,
    });
    if (result?.success) {
      toast({ title: 'Rule Created', description: 'Firewall rule has been created.' });
      setNewRule({ description: '', expression: '', action: 'block' });
      setShowForm(false);
      fetchRules();
    } else {
      toast({ title: 'Failed', description: createRule.error || 'Could not create rule.', variant: 'destructive' });
    }
  };

  const handleDelete = async (ruleId: string) => {
    const result = await deleteRule.execute('delete_firewall_rule', { ruleId });
    if (result) {
      toast({ title: 'Rule Deleted', description: 'Firewall rule has been removed.' });
      fetchRules();
    }
  };

  const rulesList = rules.data?.result || [];

  // Preset expressions
  const presets = [
    { label: 'Block /auth page from non-AU', expression: '(http.request.uri.path eq "/auth" and ip.geoip.country ne "AU")', action: 'block' as const },
    { label: 'Challenge /auth page visitors', expression: '(http.request.uri.path eq "/auth")', action: 'challenge' as const },
    { label: 'Block known bots on /auth', expression: '(http.request.uri.path eq "/auth" and cf.client.bot)', action: 'block' as const },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base sm:text-lg font-semibold">Firewall Rules</h3>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          New Rule
        </Button>
      </div>

      {/* Quick presets */}
      <Card>
        <CardHeader className="pb-3 sm:pb-6">
          <CardTitle className="text-sm sm:text-base">Quick Presets (Auth Page Protection)</CardTitle>
          <CardDescription className="text-xs sm:text-sm">One-click firewall rules for your auth page</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {presets.map((preset, i) => (
              <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-2.5 sm:p-3 rounded-lg border bg-muted/30">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium">{preset.label}</p>
                  <p className="text-[11px] sm:text-xs text-muted-foreground font-mono truncate">{preset.expression}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="self-end sm:self-auto flex-shrink-0"
                  onClick={async () => {
                    const result = await createRule.execute('create_firewall_rule', {
                      expression: preset.expression,
                      action: preset.action,
                      description: preset.label,
                    });
                    if (result?.success) {
                      toast({ title: 'Preset Applied', description: preset.label });
                      fetchRules();
                    }
                  }}
                  disabled={createRule.loading}
                >
                  {createRule.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Apply'}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Create form */}
      {showForm && (
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-base">Create Firewall Rule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="e.g. Block auth page from bots"
                value={newRule.description}
                onChange={e => setNewRule(r => ({ ...r, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Expression (Cloudflare filter syntax)</Label>
              <Input
                placeholder='(http.request.uri.path eq "/auth")'
                value={newRule.expression}
                onChange={e => setNewRule(r => ({ ...r, expression: e.target.value }))}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={newRule.action} onValueChange={v => setNewRule(r => ({ ...r, action: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="block">Block</SelectItem>
                  <SelectItem value="challenge">Challenge (CAPTCHA)</SelectItem>
                  <SelectItem value="js_challenge">JS Challenge</SelectItem>
                  <SelectItem value="managed_challenge">Managed Challenge</SelectItem>
                  <SelectItem value="allow">Allow</SelectItem>
                  <SelectItem value="log">Log Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setShowForm(false)} className="w-full sm:w-auto">Cancel</Button>
              <Button onClick={handleCreate} disabled={createRule.loading} className="w-full sm:w-auto">
                {createRule.loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}
                Create Rule
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Rules */}
      {rules.loading && !rules.data ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-base">Active Rules ({rulesList.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {rulesList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No firewall rules configured.</p>
            ) : (
              <div className="space-y-2">
                {rulesList.map((rule: any) => (
                  <div key={rule.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-2.5 sm:p-3 rounded-lg border bg-muted/30">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-medium">{rule.description || 'Untitled Rule'}</p>
                      <p className="text-[11px] sm:text-xs text-muted-foreground font-mono truncate">
                        {rule.filter?.expression || 'N/A'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                      <Badge variant="outline" className={`text-[11px] sm:text-xs ${
                        rule.action === 'block' ? 'border-red-500/30 text-red-400' :
                        rule.action === 'challenge' ? 'border-yellow-500/30 text-yellow-400' :
                        rule.action === 'allow' ? 'border-green-500/30 text-green-400' :
                        'border-blue-500/30 text-blue-400'
                      }`}>
                        {rule.action}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(rule.id)}
                        disabled={deleteRule.loading}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ==================== HELPERS ====================
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

// ==================== MAIN PAGE ====================
export default function CloudflareManagement() {
  const zone = useCloudflareAction();

  useEffect(() => {
    zone.execute('zone_details');
  }, []);

  const zoneData = zone.data?.result;

  return (
    <div className="space-y-4 sm:space-y-6 px-1 sm:px-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Cloudflare</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Manage CDN, analytics, Workers, and firewall rules
          </p>
        </div>
        {zoneData && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {zoneData.name}
            </Badge>
            <Badge variant="outline" className="text-muted-foreground">
              {zoneData.plan?.name || 'Free'}
            </Badge>
          </div>
        )}
      </div>

      <Tabs defaultValue="analytics" className="w-full">
        <div className="overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-0 scrollbar-hide">
          <TabsList className="inline-flex w-auto min-w-max">
            <TabsTrigger value="analytics" className="text-xs sm:text-sm gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              <span className="hidden xs:inline sm:inline">Analytics</span>
              <span className="xs:hidden sm:hidden">Stats</span>
            </TabsTrigger>
            <TabsTrigger value="cdn" className="text-xs sm:text-sm gap-1.5">
              <HardDrive className="h-3.5 w-3.5" />
              CDN
            </TabsTrigger>
            <TabsTrigger value="workers" className="text-xs sm:text-sm gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              Workers
            </TabsTrigger>
            <TabsTrigger value="firewall" className="text-xs sm:text-sm gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Firewall
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="analytics" className="mt-4 sm:mt-6">
          <AnalyticsTab />
        </TabsContent>
        <TabsContent value="cdn" className="mt-4 sm:mt-6">
          <CdnTab />
        </TabsContent>
        <TabsContent value="workers" className="mt-4 sm:mt-6">
          <WorkersTab />
        </TabsContent>
        <TabsContent value="firewall" className="mt-4 sm:mt-6">
          <FirewallTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
