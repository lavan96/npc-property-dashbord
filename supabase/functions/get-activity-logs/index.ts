import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ActivityLogsRequest {
  session_token?: string;
  action_filter?: string;
  entity_filter?: string;
  user_filter?: string;
  limit?: number;
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
    const body: ActivityLogsRequest = await req.json();
    const { session_token, action_filter, entity_filter, user_filter, limit = 500 } = body;

    // Validate session token
    if (!session_token) {
      console.error('[get-activity-logs] No session token provided');
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Verify session
    const { data: sessionData, error: sessionError } = await supabase
      .from('user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', session_token)
      .single();

    if (sessionError || !sessionData) {
      console.error('[get-activity-logs] Invalid session token');
      return new Response(
        JSON.stringify({ error: 'Invalid session' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Check if session is expired
    if (new Date(sessionData.expires_at) < new Date()) {
      console.error('[get-activity-logs] Session expired');
      return new Response(
        JSON.stringify({ error: 'Session expired' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get user info to check permissions
    const { data: userData, error: userError } = await supabase
      .from('custom_users')
      .select('id, username, role')
      .eq('id', sessionData.user_id)
      .single();

    if (userError || !userData) {
      console.error('[get-activity-logs] User not found');
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Check if user has admin/superadmin role (only admins should see activity logs)
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', sessionData.user_id);

    const roles = userRoles?.map(r => r.role) || [];
    const isAdmin = roles.includes('superadmin') || roles.includes('admin') || userData.role === 'superadmin' || userData.role === 'admin';

    if (!isAdmin) {
      console.error('[get-activity-logs] User does not have admin access');
      return new Response(
        JSON.stringify({ error: 'Access denied. Admin privileges required.' }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`[get-activity-logs] Fetching logs for admin user: ${userData.username}`);

    // Build query with filters
    let query = supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (action_filter && action_filter !== 'all') {
      query = query.eq('action_type', action_filter);
    }
    if (entity_filter && entity_filter !== 'all') {
      query = query.eq('entity_type', entity_filter);
    }
    if (user_filter && user_filter !== 'all') {
      query = query.eq('username', user_filter);
    }

    const { data: logs, error: logsError } = await query;

    if (logsError) {
      console.error('[get-activity-logs] Error fetching logs:', logsError);
      return new Response(
        JSON.stringify({ error: logsError.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get unique usernames for filter dropdown
    const uniqueUsers = [...new Set(logs?.map(l => l.username).filter(Boolean))];

    console.log(`[get-activity-logs] Successfully fetched ${logs?.length || 0} logs`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        logs: logs || [],
        uniqueUsers
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[get-activity-logs] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
