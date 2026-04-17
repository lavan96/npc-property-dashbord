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
    const body = await req.json();
    const { action, payload } = body;

    if (action === 'list') {
      let q = supabase.from('commission_ledger').select('*').order('created_at', { ascending: false });
      if (payload?.broker_id) q = q.eq('broker_id', payload.broker_id);
      if (payload?.deal_id) q = q.eq('deal_id', payload.deal_id);
      if (payload?.status) q = q.eq('status', payload.status);
      if (payload?.from) q = q.gte('expected_date', payload.from);
      if (payload?.to) q = q.lte('expected_date', payload.to);
      if (payload?.limit) q = q.limit(payload.limit);
      const { data, error } = await q;
      if (error) throw error;
      return json({ entries: data });
    }

    if (action === 'create') {
      const { data, error } = await supabase.from('commission_ledger').insert(payload).select().single();
      if (error) throw error;
      return json({ entry: data });
    }

    if (action === 'update') {
      const { id, ...updates } = payload;
      const { data, error } = await supabase.from('commission_ledger').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return json({ entry: data });
    }

    if (action === 'mark_received') {
      const { id, received_date, reference } = payload;
      const { data, error } = await supabase.from('commission_ledger')
        .update({ status: 'received', received_date: received_date || new Date().toISOString().slice(0, 10), reference })
        .eq('id', id).select().single();
      if (error) throw error;
      return json({ entry: data });
    }

    if (action === 'reconcile') {
      const { id } = payload;
      const { data, error } = await supabase.from('commission_ledger')
        .update({ status: 'reconciled', reconciled_date: new Date().toISOString().slice(0, 10) })
        .eq('id', id).select().single();
      if (error) throw error;
      return json({ entry: data });
    }

    if (action === 'delete') {
      const { error } = await supabase.from('commission_ledger').delete().eq('id', payload.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'analytics') {
      const { data: revenue, error: e1 } = await supabase.from('vw_revenue_dashboard').select('*');
      if (e1) throw e1;
      return json({ revenue });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('[manage-commission-ledger]', e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
