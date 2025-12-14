import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    status?: string;
    endedReason?: string;
    analysis?: {
      summary?: string;
      successEvaluation?: string;
      structuredData?: Record<string, unknown>;
    };
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
      webCallUrl?: string;
    };
  };
}

interface AIAnalysis {
  customerName: string | null;
  sentiment: string;
  keyTopics: string[];
  actionItems: string[];
}

// Fetch agent name from Vapi API
async function fetchAgentName(agentId: string): Promise<string | null> {
  const vapiApiKey = Deno.env.get('VAPI_API_KEY');
  if (!vapiApiKey || !agentId) return null;

  try {
    const response = await fetch(`https://api.vapi.ai/assistant/${agentId}`, {
      headers: {
        'Authorization': `Bearer ${vapiApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const assistant = await response.json();
      console.log('[Vapi Webhook] Fetched agent name:', assistant.name);
      return assistant.name || null;
    }
    console.log('[Vapi Webhook] Failed to fetch agent:', response.status);
  } catch (error) {
    console.error('[Vapi Webhook] Error fetching agent name:', error);
  }
  return null;
}

// Use AI to analyze transcript for missing data
async function analyzeTranscriptWithAI(transcript: string, summary: string | null): Promise<AIAnalysis> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openaiApiKey || !transcript || transcript.length < 50) {
    return {
      customerName: null,
      sentiment: 'neutral',
      keyTopics: [],
      actionItems: [],
    };
  }

  try {
    console.log('[Vapi Webhook] Analyzing transcript with AI...');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert call analyst. Analyze the following call transcript and extract:
1. Customer name (if mentioned by the user or asked for) - return null if not found
2. Overall sentiment (positive, negative, neutral, mixed)
3. Key topics discussed (max 5 topics, short phrases)
4. Action items or follow-ups needed (max 5 items)

Respond ONLY with valid JSON in this exact format:
{
  "customerName": "Name or null",
  "sentiment": "positive|negative|neutral|mixed",
  "keyTopics": ["topic1", "topic2"],
  "actionItems": ["action1", "action2"]
}`
          },
          {
            role: 'user',
            content: `Transcript:\n${transcript.substring(0, 8000)}${summary ? `\n\nSummary:\n${summary}` : ''}`
          }
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error('[Vapi Webhook] OpenAI API error:', response.status);
      return { customerName: null, sentiment: 'neutral', keyTopics: [], actionItems: [] };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (content) {
      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('[Vapi Webhook] AI analysis result:', parsed);
        return {
          customerName: parsed.customerName === 'null' ? null : parsed.customerName,
          sentiment: parsed.sentiment || 'neutral',
          keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics.slice(0, 5) : [],
          actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems.slice(0, 5) : [],
        };
      }
    }
  } catch (error) {
    console.error('[Vapi Webhook] AI analysis error:', error);
  }

  return { customerName: null, sentiment: 'neutral', keyTopics: [], actionItems: [] };
}

serve(async (req) => {
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

    const rawStatus = message.status || call.status;
    const rawEndedReason = message.endedReason || call.endedReason;

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

    const getCallDirection = (): string => {
      if (call.type === 'webCall' || call.webCallUrl) {
        return 'inbound';
      }
      if (call.customer?.number && !call.phoneNumber?.number) {
        return 'outbound';
      }
      return 'inbound';
    };

    // Extract transcript
    let transcript: string | null = null;
    if (message.artifact?.transcript) {
      transcript = message.artifact.transcript;
    } else if (message.artifact?.messages?.length) {
      transcript = message.artifact.messages
        .filter(m => m.message || m.content)
        .filter(m => m.role !== 'system')
        .map(m => {
          const role = m.role === 'bot' ? 'Assistant' : m.role === 'user' ? 'User' : m.role;
          const content = m.message || m.content;
          return `${role}: ${content}`;
        })
        .join('\n\n');
    }

    const summary = message.analysis?.summary || null;
    const recordingUrl = message.artifact?.recordingUrl || null;

    // Calculate duration and timestamps
    let durationSeconds: number | null = null;
    let startedAt: string | null = call.startedAt || null;
    let endedAt: string | null = call.endedAt || null;
    
    if (call.startedAt && call.endedAt) {
      const start = new Date(call.startedAt).getTime();
      const end = new Date(call.endedAt).getTime();
      durationSeconds = Math.round((end - start) / 1000);
    } else if (message.artifact?.messages?.length) {
      // For web calls, derive timestamps from message times
      const messages = message.artifact.messages;
      const firstMessage = messages.find(m => m.time !== undefined);
      const lastMessage = [...messages].reverse().find(m => m.endTime !== undefined || m.time !== undefined);
      
      if (firstMessage?.time !== undefined) {
        // Message times are in milliseconds since epoch
        startedAt = new Date(firstMessage.time).toISOString();
        
        if (lastMessage) {
          const endTime = lastMessage.endTime ?? lastMessage.time ?? 0;
          endedAt = new Date(endTime).toISOString();
          durationSeconds = Math.round((endTime - firstMessage.time) / 1000);
        }
      }
    }
    
    // Fallback: if we have duration but no timestamps, use current time as end
    if (durationSeconds && !endedAt) {
      endedAt = new Date().toISOString();
      if (!startedAt) {
        startedAt = new Date(Date.now() - durationSeconds * 1000).toISOString();
      }
    }

    const phoneNumber = call.customer?.number || call.phoneNumber?.number || null;
    let customerName = call.customer?.name || null;

    // Get agent info - try fetching from API if name not in webhook
    const agentId = call.assistant?.id || call.assistantId || null;
    let agentName = call.assistant?.name || null;

    // Cost
    let cost: number | null = call.cost || null;
    if (!cost && call.costs?.length) {
      cost = call.costs.reduce((sum, c) => sum + (c.cost || 0), 0);
    }

    // Initialize AI analysis fields
    let sentiment: string | null = null;
    let keyTopics: string[] = [];
    let actionItems: string[] = [];

    // Only do AI analysis and agent lookup for end-of-call-report (final event)
    const isEndOfCall = message.type === 'end-of-call-report';
    
    if (isEndOfCall) {
      // Fetch agent name if not provided
      if (!agentName && agentId) {
        agentName = await fetchAgentName(agentId);
      }

      // Run AI analysis on transcript
      if (transcript) {
        const aiAnalysis = await analyzeTranscriptWithAI(transcript, summary);
        
        // Only use AI customer name if not already set
        if (!customerName && aiAnalysis.customerName) {
          customerName = aiAnalysis.customerName;
        }
        
        sentiment = aiAnalysis.sentiment;
        keyTopics = aiAnalysis.keyTopics;
        actionItems = aiAnalysis.actionItems;
      }
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
      started_at: startedAt,
      ended_at: endedAt,
      duration_seconds: durationSeconds,
      cost: cost,
      transcript: transcript,
      summary: summary,
      sentiment: sentiment,
      key_topics: keyTopics,
      action_items: actionItems,
      recording_url: recordingUrl,
      metadata: {
        orgId: call.orgId,
        endedReason: rawEndedReason,
        type: call.type,
        eventType: message.type,
        webCallUrl: call.webCallUrl,
        aiAnalyzed: isEndOfCall && !!transcript,
      },
    };

    console.log('[Vapi Webhook] Extracted call data:', {
      vapi_call_id: callLogData.vapi_call_id,
      agent_id: callLogData.agent_id,
      agent_name: callLogData.agent_name,
      customer_name: callLogData.customer_name,
      call_direction: callLogData.call_direction,
      call_status: callLogData.call_status,
      call_outcome: callLogData.call_outcome,
      duration_seconds: callLogData.duration_seconds,
      has_transcript: !!callLogData.transcript,
      has_summary: !!callLogData.summary,
      has_recording: !!callLogData.recording_url,
      sentiment: callLogData.sentiment,
      key_topics_count: callLogData.key_topics.length,
      action_items_count: callLogData.action_items.length,
      cost: callLogData.cost,
    });

    // Upsert the call log
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
