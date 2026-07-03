import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Building2, ExternalLink, FileText, Globe2, Loader2, Newspaper, RefreshCw, Search, Settings, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { answerMarketUpdateQuestion, fetchMarketUpdates, generateMarketDigest24h } from '@/services/marketUpdatesService';
import type { MarketAudienceTag, MarketDigest24h, MarketGeography, MarketImpactLevel, MarketQAMessage, MarketUpdate, MarketUpdateCategory } from '@/types/marketUpdates';

const categories: Array<'all' | MarketUpdateCategory> = ['all', 'finance', 'property_market', 'construction', 'policy_regulation', 'rental_market', 'economy', 'political', 'planning_supply'];
const geographies: Array<'all' | MarketGeography> = ['all', 'Australia', 'NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
const impacts: Array<'all' | MarketImpactLevel> = ['all', 'high', 'medium', 'low'];
const audiences: Array<'all' | MarketAudienceTag> = ['all', 'investors', 'owner_occupiers', 'first_home_buyers', 'smsf', 'developers', 'buyers_agents', 'mortgage_brokers'];

const label = (value: string) => value === 'all' ? 'All' : value.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');

export default function MarketUpdates() {
  const [updates, setUpdates] = useState<MarketUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [digestLoading, setDigestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [digest, setDigest] = useState<MarketDigest24h | null>(null);
  const [selectedUpdate, setSelectedUpdate] = useState<MarketUpdate | null>(null);
  const [qaUpdate, setQaUpdate] = useState<MarketUpdate | null>(null);
  const [question, setQuestion] = useState('');
  const [qaMessage, setQaMessage] = useState<MarketQAMessage | null>(null);
  const [filters, setFilters] = useState({ category: 'all', geography: 'all', impact: 'all', audience: 'all' });

  const loadUpdates = async () => {
    setLoading(true); setError(null);
    try { setUpdates(await fetchMarketUpdates()); } catch { setError('Market update ingestion failed. Check source configuration and retry.'); } finally { setLoading(false); }
  };

  useEffect(() => { void loadUpdates(); }, []);

  const filteredUpdates = useMemo(() => updates.filter((update) => (
    (filters.category === 'all' || update.category === filters.category) &&
    (filters.geography === 'all' || update.geography.includes(filters.geography as MarketGeography)) &&
    (filters.impact === 'all' || update.impact_level === filters.impact) &&
    (filters.audience === 'all' || update.audience_tags.includes(filters.audience as MarketAudienceTag))
  )), [filters, updates]);

  const kpis = useMemo(() => {
    const today = new Date().toDateString();
    return [
      { label: 'Updates Today', value: updates.filter((u) => new Date(u.ingested_at).toDateString() === today).length, icon: Newspaper },
      { label: 'High Impact', value: updates.filter((u) => u.impact_level === 'high').length, icon: TrendingUp },
      { label: 'Finance & Lending', value: updates.filter((u) => u.category === 'finance').length, icon: BarChart3 },
      { label: 'Property Market', value: updates.filter((u) => u.category === 'property_market').length, icon: Building2 },
      { label: 'Policy / Regulation', value: updates.filter((u) => u.category === 'policy_regulation').length, icon: ShieldCheck },
      { label: 'Construction & Supply', value: updates.filter((u) => u.category === 'construction' || u.category === 'planning_supply').length, icon: Activity },
    ];
  }, [updates]);

  const handleDigest = async () => { setDigestLoading(true); setDigest(await generateMarketDigest24h(updates)); setDigestLoading(false); };
  const handleAsk = async () => { setQaMessage(await answerMarketUpdateQuestion(question, qaUpdate ? [qaUpdate] : updates)); };

  return <main className="min-h-screen space-y-6 bg-slate-950 p-4 text-slate-100 md:p-6">
    <section className="overflow-hidden rounded-[2rem] border border-cyan-400/20 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 p-6 shadow-2xl shadow-cyan-950/30">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-4"><Badge className="bg-cyan-400/10 text-cyan-200">AI MARKET INTELLIGENCE</Badge><h1 className="text-4xl font-bold tracking-tight">Market Updates</h1><p className="max-w-3xl text-slate-300">Daily Australian property, finance, construction, and policy updates in one report-ready workspace.</p><div className="flex flex-wrap gap-2 text-xs text-slate-400"><Badge variant="outline">Last updated: awaiting first ingestion run</Badge><Badge variant="outline">Coverage: Australia-wide</Badge><Badge variant="outline">Refresh cycle: 24 hours</Badge></div></div>
        <div className="flex flex-wrap gap-2"><Button onClick={loadUpdates} aria-label="Refresh market updates"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button><Button onClick={handleDigest} disabled={digestLoading}>{digestLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Generate 24h Digest</Button><Button disabled variant="outline"><FileText className="mr-2 h-4 w-4" />Export Summary</Button><Button disabled variant="outline"><Settings className="mr-2 h-4 w-4" />Sources</Button></div>
      </div>
    </section>

    {error && <Card className="border-red-400/30 bg-red-950/30"><CardContent className="p-4 text-red-100">{error}</CardContent></Card>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">{kpis.map((kpi) => <Card key={kpi.label} className="border-white/10 bg-white/[0.04] text-slate-100 transition hover:-translate-y-0.5 hover:border-cyan-300/30"><CardContent className="p-4"><kpi.icon className="mb-4 h-5 w-5 text-cyan-300" /><div className="text-3xl font-semibold">{kpi.value}</div><p className="text-xs text-slate-400">{kpi.label}</p></CardContent></Card>)}</section>

    <section className="grid gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-4">{[
      ['category', categories], ['geography', geographies], ['impact', impacts], ['audience', audiences],
    ].map(([key, values]) => <div key={key as string} className="space-y-2"><Label>{label(key as string)}</Label><Select value={(filters as any)[key]} onValueChange={(value) => setFilters((f) => ({ ...f, [key as string]: value }))}><SelectTrigger aria-label={`Filter by ${key}`}><SelectValue /></SelectTrigger><SelectContent>{(values as string[]).map((value) => <SelectItem key={value} value={value}>{key === 'impact' && value === 'all' ? 'All Impact' : key === 'audience' && value === 'all' ? 'All Audiences' : label(value)}</SelectItem>)}</SelectContent></Select></div>)}</section>

    <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-6"><Card className="border-purple-400/20 bg-slate-900/80 text-slate-100"><CardHeader><CardTitle>Daily Market Digest</CardTitle></CardHeader><CardContent>{digest ? <p>{digest.executive_summary}</p> : <p className="text-slate-400">No updates found in the last 24 hours.</p>}</CardContent></Card>
        <Card className="border-white/10 bg-slate-900/80 text-slate-100"><CardHeader><CardTitle>Source-backed Update Cards</CardTitle></CardHeader><CardContent className="space-y-4">{loading ? <p>Loading market workspace…</p> : filteredUpdates.length === 0 ? <div className="rounded-2xl border border-dashed border-cyan-300/30 p-10 text-center"><Globe2 className="mx-auto mb-3 h-10 w-10 text-cyan-300" /><h2 className="text-xl font-semibold">No market updates available yet</h2><p className="mt-2 text-slate-400">Configure sources or run the first 24-hour ingestion job to begin.</p></div> : filteredUpdates.map((update) => <article key={update.id} className="rounded-2xl border border-white/10 p-4"><div className="flex flex-wrap gap-2"><Badge>{label(update.category)}</Badge><Badge variant="outline">Impact: {label(update.impact_level)}</Badge>{update.geography.map((geo) => <Badge key={geo} variant="secondary">{geo}</Badge>)}</div><h3 className="mt-3 text-lg font-semibold">{update.title}</h3><p className="text-sm text-slate-400">{update.source_name} · {update.source_published_at ?? 'Publication time unavailable'}</p><p className="mt-3">{update.ai_summary ?? 'Summary awaiting source-grounded AI processing.'}</p><p className="mt-2 text-sm text-slate-300"><strong>Why it matters:</strong> {update.why_it_matters ?? 'Implications will appear once summarisation is connected.'}</p><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" onClick={() => setSelectedUpdate(update)}>Open Analysis</Button><Button size="sm" variant="outline" onClick={() => setQaUpdate(update)}>Ask AI</Button>{update.source_url && <Button asChild size="sm" variant="ghost"><a href={update.source_url} target="_blank" rel="noreferrer">Source <ExternalLink className="ml-1 h-3 w-3" /></a></Button>}</div></article>)}</CardContent></Card></div>
      <aside className="space-y-4"><Card className="border-white/10 bg-white/[0.04] text-slate-100"><CardHeader><CardTitle>Category Breakdown</CardTitle></CardHeader><CardContent className="space-y-2">{categories.filter((c) => c !== 'all').map((cat) => <div key={cat} className="flex justify-between text-sm"><span>{label(cat)}</span><span>{updates.filter((u) => u.category === cat).length}</span></div>)}</CardContent></Card><Card className="border-white/10 bg-white/[0.04] text-slate-100"><CardHeader><CardTitle>High Impact Watchlist</CardTitle></CardHeader><CardContent className="text-sm text-slate-400">{updates.some((u) => u.impact_level === 'high') ? 'High impact updates are available in the feed.' : 'No high impact sourced updates yet.'}</CardContent></Card><Card className="border-white/10 bg-white/[0.04] text-slate-100"><CardHeader><CardTitle>Ask AI about market updates</CardTitle></CardHeader><CardContent className="space-y-3"><Search className="h-5 w-5 text-cyan-300" /><p className="text-sm text-slate-400">Market Q&A engine will activate once source-grounded ingestion is connected.</p></CardContent></Card><Card className="border-white/10 bg-white/[0.04] text-slate-100"><CardHeader><CardTitle>Source Health</CardTitle></CardHeader><CardContent className="text-sm text-slate-400">Source registry ready. No enabled sources connected yet.</CardContent></Card></aside>
    </section>

    <Dialog open={Boolean(selectedUpdate)} onOpenChange={(open) => !open && setSelectedUpdate(null)}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{selectedUpdate?.title}</DialogTitle></DialogHeader><div className="space-y-4 text-sm"><p><strong>Source:</strong> {selectedUpdate?.source_name ?? 'Unavailable'}</p><p><strong>Executive summary:</strong> {selectedUpdate?.ai_summary ?? 'Awaiting source-grounded analysis.'}</p><p><strong>Property industry implications:</strong> {selectedUpdate?.property_implications ?? 'Not available yet.'}</p><p><strong>Buyer/investor implications:</strong> {selectedUpdate?.why_it_matters ?? 'Not available yet.'}</p><p><strong>Risks or watchpoints:</strong> {selectedUpdate?.risk_flags?.join(', ') || 'Not available yet.'}</p><p><strong>AI confidence / source coverage:</strong> {selectedUpdate?.confidence_score ?? 0}%</p></div></DialogContent></Dialog>
    <Dialog open={Boolean(qaUpdate)} onOpenChange={(open) => { if (!open) { setQaUpdate(null); setQaMessage(null); } }}><DialogContent><DialogHeader><DialogTitle>Ask AI about this update</DialogTitle></DialogHeader><Label htmlFor="market-question">Question</Label><Textarea id="market-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a source-grounded question…" /><Button onClick={handleAsk}>Ask safely</Button><p className="text-sm text-slate-500">{qaMessage?.content ?? 'There is not enough sourced market information available to answer this yet.'}</p></DialogContent></Dialog>
  </main>;
}
