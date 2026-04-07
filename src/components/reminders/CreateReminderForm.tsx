import { useState } from 'react';
import {
  Plus,
  Loader2,
  Bell,
  Users as UsersIcon,
} from 'lucide-react';
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
import { ClientSearchSelect } from '@/components/ui/ClientSearchSelect';
import { VoiceToTextButton } from '@/components/ui/VoiceToTextButton';
import { useCreateClientReminder } from '@/hooks/useCreateClientReminder';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const REMINDER_TYPES = [
  { value: 'task', label: 'Task' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'settlement', label: 'Settlement' },
  { value: 'finance', label: 'Finance' },
  { value: 'admin', label: 'Admin' },
  { value: 'other', label: 'Other' },
];

export function CreateReminderForm({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const createMutation = useCreateClientReminder();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');
  const [reminderType, setReminderType] = useState('task');
  const [assignedTo, setAssignedTo] = useState<string[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');

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
        client_id: clientId,
        reminder_scope: clientId ? 'client' : 'team',
      },
      {
        onSuccess: () => {
          const msg = clientId
            ? `Reminder created for ${clientName}`
            : 'Team reminder created';
          toast.success(msg);
          onClose();
        },
        onError: (err: any) => toast.error('Failed: ' + err.message),
      },
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Create New Reminder
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

        {/* Client link */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Link to Client</label>
          <ClientSearchSelect
            value={clientId}
            onValueChange={(id, name) => { setClientId(id); setClientName(name || ''); }}
            placeholder="Search and select a client..."
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
                {REMINDER_TYPES.map(t => (
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
                Create Reminder
              </>
            )}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}
