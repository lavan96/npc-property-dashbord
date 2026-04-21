// Batch 7E.2 — Analytics query proxy over read-only views
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createUnauthorizedResponse, createCorsHeaders } from '../_shared/auth.ts';

interface Body {
  view: 'vw_pipeline_funnel' | 'vw_lender_mix' | 'vw_broker_scorecard' | 'vw_revenue_dashboard';
  session_token?: string;
}

const ALLOWED_VIEWS = ['vw_pipeline_funnel', 'vw_lender_mix', 'vw_broker_scorecard', 'vw_revenue_dashboard'];

Deno.serve(async (req) => {
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

    if (!ALLOWED_VIEWS.includes(body.view)) return j({ success: false, error: 'Unknown view' }, 400);
    const { data, error } = await supabase.from(body.view).select('*');
    if (error) return j({ success: false, error: error.message }, 500);
    return j({ success: true, data });
  } catch (e) {
    console.error('[analytics-query]', e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
