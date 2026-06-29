import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import {
  format,
  isToday,
  isTomorrow,
  isPast,
  differenceInDays,
  startOfDay,
  endOfDay,
  addDays,
  endOfWeek,
  endOfMonth,
} from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Bell,
  Plus,
  CalendarDays,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
  TrendingUp,
  Building2,
  ChevronRight,
  Filter,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAllReminders, type UnifiedReminder } from '@/hooks/useAllReminders';
import { TeamRemindersSection } from '@/components/reminders/TeamRemindersSection';
import { CreateReminderForm } from '@/components/reminders/CreateReminderForm';
import { ReminderActions } from '@/components/reminders/ReminderActions';
import { toast } from 'sonner';

type ReminderTab = 'client' | 'team';
type TimeFilter = 'all' | 'overdue' | 'today' | 'week' | 'month' | 'later';
type SourceFilter = 'all' | 'client_reminder' | 'follow_up' | 'deal_milestone';
type PriorityFilter = 'all' | 'high' | 'medium' | 'low';

const PRIORITY_CONFIG = {
  high: { label: 'High', color: 'bg-red-500/15 text-red-300 border-red-400/40 shadow-[0_0_18px_rgba(248,113,113,0.14)]' },
  medium: { label: 'Medium', color: 'bg-amber-500/15 text-amber-200 border-amber-300/35 shadow-[0_0_18px_rgba(245,158,11,0.12)]' },
  low: { label: 'Low', color: 'bg-emerald-500/10 text-emerald-200 border-emerald-300/30 shadow-[0_0_18px_rgba(16,185,129,0.10)]' },
};

const SOURCE_ICONS = {
  client_reminder: <Bell className="h-3.5 w-3.5" />,
  follow_up: <Users className="h-3.5 w-3.5" />,
  deal_milestone: <TrendingUp className="h-3.5 w-3.5" />,
};

const SOURCE_COLORS = {
  client_reminder: 'text-amber-200',
  follow_up: 'text-orange-200',
  deal_milestone: 'text-emerald-200',
};

const premiumPanel = 'border border-amber-400/10 bg-slate-950/80 shadow-[0_18px_55px_rgba(0,0,0,0.35)] backdrop-blur';
const interactivePanel = 'transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300/35 hover:shadow-[0_18px_45px_rgba(245,158,11,0.10)]';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  settlement: <Building2 className="h-3.5 w-3.5" />,
  finance: <TrendingUp className="h-3.5 w-3.5" />,
  clawback: <AlertTriangle className="h-3.5 w-3.5" />,
  construction: <Building2 className="h-3.5 w-3.5" />,
};

export default function RemindersHub() {
  const { canEdit: canEditReminders, canDelete: canDeleteReminders } = useModulePermissions('reminders');
  const { data: reminders = [], isLoading } = useAllReminders();
  const navigate = useNavigate();

  const [reminderTab, setReminderTab] = useState<ReminderTab>('client');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const monthEnd = endOfMonth(now);

  // Stats
  const stats = useMemo(() => {
    const overdue = reminders.filter(r => isPast(new Date(r.due_date)) && !isToday(new Date(r.due_date))).length;
    const today = reminders.filter(r => isToday(new Date(r.due_date))).length;
    const thisWeek = reminders.filter(r => {
      const d = new Date(r.due_date);
      return d >= todayStart && d <= weekEnd;
    }).length;
    const highPriority = reminders.filter(r => r.priority === 'high').length;
    return { overdue, today, thisWeek, total: reminders.length, highPriority };
  }, [reminders]);

  // Morning Briefing
  const briefing = useMemo(() => {
    const parts: string[] = [];
    if (stats.overdue > 0) parts.push(`${stats.overdue} overdue item${stats.overdue > 1 ? 's' : ''} need${stats.overdue === 1 ? 's' : ''} attention`);
    if (stats.today > 0) parts.push(`${stats.today} item${stats.today > 1 ? 's' : ''} due today`);

    const settlementsThisWeek = reminders.filter(r =>
      r.reminder_type === 'settlement' &&
      new Date(r.due_date) >= todayStart &&
      new Date(r.due_date) <= weekEnd
    ).length;
    if (settlementsThisWeek > 0) parts.push(`${settlementsThisWeek} settlement${settlementsThisWeek > 1 ? 's' : ''} this week`);

    const followUps = reminders.filter(r => r.source === 'follow_up' && new Date(r.due_date) <= todayEnd).length;
    if (followUps > 0) parts.push(`${followUps} client follow-up${followUps > 1 ? 's' : ''} pending`);

    if (parts.length === 0) return "You're all clear — no urgent items right now. 🎉";
    return parts.join(' · ');
  }, [reminders, stats]);

  // Filtered results
  const filtered = useMemo(() => {
    let result = [...reminders];

    // Source filter
    if (sourceFilter !== 'all') {
      result = result.filter(r => r.source === sourceFilter);
    }

    // Priority filter
    if (priorityFilter !== 'all') {
      result = result.filter(r => r.priority === priorityFilter);
    }

    // Time filter
    if (timeFilter !== 'all') {
      result = result.filter(r => {
        const d = new Date(r.due_date);
        switch (timeFilter) {
          case 'overdue': return isPast(d) && !isToday(d);
          case 'today': return isToday(d);
          case 'week': return d >= todayStart && d <= weekEnd;
          case 'month': return d >= todayStart && d <= monthEnd;
          case 'later': return d > monthEnd;
          default: return true;
        }
      });
    }

    return result;
  }, [reminders, timeFilter, sourceFilter, priorityFilter]);

  // Group by date
  const grouped = useMemo(() => {
    const groups: Record<string, UnifiedReminder[]> = {};
    for (const r of filtered) {
      const d = new Date(r.due_date);
      let key: string;
      if (isPast(d) && !isToday(d)) {
        key = '⚠️ Overdue';
      } else if (isToday(d)) {
        key = '📌 Today';
      } else if (isTomorrow(d)) {
        key = '📅 Tomorrow';
      } else if (d <= weekEnd) {
        key = '🗓️ This Week';
      } else if (d <= monthEnd) {
        key = '📆 This Month';
      } else {
        key = '🔮 Later';
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return groups;
  }, [filtered]);

  const groupOrder = ['⚠️ Overdue', '📌 Today', '📅 Tomorrow', '🗓️ This Week', '📆 This Month', '🔮 Later'];

  const handleReminderClick = (reminder: UnifiedReminder) => {
    if (reminder.client_id) {
      if (reminder.deal_id) {
        navigate(`/clients?clientId=${reminder.client_id}&tab=deals&dealId=${reminder.deal_id}`);
      } else {
        navigate(`/clients?clientId=${reminder.client_id}&tab=reminders`);
      }
      toast.info(`Opening ${reminder.client_name}`);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.10),transparent_34%),linear-gradient(180deg,#050505_0%,#0f1117_46%,#09090b_100%)] p-3 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 rounded-lg" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_32%),radial-gradient(circle_at_85%_0%,rgba(20,184,166,0.08),transparent_28%),linear-gradient(180deg,#050505_0%,#0f1117_48%,#09090b_100%)] p-3 text-slate-100 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-400/15 bg-black/35 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.36)] sm:p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
        <div className="flex items-center gap-3 sm:gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-400/10 shadow-[0_0_30px_rgba(245,158,11,0.18)]">
          <Bell className="h-5 w-5 text-amber-200 sm:h-6 sm:w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-3xl">Reminders Hub</h1>
          <p className="truncate text-xs text-slate-400 sm:text-sm">
            All reminders, follow-ups, and deal milestones in one place.
          </p>
        </div>
        </div>
      </div>

      {/* Morning Briefing Banner */}
      <Card className={cn(
        premiumPanel,
        stats.overdue > 0
          ? 'border-red-400/30 bg-red-950/20'
          : stats.today > 0
            ? 'border-amber-300/30 bg-amber-950/20'
            : 'border-emerald-300/25 bg-emerald-950/15'
      )}>
        <CardContent className="flex items-start gap-3 p-4 sm:p-5">
          <Sparkles className={cn(
            'h-4 w-4 sm:h-5 sm:w-5 mt-0.5 shrink-0',
            stats.overdue > 0 ? 'text-destructive' : stats.today > 0 ? 'text-amber-500' : 'text-primary'
          )} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1 text-slate-400">
              {format(now, 'EEEE, dd MMMM yyyy')}
            </p>
            <p className="text-sm font-medium text-slate-100 sm:text-base">{briefing}</p>
          </div>
        </CardContent>
      </Card>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
        <Card className={cn(premiumPanel, interactivePanel, stats.overdue > 0 && 'border-red-400/35 bg-red-950/15')}>
          <CardContent className="p-2.5 sm:p-3 text-center">
            <p className={cn('text-lg sm:text-2xl font-bold', stats.overdue > 0 ? 'text-destructive' : '')}>{stats.overdue}</p>
            <p className="text-[9px] sm:text-[10px] text-slate-400">Overdue</p>
          </CardContent>
        </Card>
        <Card className={cn(premiumPanel, interactivePanel, stats.today > 0 && 'border-amber-300/35 bg-amber-950/15')}>
          <CardContent className="p-2.5 sm:p-3 text-center">
            <p className={cn('text-lg sm:text-2xl font-bold', stats.today > 0 ? 'text-amber-300' : '')}>{stats.today}</p>
            <p className="text-[9px] sm:text-[10px] text-slate-400">Today</p>
          </CardContent>
        </Card>
        <Card className={cn(premiumPanel, interactivePanel)}>
          <CardContent className="p-2.5 sm:p-3 text-center">
            <p className="text-lg sm:text-2xl font-bold">{stats.thisWeek}</p>
            <p className="text-[9px] sm:text-[10px] text-slate-400">This Week</p>
          </CardContent>
        </Card>
        <Card className={cn(premiumPanel, interactivePanel)}>
          <CardContent className="p-2.5 sm:p-3 text-center">
            <p className="text-lg sm:text-2xl font-bold text-destructive">{stats.highPriority}</p>
            <p className="text-[9px] sm:text-[10px] text-slate-400">High Priority</p>
          </CardContent>
        </Card>
        <Card className={cn(premiumPanel, interactivePanel, "col-span-2 sm:col-span-1")}>
          <CardContent className="p-2.5 sm:p-3 text-center">
            <p className="text-lg sm:text-2xl font-bold">{stats.total}</p>
            <p className="text-[9px] sm:text-[10px] text-slate-400">Total Upcoming</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs: Client vs Team */}
      <Tabs value={reminderTab} onValueChange={(v) => setReminderTab(v as ReminderTab)} className="space-y-4">
        <TabsList className="border border-amber-400/10 bg-black/45 p-1 shadow-inner">
          <TabsTrigger value="client" className="gap-1.5 text-xs text-slate-300 data-[state=active]:bg-amber-400 data-[state=active]:text-black data-[state=active]:shadow-[0_0_24px_rgba(245,158,11,0.22)] sm:text-sm">
            <Bell className="h-3.5 w-3.5" />
            Client Reminders
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5 text-xs text-slate-300 data-[state=active]:bg-amber-400 data-[state=active]:text-black data-[state=active]:shadow-[0_0_24px_rgba(245,158,11,0.22)] sm:text-sm">
            <Users className="h-3.5 w-3.5" />
            Team Reminders
          </TabsTrigger>
        </TabsList>

        <TabsContent value="client" className="space-y-4">
          {/* Create Reminder Button / Form */}
          {canEditReminders && (
            showCreateForm ? (
              <div className="mb-4">
                <CreateReminderForm onClose={() => setShowCreateForm(false)} />
              </div>
            ) : (
              <Button
                onClick={() => setShowCreateForm(true)}
                variant="outline"
                className="mb-1 w-full gap-2 border-amber-300/25 bg-amber-400/10 text-amber-100 hover:border-amber-200/50 hover:bg-amber-400/20 hover:shadow-[0_0_30px_rgba(245,158,11,0.16)] focus-visible:ring-amber-300"
              >
                <Plus className="h-4 w-4" />
                Create Reminder
              </Button>
            )
          )}

          {/* Time Tabs + Filters Row */}
          <div className={cn(premiumPanel, "flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center sm:p-4")}>
            <Tabs value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)} className="flex-1">
              <TabsList className="inline-flex w-full justify-start overflow-x-auto border border-white/5 bg-black/35 p-1 scrollbar-thin scrollbar-track-slate-950 scrollbar-thumb-amber-500/30">
                <TabsTrigger value="all" className="text-xs text-slate-300 data-[state=active]:bg-amber-400 data-[state=active]:text-black sm:text-sm">All</TabsTrigger>
                <TabsTrigger value="overdue" className="text-xs text-slate-300 data-[state=active]:bg-amber-400 data-[state=active]:text-black sm:text-sm">
                  Overdue {stats.overdue > 0 && <Badge variant="destructive" className="ml-1 text-[9px] px-1 h-4">{stats.overdue}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="today" className="text-xs text-slate-300 data-[state=active]:bg-amber-400 data-[state=active]:text-black sm:text-sm">Today</TabsTrigger>
                <TabsTrigger value="week" className="text-xs text-slate-300 data-[state=active]:bg-amber-400 data-[state=active]:text-black sm:text-sm">This Week</TabsTrigger>
                <TabsTrigger value="month" className="text-xs text-slate-300 data-[state=active]:bg-amber-400 data-[state=active]:text-black sm:text-sm">This Month</TabsTrigger>
                <TabsTrigger value="later" className="text-xs text-slate-300 data-[state=active]:bg-amber-400 data-[state=active]:text-black sm:text-sm">Later</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex gap-2 shrink-0">
              <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
                <SelectTrigger className="h-9 w-[140px] border-amber-400/15 bg-black/40 text-xs text-slate-200 hover:border-amber-300/35 focus:ring-amber-300 sm:w-[160px]">
                  <Filter className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="client_reminder">Client Reminders</SelectItem>
                  <SelectItem value="follow_up">Follow-Ups</SelectItem>
                  <SelectItem value="deal_milestone">Deal Milestones</SelectItem>
                </SelectContent>
              </Select>

              <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as PriorityFilter)}>
                <SelectTrigger className="h-9 w-[110px] border-amber-400/15 bg-black/40 text-xs text-slate-200 hover:border-amber-300/35 focus:ring-amber-300 sm:w-[130px]">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Timeline Groups */}
          {filtered.length === 0 ? (
            <Card className={cn(premiumPanel, "border-dashed border-amber-300/20 bg-black/30")}>
              <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                <CheckCircle2 className="h-10 w-10 mb-3 text-emerald-300" />
                <p className="text-sm text-slate-400">No reminders match your filters</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5">
              {groupOrder.filter(g => grouped[g]).map(groupLabel => (
                <div key={groupLabel}>
                  <div className="mb-2 flex items-center gap-2 rounded-full border border-amber-400/10 bg-black/25 px-3 py-2">
                    <h3 className="text-sm font-semibold text-slate-100">{groupLabel}</h3>
                    <Badge variant="outline" className="border-amber-300/25 bg-amber-400/10 text-[10px] text-amber-100">{grouped[groupLabel].length}</Badge>
                  </div>

                  <div className="space-y-1.5">
                    {grouped[groupLabel].map(reminder => {
                      const isOverdue = isPast(new Date(reminder.due_date)) && !isToday(new Date(reminder.due_date));
                      const daysUntil = differenceInDays(new Date(reminder.due_date), now);
                      const priorityCfg = PRIORITY_CONFIG[reminder.priority];

                        return (
                          <Card
                            key={reminder.id}
                            className={cn(
                              premiumPanel, interactivePanel, 'group cursor-pointer overflow-hidden rounded-2xl',
                              isOverdue && 'border-red-400/35 bg-red-950/15',
                              isToday(new Date(reminder.due_date)) && !isOverdue && 'border-amber-300/30 bg-amber-950/15',
                            )}
                            onClick={() => handleReminderClick(reminder)}
                          >
                            <CardContent className="p-2.5 sm:p-3">
                              <div className="flex items-center gap-2.5">
                                {/* Source Icon */}
                                <div className={cn(
                                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 shadow-inner',
                                  isOverdue ? 'bg-red-500/15 text-red-200' : 'bg-white/5',
                                  !isOverdue && SOURCE_COLORS[reminder.source]
                                )}>
                                  {TYPE_ICONS[reminder.reminder_type] || SOURCE_ICONS[reminder.source]}
                                </div>

                                {/* Content */}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="truncate text-xs font-semibold text-slate-100 sm:text-sm">{reminder.title}</span>
                                    <Badge className={cn('text-[8px] px-1 py-0 h-3.5 border shrink-0', priorityCfg.color)}>
                                      {priorityCfg.label}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    <span className="text-[10px] text-slate-400">{reminder.client_name}</span>
                                    <span className="text-[10px] text-slate-400">·</span>
                                    <span className="text-[10px] text-slate-400">{reminder.source_label}</span>
                                    {reminder.description && (
                                      <>
                                        <span className="text-[10px] text-slate-400">·</span>
                                        <span className="text-[10px] text-slate-400 truncate max-w-[200px]">{reminder.description}</span>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Date */}
                                <div className="text-right shrink-0">
                                  <p className={cn(
                                    'text-[10px] sm:text-xs font-medium',
                                    isOverdue ? 'text-destructive' : isToday(new Date(reminder.due_date)) ? 'text-amber-300' : 'text-slate-400'
                                  )}>
                                    {isOverdue
                                      ? `${Math.abs(daysUntil)}d overdue`
                                      : isToday(new Date(reminder.due_date))
                                        ? 'Today'
                                        : isTomorrow(new Date(reminder.due_date))
                                          ? 'Tomorrow'
                                          : format(new Date(reminder.due_date), 'dd MMM')
                                    }
                                  </p>
                                  <p className="text-[9px] text-slate-400">
                                    {format(new Date(reminder.due_date), 'EEE')}
                                  </p>
                                </div>

                                {/* Actions */}
                                <ReminderActions
                                  reminderId={reminder.id}
                                  rawId={reminder.raw_id}
                                  title={reminder.title}
                                  description={reminder.description}
                                  dueDate={reminder.due_date}
                                  priority={reminder.priority}
                                  source={reminder.source}
                                  canEdit={canEditReminders}
                                  canDelete={canDeleteReminders}
                                />
                              </div>
                            </CardContent>
                          </Card>
                        );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="team">
          <TeamRemindersSection />
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
