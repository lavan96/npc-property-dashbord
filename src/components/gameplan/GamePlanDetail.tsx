import { useState } from 'react';
import { type GamePlan, useGamePlanPhases, useGamePlanMilestones, useGamePlanKPIs, useGamePlanNotes, useGamePlanActions, useGamePlanMutations } from '@/hooks/useGamePlans';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { PhaseCard } from './PhaseCard';
import { TimelineBar } from './TimelineBar';
import { AddPhaseDialog } from './AddPhaseDialog';

interface Props {
  plan: GamePlan;
  onBack: () => void;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  planning: { label: 'Planning', variant: 'outline' },
  active: { label: 'Active', variant: 'default' },
  completed: { label: 'Completed', variant: 'secondary' },
  archived: { label: 'Archived', variant: 'destructive' },
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

  const cfg = statusConfig[plan.status] || statusConfig.planning;

  // Calculate overall progress
  const totalMilestones = milestones.length;
  const completedMilestones = milestones.filter(m => m.status === 'completed').length;
  const overallProgress = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-3 gap-1.5 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Game Plans
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl shadow-lg"
              style={{ background: `linear-gradient(135deg, ${plan.color}, ${plan.color}80)` }}
            >
              {plan.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">{plan.name}</h1>
                <Badge variant={cfg.variant}>{cfg.label}</Badge>
              </div>
              {plan.description && <p className="text-sm text-muted-foreground mt-0.5">{plan.description}</p>}
            </div>
          </div>
          <Button onClick={() => setShowAddPhase(true)} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" /> Add Phase
          </Button>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Phases', value: phases.length, emoji: '📋' },
          { label: 'Milestones', value: `${completedMilestones}/${totalMilestones}`, emoji: '🏁' },
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

      {/* Phase Cards */}
      {phases.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <div className="text-3xl mb-2">📌</div>
          <p className="font-medium">No phases yet</p>
          <p className="text-sm">Add your first phase to start building your roadmap.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {phases.map((phase, i) => (
            <PhaseCard
              key={phase.id}
              phase={phase}
              milestones={milestones.filter(m => m.phase_id === phase.id)}
              kpis={kpis.filter(k => k.phase_id === phase.id)}
              notes={notes.filter(n => n.phase_id === phase.id)}
              actions={actions.filter(a => a.phase_id === phase.id)}
              mutations={mutations}
              index={i}
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
