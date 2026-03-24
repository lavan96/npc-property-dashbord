import { useState } from 'react';
import { type GamePlanPhase, type GamePlanMilestone, type GamePlanKPI, type GamePlanNote, type GamePlanAction } from '@/hooks/useGamePlans';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Plus, Trash2, Target, StickyNote, CheckCircle2, CircleDot, AlertCircle, Clock, Pin } from 'lucide-react';
import { cn } from '@/lib/utils';

const phaseStatusMap: Record<string, { label: string; icon: typeof CircleDot; color: string }> = {
  not_started: { label: 'Not Started', icon: Clock, color: 'text-muted-foreground' },
  in_progress: { label: 'In Progress', icon: CircleDot, color: 'text-primary' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'text-green-500' },
  blocked: { label: 'Blocked', icon: AlertCircle, color: 'text-destructive' },
};

const noteTypeColors: Record<string, string> = {
  general: 'border-border',
  decision: 'border-primary',
  risk: 'border-destructive',
  idea: 'border-yellow-500',
};

interface Props {
  phase: GamePlanPhase;
  milestones: GamePlanMilestone[];
  kpis: GamePlanKPI[];
  notes: GamePlanNote[];
  actions: GamePlanAction[];
  mutations: any;
  index: number;
}

export function PhaseCard({ phase, milestones, kpis, notes, actions, mutations, index }: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [newMilestone, setNewMilestone] = useState('');
  const [newKPI, setNewKPI] = useState({ name: '', target: '', unit: '' });
  const [newNote, setNewNote] = useState('');
  const [newNoteType, setNewNoteType] = useState<'general' | 'decision' | 'risk' | 'idea'>('general');
  const [newAction, setNewAction] = useState('');
  const [showAddSection, setShowAddSection] = useState<string | null>(null);

  const statusCfg = phaseStatusMap[phase.status] || phaseStatusMap.not_started;
  const StatusIcon = statusCfg.icon;
  const completedMilestones = milestones.filter(m => m.status === 'completed').length;
  const phaseProgress = milestones.length > 0 ? Math.round((completedMilestones / milestones.length) * 100) : 0;

  const cyclePhaseStatus = () => {
    const order = ['not_started', 'in_progress', 'completed', 'blocked'];
    const next = order[(order.indexOf(phase.status) + 1) % order.length];
    mutations.phases.update.mutate({ id: phase.id, status: next });
  };

  const addMilestone = async () => {
    if (!newMilestone.trim()) return;
    await mutations.milestones.create.mutateAsync({ phase_id: phase.id, title: newMilestone.trim(), display_order: milestones.length });
    setNewMilestone('');
  };

  const addKPI = async () => {
    if (!newKPI.name.trim() || !newKPI.target) return;
    await mutations.kpis.create.mutateAsync({ phase_id: phase.id, metric_name: newKPI.name.trim(), target_value: parseFloat(newKPI.target), unit: newKPI.unit, display_order: kpis.length });
    setNewKPI({ name: '', target: '', unit: '' });
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    await mutations.notes.create.mutateAsync({ phase_id: phase.id, content: newNote.trim(), note_type: newNoteType });
    setNewNote('');
  };

  const addAction = async () => {
    if (!newAction.trim()) return;
    await mutations.actions.create.mutateAsync({ phase_id: phase.id, label: newAction.trim(), display_order: actions.length });
    setNewAction('');
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card
        className="overflow-hidden border-border/50 transition-all duration-300"
        style={{ animationDelay: `${index * 100}ms` }}
      >
        {/* Phase color bar */}
        <div className="h-1" style={{ background: phase.color }} />

        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3">
              <span className="text-xl">{phase.icon}</span>
              <div className="text-left">
                <h3 className="font-semibold text-foreground">{phase.name}</h3>
                {phase.description && <p className="text-xs text-muted-foreground line-clamp-1">{phase.description}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={(e) => { e.stopPropagation(); cyclePhaseStatus(); }} className="flex items-center gap-1.5">
                <StatusIcon className={cn('h-4 w-4', statusCfg.color)} />
                <span className={cn('text-xs font-medium', statusCfg.color)}>{statusCfg.label}</span>
              </button>
              {milestones.length > 0 && (
                <div className="hidden sm:flex items-center gap-2">
                  <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${phaseProgress}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{phaseProgress}%</span>
                </div>
              )}
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4 space-y-4">
            {/* ── Milestones ── */}
            <Section title="Milestones" icon={<Target className="h-3.5 w-3.5" />} count={milestones.length}>
              {milestones.map(m => (
                <div key={m.id} className="flex items-center gap-2 group">
                  <Checkbox
                    checked={m.status === 'completed'}
                    onCheckedChange={(checked) => mutations.milestones.update.mutate({ id: m.id, status: checked ? 'completed' : 'not_started' })}
                  />
                  <span className={cn('text-sm flex-1', m.status === 'completed' && 'line-through text-muted-foreground')}>
                    {m.title}
                  </span>
                  {m.owner && <Badge variant="outline" className="text-[10px]">{m.owner}</Badge>}
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => mutations.milestones.remove.mutate(m.id)}>
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              ))}
              {showAddSection === 'milestone' ? (
                <div className="flex gap-2">
                  <Input value={newMilestone} onChange={e => setNewMilestone(e.target.value)} placeholder="Milestone title..." className="h-8 text-sm" onKeyDown={e => e.key === 'Enter' && addMilestone()} />
                  <Button size="sm" className="h-8" onClick={addMilestone}>Add</Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" onClick={() => setShowAddSection('milestone')}>
                  <Plus className="h-3 w-3" /> Add Milestone
                </Button>
              )}
            </Section>

            {/* ── KPIs ── */}
            <Section title="KPI Targets" icon={<span className="text-xs">📊</span>} count={kpis.length}>
              {kpis.map(k => {
                const pct = k.target_value > 0 ? Math.min(100, Math.round((k.current_value / k.target_value) * 100)) : 0;
                return (
                  <div key={k.id} className="group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">{k.icon} {k.metric_name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {k.current_value}{k.unit} / {k.target_value}{k.unit}
                        </span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => mutations.kpis.remove.mutate(k.id)}>
                          <Trash2 className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                    <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                        style={{
                          width: `${pct}%`,
                          background: pct >= 100 ? '#22c55e' : pct >= 60 ? '#3b82f6' : '#f97316',
                        }}
                      />
                    </div>
                    <div className="text-right mt-0.5">
                      <span className="text-[10px] font-bold" style={{ color: pct >= 100 ? '#22c55e' : pct >= 60 ? '#3b82f6' : '#f97316' }}>{pct}%</span>
                    </div>
                  </div>
                );
              })}
              {showAddSection === 'kpi' ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input value={newKPI.name} onChange={e => setNewKPI(p => ({ ...p, name: e.target.value }))} placeholder="Metric name" className="h-8 text-sm" />
                    <Input value={newKPI.target} onChange={e => setNewKPI(p => ({ ...p, target: e.target.value }))} placeholder="Target" type="number" className="h-8 text-sm w-24" />
                    <Input value={newKPI.unit} onChange={e => setNewKPI(p => ({ ...p, unit: e.target.value }))} placeholder="Unit" className="h-8 text-sm w-20" />
                  </div>
                  <Button size="sm" className="h-8" onClick={addKPI}>Add KPI</Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" onClick={() => setShowAddSection('kpi')}>
                  <Plus className="h-3 w-3" /> Add KPI
                </Button>
              )}
            </Section>

            {/* ── Action Items ── */}
            <Section title="Action Items" icon={<CheckCircle2 className="h-3.5 w-3.5" />} count={actions.length}>
              {actions.map(a => (
                <div key={a.id} className="flex items-center gap-2 group">
                  <Checkbox
                    checked={a.is_done}
                    onCheckedChange={(checked) => mutations.actions.update.mutate({ id: a.id, is_done: !!checked, completed_at: checked ? new Date().toISOString() : null })}
                  />
                  <span className={cn('text-sm flex-1', a.is_done && 'line-through text-muted-foreground')}>{a.label}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => mutations.actions.remove.mutate(a.id)}>
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              ))}
              {showAddSection === 'action' ? (
                <div className="flex gap-2">
                  <Input value={newAction} onChange={e => setNewAction(e.target.value)} placeholder="Action item..." className="h-8 text-sm" onKeyDown={e => e.key === 'Enter' && addAction()} />
                  <Button size="sm" className="h-8" onClick={addAction}>Add</Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" onClick={() => setShowAddSection('action')}>
                  <Plus className="h-3 w-3" /> Add Action
                </Button>
              )}
            </Section>

            {/* ── Notes ── */}
            <Section title="Strategy Notes" icon={<StickyNote className="h-3.5 w-3.5" />} count={notes.length}>
              {notes.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0)).map(n => (
                <div key={n.id} className={cn('rounded-lg border p-2.5 text-sm group relative', noteTypeColors[n.note_type] || 'border-border')}>
                  {n.is_pinned && <Pin className="absolute top-2 right-2 h-3 w-3 text-primary" />}
                  <div className="flex items-center gap-1.5 mb-1">
                    <Badge variant="outline" className="text-[9px] uppercase">
                      {n.note_type}
                    </Badge>
                  </div>
                  <p className="text-foreground whitespace-pre-wrap">{n.content}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleDateString()}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => mutations.notes.update.mutate({ id: n.id, is_pinned: !n.is_pinned })}>
                        <Pin className={cn('h-3 w-3', n.is_pinned ? 'text-primary' : 'text-muted-foreground')} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => mutations.notes.remove.mutate(n.id)}>
                        <Trash2 className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {showAddSection === 'note' ? (
                <div className="space-y-2">
                  <div className="flex gap-1.5">
                    {(['general', 'decision', 'risk', 'idea'] as const).map(t => (
                      <Button key={t} variant={newNoteType === t ? 'default' : 'outline'} size="sm" className="h-7 text-xs capitalize" onClick={() => setNewNoteType(t)}>{t}</Button>
                    ))}
                  </div>
                  <Textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Write your note..." rows={3} />
                  <Button size="sm" onClick={addNote}>Add Note</Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" onClick={() => setShowAddSection('note')}>
                  <Plus className="h-3 w-3" /> Add Note
                </Button>
              )}
            </Section>

            {/* Delete phase */}
            <div className="pt-2 border-t border-border/30">
              <Button variant="ghost" size="sm" className="text-xs text-destructive hover:text-destructive gap-1" onClick={() => mutations.phases.remove.mutate(phase.id)}>
                <Trash2 className="h-3 w-3" /> Delete Phase
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function Section({ title, icon, count, children }: { title: string; icon: React.ReactNode; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">{title}</span>
        <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{count}</Badge>
      </div>
      <div className="space-y-2 pl-0.5">
        {children}
      </div>
    </div>
  );
}
