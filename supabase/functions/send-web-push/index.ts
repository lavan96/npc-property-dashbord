// Web Push dispatcher — invoked by the `dispatch_web_push_on_notification` DB trigger.
// Sends VAPID-signed Web Push notifications to all of a user's active push subscriptions.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import webpush from 'https://esm.sh/web-push@3.6.7';
import { verifyRequiredCronSecret } from '../_shared/requestSecurity.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type SubscriberType = 'staff' | 'client_portal' | 'finance_portal';

interface DispatchPayload {
  notification_id?: string;
  user_id: string;
  subscriber_type?: SubscriberType;
  title: string;
  body?: string;
  url?: string | null;
  category?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!verifyRequiredCronSecret(Deno.env.get('INTERNAL_EDGE_SECRET'), req.headers.get('x-internal-edge-secret'))) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY');
    const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT_EMAIL') || 'admin@example.com';

    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      console.error('[send-web-push] VAPID keys not configured');
      return new Response(JSON.stringify({ error: 'service unavailable' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    webpush.setVapidDetails(
      VAPID_SUBJECT.startsWith('mailto:') ? VAPID_SUBJECT : `mailto:${VAPID_SUBJECT}`,
      VAPID_PUBLIC,
      VAPID_PRIVATE,
    );

    const payload: DispatchPayload = await req.json();
    if (!payload?.user_id || !payload?.title) {
      return new Response(JSON.stringify({ error: 'user_id and title required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Fetch active subscriptions for the user (scoped to subscriber pool when provided)
    const subscriberType: SubscriberType = payload.subscriber_type || 'staff';
    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', payload.user_id)
      .eq('subscriber_type', subscriberType)
      .eq('is_active', true);

    if (error) throw error;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: 'No subscriptions' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.body || '',
      url: payload.url || '/',
      category: payload.category || null,
      notification_id: payload.notification_id || null,
    });

    const results = await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            pushPayload,
          );
          await supabase.from('push_delivery_log').insert({
            subscription_id: sub.id,
            user_id: payload.user_id,
            notification_id: payload.notification_id,
            status: 'sent',
            status_code: 201,
            payload_title: payload.title,
          });
          return { id: sub.id, ok: true };
        } catch (err: any) {
          const code = err?.statusCode || 0;
          // 404/410 = subscription expired/invalid → mark inactive
          if (code === 404 || code === 410) {
            await supabase
              .from('push_subscriptions')
              .update({ is_active: false })
              .eq('id', sub.id);
          }
          await supabase.from('push_delivery_log').insert({
            subscription_id: sub.id,
            user_id: payload.user_id,
            notification_id: payload.notification_id,
            status: 'failed',
            status_code: code,
            error_message: String(err?.body || err?.message || err).slice(0, 500),
            payload_title: payload.title,
          });
          return { id: sub.id, ok: false, code };
        }
      }),
    );

    const sent = results.filter((r) => r.ok).length;
    return new Response(JSON.stringify({ success: true, sent, total: subs.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[send-web-push] error', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
