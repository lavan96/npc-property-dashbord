import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID');
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET');
const MICROSOFT_TENANT_ID = Deno.env.get('MICROSOFT_TENANT_ID');

// ── Microsoft Graph helpers ──────────────────────────────────────────

async function getAccessToken(): Promise<{ token: string; scopes?: string }> {
  const tokenUrl = `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID!,
    client_secret: MICROSOFT_CLIENT_SECRET!,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[outlook-calendar] Token request failed:', err);
    throw new Error(`Token request failed: ${err}`);
  }
  const data = await res.json();
  console.log('[outlook-calendar] Token acquired, expires_in:', data.expires_in);
  return { token: data.access_token, scopes: data.scope };
}

function graphUrl(email: string, path: string) {
  return `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}${path}`;
}

// ── Resolve the user's Microsoft email ───────────────────────────────

async function resolveMicrosoftEmail(
  supabase: any,
  userId: string,
): Promise<string | null> {
  if (userId === 'service_role') return null;
  const { data } = await supabase
    .from('custom_users')
    .select('microsoft_email, email')
    .eq('id', userId)
    .maybeSingle();
  return data?.microsoft_email || data?.email || null;
}

// ── Action handlers ──────────────────────────────────────────────────

async function listEvents(
  accessToken: string,
  email: string,
  startTime: string,
  endTime: string,
) {
  const params = new URLSearchParams({
    startDateTime: startTime,
    endDateTime: endTime,
    $top: '200',
    $orderby: 'start/dateTime',
    $select: 'id,subject,start,end,location,bodyPreview,isAllDay,showAs,organizer,attendees,categories',
  });

  const res = await fetch(
    graphUrl(email, `/calendarView?${params.toString()}`),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.timezone="UTC"',
      },
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph calendarView failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return (data.value || []).map((ev: any) => normalizeEvent(ev, email));
}

async function createEvent(
  accessToken: string,
  email: string,
  payload: {
    subject: string;
    startTime: string;
    endTime: string;
    body?: string;
    location?: string;
    attendees?: string[];
    isAllDay?: boolean;
    reminderMinutes?: number;
    showAs?: string;
    categories?: string[];
  },
) {
  const graphEvent: Record<string, any> = {
    subject: payload.subject,
    start: { dateTime: payload.startTime, timeZone: 'UTC' },
    end: { dateTime: payload.endTime, timeZone: 'UTC' },
    showAs: payload.showAs || 'busy',
  };

  if (payload.body) {
    graphEvent.body = { contentType: 'text', content: payload.body };
  }
  if (payload.location) {
    graphEvent.location = { displayName: payload.location };
  }
  if (payload.isAllDay) {
    graphEvent.isAllDay = true;
  }
  if (payload.reminderMinutes !== undefined) {
    graphEvent.isReminderOn = true;
    graphEvent.reminderMinutesBeforeStart = payload.reminderMinutes;
  }
  if (payload.categories?.length) {
    graphEvent.categories = payload.categories;
  }
  if (payload.attendees?.length) {
    graphEvent.attendees = payload.attendees.map((email) => ({
      emailAddress: { address: email },
      type: 'required',
    }));
  }

  const res = await fetch(graphUrl(email, '/events'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(graphEvent),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Create event failed (${res.status}): ${err}`);
  }

  const created = await res.json();
  return normalizeEvent(created, email);
}

async function deleteEvent(accessToken: string, email: string, eventId: string) {
  const res = await fetch(graphUrl(email, `/events/${eventId}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok && res.status !== 204) {
    const err = await res.text();
    throw new Error(`Delete event failed (${res.status}): ${err}`);
  }
  return true;
}

async function getFreeBusy(
  accessToken: string,
  emails: string[],
  startTime: string,
  endTime: string,
) {
  const body = {
    schedules: emails,
    startTime: { dateTime: startTime, timeZone: 'UTC' },
    endTime: { dateTime: endTime, timeZone: 'UTC' },
    availabilityViewInterval: 30,
  };

  const res = await fetch(
    'https://graph.microsoft.com/v1.0/me/calendar/getSchedule',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  // getSchedule may not work with application-level tokens; fall back to per-user calendarView
  if (!res.ok) {
    // Fallback: read each user's calendarView and infer busy blocks
    const results: any[] = [];
    for (const email of emails) {
      try {
        const events = await listEvents(accessToken, email, startTime, endTime);
        results.push({
          scheduleId: email,
          scheduleItems: events.map((ev: any) => ({
            status: ev.showAs || 'busy',
            start: ev.startTime,
            end: ev.endTime,
            subject: ev.title,
          })),
        });
      } catch (e) {
        results.push({ scheduleId: email, scheduleItems: [], error: (e as Error).message });
      }
    }
    return results;
  }

  const data = await res.json();
  return data.value || [];
}

async function updateEvent(
  accessToken: string,
  email: string,
  eventId: string,
  updates: Record<string, any>,
) {
  const graphUpdates: Record<string, any> = {};
  if (updates.subject) graphUpdates.subject = updates.subject;
  if (updates.startTime) graphUpdates.start = { dateTime: updates.startTime, timeZone: 'UTC' };
  if (updates.endTime) graphUpdates.end = { dateTime: updates.endTime, timeZone: 'UTC' };
  if (updates.body) graphUpdates.body = { contentType: 'text', content: updates.body };
  if (updates.location) graphUpdates.location = { displayName: updates.location };
  if (updates.showAs) graphUpdates.showAs = updates.showAs;
  if (updates.categories) graphUpdates.categories = updates.categories;

  const res = await fetch(graphUrl(email, `/events/${eventId}`), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(graphUpdates),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Update event failed (${res.status}): ${err}`);
  }

  const updated = await res.json();
  return normalizeEvent(updated, email);
}

async function listTeamAvailability(
  supabase: any,
  accessToken: string,
  startTime: string,
  endTime: string,
) {
  // Get all active users with microsoft_email
  const { data: users } = await supabase
    .from('custom_users')
    .select('id, username, microsoft_email, email')
    .eq('is_active', true)
    .not('microsoft_email', 'is', null);

  if (!users?.length) return [];

  const results: any[] = [];
  for (const user of users) {
    const msEmail = user.microsoft_email || user.email;
    if (!msEmail) continue;
    try {
      const events = await listEvents(accessToken, msEmail, startTime, endTime);
      results.push({
        userId: user.id,
        username: user.username,
        email: msEmail,
        events,
        busySlots: events
          .filter((e: any) => e.showAs === 'busy' || e.showAs === 'tentative')
          .map((e: any) => ({ start: e.startTime, end: e.endTime, title: e.title })),
      });
    } catch (e) {
      console.error(`[outlook-calendar] Failed to fetch for ${msEmail}:`, (e as Error).message);
      results.push({
        userId: user.id,
        username: user.username,
        email: msEmail,
        events: [],
        busySlots: [],
        error: (e as Error).message,
      });
    }
  }
  return results;
}

// ── Normalize Graph event to a flat shape ────────────────────────────

function normalizeEvent(ev: any, ownerEmail: string) {
  return {
    id: ev.id,
    title: ev.subject || '(No subject)',
    startTime: ev.start?.dateTime ? new Date(ev.start.dateTime + 'Z').toISOString() : null,
    endTime: ev.end?.dateTime ? new Date(ev.end.dateTime + 'Z').toISOString() : null,
    isAllDay: ev.isAllDay || false,
    location: ev.location?.displayName || null,
    bodyPreview: ev.bodyPreview || null,
    showAs: ev.showAs || 'busy',
    organizer: ev.organizer?.emailAddress?.address || null,
    attendees: (ev.attendees || []).map((a: any) => ({
      email: a.emailAddress?.address,
      name: a.emailAddress?.name,
      status: a.status?.response,
    })),
    categories: ev.categories || [],
    ownerEmail,
    source: 'outlook' as const,
    // Provide a calendarId compatible with GHL overlay system
    calendarId: `outlook_${ownerEmail}`,
    calendarName: `Outlook (${ownerEmail})`,
    calendarColor: '#0078d4', // Microsoft blue
    status: 'confirmed',
  };
}

// ── Main handler ─────────────────────────────────────────────────────

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate Microsoft config
    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !MICROSOFT_TENANT_ID) {
      return new Response(JSON.stringify({ error: 'Microsoft credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action } = body;

    // Authenticate
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.log('[outlook-calendar] Auth failed:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }
    console.log(`[outlook-calendar] User: ${userId}, action: ${action}`);

    // Resolve calling user's Microsoft email
    const userEmail = body.targetEmail || await resolveMicrosoftEmail(supabase, userId!);

    // Get Microsoft access token
    const accessToken = await getAccessToken();

    // ── Route actions ────────────────────────────────────────────────

    if (action === 'listEvents') {
      if (!userEmail) {
        return jsonResponse({ error: 'No Microsoft email configured for this user', events: [] }, corsHeaders);
      }
      const { startTime, endTime } = body;
      if (!startTime || !endTime) {
        return jsonResponse({ error: 'startTime and endTime are required' }, corsHeaders, 400);
      }
      const events = await listEvents(accessToken, userEmail, startTime, endTime);
      return jsonResponse({ success: true, events }, corsHeaders);
    }

    if (action === 'createEvent') {
      if (!userEmail) {
        return jsonResponse({ error: 'No Microsoft email configured for this user' }, corsHeaders, 400);
      }
      const event = await createEvent(accessToken, userEmail, body);
      return jsonResponse({ success: true, event }, corsHeaders);
    }

    if (action === 'updateEvent') {
      if (!userEmail) {
        return jsonResponse({ error: 'No Microsoft email configured' }, corsHeaders, 400);
      }
      const { eventId, ...updates } = body;
      const event = await updateEvent(accessToken, userEmail, body.eventId, updates);
      return jsonResponse({ success: true, event }, corsHeaders);
    }

    if (action === 'deleteEvent') {
      if (!userEmail) {
        return jsonResponse({ error: 'No Microsoft email configured' }, corsHeaders, 400);
      }
      await deleteEvent(accessToken, userEmail, body.eventId);
      return jsonResponse({ success: true }, corsHeaders);
    }

    if (action === 'freeBusy') {
      const emails = body.emails as string[];
      if (!emails?.length) {
        return jsonResponse({ error: 'emails array is required' }, corsHeaders, 400);
      }
      const { startTime, endTime } = body;
      const schedule = await getFreeBusy(accessToken, emails, startTime, endTime);
      return jsonResponse({ success: true, schedule }, corsHeaders);
    }

    if (action === 'teamAvailability') {
      const { startTime, endTime } = body;
      if (!startTime || !endTime) {
        return jsonResponse({ error: 'startTime and endTime required' }, corsHeaders, 400);
      }
      const team = await listTeamAvailability(supabase, accessToken, startTime, endTime);
      return jsonResponse({ success: true, team }, corsHeaders);
    }

    if (action === 'setMicrosoftEmail') {
      // Allow user to update their own microsoft_email
      const { microsoftEmail } = body;
      if (!userId || userId === 'service_role') {
        return jsonResponse({ error: 'User context required' }, corsHeaders, 400);
      }
      const { error: updateError } = await supabase
        .from('custom_users')
        .update({ microsoft_email: microsoftEmail || null })
        .eq('id', userId);

      if (updateError) {
        throw new Error(`Failed to update: ${updateError.message}`);
      }
      return jsonResponse({ success: true, microsoftEmail }, corsHeaders);
    }

    if (action === 'getMicrosoftEmail') {
      if (!userId || userId === 'service_role') {
        return jsonResponse({ error: 'User context required' }, corsHeaders, 400);
      }
      const email = await resolveMicrosoftEmail(supabase, userId);
      return jsonResponse({ success: true, microsoftEmail: email }, corsHeaders);
    }

    if (action === 'getOutlookSettings') {
      if (!userId || userId === 'service_role') {
        return jsonResponse({ error: 'User context required' }, corsHeaders, 400);
      }
      const { data: user } = await supabase
        .from('custom_users')
        .select('outlook_auto_prep_enabled, outlook_prep_minutes, outlook_follow_up_blocking, outlook_follow_up_default_duration')
        .eq('id', userId)
        .maybeSingle();
      return jsonResponse({
        success: true,
        settings: {
          autoPrepEnabled: user?.outlook_auto_prep_enabled || false,
          prepMinutes: user?.outlook_prep_minutes || 15,
          followUpBlocking: user?.outlook_follow_up_blocking || false,
          followUpDefaultDuration: user?.outlook_follow_up_default_duration || 30,
        },
      }, corsHeaders);
    }

    if (action === 'updateOutlookSettings') {
      if (!userId || userId === 'service_role') {
        return jsonResponse({ error: 'User context required' }, corsHeaders, 400);
      }
      const s = body.settings || {};
      const { error: updateError } = await supabase
        .from('custom_users')
        .update({
          outlook_auto_prep_enabled: s.autoPrepEnabled ?? false,
          outlook_prep_minutes: s.prepMinutes ?? 15,
          outlook_follow_up_blocking: s.followUpBlocking ?? false,
          outlook_follow_up_default_duration: s.followUpDefaultDuration ?? 30,
        })
        .eq('id', userId);
      if (updateError) throw new Error(updateError.message);
      return jsonResponse({ success: true }, corsHeaders);
    }

    // Agent tool: create event for a specific user by email (service-to-service)
    if (action === 'createEventForUser') {
      const targetEmail = body.targetUserEmail;
      if (!targetEmail) {
        return jsonResponse({ error: 'targetUserEmail is required' }, corsHeaders, 400);
      }
      const event = await createEvent(accessToken, targetEmail, body);
      return jsonResponse({ success: true, event }, corsHeaders);
    }

    // Agent tool: get team member Outlook settings
    if (action === 'getTeamOutlookStatus') {
      const { data: users } = await supabase
        .from('custom_users')
        .select('id, username, microsoft_email, outlook_auto_prep_enabled')
        .eq('is_active', true);
      const teamStatus = (users || []).map((u: any) => ({
        userId: u.id,
        username: u.username,
        microsoftEmail: u.microsoft_email || null,
        isConfigured: Boolean(u.microsoft_email),
        autoPrepEnabled: u.outlook_auto_prep_enabled || false,
      }));
      return jsonResponse({ success: true, team: teamStatus }, corsHeaders);
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, corsHeaders, 400);

  } catch (err) {
    console.error('[outlook-calendar] Error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function jsonResponse(data: any, corsHeaders: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
