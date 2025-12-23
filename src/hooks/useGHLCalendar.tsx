import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface GHLCalendar {
  id: string;
  name: string;
  description?: string;
  calendarType: string;
  isActive: boolean;
  teamMembers?: number;
  slug?: string;
  eventColor?: string;
}

export interface GHLEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  calendarId: string;
  calendarName?: string;
  calendarColor?: string;
  status: string;
  appointmentStatus?: string;
  contactId?: string;
  notes?: string;
  address?: string;
}

interface CalendarData {
  calendars: GHLCalendar[];
  events: GHLEvent[];
  dateRange: {
    start: string;
    end: string;
  };
}

const normalizeTimestampToISO = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // Handle numeric timestamps that arrive as strings
    if (/^\d+$/.test(trimmed)) {
      const asNumber = Number(trimmed);
      return Number.isNaN(asNumber) ? null : normalizeTimestampToISO(asNumber);
    }

    const ms = Date.parse(trimmed);
    if (Number.isNaN(ms)) return null;
    return new Date(ms).toISOString();
  }

  return null;
};

const normalizeEvent = (raw: any): GHLEvent | null => {
  const start = normalizeTimestampToISO(raw?.startTime);
  const end = normalizeTimestampToISO(raw?.endTime);
  if (!start || !end) return null;

  return {
    id: String(raw?.id ?? ''),
    title: typeof raw?.title === 'string' ? raw.title : String(raw?.title ?? ''),
    startTime: start,
    endTime: end,
    calendarId: String(raw?.calendarId ?? ''),
    calendarName: typeof raw?.calendarName === 'string' ? raw.calendarName : undefined,
    calendarColor: typeof raw?.calendarColor === 'string' ? raw.calendarColor : undefined,
    status: typeof raw?.status === 'string' ? raw.status : String(raw?.status ?? ''),
    appointmentStatus:
      typeof raw?.appointmentStatus === 'string' ? raw.appointmentStatus : undefined,
    contactId: typeof raw?.contactId === 'string' ? raw.contactId : undefined,
    notes: typeof raw?.notes === 'string' ? raw.notes : undefined,
    address: typeof raw?.address === 'string' ? raw.address : undefined,
  };
};

export interface GHLContact {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export function useGHLCalendar() {
  const [calendars, setCalendars] = useState<GHLCalendar[]>([]);
  const [events, setEvents] = useState<GHLEvent[]>([]);
  const [contactCache, setContactCache] = useState<Map<string, GHLContact>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchCalendarData = useCallback(async (
    startTime?: string,
    endTime?: string,
    calendarId?: string
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase.functions.invoke<CalendarData>('ghl-calendar', {
        body: { action: 'all', startTime, endTime, calendarId },
      });

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      if (data && data.calendars) {
        setCalendars(data.calendars);
        const normalized = (data.events || [])
          .map(normalizeEvent)
          .filter(Boolean) as GHLEvent[];
        setEvents(normalized);
      }
    } catch (err: any) {
      console.error('Error fetching calendar data:', err);
      setError(err.message);
      toast({
        title: 'Failed to load calendar',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const fetchEvents = useCallback(async (
    startTime?: string,
    endTime?: string,
    calendarId?: string
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ action: 'events' });
      if (startTime) params.append('startTime', startTime);
      if (endTime) params.append('endTime', endTime);
      if (calendarId) params.append('calendarId', calendarId);

      const { data, error: fetchError } = await supabase.functions.invoke('ghl-calendar', {
        body: { action: 'events', startTime, endTime, calendarId },
      });

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      if (data && data.events) {
        const normalized = (data.events || [])
          .map(normalizeEvent)
          .filter(Boolean) as GHLEvent[];
        setEvents(normalized);
      }
    } catch (err: any) {
      console.error('Error fetching events:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const rescheduleEvent = useCallback(async (
    eventId: string,
    newStartTime: string,
    newEndTime: string,
    originalStartTime?: string,
    originalEndTime?: string
  ): Promise<{ success: boolean; undo?: () => Promise<boolean> }> => {
    setIsUpdating(true);

    try {
      const { data, error: updateError } = await supabase.functions.invoke('ghl-calendar', {
        body: { 
          action: 'update',
          eventId,
          newStartTime,
          newEndTime,
        },
      });

      if (updateError) {
        throw new Error(updateError.message);
      }

      if (data?.success) {
        // Update local state
        setEvents(prev => prev.map(event => 
          event.id === eventId 
            ? { ...event, startTime: newStartTime, endTime: newEndTime }
            : event
        ));
        
        // Return undo function if original times were provided
        const undoFn = originalStartTime && originalEndTime
          ? async () => {
              const { data: undoData, error: undoError } = await supabase.functions.invoke('ghl-calendar', {
                body: { 
                  action: 'update',
                  eventId,
                  newStartTime: originalStartTime,
                  newEndTime: originalEndTime,
                },
              });
              
              if (undoError || !undoData?.success) {
                toast({
                  title: 'Undo failed',
                  description: 'Could not revert the event to its original time.',
                  variant: 'destructive',
                });
                return false;
              }
              
              // Revert local state
              setEvents(prev => prev.map(event => 
                event.id === eventId 
                  ? { ...event, startTime: originalStartTime, endTime: originalEndTime }
                  : event
              ));
              
              toast({
                title: 'Event restored',
                description: 'The event has been moved back to its original time.',
              });
              return true;
            }
          : undefined;

        return { success: true, undo: undoFn };
      } else {
        throw new Error(data?.error || 'Failed to reschedule event');
      }
    } catch (err: any) {
      console.error('Error rescheduling event:', err);
      toast({
        title: 'Failed to reschedule',
        description: err.message,
        variant: 'destructive',
      });
      return { success: false };
    } finally {
      setIsUpdating(false);
    }
  }, [toast]);

  const fetchContact = useCallback(async (contactId: string): Promise<GHLContact | null> => {
    // Return from cache if available
    if (contactCache.has(contactId)) {
      return contactCache.get(contactId)!;
    }

    try {
      const { data, error: fetchError } = await supabase.functions.invoke('ghl-calendar', {
        body: { action: 'contact', contactId },
      });

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      const rawContact = data?.contact;
      if (!rawContact) return null;

      const contact: GHLContact = {
        id: rawContact.id || contactId,
        name: rawContact.name || rawContact.contactName || undefined,
        firstName: rawContact.firstName || undefined,
        lastName: rawContact.lastName || undefined,
        email: rawContact.email || undefined,
        phone: rawContact.phone || undefined,
      };

      // Store in cache
      setContactCache((prev) => new Map(prev).set(contactId, contact));
      return contact;
    } catch (err: any) {
      console.error('Error fetching contact:', err);
      return null;
    }
  }, [contactCache]);

  const createAppointment = useCallback(async (payload: {
    calendarId: string;
    title: string;
    startTime: string;
    endTime: string;
    contactId?: string;
    notes?: string;
  }): Promise<{ success: boolean; event?: GHLEvent }> => {
    setIsUpdating(true);

    try {
      const { data, error: createError } = await supabase.functions.invoke('ghl-calendar', {
        body: { action: 'create', ...payload },
      });

      if (createError) {
        throw new Error(createError.message);
      }

      if (data?.success) {
        const newEvent = normalizeEvent(data.event);
        if (newEvent) {
          // Add to local state
          setEvents((prev) => [...prev, newEvent]);
        }
        toast({
          title: 'Appointment created',
          description: `"${payload.title}" has been scheduled.`,
        });
        return { success: true, event: newEvent ?? undefined };
      } else {
        throw new Error(data?.error || 'Failed to create appointment');
      }
    } catch (err: any) {
      console.error('Error creating appointment:', err);
      toast({
        title: 'Failed to create appointment',
        description: err.message,
        variant: 'destructive',
      });
      return { success: false };
    } finally {
      setIsUpdating(false);
    }
  }, [toast]);

  const getCalendarColor = useCallback((calendarId: string): string => {
    const calendar = calendars.find(c => c.id === calendarId);
    return calendar?.eventColor || '#3b82f6';
  }, [calendars]);

  return {
    calendars,
    events,
    contactCache,
    isLoading,
    isUpdating,
    error,
    fetchCalendarData,
    fetchEvents,
    rescheduleEvent,
    createAppointment,
    fetchContact,
    getCalendarColor,
  };
}
