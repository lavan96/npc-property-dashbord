// Email Copilot Extras: snippets, scheduled sends, follow-up reminders.
// All actions go through verifyAuth + service-role DB access.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const corsHeaders = createCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const { error: authError, userId, authMethod } = await verifyAuth(supabase, req.headers, body);
    if (authError || !userId) return createUnauthorizedResponse(authError || 'Unauthorized', corsHeaders);
    const effectiveUserId = authMethod === 'service_role' ? body.effectiveUserId : userId;
    if (!effectiveUserId) return json({ error: 'Missing effectiveUserId' }, 400);

    const { action } = body;

    // ────────── SNIPPETS ──────────
    if (action === 'list_snippets') {
      const { data, error } = await supabase
        .from('email_copilot_snippets')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return json({ success: true, snippets: data || [] });
    }

    if (action === 'save_snippet') {
      const { id, title, shortcut, body: snippetBody, category } = body;
      if (!title || !snippetBody) return json({ error: 'title and body required' }, 400);
      const payload = {
        user_id: effectiveUserId,
        title: String(title).slice(0, 200),
        shortcut: shortcut ? String(shortcut).slice(0, 50) : null,
        body: String(snippetBody),
        category: category || 'general',
      };
      if (id) {
        const { data, error } = await supabase
          .from('email_copilot_snippets')
          .update(payload)
          .eq('id', id)
          .eq('user_id', effectiveUserId)
          .select()
          .maybeSingle();
        if (error) throw error;
        return json({ success: true, snippet: data });
      }
      const { data, error } = await supabase
        .from('email_copilot_snippets')
        .insert(payload)
        .select()
        .maybeSingle();
      if (error) throw error;
      return json({ success: true, snippet: data });
    }

    if (action === 'delete_snippet') {
      const { id } = body;
      if (!id) return json({ error: 'id required' }, 400);
      const { error } = await supabase
        .from('email_copilot_snippets')
        .delete()
        .eq('id', id)
        .eq('user_id', effectiveUserId);
      if (error) throw error;
      return json({ success: true });
    }

    // ────────── SCHEDULED SENDS ──────────
    if (action === 'list_scheduled') {
      const { data, error } = await supabase
        .from('email_copilot_scheduled_sends')
        .select('*')
        .eq('user_id', effectiveUserId)
        .in('status', ['pending', 'failed'])
        .order('scheduled_for', { ascending: true });
      if (error) throw error;
      return json({ success: true, scheduled: data || [] });
    }

    if (action === 'schedule_send') {
      const {
        recipient, cc_recipients, bcc_recipients, subject,
        body: emailBody, attachments, mailbox_source, original_email_id, scheduled_for,
      } = body;
      if (!recipient || !scheduled_for) return json({ error: 'recipient and scheduled_for required' }, 400);
      const when = new Date(scheduled_for);
      if (isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) {
        return json({ error: 'scheduled_for must be a valid future timestamp' }, 400);
      }
      const { data, error } = await supabase
        .from('email_copilot_scheduled_sends')
        .insert({
          user_id: effectiveUserId,
          mailbox_source: mailbox_source || 'admin',
          recipient: String(recipient),
          cc_recipients: Array.isArray(cc_recipients) ? cc_recipients : [],
          bcc_recipients: Array.isArray(bcc_recipients) ? bcc_recipients : [],
          subject: subject || '',
          body: emailBody || '',
          attachments: Array.isArray(attachments) ? attachments : [],
          original_email_id: original_email_id || null,
          scheduled_for: when.toISOString(),
          status: 'pending',
        })
        .select()
        .maybeSingle();
      if (error) throw error;
      return json({ success: true, scheduled: data });
    }

    if (action === 'cancel_scheduled') {
      const { id } = body;
      if (!id) return json({ error: 'id required' }, 400);
      const { error } = await supabase
        .from('email_copilot_scheduled_sends')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .eq('user_id', effectiveUserId)
        .eq('status', 'pending');
      if (error) throw error;
      return json({ success: true });
    }

    // ────────── FOLLOW-UP REMINDER ──────────
    if (action === 'create_followup_reminder') {
      const { client_id, due_date, title, description, priority } = body;
      if (!due_date || !title) return json({ error: 'due_date and title required' }, 400);
      const { data, error } = await supabase
        .from('client_reminders')
        .insert({
          client_id: client_id || null,
          title: String(title).slice(0, 300),
          description: description || null,
          due_date: new Date(due_date).toISOString(),
          priority: priority || 'medium',
          status: 'pending',
          reminder_type: 'email_followup',
          created_by: effectiveUserId,
          assigned_to: [effectiveUserId],
          reminder_scope: client_id ? 'client' : 'personal',
        })
        .select()
        .maybeSingle();
      if (error) throw error;
      return json({ success: true, reminder: data });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e: any) {
    console.error('[email-copilot-extras] Error:', e);
    return json({ error: e?.message || 'Server error' }, 500);
  }
});
