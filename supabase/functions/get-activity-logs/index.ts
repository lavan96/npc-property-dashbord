import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyAuth, createUnauthorizedResponse, createCorsHeaders } from '../_shared/auth.ts';

interface ActivityLogsRequest {
  session_token?: string;
  action_filter?: string;
  entity_filter?: string;
  user_filter?: string;
  start_date?: string; // ISO
  end_date?: string;   // ISO
  page?: number;       // 1-based
  page_size?: number;
  limit?: number;      // legacy fallback (no pagination)
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: ActivityLogsRequest = await req.json();
    const {
      action_filter,
      entity_filter,
      user_filter,
      start_date,
      end_date,
      page,
      page_size,
      limit,
    } = body;

    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.error('[get-activity-logs] Auth failed:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }

    const { data: userData, error: userError } = await supabase
      .from('custom_users')
      .select('id, username, role')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: userRoles } = await supabase
      .from('user_roles').select('role').eq('user_id', userId);
    const roles = userRoles?.map(r => r.role) || [];
    const isAdmin = roles.includes('superadmin') || roles.includes('admin')
      || userData.role === 'superadmin' || userData.role === 'admin';

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Access denied. Admin privileges required.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build base query (with exact count for pagination)
    let query = supabase
      .from('activity_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (action_filter && action_filter !== 'all') query = query.eq('action_type', action_filter);
    if (entity_filter && entity_filter !== 'all') query = query.eq('entity_type', entity_filter);
    if (user_filter && user_filter !== 'all') query = query.eq('username', user_filter);
    if (start_date) query = query.gte('created_at', start_date);
    if (end_date) query = query.lte('created_at', end_date);

    // Pagination: prefer page/page_size, else fall back to legacy limit
    if (typeof page === 'number' && typeof page_size === 'number' && page_size > 0) {
      const from = (Math.max(1, page) - 1) * page_size;
      const to = from + page_size - 1;
      query = query.range(from, to);
    } else {
      query = query.limit(limit ?? 500);
    }

    const { data: logs, error: logsError, count } = await query;

    if (logsError) {
      console.error('[get-activity-logs] Error fetching logs:', logsError);
      return new Response(JSON.stringify({ error: logsError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Unique usernames for filter dropdown — fetch independently (not bounded by current page)
    const { data: userRows } = await supabase
      .from('activity_logs')
      .select('username')
      .not('username', 'is', null)
      .order('username', { ascending: true })
      .limit(2000);
    const uniqueUsers = [...new Set((userRows || []).map(r => r.username).filter(Boolean))];

    return new Response(
      JSON.stringify({ success: true, logs: logs || [], uniqueUsers, total: count ?? (logs?.length ?? 0) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[get-activity-logs] Unexpected error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
