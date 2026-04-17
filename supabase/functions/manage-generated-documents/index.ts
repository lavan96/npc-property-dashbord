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
      let q = supabase.from('generated_documents').select('*').order('created_at', { ascending: false });
      if (payload?.client_id) q = q.eq('client_id', payload.client_id);
      if (payload?.deal_id) q = q.eq('deal_id', payload.deal_id);
      if (payload?.submission_id) q = q.eq('submission_id', payload.submission_id);
      if (payload?.status) q = q.eq('status', payload.status);
      const { data, error } = await q;
      if (error) throw error;
      return json({ documents: data });
    }

    if (action === 'create') {
      const { data, error } = await supabase.from('generated_documents').insert(payload).select().single();
      if (error) throw error;
      return json({ document: data });
    }

    if (action === 'update_status') {
      const { id, status, ...rest } = payload;
      const updates: Record<string, unknown> = { status, ...rest };
      if (status === 'sent') updates.sent_at = new Date().toISOString();
      if (status === 'viewed') updates.viewed_at = new Date().toISOString();
      if (status === 'signed') updates.signed_at = new Date().toISOString();
      if (status === 'voided') updates.voided_at = new Date().toISOString();
      const { data, error } = await supabase.from('generated_documents').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return json({ document: data });
    }

    if (action === 'append_audit') {
      const { id, event } = payload;
      const { data: existing } = await supabase.from('generated_documents').select('audit').eq('id', id).single();
      const audit = Array.isArray(existing?.audit) ? existing.audit : [];
      audit.push({ ...event, ts: new Date().toISOString() });
      const { data, error } = await supabase.from('generated_documents').update({ audit }).eq('id', id).select().single();
      if (error) throw error;
      return json({ document: data });
    }

    if (action === 'delete') {
      const { error } = await supabase.from('generated_documents').delete().eq('id', payload.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'list_signature_events') {
      const { data, error } = await supabase
        .from('document_signature_events')
        .select('*')
        .or(`document_id.eq.${payload.document_id},compliance_record_id.eq.${payload.compliance_record_id || '00000000-0000-0000-0000-000000000000'}`)
        .order('occurred_at', { ascending: false });
      if (error) throw error;
      return json({ events: data });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('[manage-generated-documents]', e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
