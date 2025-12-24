import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Clock, User, MapPin, FileText, Phone, Mail, Trash2, Edit2, Save, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
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
}

const APPOINTMENT_STATUSES = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'showed', label: 'Showed' },
  { value: 'noshow', label: 'No Show' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'pending', label: 'Pending' },
];

export function EventDetailsModal({ 
  event, 
  open, 
  onOpenChange, 
  getStatusColor, 
  fetchContact,
  onUpdateEvent,
  onDeleteEvent,
}: EventDetailsModalProps) {
  const [contact, setContact] = useState<ContactDetails | null>(null);
  const [loadingContact, setLoadingContact] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('');

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
    }
  }, [open, event?.contactId, fetchContact]);

  useEffect(() => {
    if (event) {
      setEditTitle(event.title || '');
      setEditNotes(event.notes || '');
      setEditStatus(event.appointmentStatus || event.status || '');
    }
  }, [event]);

  if (!event) return null;

  const startDate = parseISO(event.startTime);
  const endDate = parseISO(event.endTime);
  const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));
  const calendarColor = event.calendarColor || '#3b82f6';

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
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
          {/* Date & Time */}
          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{format(startDate, 'EEEE, MMMM d, yyyy')}</p>
              <p className="text-sm text-muted-foreground">
                {format(startDate, 'h:mm a')} - {format(endDate, 'h:mm a')} ({durationMinutes} min)
              </p>
            </div>
          </div>

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
        {(onUpdateEvent || onDeleteEvent) && (
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
