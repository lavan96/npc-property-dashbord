import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, DollarSign, Eye, MousePointerClick, Target, RefreshCw, BarChart3, TrendingUp, Users, Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { AnomalyAlertsPanel } from '@/components/marketing/AnomalyAlertsPanel';
import { CampaignHealthPanel } from '@/components/marketing/CampaignHealthPanel';
import { AIDigestPanel } from '@/components/marketing/AIDigestPanel';
import { BudgetAdvisorPanel } from '@/components/marketing/BudgetAdvisorPanel';
import { AudienceIntelligencePanel } from '@/components/marketing/AudienceIntelligencePanel';
import { LeadQualityPanel } from '@/components/marketing/LeadQualityPanel';

const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7d', label: 'Last 7 Days' },
  { value: 'last_14d', label: 'Last 14 Days' },
  { value: 'last_30d', label: 'Last 30 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_90d', label: 'Last 90 Days' },
];

function formatCurrency(val: string | number | undefined) {
  if (!val) return '$0.00';
  return `$${Number(val).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(val: string | number | undefined) {
  if (!val) return '0';
  return Number(val).toLocaleString('en-AU');
}

function formatPercent(val: string | number | undefined) {
  if (!val) return '0.00%';
  return `${Number(val).toFixed(2)}%`;
}

function extractAction(actions: any[] | undefined, type: string): number {
  if (!actions) return 0;
  const action = actions.find((a: any) => a.action_type === type);
  return action ? Number(action.value) : 0;
}

export default function MarketingAnalytics() {
  const [datePreset, setDatePreset] = useState('last_30d');
  const [level, setLevel] = useState<'account' | 'campaign' | 'adset'>('campaign');
  const [regeneratingDigest, setRegeneratingDigest] = useState(false);
  const queryClient = useQueryClient();

  // Fetch raw Meta Ads data
  const { data: adsData, isLoading: adsLoading, error: adsError, refetch: refetchAds, isFetching: adsFetching } = useQuery({
    queryKey: ['meta-ads', level, datePreset],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('fetch-meta-ads', {
        level,
        datePreset,
        limit: 50,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Analyze data when ads data is available
  const { data: analysisData, isLoading: analysisLoading, refetch: refetchAnalysis } = useQuery({
    queryKey: ['meta-ads-analysis', datePreset, adsData?.insights?.length],
    queryFn: async () => {
      if (!adsData?.insights || adsData.insights.length === 0) return null;
      const { data, error } = await invokeSecureFunction('analyze-meta-ads', {
        insights: adsData.insights,
        campaigns: adsData.campaigns,
        datePreset,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!adsData?.insights && adsData.insights.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const insights = adsData?.insights || [];
  const campaigns = adsData?.campaigns || [];
  const anomalies = analysisData?.anomalies || [];
  const healthScores = analysisData?.healthScores || [];
  const aiDigest = analysisData?.aiDigest || '';
  const aiDigestError = analysisData?.aiDigestError || '';
  const summary = analysisData?.summary || {};

  // Totals
  const totals = insights.reduce((acc: any, row: any) => {
    acc.spend += Number(row.spend || 0);
    acc.impressions += Number(row.impressions || 0);
    acc.clicks += Number(row.clicks || 0);
    acc.reach += Number(row.reach || 0);
    acc.leads += extractAction(row.actions, 'lead');
    return acc;
  }, { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0 });

  totals.ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  totals.cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  totals.cpl = totals.leads > 0 ? totals.spend / totals.leads : 0;

  const handleRefresh = useCallback(() => {
    refetchAds();
    queryClient.invalidateQueries({ queryKey: ['meta-ads-analysis'] });
  }, [refetchAds, queryClient]);

  const handleRegenerateDigest = useCallback(async () => {
    setRegeneratingDigest(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['meta-ads-analysis'] });
      await refetchAnalysis();
      toast.success('AI digest regenerated');
    } catch {
      toast.error('Failed to regenerate digest');
    } finally {
      setRegeneratingDigest(false);
    }
  }, [queryClient, refetchAnalysis]);

  const getHealthForCampaign = (campaignId: string) => {
    return healthScores.find((h: any) => h.campaign_id === campaignId);
  };

  const isLoading = adsLoading;
  const isAnalyzing = analysisLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Megaphone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Marketing Analytics</h1>
            <p className="text-muted-foreground text-sm">AI-powered Meta Ads performance insights</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={datePreset} onValueChange={(v) => {
            setDatePreset(v);
          }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={adsFetching}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${adsFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Badges */}
      {!isLoading && insights.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-xs px-2.5 py-1">
            {insights.length} Campaign{insights.length !== 1 ? 's' : ''}
          </Badge>
          {summary.criticalAnomalies > 0 && (
            <Badge variant="destructive" className="text-xs px-2.5 py-1">
              {summary.criticalAnomalies} Critical Alert{summary.criticalAnomalies !== 1 ? 's' : ''}
            </Badge>
          )}
          {summary.warningAnomalies > 0 && (
            <Badge className="text-xs px-2.5 py-1 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
              {summary.warningAnomalies} Warning{summary.warningAnomalies !== 1 ? 's' : ''}
            </Badge>
          )}
          {summary.avgHealthScore > 0 && (
            <Badge variant="outline" className={`text-xs px-2.5 py-1 font-mono ${
              summary.avgHealthScore >= 60 ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400' :
              summary.avgHealthScore >= 35 ? 'border-amber-500/30 text-amber-600 dark:text-amber-400' :
              'border-red-500/30 text-red-600 dark:text-red-400'
            }`}>
              Avg Health: {summary.avgHealthScore}/100
            </Badge>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard icon={<DollarSign className="h-4 w-4" />} label="Total Spend" value={formatCurrency(totals.spend)} loading={isLoading} />
        <KPICard icon={<Eye className="h-4 w-4" />} label="Impressions" value={formatNumber(totals.impressions)} loading={isLoading} />
        <KPICard icon={<MousePointerClick className="h-4 w-4" />} label="Clicks" value={formatNumber(totals.clicks)} loading={isLoading} />
        <KPICard icon={<TrendingUp className="h-4 w-4" />} label="CTR" value={formatPercent(totals.ctr)} loading={isLoading} />
        <KPICard icon={<Target className="h-4 w-4" />} label="Leads" value={formatNumber(totals.leads)} loading={isLoading} accent />
        <KPICard icon={<DollarSign className="h-4 w-4" />} label="Cost / Lead" value={totals.cpl > 0 ? formatCurrency(totals.cpl) : '—'} loading={isLoading} accent />
      </div>

      {/* AI Digest */}
      <AIDigestPanel
        digest={aiDigest}
        loading={isAnalyzing}
        error={aiDigestError}
        onRegenerate={handleRegenerateDigest}
        regenerating={regeneratingDigest}
      />

      {/* Anomalies + Health Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AnomalyAlertsPanel anomalies={anomalies} loading={isAnalyzing} />
        <CampaignHealthPanel healthScores={healthScores} loading={isAnalyzing} />
      </div>

      {/* Campaign Breakdown Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Performance Breakdown
              </CardTitle>
              <CardDescription className="mt-1">
                {insights.length} {level === 'campaign' ? 'campaigns' : level === 'adset' ? 'ad sets' : 'results'} · {DATE_PRESETS.find(p => p.value === datePreset)?.label}
              </CardDescription>
            </div>
            <Tabs value={level} onValueChange={(v) => setLevel(v as any)}>
              <TabsList>
                <TabsTrigger value="account">Account</TabsTrigger>
                <TabsTrigger value="campaign">Campaigns</TabsTrigger>
                <TabsTrigger value="adset">Ad Sets</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground mt-3">Fetching Meta Ads data...</p>
              </div>
            </div>
          ) : adsError ? (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 mb-3">
                <BarChart3 className="h-6 w-6 text-destructive" />
              </div>
              <p className="font-medium text-foreground">Failed to load Meta Ads data</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{(adsError as Error).message}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => refetchAds()}>
                Try Again
              </Button>
            </div>
          ) : insights.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No data found for this period</p>
              <p className="text-sm mt-1">Try selecting a different date range</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {level !== 'account' && <TableHead className="min-w-[200px]">
                      {level === 'campaign' ? 'Campaign' : 'Ad Set'}
                    </TableHead>}
                    {level === 'campaign' && <TableHead className="text-center w-[80px]">Health</TableHead>}
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">CPC</TableHead>
                    <TableHead className="text-right">Reach</TableHead>
                    <TableHead className="text-right">Freq</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">CPL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insights.map((row: any, i: number) => {
                    const leads = extractAction(row.actions, 'lead');
                    const cpl = leads > 0 ? Number(row.spend || 0) / leads : 0;
                    const campaign = campaigns?.find((c: any) => c.id === row.campaign_id);
                    const health = getHealthForCampaign(row.campaign_id);

                    return (
                      <TableRow key={row.campaign_id || row.adset_id || i} className="group">
                        {level !== 'account' && (
                          <TableCell className="font-medium max-w-[250px]">
                            <div className="flex items-center gap-2">
                              <span className="truncate">{level === 'campaign' ? row.campaign_name : row.adset_name || 'Unknown'}</span>
                              {campaign?.status && (
                                <Badge variant={campaign.status === 'ACTIVE' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 shrink-0">
                                  {campaign.status}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                        )}
                        {level === 'campaign' && (
                          <TableCell className="text-center">
                            {health ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    variant="outline"
                                    className={`font-mono text-[10px] cursor-default ${
                                      health.status === 'healthy' ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5' :
                                      health.status === 'watch' ? 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5' :
                                      'border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5'
                                    }`}
                                  >
                                    {health.score}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs">
                                  <p className="font-semibold text-xs mb-1">
                                    {health.status === 'healthy' ? '🟢 Healthy' : health.status === 'watch' ? '🟡 Watch' : '🔴 Action Needed'}
                                  </p>
                                  {health.recommendations?.slice(0, 2).map((r: string, ri: number) => (
                                    <p key={ri} className="text-xs text-muted-foreground">→ {r}</p>
                                  ))}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(row.spend)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatNumber(row.impressions)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatNumber(row.clicks)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatPercent(row.ctr)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(row.cpc)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatNumber(row.reach)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{Number(row.frequency || 0).toFixed(1)}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">{formatNumber(leads)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{cpl > 0 ? formatCurrency(cpl) : '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KPICard({ icon, label, value, loading, accent }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  loading: boolean;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? 'border-primary/20 bg-primary/[0.02]' : ''}>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
          {icon}
          <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
        </div>
        {loading ? (
          <div className="h-7 w-20 bg-muted animate-pulse rounded mt-0.5" />
        ) : (
          <p className={`text-xl font-bold tracking-tight ${accent ? 'text-primary' : 'text-foreground'}`}>{value}</p>
        )}
      </CardContent>
    </Card>
  );
}
