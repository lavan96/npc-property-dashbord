/**
 * Finance Portal — Email open tracking pixel.
 * Public (verify_jwt = false) GET endpoint that returns a 1x1 transparent GIF
 * and records the open against finance_email_opens + finance_outbound_messages.
 *
 * Usage: <img src="https://<ref>.supabase.co/functions/v1/finance-email-track-pixel?t=<token>" />
 */
import { createClient } from "npm:@supabase/supabase-js@2.55.0";

const PIXEL_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const PIXEL_BYTES = Uint8Array.from(atob(PIXEL_BASE64), c => c.charCodeAt(0));

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get('t');

  const respondPixel = () => new Response(PIXEL_BYTES, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
    },
  });

  if (!token) return respondPixel();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const ua = req.headers.get('user-agent') || null;
    const now = new Date().toISOString();

    // Try update existing open record
    const { data: existing } = await supabase
      .from('finance_email_opens')
      .select('id, open_count, opened_at')
      .eq('tracking_token', token)
      .maybeSingle();

    if (existing) {
      await supabase.from('finance_email_opens').update({
        opened_at: existing.opened_at ?? now,
        open_count: (existing.open_count ?? 0) + 1,
        last_ip: ip,
        last_user_agent: ua,
      }).eq('id', existing.id);
    } else {
      // Create stub linked to outbound message if matches
      const { data: outbound } = await supabase
        .from('finance_outbound_messages')
        .select('id, client_id, purchase_file_id, finance_contact_id, recipient, subject')
        .eq('tracking_token', token)
        .maybeSingle();
      await supabase.from('finance_email_opens').insert({
        tracking_token: token,
        ghl_message_id: outbound?.id ?? null,
        client_id: outbound?.client_id ?? null,
        purchase_file_id: outbound?.purchase_file_id ?? null,
        finance_contact_id: outbound?.finance_contact_id ?? null,
        recipient_email: outbound?.recipient ?? null,
        subject: outbound?.subject ?? null,
        opened_at: now,
        open_count: 1,
        last_ip: ip,
        last_user_agent: ua,
      });
    }

    // Reflect read state on outbound row (first-open only)
    await supabase.from('finance_outbound_messages')
      .update({ read_at: now, status: 'read' })
      .eq('tracking_token', token)
      .is('read_at', null);
  } catch (err) {
    console.error('[finance-email-track-pixel] error', err);
  }

  return respondPixel();
});
