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
        <div className="relative overflow-hidden rounded-[1.75rem] border border-amber-400/15 bg-[linear-gradient(135deg,rgba(245,158,11,0.10),rgba(0,0,0,0.62)_34%,rgba(15,23,42,0.50))] p-4 shadow-[0_26px_80px_rgba(0,0,0,0.40)] backdrop-blur sm:p-6">
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/80 to-transparent" />
          <div className="pointer-events-none absolute -right-16 -top-24 h-44 w-44 rounded-full bg-amber-300/10 blur-3xl" />
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-300/30 bg-gradient-to-br from-amber-300/20 via-amber-500/10 to-black/20 shadow-[0_0_34px_rgba(245,158,11,0.22)] sm:h-14 sm:w-14">
              <div className="absolute inset-1 rounded-[1rem] border border-white/5" />
              <Bell className="relative h-5 w-5 text-amber-100 drop-shadow-[0_0_12px_rgba(245,158,11,0.45)] sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-100/90">
                Daily command hub
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-4xl">Reminders Hub</h1>
              <p className="truncate text-sm leading-6 text-slate-300 sm:text-base">
                All reminders, follow-ups, and deal milestones in one place.
              </p>
            </div>
          </div>
        </div>

        {/* Morning Briefing Banner */}
        <Card
          className={cn(
            premiumPanel,
            'relative overflow-hidden rounded-[1.5rem]',
            stats.overdue > 0
              ? 'border-red-400/35 bg-[linear-gradient(135deg,rgba(127,29,29,0.32),rgba(5,5,5,0.92)_48%,rgba(69,10,10,0.20))]'
              : stats.today > 0
                ? 'border-amber-300/35 bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(5,5,5,0.92)_48%,rgba(120,53,15,0.18))]'
                : 'border-emerald-300/25 bg-[linear-gradient(135deg,rgba(16,185,129,0.16),rgba(5,5,5,0.92)_46%,rgba(245,158,11,0.08))]'
          )}
        >
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/70 to-transparent" />
          <div
            className={cn(
              'pointer-events-none absolute -right-10 -top-16 h-32 w-32 rounded-full blur-3xl',
              stats.overdue > 0 ? 'bg-red-500/10' : stats.today > 0 ? 'bg-amber-400/12' : 'bg-emerald-400/12'
            )}
          />
          <CardContent className="relative flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4 sm:p-5">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-inner',
                stats.overdue > 0
                  ? 'border-red-300/30 bg-red-500/15 text-red-200'
                  : stats.today > 0
                    ? 'border-amber-300/30 bg-amber-400/15 text-amber-200'
                    : 'border-emerald-300/25 bg-emerald-400/12 text-emerald-200'
              )}
            >
              <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                {format(now, 'EEEE, dd MMMM yyyy')}
              </p>
              <p className="max-w-5xl whitespace-normal break-words text-sm font-medium leading-6 text-slate-100 sm:text-base sm:leading-7">
                {briefing}
              </p>
            </div>
          </CardContent>
        </Card>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
        <Card className={cn(premiumPanel, interactivePanel, 'group relative overflow-hidden rounded-2xl', stats.overdue > 0 ? 'border-red-400/35 bg-red-950/15' : 'hover:border-amber-300/30')}>
          <CardContent className="relative p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Overdue</p>
              <div className={cn('flex h-8 w-8 items-center justify-center rounded-xl border', stats.overdue > 0 ? 'border-red-300/30 bg-red-500/15 text-red-200' : 'border-white/10 bg-white/5 text-slate-400')}>
                <AlertTriangle className="h-4 w-4" />
              </div>
            </div>
            <p className={cn('text-3xl font-bold tracking-tight sm:text-4xl', stats.overdue > 0 ? 'text-red-300' : 'text-slate-100')}>{stats.overdue}</p>
            <div className={cn('mt-3 h-0.5 rounded-full transition-all duration-200 group-hover:shadow-[0_0_18px_rgba(245,158,11,0.35)]', stats.overdue > 0 ? 'bg-red-400/60' : 'bg-amber-300/25')} />
          </CardContent>
        </Card>
        <Card className={cn(premiumPanel, interactivePanel, 'group relative overflow-hidden rounded-2xl', stats.today > 0 ? 'border-amber-300/35 bg-amber-950/15' : 'hover:border-amber-300/30')}>
          <CardContent className="relative p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Today</p>
              <div className={cn('flex h-8 w-8 items-center justify-center rounded-xl border', stats.today > 0 ? 'border-amber-300/30 bg-amber-400/15 text-amber-200' : 'border-white/10 bg-white/5 text-slate-400')}>
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <p className={cn('text-3xl font-bold tracking-tight sm:text-4xl', stats.today > 0 ? 'text-amber-300' : 'text-slate-100')}>{stats.today}</p>
            <div className="mt-3 h-0.5 rounded-full bg-amber-300/35 transition-all duration-200 group-hover:shadow-[0_0_18px_rgba(245,158,11,0.35)]" />
          </CardContent>
        </Card>
        <Card className={cn(premiumPanel, interactivePanel, 'group relative overflow-hidden rounded-2xl hover:border-amber-300/30')}>
          <CardContent className="relative p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">This Week</p>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-400/10 text-sky-200">
                <CalendarDays className="h-4 w-4" />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight text-slate-100 sm:text-4xl">{stats.thisWeek}</p>
            <div className="mt-3 h-0.5 rounded-full bg-sky-300/30 transition-all duration-200 group-hover:shadow-[0_0_18px_rgba(245,158,11,0.35)]" />
          </CardContent>
        </Card>
        <Card className={cn(premiumPanel, interactivePanel, 'group relative overflow-hidden rounded-2xl', stats.highPriority > 0 ? 'border-red-400/35 bg-red-950/15' : 'hover:border-amber-300/30')}>
          <CardContent className="relative p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">High Priority</p>
              <div className={cn('flex h-8 w-8 items-center justify-center rounded-xl border', stats.highPriority > 0 ? 'border-red-300/30 bg-red-500/15 text-red-200' : 'border-white/10 bg-white/5 text-slate-400')}>
                <Sparkles className="h-4 w-4" />
              </div>
            </div>
            <p className={cn('text-3xl font-bold tracking-tight sm:text-4xl', stats.highPriority > 0 ? 'text-red-300' : 'text-slate-100')}>{stats.highPriority}</p>
            <div className={cn('mt-3 h-0.5 rounded-full transition-all duration-200 group-hover:shadow-[0_0_18px_rgba(245,158,11,0.35)]', stats.highPriority > 0 ? 'bg-red-400/60' : 'bg-amber-300/25')} />
          </CardContent>
        </Card>
        <Card className={cn(premiumPanel, interactivePanel, 'group relative col-span-2 overflow-hidden rounded-2xl hover:border-amber-300/30 sm:col-span-1')}>
          <CardContent className="relative p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Total Upcoming</p>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-200">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight text-slate-100 sm:text-4xl">{stats.total}</p>
            <div className="mt-3 h-0.5 rounded-full bg-emerald-300/30 transition-all duration-200 group-hover:shadow-[0_0_18px_rgba(245,158,11,0.35)]" />
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs: Client vs Team */}
      <Tabs value={reminderTab} onValueChange={(v) => setReminderTab(v as ReminderTab)} className="space-y-4">
        <TabsList className="relative grid h-auto w-full grid-cols-2 gap-1.5 overflow-hidden rounded-2xl border border-amber-300/15 bg-[linear-gradient(135deg,rgba(0,0,0,0.72),rgba(15,23,42,0.78))] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_45px_rgba(0,0,0,0.32)] backdrop-blur sm:inline-grid sm:w-auto sm:min-w-[430px]">
          <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/50 to-transparent" />
          <TabsTrigger
            value="client"
            className="group relative h-11 rounded-xl border border-transparent px-3 text-xs font-semibold text-slate-300 transition-all duration-200 hover:border-amber-300/20 hover:bg-amber-400/10 hover:text-amber-100 focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black data-[state=active]:border-amber-200/45 data-[state=active]:bg-[linear-gradient(135deg,#fbbf24,#d97706)] data-[state=active]:text-black data-[state=active]:shadow-[0_0_28px_rgba(245,158,11,0.28),inset_0_1px_0_rgba(255,255,255,0.45)] sm:h-12 sm:px-5 sm:text-sm"
          >
            <span className="flex min-w-0 items-center justify-center gap-2">
              <Bell className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=active]:scale-105" />
              <span className="truncate">Client Reminders</span>
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="team"
            className="group relative h-11 rounded-xl border border-transparent px-3 text-xs font-semibold text-slate-300 transition-all duration-200 hover:border-amber-300/20 hover:bg-amber-400/10 hover:text-amber-100 focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black data-[state=active]:border-amber-200/45 data-[state=active]:bg-[linear-gradient(135deg,#fbbf24,#d97706)] data-[state=active]:text-black data-[state=active]:shadow-[0_0_28px_rgba(245,158,11,0.28),inset_0_1px_0_rgba(255,255,255,0.45)] sm:h-12 sm:px-5 sm:text-sm"
          >
            <span className="flex min-w-0 items-center justify-center gap-2">
              <Users className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=active]:scale-105" />
              <span className="truncate">Team Reminders</span>
            </span>
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
                className="group relative mb-1 h-12 w-full overflow-hidden rounded-2xl border-amber-300/35 bg-[linear-gradient(135deg,rgba(251,191,36,0.22),rgba(245,158,11,0.10),rgba(0,0,0,0.40))] text-sm font-semibold text-amber-50 shadow-[0_14px_36px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.10)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-200/70 hover:bg-amber-400/20 hover:text-white hover:shadow-[0_0_38px_rgba(245,158,11,0.22),0_18px_42px_rgba(0,0,0,0.32)] focus-visible:ring-2 focus-visible:ring-amber-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-60 sm:h-14"
              >
                <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/70 to-transparent opacity-80" />
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-100/30 bg-amber-300/20 shadow-inner transition-all duration-200 group-hover:scale-105 group-hover:bg-amber-300/30">
                  <Plus className="h-4 w-4 text-amber-50" />
                </span>
                <span>Create Reminder</span>
              </Button>
            )
          )}

          {/* Time Tabs + Filters Row */}
          <div className={cn(premiumPanel, "flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center sm:p-4")}>
            <Tabs value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)} className="flex-1">
              <TabsList className="relative inline-flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl border border-amber-300/10 bg-[linear-gradient(135deg,rgba(0,0,0,0.58),rgba(15,23,42,0.58))] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] scrollbar-thin scrollbar-track-slate-950 scrollbar-thumb-amber-500/30">
                <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/45 to-transparent" />
                <TabsTrigger value="all" className="h-9 min-w-16 rounded-xl border border-transparent px-3 text-xs font-semibold text-slate-300 transition-all duration-200 hover:border-amber-300/20 hover:bg-amber-400/10 hover:text-amber-100 focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black data-[state=active]:border-amber-200/45 data-[state=active]:bg-[linear-gradient(135deg,#fbbf24,#d97706)] data-[state=active]:text-black data-[state=active]:shadow-[0_0_22px_rgba(245,158,11,0.22),inset_0_1px_0_rgba(255,255,255,0.35)] sm:h-10 sm:min-w-20 sm:text-sm">All</TabsTrigger>
                <TabsTrigger value="overdue" className="h-9 min-w-24 rounded-xl border border-transparent px-3 text-xs font-semibold text-slate-300 transition-all duration-200 hover:border-red-300/20 hover:bg-red-400/10 hover:text-red-100 focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black data-[state=active]:border-amber-200/45 data-[state=active]:bg-[linear-gradient(135deg,#fbbf24,#d97706)] data-[state=active]:text-black data-[state=active]:shadow-[0_0_22px_rgba(245,158,11,0.22),inset_0_1px_0_rgba(255,255,255,0.35)] sm:h-10 sm:min-w-28 sm:text-sm">
                  Overdue {stats.overdue > 0 && <Badge variant="destructive" className="ml-1 h-4 px-1 text-[9px] shadow-[0_0_12px_rgba(248,113,113,0.28)]">{stats.overdue}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="today" className="h-9 min-w-20 rounded-xl border border-transparent px-3 text-xs font-semibold text-slate-300 transition-all duration-200 hover:border-amber-300/20 hover:bg-amber-400/10 hover:text-amber-100 focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black data-[state=active]:border-amber-200/45 data-[state=active]:bg-[linear-gradient(135deg,#fbbf24,#d97706)] data-[state=active]:text-black data-[state=active]:shadow-[0_0_22px_rgba(245,158,11,0.22),inset_0_1px_0_rgba(255,255,255,0.35)] sm:h-10 sm:min-w-24 sm:text-sm">Today</TabsTrigger>
                <TabsTrigger value="week" className="h-9 min-w-28 rounded-xl border border-transparent px-3 text-xs font-semibold text-slate-300 transition-all duration-200 hover:border-amber-300/20 hover:bg-amber-400/10 hover:text-amber-100 focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black data-[state=active]:border-amber-200/45 data-[state=active]:bg-[linear-gradient(135deg,#fbbf24,#d97706)] data-[state=active]:text-black data-[state=active]:shadow-[0_0_22px_rgba(245,158,11,0.22),inset_0_1px_0_rgba(255,255,255,0.35)] sm:h-10 sm:min-w-32 sm:text-sm">This Week</TabsTrigger>
                <TabsTrigger value="month" className="h-9 min-w-28 rounded-xl border border-transparent px-3 text-xs font-semibold text-slate-300 transition-all duration-200 hover:border-amber-300/20 hover:bg-amber-400/10 hover:text-amber-100 focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black data-[state=active]:border-amber-200/45 data-[state=active]:bg-[linear-gradient(135deg,#fbbf24,#d97706)] data-[state=active]:text-black data-[state=active]:shadow-[0_0_22px_rgba(245,158,11,0.22),inset_0_1px_0_rgba(255,255,255,0.35)] sm:h-10 sm:min-w-32 sm:text-sm">This Month</TabsTrigger>
                <TabsTrigger value="later" className="h-9 min-w-20 rounded-xl border border-transparent px-3 text-xs font-semibold text-slate-300 transition-all duration-200 hover:border-amber-300/20 hover:bg-amber-400/10 hover:text-amber-100 focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black data-[state=active]:border-amber-200/45 data-[state=active]:bg-[linear-gradient(135deg,#fbbf24,#d97706)] data-[state=active]:text-black data-[state=active]:shadow-[0_0_22px_rgba(245,158,11,0.22),inset_0_1px_0_rgba(255,255,255,0.35)] sm:h-10 sm:min-w-24 sm:text-sm">Later</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">
              <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
                <SelectTrigger
                  className={cn(
                    'h-10 min-w-[145px] flex-1 rounded-xl border bg-black/45 px-3 text-xs font-semibold text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-200 hover:border-amber-300/35 hover:bg-amber-400/10 hover:text-amber-100 focus:ring-2 focus:ring-amber-300/70 focus:ring-offset-2 focus:ring-offset-black sm:h-11 sm:w-[170px] sm:flex-none',
                    sourceFilter !== 'all'
                      ? 'border-amber-300/45 bg-amber-400/12 text-amber-100 shadow-[0_0_22px_rgba(245,158,11,0.14)]'
                      : 'border-amber-400/15'
                  )}
                >
                  <Filter className="mr-2 h-3.5 w-3.5 shrink-0 text-amber-200/80" />
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-amber-300/20 bg-slate-950/95 p-1 text-slate-100 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur">
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="client_reminder">Client Reminders</SelectItem>
                  <SelectItem value="follow_up">Follow-Ups</SelectItem>
                  <SelectItem value="deal_milestone">Deal Milestones</SelectItem>
                </SelectContent>
              </Select>

              <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as PriorityFilter)}>
                <SelectTrigger
                  className={cn(
                    'h-10 min-w-[130px] flex-1 rounded-xl border bg-black/45 px-3 text-xs font-semibold text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-200 hover:border-amber-300/35 hover:bg-amber-400/10 hover:text-amber-100 focus:ring-2 focus:ring-amber-300/70 focus:ring-offset-2 focus:ring-offset-black sm:h-11 sm:w-[150px] sm:flex-none',
                    priorityFilter !== 'all'
                      ? 'border-amber-300/45 bg-amber-400/12 text-amber-100 shadow-[0_0_22px_rgba(245,158,11,0.14)]'
                      : 'border-amber-400/15'
                  )}
                >
                  <Sparkles className="mr-2 h-3.5 w-3.5 shrink-0 text-amber-200/80" />
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-amber-300/20 bg-slate-950/95 p-1 text-slate-100 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur">
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
            <Card
              className={cn(
                premiumPanel,
                "relative overflow-hidden rounded-2xl border-dashed bg-[linear-gradient(135deg,rgba(245,158,11,0.08),rgba(0,0,0,0.45))]",
                timeFilter === 'overdue' ? 'border-emerald-300/25' : 'border-amber-300/25'
              )}
            >
              <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/60 to-transparent" />
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-200 shadow-[0_0_28px_rgba(16,185,129,0.12)]">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium text-slate-300">No reminders match your filters</p>
                {timeFilter === 'overdue' && (
                  <p className="mt-1 text-xs text-emerald-200/75">No overdue items are waiting for action.</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5">
              {groupOrder.filter(g => grouped[g]).map(groupLabel => {
                const isOverdueGroup = groupLabel.includes('Overdue');

                return (
                <div key={groupLabel}>
                  <div className={cn(
                    'mb-3 flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
                    isOverdueGroup
                      ? 'border-red-300/25 bg-[linear-gradient(135deg,rgba(127,29,29,0.22),rgba(15,23,42,0.42))]'
                      : 'border-amber-400/12 bg-[linear-gradient(135deg,rgba(0,0,0,0.42),rgba(15,23,42,0.42))]'
                  )}>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={cn(
                        'h-2 w-2 rounded-full',
                        isOverdueGroup
                          ? 'bg-red-300 shadow-[0_0_12px_rgba(248,113,113,0.45)]'
                          : 'bg-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.55)]'
                      )} />
                      <h3 className="truncate text-sm font-semibold text-slate-100">{groupLabel}</h3>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        'shrink-0 text-[10px] font-semibold shadow-[0_0_16px_rgba(245,158,11,0.10)]',
                        isOverdueGroup
                          ? 'border-red-300/30 bg-red-400/10 text-red-100'
                          : 'border-amber-300/30 bg-amber-400/10 text-amber-100'
                      )}
                    >
                      {grouped[groupLabel].length}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    {grouped[groupLabel].map(reminder => {
                      const isOverdue = isPast(new Date(reminder.due_date)) && !isToday(new Date(reminder.due_date));
                      const daysUntil = differenceInDays(new Date(reminder.due_date), now);
                      const priorityCfg = PRIORITY_CONFIG[reminder.priority];

                        return (
                          <Card
                            key={reminder.id}
                            className={cn(
                              premiumPanel, interactivePanel, 'group relative cursor-pointer overflow-hidden rounded-2xl hover:bg-amber-400/[0.035]',
                              isOverdue && 'border-red-300/35 bg-[linear-gradient(135deg,rgba(127,29,29,0.20),rgba(2,6,23,0.88))] hover:bg-red-500/[0.055]',
                              isToday(new Date(reminder.due_date)) && !isOverdue && 'border-amber-300/30 bg-amber-950/15',
                            )}
                            onClick={() => handleReminderClick(reminder)}
                          >
                            <div className={cn(
                              'pointer-events-none absolute inset-y-0 left-0 w-1 transition-all duration-200',
                              isOverdue
                                ? 'bg-red-300/45 group-hover:bg-red-300/90 group-hover:shadow-[0_0_18px_rgba(248,113,113,0.45)]'
                                : 'bg-amber-300/0 group-hover:bg-amber-300/80 group-hover:shadow-[0_0_18px_rgba(245,158,11,0.45)]'
                            )} />
                            <CardContent className="p-3 sm:p-4">
                              <div className="flex items-start gap-3">
                                {/* Source Icon */}
                                <div className={cn(
                                  'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 shadow-inner transition-all duration-200 group-hover:border-amber-300/25 group-hover:bg-amber-400/10',
                                  isOverdue ? 'bg-red-500/15 text-red-200' : 'bg-white/5',
                                  !isOverdue && SOURCE_COLORS[reminder.source]
                                )}>
                                  {TYPE_ICONS[reminder.reminder_type] || SOURCE_ICONS[reminder.source]}
                                </div>

                                {/* Content */}
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-start gap-2">
                                    <span className="min-w-0 max-w-full break-words text-sm font-semibold leading-5 text-slate-50 sm:text-base">{reminder.title}</span>
                                    <Badge className={cn('h-5 shrink-0 border px-2 py-0 text-[10px] font-semibold', priorityCfg.color)}>
                                      {priorityCfg.label}
                                    </Badge>
                                  </div>
                                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                                    <span className="max-w-[180px] truncate font-medium text-slate-300">{reminder.client_name}</span>
                                    <span className="text-amber-300/35">•</span>
                                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-300">{reminder.source_label}</span>
                                    {reminder.description && (
                                      <>
                                        <span className="text-amber-300/35">•</span>
                                        <span className="max-w-[240px] truncate text-slate-500">{reminder.description}</span>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Date */}
                                <div className={cn(
                                  'ml-auto min-w-[72px] shrink-0 rounded-xl border bg-black/25 px-2.5 py-2 text-right shadow-inner sm:min-w-[88px]',
                                  isOverdue ? 'border-red-300/20 bg-red-500/10' : 'border-white/10'
                                )}>
                                  <p className={cn(
                                    'text-[11px] font-semibold sm:text-xs',
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
                                  <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-slate-500">
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
                );
              })}
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
