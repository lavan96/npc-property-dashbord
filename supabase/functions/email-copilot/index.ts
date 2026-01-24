import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyAuth, createCorsHeaders as createAuthCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface EmailData {
  id?: string;
  sender: string;
  subject: string;
  body: string;
  received_at?: string;
}

interface SummaryOutput {
  tldr: string;
  keyPoints: string[];
  requiredActions: string[];
  urgencyLevel: 'low' | 'medium' | 'high';
}

// Dynamic CORS headers for credential support
function createCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://lovable.dev',
  ];
  
  const isAllowed = origin && (
    allowedOrigins.includes(origin) ||
    origin.endsWith('.lovable.app') ||
    origin.endsWith('.lovableproject.com')
  );

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : 'https://lovable.dev',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  };
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createAuthCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, email, emailId, linkedPropertyAddress, replyContext, clientId } = body;
    
    console.log(`[Email Copilot] Action: ${action}, EmailId: ${emailId || 'N/A'}, ClientId: ${clientId || 'N/A'}`);

    // SECURITY: Verify authentication
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.log('[email-copilot] Auth failed:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }
    console.log('[email-copilot] Authenticated user:', userId);

    // Handle different actions
    switch (action) {
      case 'summarize':
        if (!openAIApiKey) {
          throw new Error('OPENAI_API_KEY is not configured');
        }
        return await handleSummarize(email, emailId, supabase, corsHeaders);
      
      case 'draft_reply':
        if (!openAIApiKey) {
          throw new Error('OPENAI_API_KEY is not configured');
        }
        return await handleDraftReply(email, emailId, linkedPropertyAddress, supabase, replyContext, corsHeaders);
      
      case 'save_email':
        return await handleSaveEmail(email, supabase, corsHeaders);
      
      case 'assign_client':
        return await handleAssignClient(emailId, clientId, supabase, corsHeaders);
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    console.error('[Email Copilot] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function handleSummarize(email: EmailData, emailId: string | null, supabase: any, corsHeaders: Record<string, string>): Promise<Response> {
  console.log('[Email Copilot] Generating summary...');
  
  const systemPrompt = `You are an email analysis assistant for NPC Services, a property investment advisory company. 
Your task is to analyze incoming emails and provide a structured summary.

IMPORTANT: 
- Be concise and professional
- Focus on actionable information
- Identify any deadlines, requests, or required responses
- Assess urgency based on content (financial matters, legal deadlines = high; general inquiries = low)

Output format (JSON):
{
  "tldr": "One sentence summary",
  "keyPoints": ["Key point 1", "Key point 2", ...],
  "requiredActions": ["Action 1", "Action 2", ...],
  "urgencyLevel": "low" | "medium" | "high"
}`;

  const userPrompt = `Analyze this email and provide a structured summary:

From: ${email.sender}
Subject: ${email.subject}
Date: ${email.received_at || 'Not specified'}

Body:
${email.body}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Email Copilot] OpenAI error:', errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const summaryContent = data.choices[0].message.content;
    const summary: SummaryOutput = JSON.parse(summaryContent);

    console.log('[Email Copilot] Summary generated:', summary.urgencyLevel);

    // Update database if emailId provided
    if (emailId) {
      const { error: updateError } = await supabase
        .from('email_copilot_emails')
        .update({ 
          summary: summary,
          urgency_level: summary.urgencyLevel,
          status: 'summarized'
        })
        .eq('id', emailId);

      if (updateError) {
        console.error('[Email Copilot] DB update error:', updateError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Email Copilot] Summarize error:', error);
    throw error;
  }
}

async function handleDraftReply(
  email: EmailData, 
  emailId: string | null, 
  linkedPropertyAddress: string | null,
  supabase: any,
  replyContext?: string,
  corsHeaders: Record<string, string> = {}
): Promise<Response> {
  console.log('[Email Copilot] Generating draft reply...');

  const propertyContext = linkedPropertyAddress 
    ? `\n\nProperty Context: This email may relate to the property at ${linkedPropertyAddress}. Reference this if relevant.`
    : '';

  const userContextInstruction = replyContext 
    ? `\n\nUSER CONTEXT: The admin has provided the following guidance for the reply:\n"${replyContext}"\n\nIncorporate this context into your draft reply while maintaining professional tone.`
    : '';

  const systemPrompt = `You are an email drafting assistant for NPC Services, a professional property investment advisory company.
Your task is to draft a professional, polite, and helpful reply to the given email.

IMPORTANT GUIDELINES:
- Match NPC Services' professional, courteous tone
- Be clear, concise, and context-aware
- Do NOT make any financial commitments or guarantees
- Do NOT fabricate dates, prices, or specific details
- If information is missing, acknowledge it and offer to clarify
- Use proper email formatting with greeting and sign-off
- Sign off as "NPC Services Team"
${propertyContext}
${userContextInstruction}

This is a DRAFT only. The admin will review and edit before sending.`;

  const userPrompt = `Draft a professional reply to this email:

From: ${email.sender}
Subject: ${email.subject}
Date: ${email.received_at || 'Not specified'}

Body:
${email.body}
${replyContext ? `\n---\nAdmin guidance for reply: ${replyContext}` : ''}

---
Please draft a suitable reply that addresses the sender's concerns or questions.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.5,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Email Copilot] OpenAI error:', errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const draftReply = data.choices[0].message.content;

    console.log('[Email Copilot] Draft reply generated');

    // Update database if emailId provided
    if (emailId) {
      const { error: updateError } = await supabase
        .from('email_copilot_emails')
        .update({ 
          draft_reply: draftReply,
          status: 'drafted'
        })
        .eq('id', emailId);

      if (updateError) {
        console.error('[Email Copilot] DB update error:', updateError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, draftReply }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Email Copilot] Draft reply error:', error);
    throw error;
  }
}

async function handleSaveEmail(email: EmailData, supabase: any, corsHeaders: Record<string, string> = {}): Promise<Response> {
  console.log('[Email Copilot] Saving email...');

  const { data, error } = await supabase
    .from('email_copilot_emails')
    .insert({
      sender: email.sender,
      subject: email.subject,
      body: email.body,
      received_at: email.received_at || new Date().toISOString(),
      status: 'unread'
    })
    .select()
    .single();

  if (error) {
    console.error('[Email Copilot] Save error:', error);
    throw new Error(`Failed to save email: ${error.message}`);
  }

  console.log('[Email Copilot] Email saved with ID:', data.id);

  return new Response(
    JSON.stringify({ success: true, email: data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleAssignClient(
  emailId: string, 
  clientId: string | null, 
  supabase: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  console.log(`[Email Copilot] Assigning email ${emailId} to client ${clientId || 'null'}`);

  if (!emailId) {
    throw new Error('emailId is required');
  }

  // Update the email with the client_id
  const { data, error } = await supabase
    .from('email_copilot_emails')
    .update({ client_id: clientId })
    .eq('id', emailId)
    .select()
    .single();

  if (error) {
    console.error('[Email Copilot] Assign client error:', error);
    throw new Error(`Failed to assign client: ${error.message}`);
  }

  console.log('[Email Copilot] Email assigned to client:', clientId || 'unassigned');

  return new Response(
    JSON.stringify({ success: true, email: data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
