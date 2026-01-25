import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// System prompt for the User Guide Assistant
const SYSTEM_PROMPT = `You are a helpful AI assistant for the NPC Property Dashboard. Your role is to guide users through the platform's features and help them understand how to use the dashboard effectively.

IMPORTANT GUIDELINES:
1. Be concise and helpful - provide clear, actionable answers
2. When referencing a feature, include the section ID for navigation using this format: [[section:SECTION_ID|Section Title]]
3. Use the knowledge base context provided to answer questions accurately
4. If you're unsure about something, say so rather than guessing
5. Format your responses using Markdown for better readability
6. When listing steps, use numbered lists
7. When explaining features, use bullet points
8. Always be friendly and encouraging

SECTION LINKING FORMAT:
- Use [[section:getting-started|Getting Started]] to link to the Getting Started section
- Use [[section:client-management|Client Management]] to link to Client Management
- Use [[section:email-copilot|Email Copilot]] to link to Email Copilot
- Use [[section:report-qa|Report Q&A]] to link to Report Q&A
- Use [[section:property-management|Property Management]] to link to Property Management
- Use [[section:cash-flow-analysis|Cash Flow Analysis]] to link to Cash Flow Analysis
- Use [[section:borrowing-capacity|Borrowing Capacity]] to link to Borrowing Capacity
- Use [[section:call-logs|Call Logs]] to link to Call Logs
- Use [[section:automation|Automation]] to link to Automation
- Use [[section:reports-analytics|Reports & Analytics]] to link to Reports & Analytics
- Use [[section:data-import|Data Import]] to link to Data Import
- Use [[section:templates|Template Management]] to link to Templates
- Use [[section:sources|Data Sources]] to link to Sources
- Use [[section:integrations|Integrations]] to link to Integrations
- Use [[section:depreciation|Depreciation Comps]] to link to Depreciation
- Use [[section:settings|Settings]] to link to Settings
- Use [[section:white-label|Branding]] to link to White Label/Branding
- Use [[section:calendar|Calendar]] to link to Calendar
- Use [[section:monitoring|Monitoring]] to link to Monitoring & Logs
- Use [[section:admin|Administration]] to link to Admin features

Always include relevant section links when discussing features so users can easily navigate to that part of the guide.`;

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Verify authentication
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const body = await req.json();
    const { messages, knowledgeBase } = body;
    
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.log('[user-guide-assistant] Auth failed:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }
    console.log(`[user-guide-assistant] Authenticated user: ${userId}`);
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing user guide assistant request with ${messages.length} messages`);

    // Build the full system prompt with knowledge base
    const fullSystemPrompt = `${SYSTEM_PROMPT}

---

# KNOWLEDGE BASE (Use this to answer questions):

${knowledgeBase}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: fullSystemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please contact support." }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Failed to get AI response" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Return the stream directly
    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });

  } catch (error) {
    console.error("User guide assistant error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
