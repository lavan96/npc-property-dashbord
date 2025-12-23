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

export function useGHLCalendar() {
  const [calendars, setCalendars] = useState<GHLCalendar[]>([]);
  const [events, setEvents] = useState<GHLEvent[]>([]);
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
        setEvents(data.events || []);
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
        setEvents(data.events);
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

  const fetchContact = useCallback(async (contactId: string) => {
    try {
      const { data, error: fetchError } = await supabase.functions.invoke('ghl-calendar', {
        body: { action: 'contact', contactId },
      });

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      return data?.contact || null;
    } catch (err: any) {
      console.error('Error fetching contact:', err);
      return null;
    }
  }, []);

  const getCalendarColor = useCallback((calendarId: string): string => {
    const calendar = calendars.find(c => c.id === calendarId);
    return calendar?.eventColor || '#3b82f6';
  }, [calendars]);

  return {
    calendars,
    events,
    isLoading,
    isUpdating,
    error,
    fetchCalendarData,
    fetchEvents,
    rescheduleEvent,
    fetchContact,
    getCalendarColor,
  };
}
