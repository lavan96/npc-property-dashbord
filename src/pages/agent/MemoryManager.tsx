import { useEffect, useMemo, useState } from 'react';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Brain, Trash2, Pencil, Sparkles, TrendingUp, ThumbsUp, ThumbsDown, Search, Wand2 } from 'lucide-react';

interface Memory {
  id: string; content: string; tags: string[] | null; importance: number;
  kind: string; feedback_score: number | null; use_count: number | null;
  last_used_at: string | null; created_at: string;
}
interface Analytics {
  total: number; quota: number;
  positive_feedback: number; negative_feedback: number; total_feedback_events: number;
  used_in_recall: number; recall_rate: number;
  kind_breakdown: Record<string, number>;
  top_tags: [string, number][]; top_memories: Memory[];
}

export default function AgentMemoryManager() {
  const [mems, setMems] = useState<Memory[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Memory | null>(null);
  const [editForm, setEditForm] = useState({ content: '', tags: '', importance: 3 });

  const load = async () => {
    setLoading(true);
    const [{ data: memRes }, { data: anRes }] = await Promise.all([
      invokeSecureFunction('ai-dashboard-agent', { action: 'list-memories', limit: 500 }),
      invokeSecureFunction('ai-dashboard-agent', { action: 'memory-analytics' }),
    ]);
    setMems(memRes?.memories || []);
    setAnalytics(anRes || null);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mems;
    return mems.filter(m =>
      m.content.toLowerCase().includes(q) ||
      (m.tags || []).some(t => t.toLowerCase().includes(q)) ||
      m.kind.toLowerCase().includes(q)
    );
  }, [mems, search]);

  const openEdit = (m: Memory) => {
    setEditing(m);
    setEditForm({ content: m.content, tags: (m.tags || []).join(', '), importance: m.importance });
  };
  const saveEdit = async () => {
    if (!editing) return;
    const { data } = await invokeSecureFunction('ai-dashboard-agent', {
      action: 'update-memory', memory_id: editing.id,
      content: editForm.content,
      tags: editForm.tags.split(',').map(s => s.trim()).filter(Boolean),
      importance: Number(editForm.importance),
    });
    if (data?.success) { toast.success('Memory updated'); setEditing(null); load(); }
    else toast.error(data?.error || 'Failed');
  };
  const del = async (id: string) => {
    if (!confirm('Delete this memory permanently?')) return;
    const { data } = await invokeSecureFunction('ai-dashboard-agent', { action: 'delete-memory', memory_id: id });
    if (data?.success) { toast.success('Deleted'); load(); }
  };
  const prune = async () => {
    if (!confirm(`Prune down to top ${analytics?.quota || 500} memories?`)) return;
    const { data } = await invokeSecureFunction('ai-dashboard-agent', { action: 'prune-memories' });
    if (data?.success) { toast.success(`Pruned ${data.deleted} memories`); load(); }
  };

  const quotaPct = analytics ? Math.min(100, Math.round((analytics.total / analytics.quota) * 100)) : 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Brain className="w-7 h-7 text-primary" /> Agent Memory Manager</h1>
          <p className="text-muted-foreground mt-1">Browse, edit, and prune what the Aurixa Agent remembers about you.</p>
        </div>
        <Button variant="outline" onClick={prune}><Wand2 className="w-4 h-4 mr-2" /> Auto-prune</Button>
      </div>

      {/* Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total memories</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{analytics?.total ?? '—'}</div><div className="text-xs text-muted-foreground mt-1">Quota {analytics?.quota ?? 500}</div><Progress value={quotaPct} className="mt-2 h-1.5" /></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Recall rate</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-success">{analytics?.recall_rate ?? 0}%</div><div className="text-xs text-muted-foreground mt-1">{analytics?.used_in_recall ?? 0} used at least once</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><ThumbsUp className="w-3.5 h-3.5" /> Positive</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-success">{analytics?.positive_feedback ?? 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><ThumbsDown className="w-3.5 h-3.5" /> Negative</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-destructive">{analytics?.negative_feedback ?? 0}</div><div className="text-xs text-muted-foreground mt-1">{analytics?.total_feedback_events ?? 0} total ratings</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top tags */}
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Top tags</CardTitle></CardHeader>
          <CardContent><div className="flex flex-wrap gap-1.5">
            {(analytics?.top_tags || []).map(([t, c]) => (
              <Badge key={t} variant="secondary" className="text-xs">{t} <span className="ml-1 opacity-60">×{c}</span></Badge>
            ))}
            {!analytics?.top_tags?.length && <span className="text-xs text-muted-foreground">No tags yet.</span>}
          </div></CardContent>
        </Card>

        {/* Top recalled */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="w-4 h-4" /> Most-recalled memories</CardTitle></CardHeader>
          <CardContent><div className="space-y-2">
            {(analytics?.top_memories || []).slice(0, 5).map(m => (
              <div key={m.id} className="flex items-start justify-between gap-3 text-sm border-b border-border/40 pb-2 last:border-0">
                <div className="flex-1 line-clamp-2">{m.content}</div>
                <Badge variant="outline" className="shrink-0">×{m.use_count || 0}</Badge>
              </div>
            ))}
            {!analytics?.top_memories?.length && <span className="text-xs text-muted-foreground">No recalls yet.</span>}
          </div></CardContent>
        </Card>
      </div>

      {/* Search + list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">All memories ({filtered.length})</CardTitle>
          <div className="relative w-72">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search content, tags, kind…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[60vh] pr-3">
            <div className="space-y-2">
              {loading && <div className="text-sm text-muted-foreground p-4">Loading…</div>}
              {!loading && !filtered.length && <div className="text-sm text-muted-foreground p-4">No memories match.</div>}
              {filtered.map(m => (
                <div key={m.id} className="rounded-lg border border-border/60 p-3 hover:border-primary/60 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-relaxed">{m.content}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{m.kind}</Badge>
                        <Badge variant="outline" className="text-[10px]">importance {m.importance}</Badge>
                        {(m.use_count || 0) > 0 && <Badge variant="secondary" className="text-[10px]">recalled ×{m.use_count}</Badge>}
                        {(m.feedback_score || 0) > 0 && <Badge className="text-[10px] bg-success/20 text-success"><ThumbsUp className="w-2.5 h-2.5 mr-1" />+{m.feedback_score}</Badge>}
                        {(m.feedback_score || 0) < 0 && <Badge className="text-[10px] bg-destructive/20 text-destructive"><ThumbsDown className="w-2.5 h-2.5 mr-1" />{m.feedback_score}</Badge>}
                        {(m.tags || []).map(t => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                        <span className="text-[10px] text-muted-foreground ml-auto">{new Date(m.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(m)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => del(m.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit memory</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs text-muted-foreground">Content</label>
              <Textarea rows={4} value={editForm.content} onChange={e => setEditForm({ ...editForm, content: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">Tags (comma-separated)</label>
              <Input value={editForm.tags} onChange={e => setEditForm({ ...editForm, tags: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">Importance (1–5)</label>
              <Input type="number" min={1} max={5} value={editForm.importance} onChange={e => setEditForm({ ...editForm, importance: Number(e.target.value) })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
