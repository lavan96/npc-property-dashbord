import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createCorsHeaders, verifyAuth, createUnauthorizedResponse } from "../_shared/auth.ts";
import { logApiUsage, estimateCost, extractOpenAIUsage } from "../_shared/logApiUsage.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

// ============= TOOL DEFINITIONS =============

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_clients",
      description: "Search for clients by name, email, or phone number. Returns matching client profiles with key details.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search term (name, email, or phone)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_emails",
      description: "Get recent email correspondence for a specific client. Returns the last 15 emails with subject, sender, date and preview.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client" },
        },
        required: ["client_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_reminders",
      description: "Get active reminders and follow-up dates for a client, or all overdue reminders if no client specified.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client (optional - omit for all overdue)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_deals",
      description: "Get deal/pipeline information for a specific client including stages, risk status, key dates, and build progress.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client" },
        },
        required: ["client_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pipeline_overview",
      description: "Get an aggregated overview of all deals in the pipeline grouped by stage, including at-risk counts and upcoming settlements.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_activity",
      description: "Get recent activity logs from the dashboard. Returns the last N actions across all features.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of recent activities to return (default 20, max 50)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_upcoming_calendar",
      description: "Get upcoming appointments and meetings for the next 7 days. Shows appointment title, date, contact, and calendar source.",
      parameters: {
        type: "object",
        properties: {
          days_ahead: { type: "number", description: "Number of days to look ahead (default 7, max 30)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_borrowing_capacity",
      description: "Get the most recent borrowing capacity assessment for a client, including income, expenses, and loan serviceability.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client" },
        },
        required: ["client_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_reminder",
      description: "Create a new reminder/task for a client. REQUIRES USER CONFIRMATION before executing.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client" },
          title: { type: "string", description: "Title of the reminder" },
          description: { type: "string", description: "Description of the reminder" },
          due_date: { type: "string", description: "Due date in ISO format" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Priority level" },
        },
        required: ["client_id", "title", "due_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_reminder",
      description: "Mark a reminder as completed or snooze it. REQUIRES USER CONFIRMATION before executing.",
      parameters: {
        type: "object",
        properties: {
          reminder_id: { type: "string", description: "UUID of the reminder" },
          action: { type: "string", enum: ["complete", "snooze"], description: "Action to take" },
        },
        required: ["reminder_id", "action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_deal_stage",
      description: "Move a deal to the next stage or update its risk status. REQUIRES USER CONFIRMATION before executing.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "UUID of the deal" },
          new_stage: { type: "string", description: "New stage name" },
          risk_status: { type: "string", enum: ["on_track", "at_risk", "delayed"], description: "New risk status" },
        },
        required: ["deal_id"],
      },
    },
  },
];

// ============= TOOL EXECUTORS =============

async function executeSearchClients(supabase: any, args: any) {
  const q = `%${args.query}%`;
  const { data, error } = await supabase
    .from('clients')
    .select('id, primary_first_name, primary_surname, primary_email, primary_mobile, pipeline_status, follow_up_date, created_at')
    .or(`primary_first_name.ilike.${q},primary_surname.ilike.${q},primary_email.ilike.${q},primary_mobile.ilike.${q}`)
    .limit(10);
  
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No clients found matching the query." };
  
  return data.map((c: any) => ({
    id: c.id,
    name: `${c.primary_first_name || ''} ${c.primary_surname || ''}`.trim(),
    email: c.primary_email,
    mobile: c.primary_mobile,
    pipeline_status: c.pipeline_status,
    follow_up_date: c.follow_up_date,
  }));
}

async function executeGetClientEmails(supabase: any, args: any) {
  const { data, error } = await supabase
    .from('email_copilot_emails')
    .select('id, subject, sender, received_at, snippet, is_read, mailbox_source')
    .eq('client_id', args.client_id)
    .order('received_at', { ascending: false })
    .limit(15);
  
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No emails found for this client." };
  
  return data.map((e: any) => ({
    id: e.id,
    subject: e.subject,
    from: e.sender,
    date: e.received_at,
    preview: e.snippet?.substring(0, 150),
    read: e.is_read,
    mailbox: e.mailbox_source,
  }));
}

async function executeGetClientReminders(supabase: any, args: any) {
  let query = supabase
    .from('client_reminders')
    .select('id, title, description, due_date, priority, status, client_id, reminder_type, clients:client_id(primary_first_name, primary_surname)')
    .neq('status', 'completed')
    .order('due_date', { ascending: true })
    .limit(20);
  
  if (args.client_id) {
    query = query.eq('client_id', args.client_id);
  } else {
    query = query.lt('due_date', new Date().toISOString());
  }
  
  const { data, error } = await query;
  if (error) return { error: error.message };
  if (!data?.length) return { message: args.client_id ? "No active reminders for this client." : "No overdue reminders found." };
  
  return data.map((r: any) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    due_date: r.due_date,
    priority: r.priority,
    status: r.status,
    type: r.reminder_type,
    client: r.clients ? `${r.clients.primary_first_name || ''} ${r.clients.primary_surname || ''}`.trim() : null,
  }));
}

async function executeGetClientDeals(supabase: any, args: any) {
  const { data: deals, error } = await supabase
    .from('client_deals')
    .select('id, deal_type, current_stage, current_stage_number, risk_status, property_address, loan_amount, settlement_date, lodgement_date, conditional_approval_date, formal_approval_date, commission_estimate, notes, created_at')
    .eq('client_id', args.client_id)
    .order('created_at', { ascending: false });
  
  if (error) return { error: error.message };
  if (!deals?.length) return { message: "No deals found for this client." };
  
  const dealIds = deals.map((d: any) => d.id);
  const { data: payments } = await supabase
    .from('build_progress_payments')
    .select('deal_id, stage_name, percentage, funds_released, submitted_to_lender')
    .in('deal_id', dealIds)
    .order('stage_number', { ascending: true });
  
  return deals.map((d: any) => ({
    ...d,
    build_progress: payments?.filter((p: any) => p.deal_id === d.id) || [],
  }));
}

async function executeGetPipelineOverview(supabase: any) {
  const { data: deals, error } = await supabase
    .from('client_deals')
    .select('id, deal_type, current_stage, risk_status, settlement_date, loan_amount, commission_estimate, client_id, clients:client_id(primary_first_name, primary_surname)')
    .order('created_at', { ascending: false });
  
  if (error) return { error: error.message };
  if (!deals?.length) return { message: "No deals in the pipeline." };
  
  const stageGroups: Record<string, any> = {};
  let atRiskCount = 0;
  const upcomingSettlements: any[] = [];
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  
  for (const deal of deals) {
    const stage = deal.current_stage || 'Unknown';
    if (!stageGroups[stage]) stageGroups[stage] = { count: 0, total_value: 0 };
    stageGroups[stage].count++;
    stageGroups[stage].total_value += deal.loan_amount || 0;
    
    if (deal.risk_status === 'at_risk' || deal.risk_status === 'delayed') atRiskCount++;
    
    if (deal.settlement_date) {
      const settlementDate = new Date(deal.settlement_date);
      if (settlementDate >= now && settlementDate <= thirtyDaysFromNow) {
        upcomingSettlements.push({
          deal_id: deal.id,
          client: deal.clients ? `${deal.clients.primary_first_name || ''} ${deal.clients.primary_surname || ''}`.trim() : 'Unknown',
          settlement_date: deal.settlement_date,
          loan_amount: deal.loan_amount,
        });
      }
    }
  }
  
  return {
    total_deals: deals.length,
    by_stage: stageGroups,
    at_risk_count: atRiskCount,
    upcoming_settlements_30d: upcomingSettlements.sort((a: any, b: any) => new Date(a.settlement_date).getTime() - new Date(b.settlement_date).getTime()),
    total_pipeline_value: deals.reduce((sum: number, d: any) => sum + (d.loan_amount || 0), 0),
    total_commission: deals.reduce((sum: number, d: any) => sum + (d.commission_estimate || 0), 0),
  };
}

async function executeGetRecentActivity(supabase: any, args: any) {
  const limit = Math.min(args.limit || 20, 50);
  const { data, error } = await supabase
    .from('activity_logs')
    .select('id, action_type, entity_type, entity_name, username, created_at, metadata')
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error) return { error: error.message };
  return data || [];
}

async function executeGetUpcomingCalendar(supabase: any, args: any) {
  const daysAhead = Math.min(args.days_ahead || 7, 30);
  const now = new Date();
  const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('appointment_secondary_recipients')
    .select('id, appointment_title, appointment_start, appointment_end, appointment_type, contact_name, contact_email, calendar_name, appointment_notes')
    .gte('appointment_start', now.toISOString())
    .lte('appointment_start', futureDate.toISOString())
    .order('appointment_start', { ascending: true })
    .limit(20);

  if (error) return { error: error.message };
  if (!data?.length) return { message: `No upcoming appointments in the next ${daysAhead} days.` };

  return data.map((a: any) => ({
    id: a.id,
    title: a.appointment_title,
    start: a.appointment_start,
    end: a.appointment_end,
    type: a.appointment_type,
    contact: a.contact_name,
    email: a.contact_email,
    calendar: a.calendar_name,
    notes: a.appointment_notes?.substring(0, 200),
  }));
}

async function executeGetBorrowingCapacity(supabase: any, args: any) {
  const { data, error } = await supabase
    .from('borrowing_capacity_assessments')
    .select('id, borrowing_capacity, gross_annual_income, shaded_annual_income, living_expenses_monthly, existing_commitments_monthly, monthly_surplus, serviceability_band, interest_rate_used, loan_term_years, stress_tested_capacity, dti_ratio, net_purchase_capacity, warnings, recommendations, created_at')
    .eq('client_id', args.client_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { message: "No borrowing capacity assessment found for this client." };

  return {
    ...data,
    borrowing_capacity_formatted: `$${(data.borrowing_capacity || 0).toLocaleString()}`,
    income_formatted: `$${(data.gross_annual_income || 0).toLocaleString()}/year`,
  };
}

// Write-action executors (require confirmation)
async function executeCreateReminder(supabase: any, args: any, userId: string) {
  const { error } = await supabase
    .from('client_reminders')
    .insert({
      client_id: args.client_id,
      title: args.title,
      description: args.description || null,
      due_date: args.due_date,
      priority: args.priority || 'medium',
      status: 'pending',
      reminder_type: 'task',
      created_by: userId !== 'service_role' ? userId : null,
    });
  if (error) return { error: error.message };
  return { success: true, message: `✅ Reminder "${args.title}" created successfully.` };
}

async function executeUpdateReminder(supabase: any, args: any) {
  if (args.action === 'complete') {
    const { error } = await supabase
      .from('client_reminders')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', args.reminder_id);
    if (error) return { error: error.message };
    return { success: true, message: `✅ Reminder marked as completed.` };
  } else if (args.action === 'snooze') {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const { error } = await supabase
      .from('client_reminders')
      .update({ due_date: tomorrow.toISOString() })
      .eq('id', args.reminder_id);
    if (error) return { error: error.message };
    return { success: true, message: `✅ Reminder snoozed to tomorrow.` };
  }
  return { error: "Unknown action" };
}

async function executeUpdateDealStage(supabase: any, args: any) {
  const updates: any = {};
  if (args.new_stage) updates.current_stage = args.new_stage;
  if (args.risk_status) updates.risk_status = args.risk_status;
  
  const { error } = await supabase
    .from('client_deals')
    .update(updates)
    .eq('id', args.deal_id);
  
  if (error) return { error: error.message };
  return { success: true, message: `✅ Deal updated successfully.` };
}

// Tool dispatcher
const WRITE_TOOLS = ['update_reminder', 'update_deal_stage', 'create_reminder'];

async function executeTool(supabase: any, toolName: string, args: any, userId: string): Promise<any> {
  switch (toolName) {
    case 'search_clients': return executeSearchClients(supabase, args);
    case 'get_client_emails': return executeGetClientEmails(supabase, args);
    case 'get_client_reminders': return executeGetClientReminders(supabase, args);
    case 'get_client_deals': return executeGetClientDeals(supabase, args);
    case 'get_pipeline_overview': return executeGetPipelineOverview(supabase);
    case 'get_recent_activity': return executeGetRecentActivity(supabase, args);
    case 'get_upcoming_calendar': return executeGetUpcomingCalendar(supabase, args);
    case 'get_borrowing_capacity': return executeGetBorrowingCapacity(supabase, args);
    case 'create_reminder': return executeCreateReminder(supabase, args, userId);
    case 'update_reminder': return executeUpdateReminder(supabase, args);
    case 'update_deal_stage': return executeUpdateDealStage(supabase, args);
    default: return { error: `Unknown tool: ${toolName}` };
  }
}

// ============= SYSTEM PROMPT =============

const SYSTEM_PROMPT = `You are Aurixa, the AI operating assistant for the NPC Property Dashboard — a property investment and mortgage brokerage management platform.

You have access to tools that let you search clients, view emails, check reminders, inspect deals/pipeline stages, view calendar appointments, check borrowing capacity, and view activity logs. Use these tools proactively to answer user questions with real data.

CRITICAL RULES:
1. When the user asks about a client, ALWAYS use search_clients first to find their ID, then use that ID for subsequent lookups.
2. For write operations (updating reminders, moving deal stages, creating reminders), you MUST describe what you're about to do and ask the user to confirm BEFORE the action executes. Format your confirmation request clearly with the specific details.
3. Present data in clean, readable markdown. Use tables for structured data, bullet points for lists.
4. If a query is ambiguous, ask for clarification rather than guessing.
5. You are an expert mortgage broker assistant. Provide context-aware insights when presenting deal or pipeline data.
6. When showing dates, format them in a human-readable way (e.g., "15 March 2026").
7. Never fabricate data. If a tool returns no results, say so.
8. For pipeline overview, always highlight at-risk deals and upcoming settlements.
9. When showing monetary values, format with $ and commas (e.g., "$1,250,000").
10. Be concise but thorough. Don't repeat tool results verbatim — synthesize and present insights.`;

// ============= AI GATEWAY CALL =============

async function callAI(messages: any[], supabase: any, userId: string): Promise<{ message: any; usage: any }> {
  const startTime = Date.now();

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      temperature: 0.3,
      max_tokens: 2500,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[ai-dashboard-agent] AI Gateway error:', response.status, errorText);
    
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again in a moment.');
    }
    if (response.status === 402) {
      throw new Error('AI credits exhausted. Please add credits to your Lovable workspace.');
    }
    throw new Error(`AI Gateway error: ${response.status}`);
  }

  const result = await response.json();
  const elapsed = Date.now() - startTime;
  const usage = extractOpenAIUsage(result);

  // Log usage asynchronously
  logApiUsage(supabase, {
    service_name: 'lovable-ai-gateway',
    endpoint: '/v1/chat/completions',
    model_used: 'google/gemini-3-flash-preview',
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    tokens_used: usage.total_tokens,
    response_time_ms: elapsed,
    status: 'success',
    user_id: userId,
    metadata: { feature: 'ai-dashboard-agent', tool_calls: result.choices?.[0]?.message?.tool_calls?.length || 0 },
  });

  return { message: result.choices?.[0]?.message, usage };
}

// ============= CONVERSATION HANDLERS =============

async function handleListConversations(supabase: any, userId: string, corsHeaders: Record<string, string>) {
  const { data, error } = await supabase
    .from('agent_conversations')
    .select('id, title, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return new Response(JSON.stringify({ success: true, conversations: data || [] }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleCreateConversation(supabase: any, userId: string, title: string, corsHeaders: Record<string, string>) {
  const { data, error } = await supabase
    .from('agent_conversations')
    .insert({ user_id: userId, title: title || 'New Conversation' })
    .select()
    .single();

  if (error) throw error;
  return new Response(JSON.stringify({ success: true, conversation: data }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleDeleteConversation(supabase: any, userId: string, conversationId: string, corsHeaders: Record<string, string>) {
  const { error } = await supabase
    .from('agent_conversations')
    .delete()
    .eq('id', conversationId)
    .eq('user_id', userId);

  if (error) throw error;
  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleRenameConversation(supabase: any, userId: string, conversationId: string, newTitle: string, corsHeaders: Record<string, string>) {
  const { error } = await supabase
    .from('agent_conversations')
    .update({ title: newTitle })
    .eq('id', conversationId)
    .eq('user_id', userId);

  if (error) throw error;
  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleGetMessages(supabase: any, conversationId: string, corsHeaders: Record<string, string>) {
  const { data, error } = await supabase
    .from('agent_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) throw error;
  return new Response(JSON.stringify({ success: true, messages: data || [] }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleConfirmAction(supabase: any, body: any, corsHeaders: Record<string, string>) {
  const { message_id, approved, conversation_id } = body;
  
  await supabase
    .from('agent_messages')
    .update({ confirmation_status: approved ? 'approved' : 'rejected' })
    .eq('id', message_id);

  if (!approved) {
    await supabase.from('agent_messages').insert({
      conversation_id,
      role: 'assistant',
      content: 'Action cancelled. No changes were made.',
    });
    return new Response(JSON.stringify({ success: true, message: 'Action cancelled.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: pendingMsg } = await supabase
    .from('agent_messages')
    .select('tool_calls')
    .eq('id', message_id)
    .single();

  if (pendingMsg?.tool_calls) {
    const results: any[] = [];
    for (const tc of pendingMsg.tool_calls) {
      const result = await executeTool(supabase, tc.function.name, JSON.parse(tc.function.arguments), body.user_id || 'service_role');
      results.push({ tool_call_id: tc.id, result });
    }

    const resultContent = results.map(r => {
      const res = r.result;
      return res.success ? res.message : `⚠️ Error: ${res.error || 'Unknown error'}`;
    }).join('\n');

    await supabase.from('agent_messages').insert({
      conversation_id,
      role: 'assistant',
      content: resultContent,
    });

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============= MAIN CHAT HANDLER =============

async function handleChat(supabase: any, body: any, userId: string, username: string, corsHeaders: Record<string, string>) {
  const { conversation_id, message } = body;
  if (!conversation_id || !message) {
    return new Response(JSON.stringify({ error: 'conversation_id and message are required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Save user message
  await supabase.from('agent_messages').insert({
    conversation_id, role: 'user', content: message,
  });

  // Load conversation history
  const { data: history } = await supabase
    .from('agent_messages')
    .select('role, content, tool_calls, tool_results')
    .eq('conversation_id', conversation_id)
    .order('created_at', { ascending: true })
    .limit(30);

  const messages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT + `\n\nCurrent user: ${username} (ID: ${userId})\nCurrent time: ${new Date().toISOString()}` },
  ];

  for (const msg of (history || [])) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: msg.content || '' });
    }
  }

  // Agentic loop (max 5 rounds)
  let finalResponse = '';
  let pendingConfirmation = false;
  let pendingToolCalls: any[] = [];

  try {
    for (let round = 0; round < 5; round++) {
      const { message: assistantMsg } = await callAI(messages, supabase, userId);

      if (!assistantMsg) {
        finalResponse = 'I encountered an error processing your request. Please try again.';
        break;
      }

      if (assistantMsg.tool_calls?.length) {
        const hasWriteAction = assistantMsg.tool_calls.some((tc: any) => WRITE_TOOLS.includes(tc.function.name));

        if (hasWriteAction) {
          pendingConfirmation = true;
          pendingToolCalls = assistantMsg.tool_calls;
          finalResponse = assistantMsg.content || '';
          break;
        }

        // Execute read-only tools
        messages.push(assistantMsg);

        for (const toolCall of assistantMsg.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments);
          console.log(`[ai-dashboard-agent] Tool: ${toolCall.function.name}`, args);
          const result = await executeTool(supabase, toolCall.function.name, args, userId);
          
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result).substring(0, 4000),
          });
        }
        continue;
      }

      finalResponse = assistantMsg.content || '';
      break;
    }
  } catch (err: any) {
    console.error('[ai-dashboard-agent] Chat error:', err);
    finalResponse = `⚠️ ${err.message || 'An error occurred while processing your request.'}`;
  }

  // Save assistant response
  if (pendingConfirmation) {
    await supabase.from('agent_messages').insert({
      conversation_id,
      role: 'assistant',
      content: finalResponse,
      tool_calls: pendingToolCalls,
      requires_confirmation: true,
      confirmation_status: 'pending',
    });
  } else {
    await supabase.from('agent_messages').insert({
      conversation_id,
      role: 'assistant',
      content: finalResponse,
    });
  }

  // Auto-title on first message
  const { data: msgCount } = await supabase
    .from('agent_messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversation_id);

  if (msgCount !== null && (msgCount as any)?.length <= 2) {
    const shortTitle = message.length > 60 ? message.substring(0, 57) + '...' : message;
    await supabase
      .from('agent_conversations')
      .update({ title: shortTitle })
      .eq('id', conversation_id);
  }

  return new Response(JSON.stringify({
    success: true,
    response: finalResponse,
    requires_confirmation: pendingConfirmation,
    pending_tool_calls: pendingConfirmation ? pendingToolCalls : undefined,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============= MAIN HANDLER =============

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));

    const { error: authError, userId, username } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      return createUnauthorizedResponse(authError, corsHeaders);
    }

    const { action } = body;

    switch (action) {
      case 'list-conversations':
        return handleListConversations(supabase, userId!, corsHeaders);
      case 'create-conversation':
        return handleCreateConversation(supabase, userId!, body.title, corsHeaders);
      case 'delete-conversation':
        return handleDeleteConversation(supabase, userId!, body.conversation_id, corsHeaders);
      case 'rename-conversation':
        return handleRenameConversation(supabase, userId!, body.conversation_id, body.title, corsHeaders);
      case 'get-messages':
        return handleGetMessages(supabase, body.conversation_id, corsHeaders);
      case 'confirm-action':
        return handleConfirmAction(supabase, { ...body, user_id: userId }, corsHeaders);
      case 'chat':
        return handleChat(supabase, body, userId!, username!, corsHeaders);
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

  } catch (error: any) {
    console.error('[ai-dashboard-agent] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
