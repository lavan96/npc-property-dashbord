import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Globe, Brain, AlertTriangle, ExternalLink, TrendingUp, TrendingDown, Minus, Award, Target } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, Cell, Legend } from 'recharts';

interface BenchmarkData {
  metric: string;
  your_value: number;
  industry_avg: number;
  industry_top_quartile: number;
  percentile_rank: number;
  verdict: 'excellent' | 'above_average' | 'average' | 'below_average' | 'poor';
  insight: string;
}

interface BenchmarksPanelProps {
  benchmarks: BenchmarkData[];
  perplexityResearch: string;
  citations: string[];
  aiAnalysis: string;
  aiError?: string;
  rawBenchmarks?: any;
  loading: boolean;
}

const VERDICT_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  excellent: { label: 'Excellent', color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/30' },
  above_average: { label: 'Above Avg', color: 'text-sky-600 dark:text-sky-400', bgColor: 'bg-sky-500/10', borderColor: 'border-sky-500/30' },
  average: { label: 'Average', color: 'text-muted-foreground', bgColor: 'bg-muted/30', borderColor: 'border-border' },
  below_average: { label: 'Below Avg', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/30' },
  poor: { label: 'Poor', color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/30' },
};

function formatMetricValue(metric: string, value: number): string {
  if (metric === 'CTR') return `${value.toFixed(2)}%`;
  return `$${value.toFixed(2)}`;
}

function PercentileBar({ percentile }: { percentile: number }) {
  const color = percentile >= 75 ? 'bg-emerald-500' : percentile >= 50 ? 'bg-sky-500' : percentile >= 25 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${percentile}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{percentile}th</span>
    </div>
  );
}

export function BenchmarksPanel({ benchmarks, perplexityResearch, citations, aiAnalysis, aiError, rawBenchmarks, loading }: BenchmarksPanelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Industry Benchmarks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Researching industry benchmarks...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!benchmarks || benchmarks.length === 0) return null;

  // Chart data
  const chartData = benchmarks.map(b => ({
    metric: b.metric,
    yours: b.your_value,
    industry: b.industry_avg,
    topQuartile: b.industry_top_quartile,
  }));

  // Overall score
  const avgPercentile = Math.round(benchmarks.reduce((s, b) => s + b.percentile_rank, 0) / benchmarks.length);
  const overallVerdict = avgPercentile >= 75 ? 'excellent' : avgPercentile >= 55 ? 'above_average' : avgPercentile >= 35 ? 'average' : avgPercentile >= 20 ? 'below_average' : 'poor';
  const overallConfig = VERDICT_CONFIG[overallVerdict];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Industry Benchmarks
              <Badge variant="secondary" className="text-[10px]">Phase 4</Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              Your performance vs. Australian property investment ad benchmarks
              {rawBenchmarks?.data_period && (
                <span className="ml-1 text-[10px]">· {rawBenchmarks.data_period}</span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`${overallConfig.borderColor} ${overallConfig.color} ${overallConfig.bgColor} text-xs px-2.5 py-1 gap-1`}>
              <Award className="h-3 w-3" />
              {avgPercentile}th Percentile · {overallConfig.label}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Benchmark Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {benchmarks.map((b) => {
            const config = VERDICT_CONFIG[b.verdict];
            return (
              <div key={b.metric} className={`rounded-lg border ${config.borderColor} ${config.bgColor} p-4`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-foreground">{b.metric}</span>
                  <Badge variant="outline" className={`text-[10px] ${config.borderColor} ${config.color}`}>
                    {config.label}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-2.5">
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Yours</p>
                    <p className="text-sm font-bold font-mono text-foreground">{formatMetricValue(b.metric, b.your_value)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Industry Avg</p>
                    <p className="text-sm font-mono text-muted-foreground">{formatMetricValue(b.metric, b.industry_avg)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Top 25%</p>
                    <p className="text-sm font-mono text-muted-foreground">{formatMetricValue(b.metric, b.industry_top_quartile)}</p>
                  </div>
                </div>
                <PercentileBar percentile={b.percentile_rank} />
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{b.insight}</p>
              </div>
            );
          })}
        </div>

        {/* AI Strategic Analysis */}
        {aiAnalysis && (
          <div className="rounded-lg border border-primary/20 bg-primary/[0.02] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">AI Competitive Analysis</span>
            </div>
            <div className="text-sm text-foreground/80 leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-headings:font-semibold prose-h2:text-base prose-h2:mt-5 prose-h2:mb-2.5 prose-h3:text-[15px] prose-h3:mt-4 prose-h3:mb-2 prose-h4:text-sm prose-h4:mt-3 prose-h4:mb-1.5 prose-p:my-2.5 prose-p:leading-relaxed prose-li:my-1 prose-ul:my-2.5 prose-ol:my-2.5 prose-strong:text-foreground prose-a:text-primary prose-hr:my-4 prose-blockquote:border-primary/30 prose-blockquote:text-muted-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiAnalysis}</ReactMarkdown>
            </div>
          </div>
        )}

        {aiError && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-600 dark:text-amber-400">{aiError}</p>
          </div>
        )}

        {/* Perplexity Research + Citations */}
        {perplexityResearch && (
          <details className="group">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              View Real-Time Market Research
              {citations.length > 0 && <span className="text-[10px]">({citations.length} sources)</span>}
            </summary>
            <div className="mt-3 rounded-lg border border-border/50 bg-muted/20 p-4">
              <div className="text-xs text-foreground/70 leading-relaxed prose prose-xs dark:prose-invert max-w-none prose-headings:text-foreground prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1.5 prose-p:my-1 prose-li:my-0.5 prose-strong:text-foreground prose-a:text-primary prose-headings:text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{perplexityResearch}</ReactMarkdown>
              </div>
              {citations.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Sources</p>
                  <div className="flex flex-wrap gap-1.5">
                    {citations.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 bg-primary/5 rounded px-1.5 py-0.5"
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        Source {i + 1}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
