// Batch 7E.2 — Generate broker payout from received commissions in a period
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createUnauthorizedResponse, createCorsHeaders } from '../_shared/auth.ts';

interface Body {
  action: 'list' | 'generate' | 'mark_paid' | 'cancel';
  id?: string;
  data?: Record<string, any>;
  filters?: Record<string, any>;
  session_token?: string;
}

serve(async (req) => {
  const cors = createCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const body: Body = await req.json();
    const auth = await verifyAuth(supabase, req.headers, body);
    if (auth.error || !auth.userId) return createUnauthorizedResponse(auth.error || 'Auth required', cors);

    const j = (data: any, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    switch (body.action) {
      case 'list': {
        let q = supabase.from('commission_payouts').select('*').order('period_end', { ascending: false }).limit(200);
        if (body.filters?.broker_id) q = q.eq('broker_id', body.filters.broker_id);
        const { data, error } = await q;
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }

      case 'generate': {
        const { broker_id, broker_name, period_start, period_end } = body.data || {};
        if (!broker_id || !period_start || !period_end) {
          return j({ success: false, error: 'broker_id, period_start, period_end required' }, 400);
        }

        const { data: entries, error: e1 } = await supabase
          .from('commission_ledger').select('*')
          .eq('broker_id', broker_id).eq('status', 'received')
          .gte('received_date', period_start).lte('received_date', period_end);
        if (e1) return j({ success: false, error: e1.message }, 500);
        const list = entries || [];

        const total_gross = list.reduce((s, r) => s + Number(r.gross_amount || 0), 0);
        const total_gst = list.reduce((s, r) => s + Number(r.gst_amount || 0), 0);
        const total_net = list.reduce((s, r) => s + Number(r.net_amount || 0), 0);

        const { data: payout, error } = await supabase.from('commission_payouts').insert({
          broker_id, broker_name, period_start, period_end,
          total_gross, total_gst, total_net,
          ledger_entry_ids: list.map(e => e.id),
          entry_count: list.length,
          status: 'pending',
          generated_by: auth.userId,
        }).select().single();
        if (error) return j({ success: false, error: error.message }, 500);

        if (list.length) {
          await supabase.from('commission_ledger')
            .update({ status: 'reconciled', reconciled_date: new Date().toISOString().slice(0, 10) })
            .in('id', list.map(e => e.id));
        }

        return j({ success: true, data: { payout, entries: list } });
      }

      case 'mark_paid': {
        const { data, error } = await supabase.from('commission_payouts')
          .update({ status: 'paid', paid_at: new Date().toISOString(), payment_reference: body.data?.payment_reference, payment_method: body.data?.payment_method })
          .eq('id', body.id!).select().single();
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }

      case 'cancel': {
        const { data: payout } = await supabase.from('commission_payouts').select('ledger_entry_ids').eq('id', body.id!).single();
        const ids = (payout as any)?.ledger_entry_ids || [];
        if (ids.length) {
          await supabase.from('commission_ledger')
            .update({ status: 'received', reconciled_date: null }).in('id', ids);
        }
        const { data, error } = await supabase.from('commission_payouts')
          .update({ status: 'cancelled' }).eq('id', body.id!).select().single();
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }
    }

    return j({ success: false, error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('[generate-commission-payout]', e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
