import { useQuery } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Image, DollarSign, MousePointerClick, Eye, Target, Trophy } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface CreativeGalleryProps {
  datePreset: string;
}

function formatCurrency(val: number) {
  return `$${val.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNum(val: number) {
  return val.toLocaleString('en-AU');
}

export function CreativeGalleryPanel({ datePreset }: CreativeGalleryProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['meta-ads-creatives', datePreset],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('analyze-meta-ads-phase5', {
        action: 'creatives',
        datePreset,
        limit: 20,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const creatives = data?.creatives || [];

  // Find best performers
  const bestCTR = creatives.length > 0 ? creatives.reduce((best: any, c: any) => c.ctr > (best?.ctr || 0) ? c : best, null) : null;
  const bestCPL = creatives.filter((c: any) => c.leads > 0).sort((a: any, b: any) => a.cpl - b.cpl)[0] || null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Image className="h-5 w-5 text-primary" />
          Creative Performance Gallery
        </CardTitle>
        <CardDescription>Ad creatives ranked by spend with performance metrics</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading creatives...</span>
          </div>
        ) : creatives.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <Image className="h-10 w-10 mx-auto mb-2 opacity-30" />
            No ad creatives with spend found for this period
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {creatives.map((creative: any) => {
              const isBestCTR = bestCTR?.ad_id === creative.ad_id;
              const isBestCPL = bestCPL?.ad_id === creative.ad_id;

              return (
                <div
                  key={creative.ad_id}
                  className={`rounded-lg border border-border overflow-hidden transition-shadow hover:shadow-md ${
                    isBestCTR || isBestCPL ? 'ring-1 ring-primary/30' : ''
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="aspect-video bg-muted relative overflow-hidden">
                    {creative.thumbnail_url ? (
                      <img
                        src={creative.thumbnail_url}
                        alt={creative.ad_name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Image className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                    )}
                    {/* Status badge */}
                    <Badge
                      variant={creative.status === 'ACTIVE' ? 'default' : 'secondary'}
                      className="absolute top-2 right-2 text-[9px] px-1.5 py-0"
                    >
                      {creative.status}
                    </Badge>
                    {/* Winner badges */}
                    {(isBestCTR || isBestCPL) && (
                      <div className="absolute top-2 left-2 flex gap-1">
                        {isBestCTR && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge className="bg-primary text-primary-foreground text-[9px] px-1.5 py-0 gap-0.5">
                                <Trophy className="h-2.5 w-2.5" /> CTR
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>Best click-through rate</TooltipContent>
                          </Tooltip>
                        )}
                        {isBestCPL && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge className="bg-emerald-600 text-white text-[9px] px-1.5 py-0 gap-0.5">
                                <Trophy className="h-2.5 w-2.5" /> CPL
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>Lowest cost per lead</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3 space-y-2">
                    <p className="text-sm font-medium text-foreground truncate" title={creative.ad_name}>
                      {creative.ad_name}
                    </p>
                    {creative.title && (
                      <p className="text-xs text-muted-foreground truncate">{creative.title}</p>
                    )}

                    {/* Metrics grid */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1">
                      <MetricItem icon={<DollarSign className="h-3 w-3" />} label="Spend" value={formatCurrency(creative.spend)} />
                      <MetricItem icon={<Eye className="h-3 w-3" />} label="Impr" value={formatNum(creative.impressions)} />
                      <MetricItem icon={<MousePointerClick className="h-3 w-3" />} label="CTR" value={`${creative.ctr.toFixed(2)}%`} highlight={isBestCTR} />
                      <MetricItem icon={<Target className="h-3 w-3" />} label="Leads" value={formatNum(creative.leads)} />
                      {creative.leads > 0 && (
                        <MetricItem icon={<DollarSign className="h-3 w-3" />} label="CPL" value={formatCurrency(creative.cpl)} highlight={isBestCPL} />
                      )}
                      <MetricItem icon={<MousePointerClick className="h-3 w-3" />} label="CPC" value={formatCurrency(creative.cpc)} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricItem({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={highlight ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
      <div>
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground leading-none">{label}</p>
        <p className={`text-xs font-mono font-medium leading-tight ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</p>
      </div>
    </div>
  );
}
