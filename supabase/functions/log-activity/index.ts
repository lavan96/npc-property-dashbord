import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ActivityLogRequest {
  user_id: string;
  username: string;
  action_type: string;
  entity_type: string;
  entity_id?: string;
  entity_name?: string;
  metadata?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get request body
    const body: ActivityLogRequest = await req.json();
    
    // Get IP address and user agent from headers
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                      req.headers.get('x-real-ip') || 
                      'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    console.log(`[log-activity] Logging activity: ${body.action_type} by ${body.username}`);

    // Validate required fields
    if (!body.action_type || !body.entity_type) {
      return new Response(
        JSON.stringify({ error: 'action_type and entity_type are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Insert activity log
    const { data, error } = await supabase
      .from('activity_logs')
      .insert({
        user_id: body.user_id || null,
        username: body.username || 'Unknown',
        action_type: body.action_type,
        entity_type: body.entity_type,
        entity_id: body.entity_id || null,
        entity_name: body.entity_name || null,
        metadata: body.metadata || {},
        ip_address: ipAddress,
        user_agent: userAgent
      })
      .select('id')
      .single();

    if (error) {
      console.error('[log-activity] Error inserting activity log:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`[log-activity] Activity logged successfully: ${data.id}`);

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[log-activity] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
