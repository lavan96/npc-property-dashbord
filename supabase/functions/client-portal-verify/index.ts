import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'
import { extractSessionToken, createCorsHeaders } from "../_shared/auth.ts"

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Extract session token
    let sessionToken: string | null = null;
    try {
      const body = await req.json();
      sessionToken = body?.portal_session_token || extractPortalSessionToken(req.headers, body);
    } catch {
      sessionToken = extractPortalSessionToken(req.headers);
    }

    if (!sessionToken) {
      return new Response(
        JSON.stringify({ error: 'Session token is required', valid: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check session validity
    const { data: session, error: sessionError } = await supabase
      .from('client_portal_sessions')
      .select(`
        *,
        client_portal_users:user_id (
          id,
          client_id,
          email,
          status,
          clients:client_id (id, primary_first_name, primary_surname, primary_email)
        )
      `)
      .eq('session_token', sessionToken)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (sessionError || !session || !session.client_portal_users || session.client_portal_users.status !== 'active') {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session', valid: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const portalUser = session.client_portal_users as any;
    const clientData = portalUser.clients as any;

    return new Response(
      JSON.stringify({
        valid: true,
        user: {
          id: portalUser.id,
          client_id: portalUser.client_id,
          email: portalUser.email,
          name: clientData ? `${clientData.primary_first_name || ''} ${clientData.primary_surname || ''}`.trim() : portalUser.email,
        },
        session_token: sessionToken,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Client portal verify error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', valid: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Extract portal session token from headers/body
 * Uses x-portal-session-token header and portal_session_token body field
 */
function extractPortalSessionToken(headers: Headers, body?: any): string | null {
  // Check custom header
  const headerToken = headers.get('x-portal-session-token');
  if (headerToken) return headerToken;

  // Check body
  if (body?.portal_session_token) return body.portal_session_token;

  // Fall back to general session token extraction
  const sessionHeader = headers.get('x-session-token');
  if (sessionHeader) return sessionHeader;
  if (body?.session_token) return body.session_token;

  return null;
}
