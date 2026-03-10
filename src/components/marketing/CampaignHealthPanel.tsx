import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Activity, ChevronRight } from 'lucide-react';

interface HealthFactor {
  ctr_score: number;
  cpl_score: number;
  frequency_score: number;
  efficiency_score: number;
  volume_score: number;
}

interface HealthScore {
  campaign_id: string;
  campaign_name: string;
  score: number;
  status: 'healthy' | 'watch' | 'action_needed';
  factors: HealthFactor;
  recommendations: string[];
}

const statusConfig = {
  healthy: {
    label: 'Healthy',
    color: 'bg-emerald-500',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
    emoji: '🟢',
  },
  watch: {
    label: 'Watch',
    color: 'bg-amber-500',
    textColor: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
    emoji: '🟡',
  },
  action_needed: {
    label: 'Action Needed',
    color: 'bg-red-500',
    textColor: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
    emoji: '🔴',
  },
};

const factorLabels: Record<keyof HealthFactor, string> = {
  ctr_score: 'CTR',
  cpl_score: 'CPL',
  frequency_score: 'Frequency',
  efficiency_score: 'Efficiency',
  volume_score: 'Volume',
};

interface CampaignHealthPanelProps {
  healthScores: HealthScore[];
  loading?: boolean;
}

export function CampaignHealthPanel({ healthScores, loading }: CampaignHealthPanelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Campaign Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const avgScore = healthScores.length > 0
    ? Math.round(healthScores.reduce((s, h) => s + h.score, 0) / healthScores.length)
    : 0;

  const sorted = [...healthScores].sort((a, b) => a.score - b.score);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Campaign Health
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Avg Score</span>
            <Badge
              variant="outline"
              className={`font-mono text-xs ${
                avgScore >= 60 ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400' :
                avgScore >= 35 ? 'border-amber-500/30 text-amber-600 dark:text-amber-400' :
                'border-red-500/30 text-red-600 dark:text-red-400'
              }`}
            >
              {avgScore}/100
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {healthScores.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-sm">No campaign data to score</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[340px]">
            <div className="space-y-2.5">
              {sorted.map(health => {
                const config = statusConfig[health.status];
                return (
                  <Tooltip key={health.campaign_id}>
                    <TooltipTrigger asChild>
                      <div className={`rounded-lg border p-3 cursor-default transition-colors hover:bg-accent/50 ${config.borderColor}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-sm">{config.emoji}</span>
                            <span className="text-sm font-medium truncate">{health.campaign_name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-sm font-bold font-mono ${config.textColor}`}>
                              {health.score}
                            </span>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        </div>
                        <Progress
                          value={health.score}
                          className="h-1.5"
                        />
                        <div className="flex items-center gap-3 mt-2">
                          {Object.entries(health.factors).map(([key, value]) => (
                            <div key={key} className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground">
                                {factorLabels[key as keyof HealthFactor]}
                              </span>
                              <span className={`text-[10px] font-mono font-medium ${
                                value >= 60 ? 'text-emerald-600 dark:text-emerald-400' :
                                value >= 35 ? 'text-amber-600 dark:text-amber-400' :
                                'text-red-600 dark:text-red-400'
                              }`}>
                                {value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      <div className="space-y-1">
                        <p className="font-semibold text-sm">{health.campaign_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {config.label} — Score: {health.score}/100
                        </p>
                        {health.recommendations.map((rec, i) => (
                          <p key={i} className="text-xs flex items-start gap-1">
                            <span className="shrink-0">→</span>
                            {rec}
                          </p>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
