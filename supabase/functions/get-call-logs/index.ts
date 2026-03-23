import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth, createUnauthorizedResponse, createCorsHeaders } from "../_shared/auth.ts";

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is allowed for list mode
    }

    // Validate authentication (JWT first, then session token)
    const { error: authError, userId, username } = await verifyAuth(supabase, req.headers, body);

    if (authError) {
      console.log('[get-call-logs] Auth error:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }

    console.log(`[get-call-logs] Authenticated user: ${username} (${userId})`);

    const { 
      mode = 'list',  // 'single', 'list', 'live', 'errors'
      callId,
      listOptions = {}
    } = body;

    // Mode: single - fetch a single call by ID
    if (mode === 'single' && callId) {
      console.log(`[get-call-logs] Fetching single call: ${callId}`);
      
      const { data, error } = await supabase
        .from('vapi_call_logs')
        .select('*')
        .eq('id', callId)
        .single();

      if (error) {
        console.error('[get-call-logs] Error fetching call:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, call: data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mode: live - fetch only active calls (ringing, in-progress, queued)
    if (mode === 'live') {
      console.log('[get-call-logs] Fetching live calls');
      
      const { data, error } = await supabase
        .from('vapi_call_logs')
        .select('id, vapi_call_id, agent_name, phone_number, customer_name, call_direction, call_status, started_at, is_squad_call, squad_name, call_intent')
        .in('call_status', ['in-progress', 'ringing', 'queued'])
        .order('started_at', { ascending: false });

      if (error) {
        console.error('[get-call-logs] Error fetching live calls:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, calls: data || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mode: errors - fetch calls with error outcomes
    if (mode === 'errors') {
      const { cutoffDate, limit = 100 } = listOptions;
      console.log('[get-call-logs] Fetching error calls');
      
      let query = supabase
        .from('vapi_call_logs')
        .select('*')
        .in('call_outcome', ['failed', 'error', 'timeout', 'no-answer']);

      if (cutoffDate) {
        query = query.gte('created_at', cutoffDate);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[get-call-logs] Error fetching error calls:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, calls: data || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mode: list - fetch all calls with optional filters
    console.log('[get-call-logs] Fetching call list with options:', listOptions);
    
    const { 
      orderBy = 'started_at',
      ascending = false,
      limit = 1000,
      offset = 0,
      status,
      outcome,
      agentId,
      squadId,
      direction,
      intent,
      startDate,
      endDate
    } = listOptions;

    let query = supabase
      .from('vapi_call_logs')
      .select('*');

    // Apply filters
    if (status) {
      query = query.eq('call_status', status);
    }
    if (outcome) {
      query = query.eq('call_outcome', outcome);
    }
    if (agentId) {
      query = query.eq('agent_id', agentId);
    }
    if (squadId) {
      query = query.eq('squad_id', squadId);
    }
    if (direction) {
      query = query.eq('call_direction', direction);
    }
    if (intent) {
      query = query.eq('call_intent', intent);
    }
    if (startDate) {
      query = query.gte('started_at', startDate);
    }
    if (endDate) {
      query = query.lte('started_at', endDate);
    }

    // Apply ordering and pagination
    // Use created_at as secondary sort to prevent NULL started_at rows floating to top
    query = query
      .order(orderBy, { ascending, nullsFirst: false })
      .range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      console.error('[get-call-logs] Error fetching calls:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, calls: data || [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[get-call-logs] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
