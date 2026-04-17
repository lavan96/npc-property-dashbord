import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { verifyAuth } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await verifyAuth(req);
    if (!auth?.userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { endpoint, keys, user_agent, device_label } = body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return new Response(JSON.stringify({ error: 'Invalid subscription payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: auth.userId,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          user_agent: user_agent || null,
          device_label: device_label || null,
          is_active: true,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' },
      )
      .select('id')
      .maybeSingle();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, id: data?.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[push-subscribe] error', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
