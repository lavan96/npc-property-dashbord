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
  startJob, finishJob, recordItem, recordIdMapping, updateJobProgress, delay,
  saveCheckpoint, loadCheckpoint, selfRedispatch,
} from '../_shared/migration-jobs.ts';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const PAGE_LIMIT = 100;
const MAX_RUNTIME_MS = 350_000;
const RATE_LIMIT_MS = 300;

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
    const targetPipelinesRes = await fetch(
      `${GHL_API_BASE}/opportunities/pipelines?locationId=${targetCreds.locationId}`,
      { headers: targetHeaders },
    );
    if (!targetPipelinesRes.ok) {
      const t = await targetPipelinesRes.text();
      throw new Error(`Target pipelines fetch failed: ${targetPipelinesRes.status} ${t.substring(0, 200)}`);
    }
    const targetPipelinesData = await targetPipelinesRes.json();
    const targetPipelines: any[] = targetPipelinesData.pipelines || [];

    const sourcePipelinesRes = await fetch(
      `${GHL_API_BASE}/opportunities/pipelines?locationId=${sourceCreds.locationId}`,
      { headers: sourceHeaders },
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

    const checkpoint = await loadCheckpoint(supabase, jobId);
    const isResume = body._resume === true || !!checkpoint.cursor.startAfterId;
    if (isResume) {
      console.log(`[opps-worker] RESUMING job=${jobId} dispatch#${checkpoint.dispatchCount} cursor=${JSON.stringify(checkpoint.cursor)}`);
    } else {
      await startJob(supabase, jobId, 0);
    }

    let totalProcessed = 0, totalSucceeded = 0, totalFailed = 0, totalSkipped = 0;
    let pageStartAfter: string | null = checkpoint.cursor.startAfter || null;
    let pageStartAfterId: string | null = checkpoint.cursor.startAfterId || null;
    let firstPage = true;

    while (true) {
      if (Date.now() - startedAt > MAX_RUNTIME_MS) {
        await saveCheckpoint(supabase, jobId, { startAfterId: pageStartAfterId, startAfter: pageStartAfter });
        await updateJobProgress(supabase, jobId, {
          processed_items: totalProcessed, succeeded_items: totalSucceeded, failed_items: totalFailed,
        });
        const r = await selfRedispatch(supabase, jobId, 'ghl-migrate-opportunities-worker', {
          job_id: jobId, source_account: sourceAccount, target_account: targetAccount, dry_run: dryRun, payload,
        });
        if (!r.dispatched) {
          await finishJob(supabase, jobId, 'completed', `Auto-resume halted (${r.reason}). Processed ${totalProcessed}.`);
        }
        return new Response(JSON.stringify({
          success: true, partial: true, processed: totalProcessed,
          auto_redispatched: r.dispatched, dispatch_count: r.dispatchCount, reason: r.reason || null,
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      const p = new URLSearchParams({ location_id: sourceCreds.locationId!, limit: String(PAGE_LIMIT) });
      if (pageStartAfter) p.set('startAfter', pageStartAfter);
      if (pageStartAfterId) p.set('startAfterId', pageStartAfterId);

      const res = await fetch(`${GHL_API_BASE}/opportunities/search?${p}`, { headers: sourceHeaders });
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

        // Lookup mapped contact
        const { data: contactMap } = await supabase
          .from('ghl_id_mapping')
          .select('new_ghl_id')
          .eq('resource_type', 'contact')
          .eq('old_ghl_id', opp.contactId)
          .eq('source_account_label', sourceAccount)
          .eq('target_account_label', targetAccount)
          .maybeSingle();

        if (!contactMap?.new_ghl_id) {
          totalSkipped++;
          await recordItem(supabase, {
            job_id: jobId, source_id: opp.id, entity_label: oppLabel,
            status: 'skipped', error_message: 'Contact not yet mapped — run contacts worker first',
          });
          continue;
        }

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

        if (dryRun) {
          totalSucceeded++;
          await recordItem(supabase, {
            job_id: jobId, source_id: opp.id, entity_label: oppLabel,
            status: 'succeeded', error_message: `DRY RUN — would create in pipeline "${pmap.targetPipelineName}"`,
          });
          continue;
        }

        try {
          await delay(RATE_LIMIT_MS);
          const createBody = {
            locationId: targetCreds.locationId,
            pipelineId: pmap.targetPipelineId,
            pipelineStageId: targetStageId,
            contactId: contactMap.new_ghl_id,
            name: opp.name,
            status: opp.status || 'open',
            monetaryValue: opp.monetaryValue,
            assignedTo: opp.assignedTo,
          };
          const r = await fetch(`${GHL_API_BASE}/opportunities/`, {
            method: 'POST', headers: targetHeaders, body: JSON.stringify(createBody),
          });
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

      if (maxItems > 0 && totalProcessed >= maxItems) break;
      const last = opps[opps.length - 1];
      pageStartAfterId = last?.id || null;
      pageStartAfter = last?.updatedAt || last?.dateAdded || null;
      if (opps.length < PAGE_LIMIT) break;
    }

    await finishJob(supabase, jobId,
      totalFailed > 0 && totalSucceeded === 0 ? 'failed' : 'completed',
      [
        totalFailed > 0 ? `${totalFailed} failed` : null,
        unmappedPipelines.length ? `Unmapped pipelines: ${unmappedPipelines.join(', ')}` : null,
      ].filter(Boolean).join(' | ') || undefined,
    );

    console.log(`[opps-worker] DONE job=${jobId} ok=${totalSucceeded} fail=${totalFailed} skip=${totalSkipped}`);

    return new Response(JSON.stringify({
      success: true, job_id: jobId,
      processed: totalProcessed, succeeded: totalSucceeded, failed: totalFailed, skipped: totalSkipped,
      unmapped_pipelines: unmappedPipelines,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[opps-worker] FATAL:', err);
    if (jobId && supabase) {
      await finishJob(supabase, jobId, 'failed', err.message || 'Worker crashed').catch(() => {});
    }
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
});
