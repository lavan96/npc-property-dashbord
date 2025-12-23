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
      
      if (action === 'calendars') {
        return new Response(JSON.stringify({
          success: true,
          calendars: calendarsData.calendars || [],
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // For 'all' action, continue to fetch events
      const calendars: GHLCalendar[] = calendarsData.calendars || [];
      
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

      // Map calendar names to events
      const calendarMap = new Map(calendars.map(c => [c.id, c.name]));
      const eventsWithCalendarNames = events.map(event => ({
        ...event,
        calendarName: calendarMap.get(event.calendarId) || 'Unknown Calendar',
      }));

      return new Response(JSON.stringify({
        success: true,
        calendars,
        events: eventsWithCalendarNames,
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

    return new Response(JSON.stringify({ 
      error: 'Invalid action',
      validActions: ['all', 'calendars', 'events'],
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
