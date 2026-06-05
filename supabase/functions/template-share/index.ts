/**
 * template-share
 *
 * Public-facing endpoint for previewing a `report_templates` row via a
 * share token. Returns the template schema + sample data so the client
 * can render an HTML preview. Increments view counters and respects
 * revoked / expired links.
 *
 * GET /template-share?token=...
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const token = (url.searchParams.get('token') || '').trim();
  if (!token || token.length < 12) {
    return new Response(JSON.stringify({ error: 'token required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { data: link, error: linkErr } = await supabase
      .from('template_share_links')
      .select('id, template_id, mode, theme_id, expires_at, revoked_at, label, view_count')
      .eq('token', token)
      .maybeSingle();

    if (linkErr || !link) {
      return new Response(JSON.stringify({ error: 'link not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (link.revoked_at) {
      return new Response(JSON.stringify({ error: 'link revoked' }), {
        status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: 'link expired' }), {
        status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: tpl, error: tplErr } = await supabase
      .from('report_templates')
      .select('id, name, description, schema, custom_css')
      .eq('id', link.template_id)
      .maybeSingle();

    if (tplErr || !tpl) {
      return new Response(JSON.stringify({ error: 'template missing' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fire-and-forget view counter + analytics event
    supabase
      .from('template_share_links')
      .update({ view_count: (link.view_count ?? 0) + 1, last_viewed_at: new Date().toISOString() })
      .eq('id', link.id)
      .then(() => {}, () => {});

    supabase
      .from('template_events')
      .insert({
        template_id: link.template_id,
        event_type: 'share_view',
        share_token: token,
        metadata: {
          mode: link.mode,
          label: link.label,
          user_agent: (req.headers.get('user-agent') || '').slice(0, 200),
        },
      })
      .then(() => {}, () => {});

    return new Response(
      JSON.stringify({
        template: tpl,
        link: {
          mode: link.mode,
          theme_id: link.theme_id,
          label: link.label,
          expires_at: link.expires_at,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[template-share]', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
