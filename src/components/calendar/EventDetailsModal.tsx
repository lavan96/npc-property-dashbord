import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calendar, Clock, User, MapPin, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { GHLEvent } from '@/hooks/useGHLCalendar';

interface EventDetailsModalProps {
  event: GHLEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getStatusColor: (status: string, appointmentStatus?: string) => string;
}

export function EventDetailsModal({ event, open, onOpenChange, getStatusColor }: EventDetailsModalProps) {
  if (!event) return null;

  const startDate = parseISO(event.startTime);
  const endDate = parseISO(event.endTime);
  const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));
  const calendarColor = event.calendarColor || '#3b82f6';

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
              <div className="pl-6 space-y-2 text-sm">
                <p className="text-muted-foreground">Contact ID: {event.contactId}</p>
                {/* If we had more contact details, they would go here */}
              </div>
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
