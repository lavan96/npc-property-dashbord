import { useState } from 'react';
import { type GamePlanPhase, type GamePlanMilestone, type GamePlanKPI, type GamePlanNote, type GamePlanAction } from '@/hooks/useGamePlans';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ChevronDown, Plus, Trash2, Target, StickyNote, CheckCircle2, CircleDot, AlertCircle, Clock, Pin, Pencil, X, Calendar as CalendarIcon, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { RichTextEditor } from './RichTextEditor';

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

const PHASE_ICONS = ['📌', '🔬', '🛠️', '🚀', '📦', '🎯', '📣', '🧪', '📋', '⚙️', '💡', '🏆', '🔥', '📈', '🗺️'];

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
  const [newMilestoneOwner, setNewMilestoneOwner] = useState('');
  const [newMilestoneDue, setNewMilestoneDue] = useState<Date | undefined>();
  const [newKPI, setNewKPI] = useState({ name: '', target: '', unit: '', icon: '📊' });
  const [newNote, setNewNote] = useState('');
  const [newNoteType, setNewNoteType] = useState<'general' | 'decision' | 'risk' | 'idea'>('general');
  const [newAction, setNewAction] = useState('');
  const [newActionAssignee, setNewActionAssignee] = useState('');
  const [newActionDue, setNewActionDue] = useState<Date | undefined>();
  const [showAddSection, setShowAddSection] = useState<string | null>(null);
  const [editingPhase, setEditingPhase] = useState(false);
  const [editName, setEditName] = useState(phase.name);
  const [editDescription, setEditDescription] = useState(phase.description || '');
  const [editIcon, setEditIcon] = useState(phase.icon);

  const statusCfg = phaseStatusMap[phase.status] || phaseStatusMap.not_started;
  const StatusIcon = statusCfg.icon;
  const completedMilestones = milestones.filter(m => m.status === 'completed').length;
  const phaseProgress = milestones.length > 0 ? Math.round((completedMilestones / milestones.length) * 100) : 0;
  const completedActions = actions.filter(a => a.is_done).length;

  const handleStatusChange = (newStatus: string) => {
    mutations.phases.update.mutate({ id: phase.id, status: newStatus });
  };

  const savePhaseEdit = () => {
    mutations.phases.update.mutate({
      id: phase.id,
      name: editName.trim(),
      description: editDescription.trim() || null,
      icon: editIcon,
    });
    setEditingPhase(false);
  };

  const cancelPhaseEdit = () => {
    setEditName(phase.name);
    setEditDescription(phase.description || '');
    setEditIcon(phase.icon);
    setEditingPhase(false);
  };

  const addMilestone = async () => {
    if (!newMilestone.trim()) return;
    await mutations.milestones.create.mutateAsync({
      phase_id: phase.id,
      title: newMilestone.trim(),
      owner: newMilestoneOwner.trim() || null,
      due_date: newMilestoneDue ? newMilestoneDue.toISOString() : null,
      display_order: milestones.length,
    });
    setNewMilestone('');
    setNewMilestoneOwner('');
    setNewMilestoneDue(undefined);
  };

  const addKPI = async () => {
    if (!newKPI.name.trim() || !newKPI.target) return;
    await mutations.kpis.create.mutateAsync({
      phase_id: phase.id,
      metric_name: newKPI.name.trim(),
      target_value: parseFloat(newKPI.target),
      unit: newKPI.unit || '',
      icon: newKPI.icon,
      display_order: kpis.length,
    });
    setNewKPI({ name: '', target: '', unit: '', icon: '📊' });
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    await mutations.notes.create.mutateAsync({ phase_id: phase.id, content: newNote.trim(), note_type: newNoteType });
    setNewNote('');
    setShowAddSection(null);
  };

  const addAction = async () => {
    if (!newAction.trim()) return;
    await mutations.actions.create.mutateAsync({
      phase_id: phase.id,
      label: newAction.trim(),
      assigned_to: newActionAssignee.trim() || null,
      due_date: newActionDue ? newActionDue.toISOString() : null,
      display_order: actions.length,
    });
    setNewAction('');
    setNewActionAssignee('');
    setNewActionDue(undefined);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card
        className="overflow-hidden border-border/50 transition-all duration-300"
        style={{ animationDelay: `${index * 100}ms` }}
      >
        {/* Phase color bar */}
        <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${phase.color}, ${phase.color}80)` }} />

        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xl shrink-0">{phase.icon}</span>
              <div className="text-left min-w-0">
                <h3 className="font-semibold text-foreground truncate">{phase.name}</h3>
                {phase.description && <p className="text-xs text-muted-foreground line-clamp-1">{phase.description}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Status dropdown */}
              <div onClick={e => e.stopPropagation()}>
                <Select value={phase.status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="h-7 w-auto gap-1 border-none bg-transparent px-1.5 text-xs focus:ring-0">
                    <StatusIcon className={cn('h-3.5 w-3.5', statusCfg.color)} />
                    <span className={cn('hidden sm:inline', statusCfg.color)}>{statusCfg.label}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(phaseStatusMap).map(([key, cfg]) => {
                      const Icon = cfg.icon;
                      return (
                        <SelectItem key={key} value={key}>
                          <span className="flex items-center gap-2">
                            <Icon className={cn('h-3.5 w-3.5', cfg.color)} />
                            {cfg.label}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              {/* Progress summary chips */}
              {milestones.length > 0 && (
                <div className="hidden sm:flex items-center gap-2">
                  <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${phaseProgress}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-medium">{phaseProgress}%</span>
                </div>
              )}
              {/* Quick counts */}
              <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-muted-foreground">
                {milestones.length > 0 && <span>{completedMilestones}/{milestones.length} 🏁</span>}
                {actions.length > 0 && <span>{completedActions}/{actions.length} ✓</span>}
              </div>
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4 space-y-4">
            {/* Phase edit section */}
            {editingPhase ? (
              <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {PHASE_ICONS.map(i => (
                      <button key={i} onClick={() => setEditIcon(i)}
                        className={cn('text-lg w-7 h-7 rounded-md flex items-center justify-center transition-all',
                          editIcon === i ? 'bg-primary/20 ring-2 ring-primary' : 'hover:bg-muted')}>
                        {i}
                      </button>
                    ))}
                  </div>
                </div>
                <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Phase name" className="h-9 font-medium" />
                <Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Phase description..." rows={2} className="text-sm" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={savePhaseEdit} disabled={!editName.trim()}>Save Changes</Button>
                  <Button size="sm" variant="ghost" onClick={cancelPhaseEdit}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1.5 h-7" onClick={() => setEditingPhase(true)}>
                  <Pencil className="h-3 w-3" /> Edit Phase Details
                </Button>
              </div>
            )}

            {/* ── Milestones ── */}
            <Section title="Milestones" icon={<Target className="h-3.5 w-3.5" />} count={milestones.length}>
              {milestones.map(m => (
                <MilestoneRow key={m.id} milestone={m} mutations={mutations} />
              ))}
              {showAddSection === 'milestone' ? (
                <div className="p-3 rounded-lg border border-border/50 bg-muted/30 space-y-2">
                  <Input value={newMilestone} onChange={e => setNewMilestone(e.target.value)} placeholder="Milestone title..."
                    className="h-8 text-sm" onKeyDown={e => e.key === 'Enter' && addMilestone()} autoFocus />
                  <div className="flex flex-wrap gap-2">
                    <Input value={newMilestoneOwner} onChange={e => setNewMilestoneOwner(e.target.value)}
                      placeholder="Owner (optional)" className="h-8 text-sm flex-1 min-w-[120px]" />
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                          <CalendarIcon className="h-3 w-3" />
                          {newMilestoneDue ? format(newMilestoneDue, 'MMM d') : 'Due date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={newMilestoneDue} onSelect={setNewMilestoneDue}
                          disabled={d => d < new Date()} initialFocus className={cn("p-3 pointer-events-auto")} />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-8" onClick={addMilestone} disabled={!newMilestone.trim()}>Add Milestone</Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => { setShowAddSection(null); setNewMilestone(''); setNewMilestoneOwner(''); setNewMilestoneDue(undefined); }}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" onClick={() => setShowAddSection('milestone')}>
                  <Plus className="h-3 w-3" /> Add Milestone
                </Button>
              )}
            </Section>

            {/* ── KPIs ── */}
            <Section title="KPI Targets" icon={<span className="text-xs">📊</span>} count={kpis.length}>
              {kpis.map(k => (
                <KPIRow key={k.id} kpi={k} mutations={mutations} />
              ))}
              {showAddSection === 'kpi' ? (
                <div className="p-3 rounded-lg border border-border/50 bg-muted/30 space-y-2">
                  <Input value={newKPI.name} onChange={e => setNewKPI(p => ({ ...p, name: e.target.value }))} placeholder="Metric name (e.g. Revenue)" className="h-8 text-sm" autoFocus />
                  <div className="flex gap-2">
                    <Input value={newKPI.target} onChange={e => setNewKPI(p => ({ ...p, target: e.target.value }))} placeholder="Target" type="number" className="h-8 text-sm w-28" />
                    <Input value={newKPI.unit} onChange={e => setNewKPI(p => ({ ...p, unit: e.target.value }))} placeholder="Unit (%, $, etc)" className="h-8 text-sm w-28" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-8" onClick={addKPI} disabled={!newKPI.name.trim() || !newKPI.target}>Add KPI</Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => { setShowAddSection(null); setNewKPI({ name: '', target: '', unit: '', icon: '📊' }); }}>Cancel</Button>
                  </div>
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
                <ActionRow key={a.id} action={a} mutations={mutations} />
              ))}
              {showAddSection === 'action' ? (
                <div className="p-3 rounded-lg border border-border/50 bg-muted/30 space-y-2">
                  <Input value={newAction} onChange={e => setNewAction(e.target.value)} placeholder="Action item..."
                    className="h-8 text-sm" onKeyDown={e => e.key === 'Enter' && addAction()} autoFocus />
                  <div className="flex flex-wrap gap-2">
                    <Input value={newActionAssignee} onChange={e => setNewActionAssignee(e.target.value)}
                      placeholder="Assign to (optional)" className="h-8 text-sm flex-1 min-w-[120px]" />
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                          <CalendarIcon className="h-3 w-3" />
                          {newActionDue ? format(newActionDue, 'MMM d') : 'Due date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={newActionDue} onSelect={setNewActionDue}
                          disabled={d => d < new Date()} initialFocus className={cn("p-3 pointer-events-auto")} />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-8" onClick={addAction} disabled={!newAction.trim()}>Add Action</Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => { setShowAddSection(null); setNewAction(''); setNewActionAssignee(''); setNewActionDue(undefined); }}>Cancel</Button>
                  </div>
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
                <NoteCard key={n.id} note={n} mutations={mutations} noteTypeColors={noteTypeColors} />
              ))}
              {showAddSection === 'note' ? (
                <div className="p-3 rounded-lg border border-border/50 bg-muted/30 space-y-2">
                  <div className="flex gap-1.5">
                    {(['general', 'decision', 'risk', 'idea'] as const).map(t => (
                      <Button key={t} variant={newNoteType === t ? 'default' : 'outline'} size="sm"
                        className="h-7 text-xs capitalize" onClick={() => setNewNoteType(t)}>
                        {t === 'general' ? '📝' : t === 'decision' ? '⚖️' : t === 'risk' ? '⚠️' : '💡'} {t}
                      </Button>
                    ))}
                  </div>
                  <RichTextEditor value={newNote} onChange={setNewNote} placeholder="Write your note with **bold**, _italic_, bullet lists..." rows={4} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={addNote} disabled={!newNote.trim()}>Add Note</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowAddSection(null); setNewNote(''); }}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" onClick={() => setShowAddSection('note')}>
                  <Plus className="h-3 w-3" /> Add Note
                </Button>
              )}
            </Section>

            {/* Phase actions footer */}
            <div className="pt-2 border-t border-border/30 flex items-center justify-between">
              <Button variant="ghost" size="sm" className="text-xs text-destructive hover:text-destructive gap-1"
                onClick={() => {
                  if (window.confirm('Delete this phase and all its contents?')) {
                    mutations.phases.remove.mutate(phase.id);
                  }
                }}>
                <Trash2 className="h-3 w-3" /> Delete Phase
              </Button>
              <span className="text-[10px] text-muted-foreground">
                {phase.start_date && `${format(new Date(phase.start_date), 'MMM d')} → `}
                {phase.end_date && format(new Date(phase.end_date), 'MMM d, yyyy')}
              </span>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

/* ── Milestone Row with inline editing ── */
function MilestoneRow({ milestone: m, mutations }: { milestone: GamePlanMilestone; mutations: any }) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(m.title);
  const [editOwner, setEditOwner] = useState(m.owner || '');

  const save = () => {
    mutations.milestones.update.mutate({ id: m.id, title: editTitle.trim(), owner: editOwner.trim() || null });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="p-2 rounded-md border bg-muted/30 space-y-2">
        <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="h-8 text-sm" autoFocus
          onKeyDown={e => e.key === 'Enter' && save()} />
        <div className="flex gap-2">
          <Input value={editOwner} onChange={e => setEditOwner(e.target.value)} placeholder="Owner" className="h-8 text-sm flex-1" />
          <Button size="sm" className="h-8 text-xs" onClick={save}>Save</Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setEditing(false); setEditTitle(m.title); setEditOwner(m.owner || ''); }}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group">
      <Checkbox
        checked={m.status === 'completed'}
        onCheckedChange={(checked) => mutations.milestones.update.mutate({
          id: m.id,
          status: checked ? 'completed' : 'not_started',
          completed_at: checked ? new Date().toISOString() : null,
        })}
      />
      <span className={cn('text-sm flex-1 cursor-pointer', m.status === 'completed' && 'line-through text-muted-foreground')}
        onDoubleClick={() => setEditing(true)}>
        {m.title}
      </span>
      {m.due_date && (
        <span className={cn('text-[10px]', new Date(m.due_date) < new Date() && m.status !== 'completed' ? 'text-destructive font-medium' : 'text-muted-foreground')}>
          {format(new Date(m.due_date), 'MMM d')}
        </span>
      )}
      {m.owner && <Badge variant="outline" className="text-[10px] shrink-0">{m.owner}</Badge>}
      <div className="flex gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(true)}>
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => mutations.milestones.remove.mutate(m.id)}>
          <Trash2 className="h-3 w-3 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}

/* ── KPI Row with inline value update ── */
function KPIRow({ kpi: k, mutations }: { kpi: GamePlanKPI; mutations: any }) {
  const [editingValue, setEditingValue] = useState(false);
  const [currentVal, setCurrentVal] = useState(String(k.current_value));
  const pct = k.target_value > 0 ? Math.min(100, Math.round((k.current_value / k.target_value) * 100)) : 0;

  const saveValue = () => {
    const val = parseFloat(currentVal);
    if (!isNaN(val)) {
      mutations.kpis.update.mutate({ id: k.id, current_value: val });
    }
    setEditingValue(false);
  };

  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-foreground">{k.icon} {k.metric_name}</span>
        <div className="flex items-center gap-2">
          {editingValue ? (
            <div className="flex items-center gap-1">
              <Input value={currentVal} onChange={e => setCurrentVal(e.target.value)} type="number"
                className="h-6 w-20 text-xs" autoFocus onKeyDown={e => e.key === 'Enter' && saveValue()} />
              <span className="text-xs text-muted-foreground">/ {k.target_value}{k.unit}</span>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={saveValue}>
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              </Button>
            </div>
          ) : (
            <button onClick={() => { setCurrentVal(String(k.current_value)); setEditingValue(true); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              {k.current_value}{k.unit} / {k.target_value}{k.unit}
            </button>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            onClick={() => mutations.kpis.remove.mutate(k.id)}>
            <Trash2 className="h-3 w-3 text-muted-foreground" />
          </Button>
        </div>
      </div>
      <div className="relative h-2 rounded-full bg-muted overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: pct >= 100 ? '#22c55e' : pct >= 60 ? '#3b82f6' : '#f97316' }} />
      </div>
      <div className="text-right mt-0.5">
        <span className="text-[10px] font-bold" style={{ color: pct >= 100 ? '#22c55e' : pct >= 60 ? '#3b82f6' : '#f97316' }}>{pct}%</span>
      </div>
    </div>
  );
}

/* ── Action Row with inline editing ── */
function ActionRow({ action: a, mutations }: { action: GamePlanAction; mutations: any }) {
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(a.label);
  const [editAssignee, setEditAssignee] = useState(a.assigned_to || '');

  const save = () => {
    mutations.actions.update.mutate({ id: a.id, label: editLabel.trim(), assigned_to: editAssignee.trim() || null });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="p-2 rounded-md border bg-muted/30 space-y-2">
        <Input value={editLabel} onChange={e => setEditLabel(e.target.value)} className="h-8 text-sm" autoFocus
          onKeyDown={e => e.key === 'Enter' && save()} />
        <div className="flex gap-2">
          <Input value={editAssignee} onChange={e => setEditAssignee(e.target.value)} placeholder="Assigned to" className="h-8 text-sm flex-1" />
          <Button size="sm" className="h-8 text-xs" onClick={save}>Save</Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setEditing(false); setEditLabel(a.label); setEditAssignee(a.assigned_to || ''); }}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group">
      <Checkbox
        checked={a.is_done}
        onCheckedChange={(checked) => mutations.actions.update.mutate({
          id: a.id,
          is_done: !!checked,
          completed_at: checked ? new Date().toISOString() : null,
        })}
      />
      <span className={cn('text-sm flex-1 cursor-pointer', a.is_done && 'line-through text-muted-foreground')}
        onDoubleClick={() => setEditing(true)}>
        {a.label}
      </span>
      {a.due_date && (
        <span className={cn('text-[10px]', new Date(a.due_date) < new Date() && !a.is_done ? 'text-destructive font-medium' : 'text-muted-foreground')}>
          {format(new Date(a.due_date), 'MMM d')}
        </span>
      )}
      {a.assigned_to && <Badge variant="outline" className="text-[10px] shrink-0">{a.assigned_to}</Badge>}
      <div className="flex gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(true)}>
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => mutations.actions.remove.mutate(a.id)}>
          <Trash2 className="h-3 w-3 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}

/* ── Section wrapper ── */
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

/* ── Note Card with inline editing ── */
function NoteCard({ note, mutations, noteTypeColors }: { note: GamePlanNote; mutations: any; noteTypeColors: Record<string, string> }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const [editType, setEditType] = useState(note.note_type);

  const handleSave = () => {
    if (editContent.trim()) {
      mutations.notes.update.mutate({ id: note.id, content: editContent.trim(), note_type: editType });
    }
    setIsEditing(false);
  };

  return (
    <div className={cn('rounded-lg border p-2.5 text-sm group relative', noteTypeColors[note.note_type] || 'border-border')}>
      {note.is_pinned && <Pin className="absolute top-2 right-2 h-3 w-3 text-primary" />}
      <div className="flex items-center gap-1.5 mb-1">
        <Badge variant="outline" className="text-[9px] uppercase">
          {note.note_type === 'general' ? '📝' : note.note_type === 'decision' ? '⚖️' : note.note_type === 'risk' ? '⚠️' : '💡'} {note.note_type}
        </Badge>
      </div>
      {isEditing ? (
        <div className="space-y-2">
          <div className="flex gap-1.5">
            {(['general', 'decision', 'risk', 'idea'] as const).map(t => (
              <Button key={t} variant={editType === t ? 'default' : 'outline'} size="sm"
                className="h-6 text-[10px] capitalize" onClick={() => setEditType(t)}>{t}</Button>
            ))}
          </div>
          <RichTextEditor value={editContent} onChange={setEditContent} rows={3} />
          <div className="flex gap-1.5">
            <Button size="sm" className="h-7 text-xs" onClick={handleSave}>Save</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setIsEditing(false); setEditContent(note.content); setEditType(note.note_type); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="text-foreground cursor-pointer" onDoubleClick={() => setIsEditing(true)}>
          <InlineMarkdown content={note.content} />
        </div>
      )}
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-muted-foreground">{new Date(note.created_at).toLocaleDateString()}</span>
        <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsEditing(true)} title="Edit note">
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => mutations.notes.update.mutate({ id: note.id, is_pinned: !note.is_pinned })}>
            <Pin className={cn('h-3 w-3', note.is_pinned ? 'text-primary' : 'text-muted-foreground')} />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => mutations.notes.remove.mutate(note.id)}>
            <Trash2 className="h-3 w-3 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Renders basic inline markdown */
function InlineMarkdown({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-0.5 text-sm">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('## ')) return <p key={i} className="font-semibold text-foreground">{renderInline(trimmed.slice(3))}</p>;
        if (trimmed.startsWith('> ')) return <p key={i} className="border-l-2 border-primary/40 pl-2 italic text-muted-foreground">{renderInline(trimmed.slice(2))}</p>;
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) return <p key={i} className="flex gap-1.5"><span className="text-primary">•</span>{renderInline(trimmed.slice(2))}</p>;
        if (/^\d+\.\s/.test(trimmed)) {
          const m = trimmed.match(/^(\d+)\.\s(.*)$/);
          return m ? <p key={i} className="flex gap-1.5"><span className="text-primary font-medium">{m[1]}.</span>{renderInline(m[2])}</p> : <p key={i}>{trimmed}</p>;
        }
        if (trimmed === '') return <div key={i} className="h-1" />;
        return <p key={i}>{renderInline(trimmed)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let k = 0;

  while (remaining.length > 0) {
    const bold = remaining.match(/\*\*(.+?)\*\*/);
    const italic = remaining.match(/_(.+?)_/);
    const code = remaining.match(/`(.+?)`/);
    const link = remaining.match(/\[(.+?)\]\((.+?)\)/);

    const candidates = [
      bold ? { t: 'b', m: bold, i: bold.index! } : null,
      italic ? { t: 'i', m: italic, i: italic.index! } : null,
      code ? { t: 'c', m: code, i: code.index! } : null,
      link ? { t: 'l', m: link, i: link.index! } : null,
    ].filter(Boolean).sort((a, b) => a!.i - b!.i);

    if (!candidates.length) { parts.push(remaining); break; }
    const f = candidates[0]!;
    if (f.i > 0) parts.push(remaining.substring(0, f.i));
    if (f.t === 'b') parts.push(<strong key={k++}>{f.m![1]}</strong>);
    else if (f.t === 'i') parts.push(<em key={k++}>{f.m![1]}</em>);
    else if (f.t === 'c') parts.push(<code key={k++} className="px-1 py-0.5 rounded bg-muted text-[0.85em] font-mono">{f.m![1]}</code>);
    else if (f.t === 'l') parts.push(<a key={k++} href={f.m![2]} className="text-primary underline" target="_blank" rel="noopener noreferrer">{f.m![1]}</a>);
    remaining = remaining.substring(f.i + f.m![0].length);
  }
  return <>{parts}</>;
}
