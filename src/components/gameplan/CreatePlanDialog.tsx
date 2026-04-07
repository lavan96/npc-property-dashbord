import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const ICONS = ['🎯', '🚀', '📈', '💡', '⚡', '🏆', '🗺️', '🔥', '💎', '🌟'];
const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#64748b'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: { name: string; description: string; icon: string; color: string; status?: 'planning' | 'active' | 'completed' | 'archived'; start_date?: string | null; end_date?: string | null }) => Promise<void>;
}

export function CreatePlanDialog({ open, onOpenChange, onCreate }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🎯');
  const [color, setColor] = useState('#6366f1');
  const [status, setStatus] = useState<'planning' | 'active' | 'completed' | 'archived'>('planning');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        icon,
        color,
        status,
        start_date: startDate ? startDate.toISOString() : null,
        end_date: endDate ? endDate.toISOString() : null,
      });
      setName(''); setDescription(''); setIcon('🎯'); setColor('#6366f1');
      setStatus('planning'); setStartDate(undefined); setEndDate(undefined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Game Plan</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Q2 Growth Strategy" className="mt-1" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Key objectives and strategy..." rows={3} className="mt-1" />
          </div>
          <div>
            <Label>Initial Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planning">📋 Planning</SelectItem>
                <SelectItem value="active">🟢 Active</SelectItem>
                <SelectItem value="completed">✅ Completed</SelectItem>
                <SelectItem value="archived">📦 Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full mt-1 justify-start text-left font-normal h-9 text-sm', !startDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {startDate ? format(startDate, 'MMM d, yyyy') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full mt-1 justify-start text-left font-normal h-9 text-sm', !endDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {endDate ? format(endDate, 'MMM d, yyyy') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={setEndDate}
                    disabled={d => startDate ? d < startDate : false} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div>
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {ICONS.map(i => (
                <button key={i} onClick={() => setIcon(i)}
                  className={cn('text-xl w-9 h-9 rounded-lg flex items-center justify-center transition-all',
                    icon === i ? 'bg-primary/20 ring-2 ring-primary scale-110' : 'hover:bg-muted')}>
                  {i}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Accent Color</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={cn('w-7 h-7 rounded-full transition-all',
                    color === c ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110' : 'hover:scale-105')}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!name.trim() || loading}>
            {loading ? 'Creating...' : 'Create Plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
