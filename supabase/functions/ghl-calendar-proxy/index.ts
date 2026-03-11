import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('GOHIGHLEVEL_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const locationId = Deno.env.get('GHL_LOCATION_ID') || '8guFPPbpJXYFsw5HDG28';

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GoHighLevel API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();

    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      return createUnauthorizedResponse(authError, corsHeaders);
    }

    console.log(`[ghl-calendar-proxy] Authenticated user: ${userId}, action: ${body.action}`);

    const { action, contactId } = body;

    if (action === 'getContactAppointments') {
      if (!contactId) {
        return new Response(JSON.stringify({ error: 'contactId is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const ghlHeaders = {
        'Authorization': `Bearer ${apiKey}`,
        'Version': '2021-04-15',
        'Content-Type': 'application/json',
      };

      // Fetch appointments for this contact from GHL
      const url = `${GHL_API_BASE}/contacts/${contactId}/appointments`;
      console.log(`[ghl-calendar-proxy] Fetching appointments: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: ghlHeaders,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ghl-calendar-proxy] GHL API error ${response.status}:`, errorText);
        return new Response(JSON.stringify({ 
          error: `GHL API error: ${response.status}`,
          details: errorText,
        }), {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const data = await response.json();
      console.log(`[ghl-calendar-proxy] Got ${data?.events?.length || 0} appointments`);

      return new Response(JSON.stringify({
        events: data.events || [],
        success: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[ghl-calendar-proxy] Error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
