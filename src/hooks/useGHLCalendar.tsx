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
}

export interface GHLEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  calendarId: string;
  calendarName?: string;
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
      let url = 'ghl-calendar?action=all';
      if (startTime) url += `&startTime=${startTime}`;
      if (endTime) url += `&endTime=${endTime}`;
      if (calendarId) url += `&calendarId=${calendarId}`;

      const { data, error: fetchError } = await supabase.functions.invoke<CalendarData>('ghl-calendar', {
        body: {},
        headers: {},
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

  return {
    calendars,
    events,
    isLoading,
    error,
    fetchCalendarData,
    fetchEvents,
  };
}
