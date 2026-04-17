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
    const { view } = await req.json();

    const allowed = ['vw_pipeline_funnel', 'vw_lender_mix', 'vw_broker_scorecard', 'vw_revenue_dashboard'];
    if (!allowed.includes(view)) return json({ error: 'Unknown view' }, 400);

    const { data, error } = await supabase.from(view).select('*');
    if (error) throw error;
    return json({ rows: data });
  } catch (e) {
    console.error('[analytics-query]', e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
