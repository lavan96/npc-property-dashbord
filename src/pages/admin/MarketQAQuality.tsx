/**
 * Superadmin Market Q&A Quality dashboard — Phase 5 telemetry surface.
 * Reads recent `market_update_questions` and highlights refused / low-confidence
 * turns so operators can find source-coverage gaps.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';

const REFUSAL = 'I do not have enough sourced market updates to answer that yet.';

interface Row {
  id: string;
  created_at: string;
  question: string;
  answer: string;
  confidence_score: number | null;
  model_used: string | null;
  sentiment: string | null;
  time_horizon: string | null;
  source_update_ids: string[] | null;
  conversation_id: string | null;
}

export default function MarketQAQuality() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'all' | 'refused' | 'low'>('all');

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('market_update_questions')
      .select('id,created_at,question,answer,confidence_score,model_used,sentiment,time_horizon,source_update_ids,conversation_id')
      .order('created_at', { ascending: false })
      .limit(300);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const refused = rows.filter(r => (r.answer ?? '').startsWith(REFUSAL) || (r.confidence_score ?? 0) === 0).length;
    const low = rows.filter(r => (r.confidence_score ?? 0) > 0 && (r.confidence_score ?? 0) < 55).length;
    const avg = total ? Math.round(rows.reduce((s, r) => s + (r.confidence_score ?? 0), 0) / total) : 0;
    return { total, refused, low, avg };
  }, [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    if (only === 'refused' && !(r.answer?.startsWith(REFUSAL) || (r.confidence_score ?? 0) === 0)) return false;
    if (only === 'low' && !((r.confidence_score ?? 0) > 0 && (r.confidence_score ?? 0) < 55)) return false;
    if (q && !`${r.question} ${r.answer}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [rows, only, q]);

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />Market Q&A Quality</h1>
            <p className="text-sm text-muted-foreground">Last 300 turns — spot refusals and low-confidence answers to guide source coverage.</p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className={loading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />Refresh</Button>
        </header>

        <section className="grid gap-3 sm:grid-cols-4">
          {[
            { label: 'Total turns', value: stats.total },
            { label: 'Refused', value: stats.refused, tone: 'text-destructive' },
            { label: 'Low confidence', value: stats.low, tone: 'text-warning' },
            { label: 'Avg confidence', value: `${stats.avg}%`, tone: 'text-primary' },
          ].map(k => (
            <Card key={k.label}><CardContent className="p-4"><div className={`text-2xl font-semibold ${k.tone ?? ''}`}>{k.value}</div><p className="mt-1 text-xs text-muted-foreground">{k.label}</p></CardContent></Card>
          ))}
        </section>

        <div className="flex flex-wrap gap-2">
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search question or answer…" className="max-w-sm" />
          {(['all', 'refused', 'low'] as const).map(k => (
            <Button key={k} size="sm" variant={only === k ? 'default' : 'outline'} onClick={() => setOnly(k)}>
              {k === 'all' ? 'All' : k === 'refused' ? 'Refused only' : 'Low confidence only'}
            </Button>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{filtered.length} turns</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">No matches.</p>
            ) : filtered.map(r => {
              const refused = (r.answer ?? '').startsWith(REFUSAL) || (r.confidence_score ?? 0) === 0;
              return (
                <div key={r.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString('en-AU')}</span>
                    {refused && <Badge variant="outline" className="border-destructive/40 text-destructive"><AlertTriangle className="mr-1 h-3 w-3" />Refused</Badge>}
                    {!refused && (r.confidence_score ?? 0) < 55 && <Badge variant="outline" className="border-warning/40 text-warning">Low confidence</Badge>}
                    {typeof r.confidence_score === 'number' && <Badge variant="outline">{Math.round(r.confidence_score)}%</Badge>}
                    {r.model_used && <Badge variant="outline">{r.model_used}</Badge>}
                    {r.sentiment && <Badge variant="outline">{r.sentiment}</Badge>}
                    {Array.isArray(r.source_update_ids) && <Badge variant="outline">{r.source_update_ids.length} sources</Badge>}
                  </div>
                  <p className="text-sm font-medium">{r.question}</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{r.answer}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <MarketQaTrendPanel />
      </div>
    </main>
  );
}

interface Baseline { snapshot_date: string; total_questions: number; refusal_count: number; refusal_rate: number; avg_confidence: number | null; avg_retrieved_ids: number; avg_used_ids: number; low_confidence_count: number; model_mix: Record<string, number>; }

function MarketQaTrendPanel() {
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => { (async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('phase6-quality-ops', { body: { action: 'market-qa-baselines-list' } });
      setBaselines(((data as any)?.baselines ?? []) as Baseline[]);
    } finally { setLoading(false); }
  })(); }, []);
  const max = Math.max(1, ...baselines.map(b => b.total_questions));
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">30-day quality trend</CardTitle></CardHeader>
      <CardContent>
        {loading && <p className="text-xs text-muted-foreground">Loading baselines…</p>}
        {!loading && baselines.length === 0 && <p className="text-xs text-muted-foreground">No nightly snapshots yet. The <code>market-qa-quality-snapshot</code> job writes one per day.</p>}
        {baselines.length > 0 && (
          <div className="space-y-1">
            {baselines.slice(0, 30).reverse().map(b => (
              <div key={b.snapshot_date} className="grid grid-cols-[90px_1fr_60px_60px_60px] items-center gap-2 text-[11px]">
                <span className="text-muted-foreground">{b.snapshot_date}</span>
                <div className="h-3 rounded bg-muted overflow-hidden"><div className="h-full bg-primary/60" style={{ width: `${(b.total_questions / max) * 100}%` }} /></div>
                <span>{b.total_questions} q</span>
                <span className={b.refusal_rate > 0.15 ? 'text-destructive' : 'text-muted-foreground'}>{(b.refusal_rate * 100).toFixed(0)}% ref</span>
                <span className="text-muted-foreground">{b.avg_confidence != null ? `${(b.avg_confidence).toFixed(0)}%` : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
