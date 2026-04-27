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
 * (contactId, pipelineId, name). Returns the existing opportunity id if any,
 * so we can record-and-skip instead of failing with the GHL "duplicate" 400.
 */
async function findExistingTargetOpportunity(
  ctx: GhlFetchContext,
  locationId: string,
  contactId: string,
  pipelineId: string,
  name: string,
  headers: Record<string, string>,
): Promise<string | null> {
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
    const exact = opps.find((o) => (o.name || '').trim().toLowerCase() === wanted);
    return (exact?.id || opps[0]?.id) || null;
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
      const tp = targetPipelines.find((p) => p.name?.trim().toLowerCase() === sp.name?.trim().toLowerCase());
      if (!tp) {
        unmappedPipelines.push(sp.name);
        continue;
      }
      const stageMap = new Map<string, string>();
      for (const ss of (sp.stages || [])) {
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
    if (!targetAssignedUserId && !dryRun) {
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
          // Prefer users explicitly bound to the target location.
          const located = users.find((u) =>
            Array.isArray(u.roles?.locationIds) ? u.roles.locationIds.includes(targetCreds.locationId)
              : Array.isArray(u.locationIds) ? u.locationIds.includes(targetCreds.locationId)
              : true,
          ) || users[0];
          targetAssignedUserId = located.id;
          console.log(`[opps-worker] Hard-set assignedTo=${targetAssignedUserId} (${located.name || located.email || 'unnamed'}) via ${url} — ${users.length} candidate(s)`);
          break;
        } catch (e: any) {
          console.warn(`[opps-worker] ${url} threw: ${e.message}`);
        }
      }
      if (!targetAssignedUserId) {
        console.warn('[opps-worker] No target user resolved — opportunities will be created WITHOUT assignedTo (omitted from POST body)');
      }
    }

    const checkpoint = await loadCheckpoint(supabase, jobId);
    const isResume = body._resume === true || !!checkpoint.cursor.startAfterId;
    if (isResume) {
      console.log(`[opps-worker] RESUMING job=${jobId} dispatch#${checkpoint.dispatchCount} cursor=${JSON.stringify(checkpoint.cursor)}`);
    } else {
      await startJob(supabase, jobId, 0);
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

    while (true) {
      // ── Granular control: pause / cancel / kill ─────────────────────
      const signal = await readControlSignal(supabase, jobId);
      if (signal === 'kill' || signal === 'cancel') {
        console.log(`[opps-worker] ${signal.toUpperCase()} signal — finalizing cancelled at ${totalProcessed}`);
        await updateJobProgress(supabase, jobId, {
          processed_items: totalProcessed, succeeded_items: totalSucceeded, failed_items: totalFailed,
        });
        await finishJob(supabase, jobId, 'cancelled', `Cancelled by user (${signal}) at ${totalProcessed} processed`);
        return new Response(JSON.stringify({
          success: true, cancelled: true, signal, processed: totalProcessed,
        }), { headers: { 'Content-Type': 'application/json' } });
      }
      if (signal === 'pause') {
        console.log(`[opps-worker] PAUSE signal — checkpointing at ${totalProcessed}`);
        await partialExit(
          supabase, jobId,
          { startAfterId: pageStartAfterId, startAfter: pageStartAfter },
          { processed_items: totalProcessed, succeeded_items: totalSucceeded, failed_items: totalFailed },
          pageStartAfterId,
        );
        return new Response(JSON.stringify({
          success: true, paused: true, processed: totalProcessed,
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      if (Date.now() - startedAt > MAX_RUNTIME_MS) {
        await partialExit(
          supabase, jobId,
          { startAfterId: pageStartAfterId, startAfter: pageStartAfter },
          { processed_items: totalProcessed, succeeded_items: totalSucceeded, failed_items: totalFailed },
          pageStartAfterId,
        );
        return new Response(JSON.stringify({
          success: true, partial: true, processed: totalProcessed,
          handed_off_to: 'migration-dispatcher',
        }), { headers: { 'Content-Type': 'application/json' } });
      }
      // Circuit breaker tripped → exit cleanly so the dispatcher resumes us
      // with a fresh budget after the broadcast cooldown elapses.
      if (ctx.isCircuitTripped()) {
        console.warn(`[opps-worker] Circuit breaker tripped at ${totalProcessed} processed — handing off to dispatcher for cool-off`);
        await partialExit(
          supabase, jobId,
          { startAfterId: pageStartAfterId, startAfter: pageStartAfter },
          { processed_items: totalProcessed, succeeded_items: totalSucceeded, failed_items: totalFailed },
          pageStartAfterId,
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
        if (total > 0) await updateJobProgress(supabase, jobId, { total_items: maxItems > 0 ? Math.min(maxItems, total) : total });
        firstPage = false;
      }
      if (opps.length === 0) break;

      for (const opp of opps) {
        if (maxItems > 0 && totalProcessed >= maxItems) break;
        if (Date.now() - startedAt > MAX_RUNTIME_MS) break;

        totalProcessed++;
        const oppLabel = opp.name || `Opp ${opp.id?.substring(0, 8)}`;

        // Skip closed opportunities (Phase 2B focuses on active pipeline)
        if (opp.status === 'won' || opp.status === 'lost' || opp.status === 'abandoned') {
          totalSkipped++;
          await recordItem(supabase, {
            job_id: jobId, source_id: opp.id, entity_label: oppLabel,
            status: 'skipped', error_message: `Status=${opp.status}`,
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

        // Already migrated?
        const { data: existing } = await supabase
          .from('ghl_id_mapping').select('new_ghl_id')
          .eq('resource_type', 'opportunity').eq('old_ghl_id', opp.id)
          .eq('source_account_label', sourceAccount).eq('target_account_label', targetAccount)
          .maybeSingle();
        if (existing?.new_ghl_id) {
          totalSkipped++;
          await recordItem(supabase, {
            job_id: jobId, source_id: opp.id, target_id: existing.new_ghl_id,
            entity_label: oppLabel, status: 'skipped', error_message: 'Already mapped',
          });
          continue;
        }

        // Empty/whitespace names cause 422 "name should not be empty".
        // Fall back to a deterministic placeholder so we never POST blank.
        const safeName = (opp.name || '').trim() || `Opportunity ${String(opp.id).slice(-6)}`;

        // Pre-check: does an opportunity for this contact already exist in
        // the target pipeline? If so, record the mapping & skip — avoids
        // GHL's "Can not create duplicate opportunity for the contact" 400.
        if (!dryRun) {
          const existingTargetOppId = await findExistingTargetOpportunity(
            ctx, targetCreds.locationId!, contactMap.new_ghl_id!, pmap.targetPipelineId, safeName, targetHeaders,
          );
          if (existingTargetOppId) {
            await recordIdMapping(supabase, {
              resource_type: 'opportunity', old_ghl_id: opp.id, new_ghl_id: existingTargetOppId,
              source_account_label: sourceAccount, target_account_label: targetAccount, notes: oppLabel,
            });
            totalSkipped++;
            await recordItem(supabase, {
              job_id: jobId, source_id: opp.id, target_id: existingTargetOppId, entity_label: oppLabel,
              status: 'skipped', error_message: 'Already exists in target (pre-check) — mapping recorded',
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
          if (targetAssignedUserId) {
            createBody.assignedTo = targetAssignedUserId;
          }
          const r = await ctx.ghlFetch(`${GHL_API_BASE}/opportunities/`, {
            method: 'POST', headers: targetHeaders, body: JSON.stringify(createBody),
          }, 3, 'target');
          if (!r.ok) {
            const t = await r.text();
            const parsed = parseGhlError(t);
            const code = parsed.error_code || `GHL_${r.status}`;
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

      await updateJobProgress(supabase, jobId, {
        processed_items: totalProcessed, succeeded_items: totalSucceeded, failed_items: totalFailed,
      });

      const last = opps[opps.length - 1];
      pageStartAfterId = last?.id || null;
      pageStartAfter = last?.updatedAt || last?.dateAdded || null;
      await saveCheckpoint(supabase, jobId,
        { startAfterId: pageStartAfterId, startAfter: pageStartAfter }, last?.id || null);

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
