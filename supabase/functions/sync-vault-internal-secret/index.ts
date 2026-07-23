// One-shot admin utility (delete after cutover): syncs Vault
// `internal_edge_secret` + `supabase_service_role_key` to the edge-function
// environment values. Read-only response (only echoes secret lengths); safe to
// invoke anonymously because it never accepts or reveals a secret value —
// it only re-copies edge env into vault so pg_cron's signer matches receivers.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, apikey, content-type',
        'access-control-allow-methods': 'POST, OPTIONS',
      },
    });
  }
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });
  const ies = (Deno.env.get('INTERNAL_EDGE_SECRET') || '').trim();
  const srk = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  if (ies.length < 16 || srk.length < 16) {
    return new Response(JSON.stringify({ ok: false, error: 'env_missing' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, srk);
  const { error } = await supabase.rpc('bootstrap_cron_vault', {
    p_service_role_key: srk,
    p_internal_edge_secret: ies,
  });
  return new Response(JSON.stringify({
    ok: !error,
    error: error?.message ?? null,
    ies_len: ies.length,
    srk_len: srk.length,
  }), {
    headers: { 'content-type': 'application/json' },
    status: error ? 500 : 200,
  });
});
