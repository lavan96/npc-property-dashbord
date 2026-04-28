/**
 * GHL Migrate: CONVERSATIONS REPLAY Worker (Phase B)
 *
 * Re-ingests historical conversations and messages from our local
 * `ghl_conversations` / `ghl_conversation_messages` mirror into the TARGET
 * GHL account. Two-stage pipeline per legacy conversation:
 *
 *   1. Resolve target contactId via ghl_id_mapping (created by the
 *      contacts worker). Skip if no mapping exists.
 *   2. POST /conversations/  → create the conversation shell in target.
 *   3. Replay messages chronologically via POST /conversations/messages
 *      with a per-channel `type` and `direction`. Inbound and outbound
 *      historical messages use the import-style payload so GHL records
 *      them without sending real SMS/email/etc.
 *
 * Architecture mirrors the notes worker (offset-based per-conversation
 * pagination), with per-message replay nested inside each conversation.
 *
 * Pagination cursor: `{ offset: <int> }` — index into the local list of
 * conversations sorted by created_at ASC. Resume-safe.
 *
 * Advanced flags (in payload):
 *   - max_items                 cap conversations per dispatch (0 = all)
 *   - force_overwrite_existing  re-replay even if new_ghl_conversation_id is set
 *   - skip_attachments          omit attachment URLs from replayed messages
 *   - channel_filter            string[]  e.g. ['sms','email'] (lowercased match)
 *   - date_range_days           only replay conversations with last_message_date
 *                               within the past N days
 *   - skip_activity             default true — never replay system/activity msgs
 *   - prefix_legacy_marker      prepend "[Migrated] " to each replayed body
 *   - max_messages_per_conv     hard cap on messages replayed per shell
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
  resolveTargetContactByName, readControlSignal,
} from '../_shared/migration-jobs.ts';
import { tokenKeyFor } from '../_shared/ghl-rate-limiter.ts';
import { createGhlFetchContext } from '../_shared/ghl-worker-fetch.ts';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const MAX_RUNTIME_MS = 110_000;
// Per-dispatch conversation pull. Replay is heavy (1+N HTTP calls per
// conversation), so keep this modest. Dispatcher re-invokes us until
// cursor exhaustion.
const BATCH = 200;

// Normalise the channel value stored in our mirror (legacy GHL emits
// values like `type_sms`, `type_email`, `type_activity_opportunity`,
// `TYPE_PHONE`, plain `sms`, etc.). Strips the `type_` prefix so the
// downstream switch is consistent.
function normaliseChannel(channel: string | null | undefined): string {
  const raw = (channel || '').toLowerCase().trim();
  return raw.startsWith('type_') ? raw.slice(5) : raw;
}

// Map our internal channel_type → GHL message `type` field for write API.
// Reference: https://highlevel.stoplight.io/docs/integrations/messages-api
// Returns null when the channel cannot safely be replayed (caller skips).
function mapToGhlMessageType(channel: string | null | undefined): string | null {
  const c = normaliseChannel(channel);
  switch (c) {
    case 'sms':
    case 'phone': return 'SMS';
    case 'email': return 'Email';
    case 'whatsapp': return 'WhatsApp';
    case 'fb':
    case 'facebook': return 'FB';
    case 'ig':
    case 'instagram': return 'IG';
    case 'live_chat':
    case 'livechat': return 'Live_Chat';
    case 'gmb':
    case 'google_my_business': return 'GMB';
    case 'custom': return 'Custom';
    case 'sms_reaction': return null; // not replayable via write API
    default: return null; // unknown / activity → skip rather than masquerade
  }
}

// Activity messages aren't real conversations and shouldn't be replayed.
// Handles both raw (`activity_*`, `system`) and prefixed (`type_activity_*`,
// `type_system`) variants emitted by the legacy mirror.
function isActivityChannel(channel: string | null | undefined): boolean {
  const c = normaliseChannel(channel);
  return c === 'activity' || c.startsWith('activity_') || c === 'system';
}

// ─── Uploaded CSV/XLSX support (one row per conversation, messages embedded) ───
// Accepts flexible column headers exported from spreadsheets. The replay
// worker treats each row as a self-contained conversation: a contact full
// name + channel + a JSON / delimited list of messages. The worker then
// resolves the contact in the target GHL by name and replays the messages
// in chronological order — exactly like the mirror-driven path.
function pickFirst(row: Record<string, any>, keys: string[]): string {
  for (const k of keys) {
    const variants = [k, k.toLowerCase(), k.toUpperCase(), k.replace(/_/g, ' ')];
    for (const v of variants) {
      if (row[v] !== undefined && row[v] !== null && String(row[v]).trim() !== '') {
        return String(row[v]).trim();
      }
    }
  }
  return '';
}

function parseUploadedMessages(raw: string): any[] {
  if (!raw) return [];
  // 1) JSON array of message objects
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* not JSON */ }
  // 2) Newline-delimited "[direction|channel|date] body" (best-effort)
  const lines = raw.split(/\r?\n+/).map((l) => l.trim()).filter(Boolean);
  return lines.map((line) => {
    const m = line.match(/^\[(inbound|outbound)?\|?([a-z_]*)?\|?([^\]]*)\]\s*(.*)$/i);
    if (m) {
      return {
        direction: (m[1] || 'outbound').toLowerCase(),
        channel_type: m[2] || null,
        ghl_date_added: m[3] || null,
        body: m[4] || '',
      };
    }
    return { direction: 'outbound', body: line };
  });
}

function normaliseUploadedReplayConversation(row: Record<string, any>, idx: number) {
  const fullName = pickFirst(row, [
    'full_name', 'fullName', 'contact_full_name', 'contact_name', 'name',
  ]) || [pickFirst(row, ['first_name', 'firstName', 'primary_first_name']),
          pickFirst(row, ['last_name', 'lastName', 'surname', 'primary_surname'])]
        .filter(Boolean).join(' ').trim();

  const channel = pickFirst(row, ['channel', 'channel_type', 'type']) || 'sms';
  const messagesRaw = pickFirst(row, [
    'messages', 'messages_json', 'message_log', 'history', 'conversation',
  ]);
  const embeddedMessages = parseUploadedMessages(messagesRaw);
  const lastMsgDate = pickFirst(row, ['last_message_date', 'last_message_at', 'updated_at']);
  return {
    // Mimic the shape returned by the supabase select() so downstream code
    // doesn't need to branch beyond the message source.
    id: `upload:${idx}`,
    ghl_conversation_id: pickFirst(row, ['ghl_conversation_id', 'conversation_id']) || `upload-${idx}`,
    ghl_contact_id: pickFirst(row, ['ghl_contact_id', 'contact_id']) || null,
    channel_type: channel,
    last_message_date: lastMsgDate || null,
    new_ghl_conversation_id: null,
    client_id: null,
    clients: { primary_first_name: fullName.split(' ')[0] || '', primary_surname: fullName.split(' ').slice(1).join(' ') || '' },
    __uploadedMessages: embeddedMessages.map((m, j) => ({
      id: `upload:${idx}:${j}`,
      ghl_message_id: m.ghl_message_id || `upload-${idx}-${j}`,
      direction: (m.direction || 'outbound').toLowerCase(),
      channel_type: m.channel_type || channel,
      body: m.body ?? m.message ?? '',
      attachment_urls: Array.isArray(m.attachment_urls) ? m.attachment_urls : [],
      ghl_date_added: m.ghl_date_added || m.date || null,
      new_ghl_message_id: null,
    })),
  };
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

    // Advanced flags
    const forceOverwriteExisting = payload.force_overwrite_existing === true;
    const skipAttachments = payload.skip_attachments === true;
    const skipActivity = payload.skip_activity !== false; // default true
    const prefixLegacyMarker = payload.prefix_legacy_marker === true;
    const maxMessagesPerConv = Number(payload.max_messages_per_conv) || 0;
    const channelFilter: string[] = Array.isArray(payload.channel_filter)
      ? payload.channel_filter.map((c: any) => String(c).toLowerCase())
      : [];
    const dateRangeDays = Number(payload.date_range_days) || 0;
    const sinceTs = dateRangeDays > 0
      ? new Date(Date.now() - dateRangeDays * 86400_000).toISOString()
      : null;

    console.log(
      `[conv-replay] flags force_overwrite=${forceOverwriteExisting} ` +
      `skip_attachments=${skipAttachments} skip_activity=${skipActivity} ` +
      `prefix_marker=${prefixLegacyMarker} max_msgs/conv=${maxMessagesPerConv} ` +
      `channel_filter=[${channelFilter.join(',')}] since=${sinceTs || 'none'}`,
    );

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

    const targetTokenKey = tokenKeyFor(targetAccount, targetAccess.accessToken);
    const ctx = createGhlFetchContext({
      supabase,
      sourceTokenKey: targetTokenKey,
      targetTokenKey,
      logTag: 'conv-replay',
    });

    if (!dryRun && targetAccess.diagnostics) {
      console.log('[conv-replay] target token diagnostics:', JSON.stringify({
        token_type_hint: targetAccess.diagnostics.token_type_hint,
        location_id_matches_secret: targetAccess.diagnostics.location_id_matches_secret,
        exchange_succeeded: targetAccess.diagnostics.exchange_succeeded || false,
        exchange_error: targetAccess.diagnostics.exchange_error || null,
      }));
    }

    console.log(`[conv-replay] job=${jobId} ${sourceAccount}→${targetAccount} dry_run=${dryRun}`);

    // Resume support
    const checkpoint = await loadCheckpoint(supabase, jobId);
    const isResume = body._resume === true || (checkpoint.cursor.offset || 0) > 0;
    const startOffset = Number(checkpoint.cursor.offset) || 0;

    // Build the conversations query with optional channel + date filters.
    const pullLimit = maxItems > 0 ? Math.min(maxItems, BATCH) : BATCH;
    let convQuery = supabase
      .from('ghl_conversations')
      .select('id, ghl_conversation_id, ghl_contact_id, channel_type, last_message_date, new_ghl_conversation_id, client_id, clients(primary_first_name, primary_surname)')
      .order('created_at', { ascending: true })
      .range(startOffset, startOffset + pullLimit - 1);
    if (channelFilter.length > 0) {
      convQuery = convQuery.in('channel_type', channelFilter);
    }
    if (sinceTs) {
      convQuery = convQuery.gte('last_message_date', sinceTs);
    }

    const { data: conversations, error: convErr } = await convQuery;
    if (convErr) throw new Error(`Conversations query failed: ${convErr.message}`);

    if (isResume) {
      console.log(`[conv-replay] RESUMING job=${jobId} dispatch#${checkpoint.dispatchCount} offset=${startOffset} pulled=${conversations?.length || 0}`);
    } else {
      // Compute the TRUE total (not just this batch) so the UI progress bar is accurate.
      let trueTotal = conversations?.length || 0;
      try {
        let countQuery = supabase
          .from('ghl_conversations')
          .select('id', { count: 'exact', head: true });
        if (channelFilter.length > 0) countQuery = countQuery.in('channel_type', channelFilter);
        if (sinceTs) countQuery = countQuery.gte('last_message_date', sinceTs);
        const { count } = await countQuery;
        if (typeof count === 'number' && count > 0) {
          trueTotal = maxItems > 0 ? Math.min(maxItems, count) : count;
        }
      } catch (e) {
        console.warn('[conv-replay] total count query failed, using batch size:', (e as any)?.message);
      }
      await startJob(supabase, jobId, trueTotal);
    }

    // Cumulative counters
    let baseProcessed = 0, baseSucceeded = 0, baseFailed = 0;
    try {
      const { data: jobRow } = await supabase
        .from('migration_jobs')
        .select('processed_items, succeeded_items, failed_items')
        .eq('id', jobId)
        .maybeSingle();
      baseProcessed = Number(jobRow?.processed_items || 0);
      baseSucceeded = Number(jobRow?.succeeded_items || 0);
      baseFailed = Number(jobRow?.failed_items || 0);
    } catch { /* non-fatal */ }

    let totalProcessed = 0, totalSucceeded = 0, totalFailed = 0, totalSkipped = 0;
    let totalMessagesReplayed = 0;
    let currentOffset = startOffset;
    const progressPatch = () => ({
      processed_items: baseProcessed + totalProcessed,
      succeeded_items: baseSucceeded + totalSucceeded,
      failed_items: baseFailed + totalFailed,
    });

    let timeBudgetExhausted = false;
    let pausedByUser = false;
    let cancelledByUser: 'pause' | 'cancel' | 'kill' | null = null;
    let circuitTripped = false;

    for (const conv of (conversations || [])) {
      // Granular control checks
      if (totalProcessed % 5 === 0) {
        const sig = await readControlSignal(supabase, jobId);
        if (sig === 'kill' || sig === 'cancel') { cancelledByUser = sig; break; }
        if (sig === 'pause') { pausedByUser = true; break; }
      }
      if (ctx.isCircuitTripped()) { circuitTripped = true; break; }
      if (Date.now() - startedAt > MAX_RUNTIME_MS) { timeBudgetExhausted = true; break; }
      if (maxItems > 0 && totalProcessed >= maxItems) break;

      totalProcessed++;
      currentOffset++;
      const client = (conv as any).clients;
      const fullName = [client?.primary_first_name, client?.primary_surname]
        .filter(Boolean).join(' ').trim();
      const label = fullName || conv.ghl_conversation_id || 'Conversation';

      // Activity-channel filter
      if (skipActivity && isActivityChannel(conv.channel_type)) {
        totalSkipped++;
        await recordItem(supabase, {
          job_id: jobId, source_id: conv.id, entity_label: label,
          status: 'skipped',
          error_message: `Skipped — activity/system channel "${conv.channel_type}"`,
        });
        continue;
      }

      // Already replayed?
      if (conv.new_ghl_conversation_id && !forceOverwriteExisting) {
        totalSkipped++;
        await recordItem(supabase, {
          job_id: jobId, source_id: conv.id, target_id: conv.new_ghl_conversation_id,
          entity_label: label, status: 'skipped',
          error_message: 'Already replayed (use force_overwrite_existing to re-create)',
        });
        continue;
      }

      // Resolve target contact by name (matches notes/opportunities pattern)
      const resolved = await resolveTargetContactByName(supabase, {
        fullName,
        sourceAccount,
        targetAccount,
      });

      if (!resolved.newId) {
        totalSkipped++;
        await recordItem(supabase, {
          job_id: jobId, source_id: conv.id, entity_label: label,
          status: 'skipped',
          error_message: fullName
            ? `No target contact named "${fullName}" — run contacts worker first`
            : 'Conversation has no client name to match a target contact',
        });
        continue;
      }
      if (resolved.ambiguous) {
        console.warn(`[conv-replay] Ambiguous "${fullName}" → ${resolved.candidateCount}; routing to latest=${resolved.newId}`);
      }
      const targetContactId = resolved.newId;

      // Pull messages for this conversation in chronological order
      const { data: messages, error: msgErr } = await supabase
        .from('ghl_conversation_messages')
        .select('id, ghl_message_id, direction, channel_type, body, attachment_urls, ghl_date_added, new_ghl_message_id')
        .eq('conversation_id', conv.id)
        .order('ghl_date_added', { ascending: true, nullsFirst: false });

      if (msgErr) {
        totalFailed++;
        await recordItem(supabase, {
          job_id: jobId, source_id: conv.id, entity_label: label,
          status: 'failed', error_message: `Messages query failed: ${msgErr.message}`,
        });
        continue;
      }

      if (!messages || messages.length === 0) {
        totalSkipped++;
        await recordItem(supabase, {
          job_id: jobId, source_id: conv.id, entity_label: label,
          status: 'skipped', error_message: 'No messages to replay',
        });
        continue;
      }

      if (dryRun) {
        const wouldReplay = messages.filter((m: any) =>
          !(skipActivity && isActivityChannel(m.channel_type)) &&
          (m.body || (!skipAttachments && Array.isArray(m.attachment_urls) && m.attachment_urls.length))
        ).length;
        totalSucceeded++;
        await recordItem(supabase, {
          job_id: jobId, source_id: conv.id, entity_label: label,
          status: 'succeeded',
          error_message: `DRY RUN — would create shell + replay ${wouldReplay}/${messages.length} messages → contact ${targetContactId}`,
        });
        continue;
      }

      // ── STAGE 1: Find-or-create the conversation shell in target ──
      // GHL returns 400 "Conversation already exists" when a contact already
      // has a conversation of the same channel. In that case we must look up
      // the existing conversation and reuse its id instead of failing.
      let newConvId: string | null = null;
      const lookupExistingConv = async (): Promise<string | null> => {
        try {
          const params = new URLSearchParams({
            locationId: targetCreds.locationId,
            contactId: targetContactId,
          });
          const r = await ctx.ghlFetch(
            `${GHL_API_BASE}/conversations/search?${params}`,
            { method: 'GET', headers: targetHeaders },
            3, 'target',
          );
          if (!r.ok) return null;
          const j = await r.json();
          const list: any[] = j?.conversations || [];
          if (list.length === 0) return null;
          // Prefer same channel/type, else most recently updated
          const wantType = String(conv.channel_type || '').toLowerCase();
          const sameType = list.find((c) => {
            const t = String(c.type || '').toLowerCase();
            return t === wantType || t.includes(wantType) || wantType.includes(t);
          });
          const pick = sameType || list.sort((a, b) =>
            new Date(b.dateUpdated || b.lastMessageDate || 0).getTime() -
            new Date(a.dateUpdated || a.lastMessageDate || 0).getTime()
          )[0];
          return pick?.id || null;
        } catch { return null; }
      };

      try {
        const shellRes = await ctx.ghlFetch(`${GHL_API_BASE}/conversations/`, {
          method: 'POST',
          headers: { ...targetHeaders, Version: '2021-04-15' },
          body: JSON.stringify({
            locationId: targetCreds.locationId,
            contactId: targetContactId,
          }),
        }, 3, 'target');

        if (!shellRes.ok) {
          const t = await shellRes.text();
          const parsed = parseGhlError(t);
          const msg = (parsed.message || t || '').toLowerCase();
          const isAlreadyExists =
            shellRes.status === 400 &&
            (msg.includes('already exists') || msg.includes('conversation already'));

          if (isAlreadyExists) {
            // Reuse existing conversation in target
            const existingId = await lookupExistingConv();
            if (existingId) {
              newConvId = existingId;
              console.log(`[conv-replay] Reusing existing target conversation ${existingId} for contact ${targetContactId}`);
            } else {
              totalFailed++;
              await recordItem(supabase, {
                job_id: jobId, source_id: conv.id, entity_label: label,
                status: 'failed',
                error_message: `Shell exists in target but lookup returned no conversation for contact ${targetContactId}`,
              });
              continue;
            }
          } else {
            const code = parsed.error_code || `GHL_${shellRes.status}`;
            const authDetail = (shellRes.status === 401 || shellRes.status === 403) && targetAuthHint
              ? ` ${targetAuthHint}` : '';
            totalFailed++;
            await recordItem(supabase, {
              job_id: jobId, source_id: conv.id, entity_label: label,
              status: 'failed',
              error_message: `Shell create [${code}] ${shellRes.status}: ${(parsed.message || t).substring(0, 240)}${authDetail}`.substring(0, 900),
            });
            continue;
          }
        } else {
          const shellData = await shellRes.json();
          newConvId = shellData?.conversation?.id || shellData?.id || null;
          if (!newConvId) {
            // Some GHL responses omit the id on 200 — fall back to lookup
            newConvId = await lookupExistingConv();
          }
          if (!newConvId) {
            totalFailed++;
            await recordItem(supabase, {
              job_id: jobId, source_id: conv.id, entity_label: label,
              status: 'failed', error_message: 'Shell create returned no conversation id',
            });
            continue;
          }
        }

        // Persist mapping immediately so re-runs don't re-create the shell
        await supabase
          .from('ghl_conversations')
          .update({ new_ghl_conversation_id: newConvId, replayed_at: new Date().toISOString() })
          .eq('id', conv.id);

        await recordIdMapping(supabase, {
          resource_type: 'conversation',
          old_ghl_id: conv.ghl_conversation_id,
          new_ghl_id: newConvId,
          source_account_label: sourceAccount,
          target_account_label: targetAccount,
          notes: label,
        });
      } catch (e: any) {
        totalFailed++;
        await recordItem(supabase, {
          job_id: jobId, source_id: conv.id, entity_label: label,
          status: 'failed',
          error_message: `Shell create threw: ${(e.message || 'Unknown').substring(0, 280)}`,
        });
        continue;
      }

      // ── STAGE 2: Replay messages chronologically ──────────────────
      let convMsgOk = 0, convMsgFail = 0, convMsgSkip = 0;
      const messagesToReplay = maxMessagesPerConv > 0
        ? messages.slice(0, maxMessagesPerConv)
        : messages;

      for (const msg of messagesToReplay) {
        // Time-budget guard inside the inner loop too
        if (Date.now() - startedAt > MAX_RUNTIME_MS) { timeBudgetExhausted = true; break; }
        if (ctx.isCircuitTripped()) { circuitTripped = true; break; }

        if (msg.new_ghl_message_id && !forceOverwriteExisting) {
          convMsgSkip++; continue;
        }

        if (skipActivity && isActivityChannel(msg.channel_type)) {
          convMsgSkip++;
          await supabase
            .from('ghl_conversation_messages')
            .update({ replay_skipped_reason: 'activity_channel' })
            .eq('id', msg.id);
          continue;
        }

        const rawBody = (msg.body || '').toString();
        if (!rawBody.trim() && (skipAttachments || !Array.isArray(msg.attachment_urls) || msg.attachment_urls.length === 0)) {
          convMsgSkip++;
          await supabase
            .from('ghl_conversation_messages')
            .update({ replay_skipped_reason: 'empty_body_no_attachments' })
            .eq('id', msg.id);
          continue;
        }

        const messageBody = prefixLegacyMarker && rawBody
          ? `[Migrated] ${rawBody}` : rawBody;
        const ghlType = mapToGhlMessageType(msg.channel_type);
        if (!ghlType) {
          // Unknown / non-replayable channel — skip rather than masquerade as SMS
          convMsgSkip++;
          await supabase
            .from('ghl_conversation_messages')
            .update({ replay_skipped_reason: `unsupported_channel:${normaliseChannel(msg.channel_type)}` })
            .eq('id', msg.id);
          continue;
        }
        const direction = msg.direction === 'inbound' ? 'inbound' : 'outbound';

        // Use the HISTORICAL IMPORT endpoints — these record the message
        // into the GHL inbox without dispatching via a real provider, and
        // honour `altId`/`altType`/backdated `date`. The plain
        // `/conversations/messages` endpoint queues a live send and the
        // record disappears when no provider is wired up.
        //   POST /conversations/messages/inbound   (historical inbound)
        //   POST /conversations/messages/outbound  (historical outbound)
        const importPath = direction === 'inbound'
          ? '/conversations/messages/inbound'
          : '/conversations/messages/outbound';

        const msgPayload: Record<string, any> = {
          type: ghlType,
          conversationId: newConvId,
          conversationProviderId: undefined, // omitted intentionally for replay
          message: messageBody,
          // GHL accepts `altId`/`altType` to scope to the target location
          altId: targetCreds.locationId,
          altType: 'location',
        };
        // Preserve historical timestamp (ISO 8601 expected by GHL)
        if (msg.ghl_date_added) msgPayload.date = msg.ghl_date_added;
        // Attachments (URLs only — GHL fetches them server-side)
        if (!skipAttachments && Array.isArray(msg.attachment_urls) && msg.attachment_urls.length > 0) {
          msgPayload.attachments = msg.attachment_urls;
        }

        try {
          const r = await ctx.ghlFetch(`${GHL_API_BASE}${importPath}`, {
            method: 'POST', headers: targetHeaders, body: JSON.stringify(msgPayload),
          }, 3, 'target');

          if (!r.ok) {
            const t = await r.text();
            const parsed = parseGhlError(t);
            const code = parsed.error_code || `GHL_${r.status}`;
            convMsgFail++;
            await supabase
              .from('ghl_conversation_messages')
              .update({ replay_skipped_reason: `[${code}] ${(parsed.message || t).substring(0, 200)}` })
              .eq('id', msg.id);
            continue;
          }
          const data = await r.json();
          const newMsgId = data?.messageId || data?.message?.id || data?.id || null;
          if (newMsgId) {
            await supabase
              .from('ghl_conversation_messages')
              .update({
                new_ghl_message_id: newMsgId,
                replayed_at: new Date().toISOString(),
                replay_skipped_reason: null,
              })
              .eq('id', msg.id);
            await recordIdMapping(supabase, {
              resource_type: 'conversation_message',
              old_ghl_id: msg.ghl_message_id,
              new_ghl_id: newMsgId,
              source_account_label: sourceAccount,
              target_account_label: targetAccount,
              notes: `${label} / ${ghlType} / ${direction}`,
            });
          }
          convMsgOk++;
          totalMessagesReplayed++;
        } catch (e: any) {
          convMsgFail++;
          await supabase
            .from('ghl_conversation_messages')
            .update({ replay_skipped_reason: `Replay threw: ${(e.message || '').substring(0, 200)}` })
            .eq('id', msg.id);
        }
      }

      // Mark conversation result
      if (convMsgFail > 0 && convMsgOk === 0) {
        totalFailed++;
        await recordItem(supabase, {
          job_id: jobId, source_id: conv.id, target_id: newConvId,
          entity_label: label, status: 'failed',
          error_message: `Shell created but all ${convMsgFail} messages failed`,
        });
      } else {
        totalSucceeded++;
        await recordItem(supabase, {
          job_id: jobId, source_id: conv.id, target_id: newConvId,
          entity_label: label, status: 'succeeded',
          error_message: `Replayed ${convMsgOk} ok / ${convMsgFail} fail / ${convMsgSkip} skip of ${messages.length} messages`,
        });
      }

      // Heartbeat + progress every 10 conversations
      if (totalProcessed % 10 === 0) {
        await updateJobProgress(supabase, jobId, progressPatch());
        await heartbeat(supabase, jobId);
      }

      // Inner loop may have flipped these; honour them at conversation boundary
      if (timeBudgetExhausted || circuitTripped) break;
    }

    await updateJobProgress(supabase, jobId, progressPatch());

    if (cancelledByUser) {
      await finishJob(supabase, jobId, 'cancelled',
        `Cancelled by user (${cancelledByUser}) at ${totalProcessed} processed (${totalMessagesReplayed} messages replayed)`);
      console.log(`[conv-replay] CANCELLED job=${jobId} via ${cancelledByUser} at ${totalProcessed}`);
      return new Response(JSON.stringify({
        success: true, cancelled: true, signal: cancelledByUser,
        processed: totalProcessed, messages_replayed: totalMessagesReplayed,
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (pausedByUser) {
      await partialExit(supabase, jobId, { offset: currentOffset }, progressPatch());
      console.log(`[conv-replay] PAUSED job=${jobId} at ${totalProcessed}`);
      return new Response(JSON.stringify({
        success: true, paused: true, processed: totalProcessed,
        messages_replayed: totalMessagesReplayed,
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    const morePagesAvailable = (conversations?.length || 0) >= pullLimit;
    const shouldRedispatch = !timeBudgetExhausted && !circuitTripped && morePagesAvailable && !(maxItems > 0 && totalProcessed >= maxItems);

    if (timeBudgetExhausted || circuitTripped || shouldRedispatch) {
      await partialExit(supabase, jobId, { offset: currentOffset }, progressPatch());
      console.log(`[conv-replay] PARTIAL job=${jobId} processed=${totalProcessed} msgs=${totalMessagesReplayed} circuit=${circuitTripped} → handed off to dispatcher`);
      return new Response(JSON.stringify({
        success: true, partial: true, circuit_breaker: circuitTripped,
        processed: totalProcessed, messages_replayed: totalMessagesReplayed,
        handed_off_to: 'migration-dispatcher',
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    await saveCheckpoint(supabase, jobId, {});
    try { await supabase.rpc('release_migration_job_lock', { p_job_id: jobId }); } catch { }
    await finishJob(supabase, jobId,
      totalFailed > 0 && totalSucceeded === 0 ? 'failed' : 'completed',
      totalFailed > 0 ? `Completed with ${totalFailed} conversation failures (${totalMessagesReplayed} messages replayed)` : undefined,
    );

    console.log(`[conv-replay] DONE job=${jobId} ok=${totalSucceeded} fail=${totalFailed} skip=${totalSkipped} msgs=${totalMessagesReplayed}`);

    return new Response(JSON.stringify({
      success: true, job_id: jobId,
      processed: totalProcessed, succeeded: totalSucceeded, failed: totalFailed,
      skipped: totalSkipped, messages_replayed: totalMessagesReplayed,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[conv-replay] FATAL:', err);
    if (jobId && supabase) {
      await finishJob(supabase, jobId, 'failed', err.message || 'Worker crashed').catch(() => { });
    }
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
});
