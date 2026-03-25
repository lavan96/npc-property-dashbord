import { useState } from 'react';
import { format, isPast, isToday, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Bell,
  Plus,
  Check,
  Clock,
  Calendar as CalendarIcon,
  Users,
  Loader2,
  X,
  Pencil,
  UserCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MultiTeamUserSelect } from '@/components/ui/MultiTeamUserSelect';
import { useTeamUsers } from '@/hooks/useTeamUsers';
import {
  useTeamReminders,
  useCreateTeamReminder,
  useCompleteTeamReminder,
  useDeleteTeamReminder,
} from '@/hooks/useTeamReminders';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { VoiceToTextButton } from '@/components/ui/VoiceToTextButton';

const priorityColors: Record<string, string> = {
  low: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  medium: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  high: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  urgent: 'bg-red-500/10 text-red-600 border-red-500/20',
};

const reminderTypes = [
  { value: 'task', label: 'Task' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'admin', label: 'Admin' },
  { value: 'other', label: 'Other' },
];

export function TeamRemindersSection() {
  const { data: reminders = [], isLoading } = useTeamReminders();
  const { data: teamUsers = [] } = useTeamUsers();
  const createMutation = useCreateTeamReminder();
  const completeMutation = useCompleteTeamReminder();
  const deleteMutation = useDeleteTeamReminder();
  const { user } = useAuth();

  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<string>('medium');
  const [reminderType, setReminderType] = useState('task');
  const [assignedTo, setAssignedTo] = useState<string[]>([]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDueDate('');
    setPriority('medium');
    setReminderType('task');
    setAssignedTo([]);
    setShowAdd(false);
  };

  const handleCreate = () => {
    createMutation.mutate(
      {
        title,
        description: description || undefined,
        due_date: new Date(dueDate).toISOString(),
        priority,
        reminder_type: reminderType,
        assigned_to: assignedTo,
        created_by: user?.id,
      },
      {
        onSuccess: () => {
          toast.success('Team reminder created');
          resetForm();
        },
        onError: (err: any) => toast.error('Failed: ' + err.message),
      }
    );
  };

  const getDueStatus = (date: string) => {
    const d = new Date(date);
    if (isPast(d) && !isToday(d)) return { label: 'Overdue', className: 'text-destructive' };
    if (isToday(d)) return { label: 'Today', className: 'text-orange-600' };
    return { label: formatDistanceToNow(d, { addSuffix: true }), className: 'text-muted-foreground' };
  };

  const getAssigneeNames = (ids: string[] | null) => {
    if (!ids || ids.length === 0) return 'Unassigned';
    return ids
      .map(id => teamUsers.find(u => u.id === id)?.username || 'Unknown')
      .join(', ');
  };

  return (
    <div className="space-y-4">
      {/* Add Button / Form */}
      {showAdd ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              New Team Reminder
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Reminder title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground font-medium">Description</label>
              <VoiceToTextButton
                size="sm"
                onTranscript={(text) => setDescription(prev => prev ? `${prev} ${text}` : text)}
              />
            </div>
            <Textarea
              placeholder="Description (optional)..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Due Date</label>
                <Input
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Type</label>
                <Select value={reminderType} onValueChange={setReminderType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {reminderTypes.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Assign To</label>
              <MultiTeamUserSelect
                value={assignedTo}
                onValueChange={setAssignedTo}
                placeholder="Select team members..."
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleCreate}
                disabled={!title.trim() || !dueDate || createMutation.isPending}
                className="flex-1"
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Team Reminder
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button onClick={() => setShowAdd(true)} variant="outline" className="w-full gap-2">
          <Plus className="h-4 w-4" />
          Add Team Reminder
        </Button>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : reminders.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No team reminders yet</p>
            <p className="text-xs mt-1">Create reminders for internal tasks and team coordination</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {reminders.map(reminder => {
            const dueStatus = getDueStatus(reminder.due_date);
            const isOverdue = isPast(new Date(reminder.due_date)) && !isToday(new Date(reminder.due_date));

            return (
              <Card
                key={reminder.id}
                className={cn(
                  'group transition-all',
                  isOverdue && 'border-destructive/30 bg-destructive/5',
                  isToday(new Date(reminder.due_date)) && !isOverdue && 'border-amber-500/20 bg-amber-500/5',
                )}
              >
                <CardContent className="p-2.5 sm:p-3 flex items-start gap-2.5">
                  <div className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center shrink-0',
                    isOverdue ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
                  )}>
                    <Users className="h-3.5 w-3.5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs sm:text-sm font-semibold truncate">{reminder.title}</span>
                      <Badge className={cn('text-[8px] px-1 py-0 h-3.5 border shrink-0', priorityColors[reminder.priority] || '')}>
                        {reminder.priority}
                      </Badge>
                    </div>
                    {reminder.description && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{reminder.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <div className="flex items-center gap-1">
                        <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                        <span className={cn('text-[10px]', dueStatus.className)}>
                          {format(new Date(reminder.due_date), 'MMM d, yyyy h:mm a')} · {dueStatus.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <UserCircle className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">
                          {getAssigneeNames(reminder.assigned_to)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        completeMutation.mutate(reminder.id, {
                          onSuccess: () => toast.success('Reminder completed'),
                          onError: (err: any) => toast.error(err.message),
                        });
                      }}
                    >
                      <Check className="h-4 w-4 text-green-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        deleteMutation.mutate(reminder.id, {
                          onSuccess: () => toast.success('Reminder deleted'),
                          onError: (err: any) => toast.error(err.message),
                        });
                      }}
                    >
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
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
