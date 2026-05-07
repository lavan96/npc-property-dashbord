import { useState } from 'react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Check,
  X,
  Pencil,
  Clock,
  AlarmClock,
  Loader2,
  Calendar as CalendarIcon,
} from 'lucide-react';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { MultiTeamUserSelect } from '@/components/ui/MultiTeamUserSelect';
import { useUpdateReminder, useSnoozeReminder, type SnoozeDuration } from '@/hooks/useUpdateReminder';
import { useCompleteTeamReminder, useDeleteTeamReminder } from '@/hooks/useTeamReminders';
import { toast } from 'sonner';

interface ReminderActionsProps {
  reminderId: string;
  rawId: string;
  title: string;
  description?: string | null;
  dueDate: string;
  priority: string;
  assignedTo?: string[] | null;
  source: string;
  canEdit: boolean;
  canDelete: boolean;
}

export function ReminderActions({
  reminderId,
  rawId,
  title,
  description,
  dueDate,
  priority,
  assignedTo,
  source,
  canEdit,
  canDelete,
}: ReminderActionsProps) {
  const [showEdit, setShowEdit] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);
  const [editTitle, setEditTitle] = useState(title);
  const [editDescription, setEditDescription] = useState(description || '');
  const [editPriority, setEditPriority] = useState(priority);
  const [editAssigned, setEditAssigned] = useState<string[]>(assignedTo || []);
  const [editDueDate, setEditDueDate] = useState<Date | undefined>(dueDate ? new Date(dueDate) : undefined);
  const [editDueTime, setEditDueTime] = useState<string>(
    dueDate ? format(new Date(dueDate), 'HH:mm') : '09:00'
  );
  const [customSnoozeDate, setCustomSnoozeDate] = useState<Date | undefined>();

  const updateMutation = useUpdateReminder();
  const snoozeMutation = useSnoozeReminder();
  const completeMutation = useCompleteTeamReminder();
  const deleteMutation = useDeleteTeamReminder();

  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    completeMutation.mutate(rawId, {
      onSuccess: () => toast.success('Reminder completed'),
      onError: (err: any) => toast.error(err.message),
    });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteMutation.mutate(rawId, {
      onSuccess: () => toast.success('Reminder deleted'),
      onError: (err: any) => toast.error(err.message),
    });
  };

  const handleSnooze = (duration: SnoozeDuration, customDate?: Date) => {
    snoozeMutation.mutate(
      { id: rawId, duration, customDate },
      {
        onSuccess: () => {
          const labels: Record<string, string> = {
            '1h': '1 hour',
            '1d': 'tomorrow',
            '3d': '3 days',
            '1w': '1 week',
            custom: customDate ? format(customDate, 'MMM d') : 'custom date',
          };
          toast.success(`Snoozed until ${labels[duration]}`);
          setShowSnooze(false);
          setCustomSnoozeDate(undefined);
        },
        onError: (err: any) => toast.error(err.message),
      },
    );
  };

  const handleSaveEdit = () => {
    let combinedDueDate = dueDate;
    if (editDueDate) {
      const [hh, mm] = (editDueTime || '09:00').split(':').map(Number);
      const d = new Date(editDueDate);
      d.setHours(hh || 0, mm || 0, 0, 0);
      combinedDueDate = d.toISOString();
    }
    updateMutation.mutate(
      {
        id: rawId,
        title: editTitle,
        description: editDescription,
        priority: editPriority,
        assigned_to: editAssigned,
        due_date: combinedDueDate,
      },
      {
        onSuccess: () => {
          toast.success('Reminder updated');
          setShowEdit(false);
        },
        onError: (err: any) => toast.error(err.message),
      },
    );
  };

  // Only show actions for client_reminders source (not follow_ups or deal milestones)
  const isEditable = source === 'client_reminder';

  if (showEdit && isEditable && canEdit) {
    return (
      <div
        className="mt-2 p-3 rounded-md border bg-muted/50 space-y-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase text-muted-foreground">Title</label>
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="h-8 text-sm"
            placeholder="Reminder title"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase text-muted-foreground">Description</label>
          <Textarea
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            className="text-sm min-h-[60px]"
            placeholder="Add notes..."
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase text-muted-foreground">Due date & time</label>
          <div className="flex gap-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs flex-1 justify-start gap-1.5">
                  <CalendarIcon className="h-3 w-3" />
                  {editDueDate ? format(editDueDate, 'MMM d, yyyy') : 'Pick date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={editDueDate}
                  onSelect={setEditDueDate}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <Input
              type="time"
              value={editDueTime}
              onChange={(e) => setEditDueTime(e.target.value)}
              className="h-8 text-xs w-24"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase text-muted-foreground">Priority</label>
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
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase text-muted-foreground">Assigned to</label>
            <MultiTeamUserSelect
              value={editAssigned}
              onValueChange={setEditAssigned}
              placeholder="Assign..."
            />
          </div>
        </div>
        <div className="flex gap-1.5 pt-1">
          <Button
            size="sm"
            className="h-7 text-xs flex-1"
            onClick={handleSaveEdit}
            disabled={!editTitle.trim() || updateMutation.isPending}
          >
            {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save changes'}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowEdit(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (showSnooze && isEditable && canEdit) {
    return (
      <div
        className="mt-2 p-2.5 rounded-md border bg-muted/50 space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
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
              onClick={() => handleSnooze(d)}
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
              onClick={() => handleSnooze('custom', customSnoozeDate)}
            >
              {snoozeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Set'}
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px] w-full"
          onClick={() => { setShowSnooze(false); setCustomSnoozeDate(undefined); }}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
      {isEditable && canEdit && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Snooze"
            onClick={() => setShowSnooze(true)}
          >
            <AlarmClock className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Edit"
            onClick={() => setShowEdit(true)}
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </>
      )}
      {isEditable && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Complete"
          disabled={completeMutation.isPending}
          onClick={handleComplete}
        >
          {completeMutation.isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Check className="h-3.5 w-3.5 text-green-600" />
          }
        </Button>
      )}
      {isEditable && canDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Delete"
          disabled={deleteMutation.isPending}
          onClick={handleDelete}
        >
          {deleteMutation.isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <X className="h-3.5 w-3.5 text-destructive" />
          }
        </Button>
      )}
    </div>
  );
}
