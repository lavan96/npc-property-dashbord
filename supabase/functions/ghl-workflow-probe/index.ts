import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse, createForbiddenResponse } from '../_shared/auth.ts';
import { getGhlCredentials, buildGhlHeaders, resolveGhlAccessTokenForLocation } from '../_shared/ghl-account.ts';

Deno.serve(async (req) => {
  const cors = createCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError || !userId) return createUnauthorizedResponse(authError || 'auth', cors);
    if (userId !== 'service_role') {
      const { data: r } = await supabase.from('user_roles').select('role').eq('user_id', userId);
      if (!(r || []).some((x: any) => x.role === 'superadmin')) return createForbiddenResponse('superadmin only', cors);
    }
    const account = (body.account || 'legacy') as 'legacy' | 'new';
    const wfId = String(body.workflow_id || '');
    const creds = getGhlCredentials(account);
    const tok = await resolveGhlAccessTokenForLocation(creds);
    const h = buildGhlHeaders(tok.accessToken);
    const eps = [
      `/workflows/${wfId}?locationId=${creds.locationId}`,
      `/workflows/${wfId}`,
      `/workflows/${wfId}/triggers?locationId=${creds.locationId}`,
      `/workflows/${wfId}/actions?locationId=${creds.locationId}`,
      `/workflows/${wfId}/steps?locationId=${creds.locationId}`,
      `/workflows/${wfId}/version?locationId=${creds.locationId}`,
      `/workflows/${wfId}/versions?locationId=${creds.locationId}`,
      `/workflows/${wfId}/detail?locationId=${creds.locationId}`,
      `/workflows/${wfId}/details?locationId=${creds.locationId}`,
      `/workflows/?locationId=${creds.locationId}&workflowId=${wfId}`,
    ];
    const results: any[] = [];
    for (const ep of eps) {
      const r = await fetch('https://services.leadconnectorhq.com' + ep, { headers: h });
      const t = await r.text();
      results.push({ ep, status: r.status, body: t.substring(0, 600) });
    }
    return new Response(JSON.stringify({ results }, null, 2), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
});
