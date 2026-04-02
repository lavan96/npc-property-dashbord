import { useState } from 'react';
import { useGamePlans, useGamePlanMutations, type GamePlan as GamePlanType } from '@/hooks/useGamePlans';
import { GamePlanList } from '@/components/gameplan/GamePlanList';
import { GamePlanDetail } from '@/components/gameplan/GamePlanDetail';
import { CreatePlanDialog } from '@/components/gameplan/CreatePlanDialog';
import { Button } from '@/components/ui/button';
import { Plus, Map } from 'lucide-react';
import { useModulePermissions } from '@/hooks/useModulePermissions';

export default function GamePlan() {
  const { data: plans = [], isLoading } = useGamePlans();
  const { plans: planMut } = useGamePlanMutations();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const { canEdit, canDelete } = useModulePermissions('game_plans');

  const selectedPlan = plans.find(p => p.id === selectedPlanId);

  if (selectedPlan) {
    return <GamePlanDetail plan={selectedPlan} onBack={() => setSelectedPlanId(null)} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
            <Map className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Game Plans</h1>
            <p className="text-sm text-muted-foreground">Strategic playbooks for your team</p>
          </div>
        </div>
        {canEdit && (
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Game Plan
          </Button>
        )}
      </div>

      {/* Plans Grid */}
      <GamePlanList
        plans={plans}
        isLoading={isLoading}
        onSelect={setSelectedPlanId}
        onDelete={canDelete ? (id) => planMut.remove.mutateAsync(id) : undefined}
      />

      {canEdit && (
        <CreatePlanDialog
          open={showCreate}
          onOpenChange={setShowCreate}
          onCreate={async (data) => {
            await planMut.create.mutateAsync(data);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}
