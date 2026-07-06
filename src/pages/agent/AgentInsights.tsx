import { useEffect, useState } from 'react';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, X, Check, RefreshCw, AlertTriangle, Info, TrendingUp, Zap } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

interface Insight {
  id: string; kind: string; title: string; summary: string | null;
  body_markdown: string | null; severity: 'info' | 'success' | 'warning' | 'critical';
  payload: any; is_read: boolean; is_dismissed: boolean; acted_on_at: string | null;
  created_at: string;
}

const iconFor = (s: string) => s === 'critical' ? AlertTriangle : s === 'warning' ? Zap : s === 'success' ? TrendingUp : Info;
const colourFor = (s: string) => s === 'critical' ? 'text-destructive' : s === 'warning' ? 'text-warning' : s === 'success' ? 'text-success' : 'text-primary';

export default function AgentInsights() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await invokeSecureFunction('ai-dashboard-agent', { action: 'list-insights' });
    setInsights(data?.insights || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const runNow = async () => {
    setRunning(true);
    try {
      await invokeSecureFunction('agent-insights-runner', {});
      toast.success('Insights refreshed');
      await load();
    } catch (e: any) { toast.error(e?.message || 'Failed'); }
    finally { setRunning(false); }
  };

  const markRead = async (id: string) => {
    await invokeSecureFunction('ai-dashboard-agent', { action: 'mark-insight-read', insight_id: id });
    setInsights(prev => prev.map(i => i.id === id ? { ...i, is_read: true } : i));
  };
  const dismiss = async (id: string) => {
    await invokeSecureFunction('ai-dashboard-agent', { action: 'dismiss-insight', insight_id: id });
    setInsights(prev => prev.filter(i => i.id !== id));
  };
  const actOn = async (id: string) => {
    await invokeSecureFunction('ai-dashboard-agent', { action: 'act-on-insight', insight_id: id });
    toast.success('Marked as acted on');
    load();
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Sparkles className="w-7 h-7 text-primary" /> Agent Insights</h1>
          <p className="text-muted-foreground mt-1">Proactive briefings, alerts, and reminders from the Aurixa Agent.</p>
        </div>
        <Button variant="outline" onClick={runNow} disabled={running}>
          <RefreshCw className={`w-4 h-4 mr-2 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Generating…' : 'Refresh now'}
        </Button>
      </div>

      <ScrollArea className="h-[75vh] pr-3">
        <div className="space-y-3">
          {loading && <div className="text-sm text-muted-foreground p-4">Loading…</div>}
          {!loading && !insights.length && (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p>No active insights. Tap <span className="font-medium">Refresh now</span> to generate today's briefing.</p>
            </CardContent></Card>
          )}
          {insights.map(insight => {
            const Icon = iconFor(insight.severity);
            const colour = colourFor(insight.severity);
            return (
              <Card key={insight.id} className={`transition-all ${insight.is_read ? 'opacity-70' : ''} hover:border-primary/60`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <Icon className={`w-5 h-5 mt-0.5 ${colour} shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base">{insight.title}</CardTitle>
                        {insight.summary && <p className="text-sm text-muted-foreground mt-1">{insight.summary}</p>}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-[10px]">{insight.kind}</Badge>
                          <Badge variant="outline" className="text-[10px]">{insight.severity}</Badge>
                          <span className="text-[10px] text-muted-foreground">{new Date(insight.created_at).toLocaleString()}</span>
                          {insight.acted_on_at && <Badge className="text-[10px] bg-success/20 text-success">Acted on</Badge>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {!insight.acted_on_at && <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => actOn(insight.id)} title="Mark acted on"><Check className="w-3.5 h-3.5" /></Button>}
                      {!insight.is_read && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => markRead(insight.id)} title="Mark read"><Info className="w-3.5 h-3.5" /></Button>}
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => dismiss(insight.id)} title="Dismiss"><X className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                </CardHeader>
                {insight.body_markdown && (
                  <CardContent className="pt-0 text-sm prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{insight.body_markdown}</ReactMarkdown>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
