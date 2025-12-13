import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VapiCallData {
  id: string;
  orgId?: string;
  type?: string;
  assistant?: {
    id: string;
    name?: string;
  };
  assistantId?: string;
  customer?: {
    number?: string;
    name?: string;
  };
  phoneNumber?: {
    number?: string;
  };
  status?: string;
  endedReason?: string;
  direction?: string;
  startedAt?: string;
  endedAt?: string;
  transcript?: string;
  summary?: string;
  recordingUrl?: string;
  cost?: number;
  costBreakdown?: {
    total?: number;
  };
  analysis?: {
    sentiment?: string;
    topics?: string[];
    actionItems?: string[];
    summary?: string;
  };
  messages?: Array<{
    role: string;
    content: string;
    timestamp?: number;
  }>;
}

interface VapiWebhookPayload {
  message: {
    type: string;
    call?: VapiCallData;
    timestamp?: string;
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: VapiWebhookPayload = await req.json();
    console.log('[Vapi Webhook] Received event:', payload.message?.type);
    console.log('[Vapi Webhook] Full payload:', JSON.stringify(payload, null, 2));

    const { message } = payload;
    const call = message.call;

    if (!call?.id) {
      console.log('[Vapi Webhook] No call data in payload');
      return new Response(JSON.stringify({ success: true, message: 'No call data' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine call outcome from endedReason
    const getCallOutcome = (endedReason?: string): string | null => {
      if (!endedReason) return null;
      const reason = endedReason.toLowerCase();
      if (reason.includes('voicemail')) return 'voicemail';
      if (reason.includes('no-answer') || reason.includes('timeout')) return 'no-answer';
      if (reason.includes('busy')) return 'busy';
      if (reason.includes('failed') || reason.includes('error')) return 'failed';
      if (reason.includes('cancel')) return 'cancelled';
      return 'completed';
    };

    // Determine call status from Vapi status
    const getCallStatus = (status?: string): string | null => {
      if (!status) return null;
      const s = status.toLowerCase();
      if (s === 'queued') return 'queued';
      if (s === 'ringing') return 'ringing';
      if (s === 'in-progress') return 'in-progress';
      if (s === 'forwarding') return 'forwarding';
      if (s === 'ended') return 'ended';
      return 'ended';
    };

    // Build transcript from messages if not provided directly
    let transcript = call.transcript;
    if (!transcript && call.messages?.length) {
      transcript = call.messages
        .filter(m => m.content)
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');
    }

    // Calculate duration
    let durationSeconds: number | null = null;
    if (call.startedAt && call.endedAt) {
      const start = new Date(call.startedAt).getTime();
      const end = new Date(call.endedAt).getTime();
      durationSeconds = Math.round((end - start) / 1000);
    }

    // Get customer phone number
    const phoneNumber = call.customer?.number || call.phoneNumber?.number || null;

    const callLogData = {
      vapi_call_id: call.id,
      agent_id: call.assistant?.id || call.assistantId || null,
      agent_name: call.assistant?.name || null,
      phone_number: phoneNumber,
      customer_name: call.customer?.name || null,
      call_direction: call.direction === 'inbound' ? 'inbound' : 'outbound',
      call_status: getCallStatus(call.status),
      call_outcome: getCallOutcome(call.endedReason),
      started_at: call.startedAt || null,
      ended_at: call.endedAt || null,
      duration_seconds: durationSeconds,
      cost: call.cost || call.costBreakdown?.total || null,
      transcript: transcript || null,
      summary: call.analysis?.summary || call.summary || null,
      sentiment: call.analysis?.sentiment?.toLowerCase() || null,
      key_topics: call.analysis?.topics || [],
      action_items: call.analysis?.actionItems || [],
      recording_url: call.recordingUrl || null,
      metadata: {
        orgId: call.orgId,
        endedReason: call.endedReason,
        type: call.type,
        rawPayload: payload,
      },
    };

    console.log('[Vapi Webhook] Upserting call log:', callLogData.vapi_call_id);

    // Upsert the call log (update if exists, insert if new)
    const { data, error } = await supabase
      .from('vapi_call_logs')
      .upsert(callLogData, { onConflict: 'vapi_call_id' })
      .select()
      .single();

    if (error) {
      console.error('[Vapi Webhook] Database error:', error);
      throw error;
    }

    console.log('[Vapi Webhook] Successfully saved call log:', data.id);

    return new Response(JSON.stringify({ success: true, callLogId: data.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Vapi Webhook] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
