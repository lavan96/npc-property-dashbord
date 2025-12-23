import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Clock, Plus, Loader2 } from 'lucide-react';
import { format, addMinutes } from 'date-fns';
import type { GHLCalendar } from '@/hooks/useGHLCalendar';

interface QuickAddAppointmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendars: GHLCalendar[];
  defaultDate?: Date;
  defaultHour?: number;
  isLoading: boolean;
  onSubmit: (data: {
    calendarId: string;
    title: string;
    startTime: string;
    endTime: string;
    notes?: string;
  }) => Promise<boolean>;
}

export function QuickAddAppointmentModal({
  open,
  onOpenChange,
  calendars,
  defaultDate,
  defaultHour,
  isLoading,
  onSubmit,
}: QuickAddAppointmentModalProps) {
  const [title, setTitle] = useState('');
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('30');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      // Reset form
      setTitle('');
      setNotes('');

      // Set default values
      const d = defaultDate || new Date();
      setDate(format(d, 'yyyy-MM-dd'));

      if (defaultHour !== undefined) {
        setTime(`${String(defaultHour).padStart(2, '0')}:00`);
      } else {
        const currentHour = d.getHours();
        setTime(`${String(currentHour).padStart(2, '0')}:00`);
      }

      // Set default calendar
      if (calendars.length > 0 && !selectedCalendarId) {
        setSelectedCalendarId(calendars[0].id);
      }
    }
  }, [open, defaultDate, defaultHour, calendars, selectedCalendarId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCalendarId || !date || !time || !title.trim()) return;

    const [hours, minutes] = time.split(':').map(Number);
    const startDate = new Date(date);
    startDate.setHours(hours, minutes, 0, 0);

    const endDate = addMinutes(startDate, parseInt(duration, 10));

    const success = await onSubmit({
      calendarId: selectedCalendarId,
      title: title.trim(),
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      notes: notes.trim() || undefined,
    });

    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Quick Add Appointment
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="Appointment title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>

          {/* Calendar */}
          <div className="space-y-2">
            <Label>Calendar *</Label>
            <Select value={selectedCalendarId} onValueChange={setSelectedCalendarId}>
              <SelectTrigger>
                <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Select calendar" />
              </SelectTrigger>
              <SelectContent>
                {calendars.map((cal) => (
                  <SelectItem key={cal.id} value={cal.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: cal.eventColor || '#3b82f6' }}
                      />
                      <span className="truncate">{cal.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Time *</Label>
              <div className="relative">
                <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                  className="pl-8"
                />
              </div>
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label>Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="45">45 minutes</SelectItem>
                <SelectItem value="60">1 hour</SelectItem>
                <SelectItem value="90">1.5 hours</SelectItem>
                <SelectItem value="120">2 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Optional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !title.trim() || !selectedCalendarId}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
