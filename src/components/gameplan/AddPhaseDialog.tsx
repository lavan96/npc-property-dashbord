import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const PHASE_ICONS = ['📌', '🔬', '🛠️', '🚀', '📦', '🎯', '📣', '🧪', '📋', '⚙️'];

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
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onCreate({ plan_id: planId, name: name.trim(), description: description.trim() || null, icon, display_order: nextOrder });
      setName(''); setDescription(''); setIcon('📌');
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add Phase</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Phase Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Discovery & Research" />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What happens in this phase..." rows={2} />
          </div>
          <div>
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {PHASE_ICONS.map(i => (
                <button key={i} onClick={() => setIcon(i)} className={`text-lg w-8 h-8 rounded-lg flex items-center justify-center transition-all ${icon === i ? 'bg-primary/20 ring-2 ring-primary' : 'hover:bg-muted'}`}>{i}</button>
              ))}
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
