import { useState, useMemo } from 'react';
import { useAssignedTasks, type AssignedTask } from '@/hooks/useAssignedTasks';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useGamePlanMutations } from '@/hooks/useGamePlans';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { toast } from 'sonner';
import { format, isPast, isToday, isTomorrow, differenceInDays } from 'date-fns';
import {
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar,
  Map,
  Bell,
  ListChecks,
  Filter,
  Loader2,
} from 'lucide-react';

type StatusFilter = 'all' | 'pending' | 'overdue' | 'completed';
type SourceFilter = 'all' | 'game_plan' | 'reminder';

const STATUS_CONFIG: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  pending: { icon: Clock, color: 'text-amber-500', label: 'Pending' },
  in_progress: { icon: Clock, color: 'text-blue-500', label: 'In Progress' },
  overdue: { icon: AlertTriangle, color: 'text-red-500', label: 'Overdue' },
  completed: { icon: CheckCircle2, color: 'text-emerald-500', label: 'Completed' },
};

const SOURCE_CONFIG: Record<string, { icon: typeof Map; color: string; label: string }> = {
  game_plan: { icon: Map, color: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20', label: 'Game Plan' },
  reminder: { icon: Bell, color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', label: 'Reminder' },
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500/10 text-red-600 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  low: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
};

function formatDueDate(date: string | null) {
  if (!date) return null;
  const d = new Date(date);
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  const diff = differenceInDays(d, new Date());
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff <= 7) return `${diff}d left`;
  return format(d, 'dd MMM yyyy');
}

export function AssignedTasksTab() {
  const { data: tasks = [], isLoading, refetch } = useAssignedTasks();
  const { actions: actionMut } = useGamePlanMutations();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let result = [...tasks];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.sourceContext?.toLowerCase().includes(q)
      );
    }
    if (statusFilter === 'pending') result = result.filter((t) => t.status === 'pending' || t.status === 'in_progress');
    else if (statusFilter !== 'all') result = result.filter((t) => t.status === statusFilter);
    if (sourceFilter !== 'all') result = result.filter((t) => t.source === sourceFilter);
    return result;
  }, [tasks, search, statusFilter, sourceFilter]);

  const counts = useMemo(() => {
    const c = { total: tasks.length, pending: 0, overdue: 0, completed: 0 };
    tasks.forEach((t) => {
      if (t.status === 'overdue') c.overdue++;
      else if (t.status === 'completed') c.completed++;
      else c.pending++;
    });
    return c;
  }, [tasks]);

  const handleToggleComplete = async (task: AssignedTask) => {
    const toggleKey = task.id;
    setTogglingIds((prev) => new Set(prev).add(toggleKey));
    try {
      if (task.source === 'game_plan') {
        const rawId = task.rawRecord.id;
        const newDone = !task.rawRecord.is_done;
        await actionMut.update.mutateAsync({
          id: rawId,
          is_done: newDone,
          completed_at: newDone ? new Date().toISOString() : null,
        });
      } else if (task.source === 'reminder') {
        const rawId = task.rawRecord.id;
        const newStatus = task.rawRecord.status === 'completed' ? 'pending' : 'completed';
        await invokeSecureFunction('manage-templates', {
          operation: 'update',
          table: 'client_reminders',
          recordId: rawId,
          data: {
            status: newStatus,
            completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
          },
        });
      }
      toast.success(task.status === 'completed' ? 'Task reopened' : 'Task completed');
      refetch();
    } catch (e: any) {
      toast.error('Failed to update task');
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(toggleKey);
        return next;
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-4 bg-muted rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Assigned', value: counts.total, icon: ListChecks, color: 'text-foreground' },
          { label: 'Pending', value: counts.pending, icon: Clock, color: 'text-amber-500' },
          { label: 'Overdue', value: counts.overdue, icon: AlertTriangle, color: 'text-red-500' },
          { label: 'Completed', value: counts.completed, icon: CheckCircle2, color: 'text-emerald-500' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-3 flex items-center gap-3">
              <stat.icon className={`h-5 w-5 ${stat.color} shrink-0`} />
              <div>
                <p className="text-lg font-bold">{stat.value}</p>
                <p className="text-[10px] text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v: StatusFilter) => setStatusFilter(v)}>
          <SelectTrigger className="w-[140px] h-9">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={(v: SourceFilter) => setSourceFilter(v)}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="game_plan">Game Plans</SelectItem>
            <SelectItem value="reminder">Reminders</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Task List */}
      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-3">
            <ListChecks className="h-10 w-10 text-muted-foreground" />
            <div className="text-center space-y-1">
              <h3 className="font-semibold">No assigned tasks</h3>
              <p className="text-sm text-muted-foreground">
                {tasks.length > 0
                  ? 'No tasks match your current filters.'
                  : 'Tasks assigned to you from Game Plans and Reminders will appear here.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => {
            const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
            const sourceCfg = SOURCE_CONFIG[task.source];
            const StatusIcon = statusCfg.icon;
            const SourceIcon = sourceCfg.icon;
            const isToggling = togglingIds.has(task.id);
            const dueDateLabel = formatDueDate(task.dueDate);

            return (
              <Card
                key={task.id}
                className={`transition-all duration-200 hover:shadow-md ${
                  task.status === 'overdue'
                    ? 'border-red-500/30 bg-red-500/5'
                    : task.status === 'completed'
                    ? 'opacity-60'
                    : ''
                }`}
              >
                <CardContent className="p-3 sm:p-4 flex items-start gap-3">
                  {/* Completion toggle */}
                  <div className="pt-0.5">
                    {isToggling ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Checkbox
                        checked={task.status === 'completed'}
                        onCheckedChange={() => handleToggleComplete(task)}
                        className="h-4.5 w-4.5"
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`text-sm font-medium leading-tight ${
                          task.status === 'completed' ? 'line-through text-muted-foreground' : ''
                        }`}
                      >
                        {task.title}
                      </p>
                      <StatusIcon className={`h-4 w-4 shrink-0 ${statusCfg.color}`} />
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${sourceCfg.color}`}>
                        <SourceIcon className="h-3 w-3 mr-1" />
                        {sourceCfg.label}
                      </Badge>
                      {task.priority && (
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${PRIORITY_COLORS[task.priority] || ''}`}>
                          {task.priority}
                        </Badge>
                      )}
                      {task.sourceContext && (
                        <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                          {task.sourceContext}
                        </span>
                      )}
                    </div>

                    {dueDateLabel && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span
                          className={`text-[11px] ${
                            task.status === 'overdue'
                              ? 'text-red-500 font-medium'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {dueDateLabel}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
