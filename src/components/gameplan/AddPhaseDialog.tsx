import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const PHASE_ICONS = ['📌', '🔬', '🛠️', '🚀', '📦', '🎯', '📣', '🧪', '📋', '⚙️', '💡', '🏆', '🔥', '📈', '🗺️'];
const PHASE_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#64748b'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  nextOrder: number;
  onCreate: (data: any) => Promise<void>;
}

export function AddPhaseDialog({ open, onOpenChange, planId, nextOrder, onCreate }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('📌');
  const [color, setColor] = useState('#6366f1');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onCreate({
        plan_id: planId,
        name: name.trim(),
        description: description.trim() || null,
        icon,
        color,
        start_date: startDate ? startDate.toISOString() : null,
        end_date: endDate ? endDate.toISOString() : null,
        display_order: nextOrder,
      });
      setName(''); setDescription(''); setIcon('📌'); setColor('#6366f1');
      setStartDate(undefined); setEndDate(undefined);
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add Phase</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Phase Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Discovery & Research" className="mt-1" />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What happens in this phase..." rows={2} className="mt-1" />
          </div>
          <div>
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {PHASE_ICONS.map(i => (
                <button key={i} onClick={() => setIcon(i)}
                  className={cn('text-lg w-8 h-8 rounded-lg flex items-center justify-center transition-all',
                    icon === i ? 'bg-primary/20 ring-2 ring-primary' : 'hover:bg-muted')}>
                  {i}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {PHASE_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={cn('w-7 h-7 rounded-full transition-all',
                    color === c ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110' : 'hover:scale-105')}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!name.trim() || loading}>{loading ? 'Adding...' : 'Add Phase'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
