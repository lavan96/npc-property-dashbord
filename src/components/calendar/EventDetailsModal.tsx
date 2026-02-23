import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Clock, User, MapPin, FileText, Phone, Mail, Trash2, Edit2, Save, X, CalendarClock, RefreshCw, Globe } from 'lucide-react';
import { format, parseISO, addMinutes, differenceInMinutes } from 'date-fns';
import { toSydneyISO } from '@/lib/sydneyTime';
import { formatInSydney, formatDateInSydney, getSydneyTzAbbr, getSydneyDateTimeParts, isNonSydneyTimezone, formatInLocal } from '@/lib/timezoneUtils';
import { GHLEvent } from '@/hooks/useGHLCalendar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface ContactDetails {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  companyName?: string;
}

interface EventDetailsModalProps {
  event: GHLEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getStatusColor: (status: string, appointmentStatus?: string) => string;
  fetchContact?: (contactId: string) => Promise<ContactDetails | null>;
  onUpdateEvent?: (eventId: string, updates: { title?: string; notes?: string; appointmentStatus?: string }) => Promise<{ success: boolean }>;
  onDeleteEvent?: (eventId: string) => Promise<{ success: boolean }>;
  onRescheduleEvent?: (eventId: string, newStartTime: string, newEndTime: string, originalStartTime?: string, originalEndTime?: string) => Promise<{ success: boolean; undo?: () => Promise<boolean> }>;
}

const APPOINTMENT_STATUSES = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'showed', label: 'Showed' },
  { value: 'noshow', label: 'No Show' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'pending', label: 'Pending' },
];

const DURATION_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
  { value: 120, label: '2 hours' },
];

export function EventDetailsModal({ 
  event, 
  open, 
  onOpenChange, 
  getStatusColor, 
  fetchContact,
  onUpdateEvent,
  onDeleteEvent,
  onRescheduleEvent,
}: EventDetailsModalProps) {
  const [contact, setContact] = useState<ContactDetails | null>(null);
  const [loadingContact, setLoadingContact] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('');
  
  // Reschedule form state
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleDuration, setRescheduleDuration] = useState(30);

  useEffect(() => {
    if (open && event?.contactId && fetchContact) {
      setLoadingContact(true);
      setContact(null);
      fetchContact(event.contactId)
        .then(data => setContact(data))
        .finally(() => setLoadingContact(false));
    } else if (!open) {
      setContact(null);
      setIsEditing(false);
      setIsRescheduling(false);
    }
  }, [open, event?.contactId, fetchContact]);

  useEffect(() => {
    if (event) {
      setEditTitle(event.title || '');
      setEditNotes(event.notes || '');
      setEditStatus(event.appointmentStatus || event.status || '');
      
      // Initialize reschedule form with current event times in Sydney timezone
      const sydneyStart = getSydneyDateTimeParts(event.startTime);
      const sydneyEnd = getSydneyDateTimeParts(event.endTime);
      setRescheduleDate(sydneyStart.dateStr);
      setRescheduleTime(sydneyStart.timeStr);
      
      // Calculate duration from the actual UTC timestamps
      const startDate = parseISO(event.startTime);
      const endDate = parseISO(event.endTime);
      setRescheduleDuration(differenceInMinutes(endDate, startDate));
    }
  }, [event]);

  if (!event) return null;

  const startDate = parseISO(event.startTime);
  const endDate = parseISO(event.endTime);
  const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));
  const calendarColor = event.calendarColor || '#3b82f6';
  const tzAbbr = getSydneyTzAbbr(event.startTime);
  const showLocalTime = isNonSydneyTimezone();

  const contactName = contact?.name || 
    (contact?.firstName || contact?.lastName 
      ? `${contact?.firstName || ''} ${contact?.lastName || ''}`.trim() 
      : null);

  const handleSave = async () => {
    if (!onUpdateEvent) return;
    setIsSaving(true);
    const result = await onUpdateEvent(event.id, {
      title: editTitle,
      notes: editNotes,
      appointmentStatus: editStatus,
    });
    setIsSaving(false);
    if (result.success) {
      setIsEditing(false);
    }
  };

  const handleReschedule = async () => {
    if (!onRescheduleEvent || !rescheduleDate || !rescheduleTime) return;
    
    setIsSaving(true);
    
    // Convert selected Sydney wall-clock time to correct UTC
    const newStartISO = toSydneyISO(rescheduleDate, rescheduleTime);
    
    // Calculate end time: parse the start, add duration, convert back
    const [hours, minutes] = rescheduleTime.split(':').map(Number);
    const endTotalMinutes = hours * 60 + minutes + rescheduleDuration;
    const endHours = Math.floor(endTotalMinutes / 60) % 24;
    const endMins = endTotalMinutes % 60;
    const endTimeStr = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
    const newEndISO = toSydneyISO(rescheduleDate, endTimeStr);
    
    const result = await onRescheduleEvent(
      event.id,
      newStartISO,
      newEndISO,
      event.startTime,
      event.endTime
    );
    
    setIsSaving(false);
    if (result.success) {
      setIsRescheduling(false);
    }
  };

  const handleDelete = async () => {
    if (!onDeleteEvent) return;
    const result = await onDeleteEvent(event.id);
    if (result.success) {
      onOpenChange(false);
    }
  };

  const handleCancelEdit = () => {
    setEditTitle(event.title || '');
    setEditNotes(event.notes || '');
    setEditStatus(event.appointmentStatus || event.status || '');
    setIsEditing(false);
  };

  const handleCancelReschedule = () => {
    const sydneyStart = getSydneyDateTimeParts(event.startTime);
    const startDate = parseISO(event.startTime);
    const endDate = parseISO(event.endTime);
    setRescheduleDate(sydneyStart.dateStr);
    setRescheduleTime(sydneyStart.timeStr);
    setRescheduleDuration(differenceInMinutes(endDate, startDate));
    setIsRescheduling(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] w-[95vw]">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            {isEditing ? (
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="text-lg font-semibold"
                placeholder="Event title"
              />
            ) : (
              <DialogTitle className="text-xl leading-tight pr-8">
                {event.title || 'Untitled Event'}
              </DialogTitle>
            )}
          </div>
          {isEditing ? (
            <Select value={editStatus} onValueChange={setEditStatus}>
              <SelectTrigger className="w-fit mt-2">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {APPOINTMENT_STATUSES.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge className={`w-fit mt-2 ${getStatusColor(event.status, event.appointmentStatus)}`}>
              {event.appointmentStatus || event.status}
            </Badge>
          )}
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Date & Time - with reschedule form */}
          {isRescheduling ? (
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg border">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <CalendarClock className="h-4 w-4" />
                Reschedule Appointment
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="reschedule-date" className="text-xs">Date</Label>
                  <Input
                    id="reschedule-date"
                    type="date"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reschedule-time" className="text-xs">Time <span className="text-muted-foreground font-normal">(Sydney)</span></Label>
                  <Input
                    id="reschedule-time"
                    type="time"
                    value={rescheduleTime}
                    onChange={(e) => setRescheduleTime(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs">Duration</Label>
                <div className="flex flex-wrap gap-1.5">
                  {DURATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRescheduleDuration(opt.value)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                        rescheduleDuration === opt.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background border hover:bg-accent'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancelReschedule}
                  disabled={isSaving}
                  className="flex-1"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleReschedule}
                  disabled={isSaving || !rescheduleDate || !rescheduleTime}
                  className="flex-1"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  {isSaving ? 'Saving...' : 'Confirm'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">{formatDateInSydney(event.startTime)}</p>
                <p className="text-sm text-muted-foreground">
                  {formatInSydney(event.startTime)} – {formatInSydney(event.endTime)} {tzAbbr} ({durationMinutes} min)
                </p>
                {showLocalTime && (
                  <p className="text-xs text-muted-foreground/70 flex items-center gap-1 mt-0.5">
                    <Globe className="h-3 w-3" />
                    Your time: {formatInLocal(event.startTime)} – {formatInLocal(event.endTime)}
                  </p>
                )}
              </div>
              {onRescheduleEvent && !isEditing && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsRescheduling(true)}
                  className="h-8 px-2"
                >
                  <CalendarClock className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}

          {/* Calendar */}
          {event.calendarName && (
            <div className="flex items-start gap-3">
              <div 
                className="h-5 w-5 rounded-full shrink-0 mt-0.5"
                style={{ backgroundColor: calendarColor }}
              />
              <div>
                <p className="text-sm text-muted-foreground">Calendar</p>
                <p className="font-medium">{event.calendarName}</p>
              </div>
            </div>
          )}

          <Separator />

          {/* Contact Info */}
          {event.contactId && (
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Contact Information
              </h4>
              {loadingContact ? (
                <div className="pl-6 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-40" />
                </div>
              ) : contact ? (
                <div className="pl-6 space-y-2 text-sm">
                  {contactName && (
                    <p className="font-medium text-foreground">{contactName}</p>
                  )}
                  {contact.companyName && (
                    <p className="text-muted-foreground">{contact.companyName}</p>
                  )}
                  {contact.email && (
                    <a 
                      href={`mailto:${contact.email}`} 
                      className="flex items-center gap-2 text-primary hover:underline"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {contact.email}
                    </a>
                  )}
                  {contact.phone && (
                    <a 
                      href={`tel:${contact.phone}`} 
                      className="flex items-center gap-2 text-primary hover:underline"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {contact.phone}
                    </a>
                  )}
                </div>
              ) : (
                <div className="pl-6 space-y-2 text-sm">
                  <p className="text-muted-foreground">Contact ID: {event.contactId}</p>
                </div>
              )}
            </div>
          )}

          {/* Location */}
          {event.address && (
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Location</p>
                <p className="font-medium">{event.address}</p>
              </div>
            </div>
          )}

          {/* Notes */}
          <Separator />
          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Notes
            </h4>
            {isEditing ? (
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Add notes..."
                className="min-h-[80px]"
              />
            ) : event.notes ? (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap pl-6">
                {event.notes}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground/50 pl-6 italic">No notes</p>
            )}
          </div>

          {/* Event ID for reference */}
          <Separator />
          <div className="text-xs text-muted-foreground">
            Event ID: {event.id}
          </div>
        </div>

        {/* Footer with actions */}
        {(onUpdateEvent || onDeleteEvent) && !isRescheduling && (
          <DialogFooter className="flex-row justify-between sm:justify-between gap-2 pt-4">
            {onDeleteEvent && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={isSaving}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Event</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete "{event.title || 'this event'}"? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            
            {onUpdateEvent && (
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={isSaving}>
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={isSaving}>
                      <Save className="h-4 w-4 mr-1" />
                      {isSaving ? 'Saving...' : 'Save'}
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                    <Edit2 className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                )}
              </div>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
