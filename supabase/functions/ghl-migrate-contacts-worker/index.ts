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
  smartCapitalizeName,
  mergeJobPayload,
} from '../_shared/migration-jobs.ts';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const PAGE_LIMIT = 100;
// Shorter budget — the cron dispatcher resumes us within ~15s, so we
// don't need to push 5+ minutes per invocation. Smaller batches mean
// faster recovery from any single edge-runtime crash.
const MAX_RUNTIME_MS = 90_000;

// ── Adaptive throttle (token bucket) ──────────────────────────────────
// GHL v2 limit: ~100 req / 10s per location. We start at 8 req/s to keep
// safe headroom against shared-token callers (webhooks, calendar sync,
// other workers). On every 429 we halve the rate for ~30s, then ramp back.
const RATE_MAX_PER_SEC = 8;
const RATE_MIN_PER_SEC = 1;
const THROTTLE_RECOVERY_MS = 30_000;
let currentRatePerSec = RATE_MAX_PER_SEC;
let lastRequestAt = 0;
let throttleSince = 0;

async function rateGate(): Promise<void> {
  // Recover throttle after the cool-off window
  if (throttleSince && Date.now() - throttleSince > THROTTLE_RECOVERY_MS) {
    currentRatePerSec = Math.min(RATE_MAX_PER_SEC, currentRatePerSec * 2);
    if (currentRatePerSec >= RATE_MAX_PER_SEC) throttleSince = 0;
    else throttleSince = Date.now();
  }
  const minIntervalMs = Math.ceil(1000 / currentRatePerSec);
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < minIntervalMs) {
    await new Promise((r) => setTimeout(r, minIntervalMs - elapsed));
  }
  lastRequestAt = Date.now();
}

function noteThrottleHit(): void {
  currentRatePerSec = Math.max(RATE_MIN_PER_SEC, Math.floor(currentRatePerSec / 2));
  throttleSince = Date.now();
  console.warn(`[contacts-worker] throttle: 429 → reduced rate to ${currentRatePerSec} req/s for ${THROTTLE_RECOVERY_MS}ms`);
}

/**
 * GHL fetch with: token-bucket rate gate, Retry-After honouring,
 * exponential backoff + jitter on 429/5xx (max 3 retries).
 */
async function ghlFetch(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
  let attempt = 0;
  while (true) {
    await rateGate();
    const res = await fetch(url, init);
    if (res.status !== 429 && res.status < 500) return res;

    if (res.status === 429) noteThrottleHit();

    if (attempt >= maxRetries) return res;

    // Honour Retry-After (seconds, or HTTP-date). Cap to 30s sanity bound.
    const retryAfter = res.headers.get('Retry-After');
    let waitMs = 0;
    if (retryAfter) {
      const asInt = Number(retryAfter);
      if (Number.isFinite(asInt)) waitMs = asInt * 1000;
      else {
        const dateMs = Date.parse(retryAfter);
        if (Number.isFinite(dateMs)) waitMs = Math.max(0, dateMs - Date.now());
      }
    }
    if (!waitMs) {
      // Exponential backoff + jitter: 1s, 2s, 4s ± 25%
      const base = 1000 * Math.pow(2, attempt);
      const jitter = base * (0.75 + Math.random() * 0.5);
      waitMs = Math.round(jitter);
    }
    waitMs = Math.min(waitMs, 30_000);
    // Drain body so the connection can be reused
    try { await res.text(); } catch {}
    console.warn(`[contacts-worker] retry: status=${res.status} attempt=${attempt + 1}/${maxRetries} waiting=${waitMs}ms`);
    await new Promise((r) => setTimeout(r, waitMs));
    attempt++;
  }
}

function getCustomFieldValue(contact: any, ...keys: string[]): string {
  const candidates = Array.isArray(contact?.customFields) ? contact.customFields : [];
  if (!candidates.length) return '';
  const normalized = keys.map((k) => k.trim().toLowerCase());
  for (const field of candidates) {
    const rawKey = String(field?.key || field?.id || field?.name || '').trim().toLowerCase();
    if (!rawKey) continue;
    if (normalized.some((k) => rawKey === k || rawKey.includes(k))) {
      const value = field?.field_value ?? field?.value ?? '';
      const v = String(value ?? '').trim();
      if (v) return v;
    }
  }
  return '';
}

function toIntegerString(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^[-+]?\d+(\.\d+)?e[+-]?\d+$/i.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return '';
    return Math.trunc(n).toString();
  }
  const digits = s.replace(/[^0-9.-]/g, '');
  if (!digits) return '';
  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return '';
  return Math.trunc(parsed).toString();
}

function isPlaceholderResolutionName(name: string): boolean {
  const normalized = normalizeContactName(name);
  return !normalized || normalized === 'unknown unknown' || normalized === 'unknown';
}

async function targetContactExists(contactId: string, headers: Record<string, string>): Promise<boolean> {
  const res = await ghlFetch(`${GHL_API_BASE}/contacts/${contactId}`, { headers });
  if (res.ok) {
    await res.text().catch(() => '');
    return true;
  }

  const body = await res.text().catch(() => '');
  if (res.status === 404 || res.status === 410) return false;

  // Critical: never treat an inconclusive probe as proof that a target contact
  // exists. GHL commonly returns 429 during migrations; fail-open here causes
  // stale mapping rows from a wiped target account to skip every contact before
  // create-first can run.
  console.warn(
    `[contacts-worker] target existence probe inconclusive for ${contactId}: ` +
      `${res.status} ${body.substring(0, 160)} — treating mapping as stale`,
  );
  return false;
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
    const preserveCsvStructure = payload.preserve_csv_structure !== false;
    // Write mode:
    //   'create_first' (default) → POST /contacts/ then fall back to /contacts/upsert
    //                              only if GHL signals a duplicate
    //   'upsert'                  → legacy behaviour: always /contacts/upsert
    const writeMode: 'create_first' | 'upsert' =
      payload.write_mode === 'upsert' ? 'upsert' : 'create_first';

    // In create-first migrations, old mapping rows must NOT short-circuit writes.
    // The new target account was wiped, so stale `ghl_id_mapping` rows can only
    // be trusted when the caller explicitly asks to reuse existing mappings.
    const reuseExistingMappings = payload.reuse_existing_mappings === true;
    const forceReingest = payload.force_reingest === true || (writeMode === 'create_first' && !reuseExistingMappings);
    const allowNameDedupe = payload.allow_name_dedupe === true && reuseExistingMappings;

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
    let usedRawCombinedName = 0;
    let unknownPlaceholderNames = 0;
    let skippedMissingContactMethod = 0;
    let skippedJunkName = 0;
    let skippedByNameDedupe = 0;
    let preservedLegacySourceCount = 0;
    let scientificPhoneNormalized = 0;
    let staleMappingsRehydrated = 0;
    let skippedByVerifiedMapping = 0;
    let structuredRecordsEmbedded = 0;
    let createdViaPost = 0;
    let mergedViaUpsertFallback = 0;
    let createDuplicateDetected = 0;
    let firstPage = true;
    let totalEstimate = 0;
    const contactExistenceCache = new Map<string, boolean>();

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
        const rawCombinedName = String(contact.contactName || contact.name || '').trim();
        const canonicalName = sanitized.fullName || rawCombinedName;
        if (!sanitized.fullName && rawCombinedName) usedRawCombinedName++;
        const junkReason = canonicalName ? detectJunkContactName(canonicalName) : null;

        const fallbackTokens = canonicalName.split(/\s+/).filter(Boolean);
        const fallbackFirst = fallbackTokens[0] ? smartCapitalizeName(fallbackTokens[0]) : '';
        const fallbackLast = fallbackTokens.length > 1 ? smartCapitalizeName(fallbackTokens.slice(1).join(' ')) : '';
        const safeFirst = sanitized.firstName || fallbackFirst || (junkReason ? '' : 'Unknown');
        const safeLast = sanitized.lastName || fallbackLast || (junkReason ? '' : 'Unknown');
        const contactName = (canonicalName
          || [safeFirst, safeLast].filter(Boolean).join(' ').trim()
          || (contact.email || '').trim()
          || '(no name)').trim();

        // Reject ONLY when the name is unambiguously junk (email/phone-as-name,
        // "test", repeated chars). "Unknown Unknown" is allowed (matches
        // reference export behaviour).
        if (junkReason) {
          skippedJunkName++;
          totalSkipped++;
          await recordItem(supabase, {
            job_id: jobId,
            source_id: contact.id,
            entity_label: contactName,
            status: 'skipped',
            error_message: `Sanitization rejected: ${junkReason}`,
          });
          continue;
        }

        if (safeFirst === 'Unknown' || safeLast === 'Unknown') unknownPlaceholderNames++;

        // Check if already mirrored by source contact id
        const { data: existing } = await supabase
          .from('ghl_id_mapping')
          .select('new_ghl_id')
          .eq('resource_type', 'contact')
          .eq('old_ghl_id', contact.id)
          .eq('source_account_label', sourceAccount)
          .eq('target_account_label', targetAccount)
          .maybeSingle();

        if (existing?.new_ghl_id && !forceReingest) {
          let existsInTarget = contactExistenceCache.get(existing.new_ghl_id);
          if (existsInTarget === undefined) {
            existsInTarget = await targetContactExists(existing.new_ghl_id, targetHeaders);
            contactExistenceCache.set(existing.new_ghl_id, existsInTarget);
          }

          if (existsInTarget) {
            skippedByVerifiedMapping++;
            totalSkipped++;
            await recordItem(supabase, {
              job_id: jobId,
              source_id: contact.id,
              target_id: existing.new_ghl_id,
              entity_label: contactName,
              status: 'skipped',
              error_message: 'Already mapped (verified in target)',
            });
            continue;
          }

          // Stale mapping row pointing at a deleted/non-existent target contact.
          staleMappingsRehydrated++;
          await supabase
            .from('ghl_id_mapping')
            .delete()
            .eq('resource_type', 'contact')
            .eq('old_ghl_id', contact.id)
            .eq('source_account_label', sourceAccount)
            .eq('target_account_label', targetAccount);
        }

        // FULL_NAME DEDUPE. This is the canonical contact-resolution layer:
        // if a legacy contact's sanitized full_name has already been mirrored,
        // reuse the existing target contact and only refresh the ID mapping.
        // This prevents one bulk import from spraying repeated full_name rows
        // into the new GHL account as separate contacts.
        if (allowNameDedupe) {
          const normalizedName = normalizeContactName(contactName);
          if (normalizedName && !isPlaceholderResolutionName(contactName)) {
            const nameMatch = await resolveTargetContactByName(supabase, {
              fullName: contactName,
              sourceAccount,
              targetAccount,
            });
            if (nameMatch.newId) {
              let existsInTarget = contactExistenceCache.get(nameMatch.newId);
              if (existsInTarget === undefined) {
                existsInTarget = await targetContactExists(nameMatch.newId, targetHeaders);
                contactExistenceCache.set(nameMatch.newId, existsInTarget);
              }
              if (!existsInTarget) {
                await supabase
                  .from('ghl_id_mapping')
                  .delete()
                  .eq('resource_type', 'contact')
                  .eq('new_ghl_id', nameMatch.newId)
                  .eq('source_account_label', sourceAccount)
                  .eq('target_account_label', targetAccount);
              } else {
              skippedByNameDedupe++;
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
          }
        }

        // ── Healthy-shape value normalization (matches reference export)
        const cleanEmail = normalizeEmail(contact.email);
        const rawPhone = String(contact.phone || '').trim();
        const phoneForNormalization = /^[-+]?\d+(\.\d+)?e[+-]?\d+$/i.test(rawPhone)
          ? toIntegerString(rawPhone)
          : rawPhone;
        if (phoneForNormalization !== rawPhone && phoneForNormalization) scientificPhoneNormalized++;
        const cleanPhone = normalizePhoneE164(phoneForNormalization);

        // GHL /contacts/upsert REQUIRES at least one of email or phone.
        if (!cleanEmail && !cleanPhone) {
          skippedMissingContactMethod++;
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
        const mergedTags = preserveCsvStructure
          ? Array.from(new Set([
              ...sourceTags,
              ...(pipelineStatus ? [`Stage: ${pipelineStatus}`] : []),
            ]))
          : Array.from(new Set([
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
            { key: 'secondary_first_name', field_value: smartCapitalizeName(secondaryFirst) },
            { key: 'secondary_last_name',  field_value: smartCapitalizeName(secondaryLast)  },
          );
        }
        // Preserve legacy CSV-import structure columns so target account data
        // mirrors the same shape used in existing exports/imports.
        const portfolioValue = getCustomFieldValue(contact, 'portfolio_value', 'portfolio value');
        const totalDebt = getCustomFieldValue(contact, 'total_debt', 'total debt');
        const netCashFlow = getCustomFieldValue(contact, 'net_cash_flow', 'net cash flow');
        const propertiesCount = getCustomFieldValue(contact, 'properties', 'properties_count');
        const followUpInDays = getCustomFieldValue(contact, 'follow_up_in_days', 'follow up in days', 'follow_up');
        const nextReviewDate = getCustomFieldValue(contact, 'next_review_date', 'next review');
        const reviewFrequency = getCustomFieldValue(contact, 'review_frequency', 'review freq');
        const pipelineStatusLegacy = getCustomFieldValue(contact, 'pipeline_status', 'pipeline stage') || pipelineStatus;
        const ghlStatusLegacy = getCustomFieldValue(contact, 'ghl_status', 'sync_status') || 'synced';

        passthroughCustomFields.push(
          { key: 'portfolio_value', field_value: toIntegerString(portfolioValue) || '0' },
          { key: 'total_debt', field_value: toIntegerString(totalDebt) || '0' },
          { key: 'net_cash_flow', field_value: netCashFlow || '0' },
          { key: 'properties', field_value: toIntegerString(propertiesCount) || '0' },
          { key: 'pipeline_status', field_value: pipelineStatusLegacy || '' },
          { key: 'follow_up_in_days', field_value: followUpInDays || '' },
          { key: 'next_review_date', field_value: nextReviewDate || '' },
          { key: 'review_frequency', field_value: reviewFrequency || 'annual' },
          { key: 'ghl_contact_id', field_value: String(contact.id || '') },
          { key: 'ghl_status', field_value: ghlStatusLegacy },
        );
        const sourceLabel = String(contact.source || '').trim();
        const normalizedSource = sourceLabel || 'Client Management Export';
        if (sourceLabel) preservedLegacySourceCount++;
        const legacyStructureRecord = {
          first_name: safeFirst || 'Unknown',
          last_name: safeLast || 'Unknown',
          email: cleanEmail || '',
          phone: cleanPhone || '',
          tags: mergedTags,
          source: normalizedSource,
          secondary_first_name: smartCapitalizeName(secondaryFirst),
          secondary_last_name: smartCapitalizeName(secondaryLast),
          portfolio_value: toIntegerString(portfolioValue) || '0',
          total_debt: toIntegerString(totalDebt) || '0',
          net_cash_flow: netCashFlow || '0',
          properties: toIntegerString(propertiesCount) || '0',
          pipeline_status: pipelineStatusLegacy || '',
          follow_up_in_days: followUpInDays || '',
          next_review_date: nextReviewDate || '',
          review_frequency: reviewFrequency || 'annual',
          ghl_contact_id: String(contact.id || ''),
          ghl_status: ghlStatusLegacy,
        };
        passthroughCustomFields.push(
          { key: 'legacy_contact_id', field_value: String(contact.id || '') },
          { key: 'legacy_account_label', field_value: sourceAccount },
          { key: 'migration_target_account', field_value: targetAccount },
          { key: 'legacy_source', field_value: normalizedSource },
          { key: 'legacy_csv_structure_json', field_value: JSON.stringify(legacyStructureRecord) },
        );
        structuredRecordsEmbedded++;

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

        // LIVE: write into target account
        try {
          await delay(RATE_LIMIT_MS);
          const writeBody = {
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
            source: preserveCsvStructure ? normalizedSource : 'Client Management Export',
            customFields: passthroughCustomFields,
          };

          // ── Helper: detect "duplicate exists" responses from POST /contacts/
          //
          // GHL returns:
          //   400 with body containing the existing contact id, OR
          //   409 Conflict with body { meta: { contactId } }, OR
          //   message text containing "duplicated contacts" / "already exists"
          // when an email/phone collides with an existing contact.
          const detectDuplicateContactId = (status: number, raw: string, parsed: any): string | null => {
            const body = (() => { try { return JSON.parse(raw); } catch { return null; } })();
            const candidate =
              body?.meta?.contactId ||
              body?.contactId ||
              body?.contact?.id ||
              parsed?.meta?.contactId ||
              null;
            if (candidate && (status === 400 || status === 409)) return String(candidate);
            const msg = String(parsed?.message || raw || '').toLowerCase();
            if (status === 409 || /duplicat|already exists|exists with the same/.test(msg)) {
              // No id but message clearly says duplicate — caller will fall back to upsert.
              return 'unknown';
            }
            return null;
          };

          let newId: string | null = null;
          let writePathTaken: 'create' | 'create_then_upsert' | 'upsert' = 'upsert';

          if (writeMode === 'create_first') {
            // Step 1: try POST /contacts/
            const createRes = await fetch(`${GHL_API_BASE}/contacts/`, {
              method: 'POST',
              headers: targetHeaders,
              body: JSON.stringify(writeBody),
            });

            if (createRes.ok) {
              const createData = await createRes.json();
              newId = createData?.contact?.id || createData?.id || null;
              writePathTaken = 'create';
              createdViaPost++;
              console.log(`[contacts-worker] write_path=create source=${contact.id} new=${newId} name="${contactName}"`);
            } else {
              const errText = await createRes.text();
              const parsed = parseGhlError(errText);
              const dup = detectDuplicateContactId(createRes.status, errText, parsed);

              if (dup) {
                createDuplicateDetected++;
                console.log(`[contacts-worker] write_path=create_duplicate source=${contact.id} dup_id=${dup} status=${createRes.status} — falling back to upsert`);
                // Fall through to upsert below
              } else {
                // Real failure (auth, validation, rate limit) — record and continue
                const code = parsed.error_code || `GHL_${createRes.status}`;
                const authDetail = (createRes.status === 401 || createRes.status === 403) && targetAuthHint
                  ? ` ${targetAuthHint}`
                  : '';
                totalFailed++;
                await recordItem(supabase, {
                  job_id: jobId,
                  source_id: contact.id,
                  entity_label: contactName,
                  status: 'failed',
                  error_message: `[${code}] POST /contacts/ ${createRes.status}: ${(parsed.message || errText).substring(0, 220)}${authDetail}`.substring(0, 900),
                });
                continue;
              }
            }
          }

          // Upsert path: either explicit upsert mode, or create_first fallback after duplicate
          if (!newId) {
            await delay(RATE_LIMIT_MS);
            const upRes = await fetch(`${GHL_API_BASE}/contacts/upsert`, {
              method: 'POST',
              headers: targetHeaders,
              body: JSON.stringify(writeBody),
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
                error_message: `[${code}] /contacts/upsert ${upRes.status}: ${(parsed.message || errText).substring(0, 220)}${authDetail}`.substring(0, 900),
              });
              continue;
            }

            const upData = await upRes.json();
            newId = upData?.contact?.id || upData?.id || null;
            if (writeMode === 'create_first') {
              writePathTaken = 'create_then_upsert';
              mergedViaUpsertFallback++;
              console.log(`[contacts-worker] write_path=create_then_upsert source=${contact.id} merged_into=${newId} name="${contactName}"`);
            } else {
              writePathTaken = 'upsert';
              console.log(`[contacts-worker] write_path=upsert source=${contact.id} target=${newId} name="${contactName}"`);
            }
          }

          if (!newId) {
            totalFailed++;
            await recordItem(supabase, {
              job_id: jobId, source_id: contact.id, entity_label: contactName,
              status: 'failed', error_message: 'Write returned no contact id',
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
            error_message: `write_path=${writePathTaken}`,
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
    await mergeJobPayload(supabase, jobId, {
      ingestion_validation: {
        worker: 'contacts',
        source_seen: totalSeen,
        processed: totalProcessed,
        succeeded: totalSucceeded,
        failed: totalFailed,
        skipped: totalSkipped,
        used_raw_combined_name: usedRawCombinedName,
        unknown_placeholder_names: unknownPlaceholderNames,
        skipped_missing_phone_and_email: skippedMissingContactMethod,
        skipped_junk_name: skippedJunkName,
        preserve_csv_structure: preserveCsvStructure,
        allow_name_dedupe: allowNameDedupe,
        force_reingest: forceReingest,
        skipped_by_name_dedupe: skippedByNameDedupe,
        skipped_by_verified_mapping: skippedByVerifiedMapping,
        stale_mappings_rehydrated: staleMappingsRehydrated,
        preserved_legacy_source_count: preservedLegacySourceCount,
        scientific_phone_normalized: scientificPhoneNormalized,
        structured_records_embedded: structuredRecordsEmbedded,
        write_mode: writeMode,
        created_via_post: createdViaPost,
        merged_via_upsert_fallback: mergedViaUpsertFallback,
        create_duplicate_detected: createDuplicateDetected,
      },
    });
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
