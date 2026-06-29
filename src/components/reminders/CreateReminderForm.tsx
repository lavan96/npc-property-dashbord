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
    <Card className="relative overflow-hidden rounded-2xl border border-amber-300/18 bg-[linear-gradient(135deg,rgba(245,158,11,0.10),rgba(2,6,23,0.96)_34%,rgba(0,0,0,0.88))] text-slate-100 shadow-[0_24px_70px_rgba(0,0,0,0.38)] backdrop-blur">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/70 to-transparent" />
      <div className="pointer-events-none absolute -right-14 -top-20 h-40 w-40 rounded-full bg-amber-300/10 blur-3xl" />
      <CardHeader className="relative border-b border-amber-300/10 pb-3">
        <CardTitle className="flex items-center gap-3 text-sm font-semibold text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-400/12 text-amber-100 shadow-[0_0_24px_rgba(245,158,11,0.16)]">
            <Bell className="h-4 w-4" />
          </span>
          <span>Create New Reminder</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="relative space-y-3 p-4">
        <Input
          placeholder="Reminder title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="border-amber-300/15 bg-black/35 text-slate-100 placeholder:text-slate-500 hover:border-amber-300/30 focus-visible:ring-amber-300"
        />

        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-slate-400">Description</label>
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
          className="border-amber-300/15 bg-black/35 text-slate-100 placeholder:text-slate-500 hover:border-amber-300/30 focus-visible:ring-amber-300"
        />

        {/* Client link */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-400">Link to Client</label>
          <ClientSearchSelect
            value={clientId}
            onValueChange={(id, name) => { setClientId(id); setClientName(name || ''); }}
            placeholder="Search and select a client..."
            allowNone
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Due Date</label>
            <Input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="border-amber-300/15 bg-black/35 text-slate-100 hover:border-amber-300/30 focus-visible:ring-amber-300"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Type</label>
            <Select value={reminderType} onValueChange={setReminderType}>
              <SelectTrigger className="border-amber-300/15 bg-black/35 text-slate-100 hover:border-amber-300/30 focus:ring-amber-300">
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
          <label className="text-xs text-slate-400">Priority</label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="border-amber-300/15 bg-black/35 text-slate-100 hover:border-amber-300/30 focus:ring-amber-300">
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
          <label className="text-xs text-slate-400">Assign To</label>
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
            className="flex-1 border border-amber-200/30 bg-[linear-gradient(135deg,#fbbf24,#d97706)] font-semibold text-black shadow-[0_0_28px_rgba(245,158,11,0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_36px_rgba(245,158,11,0.32)] focus-visible:ring-amber-300 disabled:translate-y-0 disabled:opacity-60"
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
          <Button
            variant="outline"
            onClick={onClose}
            className="border-slate-600/70 bg-black/25 text-slate-200 hover:border-amber-300/35 hover:bg-amber-400/10 hover:text-amber-100 focus-visible:ring-amber-300"
          >
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
