import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse, createForbiddenResponse } from '../_shared/auth.ts';

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));

    const authResult = await verifyAuth(supabase, req.headers, body);
    if (authResult.error) {
      return createUnauthorizedResponse(authResult.error, corsHeaders);
    }

    // Check superadmin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', authResult.userId)
      .eq('role', 'superadmin')
      .single();

    if (!roleData) {
      return createForbiddenResponse('Superadmin access required', corsHeaders);
    }

    const { mode = 'overview', days = 30, service_filter } = body;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString();

    if (mode === 'overview') {
      // Summary stats
      const { data: allLogs, error: logsError } = await supabase
        .from('api_health_log')
        .select('*')
        .gte('created_at', startDateStr)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (logsError) throw logsError;
      const logs = allLogs || [];

      const totalCalls = logs.length;
      const successCalls = logs.filter((l: any) => l.status === 'success').length;
      const errorCalls = logs.filter((l: any) => l.status === 'error').length;
      const successRate = totalCalls > 0 ? Math.round((successCalls / totalCalls) * 10000) / 100 : 0;
      const avgResponseTime = totalCalls > 0
        ? Math.round(logs.reduce((sum: number, l: any) => sum + (l.response_time_ms || 0), 0) / totalCalls)
        : 0;

      // Service breakdown
      const serviceMap: Record<string, { total: number; success: number; errors: number; avgTime: number; times: number[] }> = {};
      for (const log of logs) {
        const svc = log.service_name || 'unknown';
        if (!serviceMap[svc]) serviceMap[svc] = { total: 0, success: 0, errors: 0, avgTime: 0, times: [] };
        serviceMap[svc].total++;
        if (log.status === 'success') serviceMap[svc].success++;
        else serviceMap[svc].errors++;
        if (log.response_time_ms) serviceMap[svc].times.push(log.response_time_ms);
      }

      const serviceBreakdown = Object.entries(serviceMap).map(([name, stats]) => ({
        service: name,
        total: stats.total,
        success: stats.success,
        errors: stats.errors,
        successRate: stats.total > 0 ? Math.round((stats.success / stats.total) * 10000) / 100 : 0,
        avgResponseTime: stats.times.length > 0
          ? Math.round(stats.times.reduce((a, b) => a + b, 0) / stats.times.length)
          : 0,
      }));

      // Daily volume for charts
      const dailyMap: Record<string, Record<string, { success: number; errors: number; avgTime: number; times: number[] }>> = {};
      for (const log of logs) {
        const day = log.created_at.substring(0, 10);
        const svc = log.service_name || 'unknown';
        if (!dailyMap[day]) dailyMap[day] = {};
        if (!dailyMap[day][svc]) dailyMap[day][svc] = { success: 0, errors: 0, avgTime: 0, times: [] };
        if (log.status === 'success') dailyMap[day][svc].success++;
        else dailyMap[day][svc].errors++;
        if (log.response_time_ms) dailyMap[day][svc].times.push(log.response_time_ms);
      }

      const dailyVolume = Object.entries(dailyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, services]) => {
          const entry: Record<string, any> = { date };
          for (const [svc, stats] of Object.entries(services)) {
            entry[svc] = stats.success + stats.errors;
            entry[`${svc}_success`] = stats.success;
            entry[`${svc}_errors`] = stats.errors;
            entry[`${svc}_avgTime`] = stats.times.length > 0
              ? Math.round(stats.times.reduce((a, b) => a + b, 0) / stats.times.length)
              : 0;
          }
          return entry;
        });

      // Data quality breakdown
      const qualityMap: Record<string, number> = {};
      for (const log of logs) {
        const q = log.data_quality || 'unknown';
        qualityMap[q] = (qualityMap[q] || 0) + 1;
      }

      // Recent logs (last 50)
      const recentLogs = logs.slice(0, 50).map((l: any) => ({
        id: l.id,
        service: l.service_name,
        endpoint: l.endpoint,
        status: l.status,
        responseTime: l.response_time_ms,
        dataQuality: l.data_quality,
        error: l.error_message,
        createdAt: l.created_at,
      }));

      // Unique services
      const services = [...new Set(logs.map((l: any) => l.service_name))].filter(Boolean);

      return new Response(JSON.stringify({
        success: true,
        summary: {
          totalCalls,
          successCalls,
          errorCalls,
          successRate,
          avgResponseTime,
          activeServices: services.length,
          period: `${days} days`,
        },
        serviceBreakdown,
        dailyVolume,
        dataQuality: qualityMap,
        services,
        recentLogs,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Invalid mode' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in get-api-usage-stats:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
