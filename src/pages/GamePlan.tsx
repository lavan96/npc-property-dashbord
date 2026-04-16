import { useState } from 'react';
import { useGamePlans, useGamePlanMutations, type GamePlan as GamePlanType } from '@/hooks/useGamePlans';
import { useAssignedTasks } from '@/hooks/useAssignedTasks';
import { GamePlanList } from '@/components/gameplan/GamePlanList';
import { GamePlanDetail } from '@/components/gameplan/GamePlanDetail';
import { CreatePlanDialog } from '@/components/gameplan/CreatePlanDialog';
import { AssignedTasksTab } from '@/components/gameplan/AssignedTasksTab';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Map, ListChecks } from 'lucide-react';
import { useModulePermissions } from '@/hooks/useModulePermissions';

export default function GamePlan() {
  const { data: plans = [], isLoading } = useGamePlans();
  const { data: assignedTasks = [] } = useAssignedTasks();
  const { plans: planMut } = useGamePlanMutations();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState('plans');
  const { canEdit, canDelete } = useModulePermissions('game_plans');

  const selectedPlan = plans.find(p => p.id === selectedPlanId);

  // Count outstanding (non-completed) assigned tasks for badge
  const outstandingCount = assignedTasks.filter(t => t.status !== 'completed').length;

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
        {canEdit && activeTab === 'plans' && (
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Game Plan
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="plans" className="gap-1.5">
            <Map className="h-4 w-4" />
            Game Plans
          </TabsTrigger>
          <TabsTrigger value="assigned" className="gap-1.5">
            <ListChecks className="h-4 w-4" />
            Assigned Tasks
            {outstandingCount > 0 && (
              <Badge
                variant="destructive"
                className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px] font-bold rounded-full"
              >
                {outstandingCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="mt-4">
          <GamePlanList
            plans={plans}
            isLoading={isLoading}
            onSelect={setSelectedPlanId}
            onDelete={canDelete ? (id) => planMut.remove.mutateAsync(id) : undefined}
          />
        </TabsContent>

        <TabsContent value="assigned" className="mt-4">
          <AssignedTasksTab />
        </TabsContent>
      </Tabs>

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
