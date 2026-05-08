// Admin CRUD + upload for lead magnets. Requires authenticated session.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createUnauthorizedResponse, createCorsHeaders } from '../_shared/auth.ts';
import { getGhlCredentials, validateGhlCredentials, buildGhlHeaders, resolveGhlAccessTokenForLocation } from '../_shared/ghl-account.ts';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

Deno.serve(async (req) => {
  const corsHeaders = createCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json().catch(() => ({}));
    const auth = await verifyAuth(req, supabase, body.session_token);
    if (auth.error || !auth.userId) return createUnauthorizedResponse(auth.error || 'Unauthorized', corsHeaders);

    const { operation } = body;
    const json = (data: any, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    switch (operation) {
      case 'list': {
        const { data, error } = await supabase
          .from('lead_magnets')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false });
        if (error) return json({ error: error.message }, 500);
        return json({ magnets: data });
      }

      case 'create': {
        const { title, slug, description, file_data, file_name, mime_type,
                ghl_pipeline_id, ghl_stage_id, ghl_tag, is_active } = body;
        if (!title || !slug || !file_data || !file_name) {
          return json({ error: 'title, slug, file_data, file_name required' }, 400);
        }
        // Decode base64 to bytes (chunked)
        const binary = atob(file_data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const safeSlug = String(slug).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
        const ext = file_name.split('.').pop() || 'pdf';
        const path = `${safeSlug}/${Date.now()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from('lead-magnets')
          .upload(path, bytes, { contentType: mime_type || 'application/pdf', upsert: false });
        if (upErr) return json({ error: `Upload failed: ${upErr.message}` }, 500);

        const { data, error } = await supabase
          .from('lead_magnets')
          .insert({
            title, slug: safeSlug, description: description || null,
            file_path: path, file_name, file_size: bytes.length, mime_type: mime_type || 'application/pdf',
            ghl_pipeline_id: ghl_pipeline_id || null,
            ghl_stage_id: ghl_stage_id || null,
            ghl_tag: ghl_tag || null,
            is_active: is_active !== false,
          })
          .select()
          .single();
        if (error) {
          // rollback upload
          await supabase.storage.from('lead-magnets').remove([path]);
          return json({ error: error.message }, 500);
        }
        return json({ magnet: data });
      }

      case 'update': {
        const { id, ...patch } = body;
        if (!id) return json({ error: 'id required' }, 400);
        delete patch.operation; delete patch.session_token; delete patch.file_data; delete patch.file_name; delete patch.mime_type;
        const allowed: any = {};
        for (const k of ['title', 'description', 'ghl_pipeline_id', 'ghl_stage_id', 'ghl_tag', 'is_active', 'sort_order']) {
          if (k in patch) allowed[k] = patch[k];
        }
        const { data, error } = await supabase.from('lead_magnets').update(allowed).eq('id', id).select().single();
        if (error) return json({ error: error.message }, 500);
        return json({ magnet: data });
      }

      case 'delete': {
        const { id } = body;
        if (!id) return json({ error: 'id required' }, 400);
        const { data: m } = await supabase.from('lead_magnets').select('file_path').eq('id', id).single();
        if (m?.file_path) await supabase.storage.from('lead-magnets').remove([m.file_path]);
        const { error } = await supabase.from('lead_magnets').delete().eq('id', id);
        if (error) return json({ error: error.message }, 500);
        return json({ success: true });
      }

      case 'list_pipelines': {
        // Live-fetch pipelines + stages from the NEW GHL account so leads route there.
        const creds = getGhlCredentials('new');
        const credErr = validateGhlCredentials(creds);
        if (credErr) return json({ error: credErr, pipelines: [], stages: [] }, 200);
        try {
          const { accessToken } = await resolveGhlAccessTokenForLocation(creds);
          const res = await fetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${creds.locationId}`, {
            headers: buildGhlHeaders(accessToken),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            return json({ error: `GHL pipelines fetch failed: ${res.status} ${JSON.stringify(data).slice(0, 300)}`, pipelines: [], stages: [] }, 200);
          }
          const rawPipelines = Array.isArray(data?.pipelines) ? data.pipelines : [];
          const pipelines = rawPipelines.map((p: any) => ({ id: p.id, ghl_id: p.id, name: p.name }));
          const stages = rawPipelines.flatMap((p: any) =>
            (p.stages || []).map((s: any) => ({
              id: s.id, ghl_id: s.id, pipeline_id: p.id, name: s.name, position: s.position ?? 0,
            }))
          );
          return json({ pipelines, stages, account: 'new' });
        } catch (e) {
          return json({ error: `GHL fetch error: ${(e as Error).message}`, pipelines: [], stages: [] }, 200);
        }
      }

      case 'list_downloads': {
        const { magnet_id, limit = 100 } = body;
        let q = supabase.from('lead_magnet_downloads').select('*').order('created_at', { ascending: false }).limit(limit);
        if (magnet_id) q = q.eq('magnet_id', magnet_id);
        const { data, error } = await q;
        if (error) return json({ error: error.message }, 500);
        return json({ downloads: data });
      }

      default:
        return json({ error: `Unknown operation: ${operation}` }, 400);
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
