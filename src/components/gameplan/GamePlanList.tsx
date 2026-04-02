import { type GamePlan } from '@/hooks/useGamePlans';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, Calendar, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  planning: { label: 'Planning', variant: 'outline' },
  active: { label: 'Active', variant: 'default' },
  completed: { label: 'Completed', variant: 'secondary' },
  archived: { label: 'Archived', variant: 'destructive' },
};

interface Props {
  plans: GamePlan[];
  isLoading: boolean;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function GamePlanList({ plans, isLoading, onSelect, onDelete }: Props) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!plans.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-4xl mb-3">🎯</div>
          <h3 className="text-lg font-semibold text-foreground">No game plans yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Create your first strategic playbook to get started.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan, i) => {
        const cfg = statusConfig[plan.status] || statusConfig.planning;
        return (
          <Card
            key={plan.id}
            className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border-border/50"
            style={{ animationDelay: `${i * 80}ms` }}
            onClick={() => onSelect(plan.id)}
          >
            {/* Top gradient accent */}
            <div
              className="absolute top-0 left-0 right-0 h-1.5 rounded-t-xl"
              style={{ background: `linear-gradient(90deg, ${plan.color}, ${plan.color}80)` }}
            />
            <CardContent className="pt-5 pb-4 px-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{plan.icon}</span>
                  <div>
                    <h3 className="font-semibold text-foreground line-clamp-1">{plan.name}</h3>
                    {plan.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{plan.description}</p>
                    )}
                  </div>
                </div>
                <Badge variant={cfg.variant} className="text-[10px] shrink-0">{cfg.label}</Badge>
              </div>

              {(plan.start_date || plan.end_date) && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                  <Calendar className="h-3 w-3" />
                  {plan.start_date && format(new Date(plan.start_date), 'MMM d, yyyy')}
                  {plan.start_date && plan.end_date && ' → '}
                  {plan.end_date && format(new Date(plan.end_date), 'MMM d, yyyy')}
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  Created {format(new Date(plan.created_at), 'MMM d, yyyy')}
                </span>
                <div className="flex items-center gap-1">
                  {onDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); onDelete(plan.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
