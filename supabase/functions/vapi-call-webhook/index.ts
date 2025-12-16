import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Vapi Squad assistant info
interface SquadAssistant {
  id: string;
  name?: string;
  role?: string;
  handoffTimestamp?: string;
}

// Structured data from each assistant in a squad
interface StructuredDataMultiItem {
  assistant: string;
  data: Record<string, unknown>;
}

// Handoff event in the sequence
interface HandoffEvent {
  fromAssistant: string;
  toAssistant: string;
  timestamp: string;
  reason?: string;
}

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
      structuredDataMulti?: StructuredDataMultiItem[];
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
        // Squad-specific fields
        assistantId?: string;
        assistantName?: string;
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
      // Squad-specific fields
      squadId?: string;
      squad?: {
        id?: string;
        name?: string;
        members?: Array<{
          assistantId?: string;
          assistant?: {
            id?: string;
            name?: string;
          };
        }>;
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
  callIntent: string | null;
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

// Fetch complete call details from Vapi API (includes cost data)
async function fetchCallDetails(callId: string): Promise<{ cost: number | null; recordingUrl: string | null }> {
  const vapiApiKey = Deno.env.get('VAPI_API_KEY');
  if (!vapiApiKey || !callId) return { cost: null, recordingUrl: null };

  try {
    console.log('[Vapi Webhook] Fetching call details from Vapi API for call:', callId);
    
    const response = await fetch(`https://api.vapi.ai/call/${callId}`, {
      headers: {
        'Authorization': `Bearer ${vapiApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const callData = await response.json();
      console.log('[Vapi Webhook] Fetched call details:', {
        id: callData.id,
        cost: callData.cost,
        costBreakdown: callData.costBreakdown,
        costs: callData.costs,
      });
      
      // Extract cost from various possible locations in the response
      let cost: number | null = null;
      if (typeof callData.cost === 'number' && callData.cost > 0) {
        cost = callData.cost;
      } else if (callData.costBreakdown?.total) {
        cost = callData.costBreakdown.total;
      } else if (callData.costs?.length) {
        cost = callData.costs.reduce((sum: number, c: { cost?: number }) => sum + (c.cost || 0), 0);
      }
      
      return {
        cost,
        recordingUrl: callData.recordingUrl || callData.artifact?.recordingUrl || null,
      };
    }
    console.log('[Vapi Webhook] Failed to fetch call details:', response.status);
  } catch (error) {
    console.error('[Vapi Webhook] Error fetching call details:', error);
  }
  return { cost: null, recordingUrl: null };
}

// Background task to fetch and update cost data
async function updateCallCostInBackground(
  supabaseUrl: string,
  supabaseServiceKey: string,
  callId: string,
  vapiCallId: string
): Promise<void> {
  try {
    // Wait a few seconds for Vapi to calculate cost
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const { cost, recordingUrl } = await fetchCallDetails(vapiCallId);
    
    if (cost !== null || recordingUrl !== null) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      const updateData: Record<string, unknown> = {};
      if (cost !== null) updateData.cost = cost;
      if (recordingUrl !== null) updateData.recording_url = recordingUrl;
      
      const { error } = await supabase
        .from('vapi_call_logs')
        .update(updateData)
        .eq('id', callId);
      
      if (error) {
        console.error('[Vapi Webhook] Background update error:', error);
      } else {
        console.log('[Vapi Webhook] Background update successful:', { callId, cost, recordingUrl });
      }
    } else {
      console.log('[Vapi Webhook] No cost data available from Vapi API');
    }
  } catch (error) {
    console.error('[Vapi Webhook] Background task error:', error);
  }
}

// Use AI to analyze transcript for missing data
async function analyzeTranscriptWithAI(transcript: string, summary: string | null, isSquadCall: boolean): Promise<AIAnalysis> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openaiApiKey || !transcript || transcript.length < 50) {
    return {
      customerName: null,
      sentiment: 'neutral',
      keyTopics: [],
      actionItems: [],
      callIntent: null,
    };
  }

  try {
    console.log('[Vapi Webhook] Analyzing transcript with AI...');
    
    const intentInstructions = isSquadCall 
      ? `5. Call intent - what type of appointment/service was the caller interested in (e.g., "discovery_booking", "strategy_booking", "finance_consult", "general_inquiry"). Return null if unclear.`
      : '';
    
    const intentFormat = isSquadCall 
      ? `,\n  "callIntent": "intent_type or null"`
      : '';
    
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
${intentInstructions}

Respond ONLY with valid JSON in this exact format:
{
  "customerName": "Name or null",
  "sentiment": "positive|negative|neutral|mixed",
  "keyTopics": ["topic1", "topic2"],
  "actionItems": ["action1", "action2"]${intentFormat}
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
      return { customerName: null, sentiment: 'neutral', keyTopics: [], actionItems: [], callIntent: null };
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
          callIntent: parsed.callIntent === 'null' ? null : (parsed.callIntent || null),
        };
      }
    }
  } catch (error) {
    console.error('[Vapi Webhook] AI analysis error:', error);
  }

  return { customerName: null, sentiment: 'neutral', keyTopics: [], actionItems: [], callIntent: null };
}

// Extract handoff sequence from transcript messages
function extractHandoffSequence(messages: VapiWebhookPayload['message']['artifact']['messages']): HandoffEvent[] {
  if (!messages || messages.length === 0) return [];
  
  const handoffs: HandoffEvent[] = [];
  let previousAssistantId: string | null = null;
  
  for (const msg of messages) {
    if (msg.role === 'bot' && msg.assistantId && msg.assistantId !== previousAssistantId) {
      if (previousAssistantId) {
        handoffs.push({
          fromAssistant: previousAssistantId,
          toAssistant: msg.assistantId,
          timestamp: msg.time ? new Date(msg.time).toISOString() : new Date().toISOString(),
          reason: 'Transfer detected from transcript'
        });
      }
      previousAssistantId = msg.assistantId;
    }
  }
  
  return handoffs;
}

// Extract all assistants involved from messages
function extractAssistantsInvolved(
  messages: VapiWebhookPayload['message']['artifact']['messages'],
  squadMembers?: VapiWebhookPayload['message']['call']['squad']['members']
): SquadAssistant[] {
  const assistantMap = new Map<string, SquadAssistant>();
  
  // First, add squad members if available
  if (squadMembers) {
    for (const member of squadMembers) {
      const id = member.assistantId || member.assistant?.id;
      if (id) {
        assistantMap.set(id, {
          id,
          name: member.assistant?.name || undefined,
        });
      }
    }
  }
  
  // Then extract from messages to capture actual participation and timing
  if (messages) {
    for (const msg of messages) {
      if (msg.role === 'bot' && msg.assistantId) {
        const existing = assistantMap.get(msg.assistantId);
        if (!existing) {
          assistantMap.set(msg.assistantId, {
            id: msg.assistantId,
            name: msg.assistantName || undefined,
            handoffTimestamp: msg.time ? new Date(msg.time).toISOString() : undefined,
          });
        } else if (!existing.handoffTimestamp && msg.time) {
          existing.handoffTimestamp = new Date(msg.time).toISOString();
        }
      }
    }
  }
  
  return Array.from(assistantMap.values());
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
      hasSquad: !!message?.call?.squad || !!message?.call?.squadId,
      hasStructuredDataMulti: !!message?.analysis?.structuredDataMulti,
    });

    const call = message?.call;

    // Only process end-of-call-report events - ignore intermediate status updates
    // This prevents unnecessary updates during the call
    if (message?.type !== 'end-of-call-report') {
      console.log('[Vapi Webhook] Ignoring non-final event:', message?.type);
      return new Response(JSON.stringify({ success: true, message: 'Skipping intermediate event' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!call?.id) {
      console.log('[Vapi Webhook] No call ID in payload, skipping');
      return new Response(JSON.stringify({ success: true, message: 'No call data' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawStatus = message.status || call.status;
    const rawEndedReason = message.endedReason || call.endedReason;

    // Hardcoded squad configuration for inbound calls
    const INBOUND_SQUAD_ID = 'a9656ea1-3575-4ac6-b985-fd138be06cc5';
    const INBOUND_SQUAD_NAME = 'Inbound Reception Squad';
    const PRIMARY_INBOUND_AGENT = 'NPC inbound agent';
    
    // Known squad members for the inbound reception squad
    const INBOUND_SQUAD_MEMBERS: SquadAssistant[] = [
      { id: 'npc-inbound-agent', name: 'NPC inbound agent', role: 'receptionist' },
      { id: 'discovery-booking-agent', name: 'Discovery Booking Agent', role: 'booking' },
      { id: 'strategy-booking-agent', name: 'Strategy Session Agent', role: 'booking' },
      { id: 'finance-consult-agent', name: 'Finance Consult Agent', role: 'booking' },
    ];

    // Determine call direction early for squad assignment
    const callType = call.type;
    const isInboundCall = callType === 'inboundPhoneCall' || callType === 'webCall' || call.webCallUrl;

    // Detect if this is a Squad call - for inbound calls, always use the hardcoded squad
    const isSquadCall = isInboundCall || !!(call.squadId || call.squad);
    const squadId = isInboundCall ? INBOUND_SQUAD_ID : (call.squadId || call.squad?.id || null);
    const squadName = isInboundCall ? INBOUND_SQUAD_NAME : (call.squad?.name || null);
    
    console.log('[Vapi Webhook] Squad detection:', { isSquadCall, squadId, squadName, isInboundCall, callType });

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
      // Check the call type from Vapi - this is the most reliable source
      if (call.type === 'inboundPhoneCall') {
        return 'inbound';
      }
      if (call.type === 'outboundPhoneCall') {
        return 'outbound';
      }
      if (call.type === 'webCall' || call.webCallUrl) {
        return 'inbound';
      }
      // Default based on phone number presence
      if (call.phoneNumber?.number && call.customer?.number) {
        // If we have both, likely outbound (we called the customer)
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
          // Include assistant name for squad calls
          const assistantLabel = isSquadCall && m.assistantName ? ` (${m.assistantName})` : '';
          return `${role}${assistantLabel}: ${content}`;
        })
        .join('\n\n');
    }

    const summary = message.analysis?.summary || null;
    const recordingUrl = message.artifact?.recordingUrl || null;
    
    // Extract Squad-specific data
    const structuredDataMulti = message.analysis?.structuredDataMulti || [];
    
    // Try to extract from messages first, fall back to known squad members for inbound calls
    let assistantsInvolved = isSquadCall 
      ? extractAssistantsInvolved(message.artifact?.messages, call.squad?.members)
      : [];
    
    // If no assistants extracted and this is an inbound squad call, use known members
    if (assistantsInvolved.length === 0 && isInboundCall && isSquadCall) {
      assistantsInvolved = [...INBOUND_SQUAD_MEMBERS];
      console.log('[Vapi Webhook] Using hardcoded squad members for inbound call');
    }
    
    // Extract handoff sequence - try from messages, fall back to inferring from call intent
    let handoffSequence = isSquadCall 
      ? extractHandoffSequence(message.artifact?.messages)
      : [];
    
    console.log('[Vapi Webhook] Squad data extracted:', {
      assistantsInvolvedCount: assistantsInvolved.length,
      handoffCount: handoffSequence.length,
      structuredDataMultiCount: structuredDataMulti.length,
    });

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

    // Get agent info - for inbound squad calls, always use NPC inbound agent as primary
    const agentId = call.assistant?.id || call.assistantId || (assistantsInvolved[0]?.id) || null;
    let agentName = isInboundCall && isSquadCall 
      ? PRIMARY_INBOUND_AGENT 
      : (call.assistant?.name || (assistantsInvolved[0]?.name) || null);

    // Cost - check multiple sources
    let cost: number | null = null;
    if (typeof call.cost === 'number' && call.cost > 0) {
      cost = call.cost;
    } else if (call.costs?.length) {
      cost = call.costs.reduce((sum, c) => sum + (c.cost || 0), 0);
    }
    
    console.log('[Vapi Webhook] Cost extraction:', { 
      callCost: call.cost, 
      costsArray: call.costs, 
      extractedCost: cost 
    });

    // Helper to capitalize first letter of each string
    const capitalizeFirst = (str: string): string => {
      if (!str) return str;
      return str.charAt(0).toUpperCase() + str.slice(1);
    };

    // Initialize AI analysis fields
    let sentiment: string | null = null;
    let keyTopics: string[] = [];
    let actionItems: string[] = [];
    let callIntent: string | null = null;

    // Only do AI analysis and agent lookup for end-of-call-report (final event)
    const isEndOfCall = message.type === 'end-of-call-report';
    
    if (isEndOfCall) {
      // Fetch agent name if not provided
      if (!agentName && agentId) {
        agentName = await fetchAgentName(agentId);
      }
      
      // For squad calls, try to fetch names for all assistants
      if (isSquadCall && assistantsInvolved.length > 0) {
        for (const assistant of assistantsInvolved) {
          if (!assistant.name && assistant.id) {
            const name = await fetchAgentName(assistant.id);
            if (name) assistant.name = name;
          }
        }
      }

      // Run AI analysis on transcript
      if (transcript) {
        const aiAnalysis = await analyzeTranscriptWithAI(transcript, summary, isSquadCall);
        
        // Only use AI customer name if not already set
        if (!customerName && aiAnalysis.customerName) {
          customerName = aiAnalysis.customerName;
        }
        
        sentiment = aiAnalysis.sentiment;
        // Capitalize first letter of each topic and action item
        keyTopics = aiAnalysis.keyTopics.map(capitalizeFirst);
        actionItems = aiAnalysis.actionItems.map(capitalizeFirst);
        callIntent = aiAnalysis.callIntent;
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
      // Squad-specific fields
      is_squad_call: isSquadCall,
      squad_id: squadId,
      squad_name: squadName,
      call_intent: callIntent,
      assistants_involved: assistantsInvolved,
      handoff_sequence: handoffSequence,
      structured_data_multi: structuredDataMulti,
      metadata: {
        orgId: call.orgId,
        endedReason: rawEndedReason,
        type: call.type,
        eventType: message.type,
        webCallUrl: call.webCallUrl,
        aiAnalyzed: isEndOfCall && !!transcript,
        isSquadCall: isSquadCall,
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
      // Squad fields
      is_squad_call: callLogData.is_squad_call,
      squad_id: callLogData.squad_id,
      call_intent: callLogData.call_intent,
      assistants_involved_count: callLogData.assistants_involved.length,
      handoff_count: callLogData.handoff_sequence.length,
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

    // If this is end-of-call and we don't have cost, schedule background fetch
    if (isEndOfCall && !callLogData.cost) {
      console.log('[Vapi Webhook] Scheduling background cost fetch for call:', data.id);
      // Use EdgeRuntime.waitUntil for background task
      EdgeRuntime.waitUntil(
        updateCallCostInBackground(supabaseUrl, supabaseServiceKey, data.id, call.id)
      );
    }

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
