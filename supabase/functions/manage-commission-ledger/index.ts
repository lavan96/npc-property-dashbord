// Batch 7E.2 — Commission ledger CRUD + analytics
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createUnauthorizedResponse, createCorsHeaders } from '../_shared/auth.ts';

interface Body {
  action: 'list' | 'get' | 'create' | 'update' | 'delete' | 'mark_received' | 'reconcile' | 'forecast_chart';
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
        let q = supabase.from('commission_ledger').select('*').order('created_at', { ascending: false }).limit(1000);
        const f = body.filters || {};
        if (f.broker_id) q = q.eq('broker_id', f.broker_id);
        if (f.deal_id) q = q.eq('deal_id', f.deal_id);
        if (f.client_id) q = q.eq('client_id', f.client_id);
        if (f.status) q = q.eq('status', f.status);
        if (f.lender_id) q = q.eq('lender_id', f.lender_id);
        if (f.from) q = q.gte('expected_date', f.from);
        if (f.to) q = q.lte('expected_date', f.to);
        const { data, error } = await q;
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }

      case 'get': {
        const { data, error } = await supabase.from('commission_ledger').select('*').eq('id', body.id!).maybeSingle();
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }

      case 'create': {
        const insertRow = { ...(body.data || {}), created_by: auth.userId };
        const { data, error } = await supabase.from('commission_ledger').insert(insertRow).select().single();
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }

      case 'update': {
        const { data, error } = await supabase.from('commission_ledger').update(body.data || {}).eq('id', body.id!).select().single();
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }

      case 'mark_received': {
        const updates = {
          status: 'received',
          received_date: body.data?.received_date || new Date().toISOString().slice(0, 10),
          reference: body.data?.reference,
        };
        const { data, error } = await supabase.from('commission_ledger').update(updates).eq('id', body.id!).select().single();
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }

      case 'reconcile': {
        const { data, error } = await supabase.from('commission_ledger')
          .update({ status: 'reconciled', reconciled_date: new Date().toISOString().slice(0, 10) })
          .eq('id', body.id!).select().single();
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }

      case 'delete': {
        const { error } = await supabase.from('commission_ledger').delete().eq('id', body.id!);
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data: { ok: true } });
      }

      case 'forecast_chart': {
        const { data, error } = await supabase.from('vw_revenue_dashboard').select('*');
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }
    }

    return j({ success: false, error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('[manage-commission-ledger]', e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
