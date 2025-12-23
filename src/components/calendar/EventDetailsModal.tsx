import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Clock, User, MapPin, FileText, Phone, Mail } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { GHLEvent } from '@/hooks/useGHLCalendar';

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
}

export function EventDetailsModal({ event, open, onOpenChange, getStatusColor, fetchContact }: EventDetailsModalProps) {
  const [contact, setContact] = useState<ContactDetails | null>(null);
  const [loadingContact, setLoadingContact] = useState(false);

  useEffect(() => {
    if (open && event?.contactId && fetchContact) {
      setLoadingContact(true);
      setContact(null);
      fetchContact(event.contactId)
        .then(data => setContact(data))
        .finally(() => setLoadingContact(false));
    } else if (!open) {
      setContact(null);
    }
  }, [open, event?.contactId, fetchContact]);

  if (!event) return null;

  const startDate = parseISO(event.startTime);
  const endDate = parseISO(event.endTime);
  const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));
  const calendarColor = event.calendarColor || '#3b82f6';

  const contactName = contact?.name || 
    (contact?.firstName || contact?.lastName 
      ? `${contact?.firstName || ''} ${contact?.lastName || ''}`.trim() 
      : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle className="text-xl leading-tight pr-8">
              {event.title || 'Untitled Event'}
            </DialogTitle>
          </div>
          <Badge className={`w-fit mt-2 ${getStatusColor(event.status, event.appointmentStatus)}`}>
            {event.appointmentStatus || event.status}
          </Badge>
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
          {event.notes && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Notes
                </h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap pl-6">
                  {event.notes}
                </p>
              </div>
            </>
          )}

          {/* Event ID for reference */}
          <Separator />
          <div className="text-xs text-muted-foreground">
            Event ID: {event.id}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
