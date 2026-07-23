/**
 * ghl-marketing-dump-enqueue
 *
 * Creates a ghl_marketing_dump_jobs row, builds the asset queue
 * (lists from GHL), seeds total_assets, and fires the worker async.
 * Returns the job_id immediately for polling.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import {
  verifyAuth, createCorsHeaders, createUnauthorizedResponse, createForbiddenResponse,
} from '../_shared/auth.ts';
import { getGhlCredentials, validateGhlCredentials, buildGhlHeaders, type GhlAccount } from '../_shared/ghl-account.ts';
import { buildQueue } from '../_shared/ghl-asset-harvester.ts';

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
    if (authError || !userId) return createUnauthorizedResponse(authError || 'Auth required', corsHeaders);

    if (userId !== 'service_role') {
      const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', userId);
      const isSuper = (roles || []).some((r: any) => r.role === 'superadmin');
      if (!isSuper) return createForbiddenResponse('Superadmin only', corsHeaders);
    }

    const account: GhlAccount = body.account === 'new' ? 'new' : 'legacy';
    const useFirecrawl = body.use_firecrawl !== false;
    const downloadAssets = body.download_assets !== false;
    const requested: string[] = Array.isArray(body.resources) && body.resources.length
      ? body.resources : ['form', 'survey', 'funnel', 'workflow'];
    const funnelDomainOverrides: Record<string, string> = (body.funnel_domains && typeof body.funnel_domains === 'object')
      ? body.funnel_domains : {};

    const creds = getGhlCredentials(account);
    const credErr = validateGhlCredentials(creds);
    if (credErr) throw new Error(credErr);
    const headers = buildGhlHeaders(creds.apiKey!);

    // Build the queue NOW so we know total_assets up-front
    const queue = await buildQueue(headers, creds.locationId!, requested, { funnelDomainOverrides });

    const { data: job, error: insErr } = await supabase
      .from('ghl_marketing_dump_jobs')
      .insert({
        status: 'queued',
        account,
        requested_resources: requested,
        use_firecrawl: useFirecrawl,
        download_assets: downloadAssets,
        total_assets: queue.length,
        cursor: { phase: 'process', index: 0, queue },
        created_by: userId === 'service_role' ? null : userId,
      })
      .select('id')
      .single();

    if (insErr || !job) throw new Error(`Failed to create job: ${insErr?.message}`);

    // Fire worker (AUTH-002: authenticate with the dedicated internal secret,
    // not the service-role key; anon key only routes the gateway).
    const anonKey = (Deno.env.get('SUPABASE_ANON_KEY') || '').trim();
    const internalEdgeSecret = (Deno.env.get('INTERNAL_EDGE_SECRET') || '').trim();
    const workerUrl = `${supabaseUrl}/functions/v1/ghl-marketing-dump-worker`;
    const workerCall = fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${internalEdgeSecret ? anonKey : serviceRoleKey}`,
        ...(internalEdgeSecret ? { 'x-internal-edge-secret': internalEdgeSecret } : {}),
        'x-internal-call': 'true',
      },
      body: JSON.stringify({ job_id: job.id }),
    }).catch((e) => console.error('[enqueue] worker dispatch threw', e));

    // @ts-ignore
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(workerCall);
    }

    return new Response(JSON.stringify({ success: true, job_id: job.id, total_assets: queue.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[ghl-marketing-dump-enqueue] error:', e);
    return new Response(JSON.stringify({ success: false, error: e.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
