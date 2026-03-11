import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, DollarSign, Eye, MousePointerClick, Target, RefreshCw, BarChart3, TrendingUp, Users, Megaphone, GitCompareArrows } from 'lucide-react';
import { toast } from 'sonner';
import { AnomalyAlertsPanel } from '@/components/marketing/AnomalyAlertsPanel';
import { CampaignHealthPanel } from '@/components/marketing/CampaignHealthPanel';
import { AIDigestPanel } from '@/components/marketing/AIDigestPanel';
import { BudgetAdvisorPanel } from '@/components/marketing/BudgetAdvisorPanel';
import { AudienceIntelligencePanel } from '@/components/marketing/AudienceIntelligencePanel';
import { LeadQualityPanel } from '@/components/marketing/LeadQualityPanel';
import { ForecastPanel } from '@/components/marketing/ForecastPanel';
import { WeeklyBriefPanel } from '@/components/marketing/WeeklyBriefPanel';
import { BenchmarksPanel } from '@/components/marketing/BenchmarksPanel';
import { MarketCorrelationPanel } from '@/components/marketing/MarketCorrelationPanel';
import { LeadAttributionPanel } from '@/components/marketing/LeadAttributionPanel';
import { DateRangePicker } from '@/components/marketing/DateRangePicker';
import { DrillDownExplorer } from '@/components/marketing/DrillDownExplorer';
import { ComparisonPanel } from '@/components/marketing/ComparisonPanel';
import { PeriodOverPeriodPanel } from '@/components/marketing/PeriodOverPeriodPanel';
import { CreativeGalleryPanel } from '@/components/marketing/CreativeGalleryPanel';
import { SpendPacingPanel } from '@/components/marketing/SpendPacingPanel';
import { FullFunnelPanel } from '@/components/marketing/FullFunnelPanel';
import { TrueROIPanel } from '@/components/marketing/TrueROIPanel';

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

interface DrillDownBreadcrumb {
  level: 'account' | 'campaign' | 'adset' | 'ad';
  label: string;
  id?: string;
}

export default function MarketingAnalytics() {
  const [datePreset, setDatePreset] = useState('last_30d');
  const [customRange, setCustomRange] = useState<{ since: string; until: string } | null>(null);
  const [level, setLevel] = useState<'account' | 'campaign' | 'adset' | 'ad'>('campaign');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedAdsetId, setSelectedAdsetId] = useState<string | null>(null);
  const [regeneratingDigest, setRegeneratingDigest] = useState(false);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [currentBrief, setCurrentBrief] = useState('');
  const [currentBriefError, setCurrentBriefError] = useState('');
  const [forecastHorizon] = useState(14);
  const queryClient = useQueryClient();

  // Drill-down breadcrumb state
  const [breadcrumbs, setBreadcrumbs] = useState<DrillDownBreadcrumb[]>([
    { level: 'campaign', label: 'Campaigns' },
  ]);

  // Comparison mode
  const [comparisonMode, setComparisonMode] = useState(false);
  const [selectedForComparison, setSelectedForComparison] = useState<string[]>([]);

  // Build time range payload
  const timePayload = customRange
    ? { timeRange: customRange }
    : { datePreset };

  // Date label for display
  const dateLabel = customRange
    ? `${customRange.since} → ${customRange.until}`
    : DATE_PRESETS.find(p => p.value === datePreset)?.label || datePreset;

  // Fetch raw Meta Ads data
  const { data: adsData, isLoading: adsLoading, error: adsError, refetch: refetchAds, isFetching: adsFetching } = useQuery({
    queryKey: ['meta-ads', level, datePreset, customRange, selectedCampaignId, selectedAdsetId],
    queryFn: async () => {
      const payload: any = {
        level,
        ...timePayload,
        limit: 50,
      };
      if (selectedCampaignId && (level === 'adset' || level === 'ad')) {
        payload.campaignId = selectedCampaignId;
      }
      if (selectedAdsetId && level === 'ad') {
        payload.adsetId = selectedAdsetId;
      }
      const { data, error } = await invokeSecureFunction('fetch-meta-ads', payload);
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Analyze data when ads data is available
  const { data: analysisData, isLoading: analysisLoading, refetch: refetchAnalysis } = useQuery({
    queryKey: ['meta-ads-analysis', datePreset, customRange, adsData?.insights?.length],
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
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  // Phase 2: Budget Advisor + Audience Intelligence
  const { data: phase2Data, isLoading: phase2Loading } = useQuery({
    queryKey: ['meta-ads-phase2-budget', datePreset, customRange, adsData?.insights?.length],
    queryFn: async () => {
      if (!adsData?.insights || adsData.insights.length === 0) return null;
      const { data, error } = await invokeSecureFunction('analyze-meta-ads-phase2', {
        action: 'budget_advisor',
        insights: adsData.insights,
        campaigns: adsData.campaigns,
        datePreset,
        healthScores: analysisData?.healthScores,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!adsData?.insights && adsData.insights.length > 0,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  // Phase 2: Lead Quality Correlation
  const { data: leadQualityData, isLoading: leadQualityLoading } = useQuery({
    queryKey: ['meta-ads-phase2-leads', datePreset, customRange, adsData?.insights?.length],
    queryFn: async () => {
      if (!adsData?.insights) return null;
      const { data, error } = await invokeSecureFunction('analyze-meta-ads-phase2', {
        action: 'lead_quality',
        insights: adsData.insights,
        datePreset,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!adsData?.insights && adsData.insights.length > 0,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  // Phase 3: Forecasting
  const { data: forecastData, isLoading: forecastLoading } = useQuery({
    queryKey: ['meta-ads-phase3-forecast', datePreset, customRange, forecastHorizon, adsData?.insights?.length],
    queryFn: async () => {
      if (!adsData?.insights || adsData.insights.length === 0) return null;
      const { data, error } = await invokeSecureFunction('analyze-meta-ads-phase3', {
        action: 'forecast',
        insights: adsData.insights,
        horizonDays: forecastHorizon,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!adsData?.insights && adsData.insights.length > 0,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  // Phase 3: Past briefs list
  const { data: pastBriefsData, isLoading: pastBriefsLoading } = useQuery({
    queryKey: ['meta-ads-phase3-briefs'],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('analyze-meta-ads-phase3', {
        action: 'list_briefs',
        insights: [],
        limit: 10,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Phase 4: Industry Benchmarks
  const { data: benchmarkData, isLoading: benchmarkLoading } = useQuery({
    queryKey: ['meta-ads-phase4-benchmarks', datePreset, customRange, adsData?.insights?.length],
    queryFn: async () => {
      if (!adsData?.insights || adsData.insights.length === 0) return null;
      const t = { spend: 0, leads: 0, cpl: 0, ctr: 0, cpc: 0, impressions: 0, clicks: 0 };
      for (const row of adsData.insights) {
        t.spend += Number(row.spend || 0);
        t.impressions += Number(row.impressions || 0);
        t.clicks += Number(row.clicks || 0);
        if (row.actions) {
          const lead = row.actions.find((a: any) => a.action_type === 'lead');
          t.leads += lead ? Number(lead.value) : 0;
        }
      }
      t.ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
      t.cpc = t.clicks > 0 ? t.spend / t.clicks : 0;
      t.cpl = t.leads > 0 ? t.spend / t.leads : 0;

      const { data, error } = await invokeSecureFunction('analyze-meta-ads-phase4', {
        action: 'benchmarks',
        totals: t,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!adsData?.insights && adsData.insights.length > 0,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  // Phase 4: Market Correlation
  const { data: marketData, isLoading: marketLoading } = useQuery({
    queryKey: ['meta-ads-phase4-market', datePreset, customRange, adsData?.insights?.length],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('analyze-meta-ads-phase4', {
        action: 'market_correlation',
        insights: adsData?.insights || [],
        datePreset,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!adsData?.insights && adsData.insights.length > 0,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  const insights = adsData?.insights || [];
  const campaigns = adsData?.campaigns || [];
  const anomalies = analysisData?.anomalies || [];
  const healthScores = analysisData?.healthScores || [];
  const aiDigest = analysisData?.aiDigest || '';
  const aiDigestError = analysisData?.aiDigestError || '';
  const summary = analysisData?.summary || {};

  // Drill-down handler
  const handleDrillDown = useCallback((nextLevel: 'adset' | 'ad', id: string, label: string) => {
    if (nextLevel === 'adset') {
      setSelectedCampaignId(id);
      setSelectedAdsetId(null);
      setLevel('adset');
      setBreadcrumbs(prev => [
        ...prev,
        { level: 'adset', label, id },
      ]);
    } else if (nextLevel === 'ad') {
      setSelectedAdsetId(id);
      setLevel('ad');
      setBreadcrumbs(prev => [
        ...prev,
        { level: 'ad', label, id },
      ]);
    }
    // Clear comparison on drill
    setSelectedForComparison([]);
    setComparisonMode(false);
  }, []);

  // Breadcrumb click handler
  const handleBreadcrumbClick = useCallback((index: number) => {
    const crumb = breadcrumbs[index];
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
    setLevel(crumb.level);
    setSelectedForComparison([]);
    setComparisonMode(false);

    if (crumb.level === 'campaign') {
      setSelectedCampaignId(null);
      setSelectedAdsetId(null);
    } else if (crumb.level === 'adset') {
      setSelectedAdsetId(null);
    }
  }, [breadcrumbs]);

  // Level tab change
  const handleLevelChange = (newLevel: string) => {
    const l = newLevel as 'account' | 'campaign' | 'adset' | 'ad';
    if (l === 'account' || l === 'campaign') {
      setSelectedCampaignId(null);
      setSelectedAdsetId(null);
      setBreadcrumbs([{ level: l, label: l === 'account' ? 'Account' : 'Campaigns' }]);
    } else if (l === 'adset') {
      setSelectedAdsetId(null);
      setBreadcrumbs([{ level: 'campaign', label: 'Campaigns' }, { level: 'adset', label: 'All Ad Sets' }]);
    } else if (l === 'ad') {
      setBreadcrumbs([{ level: 'campaign', label: 'Campaigns' }, { level: 'ad', label: 'All Ads' }]);
    }
    setLevel(l);
    setSelectedForComparison([]);
    setComparisonMode(false);
  };

  // Comparison toggle
  const handleToggleComparison = useCallback((id: string) => {
    setSelectedForComparison(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 4) {
        toast.error('Maximum 4 items for comparison');
        return prev;
      }
      return [...prev, id];
    });
  }, []);

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
  }, [refetchAds]);

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

  const handleGenerateBrief = useCallback(async () => {
    if (!adsData?.insights || adsData.insights.length === 0) {
      toast.error('No data available to generate brief');
      return;
    }
    setGeneratingBrief(true);
    setCurrentBriefError('');
    try {
      const { data, error } = await invokeSecureFunction('analyze-meta-ads-phase3', {
        action: 'weekly_brief',
        insights: adsData.insights,
        campaigns: adsData.campaigns,
        datePreset,
        healthScores: analysisData?.healthScores,
        anomalies: analysisData?.anomalies,
        budgetRecommendations: phase2Data?.recommendations,
      });
      if (error) {
        setCurrentBriefError(error.message);
      } else {
        setCurrentBrief(data?.brief || '');
        if (data?.aiError) setCurrentBriefError(data.aiError);
        queryClient.invalidateQueries({ queryKey: ['meta-ads-phase3-briefs'] });
        toast.success('Weekly brief generated');
      }
    } catch (err: any) {
      setCurrentBriefError(err.message || 'Failed to generate brief');
      toast.error('Failed to generate brief');
    } finally {
      setGeneratingBrief(false);
    }
  }, [adsData, datePreset, analysisData, phase2Data, queryClient]);

  const isLoading = adsLoading;
  const isAnalyzing = analysisLoading;

  // Items selected for comparison
  const comparisonItems = insights.filter((row: any) => {
    const id = level === 'campaign' ? row.campaign_id : level === 'adset' ? row.adset_id : row.ad_id;
    return selectedForComparison.includes(id);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
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
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={adsFetching}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${adsFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Date Range Picker */}
        <DateRangePicker
          datePreset={datePreset}
          onDatePresetChange={setDatePreset}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
        />
      </div>

      {/* Summary Badges */}
      {!isLoading && insights.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-xs px-2.5 py-1">
            {insights.length} {level === 'campaign' ? 'Campaign' : level === 'adset' ? 'Ad Set' : 'Ad'}{insights.length !== 1 ? 's' : ''}
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

      {/* Budget Advisor */}
      <BudgetAdvisorPanel
        recommendations={phase2Data?.recommendations || []}
        aiAnalysis={phase2Data?.aiAnalysis || ''}
        aiError={phase2Data?.aiError}
        loading={phase2Loading}
        summary={phase2Data?.summary}
      />

      {/* Lead Source Attribution */}
      <LeadAttributionPanel />

      {/* Audience Intelligence + Lead Quality */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AudienceIntelligencePanel
          audienceInsights={phase2Data?.audienceInsights || []}
          loading={phase2Loading}
        />
        <LeadQualityPanel
          leadQuality={leadQualityData?.leadQuality || []}
          aiAnalysis={leadQualityData?.aiAnalysis || ''}
          loading={leadQualityLoading}
        />
      </div>

      {/* Performance Forecast */}
      <ForecastPanel
        forecast={forecastData?.forecast || []}
        trends={forecastData?.trends || null}
        projections={forecastData?.projections || null}
        aiAnalysis={forecastData?.aiAnalysis || ''}
        aiError={forecastData?.aiError}
        loading={forecastLoading}
        horizonDays={forecastHorizon}
      />

      {/* Weekly AI Brief */}
      <WeeklyBriefPanel
        currentBrief={currentBrief}
        currentBriefError={currentBriefError}
        pastBriefs={pastBriefsData?.reports || []}
        loading={false}
        generating={generatingBrief}
        onGenerate={handleGenerateBrief}
        pastBriefsLoading={pastBriefsLoading}
      />

      {/* Period-over-Period Comparison */}
      <PeriodOverPeriodPanel />

      {/* Performance Explorer with Drill-Down */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <Tabs value={level} onValueChange={handleLevelChange}>
            <TabsList>
              <TabsTrigger value="account">Account</TabsTrigger>
              <TabsTrigger value="campaign">Campaigns</TabsTrigger>
              <TabsTrigger value="adset">Ad Sets</TabsTrigger>
              <TabsTrigger value="ad">Ads</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant={comparisonMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setComparisonMode(!comparisonMode);
              if (comparisonMode) setSelectedForComparison([]);
            }}
            className="gap-1.5"
          >
            <GitCompareArrows className="h-4 w-4" />
            {comparisonMode ? `Comparing (${selectedForComparison.length})` : 'Compare'}
          </Button>
        </div>

        <DrillDownExplorer
          level={level}
          insights={insights}
          campaigns={campaigns}
          healthScores={healthScores}
          loading={isLoading}
          error={adsError as Error | null}
          breadcrumbs={breadcrumbs}
          dateLabel={dateLabel}
          comparisonMode={comparisonMode}
          selectedForComparison={selectedForComparison}
          onDrillDown={handleDrillDown}
          onBreadcrumbClick={handleBreadcrumbClick}
          onRefetch={() => refetchAds()}
          onToggleComparison={handleToggleComparison}
          formatCurrency={formatCurrency}
          formatNumber={formatNumber}
          formatPercent={formatPercent}
          extractAction={extractAction}
        />

        {/* Comparison Panel */}
        {comparisonMode && selectedForComparison.length >= 2 && (
          <ComparisonPanel
            items={comparisonItems}
            level={level as 'campaign' | 'adset' | 'ad'}
            onRemoveItem={(id) => setSelectedForComparison(prev => prev.filter(x => x !== id))}
            onClear={() => {
              setSelectedForComparison([]);
              setComparisonMode(false);
            }}
            formatCurrency={formatCurrency}
            formatNumber={formatNumber}
            formatPercent={formatPercent}
            extractAction={extractAction}
          />
        )}
      </div>

      {/* Industry Benchmarks */}
      <BenchmarksPanel
        benchmarks={benchmarkData?.benchmarks || []}
        perplexityResearch={benchmarkData?.perplexityResearch || ''}
        citations={benchmarkData?.citations || []}
        aiAnalysis={benchmarkData?.aiAnalysis || ''}
        aiError={benchmarkData?.aiError}
        rawBenchmarks={benchmarkData?.rawBenchmarks}
        loading={benchmarkLoading}
      />

      {/* Market Correlation */}
      <MarketCorrelationPanel
        marketEvents={marketData?.marketEvents || []}
        perplexityResearch={marketData?.perplexityResearch || ''}
        citations={marketData?.citations || []}
        aiAnalysis={marketData?.aiAnalysis || ''}
        aiError={marketData?.aiError}
        loading={marketLoading}
      />
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
