// One-shot admin utility: sync `INTERNAL_EDGE_SECRET` (edge env) and
// `SUPABASE_SERVICE_ROLE_KEY` into the Vault entries pg_cron signs with.
// Gate: caller must present the current edge INTERNAL_EDGE_SECRET as
// `x-admin-token`. Delete this function after cutover.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });
  const expected = (Deno.env.get('INTERNAL_EDGE_SECRET') || '').trim();
  const presented = (req.headers.get('x-admin-token') || '').trim();
  if (!expected || expected.length < 16 || expected !== presented) {
    return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
      status: 403, headers: { 'content-type': 'application/json' },
    });
  }
  const srk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, srk);
  const { error } = await supabase.rpc('bootstrap_cron_vault', {
    p_service_role_key: srk,
    p_internal_edge_secret: expected,
  });
  return new Response(JSON.stringify({ ok: !error, error: error?.message ?? null, secret_len: expected.length }), {
    headers: { 'content-type': 'application/json' },
    status: error ? 500 : 200,
  });
});
