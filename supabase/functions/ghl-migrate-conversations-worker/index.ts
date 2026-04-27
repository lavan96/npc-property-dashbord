/**
 * GHL Migrate: CONVERSATIONS Worker (Phase 2B)
 *
 * READ-ONLY mirror: pulls conversations + recent messages from the chosen
 * account into our local `ghl_conversations` and `ghl_conversation_messages`
 * tables, tagged by source_account so the dashboard can show traffic from
 * either account.
 *
 * Unlike contacts/opportunities/notes, this worker does NOT write to GHL.
 * "dry_run=true" simply enumerates without DB inserts.
 *
 * Architectural parity: shares the same cross-isolate rate limiter and
 * circuit-breaker pattern as the contacts/opportunities workers via
 * `createGhlFetchContext`. Even though we only READ from GHL, the same
 * token is used by other workers/cron jobs, so cooperative pacing matters.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { getGhlCredentials, validateGhlCredentials, buildGhlHeaders } from '../_shared/ghl-account.ts';
import {
  startJob, finishJob, recordItem, updateJobProgress,
  saveCheckpoint, loadCheckpoint, partialExit, heartbeat,
  readControlSignal,
} from '../_shared/migration-jobs.ts';
import { tokenKeyFor } from '../_shared/ghl-rate-limiter.ts';
import { createGhlFetchContext } from '../_shared/ghl-worker-fetch.ts';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const PAGE_LIMIT = 100;
// 110s leaves ~40s headroom inside the 150s edge cap for graceful
// checkpoint + finishJob, mirroring the contacts/opportunities workers.
const MAX_RUNTIME_MS = 110_000;

function mapDirection(msg: any): string {
  const d = msg.direction;
  if (d === 'inbound' || d === 1 || d === '1') return 'inbound';
  if (d === 'outbound' || d === 2 || d === '2') return 'outbound';
  if (msg.incoming === true) return 'inbound';
  if (msg.incoming === false) return 'outbound';
  if (msg.userId) return 'outbound';
  return 'outbound';
}

function mapChannel(t: any): string {
  if (!t) return 'sms';
  const s = String(t).toLowerCase();
  const m: Record<string, string> = {
    sms: 'sms', '1': 'sms', phone: 'sms', email: 'email', '2': 'email',
    whatsapp: 'whatsapp', '3': 'whatsapp',
    fb: 'facebook', facebook: 'facebook', '4': 'facebook',
    ig: 'instagram', instagram: 'instagram', '5': 'instagram',
    live_chat: 'live_chat', livechat: 'live_chat', '6': 'live_chat',
  };
  return m[s] || s;
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
    // For conversations, "source" is the account we PULL FROM. target is just metadata.
    const sourceAccount = body.source_account as 'legacy' | 'new';
    const dryRun = body.dry_run !== false;
    const payload = body.payload || {};
    const maxItems = Number(payload.max_items) || 0;
    const messagesPerConv = Math.min(Number(payload.messages_per_conversation) || 50, 100);

    // ── New filter flags (from Advanced options UI) ─────────────────────
    const messageDirection: 'all' | 'inbound' | 'outbound' =
      payload.message_direction === 'inbound' || payload.message_direction === 'outbound'
        ? payload.message_direction
        : 'all';
    const channelFilterRaw: string[] = Array.isArray(payload.channel_filter) ? payload.channel_filter : [];
    const channelFilter = new Set(channelFilterRaw.map((c) => mapChannel(String(c).trim())).filter(Boolean));
    const dateRangeDays = Number(payload.date_range_days) || 0;
    const sinceTs = dateRangeDays > 0 ? Date.now() - dateRangeDays * 86400_000 : 0;
    const skipAttachments = payload.skip_attachments === true;

    console.log(
      `[conv-worker] flags direction=${messageDirection} channels=${channelFilter.size === 0 ? 'all' : [...channelFilter].join(',')} ` +
      `since=${sinceTs ? new Date(sinceTs).toISOString() : 'none'} skip_attachments=${skipAttachments}`,
    );

    if (!jobId) return new Response(JSON.stringify({ error: 'job_id required' }), { status: 400 });

    const creds = getGhlCredentials(sourceAccount);
    const err = validateGhlCredentials(creds);
    if (err) {
      await finishJob(supabase, jobId, 'failed', err);
      return new Response(JSON.stringify({ error: err }), { status: 400 });
    }
    const headers = buildGhlHeaders(creds.apiKey!);

    // Shared cross-isolate rate limiter + circuit breaker. Both buckets
    // point at the same token because conversations only reads from one
    // account, but the helper still tracks 429s and broadcasts cooldown.
    const tokenKey = tokenKeyFor(sourceAccount, creds.apiKey);
    const ctx = createGhlFetchContext({
      supabase,
      sourceTokenKey: tokenKey,
      targetTokenKey: tokenKey,
      logTag: 'conv-worker',
    });

    console.log(`[conv-worker] job=${jobId} from=${sourceAccount} dry_run=${dryRun}`);

    const checkpoint = await loadCheckpoint(supabase, jobId);
    const isResume = body._resume === true || !!checkpoint.cursor.nextPage;
    if (isResume) {
      console.log(`[conv-worker] RESUMING job=${jobId} dispatch#${checkpoint.dispatchCount}`);
    } else {
      await startJob(supabase, jobId, 0);
    }

    let totalProcessed = 0, totalSucceeded = 0, totalFailed = 0, totalSkipped = 0;
    let nextPage: string | null = checkpoint.cursor.nextPage || null;
    let firstPage = true;

    while (true) {
      // ── Granular control: pause / cancel / kill ─────────────────────
      const signal = await readControlSignal(supabase, jobId);
      if (signal === 'kill' || signal === 'cancel') {
        console.log(`[conv-worker] ${signal.toUpperCase()} signal — finalizing cancelled at ${totalProcessed}`);
        await updateJobProgress(supabase, jobId, {
          processed_items: totalProcessed, succeeded_items: totalSucceeded, failed_items: totalFailed,
        });
        await finishJob(supabase, jobId, 'cancelled', `Cancelled by user (${signal}) at ${totalProcessed} processed`);
        return new Response(JSON.stringify({
          success: true, cancelled: true, signal, processed: totalProcessed,
        }), { headers: { 'Content-Type': 'application/json' } });
      }
      if (signal === 'pause') {
        console.log(`[conv-worker] PAUSE signal — checkpointing at ${totalProcessed}`);
        await partialExit(
          supabase, jobId,
          { nextPage },
          { processed_items: totalProcessed, succeeded_items: totalSucceeded, failed_items: totalFailed },
        );
        return new Response(JSON.stringify({
          success: true, paused: true, processed: totalProcessed,
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      // Circuit breaker tripped → exit cleanly so the dispatcher resumes
      // us with a fresh budget after the broadcast cooldown elapses.
      if (ctx.isCircuitTripped()) {
        console.warn(`[conv-worker] Circuit breaker tripped at ${totalProcessed} processed — handing off to dispatcher for cool-off`);
        await partialExit(
          supabase, jobId,
          { nextPage },
          { processed_items: totalProcessed, succeeded_items: totalSucceeded, failed_items: totalFailed },
        );
        return new Response(JSON.stringify({
          success: true, partial: true, circuit_breaker: true, processed: totalProcessed,
          handed_off_to: 'migration-dispatcher',
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      if (Date.now() - startedAt > MAX_RUNTIME_MS) {
        await partialExit(
          supabase, jobId,
          { nextPage },
          { processed_items: totalProcessed, succeeded_items: totalSucceeded, failed_items: totalFailed },
        );
        return new Response(JSON.stringify({
          success: true, partial: true, processed: totalProcessed,
          handed_off_to: 'migration-dispatcher',
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      const p = new URLSearchParams({ locationId: creds.locationId!, limit: String(PAGE_LIMIT) });
      if (nextPage) p.set('startAfter', nextPage);

      const r = await ctx.ghlFetch(`${GHL_API_BASE}/conversations/search?${p}`, { headers }, 3, 'source');
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`Source conversations fetch failed: ${r.status} ${t.substring(0, 200)}`);
      }
      const data = await r.json();
      const convs: any[] = data.conversations || [];
      if (firstPage) {
        const total = data.total ?? data.meta?.total ?? 0;
        if (total > 0) await updateJobProgress(supabase, jobId, { total_items: maxItems > 0 ? Math.min(maxItems, total) : total });
        firstPage = false;
      }
      if (convs.length === 0) break;

      for (const conv of convs) {
        if (maxItems > 0 && totalProcessed >= maxItems) break;
        if (Date.now() - startedAt > MAX_RUNTIME_MS) break;
        if (ctx.isCircuitTripped()) break;

        totalProcessed++;
        const label = conv.contactId ? `Conv with ${conv.contactId}` : conv.id;

        if (dryRun) {
          totalSucceeded++;
          await recordItem(supabase, {
            job_id: jobId, source_id: conv.id, entity_label: label,
            status: 'succeeded', error_message: 'DRY RUN — would mirror conversation + last messages',
          });
          continue;
        }

        try {
          // Upsert conversation row
          await supabase.from('ghl_conversations').upsert({
            ghl_conversation_id: conv.id,
            ghl_contact_id: conv.contactId,
            channel_type: mapChannel(conv.type),
            last_message_body: (conv.lastMessageBody || conv.snippet || '').substring(0, 1000),
            last_message_at: conv.lastMessageDate || conv.dateUpdated || null,
            unread_count: conv.unreadCount || 0,
            source_account_label: sourceAccount,
          } as any, { onConflict: 'ghl_conversation_id' });

          // Pull recent messages — pacing handled by the shared limiter.
          const mr = await ctx.ghlFetch(
            `${GHL_API_BASE}/conversations/${conv.id}/messages?limit=${messagesPerConv}`,
            { headers }, 3, 'source',
          );
          if (mr.ok) {
            const md = await mr.json();
            let messages: any[] = [];
            if (md.messages?.messages && Array.isArray(md.messages.messages)) messages = md.messages.messages;
            else if (Array.isArray(md.messages)) messages = md.messages;

            for (const msg of messages) {
              await supabase.from('ghl_conversation_messages').upsert({
                ghl_message_id: msg.id,
                ghl_conversation_id: conv.id,
                direction: mapDirection(msg),
                channel_type: mapChannel(msg.messageType || msg.source || conv.type),
                body: (msg.body || msg.message || '').substring(0, 4000),
                sent_at: msg.dateAdded || msg.dateCreated || null,
                source_account_label: sourceAccount,
              } as any, { onConflict: 'ghl_message_id' });
            }
          }

          totalSucceeded++;
          await recordItem(supabase, {
            job_id: jobId, source_id: conv.id, target_id: conv.id,
            entity_label: label, status: 'succeeded',
          });
        } catch (e: any) {
          totalFailed++;
          await recordItem(supabase, {
            job_id: jobId, source_id: conv.id, entity_label: label,
            status: 'failed', error_message: e.message?.substring(0, 300) || 'Unknown error',
          });
        }
      }

      await updateJobProgress(supabase, jobId, {
        processed_items: totalProcessed, succeeded_items: totalSucceeded, failed_items: totalFailed,
      });
      // Heartbeat extends the dispatcher lease so a long stretch of
      // upserts doesn't cause the job to be reclaimed mid-page.
      await heartbeat(supabase, jobId);

      nextPage = data.nextPage || null;
      await saveCheckpoint(supabase, jobId, { nextPage });

      if (maxItems > 0 && totalProcessed >= maxItems) break;
      // Walk every page until GHL stops returning a nextPage cursor; do
      // NOT break early on a short page (uncapped total).
      if (!nextPage) break;
    }

    await saveCheckpoint(supabase, jobId, {});
    await finishJob(supabase, jobId,
      totalFailed > 0 && totalSucceeded === 0 ? 'failed' : 'completed',
      totalFailed > 0 ? `Completed with ${totalFailed} failures` : undefined,
    );
    console.log(`[conv-worker] DONE job=${jobId} ok=${totalSucceeded} fail=${totalFailed}`);

    return new Response(JSON.stringify({
      success: true, job_id: jobId,
      processed: totalProcessed, succeeded: totalSucceeded, failed: totalFailed, skipped: totalSkipped,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[conv-worker] FATAL:', err);
    if (jobId && supabase) {
      await finishJob(supabase, jobId, 'failed', err.message || 'Worker crashed').catch(() => {});
    }
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
});
