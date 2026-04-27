/**
 * GHL Migrate: NOTES Worker (Phase 2B)
 *
 * Reads existing client_notes that have NOT been pushed to the target
 * account, finds the mapped target contactId via ghl_id_mapping, and
 * POSTs each note to the target account's /contacts/{id}/notes endpoint.
 *
 * Notes are stored locally with `ghl_note_id` (legacy) and we add a
 * conceptual mapping in ghl_id_mapping under resource_type='note' so we
 * can identify which notes have been mirrored to the target.
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
  resolveTargetContactByName, readControlSignal, sanitizeContactNameParts,
} from '../_shared/migration-jobs.ts';
import { tokenKeyFor } from '../_shared/ghl-rate-limiter.ts';
import { createGhlFetchContext } from '../_shared/ghl-worker-fetch.ts';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
// 110s leaves ~40s headroom inside the 150s edge cap for graceful
// checkpoint + finishJob, mirroring the contacts/opportunities/conversations
// workers.
const MAX_RUNTIME_MS = 110_000;
// Pull this many local note rows per dispatch. The dispatcher will
// re-invoke us until the cursor is exhausted, so this is a per-invocation
// fetch ceiling, NOT a global cap on total notes processed.
const BATCH = 5000;

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

    const targetCreds = getGhlCredentials(targetAccount);
    const tErr = validateGhlCredentials(targetCreds);
    if (tErr) {
      await finishJob(supabase, jobId, 'failed', tErr);
      return new Response(JSON.stringify({ error: tErr }), { status: 400 });
    }
    const targetAccess = dryRun
      ? { accessToken: targetCreds.apiKey!, diagnostics: null as any }
      : await resolveGhlAccessTokenForLocation(targetCreds);
    const targetHeaders = buildGhlHeaders(targetAccess.accessToken);
    const targetAuthHint = targetAccess.diagnostics
      ? describeGhlWriteAuthFailure(targetAccess.diagnostics)
      : null;

    if (!dryRun && targetAccess.diagnostics) {
      console.log('[notes-worker] target token diagnostics:', JSON.stringify({
        token_type_hint: targetAccess.diagnostics.token_type_hint,
        has_location_id: targetAccess.diagnostics.has_location_id,
        location_id_matches_secret: targetAccess.diagnostics.location_id_matches_secret,
        has_company_id: targetAccess.diagnostics.has_company_id,
        exchange_attempted: targetAccess.diagnostics.exchange_attempted || false,
        exchange_succeeded: targetAccess.diagnostics.exchange_succeeded || false,
        exchange_error: targetAccess.diagnostics.exchange_error || null,
      }));
    }

    console.log(`[notes-worker] job=${jobId} ${sourceAccount}→${targetAccount} dry_run=${dryRun}`);

    // Resume support: notes are paginated by an integer offset over local rows
    const checkpoint = await loadCheckpoint(supabase, jobId);
    const isResume = body._resume === true || (checkpoint.cursor.offset || 0) > 0;
    const startOffset = Number(checkpoint.cursor.offset) || 0;

    // Pull notes joined to clients with a ghl_contact_id; resume from offset.
    // Per-invocation pull is bounded by BATCH; the dispatcher re-invokes
    // until cursor exhaustion, so total notes processed is uncapped.
    const pullLimit = maxItems > 0 ? Math.min(maxItems, BATCH) : BATCH;
    const { data: notes, error: notesErr } = await supabase
      .from('client_notes')
      .select('id, content, note_type, client_id, clients!inner(ghl_contact_id, primary_first_name, primary_surname)')
      .not('clients.ghl_contact_id', 'is', null)
      .order('id', { ascending: true })
      .range(startOffset, startOffset + pullLimit - 1);

    if (notesErr) throw new Error(`Notes query failed: ${notesErr.message}`);

    if (isResume) {
      console.log(`[notes-worker] RESUMING job=${jobId} dispatch#${checkpoint.dispatchCount} offset=${startOffset}`);
    } else {
      await startJob(supabase, jobId, notes?.length || 0);
    }

    let totalProcessed = 0, totalSucceeded = 0, totalFailed = 0, totalSkipped = 0;
    let currentOffset = startOffset;

    let timeBudgetExhausted = false;
    let pausedByUser = false;
    let cancelledByUser: 'pause' | 'cancel' | 'kill' | null = null;
    for (const note of (notes || [])) {
      // ── Granular control: pause / cancel / kill ─────────────────────
      // (Checked once per item — notes worker has no API page loop.)
      if (totalProcessed % 10 === 0) {
        const sig = await readControlSignal(supabase, jobId);
        if (sig === 'kill' || sig === 'cancel') { cancelledByUser = sig; break; }
        if (sig === 'pause') { pausedByUser = true; break; }
      }
      if (Date.now() - startedAt > MAX_RUNTIME_MS) { timeBudgetExhausted = true; break; }
      if (maxItems > 0 && totalProcessed >= maxItems) break;

      totalProcessed++;
      currentOffset++;
      const client = (note as any).clients;
      // Sanitize the source client name so name-based resolution keys off
      // the same canonical form the contacts worker stored in ghl_id_mapping.notes.
      const sanitizedClient = sanitizeContactNameParts(
        client?.primary_first_name,
        client?.primary_surname,
      );
      const fullName = sanitizedClient.fullName;
      const label = fullName || 'Note';

      // Resolve target contact by NAME (project-wide policy: full_name is
      // the source of truth; on duplicates pick the most-recently mirrored
      // target contact).
      const resolved = await resolveTargetContactByName(supabase, {
        fullName,
        sourceAccount,
        targetAccount,
      });

      if (!resolved.newId) {
        totalSkipped++;
        await recordItem(supabase, {
          job_id: jobId, source_id: note.id, entity_label: label,
          status: 'skipped',
          error_message: fullName
            ? `No target contact named "${fullName}" — run contacts worker first`
            : 'Client has no name to match a target contact',
        });
        continue;
      }

      if (resolved.ambiguous) {
        console.warn(`[notes-worker] Ambiguous contact name "${fullName}" → ${resolved.candidateCount} target contacts; routing to latest=${resolved.newId}`);
      }
      const mapping = { new_ghl_id: resolved.newId };

      // Already mirrored?
      const { data: existingNoteMap } = await supabase
        .from('ghl_id_mapping')
        .select('new_ghl_id')
        .eq('resource_type', 'note')
        .eq('old_ghl_id', note.id)
        .eq('source_account_label', sourceAccount)
        .eq('target_account_label', targetAccount)
        .maybeSingle();
      if (existingNoteMap?.new_ghl_id) {
        totalSkipped++;
        await recordItem(supabase, {
          job_id: jobId, source_id: note.id, target_id: existingNoteMap.new_ghl_id,
          entity_label: label, status: 'skipped', error_message: 'Already mirrored',
        });
        continue;
      }

      const formatted = note.note_type && note.note_type !== 'general'
        ? `[${String(note.note_type).toUpperCase()}] ${note.content}`
        : note.content;

      if (dryRun) {
        totalSucceeded++;
        await recordItem(supabase, {
          job_id: jobId, source_id: note.id, entity_label: label,
          status: 'succeeded', error_message: 'DRY RUN — would push to target',
        });
        continue;
      }

      try {
        await delay(RATE_LIMIT_MS);
        const r = await fetch(`${GHL_API_BASE}/contacts/${mapping.new_ghl_id}/notes`, {
          method: 'POST', headers: targetHeaders, body: JSON.stringify({ body: formatted }),
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
            job_id: jobId, source_id: note.id, entity_label: label,
            status: 'failed', error_message: `[${code}] ${r.status}: ${(parsed.message || t).substring(0, 260)}${authDetail}`.substring(0, 900),
          });
          continue;
        }
        const data = await r.json();
        const newNoteId = data?.note?.id;
        if (newNoteId) {
          await recordIdMapping(supabase, {
            resource_type: 'note', old_ghl_id: note.id, new_ghl_id: newNoteId,
            source_account_label: sourceAccount, target_account_label: targetAccount, notes: label,
          });
        }
        totalSucceeded++;
        await recordItem(supabase, {
          job_id: jobId, source_id: note.id, target_id: newNoteId || null,
          entity_label: label, status: 'succeeded',
        });
      } catch (e: any) {
        totalFailed++;
        await recordItem(supabase, {
          job_id: jobId, source_id: note.id, entity_label: label,
          status: 'failed', error_message: e.message?.substring(0, 300) || 'Unknown error',
        });
      }

      if (totalProcessed % 25 === 0) {
        await updateJobProgress(supabase, jobId, {
          processed_items: totalProcessed, succeeded_items: totalSucceeded, failed_items: totalFailed,
        });
      }
    }

    await updateJobProgress(supabase, jobId, {
      processed_items: totalProcessed, succeeded_items: totalSucceeded, failed_items: totalFailed,
    });

    // ── Granular control exits ──────────────────────────────────────────
    if (cancelledByUser) {
      await finishJob(supabase, jobId, 'cancelled',
        `Cancelled by user (${cancelledByUser}) at ${totalProcessed} processed`);
      console.log(`[notes-worker] CANCELLED job=${jobId} via ${cancelledByUser} at ${totalProcessed}`);
      return new Response(JSON.stringify({
        success: true, cancelled: true, signal: cancelledByUser, processed: totalProcessed,
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (pausedByUser) {
      await partialExit(
        supabase, jobId,
        { offset: currentOffset },
        { processed_items: totalProcessed, succeeded_items: totalSucceeded, failed_items: totalFailed },
      );
      console.log(`[notes-worker] PAUSED job=${jobId} at ${totalProcessed}`);
      return new Response(JSON.stringify({
        success: true, paused: true, processed: totalProcessed,
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    const morePagesAvailable = (notes?.length || 0) >= pullLimit;
    const shouldRedispatch = !timeBudgetExhausted && morePagesAvailable && !(maxItems > 0 && totalProcessed >= maxItems);

    if (timeBudgetExhausted || shouldRedispatch) {
      await partialExit(
        supabase, jobId,
        { offset: currentOffset },
        { processed_items: totalProcessed, succeeded_items: totalSucceeded, failed_items: totalFailed },
      );
      console.log(`[notes-worker] PARTIAL job=${jobId} processed=${totalProcessed} → handed off to dispatcher`);
      return new Response(JSON.stringify({
        success: true, partial: true, processed: totalProcessed,
        handed_off_to: 'migration-dispatcher',
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    await saveCheckpoint(supabase, jobId, {});
    try { await supabase.rpc('release_migration_job_lock', { p_job_id: jobId }); } catch {}
    await finishJob(supabase, jobId,
      totalFailed > 0 && totalSucceeded === 0 ? 'failed' : 'completed',
      totalFailed > 0 ? `Completed with ${totalFailed} failures` : undefined,
    );

    console.log(`[notes-worker] DONE job=${jobId} ok=${totalSucceeded} fail=${totalFailed} skip=${totalSkipped}`);

    return new Response(JSON.stringify({
      success: true, job_id: jobId,
      processed: totalProcessed, succeeded: totalSucceeded, failed: totalFailed, skipped: totalSkipped,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[notes-worker] FATAL:', err);
    if (jobId && supabase) {
      await finishJob(supabase, jobId, 'failed', err.message || 'Worker crashed').catch(() => {});
    }
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
});
