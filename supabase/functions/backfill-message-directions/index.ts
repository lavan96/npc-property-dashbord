import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function mapMessageDirection(msg: any): string {
  const dir = msg.direction;
  if (dir === 'inbound' || dir === 1 || dir === '1') return 'inbound';
  if (dir === 'outbound' || dir === 2 || dir === '2') return 'outbound';
  if (msg.incoming === true) return 'inbound';
  if (msg.incoming === false) return 'outbound';
  if (msg.userId) return 'outbound';
  return 'outbound';
}

function mapChannelType(ghlType: string | number | undefined): string {
  if (!ghlType) return 'sms';
  const typeStr = String(ghlType).toLowerCase();
  const mapping: Record<string, string> = {
    'sms': 'sms', '1': 'sms', 'phone': 'sms', 'type_phone': 'sms',
    'email': 'email', '2': 'email', 'type_email': 'email',
    'whatsapp': 'whatsapp', '3': 'whatsapp', 'type_whatsapp': 'whatsapp',
    'fb': 'facebook', 'facebook': 'facebook', '4': 'facebook',
    'ig': 'instagram', 'instagram': 'instagram', '5': 'instagram',
    'live_chat': 'live_chat', 'livechat': 'live_chat', '6': 'live_chat',
  };
  return mapping[typeStr] || typeStr;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('GOHIGHLEVEL_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GHL API key not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batchSize || 30;
    const offset = body.offset || 0;
    const startTime = Date.now();

    const ghlHeaders = {
      'Authorization': `Bearer ${apiKey}`,
      'Version': '2021-07-28',
      'Accept': 'application/json',
    };

    // Get conversations in batches
    const { data: conversations, error: convError } = await supabase
      .from('ghl_conversations')
      .select('id, ghl_conversation_id, channel_type')
      .order('created_at', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (convError) throw new Error(`Failed to fetch conversations: ${convError.message}`);
    if (!conversations?.length) {
      return new Response(JSON.stringify({ success: true, message: 'No conversations found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[backfill] Processing ${conversations.length} conversations`);

    let totalUpdated = 0;
    let totalSkipped = 0;
    let errors: string[] = [];

    for (const conv of conversations) {
      try {
        await delay(500);

        // Fetch messages from GHL for this conversation
        let lastMessageId: string | undefined;
        let hasMore = true;
        let page = 0;

        while (hasMore && page < 20) {
          page++;
          const params = new URLSearchParams({ limit: '50' });
          if (lastMessageId) params.set('lastMessageId', lastMessageId);

          const res = await fetch(
            `${GHL_API_BASE}/conversations/${conv.ghl_conversation_id}/messages?${params}`,
            { method: 'GET', headers: ghlHeaders }
          );

          if (!res.ok) {
            console.error(`[backfill] Messages fetch failed for ${conv.ghl_conversation_id}: ${res.status}`);
            errors.push(`Conv ${conv.ghl_conversation_id}: HTTP ${res.status}`);
            break;
          }

          const data = await res.json();
          let messages: any[] = [];
          if (data.messages?.messages && Array.isArray(data.messages.messages)) {
            messages = data.messages.messages;
            hasMore = data.messages.nextPage === true;
            lastMessageId = data.messages.lastMessageId || undefined;
          } else if (Array.isArray(data.messages)) {
            messages = data.messages;
            hasMore = false;
          }

          if (messages.length === 0) { hasMore = false; break; }

          // Update each message's direction and channel_type
          for (const msg of messages) {
            const correctDirection = mapMessageDirection(msg);
            const correctChannel = mapChannelType(msg.messageType || msg.source || conv.channel_type);

            const { error: updateError, count } = await supabase
              .from('ghl_conversation_messages')
              .update({
                direction: correctDirection,
                channel_type: correctChannel,
              })
              .eq('ghl_message_id', msg.id);

            if (updateError) {
              totalSkipped++;
            } else {
              totalUpdated++;
            }
          }

          if (messages.length < 50) hasMore = false;
          await delay(300);
        }
      } catch (err: any) {
        console.error(`[backfill] Error for conv ${conv.id}:`, err.message);
        errors.push(`Conv ${conv.id}: ${err.message}`);
      }
    }

    console.log(`[backfill] Done: ${totalUpdated} updated, ${totalSkipped} skipped, ${errors.length} errors`);

    return new Response(JSON.stringify({
      success: true,
      conversations_processed: conversations.length,
      messages_updated: totalUpdated,
      messages_skipped: totalSkipped,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[backfill] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
