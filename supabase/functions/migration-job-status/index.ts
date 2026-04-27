/**
 * Migration Job Status (Phase 2B)
 *
 * Superadmin-only read endpoint returning:
 *   - The full migration_jobs row(s)
 *   - Aggregate item status breakdown
 *   - Optionally the last N items (for live progress UI)
 *
 * Modes:
 *   - { job_id }       → single job + breakdown + recent items
 *   - { list: true }   → recent jobs across all domains
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import {
  verifyAuth,
  createCorsHeaders,
  createUnauthorizedResponse,
  createForbiddenResponse,
} from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));

    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError || !userId) return createUnauthorizedResponse(authError || 'Authentication required', corsHeaders);

    if (userId !== 'service_role') {
      const { data: roleRows } = await supabase.from('user_roles').select('role').eq('user_id', userId);
      const isSuperadmin = (roleRows || []).some((r: any) => r.role === 'superadmin');
      if (!isSuperadmin) return createForbiddenResponse('Superadmin access required', corsHeaders);
    }

    if (body.list) {
      const limit = Math.min(Number(body.limit) || 25, 100);
      const { data: jobs, error } = await supabase
        .from('migration_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      const enriched = (jobs || []).map((j: any) => annotateHealth(j));
      return new Response(JSON.stringify({ success: true, jobs: enriched }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const jobId = body.job_id;
    if (!jobId) {
      return new Response(JSON.stringify({ success: false, error: 'job_id or list=true required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: job, error: jobErr } = await supabase
      .from('migration_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();
    if (jobErr) throw new Error(jobErr.message);
    if (!job) {
      return new Response(JSON.stringify({ success: false, error: 'Job not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Recent items (latest 50 by processed_at desc)
    const { data: items } = await supabase
      .from('migration_job_items')
      .select('source_id, target_id, entity_label, status, error_message, error_category, is_retryable, processed_at')
      .eq('job_id', jobId)
      .order('processed_at', { ascending: false, nullsFirst: false })
      .limit(50);

    // Status breakdown + error category breakdown
    const breakdown: Record<string, number> = { pending: 0, succeeded: 0, failed: 0, skipped: 0 };
    const errorCategories: Record<string, number> = {};
    let retryableFailures = 0;
    let nonRetryableFailures = 0;

    const { data: allItems } = await supabase
      .from('migration_job_items')
      .select('status, error_category, is_retryable')
      .eq('job_id', jobId);
    (allItems || []).forEach((i: any) => {
      breakdown[i.status] = (breakdown[i.status] || 0) + 1;
      if (i.status === 'failed') {
        const cat = i.error_category || 'unknown';
        errorCategories[cat] = (errorCategories[cat] || 0) + 1;
        if (i.is_retryable) retryableFailures++; else nonRetryableFailures++;
      }
    });

    // Optional: full failed-item dump for CSV export (capped at 5000)
    let failed_items: any[] | undefined;
    if (body.include_failed_items === true) {
      const { data: fails } = await supabase
        .from('migration_job_items')
        .select('source_id, target_id, entity_label, status, error_message, error_category, is_retryable, processed_at, attempts')
        .eq('job_id', jobId)
        .eq('status', 'failed')
        .order('processed_at', { ascending: false, nullsFirst: false })
        .limit(5000);
      failed_items = fails || [];
    }

    return new Response(
      JSON.stringify({
        success: true,
        job,
        breakdown,
        error_categories: errorCategories,
        retryable_failures: retryableFailures,
        non_retryable_failures: nonRetryableFailures,
        recent_items: items || [],
        items: items || [], // back-compat with UI that reads `items`
        failed_items,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('[migration-job-status] error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
