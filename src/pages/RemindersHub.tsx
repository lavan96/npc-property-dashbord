import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAllReminders, type UnifiedReminder } from '@/hooks/useAllReminders';
import { toast } from 'sonner';

type TimeFilter = 'all' | 'overdue' | 'today' | 'week' | 'month' | 'later';
type SourceFilter = 'all' | 'client_reminder' | 'follow_up' | 'deal_milestone';
type PriorityFilter = 'all' | 'high' | 'medium' | 'low';

const PRIORITY_CONFIG = {
  high: { label: 'High', color: 'bg-red-500/10 text-red-600 border-red-500/30' },
  medium: { label: 'Medium', color: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  low: { label: 'Low', color: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
};

const SOURCE_ICONS = {
  client_reminder: <Bell className="h-3.5 w-3.5" />,
  follow_up: <Users className="h-3.5 w-3.5" />,
  deal_milestone: <TrendingUp className="h-3.5 w-3.5" />,
};

const SOURCE_COLORS = {
  client_reminder: 'text-primary',
  follow_up: 'text-amber-500',
  deal_milestone: 'text-green-600',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  settlement: <Building2 className="h-3.5 w-3.5" />,
  finance: <TrendingUp className="h-3.5 w-3.5" />,
  clawback: <AlertTriangle className="h-3.5 w-3.5" />,
  construction: <Building2 className="h-3.5 w-3.5" />,
};

export default function RemindersHub() {
  const { data: reminders = [], isLoading } = useAllReminders();
  const navigate = useNavigate();

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');

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
      <div className="p-3 sm:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 rounded-lg" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-5">
      {/* Page Header */}
      <div className="flex items-center gap-2 sm:gap-3">
        <Bell className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Reminders Hub</h1>
          <p className="text-xs sm:text-sm text-muted-foreground truncate">
            All reminders, follow-ups, and deal milestones in one place.
          </p>
        </div>
      </div>

      {/* Morning Briefing Banner */}
      <Card className={cn(
        'border',
        stats.overdue > 0
          ? 'bg-destructive/5 border-destructive/20'
          : stats.today > 0
            ? 'bg-amber-500/5 border-amber-500/20'
            : 'bg-primary/5 border-primary/20'
      )}>
        <CardContent className="p-3 sm:p-4 flex items-start gap-2.5">
          <Sparkles className={cn(
            'h-4 w-4 sm:h-5 sm:w-5 mt-0.5 shrink-0',
            stats.overdue > 0 ? 'text-destructive' : stats.today > 0 ? 'text-amber-500' : 'text-primary'
          )} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
              {format(now, 'EEEE, dd MMMM yyyy')}
            </p>
            <p className="text-sm sm:text-base font-medium">{briefing}</p>
          </div>
        </CardContent>
      </Card>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
        <Card className={cn(stats.overdue > 0 && 'border-destructive/30')}>
          <CardContent className="p-2.5 sm:p-3 text-center">
            <p className={cn('text-lg sm:text-2xl font-bold', stats.overdue > 0 ? 'text-destructive' : '')}>{stats.overdue}</p>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground">Overdue</p>
          </CardContent>
        </Card>
        <Card className={cn(stats.today > 0 && 'border-amber-500/30')}>
          <CardContent className="p-2.5 sm:p-3 text-center">
            <p className={cn('text-lg sm:text-2xl font-bold', stats.today > 0 ? 'text-amber-600' : '')}>{stats.today}</p>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground">Today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-2.5 sm:p-3 text-center">
            <p className="text-lg sm:text-2xl font-bold">{stats.thisWeek}</p>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground">This Week</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-2.5 sm:p-3 text-center">
            <p className="text-lg sm:text-2xl font-bold text-destructive">{stats.highPriority}</p>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground">High Priority</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="p-2.5 sm:p-3 text-center">
            <p className="text-lg sm:text-2xl font-bold">{stats.total}</p>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground">Total Upcoming</p>
          </CardContent>
        </Card>
      </div>

      {/* Time Tabs + Filters Row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Tabs value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)} className="flex-1">
          <TabsList className="w-full inline-flex overflow-x-auto scrollbar-hide">
            <TabsTrigger value="all" className="text-xs sm:text-sm">All</TabsTrigger>
            <TabsTrigger value="overdue" className="text-xs sm:text-sm">
              Overdue {stats.overdue > 0 && <Badge variant="destructive" className="ml-1 text-[9px] px-1 h-4">{stats.overdue}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="today" className="text-xs sm:text-sm">Today</TabsTrigger>
            <TabsTrigger value="week" className="text-xs sm:text-sm">This Week</TabsTrigger>
            <TabsTrigger value="month" className="text-xs sm:text-sm">This Month</TabsTrigger>
            <TabsTrigger value="later" className="text-xs sm:text-sm">Later</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex gap-2 shrink-0">
          <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
            <SelectTrigger className="w-[140px] sm:w-[160px] h-9 text-xs">
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
            <SelectTrigger className="w-[110px] sm:w-[130px] h-9 text-xs">
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
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <CheckCircle2 className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No reminders match your filters</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groupOrder.filter(g => grouped[g]).map(groupLabel => (
            <div key={groupLabel}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold">{groupLabel}</h3>
                <Badge variant="outline" className="text-[10px]">{grouped[groupLabel].length}</Badge>
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
                        'cursor-pointer transition-all hover:shadow-sm',
                        isOverdue && 'border-destructive/30 bg-destructive/5',
                        isToday(new Date(reminder.due_date)) && !isOverdue && 'border-amber-500/20 bg-amber-500/5',
                      )}
                      onClick={() => handleReminderClick(reminder)}
                    >
                      <CardContent className="p-2.5 sm:p-3 flex items-center gap-2.5">
                        {/* Source Icon */}
                        <div className={cn(
                          'h-8 w-8 rounded-full flex items-center justify-center shrink-0',
                          isOverdue ? 'bg-destructive/10 text-destructive' : 'bg-muted',
                          !isOverdue && SOURCE_COLORS[reminder.source]
                        )}>
                          {TYPE_ICONS[reminder.reminder_type] || SOURCE_ICONS[reminder.source]}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs sm:text-sm font-semibold truncate">{reminder.title}</span>
                            <Badge className={cn('text-[8px] px-1 py-0 h-3.5 border shrink-0', priorityCfg.color)}>
                              {priorityCfg.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">{reminder.client_name}</span>
                            <span className="text-[10px] text-muted-foreground">·</span>
                            <span className="text-[10px] text-muted-foreground">{reminder.source_label}</span>
                            {reminder.description && (
                              <>
                                <span className="text-[10px] text-muted-foreground">·</span>
                                <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">{reminder.description}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Date & Action */}
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <p className={cn(
                              'text-[10px] sm:text-xs font-medium',
                              isOverdue ? 'text-destructive' : isToday(new Date(reminder.due_date)) ? 'text-amber-600' : 'text-muted-foreground'
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
                            <p className="text-[9px] text-muted-foreground">
                              {format(new Date(reminder.due_date), 'EEE')}
                            </p>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
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
    </div>
  );
}
