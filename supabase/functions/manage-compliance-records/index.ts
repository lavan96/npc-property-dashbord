import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { action, payload } = await req.json();

    if (action === 'list') {
      let q = supabase.from('compliance_records').select('*').order('generated_at', { ascending: false });
      if (payload?.client_id) q = q.eq('client_id', payload.client_id);
      if (payload?.type) q = q.eq('type', payload.type);
      if (payload?.is_current !== undefined) q = q.eq('is_current', payload.is_current);
      const { data, error } = await q;
      if (error) throw error;
      return json({ records: data });
    }

    if (action === 'create_version') {
      // Always inserts a new version, supersedes prior via trigger
      const { client_id, type } = payload;
      const { data: latest } = await supabase
        .from('compliance_records')
        .select('version')
        .eq('client_id', client_id)
        .eq('type', type)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextVersion = (latest?.version || 0) + 1;
      const insertRow = { ...payload, version: nextVersion, is_current: true };
      const { data, error } = await supabase.from('compliance_records').insert(insertRow).select().single();
      if (error) throw error;
      return json({ record: data });
    }

    if (action === 'update_status') {
      const { id, status, signed_at, signed_by_name, docusign_status } = payload;
      const updates: Record<string, unknown> = { status };
      if (signed_at) updates.signed_at = signed_at;
      if (signed_by_name) updates.signed_by_name = signed_by_name;
      if (docusign_status) updates.docusign_status = docusign_status;
      const { data, error } = await supabase.from('compliance_records').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return json({ record: data });
    }

    if (action === 'pack_export') {
      const { client_id, deal_id, included_record_ids, included_types, shared_with_client } = payload;
      const { data, error } = await supabase
        .from('compliance_pack_exports')
        .insert({ client_id, deal_id, included_record_ids, included_types, shared_with_client: !!shared_with_client })
        .select()
        .single();
      if (error) throw error;
      return json({ pack: data });
    }

    if (action === 'list_packs') {
      const { data, error } = await supabase
        .from('compliance_pack_exports')
        .select('*')
        .eq('client_id', payload.client_id)
        .order('generated_at', { ascending: false });
      if (error) throw error;
      return json({ packs: data });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('[manage-compliance-records]', e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
