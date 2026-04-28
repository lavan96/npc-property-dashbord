/**
 * build-conversations-export-worker
 *
 * Background worker invoked by start-conversations-export.
 * Reads the export_jobs row for job_id, paginates through every
 * conversation + every message (no 1000-row cap, with retries),
 * builds a CSV or XLSX, uploads to the `qa_exports` storage bucket,
 * generates a signed URL, and finalizes the job row.
 *
 * Service-role only (called via x-internal-call).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';
import { createCorsHeaders } from '../_shared/auth.ts';

const PAGE_SIZE = 1000;             // pagination page size for messages
const IN_CHUNK_SIZE = 100;           // max IDs per .in() call (URL length limit)
const MESSAGE_CONVERSATION_CHUNK_SIZE = 50; // conversation IDs per message batch
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24; // 24h
const STORAGE_BUCKET = 'qa_exports';

const HEADERS = [
  'Conversation #', 'Message #', 'Client Name', 'Client Email',
  'Channel', 'Contact ID (GHL)', 'Conversation ID (GHL)', 'Message ID (GHL)',
  'Direction', 'Sender', 'Date', 'Time', 'Timestamp (ISO)',
  'Message Type', 'Status', 'Body', 'Attachments',
];

function normalizeChannel(ch: string | undefined | null): string {
  if (!ch) return 'sms';
  const lower = String(ch).toLowerCase();
  const map: Record<string, string> = {
    type_phone: 'sms', phone: 'sms', sms: 'sms', type_sms: 'sms', type_sms_reaction: 'sms',
    type_email: 'email', email: 'email',
    type_whatsapp: 'whatsapp', whatsapp: 'whatsapp',
    type_instagram: 'instagram', instagram: 'instagram',
    type_facebook: 'facebook', facebook: 'facebook',
    type_live_chat: 'live_chat', live_chat: 'live_chat', livechat: 'live_chat',
  };
  return map[lower] || lower;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }
function fmtDate(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function fmtTime(d: Date) {
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

function timeMs(value: string | null | undefined): number {
  return value ? new Date(value).getTime() || 0 : 0;
}

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e: any) {
      lastErr = e;
      const wait = 500 * Math.pow(2, i);
      console.warn(`[worker] ${label} attempt ${i + 1} failed: ${e?.message}. Retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let jobId: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    jobId = body.job_id;

    // Service-role gate: only accept calls from start-conversations-export
    // or another internal function passing the service token.
    const internal = req.headers.get('x-internal-call') === 'true'
      && body._service_token === serviceRoleKey;
    if (!internal) {
      return new Response(
        JSON.stringify({ success: false, error: 'Internal-only endpoint' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!jobId) {
      return new Response(
        JSON.stringify({ success: false, error: 'job_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Load job
    const { data: job, error: jobErr } = await supabase
      .from('export_jobs').select('*').eq('id', jobId).maybeSingle();
    if (jobErr || !job) throw new Error(`Job not found: ${jobErr?.message || jobId}`);

    if (job.status !== 'pending') {
      console.log(`[worker] job ${jobId} already in status=${job.status}; skipping`);
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const conversationIds: string[] = job.scope?.conversation_ids || [];
    const fileFormat: 'csv' | 'xlsx' = job.file_format;

    await supabase.from('export_jobs').update({
      status: 'processing',
      started_at: new Date().toISOString(),
    }).eq('id', jobId);

    // ── 1. Fetch all conversation rows in pages of 1000 by id ──
    const conversations: any[] = [];
    for (let i = 0; i < conversationIds.length; i += IN_CHUNK_SIZE) {
      const chunk = conversationIds.slice(i, i + IN_CHUNK_SIZE);
      const { data, error } = await withRetry('fetch conversations', () =>
        supabase.from('ghl_conversations')
          .select('id, ghl_conversation_id, ghl_contact_id, channel_type, client_id')
          .in('id', chunk)
      );
      if (error) throw new Error(`conversations fetch failed: ${error.message}`);
      conversations.push(...(data || []));
    }
    console.log(`[worker] loaded ${conversations.length} conversations`);

    // ── 2. Resolve client names/emails ──
    const clientIds = [...new Set(conversations.map((c) => c.client_id).filter(Boolean))];
    const clientMap = new Map<string, { name: string; email: string | null }>();
    for (let i = 0; i < clientIds.length; i += IN_CHUNK_SIZE) {
      const chunk = clientIds.slice(i, i + IN_CHUNK_SIZE);
      const { data, error } = await withRetry('fetch clients', () =>
        supabase.from('clients')
          .select('id, primary_first_name, primary_surname, primary_email')
          .in('id', chunk)
      );
      if (error) throw new Error(`clients fetch failed: ${error.message}`);
      (data || []).forEach((c: any) => {
        const name = [c.primary_first_name, c.primary_surname].filter(Boolean).join(' ').trim() || 'Unknown';
        clientMap.set(c.id, { name, email: c.primary_email || null });
      });
    }

    // ── 3. For each conversation, page ALL messages (no 1000 cap) ──
    const rows: any[][] = [];
    let totalMessages = 0;
    let processed = 0;
    let lastProgressUpdate = 0;

    // Sort conversations by input order so the export numbering matches the dashboard view
    const idOrderIndex = new Map<string, number>();
    conversationIds.forEach((id, i) => idOrderIndex.set(id, i + 1));
    conversations.sort((a, b) =>
      (idOrderIndex.get(a.id) || 0) - (idOrderIndex.get(b.id) || 0));

    for (let chunkStart = 0; chunkStart < conversations.length; chunkStart += MESSAGE_CONVERSATION_CHUNK_SIZE) {
      const conversationChunk = conversations.slice(chunkStart, chunkStart + MESSAGE_CONVERSATION_CHUNK_SIZE);
      const chunkConversationIds = conversationChunk.map((conv) => conv.id);
      const messagesByConversation = new Map<string, any[]>();
      let from = 0;

      // Page through all messages for this conversation chunk in batches.
      // This avoids one DB round-trip per conversation while still bypassing
      // the default 1000-row cap.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await withRetry(`messages chunk=${chunkStart} from=${from}`, () =>
          supabase.from('ghl_conversation_messages')
            .select('conversation_id, ghl_message_id, direction, sender_name, ghl_date_added, content_type, message_status, body, attachment_urls, channel_type, created_at')
            .in('conversation_id', chunkConversationIds)
            .order('ghl_date_added', { ascending: true })
            .order('created_at', { ascending: true })
            .range(from, from + PAGE_SIZE - 1)
        );
        if (error) throw new Error(`messages fetch failed (chunk ${chunkStart}): ${error.message}`);
        const page = data || [];
        page.forEach((message: any) => {
          const list = messagesByConversation.get(message.conversation_id) || [];
          list.push(message);
          messagesByConversation.set(message.conversation_id, list);
        });
        if (page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      for (const conv of conversationChunk) {
        const idx = idOrderIndex.get(conv.id) || 0;
        const clientInfo = conv.client_id ? clientMap.get(conv.client_id) : null;
        const clientName = clientInfo?.name || (conv.client_id ? 'Unknown' : 'Unlinked Contact');
        const clientEmail = clientInfo?.email || '';
        const msgs = (messagesByConversation.get(conv.id) || []).sort((a, b) =>
          timeMs(a.ghl_date_added) - timeMs(b.ghl_date_added)
          || timeMs(a.created_at) - timeMs(b.created_at)
        );

      if (msgs.length === 0) {
        rows.push([
          idx, 0, clientName, clientEmail,
          normalizeChannel(conv.channel_type), conv.ghl_contact_id || '',
          conv.ghl_conversation_id || '', '', '', '', '', '', '', '', '',
          '(no messages)', '',
        ]);
      } else {
        msgs.forEach((m, i) => {
          const d = m.ghl_date_added ? new Date(m.ghl_date_added) : null;
          rows.push([
            idx, i + 1, clientName, clientEmail,
            normalizeChannel(m.channel_type || conv.channel_type),
            conv.ghl_contact_id || '', conv.ghl_conversation_id || '',
            m.ghl_message_id || '', m.direction || '', m.sender_name || '',
            d ? fmtDate(d) : '', d ? fmtTime(d) : '',
            d ? d.toISOString() : '', m.content_type || '',
            m.message_status || '', m.body || '',
            (m.attachment_urls || []).join(' | '),
          ]);
        });
      }
      totalMessages += msgs.length;
      processed++;

      // Throttle progress updates (every 10 convs or 2s, whichever comes first)
      const now = Date.now();
      if (processed % 10 === 0 || processed === conversations.length || now - lastProgressUpdate > 2000) {
        lastProgressUpdate = now;
        await supabase.from('export_jobs').update({
          processed_items: processed,
          total_messages: totalMessages,
        }).eq('id', jobId);
      }
    }
    }

    console.log(`[worker] built ${rows.length} rows from ${processed} conversations (${totalMessages} messages)`);

    // ── 4. Build the file ──
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `conversations-full-history-${ts}.${fileFormat}`;
    const storagePath = `exports/${jobId}/${fileName}`;

    let fileBuffer: Uint8Array;
    let contentType: string;
    if (fileFormat === 'csv') {
      const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [HEADERS, ...rows].map((r) => r.map(escape).join(',')).join('\n');
      fileBuffer = new TextEncoder().encode('\uFEFF' + csv);
      contentType = 'text/csv;charset=utf-8';
    } else {
      const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
      (ws as any)['!cols'] = HEADERS.map((h) => ({
        wch: Math.min(Math.max(h.length + 2, 14), 60),
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Message History');
      const arr = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      fileBuffer = new Uint8Array(arr);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    // ── 5. Upload to storage ──
    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, { contentType, upsert: true });
    if (uploadErr) throw new Error(`storage upload failed: ${uploadErr.message}`);

    // ── 6. Signed URL ──
    const { data: signedData, error: signedErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    if (signedErr || !signedData?.signedUrl) {
      throw new Error(`signed URL failed: ${signedErr?.message || 'no url'}`);
    }

    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();

    await supabase.from('export_jobs').update({
      status: 'completed',
      processed_items: processed,
      total_messages: totalMessages,
      storage_bucket: STORAGE_BUCKET,
      storage_path: storagePath,
      file_size_bytes: fileBuffer.byteLength,
      signed_url: signedData.signedUrl,
      signed_url_expires_at: expiresAt,
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);

    console.log(`[worker] job ${jobId} completed: ${storagePath} (${fileBuffer.byteLength} bytes)`);

    return new Response(JSON.stringify({ success: true, storage_path: storagePath }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error(`[worker] FAILED for job=${jobId}:`, msg);
    if (jobId) {
      try {
        await supabase.from('export_jobs').update({
          status: 'failed',
          error_summary: msg.substring(0, 2000),
          completed_at: new Date().toISOString(),
        }).eq('id', jobId);
      } catch {}
    }
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
