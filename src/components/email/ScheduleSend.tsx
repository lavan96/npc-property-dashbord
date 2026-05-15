import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Clock, CalendarIcon, Send, Loader2, X } from 'lucide-react';
import { format, addDays, addHours, isAfter, set, nextMonday } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ScheduleSendButtonProps {
  disabled?: boolean;
  buildPayload: () => Promise<{
    recipient: string;
    cc_recipients?: string[];
    bcc_recipients?: string[];
    subject: string;
    body: string;
    attachments?: { name: string; contentType: string; contentBytes: string }[];
    mailbox_source: 'admin' | 'personal';
    original_email_id?: string;
  } | null>;
  onScheduled?: () => void;
}

function presetTimes(): { label: string; date: Date }[] {
  const now = new Date();
  const tomorrow9 = set(addDays(now, 1), { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 });
  const monday8 = set(nextMonday(now), { hours: 8, minutes: 0, seconds: 0, milliseconds: 0 });
  const inOneHour = addHours(now, 1);
  const tonight6 = set(now, { hours: 18, minutes: 0, seconds: 0, milliseconds: 0 });
  const list = [
    { label: 'In 1 hour', date: inOneHour },
    isAfter(tonight6, now) ? { label: 'Tonight 6:00 PM', date: tonight6 } : null,
    { label: 'Tomorrow 9:00 AM', date: tomorrow9 },
    { label: 'Monday 8:00 AM', date: monday8 },
  ].filter(Boolean) as { label: string; date: Date }[];
  return list;
}

export function ScheduleSendButton({ disabled, buildPayload, onScheduled }: ScheduleSendButtonProps) {
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>(addDays(new Date(), 1));
  const [time, setTime] = useState('09:00');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (when: Date) => {
    if (when.getTime() < Date.now() + 30_000) {
      toast.error('Pick a time at least 30 seconds in the future');
      return;
    }
    setSubmitting(true);
    try {
      const payload = await buildPayload();
      if (!payload) { toast.error('Nothing to schedule'); return; }
      if (!payload.recipient) { toast.error('Recipient is required'); return; }
      const { error } = await invokeSecureFunction('email-copilot-extras', {
        action: 'schedule_send',
        ...payload,
        scheduled_for: when.toISOString(),
      });
      if (error) throw error;
      toast.success(`Scheduled for ${format(when, 'PPp')}`);
      setOpen(false);
      onScheduled?.();
    } catch (e: any) {
      toast.error('Schedule failed: ' + (e?.message || 'unknown'));
    } finally {
      setSubmitting(false);
    }
  };

  const submitCustom = () => {
    if (!date) return;
    const [h, m] = time.split(':').map(Number);
    const when = set(date, { hours: h || 9, minutes: m || 0, seconds: 0, milliseconds: 0 });
    submit(when);
  };

  return (
    <>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)} className="gap-1">
        <Clock className="h-4 w-4" /> Schedule
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Schedule send</DialogTitle>
            <DialogDescription>Pick a quick option or choose a custom date and time.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              {presetTimes().map(p => (
                <Button key={p.label} variant="outline" className="justify-start" onClick={() => submit(p.date)} disabled={submitting}>
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  <span className="truncate">{p.label}</span>
                </Button>
              ))}
            </div>
            <div className="border-t pt-3 space-y-2">
              <Label className="text-xs">Custom date & time</Label>
              <div className="flex gap-2">
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('flex-1 justify-start font-normal', !date && 'text-muted-foreground')}>
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {date ? format(date, 'PPP') : 'Pick date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={(d) => { setDate(d); setPickerOpen(false); }}
                      disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                      initialFocus
                      className={cn('p-3 pointer-events-auto')}
                    />
                  </PopoverContent>
                </Popover>
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-32" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submitCustom} disabled={submitting || !date}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export interface ScheduledSend {
  id: string;
  recipient: string;
  subject: string;
  scheduled_for: string;
  status: string;
  error?: string | null;
  mailbox_source: string;
}

export function useScheduledSends() {
  const [items, setItems] = useState<ScheduledSend[]>([]);
  const [loading, setLoading] = useState(false);
  const refresh = async () => {
    setLoading(true);
    try {
      const { data, error } = await invokeSecureFunction('email-copilot-extras', { action: 'list_scheduled' });
      if (error) throw error;
      setItems((data as any)?.scheduled || []);
    } catch (e) {
      console.error('[scheduled] load failed', e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); const t = setInterval(refresh, 60000); return () => clearInterval(t); }, []);
  return { items, loading, refresh };
}

export function ScheduledSendsDialog({
  open, onOpenChange, items, onChanged,
}: { open: boolean; onOpenChange: (v: boolean) => void; items: ScheduledSend[]; onChanged: () => void }) {
  const cancel = async (id: string) => {
    const { error } = await invokeSecureFunction('email-copilot-extras', { action: 'cancel_scheduled', id });
    if (error) toast.error('Cancel failed'); else { toast.success('Cancelled'); onChanged(); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Scheduled sends</DialogTitle>
          <DialogDescription>Pending emails waiting to be sent. Cancel anytime before delivery.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {items.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No scheduled emails.</p>}
          {items.map(s => (
            <div key={s.id} className="border rounded-md p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate">{s.subject || '(No subject)'}</p>
                <Badge variant={s.status === 'failed' ? 'destructive' : 'secondary'}>{s.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">To: {s.recipient}</p>
              <p className="text-xs text-muted-foreground">When: {format(new Date(s.scheduled_for), 'PPp')}</p>
              {s.error && <p className="text-xs text-destructive">Error: {s.error}</p>}
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" onClick={() => cancel(s.id)}>
                  <X className="h-4 w-4 mr-1" />Cancel
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
