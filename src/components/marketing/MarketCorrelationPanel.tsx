import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Badge } from '@/components/ui/badge';
import { Loader2, Activity, Brain, AlertTriangle, ExternalLink, Globe, ArrowUp, ArrowDown, Minus, Calendar } from 'lucide-react';

interface MarketEvent {
  date: string;
  event: string;
  category: 'interest_rate' | 'economic' | 'housing' | 'regulatory' | 'seasonal';
  impact: 'positive' | 'negative' | 'neutral';
  description: string;
  relevance_score: number;
}

interface MarketCorrelationPanelProps {
  marketEvents: MarketEvent[];
  perplexityResearch: string;
  citations: string[];
  aiAnalysis: string;
  aiError?: string;
  loading: boolean;
}

const CATEGORY_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  interest_rate: { label: 'Interest Rate', emoji: '🏦', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30' },
  economic: { label: 'Economic', emoji: '📊', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30' },
  housing: { label: 'Housing', emoji: '🏠', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
  regulatory: { label: 'Regulatory', emoji: '⚖️', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30' },
  seasonal: { label: 'Seasonal', emoji: '📅', color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30' },
};

function ImpactIcon({ impact }: { impact: string }) {
  if (impact === 'positive') return <ArrowUp className="h-3.5 w-3.5 text-emerald-500" />;
  if (impact === 'negative') return <ArrowDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isUpcoming(dateStr: string) {
  return new Date(dateStr) > new Date();
}

export function MarketCorrelationPanel({ marketEvents, perplexityResearch, citations, aiAnalysis, aiError, loading }: MarketCorrelationPanelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Market Correlation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Analyzing market conditions...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!marketEvents?.length && !aiAnalysis && !perplexityResearch) return null;

  const recentEvents = marketEvents.filter(e => !isUpcoming(e.date)).slice(0, 8);
  const upcomingEvents = marketEvents.filter(e => isUpcoming(e.date)).slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Market Correlation & Intelligence
            <Badge variant="secondary" className="text-[10px]">Phase 4</Badge>
          </CardTitle>
          <CardDescription className="mt-1">
            How macro events impact your ad performance
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* AI Correlation Analysis */}
        {aiAnalysis && (
          <div className="rounded-lg border border-primary/20 bg-primary/[0.02] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">AI Market Correlation</span>
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

        {/* Timeline: Recent + Upcoming Events */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent Events */}
          {recentEvents.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Recent Events
              </h4>
              <div className="space-y-2">
                {recentEvents.map((event, i) => {
                  const catConfig = CATEGORY_CONFIG[event.category] || CATEGORY_CONFIG.economic;
                  return (
                    <div key={i} className="flex items-start gap-3 rounded-lg border border-border/50 bg-card p-3 hover:bg-muted/30 transition-colors">
                      <div className="mt-0.5">
                        <ImpactIcon impact={event.impact} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-xs font-semibold text-foreground">{event.event}</span>
                          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${catConfig.color}`}>
                            {catConfig.emoji} {catConfig.label}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{event.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground/70">{formatDate(event.date)}</span>
                          {event.relevance_score >= 70 && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-primary/30 text-primary">
                              High Relevance
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upcoming Events */}
          {upcomingEvents.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Upcoming Events to Watch
              </h4>
              <div className="space-y-2">
                {upcomingEvents.map((event, i) => {
                  const catConfig = CATEGORY_CONFIG[event.category] || CATEGORY_CONFIG.economic;
                  return (
                    <div key={i} className="flex items-start gap-3 rounded-lg border border-dashed border-primary/30 bg-primary/[0.02] p-3">
                      <div className="mt-0.5">
                        <ImpactIcon impact={event.impact} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-xs font-semibold text-foreground">{event.event}</span>
                          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${catConfig.color}`}>
                            {catConfig.emoji} {catConfig.label}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{event.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-medium text-primary">{formatDate(event.date)}</span>
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-primary/40 text-primary bg-primary/5">
                            Upcoming
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Perplexity Research */}
        {perplexityResearch && (
          <details className="group">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              View Full Market Intelligence Report
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
