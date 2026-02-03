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

    const body = await req.json();

    // Validate authentication (JWT first, then session token)
    const { error: authError, userId, username } = await verifyAuth(supabase, req.headers, body);

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

    // Operation: cleanupTestCalls - delete all calls from specified test phone numbers
    if (operation === 'cleanupTestCalls') {
      const { testNumbers } = data || {};
      
      if (!testNumbers || !Array.isArray(testNumbers) || testNumbers.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'testNumbers array is required for cleanupTestCalls' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[manage-call-logs] Cleaning up test calls for numbers:`, testNumbers);
      
      // First, count how many calls will be deleted
      const { count, error: countError } = await supabase
        .from('vapi_call_logs')
        .select('*', { count: 'exact', head: true })
        .in('phone_number', testNumbers);

      if (countError) {
        console.error('[manage-call-logs] Error counting test calls:', countError);
        return new Response(
          JSON.stringify({ success: false, error: countError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Delete all calls matching the test numbers
      const { error: deleteError } = await supabase
        .from('vapi_call_logs')
        .delete()
        .in('phone_number', testNumbers);

      if (deleteError) {
        console.error('[manage-call-logs] Error deleting test calls:', deleteError);
        return new Response(
          JSON.stringify({ success: false, error: deleteError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[manage-call-logs] Successfully deleted ${count} test calls`);

      return new Response(
        JSON.stringify({ success: true, deletedCount: count || 0 }),
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
