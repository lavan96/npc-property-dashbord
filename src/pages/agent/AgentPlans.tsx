import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Plus, PlayCircle, Pause, RotateCcw, X, CheckCircle2, SkipForward, Trash2, CalendarClock, History } from 'lucide-react';
import { toast } from 'sonner';

interface Plan { id: string; title: string; goal: string; status: string; skill_slug?: string | null; requires_approval: boolean; total_steps: number; completed_steps: number; created_at: string; planner_model?: string | null; schedule_cron?: string | null; next_run_at?: string | null; last_run_at?: string | null; auto_execute?: boolean; }
interface Step { id: string; plan_id: string; seq: number; title: string; description?: string | null; expected_output?: string | null; tool_hint?: string | null; status: string; result?: any; error?: string | null; }
interface PlanRun { id: string; plan_id: string; status: string; triggered_by: string; steps_executed: number; steps_failed: number; error?: string | null; started_at: string; finished_at?: string | null; }

const CRON_PRESETS: Array<{ label: string; expr: string }> = [
  { label: 'Every hour', expr: '0 * * * *' },
  { label: 'Every day 09:00 UTC', expr: '0 9 * * *' },
  { label: 'Weekdays 09:00 UTC', expr: '0 9 * * 1-5' },
  { label: 'Weekly Monday 09:00 UTC', expr: '0 9 * * 1' },
];

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  awaiting_approval: 'bg-warning/20 text-warning',
  approved: 'bg-primary/20 text-primary',
  running: 'bg-primary/30 text-primary animate-pulse',
  paused: 'bg-muted text-muted-foreground',
  completed: 'bg-success/20 text-success',
  cancelled: 'bg-muted text-muted-foreground line-through',
  failed: 'bg-destructive/20 text-destructive',
  pending: 'bg-muted text-muted-foreground',
  skipped: 'bg-muted text-muted-foreground line-through',
  done: 'bg-success/20 text-success',
};

async function invoke(action: string, payload: Record<string, any> = {}) {
  const { data, error } = await supabase.functions.invoke('agent-planner', { body: { action, ...payload } });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

export default function AgentPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(false);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);

  const refreshPlans = useCallback(async () => {
    setLoading(true);
    try {
      const { plans } = await invoke('list-plans');
      setPlans(plans);
      if (!selected && plans[0]) setSelected(plans[0].id);
    } catch (err) { toast.error(String((err as Error).message)); }
    finally { setLoading(false); }
  }, [selected]);

  const loadPlan = useCallback(async (planId: string) => {
    setStepsLoading(true);
    try {
      const { plan, steps } = await invoke('get-plan', { plan_id: planId });
      setSteps(steps);
      setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, ...plan } : p)));
    } catch (err) { toast.error(String((err as Error).message)); }
    finally { setStepsLoading(false); }
  }, []);

  useEffect(() => { refreshPlans(); }, [refreshPlans]);
  useEffect(() => { if (selected) loadPlan(selected); }, [selected, loadPlan]);

  // Poll while running
  useEffect(() => {
    if (!selected) return;
    const plan = plans.find((p) => p.id === selected);
    if (plan?.status !== 'running') return;
    const t = setInterval(() => loadPlan(selected), 3000);
    return () => clearInterval(t);
  }, [selected, plans, loadPlan]);

  const activePlan = useMemo(() => plans.find((p) => p.id === selected), [plans, selected]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Agent Plans</h1>
          <p className="text-sm text-muted-foreground">Long-horizon plans with human approvals — Phase 6.</p>
        </div>
        <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Draft plan</Button>
          </DialogTrigger>
          <DraftPlanDialog onCreated={(id) => { setDraftOpen(false); setSelected(id); refreshPlans(); }} />
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle className="text-sm">Your plans</CardTitle>{loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}</CardHeader>
          <CardContent className="space-y-2 max-h-[70vh] overflow-y-auto pr-2">
            {plans.length === 0 && !loading && <p className="text-sm text-muted-foreground">No plans yet.</p>}
            {plans.map((p) => (
              <button key={p.id} onClick={() => setSelected(p.id)} className={`w-full text-left rounded-md border px-3 py-2 hover:bg-accent ${selected === p.id ? 'border-primary bg-accent/50' : 'border-border'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium line-clamp-1">{p.title}</div>
                  <Badge className={`text-[10px] ${STATUS_COLOR[p.status] ?? ''}`}>{p.status.replace(/_/g, ' ')}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{p.completed_steps}/{p.total_steps} steps · {new Date(p.created_at).toLocaleDateString()}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {!activePlan ? (
            <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">Select or draft a plan.</CardContent></Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>{activePlan.title}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">{activePlan.goal}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge className={STATUS_COLOR[activePlan.status] ?? ''}>{activePlan.status.replace(/_/g, ' ')}</Badge>
                        {activePlan.skill_slug && <Badge variant="outline" className="text-xs">skill: {activePlan.skill_slug}</Badge>}
                        {activePlan.requires_approval && <Badge variant="outline" className="text-xs">approval required</Badge>}
                        {activePlan.planner_model && <Badge variant="outline" className="text-xs">{activePlan.planner_model}</Badge>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {activePlan.status === 'awaiting_approval' && (
                        <Button size="sm" variant="secondary" onClick={async () => { await invoke('approve-all', { plan_id: activePlan.id }); loadPlan(activePlan.id); refreshPlans(); }}>
                          <CheckCircle2 className="h-4 w-4 mr-1" />Approve all
                        </Button>
                      )}
                      {['approved', 'running', 'awaiting_approval'].includes(activePlan.status) && (
                        <Button size="sm" disabled={executing} onClick={async () => {
                          setExecuting(true);
                          try {
                            const r = await invoke('execute-next-step', { plan_id: activePlan.id });
                            if (r?.done) toast.success('Plan complete');
                            else if (r?.error) toast.error(r.error);
                            else toast.success('Step executed');
                            await loadPlan(activePlan.id); await refreshPlans();
                          } catch (err) { toast.error(String((err as Error).message)); }
                          finally { setExecuting(false); }
                        }}><PlayCircle className="h-4 w-4 mr-1" />{executing ? 'Running…' : 'Run next step'}</Button>
                      )}
                      {activePlan.status === 'running' && <Button size="sm" variant="outline" onClick={async () => { await invoke('pause-plan', { plan_id: activePlan.id }); refreshPlans(); }}><Pause className="h-4 w-4" /></Button>}
                      {activePlan.status === 'paused' && <Button size="sm" variant="outline" onClick={async () => { await invoke('resume-plan', { plan_id: activePlan.id }); refreshPlans(); }}><RotateCcw className="h-4 w-4" /></Button>}
                      {!['completed', 'cancelled'].includes(activePlan.status) && (
                        <Button size="sm" variant="ghost" onClick={async () => { if (!confirm('Cancel plan?')) return; await invoke('cancel-plan', { plan_id: activePlan.id }); refreshPlans(); }}><X className="h-4 w-4" /></Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={async () => { if (!confirm('Delete plan?')) return; await invoke('delete-plan', { plan_id: activePlan.id }); setSelected(null); refreshPlans(); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle className="text-sm">Steps</CardTitle>{stepsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}</CardHeader>
                <CardContent className="space-y-3">
                  {steps.map((s) => (
                    <div key={s.id} className="border rounded-md p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">#{s.seq}</span>
                            <div className="font-medium text-sm">{s.title}</div>
                            <Badge className={`text-[10px] ${STATUS_COLOR[s.status] ?? ''}`}>{s.status}</Badge>
                            {s.tool_hint && <Badge variant="outline" className="text-[10px]">{s.tool_hint}</Badge>}
                          </div>
                          {s.description && <p className="text-xs text-muted-foreground mt-1">{s.description}</p>}
                          {s.expected_output && <p className="text-[11px] text-muted-foreground mt-1"><strong>Expected:</strong> {s.expected_output}</p>}
                          {s.error && <p className="text-xs text-destructive mt-2">{s.error}</p>}
                          {s.result?.response && <details className="mt-2"><summary className="text-xs cursor-pointer text-primary">View result</summary><pre className="text-[11px] whitespace-pre-wrap mt-1 bg-muted p-2 rounded max-h-64 overflow-auto">{typeof s.result.response === 'string' ? s.result.response : JSON.stringify(s.result, null, 2)}</pre></details>}
                        </div>
                        <div className="flex gap-1">
                          {s.status === 'pending' && activePlan.requires_approval && (
                            <>
                              <Button size="sm" variant="secondary" onClick={async () => { await invoke('approve-step', { step_id: s.id }); loadPlan(activePlan.id); }}><CheckCircle2 className="h-3 w-3" /></Button>
                              <Button size="sm" variant="ghost" onClick={async () => { await invoke('skip-step', { step_id: s.id }); loadPlan(activePlan.id); }}><SkipForward className="h-3 w-3" /></Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {steps.length === 0 && !stepsLoading && <p className="text-sm text-muted-foreground">No steps yet.</p>}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftPlanDialog({ onCreated }: { onCreated: (planId: string) => void }) {
  const [goal, setGoal] = useState('');
  const [title, setTitle] = useState('');
  const [skillSlug, setSkillSlug] = useState<string>('');
  const [skills, setSkills] = useState<Array<{ slug: string; name: string }>>([]);
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.functions.invoke('ai-dashboard-agent', { body: { action: 'list-skills' } });
      const list = (data as any)?.skills ?? [];
      setSkills(list.map((s: any) => ({ slug: s.slug, name: s.name })));
    })();
  }, []);

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Draft a new plan</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium">Goal</label>
          <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="E.g. Review my stale client deals and draft follow-up messages." rows={4} />
        </div>
        <div>
          <label className="text-xs font-medium">Title (optional)</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Auto-derived from goal" />
        </div>
        <div>
          <label className="text-xs font-medium">Skill (optional)</label>
          <select className="w-full border rounded-md h-9 px-2 bg-background text-sm" value={skillSlug} onChange={(e) => setSkillSlug(e.target.value)}>
            <option value="">(no skill overlay)</option>
            {skills.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} />
          Require approval before each step runs
        </label>
      </div>
      <DialogFooter>
        <Button disabled={!goal.trim() || busy} onClick={async () => {
          setBusy(true);
          try {
            const { plan } = await invoke('draft-plan', { goal, title: title || undefined, skill_slug: skillSlug || null, requires_approval: requiresApproval });
            toast.success('Plan drafted');
            onCreated(plan.id);
          } catch (err) { toast.error(String((err as Error).message)); }
          finally { setBusy(false); }
        }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Draft plan'}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
