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
  AlarmClock,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { MultiTeamUserSelect } from '@/components/ui/MultiTeamUserSelect';
import { ClientSearchSelect } from '@/components/ui/ClientSearchSelect';
import { useTeamUsers } from '@/hooks/useTeamUsers';
import {
  useTeamReminders,
  useCreateTeamReminder,
  useCompleteTeamReminder,
  useDeleteTeamReminder,
} from '@/hooks/useTeamReminders';
import { useUpdateReminder, useSnoozeReminder, type SnoozeDuration } from '@/hooks/useUpdateReminder';
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
  const updateMutation = useUpdateReminder();
  const snoozeMutation = useSnoozeReminder();
  const { user } = useAuth();

  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<string>('medium');
  const [reminderType, setReminderType] = useState('task');
  const [assignedTo, setAssignedTo] = useState<string[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPriority, setEditPriority] = useState('medium');
  const [editAssigned, setEditAssigned] = useState<string[]>([]);

  // Snooze state
  const [snoozeId, setSnoozeId] = useState<string | null>(null);
  const [customSnoozeDate, setCustomSnoozeDate] = useState<Date | undefined>();

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDueDate('');
    setPriority('medium');
    setReminderType('task');
    setAssignedTo([]);
    setClientId(null);
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

  const startEdit = (reminder: any) => {
    setEditingId(reminder.id);
    setEditTitle(reminder.title);
    setEditPriority(reminder.priority || 'medium');
    setEditAssigned(reminder.assigned_to || []);
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    updateMutation.mutate(
      { id: editingId, title: editTitle, priority: editPriority, assigned_to: editAssigned },
      {
        onSuccess: () => { toast.success('Reminder updated'); setEditingId(null); },
        onError: (err: any) => toast.error(err.message),
      },
    );
  };

  const handleSnooze = (id: string, duration: SnoozeDuration, customDate?: Date) => {
    snoozeMutation.mutate(
      { id, duration, customDate },
      {
        onSuccess: () => {
          const labels: Record<string, string> = {
            '1h': '1 hour', '1d': 'tomorrow', '3d': '3 days', '1w': '1 week',
            custom: customDate ? format(customDate, 'MMM d') : 'custom date',
          };
          toast.success(`Snoozed until ${labels[duration]}`);
          setSnoozeId(null);
          setCustomSnoozeDate(undefined);
        },
        onError: (err: any) => toast.error(err.message),
      },
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

            {/* Optional client link */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Link to Client (optional)</label>
              <ClientSearchSelect
                value={clientId}
                onValueChange={(id) => setClientId(id)}
                placeholder="Search and link a client..."
                allowNone
              />
            </div>

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
            const isEditing = editingId === reminder.id;
            const isSnoozing = snoozeId === reminder.id;

            return (
              <Card
                key={reminder.id}
                className={cn(
                  'group transition-all',
                  isOverdue && 'border-destructive/30 bg-destructive/5',
                  isToday(new Date(reminder.due_date)) && !isOverdue && 'border-amber-500/20 bg-amber-500/5',
                )}
              >
                <CardContent className="p-2.5 sm:p-3">
                  <div className="flex items-start gap-2.5">
                    <div className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5',
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

                    {/* Action buttons — always visible on mobile, hover on desktop */}
                    <div className="flex gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Snooze"
                        onClick={() => setSnoozeId(isSnoozing ? null : reminder.id)}
                      >
                        <AlarmClock className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Edit"
                        onClick={() => isEditing ? setEditingId(null) : startEdit(reminder)}
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Complete"
                        disabled={completeMutation.isPending}
                        onClick={() => {
                          completeMutation.mutate(reminder.id, {
                            onSuccess: () => toast.success('Reminder completed'),
                            onError: (err: any) => toast.error(err.message),
                          });
                        }}
                      >
                        {completeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-green-600" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Delete"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          deleteMutation.mutate(reminder.id, {
                            onSuccess: () => toast.success('Reminder deleted'),
                            onError: (err: any) => toast.error(err.message),
                          });
                        }}
                      >
                        {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5 text-destructive" />}
                      </Button>
                    </div>
                  </div>

                  {/* Inline Edit Panel */}
                  {isEditing && (
                    <div className="mt-2 p-2.5 rounded-md border bg-muted/50 space-y-2">
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="h-8 text-sm"
                        placeholder="Reminder title"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={editPriority} onValueChange={setEditPriority}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                          </SelectContent>
                        </Select>
                        <MultiTeamUserSelect
                          value={editAssigned}
                          onValueChange={setEditAssigned}
                          placeholder="Assign..."
                        />
                      </div>
                      <div className="flex gap-1.5">
                        <Button size="sm" className="h-7 text-xs flex-1" onClick={handleSaveEdit} disabled={!editTitle.trim() || updateMutation.isPending}>
                          {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}

                  {/* Inline Snooze Panel */}
                  {isSnoozing && (
                    <div className="mt-2 p-2.5 rounded-md border bg-muted/50 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <AlarmClock className="h-3.5 w-3.5" />
                        Snooze until...
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {([
                          { d: '1h' as SnoozeDuration, label: '+1 Hour' },
                          { d: '1d' as SnoozeDuration, label: 'Tomorrow' },
                          { d: '3d' as SnoozeDuration, label: '+3 Days' },
                          { d: '1w' as SnoozeDuration, label: '+1 Week' },
                        ]).map(({ d, label }) => (
                          <Button
                            key={d}
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={snoozeMutation.isPending}
                            onClick={() => handleSnooze(reminder.id, d)}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 text-xs flex-1 justify-start gap-1.5">
                              <CalendarIcon className="h-3 w-3" />
                              {customSnoozeDate ? format(customSnoozeDate, 'MMM d, yyyy') : 'Custom date...'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={customSnoozeDate}
                              onSelect={setCustomSnoozeDate}
                              disabled={(date) => date < new Date()}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                        {customSnoozeDate && (
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            disabled={snoozeMutation.isPending}
                            onClick={() => handleSnooze(reminder.id, 'custom', customSnoozeDate)}
                          >
                            {snoozeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Set'}
                          </Button>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] w-full"
                        onClick={() => { setSnoozeId(null); setCustomSnoozeDate(undefined); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
