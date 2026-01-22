import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifySession, extractSessionToken, createUnauthorizedResponse } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();

    // Extract and verify session token
    const sessionToken = extractSessionToken(req.headers, body);
    const { error: authError, userId, username } = await verifySession(supabase, sessionToken);

    if (authError) {
      console.log('[manage-call-logs] Auth error:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }

    console.log(`[manage-call-logs] Authenticated user: ${username} (${userId})`);

    const { operation, callId, data } = body;

    if (!operation) {
      return new Response(
        JSON.stringify({ success: false, error: 'Operation is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Operation: updateTags - update tags for a call
    if (operation === 'updateTags') {
      if (!callId) {
        return new Response(
          JSON.stringify({ success: false, error: 'callId is required for updateTags' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[manage-call-logs] Updating tags for call: ${callId}`);
      
      const { error } = await supabase
        .from('vapi_call_logs')
        .update({ tags: data.tags })
        .eq('id', callId);

      if (error) {
        console.error('[manage-call-logs] Error updating tags:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Operation: update - general update for a call
    if (operation === 'update') {
      if (!callId || !data) {
        return new Response(
          JSON.stringify({ success: false, error: 'callId and data are required for update' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[manage-call-logs] Updating call: ${callId}`);
      
      const { error } = await supabase
        .from('vapi_call_logs')
        .update(data)
        .eq('id', callId);

      if (error) {
        console.error('[manage-call-logs] Error updating call:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Operation: delete - delete a call log
    if (operation === 'delete') {
      if (!callId) {
        return new Response(
          JSON.stringify({ success: false, error: 'callId is required for delete' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[manage-call-logs] Deleting call: ${callId}`);
      
      const { error } = await supabase
        .from('vapi_call_logs')
        .delete()
        .eq('id', callId);

      if (error) {
        console.error('[manage-call-logs] Error deleting call:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: `Unknown operation: ${operation}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[manage-call-logs] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
