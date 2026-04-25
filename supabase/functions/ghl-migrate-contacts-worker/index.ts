/**
 * GHL Migrate: CONTACTS Worker (Phase 2B)
 *
 * Mirrors contacts from `source_account` → `target_account` in GHL,
 * recording each new contact's ID in `ghl_id_mapping` so downstream
 * workers (opportunities, conversations, notes) can translate IDs.
 *
 * Strategy:
 *   - Pull contacts from source GHL via /contacts/?locationId=... (paginated)
 *   - For each contact, check existing ghl_id_mapping; skip if already mirrored
 *   - In dry_run: only enumerate, do NOT write to GHL
 *   - In live: POST /contacts/upsert to target account, then store mapping
 *
 * Internal-call only (service role key in body).
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
  startJob,
  finishJob,
  recordItem,
  recordIdMapping,
  updateJobProgress,
  delay,
  saveCheckpoint,
  loadCheckpoint,
  partialExit,
  heartbeat,
  resolveTargetContactByName,
  normalizeContactName,
  readControlSignal,
  sanitizeContactNameParts,
  detectJunkContactName,
  normalizePhoneE164,
  normalizeEmail,
} from '../_shared/migration-jobs.ts';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const PAGE_LIMIT = 100;
// Shorter budget — the cron dispatcher resumes us within ~15s, so we
// don't need to push 5+ minutes per invocation. Smaller batches mean
// faster recovery from any single edge-runtime crash.
const MAX_RUNTIME_MS = 90_000;
const RATE_LIMIT_MS = 250;

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

    // Internal-call validation
    if (body._service_token !== serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }

    supabase = createClient(supabaseUrl, serviceRoleKey);
    jobId = body.job_id as string;
    const sourceAccount = body.source_account as 'legacy' | 'new';
    const targetAccount = body.target_account as 'legacy' | 'new';
    const dryRun = body.dry_run !== false;
    const payload = body.payload || {};
    const maxItems = Number(payload.max_items) || 0; // 0 = no cap

    if (!jobId) return new Response(JSON.stringify({ error: 'job_id required' }), { status: 400 });

    const sourceCreds = getGhlCredentials(sourceAccount);
    const targetCreds = getGhlCredentials(targetAccount);
    const sourceErr = validateGhlCredentials(sourceCreds);
    const targetErr = validateGhlCredentials(targetCreds);
    if (sourceErr || targetErr) {
      await finishJob(supabase, jobId, 'failed', sourceErr || targetErr || 'Missing credentials');
      return new Response(JSON.stringify({ error: sourceErr || targetErr }), { status: 400 });
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
      console.log('[contacts-worker] target token diagnostics:', JSON.stringify({
        token_type_hint: targetAccess.diagnostics.token_type_hint,
        has_location_id: targetAccess.diagnostics.has_location_id,
        location_id_matches_secret: targetAccess.diagnostics.location_id_matches_secret,
        has_company_id: targetAccess.diagnostics.has_company_id,
        exchange_attempted: targetAccess.diagnostics.exchange_attempted || false,
        exchange_succeeded: targetAccess.diagnostics.exchange_succeeded || false,
        exchange_error: targetAccess.diagnostics.exchange_error || null,
      }));
    }

    console.log(`[contacts-worker] job=${jobId} ${sourceAccount}→${targetAccount} dry_run=${dryRun}`);

    // Phase 1: enumerate source contacts to determine total
    // GHL pagination uses `startAfter` & `startAfterId` cursors
    let totalSeen = 0;
    let totalProcessed = 0;
    let totalSucceeded = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    let firstPage = true;
    let totalEstimate = 0;

    // Resume from saved checkpoint (if this is a redispatch)
    const checkpoint = await loadCheckpoint(supabase, jobId);
    let nextStartAfterId: string | null = checkpoint.cursor.startAfterId || null;
    let nextStartAfter: string | null = checkpoint.cursor.startAfter || null;
    const isResume = body._resume === true || nextStartAfterId !== null;

    if (isResume) {
      console.log(`[contacts-worker] RESUMING job=${jobId} dispatch#${checkpoint.dispatchCount} cursor=${JSON.stringify(checkpoint.cursor)}`);
      // Don't call startJob on resume — preserves total_items and started_at
    } else {
      await startJob(supabase, jobId, 0); // total updated as we discover
    }

    while (true) {
      // ── Granular control: pause / cancel / kill ─────────────────────
      const signal = await readControlSignal(supabase, jobId);
      if (signal === 'kill' || signal === 'cancel') {
        console.log(`[contacts-worker] ${signal.toUpperCase()} signal received — finalizing as cancelled at ${totalProcessed} processed`);
        await updateJobProgress(supabase, jobId, {
          processed_items: totalProcessed,
          succeeded_items: totalSucceeded,
          failed_items: totalFailed,
        });
        await finishJob(supabase, jobId, 'cancelled', `Cancelled by user (${signal}) at ${totalProcessed} processed`);
        return new Response(JSON.stringify({
          success: true, cancelled: true, signal, processed: totalProcessed,
        }), { headers: { 'Content-Type': 'application/json' } });
      }
      if (signal === 'pause') {
        console.log(`[contacts-worker] PAUSE signal received — checkpointing at ${totalProcessed} processed`);
        await partialExit(
          supabase, jobId,
          { startAfterId: nextStartAfterId, startAfter: nextStartAfter },
          { processed_items: totalProcessed, succeeded_items: totalSucceeded, failed_items: totalFailed },
          nextStartAfterId,
        );
        return new Response(JSON.stringify({
          success: true, paused: true, processed: totalProcessed,
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      if (Date.now() - startedAt > MAX_RUNTIME_MS) {
        console.log(`[contacts-worker] Time budget exhausted at ${totalProcessed} processed — handing off to dispatcher`);
        await partialExit(
          supabase,
          jobId,
          { startAfterId: nextStartAfterId, startAfter: nextStartAfter },
          {
            processed_items: totalProcessed,
            succeeded_items: totalSucceeded,
            failed_items: totalFailed,
          },
          nextStartAfterId,
        );
        return new Response(JSON.stringify({
          success: true,
          partial: true,
          processed: totalProcessed,
          handed_off_to: 'migration-dispatcher',
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      const params = new URLSearchParams({
        locationId: sourceCreds.locationId!,
        limit: String(PAGE_LIMIT),
      });
      if (nextStartAfterId) params.set('startAfterId', nextStartAfterId);
      if (nextStartAfter) {
        // GHL requires `startAfter` as a numeric millisecond timestamp,
        // NOT an ISO date string. Convert if needed (cursor may have been
        // saved as ISO from `contact.dateAdded` in older runs).
        const numeric = /^\d+$/.test(String(nextStartAfter))
          ? String(nextStartAfter)
          : String(new Date(nextStartAfter).getTime());
        params.set('startAfter', numeric);
      }

      const res = await fetch(`${GHL_API_BASE}/contacts/?${params}`, { headers: sourceHeaders });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Source contacts fetch failed: ${res.status} ${text.substring(0, 200)}`);
      }
      const data = await res.json();
      const contacts: any[] = data.contacts || [];
      if (firstPage) {
        totalEstimate = data.meta?.total ?? data.total ?? 0;
        if (totalEstimate > 0) {
          await updateJobProgress(supabase, jobId, { total_items: maxItems > 0 ? Math.min(maxItems, totalEstimate) : totalEstimate });
        }
        firstPage = false;
      }

      if (contacts.length === 0) break;

      for (const contact of contacts) {
        if (maxItems > 0 && totalProcessed >= maxItems) break;
        if (Date.now() - startedAt > MAX_RUNTIME_MS) break;

        totalSeen++;
        totalProcessed++;

        // ── SANITIZATION (legacy → new) ────────────────────────────────
        // Apply the SAME shape the reference Client Management Export
        // produces:
        //   - Smart-cased first/last (Mihir Patel, Melissa Willis Bennett)
        //   - "Unknown" placeholder when a name part is missing but the
        //     row has a phone/email (matches reference rows like
        //     "Unknown Unknown" / "Rahul Unknown")
        //   - Phone forced to E.164 (+61… for AU local)
        //   - Email lowercased
        //   - Tags ALWAYS include "NPC Export"; pipeline status (if any)
        //     becomes its own tag so the opportunities worker can
        //     re-create the lifecycle stage downstream
        //   - Source set to a clean human label (no raw IDs)
        //   - Secondary contact name preserved as custom fields
        const sanitized = sanitizeContactNameParts(contact.firstName, contact.lastName);
        const safeFirst = sanitized.firstName || (sanitized.junkReason ? '' : 'Unknown');
        const safeLast = sanitized.lastName || (sanitized.junkReason ? '' : 'Unknown');
        const contactName = (sanitized.fullName
          || [safeFirst, safeLast].filter(Boolean).join(' ').trim()
          || (contact.contactName || contact.email || '').trim()
          || '(no name)').trim();

        // Reject ONLY when the name is unambiguously junk (email/phone-as-name,
        // "test", repeated chars). "Unknown Unknown" is allowed (matches
        // reference export behaviour).
        if (sanitized.junkReason) {
          totalSkipped++;
          await recordItem(supabase, {
            job_id: jobId,
            source_id: contact.id,
            entity_label: contactName,
            status: 'skipped',
            error_message: `Sanitization rejected: ${sanitized.junkReason}`,
          });
          continue;
        }

        // Check if already mirrored by source contact id
        const { data: existing } = await supabase
          .from('ghl_id_mapping')
          .select('new_ghl_id')
          .eq('resource_type', 'contact')
          .eq('old_ghl_id', contact.id)
          .eq('source_account_label', sourceAccount)
          .eq('target_account_label', targetAccount)
          .maybeSingle();

        if (existing?.new_ghl_id) {
          totalSkipped++;
          await recordItem(supabase, {
            job_id: jobId,
            source_id: contact.id,
            target_id: existing.new_ghl_id,
            entity_label: contactName,
            status: 'skipped',
            error_message: 'Already mapped',
          });
          continue;
        }

        // NAME-BASED DEDUPE on the SANITIZED name (project policy: full_name
        // is source of truth). Reuses existing target contact if a sibling
        // legacy record with the same normalized name was already mirrored.
        const normalizedName = normalizeContactName(contactName);
        if (normalizedName) {
          const nameMatch = await resolveTargetContactByName(supabase, {
            fullName: contactName,
            sourceAccount,
            targetAccount,
          });
          if (nameMatch.newId) {
            await recordIdMapping(supabase, {
              resource_type: 'contact',
              old_ghl_id: contact.id,
              new_ghl_id: nameMatch.newId,
              source_account_label: sourceAccount,
              target_account_label: targetAccount,
              notes: contactName,
            });
            totalSkipped++;
            await recordItem(supabase, {
              job_id: jobId,
              source_id: contact.id,
              target_id: nameMatch.newId,
              entity_label: contactName,
              status: 'skipped',
              error_message: nameMatch.ambiguous
                ? `Reused existing target contact by name (ambiguous: ${nameMatch.candidateCount} candidates, picked latest)`
                : 'Reused existing target contact by name',
            });
            continue;
          }
        }

        // ── Healthy-shape value normalization (matches reference export)
        const cleanEmail = normalizeEmail(contact.email);
        const cleanPhone = normalizePhoneE164(contact.phone);

        // GHL /contacts/upsert REQUIRES at least one of email or phone.
        if (!cleanEmail && !cleanPhone) {
          totalSkipped++;
          await recordItem(supabase, {
            job_id: jobId,
            source_id: contact.id,
            entity_label: contactName,
            status: 'skipped',
            error_message: 'No email or phone on source contact (GHL upsert requires at least one)',
          });
          continue;
        }

        // ── Pipeline status as a tag (preserves lifecycle for opportunities worker)
        const sourceTags: string[] = Array.isArray(contact.tags)
          ? contact.tags.map((t: any) => String(t || '').trim()).filter(Boolean)
          : [];
        const pipelineStatus = String(
          contact.pipelineStatus || contact.opportunityStatus || ''
        ).trim();
        const mergedTags = Array.from(new Set([
          ...sourceTags,
          'NPC Export',                                       // fixed marker (matches reference)
          `Migration: ${sourceAccount}→${targetAccount}`,      // audit tag
          ...(pipelineStatus ? [`Stage: ${pipelineStatus}`] : []),
        ]));

        // ── Secondary contact name passthrough (custom fields)
        const secondaryFirst = String(contact.secondaryFirstName || contact.secondary_first_name || '').trim();
        const secondaryLast  = String(contact.secondaryLastName  || contact.secondary_last_name  || '').trim();
        const passthroughCustomFields = Array.isArray(contact.customFields) ? [...contact.customFields] : [];
        if (secondaryFirst || secondaryLast) {
          passthroughCustomFields.push(
            { key: 'secondary_first_name', field_value: smartCap(secondaryFirst) },
            { key: 'secondary_last_name',  field_value: smartCap(secondaryLast)  },
          );
        }

        if (dryRun) {
          totalSucceeded++;
          await recordItem(supabase, {
            job_id: jobId,
            source_id: contact.id,
            target_id: null,
            entity_label: contactName,
            status: 'succeeded',
            error_message: 'DRY RUN — would mirror (sanitized to reference shape)',
          });
          continue;
        }

        // LIVE: upsert into target account
        try {
          await delay(RATE_LIMIT_MS);
          const upsertBody = {
            locationId: targetCreds.locationId,
            firstName: safeFirst,
            lastName: safeLast,
            name: contactName,                                // full_name is the source of truth
            email: cleanEmail || undefined,
            phone: cleanPhone || undefined,
            tags: mergedTags,
            address1: contact.address1 || undefined,
            city: contact.city || undefined,
            state: contact.state || undefined,
            postalCode: contact.postalCode || undefined,
            country: contact.country || 'Australia',          // matches reference default
            source: 'Client Management Export',                // matches reference Source column
            customFields: passthroughCustomFields,
          };

          const upRes = await fetch(`${GHL_API_BASE}/contacts/upsert`, {
            method: 'POST',
            headers: targetHeaders,
            body: JSON.stringify(upsertBody),
          });

          if (!upRes.ok) {
            const errText = await upRes.text();
            const parsed = parseGhlError(errText);
            const code = parsed.error_code || `GHL_${upRes.status}`;
            const authDetail = (upRes.status === 401 || upRes.status === 403) && targetAuthHint
              ? ` ${targetAuthHint}`
              : '';
            totalFailed++;
            await recordItem(supabase, {
              job_id: jobId,
              source_id: contact.id,
              entity_label: contactName,
              status: 'failed',
              error_message: `[${code}] ${upRes.status}: ${(parsed.message || errText).substring(0, 260)}${authDetail}`.substring(0, 900),
            });
            continue;
          }

          const upData = await upRes.json();
          const newId = upData?.contact?.id || upData?.id;
          if (!newId) {
            totalFailed++;
            await recordItem(supabase, {
              job_id: jobId, source_id: contact.id, entity_label: contactName,
              status: 'failed', error_message: 'Upsert returned no contact id',
            });
            continue;
          }

          await recordIdMapping(supabase, {
            resource_type: 'contact',
            old_ghl_id: contact.id,
            new_ghl_id: newId,
            source_account_label: sourceAccount,
            target_account_label: targetAccount,
            notes: contactName,
          });

          totalSucceeded++;
          await recordItem(supabase, {
            job_id: jobId, source_id: contact.id, target_id: newId,
            entity_label: contactName, status: 'succeeded',
          });
        } catch (e: any) {
          totalFailed++;
          await recordItem(supabase, {
            job_id: jobId, source_id: contact.id, entity_label: contactName,
            status: 'failed', error_message: e.message?.substring(0, 300) || 'Unknown error',
          });
        }
      }

      // Update progress + checkpoint every page
      await updateJobProgress(supabase, jobId, {
        processed_items: totalProcessed,
        succeeded_items: totalSucceeded,
        failed_items: totalFailed,
      });
      // Heartbeat extends our lease so the dispatcher doesn't steal the job
      // mid-flight just because we've spent a while on slow GHL pages.
      await heartbeat(supabase, jobId);

      // Pagination: GHL returns either nextPage cursor or last contact's startAfter values
      const last = contacts[contacts.length - 1];
      nextStartAfterId = last?.id || null;
      nextStartAfter = last?.dateAdded || null;

      // Persist cursor + last source id so a future redispatch resumes here
      await saveCheckpoint(
        supabase,
        jobId,
        { startAfterId: nextStartAfterId, startAfter: nextStartAfter },
        last?.id || null,
      );

      if (maxItems > 0 && totalProcessed >= maxItems) break;
      // Walk every page via cursor; only an empty page (handled above) or
      // a missing cursor is a stop signal. Removes the artificial cap that
      // used to fire when GHL returned fewer than PAGE_LIMIT records on a
      // mid-stream page (which it sometimes does even when more exist).
      if (!nextStartAfterId) break;
    }

    // Clear cursor on natural completion + release dispatcher lock
    await saveCheckpoint(supabase, jobId, {});
    try { await supabase.rpc('release_migration_job_lock', { p_job_id: jobId }); } catch {}
    await finishJob(supabase, jobId, totalFailed > 0 && totalSucceeded === 0 ? 'failed' : 'completed',
      totalFailed > 0 ? `Completed with ${totalFailed} failures` : undefined);

    console.log(`[contacts-worker] DONE job=${jobId} processed=${totalProcessed} ok=${totalSucceeded} fail=${totalFailed} skip=${totalSkipped}`);

    return new Response(JSON.stringify({
      success: true,
      job_id: jobId,
      processed: totalProcessed,
      succeeded: totalSucceeded,
      failed: totalFailed,
      skipped: totalSkipped,
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[contacts-worker] FATAL:', err);
    if (jobId && supabase) {
      await finishJob(supabase, jobId, 'failed', err.message || 'Worker crashed').catch(() => {});
    }
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
});
