import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-session-token, x-portal-session-token",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify auth
    const sessionToken = req.headers.get("x-session-token");
    if (!sessionToken) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: session } = await supabase
      .from("custom_sessions")
      .select("user_id, expires_at")
      .eq("session_token", sessionToken)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (!session) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { conversationId, message, type } = body;

    if (!conversationId || !message) {
      return new Response(
        JSON.stringify({ error: "conversationId and message are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get GHL API key
    const { data: ghlSecret } = await supabase
      .from("integration_secrets")
      .select("secret_value")
      .eq("secret_key", "ghl_api_key")
      .maybeSingle();

    if (!ghlSecret?.secret_value) {
      return new Response(
        JSON.stringify({ error: "GHL API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: locationSecret } = await supabase
      .from("integration_secrets")
      .select("secret_value")
      .eq("secret_key", "ghl_location_id")
      .maybeSingle();

    const locationId = locationSecret?.secret_value;

    // Send message via GHL API
    const ghlPayload: any = {
      type: type || "SMS",
      message: message,
      conversationId: conversationId,
    };

    const ghlUrl = `https://services.leadconnectorhq.com/conversations/messages`;
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ghlSecret.secret_value}`,
      Version: "2021-04-15",
    };
    if (locationId) {
      headers["channel"] = locationId;
    }

    const ghlRes = await fetch(ghlUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(ghlPayload),
    });

    const ghlData = await ghlRes.json();

    if (!ghlRes.ok) {
      console.error("GHL send message error:", ghlData);
      return new Response(
        JSON.stringify({ error: "Failed to send message via GHL", details: ghlData }),
        { status: ghlRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store the outbound message in our database
    const messageRecord = {
      ghl_message_id: ghlData.messageId || ghlData.id || crypto.randomUUID(),
      conversation_id: null as string | null, // We'll look this up
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

      // Update last message date
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
    console.error("Send GHL message error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
