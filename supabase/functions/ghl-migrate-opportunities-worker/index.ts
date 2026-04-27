/**
 * GHL Migrate: OPPORTUNITIES Worker (Phase 2B)
 *
 * Recreates open opportunities in the target account, mapping:
 *   - contactId  → via ghl_id_mapping (must be migrated FIRST)
 *   - pipelineId → exact pipeline NAME match in target
 *   - pipelineStageId → exact stage NAME match within mapped pipeline
 *
 * Skips opportunities whose contact has not yet been mapped.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import {
  getGhlCredentials,
  validateGhlCredentials,
  buildGhlHeaders,
  resolveGhlAccessTokenForLocation,
  describeGhlWriteAuthFailure,
  parseGhlError,
} from '../_shared/ghl-account.ts';
import {
  startJob, finishJob, recordItem, recordIdMapping, updateJobProgress,
  saveCheckpoint, loadCheckpoint, partialExit, heartbeat,
  resolveTargetContactByName, readControlSignal, sanitizeContactNameParts, mergeJobPayload, normalizeContactName,
} from '../_shared/migration-jobs.ts';
import { tokenKeyFor } from '../_shared/ghl-rate-limiter.ts';
import { createGhlFetchContext, type GhlFetchContext } from '../_shared/ghl-worker-fetch.ts';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
// GHL hard-caps /opportunities/search at 100 per page. We request the
// max and walk every page via cursor — there is NO total-record cap.
const PAGE_LIMIT = 100;
// 110s leaves ~40s headroom inside the 150s edge cap for graceful
// checkpoint + finishJob, mirroring the contacts worker.
const MAX_RUNTIME_MS = 110_000;

function isPlaceholderResolutionName(name: string): boolean {
  const normalized = normalizeContactName(name);
  return !normalized || normalized === 'unknown unknown' || normalized === 'unknown';
}

async function targetContactExists(
  ctx: GhlFetchContext,
  contactId: string,
  headers: Record<string, string>,
): Promise<boolean> {
  const res = await ctx.ghlFetch(`${GHL_API_BASE}/contacts/${contactId}`, { headers }, 2, 'target');
  if (res.status === 404 || res.status === 410) return false;
  if (!res.ok) return true; // unknown error → assume exists, don't drop the mapping
  // GHL sometimes returns 200 for soft-deleted contacts. Detect that so we
  // re-resolve via name instead of POSTing an opp that will 400 with
  // "The opportunity contact is deleted".
  try {
    const body = await res.json();
    const c = body?.contact || body;
    if (!c || c.deleted === true || c.isDeleted === true || c.status === 'deleted') return false;
    return true;
  } catch {
    return true;
  }
}

/**
 * Look for an existing opportunity in the target account that matches this
 * source opportunity. We use a strict matcher: contactId + pipelineId scope
 * the search, and we only declare a match when name (case-insensitive,
 * trimmed) AND monetaryValue (within $1) BOTH agree. This prevents the
 * earlier "two legacy opps collapse to one target opp" false positives
 * caused by name-only matching.
 *
 * Returns:
 *   { id, confidence: 'medium' }  — strict name+value match, safe to map
 *   { id, confidence: 'low' }     — name matches but value differs OR
 *                                   multiple candidates share the name;
 *                                   recorded for audit, NOT auto-mapped
 *   null                          — no candidate found at all
 */
async function findExistingTargetOpportunity(
  ctx: GhlFetchContext,
  locationId: string,
  contactId: string,
  pipelineId: string,
  name: string,
  monetaryValue: number | null,
  headers: Record<string, string>,
): Promise<{ id: string; confidence: 'medium' | 'low' } | null> {
  try {
    const params = new URLSearchParams({
      location_id: locationId,
      contact_id: contactId,
      pipeline_id: pipelineId,
      limit: '100',
    });
    const res = await ctx.ghlFetch(
      `${GHL_API_BASE}/opportunities/search?${params}`,
      { headers }, 2, 'target',
    );
    if (!res.ok) return null;
    const data = await res.json();
    const opps: any[] = data.opportunities || [];
    if (opps.length === 0) return null;

    const wanted = (name || '').trim().toLowerCase();
    const nameMatches = opps.filter((o) => (o.name || '').trim().toLowerCase() === wanted);
    if (nameMatches.length === 0) return null;

    // If we have a monetaryValue, require it to agree (within $1) for a
    // medium-confidence match. Otherwise the best we can claim is "low".
    if (typeof monetaryValue === 'number' && !Number.isNaN(monetaryValue)) {
      const valueMatches = nameMatches.filter((o) => {
        const v = typeof o.monetaryValue === 'number' ? o.monetaryValue : Number(o.monetaryValue);
        return !Number.isNaN(v) && Math.abs(v - monetaryValue) < 1;
      });
      if (valueMatches.length === 1) {
        return { id: valueMatches[0].id, confidence: 'medium' };
      }
      if (valueMatches.length > 1) {
        return { id: valueMatches[0].id, confidence: 'low' };
      }
      // Name matched but no value match — ambiguous.
      return { id: nameMatches[0].id, confidence: 'low' };
    }

    // No source monetaryValue to compare against.
    if (nameMatches.length === 1) {
      return { id: nameMatches[0].id, confidence: 'medium' };
    }
    return { id: nameMatches[0].id, confidence: 'low' };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  if (req.method === 'OPTIONS') return new Response('ok');
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let supabase: any;
  let jobId: string | null = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const body = await req.json().catch(() => ({}));
    if (body._service_token !== serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }

    supabase = createClient(supabaseUrl, serviceRoleKey);
    jobId = body.job_id as string;
    const sourceAccount = body.source_account as 'legacy' | 'new';
    const targetAccount = body.target_account as 'legacy' | 'new';
    const dryRun = body.dry_run !== false;
    const payload = body.payload || {};
    const maxItems = Number(payload.max_items) || 0;

    // ── Opportunity-specific toggles (mirror the contacts worker pattern)
    // All default to safe/back-compat values so existing dispatches behave
    // identically. See GhlMigration UI for user-facing labels.
    const forceRecreate = payload.force_recreate_opportunities === true;
    const skipTargetDedupe = payload.skip_target_dedupe_check === true;
    const onlyLowConfidence = payload.only_low_confidence === true;
    const includeClosedStatuses = payload.include_closed_statuses === true;
    const pipelineFilter: string[] = Array.isArray(payload.pipeline_filter)
      ? payload.pipeline_filter.map((s: any) => String(s).trim().toLowerCase()).filter(Boolean)
      : [];
    const stageFilter: string[] = Array.isArray(payload.stage_filter)
      ? payload.stage_filter.map((s: any) => String(s).trim().toLowerCase()).filter(Boolean)
      : [];
    const assignedUserStrategy: 'single' | 'map_by_email' | 'omit' =
      payload.assigned_user_strategy === 'map_by_email' ? 'map_by_email'
      : payload.assigned_user_strategy === 'omit' ? 'omit'
      : 'single';

    console.log(`[opps-worker] flags: forceRecreate=${forceRecreate} skipTargetDedupe=${skipTargetDedupe} onlyLowConfidence=${onlyLowConfidence} includeClosed=${includeClosedStatuses} pipelineFilter=${pipelineFilter.length} stageFilter=${stageFilter.length} assignStrategy=${assignedUserStrategy}`);

    if (!jobId) return new Response(JSON.stringify({ error: 'job_id required' }), { status: 400 });

    const sourceCreds = getGhlCredentials(sourceAccount);
    const targetCreds = getGhlCredentials(targetAccount);
    const sErr = validateGhlCredentials(sourceCreds);
    const tErr = validateGhlCredentials(targetCreds);
    if (sErr || tErr) {
      await finishJob(supabase, jobId, 'failed', sErr || tErr || 'Missing credentials');
      return new Response(JSON.stringify({ error: sErr || tErr }), { status: 400 });
    }

    const sourceHeaders = buildGhlHeaders(sourceCreds.apiKey!);
    const targetAccess = dryRun
      ? { accessToken: targetCreds.apiKey!, diagnostics: null as any }
      : await resolveGhlAccessTokenForLocation(targetCreds);
    const targetHeaders = buildGhlHeaders(targetAccess.accessToken);
    const targetAuthHint = targetAccess.diagnostics
      ? describeGhlWriteAuthFailure(targetAccess.diagnostics)
      : null;

    // Shared cross-isolate rate limiter + circuit breaker.
    // Every GHL call below routes through ctx.ghlFetch so all workers/cron
    // jobs cooperate on the per-token rolling window and back off together
    // on a 429 burst.
    const ctx = createGhlFetchContext({
      supabase,
      sourceTokenKey: tokenKeyFor(sourceAccount, sourceCreds.apiKey),
      targetTokenKey: tokenKeyFor(targetAccount, targetAccess.accessToken),
      logTag: 'opps-worker',
    });

    if (!dryRun && targetAccess.diagnostics) {
      console.log('[opps-worker] target token diagnostics:', JSON.stringify({
        token_type_hint: targetAccess.diagnostics.token_type_hint,
        has_location_id: targetAccess.diagnostics.has_location_id,
        location_id_matches_secret: targetAccess.diagnostics.location_id_matches_secret,
        has_company_id: targetAccess.diagnostics.has_company_id,
        exchange_attempted: targetAccess.diagnostics.exchange_attempted || false,
        exchange_succeeded: targetAccess.diagnostics.exchange_succeeded || false,
        exchange_error: targetAccess.diagnostics.exchange_error || null,
      }));
    }

    console.log(`[opps-worker] job=${jobId} ${sourceAccount}→${targetAccount} dry_run=${dryRun}`);

    // Build pipeline-name → target pipeline+stages map
    const targetPipelinesRes = await ctx.ghlFetch(
      `${GHL_API_BASE}/opportunities/pipelines?locationId=${targetCreds.locationId}`,
      { headers: targetHeaders }, 3, 'target',
    );
    if (!targetPipelinesRes.ok) {
      const t = await targetPipelinesRes.text();
      throw new Error(`Target pipelines fetch failed: ${targetPipelinesRes.status} ${t.substring(0, 200)}`);
    }
    const targetPipelinesData = await targetPipelinesRes.json();
    const targetPipelines: any[] = targetPipelinesData.pipelines || [];

    const sourcePipelinesRes = await ctx.ghlFetch(
      `${GHL_API_BASE}/opportunities/pipelines?locationId=${sourceCreds.locationId}`,
      { headers: sourceHeaders }, 3, 'source',
    );
    if (!sourcePipelinesRes.ok) {
      const t = await sourcePipelinesRes.text();
      throw new Error(`Source pipelines fetch failed: ${sourcePipelinesRes.status} ${t.substring(0, 200)}`);
    }
    const sourcePipelinesData = await sourcePipelinesRes.json();
    const sourcePipelines: any[] = sourcePipelinesData.pipelines || [];

    // Build lookup: source pipelineId → { targetPipelineId, stageMap{ srcStageId: targetStageId } }
    const pipelineMap = new Map<string, { targetPipelineId: string; targetPipelineName: string; stageMap: Map<string, string> }>();
    const unmappedPipelines: string[] = [];

    for (const sp of sourcePipelines) {
      // ── Pipeline filter (allow-list by name, case-insensitive) ──────
      if (pipelineFilter.length > 0) {
        const spName = (sp.name || '').trim().toLowerCase();
        if (!pipelineFilter.includes(spName)) {
          console.log(`[opps-worker] pipeline_filter: skipping source pipeline "${sp.name}"`);
          continue;
        }
      }
      const tp = targetPipelines.find((p) => p.name?.trim().toLowerCase() === sp.name?.trim().toLowerCase());
      if (!tp) {
        unmappedPipelines.push(sp.name);
        continue;
      }
      const stageMap = new Map<string, string>();
      for (const ss of (sp.stages || [])) {
        // ── Stage filter (allow-list by name, case-insensitive) ───────
        if (stageFilter.length > 0) {
          const ssName = (ss.name || '').trim().toLowerCase();
          if (!stageFilter.includes(ssName)) continue;
        }
        const ts = (tp.stages || []).find((s: any) => s.name?.trim().toLowerCase() === ss.name?.trim().toLowerCase());
        if (ts) stageMap.set(ss.id, ts.id);
      }
      pipelineMap.set(sp.id, { targetPipelineId: tp.id, targetPipelineName: tp.name, stageMap });
      // Persist pipeline + stage mapping (informational)
      if (!dryRun) {
        await recordIdMapping(supabase, {
          resource_type: 'pipeline', old_ghl_id: sp.id, new_ghl_id: tp.id,
          source_account_label: sourceAccount, target_account_label: targetAccount, notes: sp.name,
        });
        for (const [srcStage, tgtStage] of stageMap.entries()) {
          await recordIdMapping(supabase, {
            resource_type: 'pipeline_stage', old_ghl_id: srcStage, new_ghl_id: tgtStage,
            source_account_label: sourceAccount, target_account_label: targetAccount,
          });
        }
      }
    }

    if (unmappedPipelines.length) {
      console.warn(`[opps-worker] Pipelines not found in target by name: ${unmappedPipelines.join(', ')}`);
    }

    // Resolve the single target-account user that all migrated opportunities
    // will be assigned to. Allows override via payload.target_assigned_user_id;
    // otherwise probes location-scoped user endpoints (the company /users/
    // endpoint sometimes returns agency users whose IDs are NOT valid for
    // location-scoped opportunity writes, which is why GHL was returning
    // "The assigned to field is invalid" 400s).
    let targetAssignedUserId: string | null = (payload.target_assigned_user_id as string) || null;
    // Email-keyed map populated when assignedUserStrategy === 'map_by_email'.
    // Keys are lowercase-trimmed emails; values are target-account user IDs.
    const targetUserByEmail = new Map<string, string>();
    // Source-account user lookup (id → email). Populated lazily for map_by_email.
    const sourceUserEmailById = new Map<string, string>();

    const needTargetUsers = !dryRun && (
      assignedUserStrategy === 'single' || assignedUserStrategy === 'map_by_email'
    );
    if (needTargetUsers && (!targetAssignedUserId || assignedUserStrategy === 'map_by_email')) {
      const userEndpoints = [
        `${GHL_API_BASE}/locations/${targetCreds.locationId}/users`,
        `${GHL_API_BASE}/users/?locationId=${targetCreds.locationId}`,
      ];
      for (const url of userEndpoints) {
        try {
          const usersRes = await ctx.ghlFetch(url, { headers: targetHeaders }, 2, 'target');
          if (!usersRes.ok) {
            const errBody = await usersRes.text();
            console.warn(`[opps-worker] ${url} → ${usersRes.status}: ${errBody.substring(0, 160)}`);
            continue;
          }
          const usersData = await usersRes.json();
          const users: any[] = usersData.users || usersData.locationUsers || [];
          if (users.length === 0) continue;
          // Build email→ID map for map_by_email strategy.
          for (const u of users) {
            const e = (u.email || '').trim().toLowerCase();
            if (e && u.id) targetUserByEmail.set(e, u.id);
          }
          if (!targetAssignedUserId) {
            // Prefer users explicitly bound to the target location.
            const located = users.find((u) =>
              Array.isArray(u.roles?.locationIds) ? u.roles.locationIds.includes(targetCreds.locationId)
                : Array.isArray(u.locationIds) ? u.locationIds.includes(targetCreds.locationId)
                : true,
            ) || users[0];
            targetAssignedUserId = located.id;
            console.log(`[opps-worker] Default assignedTo=${targetAssignedUserId} (${located.name || located.email || 'unnamed'}) via ${url} — ${users.length} candidate(s); email_map_size=${targetUserByEmail.size}`);
          }
          break;
        } catch (e: any) {
          console.warn(`[opps-worker] ${url} threw: ${e.message}`);
        }
      }
      if (!targetAssignedUserId) {
        console.warn('[opps-worker] No target user resolved — opportunities will be created WITHOUT assignedTo (omitted from POST body)');
      }
      if (assignedUserStrategy === 'map_by_email') {
        console.log(`[opps-worker] map_by_email: resolved ${targetUserByEmail.size} target users by email`);
      }
    }

    // For map_by_email we also need source users keyed by ID so we can look
    // up the source assignee's email and rebind to the target by email.
    if (!dryRun && assignedUserStrategy === 'map_by_email') {
      const sourceEndpoints = [
        `${GHL_API_BASE}/locations/${sourceCreds.locationId}/users`,
        `${GHL_API_BASE}/users/?locationId=${sourceCreds.locationId}`,
      ];
      for (const url of sourceEndpoints) {
        try {
          const usersRes = await ctx.ghlFetch(url, { headers: sourceHeaders }, 2, 'source');
          if (!usersRes.ok) continue;
          const usersData = await usersRes.json();
          const users: any[] = usersData.users || usersData.locationUsers || [];
          for (const u of users) {
            const e = (u.email || '').trim().toLowerCase();
            if (e && u.id) sourceUserEmailById.set(u.id, e);
          }
          if (sourceUserEmailById.size > 0) break;
        } catch { /* ignore */ }
      }
      console.log(`[opps-worker] map_by_email: resolved ${sourceUserEmailById.size} source users by id`);
    }

    const checkpoint = await loadCheckpoint(supabase, jobId);
    const isResume = body._resume === true || !!checkpoint.cursor.startAfterId;
    if (isResume) {
      console.log(`[opps-worker] RESUMING job=${jobId} dispatch#${checkpoint.dispatchCount} cursor=${JSON.stringify(checkpoint.cursor)}`);
    } else {
      await startJob(supabase, jobId, 0);
    }

    // ── Scope force_recreate to the FIRST leg only ──────────────────────
    // forceRecreate=true makes every redo "succeed" at deletion+POST,
    // which masks no-progress loops (the 200-mark duplicate flood). On a
    // resumed leg we should treat existing target mappings as a hit and
    // skip — preserving the operator's original intent for the first pass
    // without compounding duplicates if the worker gets re-dispatched.
    const effectiveForceRecreate = forceRecreate && !isResume;
    if (forceRecreate && isResume) {
      console.log(`[opps-worker] forceRecreate disabled on resume leg (was ${forceRecreate})`);
    }

    let totalProcessed = 0, totalSucceeded = 0, totalFailed = 0, totalSkipped = 0;
    let resolvedByContactIdMap = 0;
    let resolvedByNameMap = 0;
    let unresolvedWithContactId = 0;
    let missingContactReference = 0;
    let ambiguousNameRoutes = 0;
    let pageStartAfter: string | null = checkpoint.cursor.startAfter || null;
    let pageStartAfterId: string | null = checkpoint.cursor.startAfterId || null;
    let firstPage = true;

    // ── Cursor-advance tracking (no-progress guard) ─────────────────────
    // Snapshot the cursor we STARTED this leg with. If the leg processes
    // items but never advances past this cursor, we have a stuck loop —
    // we'll fail the job loudly instead of letting the dispatcher keep
    // re-claiming it. This is the root-cause fix for the 200-mark
    // duplicate-flood bug: previously partialExit wrote back the leg's
    // STARTING cursor, so leg N+1 always restarted from the same place.
    const legStartCursorId: string | null = pageStartAfterId;
    const legStartCursorAt: string | null = pageStartAfter;
    // Track the LAST opp this leg actually touched so partialExit can
    // checkpoint where we really are (not where we started).
    let lastProcessedOppId: string | null = null;
    let lastProcessedOppAt: string | null = null;
    // Helper: build the cursor we'll persist on partial exit. Prefer the
    // last opp we touched THIS leg; fall back to the page cursor.
    const exitCursor = (): { startAfterId: string | null; startAfter: string | null } => ({
      startAfterId: lastProcessedOppId || pageStartAfterId,
      startAfter: lastProcessedOppAt || pageStartAfter,
    });

    // ── Cumulative progress across redispatched legs ─────────────────
    // Without these, each leg overwrites migration_jobs counters with just
    // its OWN local counts (which reset to 0 on every cold start), so the
    // dashboard appears to "regress" and the job can never finish even
    // though work is being done. Mirrors the contacts-worker pattern.
    let baseProcessed = 0, baseSucceeded = 0, baseFailed = 0;
    let persistedTotalItems = 0;
    try {
      const { data: jobRow } = await supabase
        .from('migration_jobs')
        .select('processed_items, succeeded_items, failed_items, total_items')
        .eq('id', jobId)
        .maybeSingle();
      baseProcessed = Number(jobRow?.processed_items || 0);
      baseSucceeded = Number(jobRow?.succeeded_items || 0);
      baseFailed = Number(jobRow?.failed_items || 0);
      persistedTotalItems = Number(jobRow?.total_items || 0);
    } catch { /* non-fatal */ }
    const progressPatch = () => ({
      processed_items: baseProcessed + totalProcessed,
      succeeded_items: baseSucceeded + totalSucceeded,
      failed_items: baseFailed + totalFailed,
    });

    while (true) {
      // ── Granular control: pause / cancel / kill ─────────────────────
      const signal = await readControlSignal(supabase, jobId);
      if (signal === 'kill' || signal === 'cancel') {
        console.log(`[opps-worker] ${signal.toUpperCase()} signal — finalizing cancelled at ${totalProcessed}`);
        await updateJobProgress(supabase, jobId, progressPatch());
        await finishJob(supabase, jobId, 'cancelled', `Cancelled by user (${signal}) at ${totalProcessed} processed`);
        return new Response(JSON.stringify({
          success: true, cancelled: true, signal, processed: totalProcessed,
        }), { headers: { 'Content-Type': 'application/json' } });
      }
      if (signal === 'pause') {
        console.log(`[opps-worker] PAUSE signal — checkpointing at last_processed=${lastProcessedOppId || '(none this leg)'}`);
        await partialExit(
          supabase, jobId,
          exitCursor(),
          progressPatch(),
          lastProcessedOppId || pageStartAfterId,
        );
        return new Response(JSON.stringify({
          success: true, paused: true, processed: totalProcessed,
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      if (Date.now() - startedAt > MAX_RUNTIME_MS) {
        console.log(`[opps-worker] TIME-BUDGET — checkpointing at last_processed=${lastProcessedOppId || '(none this leg)'}`);
        await partialExit(
          supabase, jobId,
          exitCursor(),
          progressPatch(),
          lastProcessedOppId || pageStartAfterId,
        );
        return new Response(JSON.stringify({
          success: true, partial: true, processed: totalProcessed,
          handed_off_to: 'migration-dispatcher',
        }), { headers: { 'Content-Type': 'application/json' } });
      }
      // Circuit breaker tripped → exit cleanly so the dispatcher resumes us
      // with a fresh budget after the broadcast cooldown elapses.
      if (ctx.isCircuitTripped()) {
        console.warn(`[opps-worker] Circuit breaker tripped at ${totalProcessed} processed — handing off to dispatcher for cool-off (last_processed=${lastProcessedOppId || '(none this leg)'})`);
        await partialExit(
          supabase, jobId,
          exitCursor(),
          progressPatch(),
          lastProcessedOppId || pageStartAfterId,
        );
        return new Response(JSON.stringify({
          success: true, partial: true, circuit_breaker: true, processed: totalProcessed,
          handed_off_to: 'migration-dispatcher',
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      const p = new URLSearchParams({ location_id: sourceCreds.locationId!, limit: String(PAGE_LIMIT) });
      if (pageStartAfter) {
        // GHL requires `startAfter` as a numeric millisecond timestamp, not ISO.
        const numeric = /^\d+$/.test(String(pageStartAfter))
          ? String(pageStartAfter)
          : String(new Date(pageStartAfter).getTime());
        p.set('startAfter', numeric);
      }
      if (pageStartAfterId) p.set('startAfterId', pageStartAfterId);

      const res = await ctx.ghlFetch(`${GHL_API_BASE}/opportunities/search?${p}`, { headers: sourceHeaders }, 3, 'source');
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Source opportunities fetch failed: ${res.status} ${t.substring(0, 200)}`);
      }
      const data = await res.json();
      const opps: any[] = data.opportunities || [];

      if (firstPage) {
        const total = data.meta?.total ?? 0;
        // Don't clobber a healthy persisted total on resume.
        if (total > 0 && (!isResume || persistedTotalItems <= 0)) {
          await updateJobProgress(supabase, jobId, { total_items: maxItems > 0 ? Math.min(maxItems, total) : total });
        }
        firstPage = false;
      }
      if (opps.length === 0) break;

      for (const opp of opps) {
        if (maxItems > 0 && totalProcessed >= maxItems) break;
        if (Date.now() - startedAt > MAX_RUNTIME_MS) break;

        totalProcessed++;
        // Track checkpoint position the moment we see this opp. Whether we
        // skip, fail, or successfully migrate, the cursor must advance —
        // otherwise the next leg restarts at this same record forever
        // (the 200-mark duplicate-loop bug).
        lastProcessedOppId = opp.id || lastProcessedOppId;
        lastProcessedOppAt = opp.updatedAt || opp.dateAdded || lastProcessedOppAt;
        const oppLabel = opp.name || `Opp ${opp.id?.substring(0, 8)}`;

        // Skip closed opportunities unless includeClosedStatuses is on.
        if (!includeClosedStatuses && (opp.status === 'won' || opp.status === 'lost' || opp.status === 'abandoned')) {
          totalSkipped++;
          await recordItem(supabase, {
            job_id: jobId, source_id: opp.id, entity_label: oppLabel,
            status: 'skipped', error_message: `Status=${opp.status} (set include_closed_statuses=true to migrate)`,
          });
          continue;
        }

        // Pull a raw name first (GHL field, then local clients fallback),
        // then sanitize so we lookup the same canonical key the contacts
        // worker stored in ghl_id_mapping.notes.
        let rawFirst = opp.contact?.firstName || opp.firstName || null;
        let rawLast = opp.contact?.lastName || opp.lastName || null;
        let rawCombined = (opp.contactName || opp.contact?.name || '').trim();

        if (!rawFirst && !rawLast && !rawCombined && opp.contactId) {
          const { data: localClient } = await supabase
            .from('clients')
            .select('primary_first_name, primary_surname')
            .eq('ghl_contact_id', opp.contactId)
            .maybeSingle();
          if (localClient) {
            rawFirst = localClient.primary_first_name;
            rawLast = localClient.primary_surname;
          }
        }

        const sanitized = sanitizeContactNameParts(rawFirst, rawLast);
        const oppContactName = sanitized.fullName || rawCombined;

        let resolved = {
          newId: null as string | null,
          ambiguous: false,
          candidateCount: 0,
          matchedName: null as string | null,
          normalizedKey: null as string | null,
        };
        let idMappingFound = false;
        let idMappingDeleted = false;
        let idMappedButTargetMissing = false;

        if (opp.contactId) {
          const { data: idMapped } = await supabase
            .from('ghl_id_mapping')
            .select('new_ghl_id')
            .eq('resource_type', 'contact')
            .eq('old_ghl_id', opp.contactId)
            .eq('source_account_label', sourceAccount)
            .eq('target_account_label', targetAccount)
            .maybeSingle();
          if (idMapped?.new_ghl_id) {
            idMappingFound = true;
            const existsInTarget = dryRun ? true : await targetContactExists(ctx, idMapped.new_ghl_id, targetHeaders);
            if (existsInTarget) {
              resolved.newId = idMapped.new_ghl_id;
              resolvedByContactIdMap++;
            } else {
              idMappedButTargetMissing = true;
              await supabase
                .from('ghl_id_mapping')
                .delete()
                .eq('resource_type', 'contact')
                .eq('old_ghl_id', opp.contactId)
                .eq('source_account_label', sourceAccount)
                .eq('target_account_label', targetAccount);
              idMappingDeleted = true;
            }
          }
        }

        if (!resolved.newId && oppContactName && !isPlaceholderResolutionName(oppContactName)) {
          const nameResolved = await resolveTargetContactByName(supabase, {
            fullName: oppContactName,
            sourceAccount,
            targetAccount,
            excludeNewIds: idMappedButTargetMissing && idMappingFound ? [resolved.newId || ''] : [],
          });
          if (nameResolved.newId) {
            const nameTargetExists = dryRun ? true : await targetContactExists(ctx, nameResolved.newId, targetHeaders);
            if (nameTargetExists) {
              resolvedByNameMap++;
              if (nameResolved.ambiguous) ambiguousNameRoutes++;
              resolved = {
                newId: nameResolved.newId,
                ambiguous: nameResolved.ambiguous,
                candidateCount: nameResolved.candidateCount,
                matchedName: nameResolved.matchedName,
                normalizedKey: nameResolved.normalizedKey,
              };
              if (opp.contactId && idMappingDeleted) {
                await recordIdMapping(supabase, {
                  resource_type: 'contact', old_ghl_id: opp.contactId, new_ghl_id: nameResolved.newId,
                  source_account_label: sourceAccount, target_account_label: targetAccount, notes: oppContactName,
                });
              }
            }
          }
        }

        if (!resolved.newId) {
          if (opp.contactId) unresolvedWithContactId++;
          else missingContactReference++;
          totalSkipped++;
          await recordItem(supabase, {
            job_id: jobId, source_id: opp.id, entity_label: oppLabel,
            status: 'skipped',
            error_message: opp.contactId
              ? `No live target contact mapping for source contactId=${opp.contactId}${idMappedButTargetMissing ? ' (stale target contact was deleted)' : ''}${oppContactName ? ` (name "${oppContactName}")` : ''} — rerun contacts migration before opportunities`
              : (oppContactName
                  ? `No target contact named "${oppContactName}" — run contacts worker first`
                  : 'Opportunity has no contactId or contact name to match against'),
          });
          continue;
        }

        if (resolved.ambiguous) {
          console.warn(`[opps-worker] Ambiguous contact name "${oppContactName}" → ${resolved.candidateCount} target contacts; routing to latest=${resolved.newId}`);
        }
        const contactMap = { new_ghl_id: resolved.newId };

        const pmap = pipelineMap.get(opp.pipelineId);
        if (!pmap) {
          totalSkipped++;
          await recordItem(supabase, {
            job_id: jobId, source_id: opp.id, entity_label: oppLabel,
            status: 'skipped', error_message: `Pipeline ${opp.pipelineId} has no name match in target`,
          });
          continue;
        }

        const targetStageId = pmap.stageMap.get(opp.pipelineStageId);
        if (!targetStageId) {
          totalSkipped++;
          await recordItem(supabase, {
            job_id: jobId, source_id: opp.id, entity_label: oppLabel,
            status: 'skipped', error_message: `Stage ${opp.pipelineStageId} not found in target pipeline "${pmap.targetPipelineName}"`,
          });
          continue;
        }

        // Already migrated? Behaviour depends on flags:
        //   • forceRecreate=true       → ignore stale mapping, re-create
        //   • onlyLowConfidence=true   → only process rows whose existing
        //                                 mapping is match_confidence='low'
        //                                 (used to clean up known collisions)
        //   • default                  → skip if mapped at any confidence
        const { data: existing } = await supabase
          .from('ghl_id_mapping').select('new_ghl_id, match_confidence')
          .eq('resource_type', 'opportunity').eq('old_ghl_id', opp.id)
          .eq('source_account_label', sourceAccount).eq('target_account_label', targetAccount)
          .maybeSingle();
        if (existing?.new_ghl_id) {
          if (onlyLowConfidence && existing.match_confidence !== 'low') {
            totalSkipped++;
            await recordItem(supabase, {
              job_id: jobId, source_id: opp.id, target_id: existing.new_ghl_id,
              entity_label: oppLabel, status: 'skipped',
              error_message: `only_low_confidence: existing mapping is ${existing.match_confidence || 'high'}`,
            });
            continue;
          }
          if (!effectiveForceRecreate && !onlyLowConfidence) {
            totalSkipped++;
            await recordItem(supabase, {
              job_id: jobId, source_id: opp.id, target_id: existing.new_ghl_id,
              entity_label: oppLabel, status: 'skipped', error_message: 'Already mapped',
            });
            continue;
          }
          // Falling through to re-create. Drop the stale mapping so the
          // create-success path can write a fresh one.
          if (!dryRun) {
            await supabase
              .from('ghl_id_mapping').delete()
              .eq('resource_type', 'opportunity').eq('old_ghl_id', opp.id)
              .eq('source_account_label', sourceAccount).eq('target_account_label', targetAccount);
            console.log(`[opps-worker] cleared stale mapping for opp=${opp.id} (effectiveForceRecreate=${effectiveForceRecreate} onlyLowConfidence=${onlyLowConfidence} isResume=${isResume})`);
          }
        } else if (onlyLowConfidence) {
          // No existing mapping → nothing to "re-process". Skip in this mode.
          totalSkipped++;
          await recordItem(supabase, {
            job_id: jobId, source_id: opp.id, entity_label: oppLabel,
            status: 'skipped', error_message: 'only_low_confidence: no existing mapping to re-evaluate',
          });
          continue;
        }

        // Empty/whitespace names cause 422 "name should not be empty".
        // Fall back to a deterministic placeholder so we never POST blank.
        const safeName = (opp.name || '').trim() || `Opportunity ${String(opp.id).slice(-6)}`;
        const sourceMonetary =
          typeof opp.monetaryValue === 'number' && !Number.isNaN(opp.monetaryValue)
            ? opp.monetaryValue
            : null;

        // Pre-check: does an opportunity for this contact already exist in
        // the target pipeline? If so, record the mapping & skip — avoids
        // GHL's "Can not create duplicate opportunity for the contact" 400.
        // The matcher is strict: requires name + monetaryValue agreement
        // for a 'medium' confidence match. Anything weaker is recorded as
        // 'low' so it surfaces for manual review.
        if (!dryRun && !skipTargetDedupe) {
          const match = await findExistingTargetOpportunity(
            ctx, targetCreds.locationId!, contactMap.new_ghl_id!, pmap.targetPipelineId,
            safeName, sourceMonetary, targetHeaders,
          );
          if (match) {
            await recordIdMapping(supabase, {
              resource_type: 'opportunity', old_ghl_id: opp.id, new_ghl_id: match.id,
              source_account_label: sourceAccount, target_account_label: targetAccount,
              notes: oppLabel, match_confidence: match.confidence,
            });
            totalSkipped++;
            const skipMsg = match.confidence === 'medium'
              ? 'Matched existing target opportunity (name + monetaryValue) — mapping recorded'
              : 'Ambiguous match in target (name only or multiple candidates) — mapping recorded for review';
            await recordItem(supabase, {
              job_id: jobId, source_id: opp.id, target_id: match.id, entity_label: oppLabel,
              status: 'skipped', error_message: skipMsg,
            });
            continue;
          }
        }

        if (dryRun) {
          totalSucceeded++;
          await recordItem(supabase, {
            job_id: jobId, source_id: opp.id, entity_label: oppLabel,
            status: 'succeeded', error_message: `DRY RUN — would create in pipeline "${pmap.targetPipelineName}"`,
          });
          continue;
        }

        try {
          // Pacing is handled by ctx.ghlFetch via the shared rate limiter —
          // no manual delay needed.
          // NOTE: legacy `assignedTo` user IDs do not exist in the new GHL
          // account; we hard-set `assignedTo` to a single resolved target
          // user (above) instead. If unresolved we OMIT the field entirely
          // (GHL rejects empty strings or invalid IDs with a 400).
          const createBody: Record<string, unknown> = {
            locationId: targetCreds.locationId,
            pipelineId: pmap.targetPipelineId,
            pipelineStageId: targetStageId,
            contactId: contactMap.new_ghl_id,
            name: safeName,
            status: opp.status || 'open',
          };
          if (typeof opp.monetaryValue === 'number' && !Number.isNaN(opp.monetaryValue)) {
            createBody.monetaryValue = opp.monetaryValue;
          }
          // Resolve assignee per assignedUserStrategy:
          //   • omit         → never set assignedTo
          //   • map_by_email → look up source assignee's email and rebind to
          //                    the target user with that same email; fall back
          //                    to the resolved single user if no email match
          //   • single       → use the single hard-resolved target user
          let assignTo: string | null = null;
          if (assignedUserStrategy === 'omit') {
            assignTo = null;
          } else if (assignedUserStrategy === 'map_by_email' && opp.assignedTo) {
            const srcEmail = sourceUserEmailById.get(opp.assignedTo);
            if (srcEmail) {
              const tgt = targetUserByEmail.get(srcEmail);
              if (tgt) assignTo = tgt;
            }
            if (!assignTo) assignTo = targetAssignedUserId;
          } else {
            assignTo = targetAssignedUserId;
          }
          if (assignTo) {
            createBody.assignedTo = assignTo;
          }
          const r = await ctx.ghlFetch(`${GHL_API_BASE}/opportunities/`, {
            method: 'POST', headers: targetHeaders, body: JSON.stringify(createBody),
          }, 3, 'target');
          if (!r.ok) {
            const t = await r.text();
            const parsed = parseGhlError(t);
            const code = parsed.error_code || `GHL_${r.status}`;
            const rawMsg = (parsed.message || t || '').toLowerCase();

            // ── Smart-recover from "duplicate opportunity" 400 ────────────
            // GHL refuses POSTs when an opportunity already exists for this
            // contact (regardless of name/value). This is the classic
            // "loop" symptom: an earlier cancelled run created the opp but
            // never wrote ghl_id_mapping, so we keep re-trying.
            // Strategy: search the target for ANY existing opp on this
            // contact+pipeline, write the mapping, reclassify as `skipped`.
            const isDuplicate = r.status === 400 && (
              rawMsg.includes('duplicate opportunity') ||
              rawMsg.includes('can not create duplicate') ||
              rawMsg.includes('already exists')
            );
            if (isDuplicate) {
              try {
                const recover = await findExistingTargetOpportunity(
                  ctx, targetCreds.locationId!, contactMap.new_ghl_id!,
                  pmap.targetPipelineId, safeName, sourceMonetary, targetHeaders,
                );
                if (recover) {
                  await recordIdMapping(supabase, {
                    resource_type: 'opportunity', old_ghl_id: opp.id, new_ghl_id: recover.id,
                    source_account_label: sourceAccount, target_account_label: targetAccount,
                    notes: oppLabel, match_confidence: recover.confidence,
                  });
                  totalSkipped++;
                  await recordItem(supabase, {
                    job_id: jobId, source_id: opp.id, target_id: recover.id, entity_label: oppLabel,
                    status: 'skipped',
                    error_message: `Recovered from GHL duplicate-400 — backfilled mapping (confidence=${recover.confidence})`,
                  });
                  console.log(`[opps-worker] DUP-RECOVER opp=${opp.id} → target=${recover.id} (${recover.confidence})`);
                  continue;
                }
                // Search came back empty even though GHL says duplicate exists.
                // Fall back to a broader search (any opp on this contact, any pipeline)
                // and write a low-confidence mapping so we never re-try the create.
                const params = new URLSearchParams({
                  location_id: targetCreds.locationId!,
                  contact_id: contactMap.new_ghl_id!,
                  limit: '100',
                });
                const broad = await ctx.ghlFetch(
                  `${GHL_API_BASE}/opportunities/search?${params}`,
                  { headers: targetHeaders }, 2, 'target',
                );
                if (broad.ok) {
                  const data = await broad.json();
                  const opps2: any[] = data.opportunities || [];
                  if (opps2.length > 0) {
                    // Prefer same-pipeline opps if any, else just take the first
                    const samePipe = opps2.find((o) => o.pipelineId === pmap.targetPipelineId);
                    const pick = samePipe || opps2[0];
                    await recordIdMapping(supabase, {
                      resource_type: 'opportunity', old_ghl_id: opp.id, new_ghl_id: pick.id,
                      source_account_label: sourceAccount, target_account_label: targetAccount,
                      notes: oppLabel, match_confidence: 'low',
                    });
                    totalSkipped++;
                    await recordItem(supabase, {
                      job_id: jobId, source_id: opp.id, target_id: pick.id, entity_label: oppLabel,
                      status: 'skipped',
                      error_message: 'Recovered from GHL duplicate-400 via broad search (low confidence — manual review)',
                    });
                    console.log(`[opps-worker] DUP-RECOVER (broad) opp=${opp.id} → target=${pick.id}`);
                    continue;
                  }
                }
              } catch (recoverErr: any) {
                console.warn(`[opps-worker] dup-recover threw for opp=${opp.id}: ${recoverErr.message}`);
              }
              // Nothing found — record as skipped (not failed) with a clear
              // diagnostic so we don't keep re-attempting on next dispatch.
              totalSkipped++;
              await recordItem(supabase, {
                job_id: jobId, source_id: opp.id, entity_label: oppLabel, status: 'skipped',
                error_message: 'GHL says duplicate exists but search returned nothing — needs manual mapping',
              });
              continue;
            }

            const authDetail = (r.status === 401 || r.status === 403) && targetAuthHint
              ? ` ${targetAuthHint}`
              : '';
            totalFailed++;
            await recordItem(supabase, {
              job_id: jobId, source_id: opp.id, entity_label: oppLabel,
              status: 'failed', error_message: `[${code}] ${r.status}: ${(parsed.message || t).substring(0, 260)}${authDetail}`.substring(0, 900),
            });
            continue;
          }
          const newOpp = await r.json();
          const newId = newOpp?.opportunity?.id || newOpp?.id;
          if (!newId) {
            totalFailed++;
            await recordItem(supabase, {
              job_id: jobId, source_id: opp.id, entity_label: oppLabel,
              status: 'failed', error_message: 'Create returned no opportunity id',
            });
            continue;
          }
          await recordIdMapping(supabase, {
            resource_type: 'opportunity', old_ghl_id: opp.id, new_ghl_id: newId,
            source_account_label: sourceAccount, target_account_label: targetAccount, notes: oppLabel,
          });
          totalSucceeded++;
          await recordItem(supabase, {
            job_id: jobId, source_id: opp.id, target_id: newId, entity_label: oppLabel, status: 'succeeded',
          });
        } catch (e: any) {
          totalFailed++;
          await recordItem(supabase, {
            job_id: jobId, source_id: opp.id, entity_label: oppLabel,
            status: 'failed', error_message: e.message?.substring(0, 300) || 'Unknown error',
          });
        }
      }

      await updateJobProgress(supabase, jobId, progressPatch());
      // Heartbeat extends our lease so the dispatcher doesn't steal the job
      // mid-flight just because we've spent a while on slow GHL pages.
      await heartbeat(supabase, jobId);

      const last = opps[opps.length - 1];
      pageStartAfterId = last?.id || null;
      pageStartAfter = last?.updatedAt || last?.dateAdded || null;
      await saveCheckpoint(supabase, jobId,
        { startAfterId: pageStartAfterId, startAfter: pageStartAfter }, last?.id || null);

      // ── No-progress guard ─────────────────────────────────────────────
      // If this leg processed at least one item but the page cursor is
      // identical to where the leg started, we have a confirmed
      // stuck-cursor loop. Fail the job loudly with diagnostic info instead
      // of letting the dispatcher re-claim it for another duplicate pass.
      const cursorAdvanced =
        pageStartAfterId !== legStartCursorId ||
        pageStartAfter !== legStartCursorAt;
      if (totalProcessed > 0 && !cursorAdvanced) {
        const msg =
          `No-progress guard tripped: leg processed=${totalProcessed} but cursor did not advance ` +
          `(stuck at id=${legStartCursorId} / at=${legStartCursorAt}). ` +
          `Likely a GHL pagination cursor or filter issue — needs manual review.`;
        console.error(`[opps-worker] ${msg}`);
        await updateJobProgress(supabase, jobId, progressPatch());
        await finishJob(supabase, jobId, 'failed', msg);
        return new Response(JSON.stringify({
          success: false, error: msg, processed: totalProcessed,
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }

      if (maxItems > 0 && totalProcessed >= maxItems) break;
      // No artificial cap on total records: we keep paging via cursor until
      // GHL returns an empty page (handled by the `opps.length === 0` guard above).
      // Some GHL accounts return < PAGE_LIMIT mid-stream when filters apply,
      // so a short page is NOT a stop signal — only an empty page is.
      if (!last?.id) break; // no cursor advancement → would loop forever
    }

    await saveCheckpoint(supabase, jobId, {});
    const resolvedTotal = resolvedByContactIdMap + resolvedByNameMap;
    const resolutionDenominator = resolvedTotal + unresolvedWithContactId + missingContactReference;
    const coveragePct = resolutionDenominator > 0
      ? Number(((resolvedTotal / resolutionDenominator) * 100).toFixed(2))
      : 100;
    await mergeJobPayload(supabase, jobId, {
      ingestion_validation: {
        worker: 'opportunities',
        contact_resolution: {
          resolved_by_contact_id_map: resolvedByContactIdMap,
          resolved_by_name_map: resolvedByNameMap,
          unresolved_with_contact_id: unresolvedWithContactId,
          missing_contact_reference: missingContactReference,
          ambiguous_name_routes: ambiguousNameRoutes,
          resolved_total: resolvedTotal,
          coverage_pct: coveragePct,
        },
        flags: {
          force_recreate_opportunities: forceRecreate,
          skip_target_dedupe_check: skipTargetDedupe,
          only_low_confidence: onlyLowConfidence,
          include_closed_statuses: includeClosedStatuses,
          pipeline_filter: pipelineFilter,
          stage_filter: stageFilter,
          assigned_user_strategy: assignedUserStrategy,
          target_user_email_map_size: targetUserByEmail.size,
          source_user_email_map_size: sourceUserEmailById.size,
        },
        processed: totalProcessed,
        succeeded: totalSucceeded,
        failed: totalFailed,
        skipped: totalSkipped,
      },
    });
    await finishJob(supabase, jobId,
      totalFailed > 0 && totalSucceeded === 0 ? 'failed' : 'completed',
      [
        totalFailed > 0 ? `${totalFailed} failed` : null,
        unresolvedWithContactId > 0 ? `${unresolvedWithContactId} without contact mapping` : null,
        unmappedPipelines.length ? `Unmapped pipelines: ${unmappedPipelines.join(', ')}` : null,
      ].filter(Boolean).join(' | ') || undefined,
    );

    console.log(`[opps-worker] DONE job=${jobId} ok=${totalSucceeded} fail=${totalFailed} skip=${totalSkipped}`);

    return new Response(JSON.stringify({
      success: true, job_id: jobId,
      processed: totalProcessed, succeeded: totalSucceeded, failed: totalFailed, skipped: totalSkipped,
      unmapped_pipelines: unmappedPipelines,
      ingestion_validation: {
        contact_resolution: {
          resolved_by_contact_id_map: resolvedByContactIdMap,
          resolved_by_name_map: resolvedByNameMap,
          unresolved_with_contact_id: unresolvedWithContactId,
          missing_contact_reference: missingContactReference,
          ambiguous_name_routes: ambiguousNameRoutes,
          coverage_pct: coveragePct,
        },
      },
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[opps-worker] FATAL:', err);
    if (jobId && supabase) {
      await finishJob(supabase, jobId, 'failed', err.message || 'Worker crashed').catch(() => {});
    }
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
});
