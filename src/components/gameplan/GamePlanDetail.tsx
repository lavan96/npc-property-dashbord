import { useState, useMemo } from 'react';
import { type GamePlan, type GamePlanPhase, type GamePlanMilestone, type GamePlanKPI, type GamePlanNote, type GamePlanAction, useGamePlanPhases, useGamePlanMilestones, useGamePlanKPIs, useGamePlanNotes, useGamePlanActions, useGamePlanMutations } from '@/hooks/useGamePlans';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ArrowLeft, Plus, Pencil, Search, Calendar as CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { PhaseCard } from './PhaseCard';
import { TimelineBar } from './TimelineBar';
import { AddPhaseDialog } from './AddPhaseDialog';
import { toast } from 'sonner';

interface Props {
  plan: GamePlan;
  onBack: () => void;
}

const PLAN_ICONS = ['🎯', '🚀', '📈', '💡', '⚡', '🏆', '🗺️', '🔥', '💎', '🌟'];
const PLAN_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#64748b'];

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; emoji: string }> = {
  planning: { label: 'Planning', variant: 'outline', emoji: '📋' },
  active: { label: 'Active', variant: 'default', emoji: '🟢' },
  completed: { label: 'Completed', variant: 'secondary', emoji: '✅' },
  archived: { label: 'Archived', variant: 'destructive', emoji: '📦' },
};

export function GamePlanDetail({ plan, onBack }: Props) {
  const { data: phases = [] } = useGamePlanPhases(plan.id);
  const phaseIds = phases.map(p => p.id);
  const { data: milestones = [] } = useGamePlanMilestones(phaseIds);
  const { data: kpis = [] } = useGamePlanKPIs(phaseIds);
  const { data: notes = [] } = useGamePlanNotes(phaseIds);
  const { data: actions = [] } = useGamePlanActions(phaseIds);
  const mutations = useGamePlanMutations();
  const [showAddPhase, setShowAddPhase] = useState(false);
  const [editingPlan, setEditingPlan] = useState(false);
  const [editName, setEditName] = useState(plan.name);
  const [editDescription, setEditDescription] = useState(plan.description || '');
  const [editIcon, setEditIcon] = useState(plan.icon);
  const [editColor, setEditColor] = useState(plan.color);
  const [editStartDate, setEditStartDate] = useState<Date | undefined>(plan.start_date ? new Date(plan.start_date) : undefined);
  const [editEndDate, setEditEndDate] = useState<Date | undefined>(plan.end_date ? new Date(plan.end_date) : undefined);
  const [searchQuery, setSearchQuery] = useState('');

  const cfg = statusConfig[plan.status] || statusConfig.planning;

  // Calculate overall progress
  const totalMilestones = milestones.length;
  const completedMilestones = milestones.filter(m => m.status === 'completed').length;
  const overallProgress = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
  const totalActions = actions.length;
  const completedActions = actions.filter(a => a.is_done).length;

  // Search filter
  const query = searchQuery.trim().toLowerCase();
  const filteredPhaseIds = useMemo(() => {
    if (!query) return null; // null = show all
    const matchingPhaseIds = new Set<string>();
    phases.forEach(p => {
      if (p.name.toLowerCase().includes(query) || (p.description || '').toLowerCase().includes(query)) {
        matchingPhaseIds.add(p.id);
      }
    });
    milestones.forEach(m => {
      if (m.title.toLowerCase().includes(query) || (m.owner || '').toLowerCase().includes(query)) {
        matchingPhaseIds.add(m.phase_id);
      }
    });
    actions.forEach(a => {
      if (a.label.toLowerCase().includes(query) || (a.assigned_to || '').toLowerCase().includes(query)) {
        matchingPhaseIds.add(a.phase_id);
      }
    });
    notes.forEach(n => {
      if (n.content.toLowerCase().includes(query)) {
        matchingPhaseIds.add(n.phase_id);
      }
    });
    kpis.forEach(k => {
      if (k.metric_name.toLowerCase().includes(query)) {
        matchingPhaseIds.add(k.phase_id);
      }
    });
    return matchingPhaseIds;
  }, [query, phases, milestones, actions, notes, kpis]);

  const visiblePhases = filteredPhaseIds === null ? phases : phases.filter(p => filteredPhaseIds.has(p.id));

  const savePlanEdit = () => {
    mutations.plans.update.mutate({
      id: plan.id,
      name: editName.trim(),
      description: editDescription.trim() || null,
      icon: editIcon,
      color: editColor,
      start_date: editStartDate ? editStartDate.toISOString() : null,
      end_date: editEndDate ? editEndDate.toISOString() : null,
    });
    setEditingPlan(false);
  };

  const cancelPlanEdit = () => {
    setEditName(plan.name);
    setEditDescription(plan.description || '');
    setEditIcon(plan.icon);
    setEditColor(plan.color);
    setEditStartDate(plan.start_date ? new Date(plan.start_date) : undefined);
    setEditEndDate(plan.end_date ? new Date(plan.end_date) : undefined);
    setEditingPlan(false);
  };

  const handleStatusChange = (newStatus: 'planning' | 'active' | 'completed' | 'archived') => {
    mutations.plans.update.mutate({ id: plan.id, status: newStatus });
  };

  // Reorder phases
  const handleReorderPhase = (phaseId: string, direction: 'up' | 'down') => {
    const idx = phases.findIndex(p => p.id === phaseId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= phases.length) return;
    const current = phases[idx];
    const swap = phases[swapIdx];
    mutations.phases.update.mutate({ id: current.id, display_order: swap.display_order });
    mutations.phases.update.mutate({ id: swap.id, display_order: current.display_order });
  };

  // Clone phase
  const handleClonePhase = async (
    phase: GamePlanPhase,
    phaseMilestones: GamePlanMilestone[],
    phaseKpis: GamePlanKPI[],
    phaseNotes: GamePlanNote[],
    phaseActions: GamePlanAction[]
  ) => {
    try {
      const newPhaseData = await mutations.phases.create.mutateAsync({
        plan_id: plan.id,
        name: `${phase.name} (Copy)`,
        description: phase.description,
        icon: phase.icon,
        color: phase.color,
        display_order: phases.length,
        start_date: phase.start_date,
        end_date: phase.end_date,
      });
      const newPhaseId = newPhaseData?.record?.id || newPhaseData?.id;
      if (newPhaseId) {
        for (const m of phaseMilestones) {
          await mutations.milestones.create.mutateAsync({
            phase_id: newPhaseId,
            title: m.title,
            owner: m.owner,
            due_date: m.due_date,
            display_order: m.display_order,
          });
        }
        for (const k of phaseKpis) {
          await mutations.kpis.create.mutateAsync({
            phase_id: newPhaseId,
            metric_name: k.metric_name,
            target_value: k.target_value,
            unit: k.unit,
            icon: k.icon,
            display_order: k.display_order,
          });
        }
        for (const a of phaseActions) {
          await mutations.actions.create.mutateAsync({
            phase_id: newPhaseId,
            label: a.label,
            assigned_to: a.assigned_to,
            due_date: a.due_date,
            display_order: a.display_order,
          });
        }
        for (const n of phaseNotes) {
          await mutations.notes.create.mutateAsync({
            phase_id: newPhaseId,
            content: n.content,
            note_type: n.note_type,
          });
        }
      }
      toast.success(`Cloned "${phase.name}" with all contents`);
    } catch {
      toast.error('Failed to clone phase');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-3 gap-1.5 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Game Plans
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          {editingPlan ? (
            <div className="flex-1 space-y-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
              <div className="flex gap-3">
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Icon</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {PLAN_ICONS.map(i => (
                      <button key={i} onClick={() => setEditIcon(i)}
                        className={cn('text-lg w-8 h-8 rounded-md flex items-center justify-center transition-all',
                          editIcon === i ? 'bg-primary/20 ring-2 ring-primary' : 'hover:bg-muted')}>
                        {i}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Color</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {PLAN_COLORS.map(c => (
                    <button key={c} onClick={() => setEditColor(c)}
                      className={cn('w-6 h-6 rounded-full transition-all',
                        editColor === c ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110' : 'hover:scale-105')}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <Input value={editName} onChange={e => setEditName(e.target.value)} className="text-lg font-bold" placeholder="Plan name" />
              <Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Description..." rows={2} />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Start Date</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn('w-full mt-1 justify-start text-left font-normal h-8 text-xs', !editStartDate && 'text-muted-foreground')}>
                        <CalendarIcon className="mr-1.5 h-3 w-3" />
                        {editStartDate ? format(editStartDate, 'MMM d, yyyy') : 'Pick date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={editStartDate} onSelect={setEditStartDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">End Date</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn('w-full mt-1 justify-start text-left font-normal h-8 text-xs', !editEndDate && 'text-muted-foreground')}>
                        <CalendarIcon className="mr-1.5 h-3 w-3" />
                        {editEndDate ? format(editEndDate, 'MMM d, yyyy') : 'Pick date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={editEndDate} onSelect={setEditEndDate}
                        disabled={d => editStartDate ? d < editStartDate : false} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={savePlanEdit} disabled={!editName.trim()}>Save</Button>
                <Button size="sm" variant="ghost" onClick={cancelPlanEdit}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div
                className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl shadow-lg shrink-0"
                style={{ background: `linear-gradient(135deg, ${plan.color}, ${plan.color}80)` }}
              >
                {plan.icon}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold text-foreground">{plan.name}</h1>
                  <Select value={plan.status} onValueChange={(v) => handleStatusChange(v as 'planning' | 'active' | 'completed' | 'archived')}>
                    <SelectTrigger className="h-7 w-auto gap-1 border-none px-2 text-xs">
                      <Badge variant={cfg.variant}>{cfg.emoji} {cfg.label}</Badge>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusConfig).map(([key, c]) => (
                        <SelectItem key={key} value={key}>
                          <span className="flex items-center gap-1.5">{c.emoji} {c.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingPlan(true)}>
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
                {plan.description && <p className="text-sm text-muted-foreground mt-0.5">{plan.description}</p>}
                {(plan.start_date || plan.end_date) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {plan.start_date && format(new Date(plan.start_date), 'MMM d, yyyy')}
                    {plan.start_date && plan.end_date && ' → '}
                    {plan.end_date && format(new Date(plan.end_date), 'MMM d, yyyy')}
                  </p>
                )}
              </div>
            </div>
          )}
          <Button onClick={() => setShowAddPhase(true)} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" /> Add Phase
          </Button>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Phases', value: phases.length, emoji: '📋' },
          { label: 'Milestones', value: `${completedMilestones}/${totalMilestones}`, emoji: '🏁' },
          { label: 'Actions', value: `${completedActions}/${totalActions}`, emoji: '✅' },
          { label: 'KPIs Tracked', value: kpis.length, emoji: '📊' },
          { label: 'Progress', value: `${overallProgress}%`, emoji: '🚀' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border border-border/50 bg-card p-3 text-center">
            <span className="text-lg">{stat.emoji}</span>
            <div className="text-lg font-bold text-foreground mt-0.5">{stat.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Overall Progress Bar */}
      <div className="relative h-3 rounded-full bg-muted overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${overallProgress}%`,
            background: `linear-gradient(90deg, ${plan.color}, ${plan.color}cc)`,
          }}
        />
      </div>

      {/* Timeline Bar */}
      {phases.length > 0 && <TimelineBar phases={phases} planColor={plan.color} />}

      {/* Search bar */}
      {phases.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search phases, milestones, actions, notes..."
            className="pl-9 pr-8 h-9"
          />
          {searchQuery && (
            <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setSearchQuery('')}>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          )}
        </div>
      )}

      {/* Phase Cards */}
      {phases.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <div className="text-3xl mb-2">📌</div>
          <p className="font-medium">No phases yet</p>
          <p className="text-sm">Add your first phase to start building your roadmap.</p>
        </div>
      ) : visiblePhases.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No phases match "{searchQuery}"</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visiblePhases.map((phase, i) => (
            <PhaseCard
              key={phase.id}
              phase={phase}
              milestones={milestones.filter(m => m.phase_id === phase.id)}
              kpis={kpis.filter(k => k.phase_id === phase.id)}
              notes={notes.filter(n => n.phase_id === phase.id)}
              actions={actions.filter(a => a.phase_id === phase.id)}
              mutations={mutations}
              index={i}
              totalPhases={phases.length}
              onReorder={handleReorderPhase}
              onClone={handleClonePhase}
            />
          ))}
        </div>
      )}

      <AddPhaseDialog
        open={showAddPhase}
        onOpenChange={setShowAddPhase}
        planId={plan.id}
        nextOrder={phases.length}
        onCreate={async (data) => {
          await mutations.phases.create.mutateAsync(data);
          setShowAddPhase(false);
        }}
      />
    </div>
  );
}
