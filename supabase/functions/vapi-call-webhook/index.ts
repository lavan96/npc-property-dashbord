import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Vapi webhook payload can have data at different levels depending on event type
interface VapiWebhookPayload {
  message: {
    type: string;
    timestamp?: number;
    // Status update event fields (at message level)
    status?: string;
    endedReason?: string;
    // Analysis from end-of-call-report (at message level)
    analysis?: {
      summary?: string;
      successEvaluation?: string;
      structuredData?: Record<string, unknown>;
    };
    // Artifact contains transcript, messages, recording (at message level)
    artifact?: {
      transcript?: string;
      recordingUrl?: string;
      messages?: Array<{
        role: string;
        message?: string;
        content?: string;
        time?: number;
        endTime?: number;
        duration?: number;
      }>;
    };
    // Call object contains core metadata
    call?: {
      id: string;
      orgId?: string;
      type?: string;
      assistantId?: string;
      assistant?: {
        id?: string;
        name?: string;
      };
      customer?: {
        number?: string;
        name?: string;
      };
      phoneNumber?: {
        number?: string;
      };
      status?: string;
      endedReason?: string;
      startedAt?: string;
      endedAt?: string;
      cost?: number;
      costs?: Array<{
        type?: string;
        cost?: number;
      }>;
      // Web calls use 'webCall' type
      webCallUrl?: string;
    };
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
    const { message } = payload;
    
    console.log('[Vapi Webhook] Received event:', message?.type);
    console.log('[Vapi Webhook] Event details:', {
      type: message?.type,
      hasCall: !!message?.call,
      hasAnalysis: !!message?.analysis,
      hasArtifact: !!message?.artifact,
      callId: message?.call?.id,
      status: message?.status || message?.call?.status,
      endedReason: message?.endedReason || message?.call?.endedReason,
    });

    const call = message?.call;

    if (!call?.id) {
      console.log('[Vapi Webhook] No call ID in payload, skipping');
      return new Response(JSON.stringify({ success: true, message: 'No call data' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract status from message level (status-update events) or call level
    const rawStatus = message.status || call.status;
    const rawEndedReason = message.endedReason || call.endedReason;

    // Determine call outcome from endedReason
    const getCallOutcome = (endedReason?: string): string | null => {
      if (!endedReason) return null;
      const reason = endedReason.toLowerCase();
      if (reason.includes('voicemail')) return 'voicemail';
      if (reason.includes('no-answer') || reason.includes('timeout')) return 'no-answer';
      if (reason.includes('busy')) return 'busy';
      if (reason.includes('failed') || reason.includes('error')) return 'failed';
      if (reason.includes('cancel')) return 'cancelled';
      if (reason.includes('customer-ended') || reason.includes('assistant-ended') || reason.includes('ended')) return 'completed';
      return 'completed';
    };

    // Determine call status
    const getCallStatus = (status?: string): string | null => {
      if (!status) return null;
      const s = status.toLowerCase();
      if (s === 'queued') return 'queued';
      if (s === 'ringing') return 'ringing';
      if (s === 'in-progress') return 'in-progress';
      if (s === 'forwarding') return 'forwarding';
      if (s === 'ended') return 'ended';
      return s;
    };

    // Determine call direction - web calls are typically inbound
    const getCallDirection = (): string => {
      // Check if it's a web call (no phone numbers, has webCallUrl)
      if (call.type === 'webCall' || call.webCallUrl) {
        return 'inbound'; // Web calls initiated by users are inbound
      }
      // Check for phone direction indicators
      if (call.customer?.number && !call.phoneNumber?.number) {
        return 'outbound';
      }
      return 'inbound';
    };

    // Extract transcript from artifact (correct location in Vapi payload)
    let transcript: string | null = null;
    if (message.artifact?.transcript) {
      transcript = message.artifact.transcript;
    } else if (message.artifact?.messages?.length) {
      // Build transcript from messages in artifact
      transcript = message.artifact.messages
        .filter(m => m.message || m.content)
        .filter(m => m.role !== 'system') // Exclude system prompts
        .map(m => {
          const role = m.role === 'bot' ? 'Assistant' : m.role === 'user' ? 'User' : m.role;
          const content = m.message || m.content;
          return `${role}: ${content}`;
        })
        .join('\n\n');
    }

    // Extract summary from message.analysis (correct location for end-of-call-report)
    const summary = message.analysis?.summary || null;

    // Extract recording URL from artifact
    const recordingUrl = message.artifact?.recordingUrl || null;

    // Calculate duration from timestamps
    let durationSeconds: number | null = null;
    if (call.startedAt && call.endedAt) {
      const start = new Date(call.startedAt).getTime();
      const end = new Date(call.endedAt).getTime();
      durationSeconds = Math.round((end - start) / 1000);
    } else if (message.artifact?.messages?.length) {
      // Calculate from message timestamps if available
      const messages = message.artifact.messages;
      const firstMessage = messages.find(m => m.time);
      const lastMessage = [...messages].reverse().find(m => m.endTime || m.time);
      if (firstMessage?.time && lastMessage) {
        const endTime = lastMessage.endTime || lastMessage.time || 0;
        durationSeconds = Math.round((endTime - firstMessage.time) / 1000);
      }
    }

    // Get customer info
    const phoneNumber = call.customer?.number || call.phoneNumber?.number || null;
    const customerName = call.customer?.name || null;

    // Get agent info
    const agentId = call.assistant?.id || call.assistantId || null;
    const agentName = call.assistant?.name || null;

    // Calculate total cost from costs array if individual cost not available
    let cost: number | null = call.cost || null;
    if (!cost && call.costs?.length) {
      cost = call.costs.reduce((sum, c) => sum + (c.cost || 0), 0);
    }

    const callLogData = {
      vapi_call_id: call.id,
      agent_id: agentId,
      agent_name: agentName,
      phone_number: phoneNumber,
      customer_name: customerName,
      call_direction: getCallDirection(),
      call_status: getCallStatus(rawStatus),
      call_outcome: getCallOutcome(rawEndedReason),
      started_at: call.startedAt || null,
      ended_at: call.endedAt || null,
      duration_seconds: durationSeconds,
      cost: cost,
      transcript: transcript,
      summary: summary,
      sentiment: null, // Vapi doesn't provide sentiment in standard webhook
      key_topics: [],
      action_items: [],
      recording_url: recordingUrl,
      metadata: {
        orgId: call.orgId,
        endedReason: rawEndedReason,
        type: call.type,
        eventType: message.type,
        webCallUrl: call.webCallUrl,
      },
    };

    console.log('[Vapi Webhook] Extracted call data:', {
      vapi_call_id: callLogData.vapi_call_id,
      agent_id: callLogData.agent_id,
      call_direction: callLogData.call_direction,
      call_status: callLogData.call_status,
      call_outcome: callLogData.call_outcome,
      duration_seconds: callLogData.duration_seconds,
      has_transcript: !!callLogData.transcript,
      has_summary: !!callLogData.summary,
      has_recording: !!callLogData.recording_url,
      cost: callLogData.cost,
    });

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
