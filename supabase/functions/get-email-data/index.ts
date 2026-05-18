import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createCorsHeaders, verifyAuth, createUnauthorizedResponse } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));

    // Verify authentication
    const { error: authError } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      return createUnauthorizedResponse(authError, corsHeaders);
    }

    const { action, mailbox_source, email_id } = body;

    // Action: fetch all emails for a mailbox
    if (action === 'list' || !action) {
      const mailboxFilter = mailbox_source || 'admin';
      const limit = Math.min(body.limit || 100, 150);
      const offset = body.offset || 0;

      // Step 1: fetch emails WITHOUT join, and EXCLUDE heavy jsonb columns
      // (attachments, summary) to avoid statement timeouts. Body is kept for
      // previews/search but is text — clients fetch full body via action='get'.
      const { data: emails, error } = await supabase
        .from('email_copilot_emails')
        .select('id, sender, subject, body_preview, received_at, draft_reply, urgency_level, linked_property_address, linked_report_id, status, created_by, created_at, updated_at, cc_recipients, bcc_recipients, mailbox_source, to_recipients, folder, client_id, conversation_id')
        .eq('mailbox_source', mailboxFilter)
        .order('received_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // Step 2: batch-fetch client names for the linked client_ids only
      const clientIds = Array.from(
        new Set((emails || []).map((e: any) => e.client_id).filter(Boolean))
      );
      let clientMap: Record<string, string> = {};
      if (clientIds.length > 0) {
        const { data: clientsData } = await supabase
          .from('clients')
          .select('id, primary_first_name, primary_surname')
          .in('id', clientIds);
        clientMap = Object.fromEntries(
          (clientsData || []).map((c: any) => [
            c.id,
            `${c.primary_first_name || ''} ${c.primary_surname || ''}`.trim() || null,
          ])
        );
      }

      const enrichedData = (emails || []).map((email: any) => ({
        ...email,
        client_name: email.client_id ? clientMap[email.client_id] || null : null,
      }));

      return new Response(
        JSON.stringify({ success: true, emails: enrichedData, hasMore: enrichedData.length === limit }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: fetch a single email by ID
    if (action === 'get') {
      if (!email_id) {
        return new Response(
          JSON.stringify({ error: 'email_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data, error } = await supabase
        .from('email_copilot_emails')
        .select('*')
        .eq('id', email_id)
        .maybeSingle();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, email: data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: fetch sent replies
    if (action === 'list_replies') {
      const mailboxFilter = mailbox_source || 'admin';

      const { data, error } = await supabase
        .from('email_copilot_sent_replies')
        .select('*')
        .eq('mailbox_source', mailboxFilter)
        .order('sent_at', { ascending: false });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, replies: data || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[get-email-data] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
