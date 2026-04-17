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
      let q = supabase.from('commission_payouts').select('*').order('period_end', { ascending: false });
      if (payload?.broker_id) q = q.eq('broker_id', payload.broker_id);
      const { data, error } = await q;
      if (error) throw error;
      return json({ payouts: data });
    }

    if (action === 'generate') {
      const { broker_id, broker_name, period_start, period_end, generated_by } = payload;

      const { data: entries, error: e1 } = await supabase
        .from('commission_ledger')
        .select('*')
        .eq('broker_id', broker_id)
        .eq('status', 'received')
        .gte('received_date', period_start)
        .lte('received_date', period_end);
      if (e1) throw e1;

      const ledgerEntries = entries || [];
      const total_gross = ledgerEntries.reduce((s, r) => s + Number(r.gross_amount || 0), 0);
      const total_gst = ledgerEntries.reduce((s, r) => s + Number(r.gst_amount || 0), 0);
      const total_net = ledgerEntries.reduce((s, r) => s + Number(r.net_amount || 0), 0);

      const { data, error } = await supabase.from('commission_payouts').insert({
        broker_id, broker_name, period_start, period_end,
        total_gross, total_gst, total_net,
        ledger_entry_ids: ledgerEntries.map(e => e.id),
        entry_count: ledgerEntries.length,
        status: 'pending',
        generated_by,
      }).select().single();
      if (error) throw error;

      // Reconcile included entries
      if (ledgerEntries.length > 0) {
        await supabase.from('commission_ledger')
          .update({ status: 'reconciled', reconciled_date: new Date().toISOString().slice(0, 10) })
          .in('id', ledgerEntries.map(e => e.id));
      }

      return json({ payout: data, entries: ledgerEntries });
    }

    if (action === 'mark_paid') {
      const { id, payment_reference, payment_method } = payload;
      const { data, error } = await supabase.from('commission_payouts')
        .update({ status: 'paid', paid_at: new Date().toISOString(), payment_reference, payment_method })
        .eq('id', id).select().single();
      if (error) throw error;
      return json({ payout: data });
    }

    if (action === 'cancel') {
      const { id } = payload;
      // Revert ledger entries to received
      const { data: payout } = await supabase.from('commission_payouts').select('ledger_entry_ids').eq('id', id).single();
      if (payout?.ledger_entry_ids?.length) {
        await supabase.from('commission_ledger')
          .update({ status: 'received', reconciled_date: null })
          .in('id', payout.ledger_entry_ids);
      }
      const { data, error } = await supabase.from('commission_payouts')
        .update({ status: 'cancelled' }).eq('id', id).select().single();
      if (error) throw error;
      return json({ payout: data });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('[generate-commission-payout]', e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
