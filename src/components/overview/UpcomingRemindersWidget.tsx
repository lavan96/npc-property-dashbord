import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Bell, 
  Calendar, 
  ChevronRight, 
  AlertTriangle,
  Clock,
  User,
  Building2,
  Flag
} from 'lucide-react';
import { format, isPast, isToday, isTomorrow, isWithinInterval, addDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useAllReminders, type UnifiedReminder } from '@/hooks/useAllReminders';

const sourceIcons: Record<string, typeof Bell> = {
  client_reminder: Bell,
  follow_up: User,
  deal_milestone: Building2,
};

const priorityConfig: Record<string, { color: string; label: string }> = {
  high: { color: 'text-destructive', label: 'High' },
  medium: { color: 'text-amber-500', label: 'Medium' },
  low: { color: 'text-muted-foreground', label: 'Low' },
};

function getDueBadge(dueDate: string) {
  const d = new Date(dueDate);
  if (isPast(d) && !isToday(d)) return <Badge variant="destructive" className="text-xs">Overdue</Badge>;
  if (isToday(d)) return <Badge className="text-xs bg-amber-500 text-white">Today</Badge>;
  if (isTomorrow(d)) return <Badge variant="secondary" className="text-xs">Tomorrow</Badge>;
  if (isWithinInterval(d, { start: new Date(), end: addDays(new Date(), 7) }))
    return <Badge variant="secondary" className="text-xs">This Week</Badge>;
  return <Badge variant="outline" className="text-xs">Upcoming</Badge>;
}

export function UpcomingRemindersWidget() {
  const navigate = useNavigate();
  const { data: reminders = [], isLoading } = useAllReminders();

  // Show top 8 pending reminders
  const visible = reminders.filter(r => r.status !== 'completed').slice(0, 8);
  const overdueCount = visible.filter(r => isPast(new Date(r.due_date)) && !isToday(new Date(r.due_date))).length;
  const todayCount = visible.filter(r => isToday(new Date(r.due_date))).length;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Upcoming Reminders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Upcoming Reminders
          </CardTitle>
          <div className="flex gap-2">
            {overdueCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {overdueCount} Overdue
              </Badge>
            )}
            {todayCount > 0 && (
              <Badge className="text-xs bg-amber-500 text-white">
                {todayCount} Today
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No upcoming reminders</p>
          </div>
        ) : (
          <ScrollArea className="h-[200px]">
            <div className="space-y-2">
              {visible.map(reminder => {
                const isOverdue = isPast(new Date(reminder.due_date)) && !isToday(new Date(reminder.due_date));
                const SourceIcon = sourceIcons[reminder.source] || Bell;
                const priority = priorityConfig[reminder.priority] || priorityConfig.medium;

                return (
                  <div
                    key={reminder.id}
                    className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => {
                      if (reminder.client_id && reminder.source !== 'deal_milestone') {
                        navigate(`/clients?clientId=${reminder.client_id}`);
                      } else {
                        navigate('/reminders');
                      }
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`p-2 rounded-full shrink-0 ${isOverdue ? 'bg-destructive/10' : 'bg-muted'}`}>
                        {isOverdue ? (
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                        ) : (
                          <SourceIcon className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{reminder.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="truncate">{reminder.client_name !== 'Unknown' ? reminder.client_name : reminder.source_label}</span>
                          {reminder.priority === 'high' && (
                            <>
                              <span>•</span>
                              <span className={priority.color}><Flag className="h-3 w-3 inline" /> {priority.label}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <div className="text-right">
                        {getDueBadge(reminder.due_date)}
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(reminder.due_date), 'dd MMM yyyy')}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
        <Button 
          variant="ghost" 
          className="w-full mt-2" 
          size="sm"
          onClick={() => navigate('/reminders')}
        >
          View All Reminders
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}
