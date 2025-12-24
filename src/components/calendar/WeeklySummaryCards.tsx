import { useMemo } from 'react';
import { format, startOfWeek, endOfWeek, differenceInMinutes, isSameDay, subWeeks } from 'date-fns';
import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus, Clock, Calendar, CheckCircle2, XCircle, Users, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WeeklySummaryCardsProps {
  events: Array<{
    startTime?: string;
    endTime?: string;
    appointmentStatus?: string;
    contactId?: string;
  }>;
  currentWeek: Date;
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ title, value, subtitle, trend, trendValue, icon, color }: StatCardProps) {
  return (
    <Card className={cn(
      'p-4 relative overflow-hidden transition-all hover:scale-[1.02] hover:shadow-md',
      'bg-gradient-to-br from-background to-muted/30'
    )}>
      <div className={cn(
        'absolute top-0 right-0 w-20 h-20 rounded-full opacity-10 -translate-y-1/2 translate-x-1/2',
        color
      )} />
      
      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className={cn('p-2 rounded-lg', color.replace('bg-', 'bg-').replace('-500', '-500/20'))}>
          {icon}
        </div>
      </div>

      {trend && trendValue && (
        <div className="flex items-center gap-1 mt-2">
          {trend === 'up' && <TrendingUp className="h-3 w-3 text-green-500" />}
          {trend === 'down' && <TrendingDown className="h-3 w-3 text-red-500" />}
          {trend === 'neutral' && <Minus className="h-3 w-3 text-muted-foreground" />}
          <span className={cn(
            'text-xs font-medium',
            trend === 'up' && 'text-green-500',
            trend === 'down' && 'text-red-500',
            trend === 'neutral' && 'text-muted-foreground'
          )}>
            {trendValue}
          </span>
          <span className="text-xs text-muted-foreground">vs last week</span>
        </div>
      )}
    </Card>
  );
}

export function WeeklySummaryCards({ events, currentWeek }: WeeklySummaryCardsProps) {
  const safeParseISO = (value: string | undefined): Date | null => {
    try {
      if (!value) return null;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  };

  const weekStart = startOfWeek(currentWeek);
  const weekEnd = endOfWeek(currentWeek);
  const prevWeekStart = startOfWeek(subWeeks(currentWeek, 1));
  const prevWeekEnd = endOfWeek(subWeeks(currentWeek, 1));

  const stats = useMemo(() => {
    // Current week events
    const thisWeekEvents = events.filter(e => {
      const start = safeParseISO(e.startTime);
      return start && start >= weekStart && start <= weekEnd;
    });

    // Last week events
    const lastWeekEvents = events.filter(e => {
      const start = safeParseISO(e.startTime);
      return start && start >= prevWeekStart && start <= prevWeekEnd;
    });

    // Total events
    const totalEvents = thisWeekEvents.length;
    const lastWeekTotal = lastWeekEvents.length;

    // Total hours
    const totalMinutes = thisWeekEvents.reduce((sum, e) => {
      const start = safeParseISO(e.startTime);
      const end = safeParseISO(e.endTime);
      if (start && end) return sum + differenceInMinutes(end, start);
      return sum;
    }, 0);
    const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

    const lastWeekMinutes = lastWeekEvents.reduce((sum, e) => {
      const start = safeParseISO(e.startTime);
      const end = safeParseISO(e.endTime);
      if (start && end) return sum + differenceInMinutes(end, start);
      return sum;
    }, 0);
    const lastWeekHours = Math.round(lastWeekMinutes / 60 * 10) / 10;

    // Confirmed appointments
    const confirmed = thisWeekEvents.filter(e => 
      e.appointmentStatus === 'confirmed' || e.appointmentStatus === 'showed'
    ).length;
    const lastWeekConfirmed = lastWeekEvents.filter(e => 
      e.appointmentStatus === 'confirmed' || e.appointmentStatus === 'showed'
    ).length;

    // No shows
    const noShows = thisWeekEvents.filter(e => e.appointmentStatus === 'noshow').length;
    const lastWeekNoShows = lastWeekEvents.filter(e => e.appointmentStatus === 'noshow').length;

    // Unique contacts
    const uniqueContacts = new Set(thisWeekEvents.map(e => e.contactId).filter(Boolean)).size;
    const lastWeekUniqueContacts = new Set(lastWeekEvents.map(e => e.contactId).filter(Boolean)).size;

    // Show rate
    const showRate = totalEvents > 0 
      ? Math.round((confirmed / totalEvents) * 100) 
      : 0;
    const lastWeekShowRate = lastWeekTotal > 0 
      ? Math.round((lastWeekConfirmed / lastWeekTotal) * 100) 
      : 0;

    // Busiest day
    const dayCount: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    thisWeekEvents.forEach(e => {
      const start = safeParseISO(e.startTime);
      if (start) dayCount[start.getDay()]++;
    });
    const busiestDayIndex = Object.entries(dayCount)
      .sort((a, b) => b[1] - a[1])[0];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const busiestDay = dayNames[Number(busiestDayIndex[0])];
    const busiestDayCount = busiestDayIndex[1];

    // Calculate trends
    const getTrend = (current: number, previous: number): 'up' | 'down' | 'neutral' => {
      if (current > previous) return 'up';
      if (current < previous) return 'down';
      return 'neutral';
    };

    const getTrendValue = (current: number, previous: number): string => {
      const diff = current - previous;
      if (diff === 0) return 'No change';
      return `${diff > 0 ? '+' : ''}${diff}`;
    };

    return {
      totalEvents,
      totalHours,
      confirmed,
      noShows,
      uniqueContacts,
      showRate,
      busiestDay,
      busiestDayCount,
      trends: {
        events: {
          direction: getTrend(totalEvents, lastWeekTotal),
          value: getTrendValue(totalEvents, lastWeekTotal),
        },
        hours: {
          direction: getTrend(totalHours, lastWeekHours),
          value: `${totalHours > lastWeekHours ? '+' : ''}${(totalHours - lastWeekHours).toFixed(1)}h`,
        },
        confirmed: {
          direction: getTrend(confirmed, lastWeekConfirmed),
          value: getTrendValue(confirmed, lastWeekConfirmed),
        },
        noShows: {
          direction: getTrend(lastWeekNoShows, noShows), // Inverted - fewer no-shows is better
          value: getTrendValue(noShows, lastWeekNoShows),
        },
        contacts: {
          direction: getTrend(uniqueContacts, lastWeekUniqueContacts),
          value: getTrendValue(uniqueContacts, lastWeekUniqueContacts),
        },
        showRate: {
          direction: getTrend(showRate, lastWeekShowRate),
          value: `${showRate > lastWeekShowRate ? '+' : ''}${showRate - lastWeekShowRate}%`,
        },
      },
    };
  }, [events, weekStart, weekEnd, prevWeekStart, prevWeekEnd]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Weekly Summary</h3>
        <span className="text-xs text-muted-foreground">
          {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d')}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          title="Total Events"
          value={stats.totalEvents}
          icon={<Calendar className="h-4 w-4 text-blue-500" />}
          color="bg-blue-500"
          trend={stats.trends.events.direction}
          trendValue={stats.trends.events.value}
        />
        <StatCard
          title="Time Booked"
          value={`${stats.totalHours}h`}
          icon={<Clock className="h-4 w-4 text-purple-500" />}
          color="bg-purple-500"
          trend={stats.trends.hours.direction}
          trendValue={stats.trends.hours.value}
        />
        <StatCard
          title="Confirmed"
          value={stats.confirmed}
          subtitle={`${stats.showRate}% show rate`}
          icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
          color="bg-green-500"
          trend={stats.trends.showRate.direction}
          trendValue={stats.trends.showRate.value}
        />
        <StatCard
          title="No Shows"
          value={stats.noShows}
          icon={<XCircle className="h-4 w-4 text-red-500" />}
          color="bg-red-500"
          trend={stats.trends.noShows.direction}
          trendValue={stats.trends.noShows.value}
        />
        <StatCard
          title="Unique Clients"
          value={stats.uniqueContacts}
          icon={<Users className="h-4 w-4 text-amber-500" />}
          color="bg-amber-500"
          trend={stats.trends.contacts.direction}
          trendValue={stats.trends.contacts.value}
        />
        <StatCard
          title="Busiest Day"
          value={stats.busiestDay}
          subtitle={`${stats.busiestDayCount} events`}
          icon={<Zap className="h-4 w-4 text-orange-500" />}
          color="bg-orange-500"
        />
      </div>
    </div>
  );
}
