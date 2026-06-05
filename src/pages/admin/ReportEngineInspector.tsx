/**
 * Report Engine Inspector
 *
 * Superadmin-only window into the report generation engine.
 * Surfaces every run, the exact system prompt sent, the data packet
 * captured, the embeddings retrieved per section, and every chunk's
 * inputs/outputs. Includes the dedicated agentic editor in the right rail.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, RefreshCw, Send, CheckCircle2, XCircle, Wrench } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Run {
  id: string;
  report_id: string | null;
  scope: string | null;
  variant: string | null;
  model: string | null;
  status: string;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_cost_cents: number;
  started_at: string;
  finished_at: string | null;
  trigger_source: string | null;
  error: string | null;
  data_packet_size_bytes: number | null;
}

interface Chunk {
  id: string;
  section_key: string;
  section_label: string | null;
  ordinal: number;
  model: string | null;
  system_prompt: string | null;
  user_prompt: string | null;
  attached_template_chunk_ids: any;
  attached_packet_keys: string[];
  retrieval_meta: any;
  response: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number | null;
  status: string;
  error: string | null;
}

interface FullRun extends Run {
  template_ids: any;
  system_prompt: string | null;
  data_packet: any;
  data_packet_hash: string | null;
  registry_snapshot: any;
}

function fmtBytes(n: number | null | undefined) {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtMs(n: number | null | undefined) {
  if (n == null) return '—';
  if (n < 1000) return `${n}ms`;
  return `${(n / 1000).toFixed(1)}s`;
}

export default function ReportEngineInspector() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [run, setRun] = useState<FullRun | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadRuns = async () => {
    setLoadingRuns(true);
    const { data, error } = await invokeSecureFunction<{ runs: Run[] }>(
      'report-engine-inspector', { op: 'list_runs', limit: 50 },
    );
    setLoadingRuns(false);
    if (error) { toast({ title: 'Failed to load runs', description: error.message, variant: 'destructive' }); return; }
    setRuns(data?.runs ?? []);
    if (!selectedId && data?.runs?.length) setSelectedId(data.runs[0].id);
  };

  const loadRun = async (id: string) => {
    setLoadingDetail(true);
    const { data, error } = await invokeSecureFunction<{ run: FullRun; chunks: Chunk[] }>(
      'report-engine-inspector', { op: 'get_run', run_id: id },
    );
    setLoadingDetail(false);
    if (error) { toast({ title: 'Failed to load run', description: error.message, variant: 'destructive' }); return; }
    setRun(data?.run ?? null);
    setChunks(data?.chunks ?? []);
  };

  useEffect(() => { loadRuns(); }, []);
  useEffect(() => { if (selectedId) loadRun(selectedId); }, [selectedId]);

  // Realtime: refresh detail when chunks stream in
  useEffect(() => {
    if (!selectedId) return;
    const ch = supabase
      .channel(`run-${selectedId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'report_generation_chunks', filter: `run_id=eq.${selectedId}` },
        () => loadRun(selectedId))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'report_generation_runs', filter: `id=eq.${selectedId}` },
        () => loadRun(selectedId))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selectedId]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Report Engine Inspector</h1>
          <p className="text-sm text-muted-foreground">
            Every generation run, the exact prompt + data packet, embeddings retrieved per section, and an agent to edit the engine.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadRuns} disabled={loadingRuns}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loadingRuns ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <Tabs defaultValue="runs">
        <TabsList>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="config">Engine Config</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="runs">
          <div className="grid grid-cols-12 gap-4">
            <Card className="col-span-3 p-2">
              <ScrollArea className="h-[78vh]">
                {loadingRuns && <div className="p-4 text-sm text-muted-foreground">Loading runs…</div>}
                {!loadingRuns && runs.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground">
                    No runs yet. Generate a report once instrumentation is wired into the engine.
                  </div>
                )}
                <div className="space-y-1">
                  {runs.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors
                        ${selectedId === r.id ? 'bg-primary/10 border border-primary/40' : 'hover:bg-muted/50 border border-transparent'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">{r.scope || 'run'} · {r.variant || '—'}</span>
                        <Badge variant={
                          r.status === 'completed' ? 'default' :
                          r.status === 'failed' ? 'destructive' :
                          r.status === 'running' ? 'secondary' : 'outline'
                        } className="h-4 px-1.5 text-[10px]">{r.status}</Badge>
                      </div>
                      <div className="text-muted-foreground mt-0.5 truncate">
                        {new Date(r.started_at).toLocaleString()}
                      </div>
                      <div className="text-muted-foreground/80 mt-0.5">
                        {r.model || '—'} · {(r.total_prompt_tokens + r.total_completion_tokens) || 0} tok
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </Card>

            <Card className="col-span-6 p-4">
              {loadingDetail && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
              {!loadingDetail && !run && <div className="text-sm text-muted-foreground">Select a run.</div>}
              {!loadingDetail && run && <RunDetail run={run} chunks={chunks} />}
            </Card>

            <Card className="col-span-3 p-0 overflow-hidden">
              <EngineAgentPanel currentRunId={selectedId} onProposalApplied={() => loadRuns()} />
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="config">
          <EngineConfigEditor />
        </TabsContent>

        <TabsContent value="audit">
          <AuditLog />
        </TabsContent>
      </Tabs>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Run detail
// ---------------------------------------------------------------------------

function RunDetail({ run, chunks }: { run: FullRun; chunks: Chunk[] }) {
  const packetKeys = useMemo(() => {
    if (!run.data_packet || typeof run.data_packet !== 'object') return [];
    return Object.keys(run.data_packet);
  }, [run.data_packet]);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-lg font-semibold">{run.scope || 'run'} · {run.variant || '—'}</h2>
          <Badge variant={run.status === 'completed' ? 'default' : run.status === 'failed' ? 'destructive' : 'secondary'}>{run.status}</Badge>
          {run.trigger_source && <Badge variant="outline" className="text-[10px]">{run.trigger_source}</Badge>}
        </div>
        <div className="text-xs text-muted-foreground grid grid-cols-4 gap-x-4 gap-y-1">
          <div><span className="text-foreground/80">Model:</span> {run.model || '—'}</div>
          <div><span className="text-foreground/80">Tokens:</span> {run.total_prompt_tokens + run.total_completion_tokens}</div>
          <div><span className="text-foreground/80">Packet:</span> {fmtBytes(run.data_packet_size_bytes)}</div>
          <div><span className="text-foreground/80">Hash:</span> <span className="font-mono">{run.data_packet_hash?.slice(0, 10) || '—'}</span></div>
          <div><span className="text-foreground/80">Report:</span> <span className="font-mono">{run.report_id?.slice(0, 8) || '—'}</span></div>
          <div><span className="text-foreground/80">Templates:</span> {Array.isArray(run.template_ids) ? run.template_ids.length : 0}</div>
          <div><span className="text-foreground/80">Chunks:</span> {chunks.length}</div>
          <div><span className="text-foreground/80">Duration:</span> {run.finished_at ? fmtMs(new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) : 'running'}</div>
        </div>
        {run.error && (
          <div className="mt-2 text-xs text-destructive bg-destructive/10 rounded p-2">{run.error}</div>
        )}
      </div>

      <Tabs defaultValue="prompt">
        <TabsList>
          <TabsTrigger value="prompt">System Prompt</TabsTrigger>
          <TabsTrigger value="packet">Data Packet</TabsTrigger>
          <TabsTrigger value="matrix">Packet Matrix</TabsTrigger>
          <TabsTrigger value="embeddings">Embeddings</TabsTrigger>
          <TabsTrigger value="chunks">Chunks ({chunks.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="prompt">
          <ScrollArea className="h-[58vh] rounded border bg-muted/30 p-3">
            <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">{run.system_prompt || '— no system prompt captured —'}</pre>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="packet">
          <ScrollArea className="h-[58vh] rounded border bg-muted/30 p-3">
            <pre className="text-[11px] whitespace-pre-wrap font-mono">{JSON.stringify(run.data_packet ?? {}, null, 2)}</pre>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="matrix">
          {/* Matrix: rows = chunks, columns = packet keys. Green = key attached. */}
          <ScrollArea className="h-[58vh] rounded border">
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-background">
                <tr>
                  <th className="text-left p-2 font-medium">Section</th>
                  {packetKeys.map((k) => (
                    <th key={k} className="p-1 text-left font-mono text-muted-foreground" title={k}>
                      <div className="rotate-[-45deg] origin-bottom-left translate-y-2 whitespace-nowrap">{k}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chunks.map((c) => (
                  <tr key={c.id} className="border-t border-border/40">
                    <td className="p-2 font-mono whitespace-nowrap">{c.section_key}</td>
                    {packetKeys.map((k) => (
                      <td key={k} className="p-1 text-center">
                        {c.attached_packet_keys?.includes(k)
                          ? <span className="inline-block w-2.5 h-2.5 rounded-sm bg-success" />
                          : <span className="inline-block w-2.5 h-2.5 rounded-sm bg-muted" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {chunks.length === 0 && <div className="p-4 text-xs text-muted-foreground">No chunks recorded yet.</div>}
          </ScrollArea>
          <p className="text-[11px] text-muted-foreground mt-2">
            Green = packet key was inlined into that chunk's prompt. Empty rows reveal where the engine ships the entire packet vs slices it.
          </p>
        </TabsContent>

        <TabsContent value="embeddings">
          <ScrollArea className="h-[58vh] space-y-2">
            {chunks.map((c) => (
              <div key={c.id} className="border rounded p-2 mb-2">
                <div className="text-xs font-medium mb-1">{c.section_key}</div>
                {c.retrieval_meta ? (
                  <div className="text-[11px] space-y-1">
                    <div className="text-muted-foreground">
                      query: <span className="font-mono">{String(c.retrieval_meta.query || '').slice(0, 120)}</span>
                    </div>
                    <div className="text-muted-foreground">
                      threshold: {c.retrieval_meta.threshold ?? '—'} · k: {c.retrieval_meta.k ?? '—'} · hits: {c.retrieval_meta.hits?.length ?? 0}
                    </div>
                    {Array.isArray(c.retrieval_meta.hits) && c.retrieval_meta.hits.slice(0, 5).map((h: any, i: number) => (
                      <div key={i} className="font-mono text-[10px] truncate text-foreground/70">
                        {(h.similarity ?? 0).toFixed(3)} · {h.preview || h.chunk_id || ''}
                      </div>
                    ))}
                  </div>
                ) : <div className="text-[11px] text-muted-foreground">no retrieval captured</div>}
              </div>
            ))}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="chunks">
          <ScrollArea className="h-[58vh] space-y-2">
            {chunks.map((c) => <ChunkCard key={c.id} chunk={c} />)}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChunkCard({ chunk }: { chunk: Chunk }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded mb-2">
      <button className="w-full text-left p-2 flex items-center justify-between gap-2" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center gap-2 min-w-0">
          {chunk.status === 'completed' ? <CheckCircle2 className="h-3 w-3 text-success shrink-0" /> :
           chunk.status === 'failed' ? <XCircle className="h-3 w-3 text-destructive shrink-0" /> :
           <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
          <span className="text-xs font-medium truncate">{chunk.section_key}</span>
          {chunk.section_label && <span className="text-[10px] text-muted-foreground truncate">{chunk.section_label}</span>}
        </div>
        <div className="text-[10px] text-muted-foreground shrink-0">
          {chunk.prompt_tokens + chunk.completion_tokens} tok · {fmtMs(chunk.latency_ms)}
        </div>
      </button>
      {open && (
        <div className="p-2 border-t bg-muted/20 space-y-2">
          <div>
            <div className="text-[10px] font-medium text-muted-foreground mb-1">Attached packet keys ({chunk.attached_packet_keys?.length ?? 0})</div>
            <div className="flex flex-wrap gap-1">
              {(chunk.attached_packet_keys ?? []).map((k) => (
                <span key={k} className="text-[9px] font-mono px-1.5 py-0.5 bg-primary/10 rounded">{k}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-medium text-muted-foreground mb-1">User prompt</div>
            <pre className="text-[10px] font-mono whitespace-pre-wrap max-h-40 overflow-auto bg-background rounded p-2">{chunk.user_prompt || '—'}</pre>
          </div>
          <div>
            <div className="text-[10px] font-medium text-muted-foreground mb-1">Response</div>
            <pre className="text-[10px] font-mono whitespace-pre-wrap max-h-40 overflow-auto bg-background rounded p-2">{chunk.response || '—'}</pre>
          </div>
          {chunk.error && <div className="text-[10px] text-destructive bg-destructive/10 rounded p-2">{chunk.error}</div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Engine agent panel
// ---------------------------------------------------------------------------

interface ChatMsg { role: 'user' | 'assistant' | 'tool' | 'system'; content: string; _invocations?: any[]; }

function EngineAgentPanel({ currentRunId, onProposalApplied }: { currentRunId: string | null; onProposalApplied: () => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [proposals, setProposals] = useState<any[]>([]);

  const loadProposals = async () => {
    const { data } = await invokeSecureFunction<{ proposals: any[] }>(
      'report-engine-inspector', { op: 'list_proposals', status: 'pending' });
    setProposals(data?.proposals ?? []);
  };
  useEffect(() => { loadProposals(); }, []);

  const send = async () => {
    if (!input.trim() || sending) return;
    const userMsg: ChatMsg = { role: 'user', content: input.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setSending(true);

    // Inject context about the currently-selected run
    const contextPrefix = currentRunId
      ? `(Context: user is viewing run ${currentRunId}. Use get_run if relevant.)\n`
      : '';
    const apiMessages = next.map((m, i) => ({
      role: m.role,
      content: i === 0 && contextPrefix ? `${contextPrefix}${m.content}` : m.content,
    }));

    const { data, error } = await invokeSecureFunction<{ assistant: string; tool_invocations: any[] }>(
      'report-engine-agent', { messages: apiMessages }, { timeoutMs: 120000 });

    setSending(false);
    if (error) {
      setMessages([...next, { role: 'assistant', content: `⚠️ ${error.message}` }]);
      return;
    }
    setMessages([...next, {
      role: 'assistant',
      content: data?.assistant || '(no reply)',
      _invocations: data?.tool_invocations ?? [],
    }]);
    loadProposals();
  };

  const apply = async (id: string) => {
    const { data, error } = await invokeSecureFunction<any>(
      'report-engine-inspector', { op: 'apply_proposal', proposal_id: id });
    if (error || !data?.ok) {
      toast({ title: 'Apply failed', description: error?.message || data?.error || 'unknown', variant: 'destructive' });
      return;
    }
    toast({ title: 'Proposal applied' });
    loadProposals();
    onProposalApplied();
  };
  const reject = async (id: string) => {
    await invokeSecureFunction('report-engine-inspector', { op: 'reject_proposal', proposal_id: id });
    loadProposals();
  };

  return (
    <div className="flex flex-col h-[78vh]">
      <div className="p-3 border-b">
        <div className="text-sm font-medium">Engine Agent</div>
        <div className="text-[11px] text-muted-foreground">Scoped to templates, registry, retrieval knobs. Proposals only.</div>
      </div>

      {proposals.length > 0 && (
        <div className="border-b bg-primary/5 p-2 space-y-2 max-h-40 overflow-auto">
          <div className="text-[11px] font-medium">Pending proposals ({proposals.length})</div>
          {proposals.map((p) => (
            <div key={p.id} className="border rounded p-2 bg-background">
              <div className="text-[11px] font-medium">{p.target_kind} {p.target_id ? `· ${String(p.target_id).slice(0, 8)}` : ''}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{p.rationale}</div>
              <div className="flex gap-1 mt-2">
                <Button size="sm" className="h-6 px-2 text-[10px]" onClick={() => apply(p.id)}>Apply</Button>
                <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => reject(p.id)}>Reject</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ScrollArea className="flex-1 p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-xs text-muted-foreground space-y-2">
            <p>Ask me about the engine. Examples:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>"Show me the system prompt used in the most recent compass run"</li>
              <li>"Lower the retrieval threshold to 0.65 for ai_structure templates"</li>
              <li>"Which sections have the largest data packet?"</li>
            </ul>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`mb-3 ${m.role === 'user' ? 'text-right' : ''}`}>
            <div className={`inline-block max-w-full text-xs rounded px-2 py-1.5 whitespace-pre-wrap
              ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              {m.content}
            </div>
            {m._invocations && m._invocations.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {m._invocations.map((inv: any) => (
                  <span key={inv.id} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-background">
                    <Wrench className="h-2.5 w-2.5" />{inv.name}
                    <span className="text-muted-foreground">{fmtMs(inv.duration_ms)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {sending && <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> thinking…</div>}
      </ScrollArea>

      <div className="p-2 border-t flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask the engine agent…"
          disabled={sending}
        />
        <Button size="sm" onClick={send} disabled={sending || !input.trim()}>
          <Send className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
