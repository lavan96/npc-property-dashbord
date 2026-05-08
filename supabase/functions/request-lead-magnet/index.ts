// Public endpoint: capture lead, return signed download URL, push to GHL.
// No auth required (this is a public lead-magnet form on the marketing site).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { getGhlCredentials, validateGhlCredentials, buildGhlHeaders } from '../_shared/ghl-account.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json().catch(() => ({}));
    const slug = String(body.slug || '').trim();
    const full_name = String(body.full_name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = body.phone ? String(body.phone).trim() : null;

    if (!slug || !full_name || !email) {
      return new Response(JSON.stringify({ error: 'slug, full_name and email are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (full_name.length > 200 || !isEmail(email) || email.length > 255) {
      return new Response(JSON.stringify({ error: 'Invalid name or email' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Look up the magnet
    const { data: magnet, error: magnetErr } = await supabase
      .from('lead_magnets')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();

    if (magnetErr || !magnet) {
      return new Response(JSON.stringify({ error: 'Lead magnet not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Public bucket — permanent direct download URL
    const { data: pub } = supabase.storage
      .from('lead-magnets')
      .getPublicUrl(magnet.file_path, { download: magnet.file_name });

    const downloadUrl = pub?.publicUrl;
    if (!downloadUrl) {
      return new Response(JSON.stringify({ error: 'Could not prepare download' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || null;
    const ua = req.headers.get('user-agent') || null;
    const ref = req.headers.get('referer') || null;

    // Insert capture row (best-effort; do not block download on DB error)
    const { data: capture } = await supabase
      .from('lead_magnet_downloads')
      .insert({
        magnet_id: magnet.id,
        full_name,
        email,
        phone,
        ip_address: ip,
        user_agent: ua,
        referrer: ref,
      })
      .select('id')
      .single();

    // Increment counter (best-effort)
    await supabase
      .from('lead_magnets')
      .update({ download_count: (magnet.download_count || 0) + 1 })
      .eq('id', magnet.id);

    // Fire-and-forget GHL push
    (async () => {
      try {
        const creds = getGhlCredentials('new');
        const validateErr = validateGhlCredentials(creds);
        if (validateErr) { console.warn('[request-lead-magnet] GHL skipped:', validateErr); return; }

        const [firstName, ...rest] = full_name.split(/\s+/);
        const lastName = rest.join(' ') || '';
        const tag = magnet.ghl_tag || `Lead Magnet: ${magnet.title}`;

        const payload: any = {
          firstName, lastName, email, phone: phone || undefined,
          locationId: creds.locationId,
          source: `Lead Magnet: ${magnet.title}`,
          tags: [tag],
        };

        const upsertRes = await fetch(`${GHL_API_BASE}/contacts/upsert`, {
          method: 'POST',
          headers: buildGhlHeaders(creds.apiKey!),
          body: JSON.stringify(payload),
        });
        const upsertJson = await upsertRes.json().catch(() => ({}));
        const contactId = upsertJson?.contact?.id || upsertJson?.id;

        if (!upsertRes.ok || !contactId) {
          throw new Error(`GHL upsert failed: ${upsertRes.status} ${JSON.stringify(upsertJson).slice(0, 300)}`);
        }

        // Create opportunity in chosen pipeline/stage
        if (magnet.ghl_pipeline_id && magnet.ghl_stage_id) {
          const oppRes = await fetch(`${GHL_API_BASE}/opportunities/`, {
            method: 'POST',
            headers: buildGhlHeaders(creds.apiKey!),
            body: JSON.stringify({
              pipelineId: magnet.ghl_pipeline_id,
              pipelineStageId: magnet.ghl_stage_id,
              locationId: creds.locationId,
              name: `${full_name} — ${magnet.title}`,
              status: 'open',
              contactId,
              source: `Lead Magnet: ${magnet.title}`,
            }),
          });
          if (!oppRes.ok) {
            const t = await oppRes.text();
            console.warn('[request-lead-magnet] Opportunity create failed:', oppRes.status, t.slice(0, 300));
          }
        }

        if (capture?.id) {
          await supabase.from('lead_magnet_downloads').update({
            ghl_contact_id: contactId, ghl_synced: true,
          }).eq('id', capture.id);
        }
      } catch (e) {
        console.error('[request-lead-magnet] GHL push error', e);
        if (capture?.id) {
          await supabase.from('lead_magnet_downloads').update({
            ghl_synced: false, ghl_error: String((e as Error).message || e).slice(0, 500),
          }).eq('id', capture.id);
        }
      }
    })();

    return new Response(JSON.stringify({
      success: true,
      download_url: signed.signedUrl,
      file_name: magnet.file_name,
      title: magnet.title,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[request-lead-magnet] Error', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
