import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('GOHIGHLEVEL_API_KEY');
    const locationId = Deno.env.get('GOHIGHLEVEL_LOCATION_ID');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!apiKey || !locationId || !supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: 'Missing configuration', success: false }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl.trim(), supabaseKey.trim());
    const body = await req.json().catch(() => ({}));

    // Verify authentication
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.log('[sync-ghl-conversations] Auth failed:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }
    console.log(`[sync-ghl-conversations] Authenticated user: ${userId}`);

    const ghlHeaders = {
      'Authorization': `Bearer ${apiKey}`,
      'Version': '2021-07-28',
      'Accept': 'application/json',
    };

    // Determine sync mode
    const { client_id, ghl_contact_id, clientId: camelClientId, ghlContactId: camelGhlContactId, mode = 'incremental' } = body;
    const resolvedClientId = client_id || camelClientId;
    const resolvedGhlContactId = ghl_contact_id || camelGhlContactId;

    // If syncing for a specific client, get their GHL contact ID
    let targetContactIds: Array<{ clientId: string; ghlContactId: string }> = [];

    if (resolvedClientId) {
      const { data: client } = await supabase
        .from('clients')
        .select('id, ghl_contact_id')
        .eq('id', resolvedClientId)
        .maybeSingle();

      if (!client?.ghl_contact_id) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Client has no GHL contact ID',
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      targetContactIds = [{ clientId: client.id, ghlContactId: client.ghl_contact_id }];
    } else if (resolvedGhlContactId) {
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('ghl_contact_id', resolvedGhlContactId)
        .maybeSingle();

      targetContactIds = [{
        clientId: client?.id || null,
        ghlContactId: resolvedGhlContactId,
      }];
    } else {
      // Bulk sync: get all clients with GHL contact IDs
      const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('id, ghl_contact_id')
        .not('ghl_contact_id', 'is', null);

      if (clientsError) throw clientsError;
      targetContactIds = (clients || []).map((c: any) => ({
        clientId: c.id,
        ghlContactId: c.ghl_contact_id,
      }));
    }

    console.log(`[sync-ghl-conversations] Syncing conversations for ${targetContactIds.length} contacts`);

    let totalConversations = 0;
    let totalMessages = 0;
    let errors: Array<{ contactId: string; error: string }> = [];

    for (const { clientId, ghlContactId } of targetContactIds) {
      try {
        // Rate limit: 500ms between contacts
        await delay(500);

        // Step 1: Search conversations for this contact
        const searchParams = new URLSearchParams({
          locationId,
          contactId: ghlContactId,
        });

        const convRes = await fetch(`${GHL_API_BASE}/conversations/search?${searchParams}`, {
          method: 'GET',
          headers: ghlHeaders,
        });

        if (!convRes.ok) {
          const errText = await convRes.text();
          console.error(`[sync-ghl-conversations] Search failed for ${ghlContactId}: ${convRes.status} ${errText}`);
          errors.push({ contactId: ghlContactId, error: `Search failed: ${convRes.status}` });
          continue;
        }

        const convData = await convRes.json();
        const conversations = convData.conversations || [];

        console.log(`[sync-ghl-conversations] Found ${conversations.length} conversations for contact ${ghlContactId}`);

        for (const conv of conversations) {
          const ghlConvId = conv.id;
          const channelType = mapChannelType(conv.type);

          // Upsert conversation
          const { data: upsertedConv, error: convError } = await supabase
            .from('ghl_conversations')
            .upsert({
              ghl_conversation_id: ghlConvId,
              client_id: clientId,
              ghl_contact_id: ghlContactId,
              channel_type: channelType,
              last_message_body: conv.lastMessageBody || conv.snippet || null,
              last_message_date: parseGhlDate(conv.lastMessageDate || conv.dateUpdated),
              last_message_direction: conv.lastMessageDirection || conv.lastMessageType === 1 ? 'inbound' : 'outbound',
              unread_count: conv.unreadCount || 0,
              conversation_status: conv.starred ? 'starred' : (conv.deleted ? 'archived' : 'open'),
              assigned_to: conv.assignedTo || null,
              last_synced_at: new Date().toISOString(),
            }, { onConflict: 'ghl_conversation_id' })
            .select('id')
            .single();

          if (convError) {
            console.error(`[sync-ghl-conversations] Upsert conv failed:`, convError.message);
            errors.push({ contactId: ghlContactId, error: `Conv upsert: ${convError.message}` });
            continue;
          }

          totalConversations++;

          // Step 2: Fetch messages for this conversation
          await delay(300); // Rate limit

          const messagesResult = await fetchConversationMessages(
            ghlConvId,
            upsertedConv.id,
            ghlHeaders,
            supabase,
            mode
          );

          totalMessages += messagesResult.synced;
          if (messagesResult.error) {
            errors.push({ contactId: ghlContactId, error: messagesResult.error });
          }
        }
      } catch (err) {
        console.error(`[sync-ghl-conversations] Exception for contact ${ghlContactId}:`, err);
        errors.push({ contactId: ghlContactId, error: err.message });
      }
    }

    console.log(`[sync-ghl-conversations] Complete: ${totalConversations} conversations, ${totalMessages} messages synced`);

    return new Response(JSON.stringify({
      success: true,
      conversations_synced: totalConversations,
      messages_synced: totalMessages,
      contacts_processed: targetContactIds.length,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[sync-ghl-conversations] Error:', error);
    return new Response(JSON.stringify({ error: error.message, success: false }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert GHL date (could be Unix ms, Unix s, or ISO string) to ISO string */
function parseGhlDate(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'number' || /^\d{10,13}$/.test(String(val))) {
    const num = Number(val);
    // If 13 digits, it's milliseconds; if 10, seconds
    const ms = num > 1e12 ? num : num * 1000;
    return new Date(ms).toISOString();
  }
  // Try parsing as string
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function mapChannelType(ghlType: string | number | undefined): string {
  if (!ghlType) return 'sms';
  const typeStr = String(ghlType).toLowerCase();
  const mapping: Record<string, string> = {
    'sms': 'sms',
    '1': 'sms',
    'phone': 'sms',
    'type_phone': 'sms',
    'email': 'email',
    '2': 'email',
    'type_email': 'email',
    'whatsapp': 'whatsapp',
    '3': 'whatsapp',
    'type_whatsapp': 'whatsapp',
    'fb': 'facebook',
    'facebook': 'facebook',
    '4': 'facebook',
    'type_facebook': 'facebook',
    'ig': 'instagram',
    'instagram': 'instagram',
    '5': 'instagram',
    'type_instagram': 'instagram',
    'live_chat': 'live_chat',
    'livechat': 'live_chat',
    '6': 'live_chat',
    'type_live_chat': 'live_chat',
    'google_my_business': 'gmb',
    'gmb': 'gmb',
    '7': 'gmb',
    'custom': 'custom',
    'activity': 'activity',
  };
  return mapping[typeStr] || typeStr;
}

function mapMessageDirection(msg: any): string {
  // GHL uses multiple fields to indicate direction:
  // - direction: "inbound" | "outbound" (string)  
  // - direction: 1 (inbound) | 2 (outbound) (number)
  // - incoming: true/false (boolean in some API versions)
  // - type: 1 (inbound) | 2 (outbound) — but can conflict with messageType
  const dir = msg.direction;
  if (dir === 'inbound' || dir === 1 || dir === '1') return 'inbound';
  if (dir === 'outbound' || dir === 2 || dir === '2') return 'outbound';
  // Fallback: check incoming flag
  if (msg.incoming === true) return 'inbound';
  if (msg.incoming === false) return 'outbound';
  // Last resort: if contactId sent the message, it's inbound
  if (msg.userId) return 'outbound'; // sent by a user/agent
  return 'outbound';
}

function mapContentType(contentType: string | undefined): string {
  if (!contentType) return 'text';
  const ct = contentType.toLowerCase();
  if (ct.includes('image')) return 'image';
  if (ct.includes('video')) return 'video';
  if (ct.includes('audio')) return 'audio';
  if (ct.includes('document') || ct.includes('pdf') || ct.includes('file')) return 'document';
  return 'text';
}

async function fetchConversationMessages(
  ghlConversationId: string,
  localConversationId: string,
  ghlHeaders: Record<string, string>,
  supabase: any,
  mode: string
): Promise<{ synced: number; error?: string }> {
  let synced = 0;
  let lastMessageId: string | undefined;
  let hasMore = true;
  const maxPages = mode === 'incremental' ? 2 : 10; // Limit pages for incremental
  let page = 0;

  try {
    while (hasMore && page < maxPages) {
      page++;
      const params = new URLSearchParams({ limit: '50' });
      if (lastMessageId) {
        params.set('lastMessageId', lastMessageId);
      }

      const res = await fetch(
        `${GHL_API_BASE}/conversations/${ghlConversationId}/messages?${params}`,
        { method: 'GET', headers: ghlHeaders }
      );

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[sync-ghl-conversations] Messages fetch failed for ${ghlConversationId}: ${errText}`);
        return { synced, error: `Messages fetch: ${res.status}` };
      }

      const data = await res.json();
      
      // GHL returns: { messages: { lastMessageId, nextPage, messages: [...] } }
      let messages: any[] = [];
      if (data.messages?.messages && Array.isArray(data.messages.messages)) {
        messages = data.messages.messages;
        hasMore = data.messages.nextPage === true;
        lastMessageId = data.messages.lastMessageId || undefined;
      } else if (Array.isArray(data.messages)) {
        messages = data.messages;
      }

      console.log(`[sync-ghl-conversations] Parsed ${messages.length} messages, sample:`, messages.length > 0 ? JSON.stringify(messages[0]).substring(0, 300) : 'none');

      if (messages.length === 0) {
        hasMore = false;
        break;
      }

      // Batch upsert messages
      const messageRows = messages.map((msg: any) => ({
        conversation_id: localConversationId,
        ghl_message_id: msg.id,
        direction: mapMessageDirection(msg),
        channel_type: mapChannelType(msg.messageType || msg.source),
        body: msg.body || msg.message || msg.text || null,
        content_type: mapContentType(msg.contentType),
        attachment_urls: msg.attachments?.map((a: any) => a.url).filter(Boolean) || null,
        sender_name: msg.contactName || msg.userName || null,
        sender_number: msg.contactId ? null : (msg.phone || msg.from || null),
        recipient_number: msg.phone || msg.to || null,
        message_status: msg.status || 'sent',
        ghl_date_added: parseGhlDate(msg.dateAdded || msg.createdAt),
      }));

      const { error: insertError } = await supabase
        .from('ghl_conversation_messages')
        .upsert(messageRows, { onConflict: 'ghl_message_id', ignoreDuplicates: false });

      if (insertError) {
        // Handle individual constraint violations gracefully
        if (insertError.code === '23505') {
          console.log(`[sync-ghl-conversations] Some duplicate messages skipped for ${ghlConversationId}`);
        } else {
          console.error(`[sync-ghl-conversations] Messages upsert error:`, insertError.message);
          return { synced, error: `Messages upsert: ${insertError.message}` };
        }
      }

      synced += messages.length;
      lastMessageId = messages[messages.length - 1]?.id;

      // If we got fewer than 50, no more pages
      if (messages.length < 50) {
        hasMore = false;
      }

      // Rate limit between pages
      await delay(300);
    }

    return { synced };
  } catch (err) {
    console.error(`[sync-ghl-conversations] Messages fetch exception:`, err);
    return { synced, error: err.message };
  }
}
