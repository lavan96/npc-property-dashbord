import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyAuth, createCorsHeaders as createAuthCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';
import { logApiUsage, extractOpenAIUsage } from '../_shared/logApiUsage.ts';
import { getBrandConfig } from '../_shared/brand-config.ts';

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

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createAuthCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse body with error handling - session token may be in headers/cookies
    let body: any = {};
    try {
      body = await req.json();
    } catch (err) {
      console.log('[email-copilot] Body parsing failed (may be empty), continuing with empty body:', err);
      // Continue - session token should be in headers/cookies
    }

    const {
      action, email, emailId, linkedPropertyAddress, replyContext, clientId,
      // v2 inputs
      tone, length, intent, language, threadEmails, variants,
      // improve / quick reply inputs
      text, instruction,
    } = body;
    
    console.log(`[Email Copilot] Action: ${action}, EmailId: ${emailId || 'N/A'}, ClientId: ${clientId || 'N/A'}`);

    // SECURITY: Verify authentication
    // IMPORTANT: verifyAuth checks headers/cookies first, then body
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

      case 'draft_reply_v2':
        return await handleDraftReplyV2({
          email, emailId, linkedPropertyAddress, replyContext,
          tone, length, intent, language, threadEmails,
          variants: Math.min(Math.max(Number(variants) || 1, 1), 3),
        }, supabase, corsHeaders);

      case 'improve_text':
        return await handleImproveText({ text, instruction, tone, language }, supabase, corsHeaders);

      case 'quick_replies':
        return await handleQuickReplies({ email, threadEmails }, supabase, corsHeaders);

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
  
  const _brand = await getBrandConfig();
  const systemPrompt = `You are an email analysis assistant for ${_brand.companyName}, a property investment advisory company. 
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
    const { callLLMRaw } = await import('../_shared/llmRouter.ts');
    const response = await callLLMRaw({
      agentKey: 'email_copilot',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      maxTokens: 1000,
      responseFormat: { type: 'json_object' },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Email Copilot] OpenAI error:', errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const summaryContent = data.choices[0].message.content;
    const summary: SummaryOutput = JSON.parse(summaryContent);

    // Log API usage
    const usage = extractOpenAIUsage(data);
    await logApiUsage(supabase, {
      service_name: 'openai',
      endpoint: '/v1/chat/completions',
      model_used: 'gpt-4o-mini',
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      tokens_used: usage.total_tokens,
      status: 'success',
      metadata: { function: 'email-copilot', action: 'summarize' },
    });

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

  const _brandDr = await getBrandConfig();
  const systemPrompt = `You are an email drafting assistant for ${_brandDr.companyName}, a professional property investment advisory company.
Your task is to draft a professional, polite, and helpful reply to the given email.

IMPORTANT GUIDELINES:
- Match ${_brandDr.companyName}' professional, courteous tone
- Be clear, concise, and context-aware
- Do NOT make any financial commitments or guarantees
- Do NOT fabricate dates, prices, or specific details
- If information is missing, acknowledge it and offer to clarify
- Use proper email formatting with greeting and sign-off
- Sign off as "${_brandDr.companyName} Team"
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
    const { callLLMRaw } = await import('../_shared/llmRouter.ts');
    const response = await callLLMRaw({
      agentKey: 'email_copilot',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
      maxTokens: 1500,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Email Copilot] OpenAI error:', errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const draftReply = data.choices[0].message.content;

    // Log API usage
    const draftUsage = extractOpenAIUsage(data);
    await logApiUsage(supabase, {
      service_name: 'openai',
      endpoint: '/v1/chat/completions',
      model_used: 'gpt-4o-mini',
      prompt_tokens: draftUsage.prompt_tokens,
      completion_tokens: draftUsage.completion_tokens,
      tokens_used: draftUsage.total_tokens,
      status: 'success',
      metadata: { function: 'email-copilot', action: 'draft_reply' },
    });

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
