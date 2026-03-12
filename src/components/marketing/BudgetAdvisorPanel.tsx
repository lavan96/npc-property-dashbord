import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowUpCircle, ArrowDownCircle, PauseCircle, Repeat, DollarSign, Loader2, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { AgentMessageRenderer } from '@/components/agent/AgentMessageRenderer';

interface BudgetRecommendation {
  type: 'increase' | 'decrease' | 'pause' | 'reallocate';
  priority: 'high' | 'medium' | 'low';
  campaign_id: string;
  campaign_name: string;
  current_spend: number;
  suggested_change: number;
  suggested_spend: number;
  reason: string;
  projected_impact: string;
}

const typeConfig = {
  increase: { icon: ArrowUpCircle, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/5', border: 'border-emerald-500/20', label: 'Scale Up' },
  decrease: { icon: ArrowDownCircle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/5', border: 'border-amber-500/20', label: 'Reduce' },
  pause: { icon: PauseCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/5', border: 'border-red-500/20', label: 'Pause' },
  reallocate: { icon: Repeat, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/5', border: 'border-blue-500/20', label: 'Reallocate' },
};

const priorityBadge = {
  high: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  low: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
};

interface BudgetAdvisorPanelProps {
  recommendations: BudgetRecommendation[];
  aiAnalysis: string;
  aiError?: string;
  loading?: boolean;
  summary?: { totalRecommendations: number; highPriority: number; potentialSavings: number };
}

export function BudgetAdvisorPanel({ recommendations, aiAnalysis, aiError, loading, summary }: BudgetAdvisorPanelProps) {
  const [showAI, setShowAI] = useState(true);

  if (loading) {
    return (
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Budget Reallocation Advisor
            <Badge variant="secondary" className="text-[10px] animate-pulse">Analyzing...</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Budget Reallocation Advisor
            </CardTitle>
            {summary && (
              <CardDescription className="mt-1">
                {summary.totalRecommendations} recommendation{summary.totalRecommendations !== 1 ? 's' : ''}
                {summary.potentialSavings > 0 && ` · $${summary.potentialSavings.toFixed(0)} potential savings`}
              </CardDescription>
            )}
          </div>
          {summary && summary.highPriority > 0 && (
            <Badge variant="destructive" className="text-[10px]">{summary.highPriority} High Priority</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* AI Strategic Analysis */}
        {(aiAnalysis || aiError) && (
          <div className="rounded-lg border border-primary/20 bg-primary/[0.02] p-3">
            <button
              onClick={() => setShowAI(!showAI)}
              className="flex items-center justify-between w-full text-left"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">AI Strategic Analysis</span>
                <Badge variant="secondary" className="text-[9px]">Gemini 3 Flash</Badge>
              </div>
              {showAI ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            {showAI && (
              <div className="mt-2 min-w-0 overflow-hidden">
                {aiError ? (
                  <p className="text-xs text-destructive break-words">{aiError}</p>
                ) : (
                  <AgentMessageRenderer content={aiAnalysis} />
                )}
              </div>
            )}
          </div>
        )}

        {/* Recommendation Cards */}
        {recommendations.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No budget recommendations available</p>
            <p className="text-xs mt-1">Need at least 2 campaigns with data</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2.5">
              {recommendations.map((rec, i) => {
                const config = typeConfig[rec.type];
                const Icon = config.icon;
                return (
                  <div key={`${rec.campaign_id}-${i}`} className={`rounded-lg border p-3 ${config.bg} ${config.border}`}>
                    <div className="flex items-start gap-2.5">
                      <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${config.color}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">{rec.campaign_name}</span>
                          <Badge variant="outline" className={`text-[9px] ${priorityBadge[rec.priority]}`}>
                            {rec.priority}
                          </Badge>
                          <Badge variant="outline" className={`text-[9px] ${config.color}`}>
                            {config.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{rec.reason}</p>
                        <div className="flex items-center gap-4 mt-2">
                          <div className="text-[11px]">
                            <span className="text-muted-foreground">Current: </span>
                            <span className="font-mono font-medium">${rec.current_spend.toFixed(0)}</span>
                          </div>
                          {rec.type !== 'reallocate' && (
                            <>
                              <span className="text-muted-foreground">→</span>
                              <div className="text-[11px]">
                                <span className="text-muted-foreground">Suggested: </span>
                                <span className={`font-mono font-semibold ${config.color}`}>${rec.suggested_spend.toFixed(0)}</span>
                              </div>
                            </>
                          )}
                        </div>
                        <p className="text-[11px] text-primary font-medium mt-1.5">📈 {rec.projected_impact}</p>
                      </div>
                    </div>
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
