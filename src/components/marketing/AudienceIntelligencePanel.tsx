import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, Star, TrendingDown, Loader2 } from 'lucide-react';

interface AudienceInsight {
  adset_id: string;
  adset_name: string;
  campaign_name: string;
  performance_index: number;
  spend: number;
  leads: number;
  cpl: number;
  ctr: number;
  insight: string;
}

interface AudienceIntelligencePanelProps {
  audienceInsights: AudienceInsight[];
  loading?: boolean;
}

function formatCurrency(val: number) {
  return `$${val.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AudienceIntelligencePanel({ audienceInsights, loading }: AudienceIntelligencePanelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Audience Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  const topPerformers = audienceInsights.filter(a => a.performance_index >= 65);
  const underperformers = audienceInsights.filter(a => a.performance_index < 35);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Audience & Creative Intelligence
            </CardTitle>
            <CardDescription className="mt-1">
              {audienceInsights.length} segment{audienceInsights.length !== 1 ? 's' : ''} analysed
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {topPerformers.length > 0 && (
              <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                <Star className="h-3 w-3 mr-1" />
                {topPerformers.length} Top
              </Badge>
            )}
            {underperformers.length > 0 && (
              <Badge className="text-[10px] bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
                <TrendingDown className="h-3 w-3 mr-1" />
                {underperformers.length} Weak
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {audienceInsights.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No audience data available</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[450px]">
            <div className="space-y-2">
              {audienceInsights.map((audience, i) => {
                const isTop = audience.performance_index >= 65;
                const isWeak = audience.performance_index < 35;
                return (
                  <div
                    key={audience.adset_id || i}
                    className={`rounded-lg border p-3 transition-colors ${
                      isTop ? 'border-emerald-500/20 bg-emerald-500/[0.03]' :
                      isWeak ? 'border-red-500/20 bg-red-500/[0.03]' :
                      'border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="min-w-0 flex-1 mr-2">
                        <span className="text-sm font-medium truncate block">{audience.adset_name}</span>
                        {audience.campaign_name && audience.campaign_name !== audience.adset_name && (
                          <span className="text-[10px] text-muted-foreground">{audience.campaign_name}</span>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={`font-mono text-[10px] shrink-0 ${
                          isTop ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400' :
                          isWeak ? 'border-red-500/30 text-red-600 dark:text-red-400' :
                          'border-border text-muted-foreground'
                        }`}
                      >
                        {audience.performance_index}/100
                      </Badge>
                    </div>
                    <Progress value={audience.performance_index} className="h-1 mb-2" />
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground mb-1.5">
                      <span>Spend: <span className="font-mono font-medium text-foreground">{formatCurrency(audience.spend)}</span></span>
                      <span>Leads: <span className="font-mono font-medium text-foreground">{audience.leads}</span></span>
                      <span>CPL: <span className="font-mono font-medium text-foreground">{audience.cpl > 0 ? formatCurrency(audience.cpl) : '—'}</span></span>
                      <span>CTR: <span className="font-mono font-medium text-foreground">{audience.ctr.toFixed(2)}%</span></span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{audience.insight}</p>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
