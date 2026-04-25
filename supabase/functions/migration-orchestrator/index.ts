/**
 * Migration Orchestrator (Phase 2B)
 *
 * Superadmin-only entry point that:
 *   1. Creates a migration_jobs row
 *   2. Asynchronously dispatches the appropriate worker edge function
 *   3. Returns the job ID so the dashboard can poll status
 *
 * Workers do the heavy lifting in the background. The orchestrator returns
 * immediately so the UI never blocks on long-running migrations.
 *
 * SAFETY: dry_run defaults to true. Live writes require explicit
 * { dry_run: false } AND a typed confirmation token from the client.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import {
  verifyAuth,
  createCorsHeaders,
  createUnauthorizedResponse,
  createForbiddenResponse,
} from '../_shared/auth.ts';
import { createJob, type MigrationDomain } from '../_shared/migration-jobs.ts';
import {
  probeGhlCredentialScopes,
  requiredScopesForDomain,
  GHL_SCOPE_DOCS_URL,
} from '../_shared/ghl-account.ts';

const VALID_DOMAINS: MigrationDomain[] = ['contacts', 'opportunities', 'conversations', 'notes'];
const LIVE_WRITE_CONFIRMATION = 'MIGRATE-LIVE';

const WORKER_MAP: Record<MigrationDomain, string> = {
  contacts: 'ghl-migrate-contacts-worker',
  opportunities: 'ghl-migrate-opportunities-worker',
  conversations: 'ghl-migrate-conversations-worker',
  notes: 'ghl-migrate-notes-worker',
};

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));

    // Authn
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError || !userId) {
      return createUnauthorizedResponse(authError || 'Authentication required', corsHeaders);
    }

    // Authz: superadmin only
    if (userId !== 'service_role') {
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);
      const isSuperadmin = (roleRows || []).some((r: any) => r.role === 'superadmin');
      if (!isSuperadmin) {
        return createForbiddenResponse('Superadmin access required', corsHeaders);
      }
    }

    // Validate inputs
    const domain = body.domain as MigrationDomain;
    if (!VALID_DOMAINS.includes(domain)) {
      return jsonError(corsHeaders, `Invalid domain. Must be one of: ${VALID_DOMAINS.join(', ')}`, 400);
    }

    const source_account = body.source_account === 'new' ? 'new' : 'legacy';
    const target_account = body.target_account === 'new' ? 'new' : 'legacy';
    const dry_run = body.dry_run !== false; // default true

    if (source_account === target_account) {
      return jsonError(corsHeaders, 'source_account and target_account must differ', 400);
    }

    // Live writes require typed confirmation
    if (!dry_run && body.confirmation !== LIVE_WRITE_CONFIRMATION) {
      return jsonError(
        corsHeaders,
        `Live writes require confirmation. Pass { confirmation: "${LIVE_WRITE_CONFIRMATION}" }.`,
        400,
      );
    }

    // Optional payload — workers interpret this (e.g. limits, filters, scope)
    const payload = (body.payload && typeof body.payload === 'object') ? body.payload : {};

    // Create job row
    const jobId = await createJob(supabase, {
      domain,
      source_account,
      target_account,
      dry_run,
      payload: {
        ...payload,
        triggered_by: userId,
        triggered_at: new Date().toISOString(),
      },
      created_by: userId === 'service_role' ? null : userId,
    });

    console.log(
      `[migration-orchestrator] Created job ${jobId} domain=${domain} ` +
        `${source_account}→${target_account} dry_run=${dry_run}`,
    );

    // Dispatch worker asynchronously (don't await — fire & forget)
    const workerName = WORKER_MAP[domain];
    const workerUrl = `${supabaseUrl}/functions/v1/${workerName}`;

    // Use EdgeRuntime.waitUntil if available (Supabase Deno) so the worker
    // call survives after we return the response to the client.
    const dispatch = fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
        'x-internal-call': 'true',
      },
      body: JSON.stringify({
        job_id: jobId,
        source_account,
        target_account,
        dry_run,
        payload,
        _service_token: serviceRoleKey, // worker validates via verifyAuth's service role path
      }),
    }).then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error(`[migration-orchestrator] Worker dispatch failed for job ${jobId}: ${res.status} ${text.substring(0, 200)}`);
      } else {
        console.log(`[migration-orchestrator] Worker dispatched for job ${jobId}`);
      }
    }).catch((err) => {
      console.error(`[migration-orchestrator] Worker dispatch threw for job ${jobId}:`, err.message);
    });

    // @ts-ignore — EdgeRuntime is provided by the Deno deploy environment
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(dispatch);
    }

    return new Response(
      JSON.stringify({
        success: true,
        job_id: jobId,
        domain,
        source_account,
        target_account,
        dry_run,
        worker: workerName,
        message: dry_run
          ? 'Dry-run job dispatched. No data will be written.'
          : 'LIVE migration job dispatched. Data will be written to the target account.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('[migration-orchestrator] error:', err);
    return jsonError(corsHeaders, err.message || 'Internal error', 500);
  }
});

function jsonError(corsHeaders: Record<string, string>, message: string, status: number) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
