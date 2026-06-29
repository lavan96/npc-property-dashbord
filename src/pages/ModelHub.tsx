import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertTriangle, CheckCircle2, ExternalLink, KeyRound, Sparkles, Zap,
  Brain, Image as ImageIcon, Search, RefreshCw, ShieldCheck, Globe,
  Network, Workflow, Save, FlaskConical, ArrowUpCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getRecommendedUpgrade, isModelDeprecated } from '@/lib/agentUpgradeRecommendations';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DashboardThemeFrame } from '@/components/layout/DashboardThemeFrame';

type Route = 'gateway' | 'native' | 'openrouter';
type Status = 'available' | 'preview' | 'deprecated' | 'unavailable';

interface CatalogModel {
  provider: string;
  route: Route;
  model_id: string;
  display_name: string;
  status: Status;
  context_window: number | null;
  capabilities: string[];
  pricing_input_per_1m: number | null;
  pricing_output_per_1m: number | null;
  last_probed_at: string;
  probe_error: string | null;
}

interface ProviderResult {
  provider: string;
  route: Route;
  ok: boolean;
  keyConfigured: boolean;
  modelCount: number;
  error?: string;
  probedAt: string;
}

interface AvailabilityResponse {
  success: boolean;
  cached: boolean;
  checkedAt: string;
  providers: ProviderResult[];
  models: CatalogModel[];
  nativeKeys: Record<'openai' | 'anthropic' | 'gemini' | 'perplexity', boolean>;
  gatewayKey: boolean;
  openrouterKey?: boolean;
}

interface AgentAssignment {
  id: string;
  agent_key: string;
  agent_label: string;
  agent_category: string;
  agent_description: string | null;
  route: Route;
  model_id: string;
  fallback_chain: Array<{ route: Route; model_id: string }>;
  last_used_at: string | null;
  last_error: string | null;
}

const PROVIDER_BRAND: Record<string, { name: string; color: string; docs: string }> = {
  openai:     { name: 'OpenAI',          color: 'text-emerald-400', docs: 'https://platform.openai.com/docs/models' },
  anthropic:  { name: 'Anthropic Claude', color: 'text-orange-400', docs: 'https://docs.anthropic.com/en/docs/about-claude/models' },
  gemini:     { name: 'Google Gemini',   color: 'text-sky-400',     docs: 'https://ai.google.dev/gemini-api/docs/models' },
  perplexity: { name: 'Perplexity',      color: 'text-violet-400',  docs: 'https://docs.perplexity.ai/guides/model-cards' },
  gateway:    { name: 'Lovable Gateway', color: 'text-primary',     docs: 'https://docs.lovable.dev' },
  openrouter: { name: 'OpenRouter',      color: 'text-pink-400',    docs: 'https://openrouter.ai/docs' },
};

const capabilityIcon: Record<string, React.ReactNode> = {
  text: <Sparkles className="h-3 w-3" />,
  vision: <ImageIcon className="h-3 w-3" />,
  reasoning: <Brain className="h-3 w-3" />,
  'image-gen': <ImageIcon className="h-3 w-3" />,
  'image-edit': <ImageIcon className="h-3 w-3" />,
  search: <Search className="h-3 w-3" />,
  citations: <Search className="h-3 w-3" />,
  audio: <Zap className="h-3 w-3" />,
};


function MetricTile({
  label,
  value,
  icon: Icon,
  tone,
  helper,
}: {
  label: string;
  value: number;
  icon: typeof Sparkles;
  tone: 'primary' | 'info' | 'warning' | 'success';
  helper: string;
}) {
  const toneClasses = {
    primary: 'border-primary/30 bg-primary/[0.08] text-primary shadow-primary/10',
    info: 'border-info/25 bg-info/[0.08] text-info shadow-sky-500/10 dark:text-sky-300',
    warning: 'border-warning/30 bg-warning/10 text-warning shadow-amber-500/10 dark:text-amber-300',
    success: 'border-success/30 bg-success/10 text-success shadow-emerald-500/10 dark:text-emerald-300',
  }[tone];

  return (
    <DashboardThemeFrame
      variant="premiumCard"
      className={`relative min-h-[132px] p-4 shadow-lg ${toneClasses}`}
    >
      <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-current/35 to-transparent" />
      <div className="flex h-full items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{value}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{helper}</p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-current/20 bg-current/10 shadow-inner">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </DashboardThemeFrame>
  );
}

function statusBadge(status: Status) {
  switch (status) {
    case 'available':   return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'preview':     return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    case 'deprecated':  return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'unavailable': return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
  }
}

function ModelCard({ model }: { model: CatalogModel }) {
  const brand = PROVIDER_BRAND[model.provider] ?? PROVIDER_BRAND.gateway;
  return (
    <Card className="border-border/60 bg-card/50 backdrop-blur transition-all hover:border-primary/40 hover:bg-card/80">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className={`text-sm ${brand.color} truncate`}>{model.display_name}</CardTitle>
            <CardDescription className="mt-1 font-mono text-[10px] truncate">{model.model_id}</CardDescription>
          </div>
          <Badge variant="outline" className={`${statusBadge(model.status)} text-[10px]`}>{model.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <div className="flex flex-wrap gap-1">
          {(model.capabilities ?? []).slice(0, 5).map((cap) => (
            <Badge key={cap} variant="secondary" className="gap-1 bg-muted/50 text-[10px] font-normal">
              {capabilityIcon[cap]} {cap}
            </Badge>
          ))}
        </div>
        {model.context_window && (
          <p className="text-[11px] text-muted-foreground">Context: {(model.context_window / 1000).toFixed(0)}k tokens</p>
        )}
        {(model.pricing_input_per_1m || model.pricing_output_per_1m) && (
          <p className="text-[11px] text-muted-foreground">
            ${model.pricing_input_per_1m?.toFixed(2) ?? '–'} in / ${model.pricing_output_per_1m?.toFixed(2) ?? '–'} out per 1M
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ProviderHeader({ providerId, route, ok, keyConfigured, modelCount, error }: { providerId: string; route: Route; ok: boolean; keyConfigured: boolean; modelCount: number; error?: string }) {
  const brand = PROVIDER_BRAND[providerId] ?? PROVIDER_BRAND.gateway;
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className={`text-lg font-semibold ${brand.color}`}>{brand.name}</h3>
        <Badge variant="outline" className={ok && keyConfigured ? 'border-emerald-500/30 text-emerald-300' : keyConfigured ? 'border-amber-500/30 text-amber-300' : 'border-rose-500/30 text-rose-300'}>
          {ok && keyConfigured ? <><CheckCircle2 className="mr-1 h-3 w-3" /> Live ({modelCount})</> : keyConfigured ? <><AlertTriangle className="mr-1 h-3 w-3" /> Probe failed</> : <><KeyRound className="mr-1 h-3 w-3" /> Key missing</>}
        </Badge>
        {error && <span className="text-xs text-rose-300/80 truncate max-w-[300px]" title={error}>{error.slice(0, 60)}</span>}
      </div>
      <Button variant="ghost" size="sm" asChild>
        <a href={brand.docs} target="_blank" rel="noopener noreferrer">Docs <ExternalLink className="ml-1 h-3 w-3" /></a>
      </Button>
    </div>
  );
}

function ProviderModels({ models, providerId, route }: { models: CatalogModel[]; providerId: string; route: Route }) {
  const filtered = models.filter((m) => m.provider === providerId && m.route === route);
  if (filtered.length === 0) return <p className="text-xs text-muted-foreground italic">No models available — configure API key or try refreshing.</p>;
  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {filtered.map((m) => <ModelCard key={`${m.route}-${m.model_id}`} model={m} />)}
    </div>
  );
}

// ===== Agent bindings tab =====

function AgentBindings({ catalog, onRefresh }: { catalog: CatalogModel[]; onRefresh: () => void }) {
  const [assignments, setAssignments] = useState<AgentAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [testingKey, setTestingKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-agent-models', { body: { action: 'list' } });
      if (error) throw error;
      setAssignments(data.assignments ?? []);
    } catch (e: any) {
      toast.error('Failed to load agent assignments: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateAssignment = async (agent_key: string, route: Route, model_id: string) => {
    setSavingKey(agent_key);
    try {
      const { error } = await supabase.functions.invoke('manage-agent-models', { body: { action: 'update', agent_key, route, model_id } });
      if (error) throw error;
      toast.success(`Updated ${agent_key} → ${model_id}`);
      await load();
    } catch (e: any) {
      toast.error('Update failed: ' + e.message);
    } finally {
      setSavingKey(null);
    }
  };

  const testAgent = async (agent_key: string) => {
    setTestingKey(agent_key);
    try {
      const { data, error } = await supabase.functions.invoke('manage-agent-models', { body: { action: 'test', agent_key } });
      if (error) throw error;
      if (data.success) {
        toast.success(`✓ ${agent_key}: ${data.modelUsed} (${data.latencyMs}ms)`);
      } else {
        toast.error(`✗ ${agent_key}: ${data.error}`);
      }
    } catch (e: any) {
      toast.error('Test failed: ' + e.message);
    } finally {
      setTestingKey(null);
    }
  };

  const grouped = useMemo(() => {
    const out: Record<string, AgentAssignment[]> = {};
    for (const a of assignments) {
      if (!out[a.agent_category]) out[a.agent_category] = [];
      out[a.agent_category].push(a);
    }
    return out;
  }, [assignments]);

  if (loading) {
    return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <Alert className="border-primary/30 bg-card/40">
        <Workflow className="h-4 w-4" />
        <AlertTitle>Dynamic Agent Routing</AlertTitle>
        <AlertDescription className="text-sm text-muted-foreground">
          Each agent reads its model assignment from this table at runtime. Changes apply immediately to the next call — no redeploys needed.
          The fallback chain auto-engages on 404/410/5xx errors.
        </AlertDescription>
      </Alert>

      {Object.entries(grouped).map(([category, agents]) => (
        <Card key={category} className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">{category} ({agents.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[260px]">Agent</TableHead>
                    <TableHead className="w-[110px]">Route</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="w-[120px]">Last used</TableHead>
                    <TableHead className="w-[120px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.map((a) => {
                    const modelsForRoute = catalog.filter((m) => m.route === a.route);
                    const currentExists = modelsForRoute.some((m) => m.model_id === a.model_id);
                    const catalogEntry = catalog.find((m) => m.route === a.route && m.model_id === a.model_id);
                    const deprecated = isModelDeprecated(a.model_id, catalogEntry?.status);
                    const recommended = getRecommendedUpgrade(a.agent_key, a.agent_category);
                    const isOnRecommended = recommended && recommended.model_id === a.model_id && recommended.route === a.route;
                    const showUpgrade = recommended && !isOnRecommended && (deprecated || !currentExists || catalogEntry?.status === 'preview');
                    return (
                      <TableRow key={a.agent_key} className={deprecated ? 'bg-amber-500/5' : undefined}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-sm">{a.agent_label}</div>
                            {deprecated && (
                              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300 text-[10px]">
                                <AlertTriangle className="mr-1 h-2.5 w-2.5" /> deprecated
                              </Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono">{a.agent_key}</div>
                        </TableCell>
                        <TableCell>
                          <Select value={a.route} onValueChange={(v: Route) => updateAssignment(a.agent_key, v, catalog.find((m) => m.route === v)?.model_id ?? a.model_id)}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="gateway">gateway</SelectItem>
                              <SelectItem value="native">native</SelectItem>
                              <SelectItem value="openrouter">openrouter</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select value={a.model_id} onValueChange={(v) => updateAssignment(a.agent_key, a.route, v)} disabled={savingKey === a.agent_key}>
                            <SelectTrigger className={`h-8 text-xs ${deprecated ? 'border-amber-500/40' : ''}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px]">
                              {!currentExists && <SelectItem value={a.model_id} className="text-amber-400">{a.model_id} (not in catalog)</SelectItem>}
                              {modelsForRoute.map((m) => (
                                <SelectItem key={m.model_id} value={m.model_id}>
                                  <span className="font-mono text-xs">{m.model_id}</span>
                                  {m.status !== 'available' && <span className="ml-2 text-[10px] text-muted-foreground">[{m.status}]</span>}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {a.last_error && <p className="text-[10px] text-rose-300/80 mt-1 truncate max-w-[300px]" title={a.last_error}>⚠ {a.last_error.slice(0, 80)}</p>}
                          {showUpgrade && recommended && (
                            <TooltipProvider delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    disabled={savingKey === a.agent_key}
                                    onClick={() => updateAssignment(a.agent_key, recommended.route, recommended.model_id)}
                                    className="mt-1 inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/5 px-1.5 py-0.5 text-[10px] text-emerald-300 hover:bg-emerald-500/10 transition disabled:opacity-50"
                                  >
                                    <ArrowUpCircle className="h-3 w-3" />
                                    Upgrade to <span className="font-mono">{recommended.model_id}</span>
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[300px] text-xs">
                                  <div className="font-semibold mb-1">Recommended for this scope</div>
                                  <div className="text-muted-foreground">{recommended.reason}</div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {isOnRecommended && (
                            <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-400/80">
                              <CheckCircle2 className="h-2.5 w-2.5" /> on recommended model
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {a.last_used_at ? new Date(a.last_used_at).toLocaleString() : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" disabled={testingKey === a.agent_key} onClick={() => testAgent(a.agent_key)}>
                            {testingKey === a.agent_key ? <RefreshCw className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3 w-3" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ===== OpenRouter tab =====

function OpenRouterCatalog({ models }: { models: CatalogModel[] }) {
  const [search, setSearch] = useState('');
  const [family, setFamily] = useState<string>('all');

  const orModels = useMemo(() => models.filter((m) => m.route === 'openrouter'), [models]);

  const families = useMemo(() => {
    const f = new Set<string>();
    for (const m of orModels) {
      const prefix = m.model_id.split('/')[0];
      if (prefix) f.add(prefix);
    }
    return ['all', ...Array.from(f).sort()];
  }, [orModels]);

  const filtered = useMemo(() => {
    return orModels.filter((m) => {
      if (family !== 'all' && !m.model_id.startsWith(family + '/')) return false;
      if (search && !m.model_id.toLowerCase().includes(search.toLowerCase()) && !m.display_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [orModels, search, family]);

  if (orModels.length === 0) {
    return (
      <Alert className="border-amber-500/30 bg-amber-500/10">
        <KeyRound className="h-4 w-4 text-amber-400" />
        <AlertTitle className="text-amber-200">OpenRouter not configured</AlertTitle>
        <AlertDescription className="text-sm text-amber-100/80">
          Add <code className="font-mono">OPENROUTER_API_KEY</code> in the <strong>Integrations</strong> page → OpenRouter card.
          Once enabled, 300+ models from Anthropic, OpenAI, Meta, Mistral, DeepSeek, Qwen and more will appear here.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Alert className="border-pink-500/30 bg-pink-500/5">
        <Network className="h-4 w-4 text-pink-400" />
        <AlertTitle className="text-pink-200">OpenRouter unified gateway active</AlertTitle>
        <AlertDescription className="text-sm text-pink-100/80">
          {orModels.length} models available. Per-model pricing shown where published. Any agent in the <strong>Agent Bindings</strong> tab can be pointed at any model here.
        </AlertDescription>
      </Alert>
      <div className="flex gap-2 flex-wrap">
        <Input placeholder="Search models…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm h-9" />
        <Select value={family} onValueChange={setFamily}>
          <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {families.map((f) => <SelectItem key={f} value={f}>{f === 'all' ? 'All families' : f}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground self-center ml-2">{filtered.length} shown</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {filtered.slice(0, 60).map((m) => <ModelCard key={m.model_id} model={m} />)}
      </div>
      {filtered.length > 60 && <p className="text-xs text-center text-muted-foreground">Showing first 60 of {filtered.length} — refine search to see more.</p>}
    </div>
  );
}

// ===== Page =====

export default function ModelHub() {
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = async (force = false) => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('check-model-availability', { body: { force } });
      if (error) throw error;
      setData(res as AvailabilityResponse);
      if (force) toast.success('Live probe complete — catalog refreshed');
    } catch (e: any) {
      toast.error('Failed to load: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(false); }, []);

  const stats = useMemo(() => {
    const models = data?.models ?? [];
    return {
      total: models.length,
      preview: models.filter((m) => m.status === 'preview').length,
      deprecated: models.filter((m) => m.status === 'deprecated').length,
      providers: new Set(models.map((m) => m.provider)).size,
    };
  }, [data]);

  const providersByRoute = (route: Route) => (data?.providers ?? []).filter((p) => p.route === route);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_10%_0%,hsl(var(--primary)/0.14),transparent_30rem),radial-gradient(circle_at_92%_8%,hsl(var(--info)/0.08),transparent_24rem)] p-3 text-foreground sm:p-5 lg:p-6">
      <DashboardThemeFrame variant="page" className="space-y-6 pb-8">
        <DashboardThemeFrame
          as="header"
          variant="hero"
          className="border-primary/20 bg-[linear-gradient(135deg,hsl(var(--card)/0.94),hsl(var(--background)/0.86)_50%,hsl(var(--primary)/0.10))] shadow-2xl shadow-black/10 dark:shadow-black/35"
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary shadow-sm shadow-primary/10">
                <Network className="h-3.5 w-3.5" />
                LLM operations control centre
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">Model Hub</h1>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Live LLM availability across Gateway, Native, and OpenRouter routes — with dynamic agent binding.
                </p>
              </div>
            </div>
            <div className="flex w-full flex-col gap-3 rounded-2xl border border-border/60 bg-background/55 p-3 shadow-sm backdrop-blur sm:w-auto sm:min-w-[320px] dark:border-white/10 dark:bg-slate-950/40">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => fetchAll(false)}
                  disabled={loading}
                  className="justify-center border-border/70 bg-card/80 shadow-sm transition-all hover:border-primary/35 hover:bg-primary/5 focus-visible:ring-ring"
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Reload
                </Button>
                <Button
                  onClick={() => fetchAll(true)}
                  disabled={loading}
                  className="justify-center bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 focus-visible:ring-ring"
                >
                  <Network className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Live re-probe
                </Button>
              </div>
              <p className="text-center text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground sm:text-right">
                {data?.checkedAt ? `${data.cached ? 'Cached' : 'Live'} probe • ${new Date(data.checkedAt).toLocaleString()}` : 'Awaiting latest probe metadata'}
              </p>
            </div>
          </div>
        </DashboardThemeFrame>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Model availability summary">
          <MetricTile label="Live models" value={stats.total} icon={Sparkles} tone="primary" helper="Available catalogue entries across active routes." />
          <MetricTile label="Preview" value={stats.preview} icon={Zap} tone="info" helper="Models marked preview by the current catalogue." />
          <MetricTile label="Deprecated" value={stats.deprecated} icon={AlertTriangle} tone="warning" helper="Models flagged for migration or replacement." />
          <MetricTile label="Providers" value={stats.providers} icon={ShieldCheck} tone="success" helper="Distinct providers represented in live data." />
        </section>

        <Tabs defaultValue="bindings" className="space-y-6">
          <DashboardThemeFrame variant="toolbar" className="overflow-x-auto p-1.5">
            <TabsList className="grid h-auto min-w-[620px] flex-1 grid-cols-4 gap-1 rounded-xl bg-muted/40 p-1 sm:min-w-0">
              <TabsTrigger value="bindings" className="gap-2 rounded-lg px-3 py-2 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:shadow-primary/20 sm:text-sm"><Workflow className="h-4 w-4" /> Agent Bindings</TabsTrigger>
              <TabsTrigger value="gateway" className="gap-2 rounded-lg px-3 py-2 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:shadow-primary/20 sm:text-sm"><Globe className="h-4 w-4" /> Gateway</TabsTrigger>
              <TabsTrigger value="native" className="gap-2 rounded-lg px-3 py-2 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:shadow-primary/20 sm:text-sm"><KeyRound className="h-4 w-4" /> Native</TabsTrigger>
              <TabsTrigger value="openrouter" className="gap-2 rounded-lg px-3 py-2 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:shadow-primary/20 sm:text-sm"><Network className="h-4 w-4" /> OpenRouter {data?.openrouterKey && <Badge variant="outline" className="ml-1 h-4 px-1 text-[9px] border-pink-500/30 text-pink-300">on</Badge>}</TabsTrigger>
            </TabsList>
          </DashboardThemeFrame>

        <TabsContent value="bindings">
          {loading ? <Skeleton className="h-96 w-full" /> : <AgentBindings catalog={data?.models ?? []} onRefresh={() => fetchAll(false)} />}
        </TabsContent>

        <TabsContent value="gateway" className="space-y-6">
          <Alert className="border-emerald-500/30 bg-emerald-500/5">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <AlertTitle className="text-emerald-200">Lovable Gateway</AlertTitle>
            <AlertDescription className="text-sm text-emerald-100/80">
              Billed via workspace credits. No per-provider keys required.
            </AlertDescription>
          </Alert>
          {loading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
          ) : (
            <div className="space-y-6">
              {providersByRoute('gateway').map((p) => (
                <div key={`${p.provider}-${p.route}`} className="space-y-3">
                  <ProviderHeader providerId={p.provider} route={p.route} ok={p.ok} keyConfigured={p.keyConfigured} modelCount={p.modelCount} error={p.error} />
                  <ProviderModels models={data?.models ?? []} providerId={p.provider} route="gateway" />
                  <Separator />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="native" className="space-y-6">
          <Alert className="border-primary/30 bg-card/40">
            <KeyRound className="h-4 w-4" />
            <AlertTitle>Direct provider keys</AlertTitle>
            <AlertDescription className="text-sm text-muted-foreground">
              Configure keys in the <strong>Integrations</strong> page. Missing keys grey out the section.
            </AlertDescription>
          </Alert>
          {loading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
          ) : (
            <div className="space-y-6">
              {(['openai', 'anthropic', 'gemini', 'perplexity'] as const).map((prov) => {
                const p = providersByRoute('native').find((x) => x.provider === prov) ?? { provider: prov, route: 'native' as Route, ok: false, keyConfigured: false, modelCount: 0, probedAt: '' };
                return (
                  <div key={prov} className="space-y-3">
                    <ProviderHeader providerId={prov} route="native" ok={p.ok} keyConfigured={p.keyConfigured} modelCount={p.modelCount} error={p.error} />
                    <ProviderModels models={data?.models ?? []} providerId={prov} route="native" />
                    <Separator />
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="openrouter">
          {loading ? <Skeleton className="h-96 w-full" /> : <OpenRouterCatalog models={data?.models ?? []} />}
        </TabsContent>
      </Tabs>

      {data?.checkedAt && (
        <p className="text-center text-xs text-muted-foreground">
          {data.cached ? 'Cached' : 'Live'} • Last probe: {new Date(data.checkedAt).toLocaleString()}
        </p>
      )}
      </DashboardThemeFrame>
    </main>
  );
}
