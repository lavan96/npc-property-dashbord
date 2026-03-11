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
import { Megaphone, Target, Users, DollarSign, TrendingUp, ChevronDown, ChevronUp, RefreshCw, Globe, Loader2, DatabaseBackup } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AttributionRow {
  id: string;
  client_id: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  meta_campaign_id: string | null;
  source_type: string;
  attributed_at: string;
}

interface CampaignAttribution {
  campaign: string;
  source: string;
  leads: number;
  percentage: number;
  metaCampaignId: string | null;
}

const formatCurrency = (val: number) =>
  `$${val.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export function LeadAttributionPanel() {
  const [expanded, setExpanded] = useState(true);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState('');
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

  // Aggregate by campaign
  const campaignMap = new Map<string, CampaignAttribution>();
  for (const attr of attributions) {
    const key = attr.utm_campaign || attr.utm_source || 'Unknown';
    const existing = campaignMap.get(key);
    if (existing) {
      existing.leads++;
    } else {
      campaignMap.set(key, {
        campaign: attr.utm_campaign || 'Direct / Unknown',
        source: attr.utm_source || 'unknown',
        leads: 1,
        percentage: 0,
        metaCampaignId: attr.meta_campaign_id,
      });
    }
  }

  const campaignList = Array.from(campaignMap.values())
    .sort((a, b) => b.leads - a.leads);
  
  const totalLeads = campaignList.reduce((sum, c) => sum + c.leads, 0);
  campaignList.forEach(c => { c.percentage = totalLeads > 0 ? (c.leads / totalLeads) * 100 : 0; });

  // Source breakdown
  const sourceMap = new Map<string, number>();
  for (const attr of attributions) {
    const src = attr.utm_source || 'unknown';
    sourceMap.set(src, (sourceMap.get(src) || 0) + 1);
  }
  const sourceList = Array.from(sourceMap.entries()).sort((a, b) => b[1] - a[1]);

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
        const { data, error } = await invokeSecureFunction('backfill-lead-attributions', {
          batchSize: 50,
          offset,
        });
        if (error) throw new Error(error.message || 'Backfill failed');
        
        totalAttributed += data.stats?.attributed || 0;
        totalProcessed += data.stats?.processed || 0;
        hasMore = data.hasMore;
        offset = data.nextOffset || offset + 50;
        setBackfillProgress(`Processed ${totalProcessed} clients, ${totalAttributed} attributed...`);
      }

      toast({
        title: 'Backfill Complete',
        description: `Processed ${totalProcessed} clients. ${totalAttributed} attribution records created.`,
      });
      refetch();
    } catch (err: any) {
      toast({
        title: 'Backfill Error',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsBackfilling(false);
      setBackfillProgress('');
    }
  };

  const sourceColors: Record<string, string> = {
    meta: 'bg-blue-500',
    google: 'bg-red-500',
    referral: 'bg-emerald-500',
    organic: 'bg-green-500',
    email: 'bg-purple-500',
    unknown: 'bg-muted-foreground',
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
            </CardTitle>
            <CardDescription className="mt-1">
              Track which campaigns generate leads that convert
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5">
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
              <p className="text-xs mt-1">Attributions are captured automatically from GHL imports or can be added manually on client profiles</p>
            </div>
          ) : (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-3 gap-3">
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
                              className={`${sourceColors[source] || 'bg-chart-4'} rounded-sm transition-all`}
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
                      <div className={`h-2 w-2 rounded-full ${sourceColors[source] || 'bg-chart-4'}`} />
                      <span className="text-muted-foreground capitalize">{source}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Campaign Breakdown */}
              <div>
                <p className="text-xs font-semibold text-foreground mb-2">Campaign Performance</p>
                <ScrollArea className="max-h-[300px]">
                  <div className="space-y-2">
                    {campaignList.map((campaign, i) => (
                      <div key={campaign.campaign + i} className="rounded-lg border border-border/50 bg-muted/10 p-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <Target className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="text-xs font-medium truncate">{campaign.campaign}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="outline" className="text-[9px] capitalize">{campaign.source}</Badge>
                            <span className="text-xs font-bold">{campaign.leads}</span>
                          </div>
                        </div>
                        <Progress value={campaign.percentage} className="h-1.5" />
                        <p className="text-[9px] text-muted-foreground mt-1">{campaign.percentage.toFixed(1)}% of attributed leads</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Attribution Method Breakdown */}
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-2 border-t border-border/50">
                <span>Capture method:</span>
                {autoCount > 0 && <Badge variant="outline" className="text-[9px] bg-emerald-500/5">Auto: {autoCount}</Badge>}
                {manualCount > 0 && <Badge variant="outline" className="text-[9px] bg-blue-500/5">Manual: {manualCount}</Badge>}
                {csvCount > 0 && <Badge variant="outline" className="text-[9px] bg-amber-500/5">CSV: {csvCount}</Badge>}
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
