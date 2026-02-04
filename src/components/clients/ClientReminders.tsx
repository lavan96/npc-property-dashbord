import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  Bell, 
  Plus, 
  Check, 
  Clock, 
  Calendar,
  Phone,
  Users,
  FileText,
  MoreHorizontal,
  Loader2,
  X
} from 'lucide-react';
import { format, formatDistanceToNow, isPast, isToday } from 'date-fns';
import { toast } from 'sonner';

interface ClientRemindersProps {
  clientId: string;
}

const reminderTypes = [
  { value: 'follow_up', label: 'Follow Up', icon: Bell },
  { value: 'review', label: 'Portfolio Review', icon: FileText },
  { value: 'call', label: 'Phone Call', icon: Phone },
  { value: 'meeting', label: 'Meeting', icon: Users },
  { value: 'document', label: 'Document', icon: FileText },
  { value: 'other', label: 'Other', icon: MoreHorizontal },
];

const priorityColors = {
  low: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  medium: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  high: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  urgent: 'bg-red-500/10 text-red-600 border-red-500/20',
};

export function ClientReminders({ clientId }: ClientRemindersProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [reminderType, setReminderType] = useState('follow_up');
  const queryClient = useQueryClient();

  const { data: reminders = [], isLoading } = useQuery({
    queryKey: ['client-reminders', clientId],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('get-client-data', {
        clientId,
        include: { reminders: true },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Failed to fetch reminders');
      return data.reminders || [];
    }
  });

  const addReminderMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await invokeSecureFunction('manage-client-data', {
        operation: 'create',
        table: 'client_reminders',
        clientId,
        data: {
          title,
          description,
          due_date: new Date(dueDate).toISOString(),
          priority,
          reminder_type: reminderType,
        },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Failed to create reminder');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-reminders', clientId] });
      toast.success('Reminder created');
      resetForm();
    },
    onError: (error: any) => {
      toast.error('Failed to create reminder: ' + error.message);
    }
  });

  const completeReminderMutation = useMutation({
    mutationFn: async (reminderId: string) => {
      const { data, error } = await invokeSecureFunction('manage-client-data', {
        operation: 'update',
        table: 'client_reminders',
        clientId,
        recordId: reminderId,
        data: { 
          status: 'completed',
          completed_at: new Date().toISOString()
        },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Failed to complete reminder');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-reminders', clientId] });
      toast.success('Reminder completed');
    },
    onError: (error: any) => {
      toast.error('Failed to complete reminder: ' + error.message);
    }
  });

  const deleteReminderMutation = useMutation({
    mutationFn: async (reminderId: string) => {
      const { data, error } = await invokeSecureFunction('manage-client-data', {
        operation: 'delete',
        table: 'client_reminders',
        clientId,
        recordId: reminderId,
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Failed to delete reminder');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-reminders', clientId] });
      toast.success('Reminder deleted');
    },
    onError: (error: any) => {
      toast.error('Failed to delete reminder: ' + error.message);
    }
  });

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDueDate('');
    setPriority('medium');
    setReminderType('follow_up');
    setShowAdd(false);
  };

  const pendingReminders = reminders.filter(r => r.status === 'pending');
  const completedReminders = reminders.filter(r => r.status === 'completed');

  const getReminderIcon = (type: string) => {
    const found = reminderTypes.find(t => t.value === type);
    return found ? found.icon : Bell;
  };

  const getDueStatus = (dueDate: string) => {
    const date = new Date(dueDate);
    if (isPast(date) && !isToday(date)) {
      return { label: 'Overdue', className: 'text-red-600' };
    }
    if (isToday(date)) {
      return { label: 'Today', className: 'text-orange-600' };
    }
    return { label: formatDistanceToNow(date, { addSuffix: true }), className: 'text-muted-foreground' };
  };

  return (
    <div className="space-y-4">
      {/* Add Reminder */}
      {showAdd ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">New Reminder</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Reminder title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
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
                    {reminderTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <span className="flex items-center gap-2">
                          <type.icon className="h-3 w-3" />
                          {type.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Priority</label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
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
            <div className="flex gap-2">
              <Button 
                onClick={() => addReminderMutation.mutate()}
                disabled={!title.trim() || !dueDate || addReminderMutation.isPending}
                className="flex-1"
              >
                {addReminderMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Reminder
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button onClick={() => setShowAdd(true)} variant="outline" className="w-full gap-2">
          <Plus className="h-4 w-4" />
          Add Reminder
        </Button>
      )}

      {/* Pending Reminders */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : pendingReminders.length === 0 && completedReminders.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No reminders set</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {pendingReminders.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Pending ({pendingReminders.length})
              </h4>
              {pendingReminders.map((reminder) => {
                const Icon = getReminderIcon(reminder.reminder_type);
                const dueStatus = getDueStatus(reminder.due_date);
                
                return (
                  <Card key={reminder.id} className="group">
                    <CardContent className="py-3 flex items-start gap-3">
                      <div className="mt-0.5">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-sm">{reminder.title}</p>
                            {reminder.description && (
                              <p className="text-xs text-muted-foreground mt-1">{reminder.description}</p>
                            )}
                          </div>
                          <Badge className={priorityColors[reminder.priority as keyof typeof priorityColors]}>
                            {reminder.priority}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span className={`text-xs ${dueStatus.className}`}>
                            {format(new Date(reminder.due_date), 'MMM d, yyyy h:mm a')} · {dueStatus.label}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7"
                          onClick={() => completeReminderMutation.mutate(reminder.id)}
                        >
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7"
                          onClick={() => deleteReminderMutation.mutate(reminder.id)}
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

          {/* Completed Reminders */}
          {completedReminders.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <Check className="h-4 w-4" />
                Completed ({completedReminders.length})
              </h4>
              {completedReminders.slice(0, 3).map((reminder) => {
                const Icon = getReminderIcon(reminder.reminder_type);
                
                return (
                  <Card key={reminder.id} className="opacity-60">
                    <CardContent className="py-2 flex items-center gap-3">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm line-through">{reminder.title}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {format(new Date(reminder.completed_at!), 'MMM d')}
                      </span>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
