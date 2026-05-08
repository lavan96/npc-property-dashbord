/**
 * GHL Legacy Account Wipe — Worker (ONE-SHOT MODE)
 *
 * Replaces the previous resource-by-resource wiper with a single DELETE call
 * against `DELETE https://services.leadconnectorhq.com/locations/{locationId}`.
 *
 *   • dry_run = true  → GET /locations/{id} (preflight visibility + token check)
 *   • dry_run = false → DELETE /locations/{id} (vaporise the entire sub-account)
 *
 * On a successful LIVE delete (2xx) we immediately call finalize_ghl_cutover()
 * so the resolver flips default_account → 'new' for every other function.
 *
 * No pagination, no time budget, no resumability — finishes in one HTTP call.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import {
  getGhlCredentials,
  buildGhlHeaders,
  validateGhlCredentials,
} from '../_shared/ghl-account.ts';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let jobId: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    jobId = body.job_id;
    const internal = req.headers.get('x-internal-call') === 'true'
      || body._service_token === serviceRoleKey;

    if (!internal) {
      return json({ error: 'Forbidden — internal call only' }, 403);
    }
    if (!jobId) {
      return json({ error: 'job_id required' }, 400);
    }

    // Load job
    const { data: job, error: jobErr } = await supabase
      .from('legacy_wipe_jobs').select('*').eq('id', jobId).maybeSingle();
    if (jobErr || !job) throw new Error(`Job ${jobId} not found: ${jobErr?.message || 'no row'}`);
    if (job.status === 'completed' || job.status === 'cancelled' || job.status === 'failed') {
      return json({ skipped: true, reason: `Job already ${job.status}` });
    }

    // Lock
    await supabase.from('legacy_wipe_jobs').update({
      status: 'processing',
      worker_lock_until: new Date(Date.now() + 60_000).toISOString(),
      started_at: job.started_at || new Date().toISOString(),
    }).eq('id', jobId);

    const dry = !!job.dry_run;
    const creds = getGhlCredentials('legacy');
    const credsErr = validateGhlCredentials(creds);
    if (credsErr) throw new Error(credsErr);

    const url = `${GHL_API_BASE}/locations/${creds.locationId}`;
    const method = dry ? 'GET' : 'DELETE';
    const headers = buildGhlHeaders(creds.apiKey!);

    console.log(`[legacy-wipe-worker] ${method} ${url} (job ${jobId}, dry_run=${dry})`);
    const t0 = Date.now();
    const res = await fetch(url, { method, headers });
    const elapsedMs = Date.now() - t0;
    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* keep raw */ }

    const ok = res.status >= 200 && res.status < 300;

    const progress = {
      mode: 'one_shot_location_delete',
      action: dry ? 'preflight_get_location' : 'delete_location',
      target_location_id: creds.locationId,
      http_status: res.status,
      ok,
      elapsed_ms: elapsedMs,
      response_preview: text.substring(0, 1500),
      response_json: parsed && typeof parsed === 'object' ? parsed : null,
      finished_at: new Date().toISOString(),
    };

    if (!ok) {
      // Common: 401/403 (sub-account token can't delete its parent location)
      const friendly = friendlyErrorHint(res.status);
      const errMsg = `GHL returned ${res.status}: ${(parsed?.message || parsed?.error || text || 'no body').toString().substring(0, 400)}${friendly ? ` — ${friendly}` : ''}`;
      await supabase.from('legacy_wipe_jobs').update({
        status: 'failed',
        progress,
        last_error: errMsg,
        completed_at: new Date().toISOString(),
        worker_lock_until: null,
      }).eq('id', jobId);
      console.warn(`[legacy-wipe-worker] job ${jobId} failed: ${errMsg}`);
      return json({ success: false, dry_run: dry, http_status: res.status, error: errMsg });
    }

    // Success
    let cutoverFired = false;
    if (!dry) {
      try {
        const { error: rpcErr } = await supabase.rpc('finalize_ghl_cutover');
        if (rpcErr) {
          console.error(`[legacy-wipe-worker] finalize_ghl_cutover failed:`, rpcErr.message);
          progress.cutover_error = rpcErr.message;
        } else {
          cutoverFired = true;
          progress.cutover_fired_at = new Date().toISOString();
        }
      } catch (e: any) {
        console.error(`[legacy-wipe-worker] finalize_ghl_cutover threw:`, e.message);
        progress.cutover_error = e.message;
      }
    }

    await supabase.from('legacy_wipe_jobs').update({
      status: 'completed',
      progress,
      last_error: null,
      completed_at: new Date().toISOString(),
      worker_lock_until: null,
    }).eq('id', jobId);

    console.log(`[legacy-wipe-worker] job ${jobId} completed (dry_run=${dry}, cutover=${cutoverFired})`);
    return json({ success: true, dry_run: dry, cutover_fired: cutoverFired, http_status: res.status });
  } catch (err: any) {
    console.error('[legacy-wipe-worker] error:', err);
    if (jobId) {
      await supabase.from('legacy_wipe_jobs').update({
        status: 'failed',
        last_error: err.message || 'Unknown error',
        completed_at: new Date().toISOString(),
        worker_lock_until: null,
      }).eq('id', jobId);
    }
    return json({ success: false, error: err.message || 'Unknown error' }, 500);
  }
});

function friendlyErrorHint(status: number): string | null {
  if (status === 401 || status === 403) {
    return 'The legacy sub-account token does not have permission to delete its own location. You will need to either (a) supply an Agency-level API key with locations.write scope, or (b) delete the location manually in the GHL UI.';
  }
  if (status === 404) {
    return 'GHL says this location does not exist. It may already be deleted, or the configured GOHIGHLEVEL_LOCATION_ID is wrong.';
  }
  if (status === 429) return 'GHL rate limit hit. Wait a minute and re-run.';
  if (status >= 500) return 'GHL server error — try again in a minute.';
  return null;
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
