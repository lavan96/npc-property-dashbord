import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Megaphone, Target, Users, DollarSign, TrendingUp, ChevronDown, ChevronUp,
  RefreshCw, Globe, Loader2, DatabaseBackup, Sparkles, ExternalLink,
  MousePointerClick, Layers, Image as ImageIcon, MapPin, Monitor, Link2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AttributionRow {
  id: string;
  client_id: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  meta_campaign_name: string | null;
  meta_adset_name: string | null;
  meta_ad_name: string | null;
  meta_ad_creative_url: string | null;
  meta_campaign_objective: string | null;
  fbclid: string | null;
  gclid: string | null;
  ghl_attribution_source: string | null;
  ghl_last_attribution_source: string | null;
  landing_page_url: string | null;
  conversion_page_url: string | null;
  device_type: string | null;
  geo_location: string | null;
  source_type: string;
  enrichment_status: string | null;
  attributed_at: string;
}

interface CampaignGroup {
  campaignName: string;
  campaignId: string | null;
  objective: string | null;
  source: string;
  leads: number;
  percentage: number;
  adsets: Map<string, {
    name: string;
    id: string | null;
    leads: number;
    ads: Map<string, { name: string; id: string | null; creativeUrl: string | null; leads: number }>;
  }>;
}

export function LeadAttributionPanel() {
  const [expanded, setExpanded] = useState(true);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState('');
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const { data: attributionsData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['lead-attributions-summary'],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('get-client-data', {
        listMode: true,
        listOptions: {
          table: 'lead_source_attributions',
          select: '*',
          orderBy: 'attributed_at',
          orderAsc: false,
          limit: 500,
        },
      });
      if (error) throw new Error(error.message);
      return data?.records || [];
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const attributions: AttributionRow[] = attributionsData || [];

  // Build hierarchical campaign → adset → ad structure
  const campaignGroups = new Map<string, CampaignGroup>();
  for (const attr of attributions) {
    const campaignKey = attr.meta_campaign_name || attr.utm_campaign || attr.utm_source || 'Direct / Unknown';
    
    if (!campaignGroups.has(campaignKey)) {
      campaignGroups.set(campaignKey, {
        campaignName: campaignKey,
        campaignId: attr.meta_campaign_id,
        objective: attr.meta_campaign_objective,
        source: attr.utm_source || 'unknown',
        leads: 0,
        percentage: 0,
        adsets: new Map(),
      });
    }

    const group = campaignGroups.get(campaignKey)!;
    group.leads++;

    const adsetKey = attr.meta_adset_name || attr.utm_content || 'Default Ad Set';
    if (!group.adsets.has(adsetKey)) {
      group.adsets.set(adsetKey, {
        name: adsetKey,
        id: attr.meta_adset_id,
        leads: 0,
        ads: new Map(),
      });
    }
    const adset = group.adsets.get(adsetKey)!;
    adset.leads++;

    const adKey = attr.meta_ad_name || attr.utm_term || 'Default Ad';
    if (!adset.ads.has(adKey)) {
      adset.ads.set(adKey, {
        name: adKey,
        id: attr.meta_ad_id,
        creativeUrl: attr.meta_ad_creative_url,
        leads: 0,
      });
    }
    adset.ads.get(adKey)!.leads++;
  }

  const campaignList = Array.from(campaignGroups.values()).sort((a, b) => b.leads - a.leads);
  const totalLeads = campaignList.reduce((sum, c) => sum + c.leads, 0);
  campaignList.forEach(c => { c.percentage = totalLeads > 0 ? (c.leads / totalLeads) * 100 : 0; });

  // Source breakdown
  const sourceMap = new Map<string, number>();
  for (const attr of attributions) {
    const src = attr.utm_source || 'unknown';
    sourceMap.set(src, (sourceMap.get(src) || 0) + 1);
  }
  const sourceList = Array.from(sourceMap.entries()).sort((a, b) => b[1] - a[1]);

  // Enrichment stats
  const pendingEnrichment = attributions.filter(a => a.enrichment_status === 'pending').length;
  const enrichedCount = attributions.filter(a => a.enrichment_status === 'enriched').length;
  const hasClickIds = attributions.filter(a => a.fbclid || a.gclid).length;

  // Source type breakdown
  const autoCount = attributions.filter(a => a.source_type === 'webhook_auto' || a.source_type === 'backfill').length;
  const manualCount = attributions.filter(a => a.source_type === 'manual').length;
  const csvCount = attributions.filter(a => a.source_type === 'csv_import').length;

  const handleBackfill = async () => {
    setIsBackfilling(true);
    setBackfillProgress('Starting backfill...');
    let offset = 0;
    let totalAttributed = 0;
    let totalProcessed = 0;

    try {
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await invokeSecureFunction('backfill-lead-attributions', { batchSize: 50, offset });
        if (error) throw new Error(error.message || 'Backfill failed');
        totalAttributed += data.stats?.attributed || 0;
        totalProcessed += data.stats?.processed || 0;
        hasMore = data.hasMore;
        offset = data.nextOffset || offset + 50;
        setBackfillProgress(`Processed ${totalProcessed} clients, ${totalAttributed} attributed...`);
      }
      toast({ title: 'Backfill Complete', description: `${totalAttributed} attributions created from ${totalProcessed} clients.` });
      refetch();
    } catch (err: any) {
      toast({ title: 'Backfill Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsBackfilling(false);
      setBackfillProgress('');
    }
  };

  const handleEnrich = async () => {
    setIsEnriching(true);
    try {
      let totalEnriched = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await invokeSecureFunction('enrich-lead-attributions', { batchSize: 20 });
        if (error) throw new Error(error.message);
        totalEnriched += data.enriched || 0;
        hasMore = data.hasMore || false;
      }
      toast({ title: 'Enrichment Complete', description: `${totalEnriched} attributions enriched with Meta campaign/ad names.` });
      refetch();
    } catch (err: any) {
      toast({ title: 'Enrichment Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsEnriching(false);
    }
  };

  const toggleCampaign = (key: string) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const sourceColors: Record<string, string> = {
    meta: 'bg-blue-500',
    facebook: 'bg-blue-500',
    google: 'bg-red-500',
    referral: 'bg-emerald-500',
    organic: 'bg-green-500',
    email: 'bg-purple-500',
    unknown: 'bg-muted-foreground',
  };

  const getSourceIcon = (source: string) => {
    const s = source.toLowerCase();
    if (s.includes('facebook') || s.includes('meta') || s.includes('fb')) return '📘';
    if (s.includes('google')) return '🔍';
    if (s.includes('email')) return '📧';
    if (s.includes('referral')) return '🤝';
    return '🌐';
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" />
              Lead Source Attribution
              <Badge variant="secondary" className="text-[10px]">CRM Linked</Badge>
              {enrichedCount > 0 && (
                <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">
                  <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                  {enrichedCount} Enriched
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              Full-funnel attribution: Campaign → Ad Set → Ad → Conversion
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5">
            {pendingEnrichment > 0 && (
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={handleEnrich} disabled={isEnriching}>
                {isEnriching ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                Enrich ({pendingEnrichment})
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => refetch()} disabled={isRefetching}>
              {isRefetching ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Refresh
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : attributions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Globe className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No attribution data yet</p>
              <p className="text-xs mt-1">Run a backfill to pull attribution data from GHL for existing contacts</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={handleBackfill} disabled={isBackfilling}>
                {isBackfilling ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <DatabaseBackup className="h-3 w-3 mr-1.5" />}
                {isBackfilling ? 'Backfilling...' : 'Backfill from GHL'}
              </Button>
              {backfillProgress && <p className="text-[10px] mt-2 text-muted-foreground">{backfillProgress}</p>}
            </div>
          ) : (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{totalLeads}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Attributed Leads</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{campaignList.length}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Campaigns</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{sourceList.length}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Sources</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{hasClickIds}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Click IDs</p>
                </div>
              </div>

              {/* Source Breakdown Bar */}
              <div>
                <p className="text-xs font-semibold text-foreground mb-2">Source Breakdown</p>
                <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
                  {sourceList.map(([source, count]) => {
                    const pct = (count / totalLeads) * 100;
                    return (
                      <TooltipProvider key={source}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={`${sourceColors[source.toLowerCase()] || 'bg-chart-4'} rounded-sm transition-all`}
                              style={{ width: `${Math.max(pct, 3)}%` }}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs font-medium">{source}: {count} leads ({pct.toFixed(1)}%)</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  {sourceList.map(([source, count]) => (
                    <div key={source} className="flex items-center gap-1.5 text-[10px]">
                      <div className={`h-2 w-2 rounded-full ${sourceColors[source.toLowerCase()] || 'bg-chart-4'}`} />
                      <span className="text-muted-foreground capitalize">{source}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hierarchical Campaign → Ad Set → Ad Breakdown */}
              <div>
                <p className="text-xs font-semibold text-foreground mb-2">Campaign Funnel Breakdown</p>
                <ScrollArea className="max-h-[450px]">
                  <div className="space-y-2">
                    {campaignList.map((campaign, i) => {
                      const isOpen = expandedCampaigns.has(campaign.campaignName);
                      const adsetList = Array.from(campaign.adsets.values()).sort((a, b) => b.leads - a.leads);
                      const hasSubData = adsetList.some(as => as.name !== 'Default Ad Set');

                      return (
                        <div key={campaign.campaignName + i} className="rounded-lg border border-border/50 bg-muted/10 overflow-hidden">
                          {/* Campaign Level */}
                          <button
                            className="w-full p-3 text-left hover:bg-muted/20 transition-colors"
                            onClick={() => toggleCampaign(campaign.campaignName)}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm">{getSourceIcon(campaign.source)}</span>
                                <Target className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span className="text-xs font-medium truncate">{campaign.campaignName}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {campaign.objective && (
                                  <Badge variant="outline" className="text-[8px] uppercase">{campaign.objective}</Badge>
                                )}
                                <Badge variant="outline" className="text-[9px] capitalize">{campaign.source}</Badge>
                                <span className="text-xs font-bold">{campaign.leads}</span>
                                {hasSubData && (
                                  isOpen ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                )}
                              </div>
                            </div>
                            <Progress value={campaign.percentage} className="h-1.5" />
                            <p className="text-[9px] text-muted-foreground mt-1">{campaign.percentage.toFixed(1)}% of attributed leads</p>
                          </button>

                          {/* Ad Set Level */}
                          {isOpen && hasSubData && (
                            <div className="border-t border-border/30 bg-muted/5">
                              {adsetList.map((adset, j) => {
                                const adList = Array.from(adset.ads.values()).sort((a, b) => b.leads - a.leads);
                                const adsetPct = campaign.leads > 0 ? (adset.leads / campaign.leads) * 100 : 0;

                                return (
                                  <div key={adset.name + j} className="border-b border-border/20 last:border-b-0">
                                    <div className="pl-8 pr-3 py-2">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <Layers className="h-3 w-3 text-muted-foreground shrink-0" />
                                          <span className="text-[11px] font-medium truncate text-muted-foreground">{adset.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                          <span className="text-[10px] text-muted-foreground">{adsetPct.toFixed(0)}%</span>
                                          <span className="text-[11px] font-semibold">{adset.leads}</span>
                                        </div>
                                      </div>

                                      {/* Ad Level */}
                                      {adList.some(ad => ad.name !== 'Default Ad') && (
                                        <div className="mt-1.5 ml-4 space-y-1">
                                          {adList.map((ad, k) => (
                                            <div key={ad.name + k} className="flex items-center justify-between text-[10px]">
                                              <div className="flex items-center gap-1.5 min-w-0">
                                                {ad.creativeUrl ? (
                                                  <img src={ad.creativeUrl} alt="" className="h-5 w-5 rounded object-cover shrink-0" />
                                                ) : (
                                                  <ImageIcon className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                                                )}
                                                <span className="text-muted-foreground truncate">{ad.name}</span>
                                              </div>
                                              <span className="font-medium shrink-0 ml-2">{ad.leads}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              {/* Attribution Method + Actions Footer */}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-2 border-t border-border/50 flex-wrap gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span>Capture:</span>
                  {autoCount > 0 && <Badge variant="outline" className="text-[9px] bg-emerald-500/5">Auto: {autoCount}</Badge>}
                  {manualCount > 0 && <Badge variant="outline" className="text-[9px] bg-blue-500/5">Manual: {manualCount}</Badge>}
                  {csvCount > 0 && <Badge variant="outline" className="text-[9px] bg-amber-500/5">CSV: {csvCount}</Badge>}
                  {enrichedCount > 0 && <Badge variant="outline" className="text-[9px] bg-primary/5">Enriched: {enrichedCount}</Badge>}
                </div>
                <div className="flex items-center gap-1.5">
                  {pendingEnrichment > 0 && (
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={handleEnrich} disabled={isEnriching}>
                      {isEnriching ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                      Enrich Meta Data
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={handleBackfill} disabled={isBackfilling}>
                    {isBackfilling ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <DatabaseBackup className="h-3 w-3 mr-1" />}
                    {isBackfilling ? backfillProgress : 'Backfill'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
