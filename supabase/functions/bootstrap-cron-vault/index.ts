// Bootstrap Vault with secrets pg_cron needs to authenticate to fail-closed edge functions.
// Restricted: only callable by superadmin from the Command Centre (verifies session).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
  const INTERNAL_EDGE_SECRET = Deno.env.get('INTERNAL_EDGE_SECRET');

  if (!INTERNAL_EDGE_SECRET) {
    return new Response(JSON.stringify({ error: 'INTERNAL_EDGE_SECRET not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Require an authenticated superadmin caller.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace('Bearer ', '');
  const { data: claims, error: claimsError } = await userClient.auth.getClaims(token);
  if (claimsError || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: isSuper, error: roleErr } = await admin.rpc('has_role', {
    _user_id: claims.claims.sub,
    _role: 'superadmin',
  });
  if (roleErr || !isSuper) {
    return new Response(JSON.stringify({ error: 'Forbidden — superadmin required' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { error } = await admin.rpc('bootstrap_cron_vault', {
    p_service_role_key: SERVICE_ROLE,
    p_internal_edge_secret: INTERNAL_EDGE_SECRET,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, stored: ['supabase_service_role_key', 'internal_edge_secret', 'supabase_url'] }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
