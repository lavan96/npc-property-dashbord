import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, GitBranch, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface LeadQualityData {
  source: string;
  total_leads: number;
  pipeline_progression: Record<string, number>;
  conversion_rate: number;
  avg_days_to_convert: number;
  estimated_true_cpa: number;
  quality_score: number;
}

interface LeadQualityPanelProps {
  leadQuality: LeadQualityData[];
  aiAnalysis: string;
  loading?: boolean;
}

const sourceLabels: Record<string, string> = {
  facebook: '📘 Facebook / Meta Ads',
  meta: '📘 Meta Ads',
  google: '🔍 Google Ads',
  referral: '🤝 Referral',
  organic: '🌱 Organic',
  unknown: '❓ Unknown',
};

export function LeadQualityPanel({ leadQuality, aiAnalysis, loading }: LeadQualityPanelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-primary" />
            Lead Quality Correlation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" />
              Lead Quality Correlation
            </CardTitle>
            <CardDescription className="mt-1">
              Ad source → pipeline progression analysis
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-[10px]">
            GHL Bridge
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {leadQuality.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">No lead source data available yet</p>
            <p className="text-xs mt-1 max-w-sm mx-auto">
              Tag clients with their lead source (e.g., "facebook", "google", "referral") to see which campaigns produce the highest quality leads that convert to signed clients.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-3">
              {leadQuality.map((lq, i) => {
                const maxLeads = Math.max(...leadQuality.map(l => l.total_leads), 1);
                const topStages = Object.entries(lq.pipeline_progression)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5);

                return (
                  <div key={`${lq.source}-${i}`} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">
                          {sourceLabels[lq.source] || lq.source}
                        </span>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {lq.total_leads} leads
                        </Badge>
                      </div>
                      <Badge
                        variant="outline"
                        className={`font-mono text-[10px] ${
                          lq.quality_score >= 65 ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400' :
                          lq.quality_score >= 40 ? 'border-amber-500/30 text-amber-600 dark:text-amber-400' :
                          'border-red-500/30 text-red-600 dark:text-red-400'
                        }`}
                      >
                        Quality: {lq.quality_score}/100
                      </Badge>
                    </div>

                    {/* Pipeline Funnel */}
                    <div className="space-y-1 mb-2">
                      {topStages.map(([stage, count]) => (
                        <div key={stage} className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-32 truncate">{stage}</span>
                          <Progress value={(count / lq.total_leads) * 100} className="h-1.5 flex-1" />
                          <span className="text-[10px] font-mono w-6 text-right">{count}</span>
                        </div>
                      ))}
                    </div>

                    {/* Metrics */}
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                      <span>
                        Conv Rate: <span className={`font-mono font-medium ${lq.conversion_rate > 10 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>
                          {lq.conversion_rate.toFixed(1)}%
                        </span>
                      </span>
                      {lq.avg_days_to_convert > 0 && (
                        <span>
                          Avg Days: <span className="font-mono font-medium text-foreground">{lq.avg_days_to_convert.toFixed(0)}</span>
                        </span>
                      )}
                      {lq.estimated_true_cpa > 0 && (
                        <span>
                          True CPA: <span className="font-mono font-medium text-foreground">
                            ${lq.estimated_true_cpa.toFixed(2)}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        {/* AI Analysis */}
        {aiAnalysis && (
          <div className="rounded-lg border border-primary/20 bg-primary/[0.02] p-3">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-foreground">AI Lead Quality Analysis</span>
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:text-xs prose-p:my-1 prose-strong:text-foreground prose-li:text-xs prose-li:my-0 prose-ul:my-1">
              <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
