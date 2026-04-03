import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();

    // Verify authentication using shared auth
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.log('[send-ghl-message] Auth failed:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }
    console.log(`[send-ghl-message] Authenticated user: ${userId}`);

    const { conversationId, message, type, subject } = body;

    if (!conversationId || !message) {
      return new Response(
        JSON.stringify({ error: "conversationId and message are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get GHL API key from env (preferred) or integration_secrets
    let apiKey = Deno.env.get('GOHIGHLEVEL_API_KEY');
    let locationId = Deno.env.get('GOHIGHLEVEL_LOCATION_ID');

    if (!apiKey) {
      const { data: ghlSecret } = await supabase
        .from("integration_secrets")
        .select("secret_value")
        .eq("secret_key", "ghl_api_key")
        .maybeSingle();
      apiKey = ghlSecret?.secret_value;
    }

    if (!locationId) {
      const { data: locationSecret } = await supabase
        .from("integration_secrets")
        .select("secret_value")
        .eq("secret_key", "ghl_location_id")
        .maybeSingle();
      locationId = locationSecret?.secret_value;
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GHL API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build GHL message payload based on channel type
    const messageType = type || "SMS";
    const ghlPayload: any = {
      type: messageType,
      conversationId: conversationId,
    };

    // For Email, use html/subject fields; for SMS/WhatsApp use message
    if (messageType === 'Email') {
      ghlPayload.html = message;
      ghlPayload.message = message; // fallback plain text
      if (subject) {
        ghlPayload.subject = subject;
      }
    } else {
      ghlPayload.message = message;
    }

    const ghlUrl = `https://services.leadconnectorhq.com/conversations/messages`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Version: "2021-04-15",
    };

    console.log(`[send-ghl-message] Sending ${messageType} to conversation ${conversationId}`);

    const ghlRes = await fetch(ghlUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(ghlPayload),
    });

    const ghlData = await ghlRes.json();

    if (!ghlRes.ok) {
      console.error("[send-ghl-message] GHL API error:", ghlData);
      return new Response(
        JSON.stringify({ error: "Failed to send message via GHL", details: ghlData }),
        { status: ghlRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-ghl-message] Message sent successfully: ${ghlData.messageId || ghlData.id}`);

    // Store the outbound message in our database
    const messageRecord = {
      ghl_message_id: ghlData.messageId || ghlData.id || crypto.randomUUID(),
      conversation_id: null as string | null,
      direction: "outbound",
      body: message,
      message_type: (type || "SMS").toLowerCase(),
      message_status: "delivered",
      ghl_date_added: new Date().toISOString(),
    };

    // Look up our internal conversation record
    const { data: conv } = await supabase
      .from("ghl_conversations")
      .select("id")
      .eq("ghl_conversation_id", conversationId)
      .maybeSingle();

    if (conv) {
      messageRecord.conversation_id = conv.id;

      // Insert the message
      await supabase.from("ghl_conversation_messages").upsert(messageRecord, {
        onConflict: "ghl_message_id",
      });

      // Update conversation metadata
      await supabase
        .from("ghl_conversations")
        .update({
          last_message_date: new Date().toISOString(),
          last_message_body: message.substring(0, 500),
          last_message_direction: "outbound",
          updated_at: new Date().toISOString(),
        })
        .eq("id", conv.id);
    }

    return new Response(
      JSON.stringify({ success: true, messageId: ghlData.messageId || ghlData.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[send-ghl-message] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
