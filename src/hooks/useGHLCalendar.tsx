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
    newEndTime: string
  ): Promise<boolean> => {
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
        
        toast({
          title: 'Event rescheduled',
          description: 'The appointment has been updated successfully.',
        });
        return true;
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
      return false;
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
    isLoading,
    isUpdating,
    error,
    fetchCalendarData,
    fetchEvents,
    rescheduleEvent,
    getCalendarColor,
  };
}
