import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

interface GHLCalendar {
  id: string;
  name: string;
  description?: string;
  calendarType: string;
  isActive: boolean;
  teamMembers?: number;
  slug?: string;
  eventColor?: string;
}

interface GHLEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  calendarId: string;
  status: string;
  appointmentStatus?: string;
  contactId?: string;
  notes?: string;
  address?: string;
}

// Default calendar colors for consistent color coding
const CALENDAR_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#a855f7', // purple
  '#eab308', // yellow
  '#22c55e', // green
  '#0ea5e9', // sky
  '#e11d48', // rose
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('GOHIGHLEVEL_API_KEY');
    const locationId = Deno.env.get('GOHIGHLEVEL_LOCATION_ID');
    
    if (!apiKey || !locationId) {
      console.error('GHL credentials not configured');
      return new Response(JSON.stringify({ 
        error: 'GoHighLevel credentials not configured',
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'all';
    const calendarId = url.searchParams.get('calendarId');
    const startTime = url.searchParams.get('startTime');
    const endTime = url.searchParams.get('endTime');

    console.log(`GHL Calendar action: ${action}, calendarId: ${calendarId}`);

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json',
    };

    // Fetch calendars
    if (action === 'calendars' || action === 'all') {
      console.log('Fetching calendars...');
      const calendarsResponse = await fetch(`${GHL_API_BASE}/calendars/?locationId=${locationId}`, {
        method: 'GET',
        headers,
      });

      if (!calendarsResponse.ok) {
        const errorText = await calendarsResponse.text();
        console.error('Calendars fetch error:', errorText);
        return new Response(JSON.stringify({ 
          error: 'Failed to fetch calendars',
          details: errorText,
          success: false 
        }), {
          status: calendarsResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const calendarsData = await calendarsResponse.json();
      
      // Add color to each calendar
      const rawCalendars = calendarsData.calendars || [];
      const calendars: GHLCalendar[] = rawCalendars.map((cal: any, index: number) => ({
        ...cal,
        eventColor: cal.eventColor || CALENDAR_COLORS[index % CALENDAR_COLORS.length],
      }));
      
      if (action === 'calendars') {
        return new Response(JSON.stringify({
          success: true,
          calendars,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // For 'all' action, continue to fetch events
      
      // Fetch events
      console.log('Fetching events...');
      const now = new Date();
      const defaultStartTime = startTime || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const defaultEndTime = endTime || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

      let eventsUrl = `${GHL_API_BASE}/calendars/events?locationId=${locationId}&startTime=${defaultStartTime}&endTime=${defaultEndTime}`;
      if (calendarId) {
        eventsUrl += `&calendarId=${calendarId}`;
      }

      const eventsResponse = await fetch(eventsUrl, {
        method: 'GET',
        headers,
      });

      let events: GHLEvent[] = [];
      if (eventsResponse.ok) {
        const eventsData = await eventsResponse.json();
        events = eventsData.events || [];
        console.log(`Fetched ${events.length} events`);
      } else {
        console.error('Events fetch error:', await eventsResponse.text());
      }

      // Map calendar names and colors to events
      const calendarMap = new Map(calendars.map(c => [c.id, { name: c.name, color: c.eventColor }]));
      const eventsWithCalendarInfo = events.map(event => {
        const calInfo = calendarMap.get(event.calendarId);
        return {
          ...event,
          calendarName: calInfo?.name || 'Unknown Calendar',
          calendarColor: calInfo?.color || CALENDAR_COLORS[0],
        };
      });

      return new Response(JSON.stringify({
        success: true,
        calendars,
        events: eventsWithCalendarInfo,
        dateRange: {
          start: defaultStartTime,
          end: defaultEndTime,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch events only
    if (action === 'events') {
      console.log('Fetching events only...');
      const now = new Date();
      const defaultStartTime = startTime || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const defaultEndTime = endTime || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

      let eventsUrl = `${GHL_API_BASE}/calendars/events?locationId=${locationId}&startTime=${defaultStartTime}&endTime=${defaultEndTime}`;
      if (calendarId) {
        eventsUrl += `&calendarId=${calendarId}`;
      }

      const eventsResponse = await fetch(eventsUrl, {
        method: 'GET',
        headers,
      });

      if (!eventsResponse.ok) {
        const errorText = await eventsResponse.text();
        console.error('Events fetch error:', errorText);
        return new Response(JSON.stringify({ 
          error: 'Failed to fetch events',
          details: errorText,
          success: false 
        }), {
          status: eventsResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const eventsData = await eventsResponse.json();
      
      return new Response(JSON.stringify({
        success: true,
        events: eventsData.events || [],
        dateRange: {
          start: defaultStartTime,
          end: defaultEndTime,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update/reschedule an event
    if (action === 'update') {
      const body = await req.json();
      const { eventId, newStartTime, newEndTime } = body;
      
      if (!eventId || !newStartTime || !newEndTime) {
        return new Response(JSON.stringify({ 
          error: 'Missing required fields: eventId, newStartTime, newEndTime',
          success: false 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`Rescheduling event ${eventId} to ${newStartTime} - ${newEndTime}`);

      const updateResponse = await fetch(`${GHL_API_BASE}/calendars/events/appointments/${eventId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          startTime: newStartTime,
          endTime: newEndTime,
        }),
      });

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error('Event update error:', errorText);
        return new Response(JSON.stringify({ 
          error: 'Failed to update event',
          details: errorText,
          success: false 
        }), {
          status: updateResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const updateData = await updateResponse.json();
      console.log('Event updated successfully');
      
      return new Response(JSON.stringify({
        success: true,
        event: updateData,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      error: 'Invalid action',
      validActions: ['all', 'calendars', 'events', 'update'],
      success: false 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in ghl-calendar:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
