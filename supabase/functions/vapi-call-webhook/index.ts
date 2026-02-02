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

interface NegativeSentimentMoment {
  timestamp: number | null;
  transcriptSegment: string;
  triggerPhrase: string;
}

interface AIAnalysis {
  customerName: string | null;
  sentiment: string;
  keyTopics: string[];
  actionItems: string[];
  callIntent: string | null;
  // New fields for negative call analysis
  rootCauseCategory: string | null;
  escalationSeverity: number | null;
  aiRecommendations: string[];
  negativeSentimentMoment: NegativeSentimentMoment | null;
  recoveryPriority: number | null;
}

// Fetch customer name from GoHighLevel using contact ID (primary fallback)
async function fetchCustomerFromGoHighLevelById(contactId: string): Promise<{ name: string | null; firstName: string | null }> {
  const ghlApiKey = Deno.env.get('GOHIGHLEVEL_API_KEY');
  if (!ghlApiKey || !contactId) {
    console.log('[Vapi Webhook] GoHighLevel: Missing API key or contact ID');
    return { name: null, firstName: null };
  }

  try {
    console.log('[Vapi Webhook] GoHighLevel: Fetching contact by ID:', contactId);
    
    // GoHighLevel API v2 - Get contact by ID
    const response = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ghlApiKey}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28',
      },
    });

    if (!response.ok) {
      console.log('[Vapi Webhook] GoHighLevel: API error fetching by ID:', response.status, await response.text());
      return { name: null, firstName: null };
    }

    const data = await response.json();
    const contact = data.contact || data;
    
    if (contact) {
      const firstName = contact.firstName || null;
      const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
      console.log('[Vapi Webhook] GoHighLevel: Found contact by ID:', { 
        id: contactId, 
        firstName,
        fullName,
      });
      return { 
        name: fullName || contact.name || null,
        firstName,
      };
    }

    console.log('[Vapi Webhook] GoHighLevel: No contact data returned for ID:', contactId);
  } catch (error) {
    console.error('[Vapi Webhook] GoHighLevel: Error fetching contact by ID:', error);
  }

  return { name: null, firstName: null };
}

// Fetch customer name from GoHighLevel using phone number
async function fetchCustomerFromGoHighLevel(phoneNumber: string): Promise<{ name: string | null; contactId: string | null; firstName: string | null }> {
  const ghlApiKey = Deno.env.get('GOHIGHLEVEL_API_KEY');
  const ghlLocationId = Deno.env.get('GOHIGHLEVEL_LOCATION_ID');
  
  if (!ghlApiKey || !phoneNumber) {
    console.log('[Vapi Webhook] GoHighLevel: Missing API key or phone number');
    return { name: null, contactId: null, firstName: null };
  }
  
  if (!ghlLocationId) {
    console.log('[Vapi Webhook] GoHighLevel: Missing location ID - required for contact search');
    return { name: null, contactId: null, firstName: null };
  }

  try {
    // Clean up phone number - remove spaces and non-digit chars except +
    let cleanedPhone = phoneNumber.replace(/\s+/g, '').replace(/[^\d+]/g, '');
    
    console.log('[Vapi Webhook] GoHighLevel: Searching for contact with phone:', cleanedPhone);
    
    // GoHighLevel API v2 - Use GET contacts endpoint with query parameter
    // This is more reliable than the search endpoint for phone lookups
    const searchUrl = `https://services.leadconnectorhq.com/contacts/?locationId=${ghlLocationId}&query=${encodeURIComponent(cleanedPhone)}&limit=1`;
    
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ghlApiKey}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28',
      },
    });

    if (!response.ok) {
      console.log('[Vapi Webhook] GoHighLevel: API error:', response.status, await response.text());
      return { name: null, contactId: null, firstName: null };
    }

    const data = await response.json();
    console.log('[Vapi Webhook] GoHighLevel: Search response contacts count:', data.contacts?.length || 0);

    if (data.contacts && data.contacts.length > 0) {
      // Find the contact that matches the phone number
      const matchingContact = data.contacts.find((c: any) => {
        const contactPhone = (c.phone || '').replace(/\s+/g, '').replace(/[^\d+]/g, '');
        return contactPhone === cleanedPhone || contactPhone.endsWith(cleanedPhone.slice(-9));
      }) || data.contacts[0];
      
      const firstName = matchingContact.firstName || null;
      const fullName = [matchingContact.firstName, matchingContact.lastName].filter(Boolean).join(' ').trim();
      console.log('[Vapi Webhook] GoHighLevel: Found contact:', { 
        id: matchingContact.id, 
        name: fullName,
        firstName: matchingContact.firstName,
        lastName: matchingContact.lastName 
      });
      return { 
        name: fullName || matchingContact.name || null, 
        contactId: matchingContact.id || null,
        firstName,
      };
    }

    console.log('[Vapi Webhook] GoHighLevel: No contact found for phone:', cleanedPhone);
  } catch (error) {
    console.error('[Vapi Webhook] GoHighLevel: Error fetching contact:', error);
  }

  return { name: null, contactId: null, firstName: null };
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

// Use AI to analyze transcript for missing data (enhanced with negative call analysis)
async function analyzeTranscriptWithAI(transcript: string, summary: string | null, isSquadCall: boolean): Promise<AIAnalysis> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  
  const defaultResult: AIAnalysis = {
    customerName: null,
    sentiment: 'neutral',
    keyTopics: [],
    actionItems: [],
    callIntent: null,
    rootCauseCategory: null,
    escalationSeverity: null,
    aiRecommendations: [],
    negativeSentimentMoment: null,
    recoveryPriority: null,
  };
  
  if (!openaiApiKey || !transcript || transcript.length < 50) {
    return defaultResult;
  }

  try {
    console.log('[Vapi Webhook] Analyzing transcript with AI (enhanced)...');
    
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
            content: `You are an expert call analyst specializing in customer sentiment and issue resolution. Analyze the following call transcript and extract:

1. Customer name (if mentioned by the user or asked for) - return null if not found
2. Overall sentiment (positive, negative, neutral, mixed)
3. Key topics discussed (max 5 topics, short phrases)
4. Action items or follow-ups needed (max 5 items)
${intentInstructions}

FOR NEGATIVE OR MIXED SENTIMENT CALLS, also extract:
6. Root cause category - ONE of: "pricing_objection", "service_complaint", "agent_confusion", "long_hold_time", "unresolved_query", "technical_issue", "miscommunication", "customer_frustration", "wrong_transfer", "information_gap". Return null for positive/neutral calls.
7. Escalation severity (1-5 scale): 1=minor issue, 2=moderate concern, 3=significant problem, 4=serious complaint, 5=critical/angry customer. Return null for positive calls.
8. Recovery priority (1-5 scale): How urgently should this customer be followed up? 1=low, 5=urgent. Consider customer value, issue severity, and whether they seemed likely to churn. Return null for positive calls.
9. AI recommendations - 2-4 specific, actionable recommendations for how to handle/recover this situation. E.g., "Schedule callback within 24 hours to address pricing concerns", "Offer service credit to compensate for wait time". Empty array for positive calls.
10. Negative sentiment moment - identify the exact phrase or moment where the call turned negative. Include a short transcript segment (max 100 chars) showing this. Return null for positive calls.

Respond ONLY with valid JSON in this exact format:
{
  "customerName": "Name or null",
  "sentiment": "positive|negative|neutral|mixed",
  "keyTopics": ["topic1", "topic2"],
  "actionItems": ["action1", "action2"]${intentFormat},
  "rootCauseCategory": "category or null",
  "escalationSeverity": 1-5 or null,
  "recoveryPriority": 1-5 or null,
  "aiRecommendations": ["recommendation1", "recommendation2"],
  "negativeSentimentMoment": {
    "transcriptSegment": "short excerpt where negativity started",
    "triggerPhrase": "specific phrase that triggered negative sentiment"
  } or null
}`
          },
          {
            role: 'user',
            content: `Transcript:\n${transcript.substring(0, 8000)}${summary ? `\n\nSummary:\n${summary}` : ''}`
          }
        ],
        max_tokens: 800,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error('[Vapi Webhook] OpenAI API error:', response.status);
      return defaultResult;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (content) {
      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('[Vapi Webhook] AI analysis result (enhanced):', parsed);
        
        // Parse negative sentiment moment
        let negativeMoment: NegativeSentimentMoment | null = null;
        if (parsed.negativeSentimentMoment && typeof parsed.negativeSentimentMoment === 'object') {
          negativeMoment = {
            timestamp: null, // Could be enhanced later with audio timestamps
            transcriptSegment: parsed.negativeSentimentMoment.transcriptSegment || '',
            triggerPhrase: parsed.negativeSentimentMoment.triggerPhrase || '',
          };
        }
        
        return {
          customerName: parsed.customerName === 'null' ? null : parsed.customerName,
          sentiment: parsed.sentiment || 'neutral',
          keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics.slice(0, 5) : [],
          actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems.slice(0, 5) : [],
          callIntent: parsed.callIntent === 'null' ? null : (parsed.callIntent || null),
          rootCauseCategory: parsed.rootCauseCategory === 'null' ? null : (parsed.rootCauseCategory || null),
          escalationSeverity: typeof parsed.escalationSeverity === 'number' ? Math.min(5, Math.max(1, parsed.escalationSeverity)) : null,
          recoveryPriority: typeof parsed.recoveryPriority === 'number' ? Math.min(5, Math.max(1, parsed.recoveryPriority)) : null,
          aiRecommendations: Array.isArray(parsed.aiRecommendations) ? parsed.aiRecommendations.slice(0, 4) : [],
          negativeSentimentMoment: negativeMoment,
        };
      }
    }
  } catch (error) {
    console.error('[Vapi Webhook] AI analysis error:', error);
  }

  return defaultResult;
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

    // Handle status-update events for live call tracking
    if (message?.type === 'status-update') {
      const currentStatus = message.status || call?.status;
      
      // Only track calls that are starting or in progress
      if (call?.id && ['in-progress', 'ringing', 'queued'].includes(currentStatus?.toLowerCase())) {
        console.log('[Vapi Webhook] Processing status-update for live tracking:', { callId: call.id, status: currentStatus });
        
        // Determine call direction
        const isInbound = call.type === 'inboundPhoneCall' || call.type === 'webCall';
        const callDirection = isInbound ? 'inbound' : 'outbound';
        
        // Squad detection for inbound calls
        const INBOUND_SQUAD_ID = 'a9656ea1-3575-4ac6-b985-fd138be06cc5';
        const INBOUND_SQUAD_NAME = 'Inbound Reception Squad';
        const PRIMARY_INBOUND_AGENT = 'NPC Inbound Agent';
        
        const isSquadCall = isInbound || !!(call.squadId || call.squad);
        const squadId = isInbound ? INBOUND_SQUAD_ID : (call.squadId || call.squad?.id || null);
        const squadName = isInbound ? INBOUND_SQUAD_NAME : (call.squad?.name || null);
        const agentName = isInbound ? PRIMARY_INBOUND_AGENT : (call.assistant?.name || null);
        
        // Upsert minimal call record for live tracking
        const { error: upsertError } = await supabase
          .from('vapi_call_logs')
          .upsert({
            vapi_call_id: call.id,
            call_status: currentStatus.toLowerCase(),
            call_direction: callDirection,
            agent_name: agentName,
            agent_id: call.assistantId || call.assistant?.id || null,
            phone_number: call.customer?.number || null,
            started_at: call.startedAt || new Date().toISOString(),
            is_squad_call: isSquadCall,
            squad_id: squadId,
            squad_name: squadName,
          }, {
            onConflict: 'vapi_call_id',
            ignoreDuplicates: false,
          });
        
        if (upsertError) {
          console.error('[Vapi Webhook] Error upserting live call:', upsertError);
        } else {
          console.log('[Vapi Webhook] Live call tracking record created/updated for:', call.id);
        }
        
        return new Response(JSON.stringify({ success: true, message: 'Live call tracked' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // If it's a status-update for 'ended', let it fall through to be ignored
      // (the end-of-call-report will handle the final update)
      console.log('[Vapi Webhook] Ignoring status-update:', currentStatus);
      return new Response(JSON.stringify({ success: true, message: 'Skipping status-update' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only process end-of-call-report events for full call data
    // Ignore other intermediate events like speech-update, conversation-update
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
    const PRIMARY_INBOUND_AGENT = 'NPC Inbound Agent';
    
    // Primary frontdesk agent (always involved in inbound squad calls)
    const FRONTDESK_AGENT: SquadAssistant = { 
      id: 'npc-inbound-agent', 
      name: 'NPC Inbound Agent', 
      role: 'receptionist' 
    };
    
    // Booking agents mapped by call intent
    const BOOKING_AGENTS: Record<string, SquadAssistant> = {
      'discovery_booking': { id: 'discovery-booking-agent', name: 'Discovery Booking Agent', role: 'booking' },
      'strategy_booking': { id: 'strategy-booking-agent', name: 'Strategy Session Agent', role: 'booking' },
      'finance_consult': { id: 'finance-consult-agent', name: 'Finance Consult Agent', role: 'booking' },
    };
    
    // Helper function to get assistants based on call intent
    const getAssistantsForIntent = (intent: string | null): SquadAssistant[] => {
      const assistants: SquadAssistant[] = [FRONTDESK_AGENT];
      if (intent && BOOKING_AGENTS[intent]) {
        assistants.push(BOOKING_AGENTS[intent]);
      }
      return assistants;
    };
    
    // Helper function to create handoff sequence based on intent
    const createHandoffSequence = (intent: string | null): HandoffEvent[] => {
      if (!intent || !BOOKING_AGENTS[intent]) return [];
      return [{
        fromAssistant: FRONTDESK_AGENT.id,
        toAssistant: BOOKING_AGENTS[intent].id,
        timestamp: new Date().toISOString(),
        reason: `Call transferred based on intent: ${intent.replace(/_/g, ' ')}`
      }];
    };

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
    
    // Initialize assistants - will be populated based on call intent after AI analysis
    let assistantsInvolved: SquadAssistant[] = isSquadCall 
      ? extractAssistantsInvolved(message.artifact?.messages, call.squad?.members)
      : [];
    
    // Extract handoff sequence - will be populated based on call intent after AI analysis
    let handoffSequence: HandoffEvent[] = isSquadCall 
      ? extractHandoffSequence(message.artifact?.messages)
      : [];
    
    console.log('[Vapi Webhook] Initial squad data extracted:', {
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
    // Don't initialize from Vapi's customer.name - it often contains transcript-extracted names
    // GHL is the authoritative source for customer names
    let customerName: string | null = null;
    let ghlContactId: string | null = null;
    let ghlFirstName: string | null = null;
    const vapiCustomerName = call.customer?.name || null; // Keep as fallback only

    // Get agent info - for inbound squad calls, always use NPC inbound agent as primary
    const agentId = call.assistant?.id || call.assistantId || (assistantsInvolved[0]?.id) || null;
    let agentName = isInboundCall && isSquadCall 
      ? PRIMARY_INBOUND_AGENT 
      : (call.assistant?.name || (assistantsInvolved[0]?.name) || null);
    
    // Priority 1: Check if we have an existing GHL contact ID in the database for this phone number
    // and fetch the contact's first name directly from GHL (most reliable)
    if (phoneNumber) {
      // First, check if there's an existing call log with a GHL contact ID for this phone number
      const { data: existingCall } = await supabase
        .from('vapi_call_logs')
        .select('ghl_contact_id')
        .eq('phone_number', phoneNumber)
        .not('ghl_contact_id', 'is', null)
        .limit(1)
        .maybeSingle();
      
      if (existingCall?.ghl_contact_id) {
        console.log('[Vapi Webhook] Found existing GHL contact ID for phone:', existingCall.ghl_contact_id);
        ghlContactId = existingCall.ghl_contact_id;
        
        // Fetch the contact's name directly from GHL using the contact ID
        const ghlByIdResult = await fetchCustomerFromGoHighLevelById(ghlContactId);
        if (ghlByIdResult.name) {
          // Use full name as the customer name
          customerName = ghlByIdResult.name;
          ghlFirstName = ghlByIdResult.firstName;
          console.log('[Vapi Webhook] Using GHL full name from contact ID lookup:', customerName);
        }
      }
    }
    
    // Priority 2: If no GHL contact ID was found in database, search GHL API by phone number
    if (!ghlContactId && phoneNumber) {
      const ghlResult = await fetchCustomerFromGoHighLevel(phoneNumber);
      if (ghlResult.contactId) {
        ghlContactId = ghlResult.contactId;
        if (ghlResult.name) {
          // Use full name as the customer name
          customerName = ghlResult.name;
          ghlFirstName = ghlResult.firstName;
          console.log('[Vapi Webhook] Using GHL full name from phone search:', customerName);
        }
      }
    }
    
    // Priority 3: If GHL lookup found no contact, use Vapi's customer name as fallback
    // but only if it doesn't look like a phone number
    if (!customerName && vapiCustomerName) {
      const digitsOnly = vapiCustomerName.replace(/[\s\-\(\)]/g, '');
      const isPhoneNumber = digitsOnly.startsWith('+') || /^\d{8,}$/.test(digitsOnly);
      if (!isPhoneNumber) {
        customerName = vapiCustomerName;
        console.log('[Vapi Webhook] Using Vapi customer name as fallback (no GHL contact):', customerName);
      }
    }

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
    // New negative call analysis fields
    let rootCauseCategory: string | null = null;
    let escalationSeverity: number | null = null;
    let aiRecommendations: string[] = [];
    let negativeSentimentMoment: NegativeSentimentMoment | null = null;
    let recoveryPriority: number | null = null;

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
        
        // Priority 3: Only use AI customer name if not already set from GoHighLevel
        // Also validate that the AI didn't return a phone number as the customer name
        const isPhoneNumber = (name: string | null): boolean => {
          if (!name) return false;
          // Check if it looks like a phone number (starts with + or contains mostly digits)
          const digitsOnly = name.replace(/[\s\-\(\)]/g, '');
          return digitsOnly.startsWith('+') || /^\d{8,}$/.test(digitsOnly);
        };
        
        if (!customerName && aiAnalysis.customerName && !isPhoneNumber(aiAnalysis.customerName)) {
          customerName = aiAnalysis.customerName;
          console.log('[Vapi Webhook] Using customer name from AI analysis (GHL fallback not available):', customerName);
        } else if (aiAnalysis.customerName && isPhoneNumber(aiAnalysis.customerName)) {
          console.log('[Vapi Webhook] AI returned phone number as customer name, ignoring:', aiAnalysis.customerName);
        }
        
        sentiment = aiAnalysis.sentiment;
        // Capitalize first letter of each topic and action item
        keyTopics = aiAnalysis.keyTopics.map(capitalizeFirst);
        actionItems = aiAnalysis.actionItems.map(capitalizeFirst);
        callIntent = aiAnalysis.callIntent;
        
        // Extract negative call analysis fields
        rootCauseCategory = aiAnalysis.rootCauseCategory;
        escalationSeverity = aiAnalysis.escalationSeverity;
        aiRecommendations = aiAnalysis.aiRecommendations.map(capitalizeFirst);
        negativeSentimentMoment = aiAnalysis.negativeSentimentMoment;
        recoveryPriority = aiAnalysis.recoveryPriority;
        
        console.log('[Vapi Webhook] Negative call analysis:', {
          sentiment,
          rootCauseCategory,
          escalationSeverity,
          recoveryPriority,
          recommendationsCount: aiRecommendations.length,
          hasNegativeMoment: !!negativeSentimentMoment,
        });
        
        // For inbound squad calls, populate assistants and handoff based on detected intent
        if (isInboundCall && isSquadCall && assistantsInvolved.length === 0) {
          assistantsInvolved = getAssistantsForIntent(callIntent);
          handoffSequence = createHandoffSequence(callIntent);
          console.log('[Vapi Webhook] Populated assistants based on intent:', {
            callIntent,
            assistantsCount: assistantsInvolved.length,
            handoffCount: handoffSequence.length,
          });
        }
      }
    }

    // For end-of-call-report events, the call is definitively ended
    // Force status to 'ended' regardless of what the payload says
    const finalCallStatus = isEndOfCall ? 'ended' : getCallStatus(rawStatus);

    const callLogData = {
      vapi_call_id: call.id,
      agent_id: agentId,
      agent_name: agentName,
      phone_number: phoneNumber,
      customer_name: customerName,
      ghl_contact_id: ghlContactId, // Store GHL contact ID for future lookups
      call_direction: getCallDirection(),
      call_status: finalCallStatus,
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
      // Negative call analysis fields
      root_cause_category: rootCauseCategory,
      escalation_severity: escalationSeverity,
      ai_recommendations: aiRecommendations,
      negative_sentiment_moment: negativeSentimentMoment,
      recovery_priority: recoveryPriority,
      // Only set resolution_status for negative/mixed calls that need review
      resolution_status: (sentiment === 'negative' || sentiment === 'mixed') ? 'needs_review' : null,
      metadata: {
        orgId: call.orgId,
        endedReason: rawEndedReason,
        type: call.type,
        eventType: message.type,
        webCallUrl: call.webCallUrl,
        aiAnalyzed: isEndOfCall && !!transcript,
        isSquadCall: isSquadCall,
        customerNameSource: ghlContactId ? 'gohighlevel' : (customerName ? 'ai_analysis' : 'none'),
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
