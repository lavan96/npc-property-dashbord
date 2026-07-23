/**
 * Migration Dispatcher (Phase 2C)
 *
 * Lightweight cron-driven scheduler that picks up GHL migration jobs ready
 * to run and dispatches the appropriate worker. Replaces the fragile
 * "worker self-redispatch" pattern that died with its parent runtime.
 *
 * Flow:
 *   pg_cron (every 15s) → POST this function
 *     → claim_migration_jobs() RPC (atomic FOR UPDATE SKIP LOCKED)
 *     → for each claimed job: fire-and-forget worker fetch
 *     → return immediately (~1-2s execution)
 *
 * Workers process ONE batch (≤90s budget), checkpoint, exit. Their lease
 * (worker_lock_until) expires automatically; the next cron tick re-claims.
 *
 * Security: gated by either pg_cron Bearer (anon key, since fn doesn't
 * verify_jwt) OR the service-role token. Public callers are rejected.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyInternal } from '../_shared/auth_v2.ts';
import { callInternalFunction } from '../_shared/internalCall.ts';

const WORKER_MAP: Record<string, string> = {
  contacts: 'ghl-migrate-contacts-worker',
  opportunities: 'ghl-migrate-opportunities-worker',
  conversations: 'ghl-migrate-conversations-worker',
  conversations_replay: 'ghl-migrate-conversations-replay-worker',
  notes: 'ghl-migrate-notes-worker',
  calendar_groups: 'ghl-migrate-calendar-groups-worker',
  calendars: 'ghl-migrate-calendars-worker',
  bookings: 'ghl-migrate-bookings-worker',
  workflows_snapshot: 'ghl-migrate-workflows-snapshot-worker',
  workflow_enrollments_backfill: 'ghl-migrate-workflow-enrollments-worker',
  workflow_reenroll: 'ghl-migrate-workflow-reenroll-worker',
};

// How many jobs to fan out per tick. Each job runs in its own worker
// invocation, so this caps concurrent edge-function executions from cron.
const CLAIM_LIMIT = 4;
// Lease length — must exceed the worker's MAX_RUNTIME_MS plus buffer.
// Worker budget is 90s; 180s lease leaves safe margin.
const LEASE_SECONDS = 180;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-internal-call',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // AUTH-002: require a real internal credential. The dispatcher forwards the
  // INTERNAL_EDGE_SECRET to the workers, so its own trigger must be gated — the
  // previous "any Authorization header" check let anyone spin up the whole
  // migration pipeline.
  const gate = await verifyInternal(supabase, req, '');
  if (!gate.ok) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const startedAt = Date.now();

  try {
    const { data: jobs, error } = await supabase.rpc('claim_migration_jobs', {
      p_limit: CLAIM_LIMIT,
      p_lease_seconds: LEASE_SECONDS,
    });

    if (error) {
      console.error('[dispatcher] claim_migration_jobs RPC failed:', error.message);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const claimed = jobs || [];
    if (claimed.length === 0) {
      // Quiet path — nothing to do. Skip the log to avoid cron spam.
      return new Response(
        JSON.stringify({ success: true, claimed: 0, ms: Date.now() - startedAt }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(
      `[dispatcher] Claimed ${claimed.length} job(s):`,
      claimed.map((j: any) => `${j.id.substring(0, 8)}/${j.domain}#${j.dispatch_count}`).join(', '),
    );

    // Fire workers in parallel. We do NOT await them — workers run for up
    // to 90s and we want this dispatcher to return in <2s so cron stays
    // responsive. EdgeRuntime.waitUntil keeps the fetches alive after
    // we send the response.
    const dispatches = claimed.map(async (job: any) => {
      const workerName = WORKER_MAP[job.domain];
      if (!workerName) {
        console.error(`[dispatcher] Unknown domain: ${job.domain} (job ${job.id})`);
        // Release the lock so it doesn't wedge.
        await supabase.rpc('release_migration_job_lock', { p_job_id: job.id });
        await supabase.from('migration_jobs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_summary: `Unknown domain: ${job.domain}`,
        }).eq('id', job.id);
        return;
      }

      const url = `${supabaseUrl}/functions/v1/${workerName}`;
      try {
        const _anon = (Deno.env.get('SUPABASE_ANON_KEY') || '').trim();
        const _internalSecret = (Deno.env.get('INTERNAL_EDGE_SECRET') || '').trim();
        const r = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // AUTH-002: internal secret, not the service-role key (header or body).
            Authorization: `Bearer ${_anon}`,
            ...(_internalSecret ? { 'x-internal-edge-secret': _internalSecret } : {}),
            'x-internal-call': 'true',
          },
          body: JSON.stringify({
            job_id: job.id,
            source_account: job.source_account,
            target_account: job.target_account,
            dry_run: job.dry_run,
            payload: job.payload || {},
            _dispatched_by: 'cron',
            _dispatch_count: job.dispatch_count,
          }),
        });
        if (!r.ok) {
          const t = await r.text().catch(() => '');
          console.error(
            `[dispatcher] Worker ${workerName} returned ${r.status} for job ${job.id}: ${t.substring(0, 200)}`,
          );
        }
      } catch (e: any) {
        console.error(
          `[dispatcher] Dispatch fetch threw for job ${job.id}:`,
          e?.message || e,
        );
      }
    });

    const allDispatches = Promise.allSettled(dispatches);
    // @ts-ignore — EdgeRuntime is provided by Supabase Deno runtime
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(allDispatches);
    }

    return new Response(
      JSON.stringify({
        success: true,
        claimed: claimed.length,
        jobs: claimed.map((j: any) => ({
          id: j.id,
          domain: j.domain,
          dispatch_count: j.dispatch_count,
        })),
        ms: Date.now() - startedAt,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('[dispatcher] FATAL:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'dispatcher crashed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
