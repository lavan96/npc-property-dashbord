import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'
import { extractSessionToken, verifyAuth, verifySession, createCorsHeaders } from "../_shared/auth.ts"
import { generateSupabaseJWT } from "../_shared/jwt.ts"
import { hashSessionToken, isSessionHashConfigured, computeIdleExpiry } from "../_shared/sessionHash.ts"

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Try to get session token from body for backwards compatibility
    let sessionToken: string | null = null;
    let parsedBody: any = {};
    try {
      parsedBody = await req.json();
      sessionToken = extractSessionToken(req.headers, parsedBody);
    } catch {
      // If body parsing fails, try to extract from headers/cookies only
      sessionToken = extractSessionToken(req.headers);
    }
    
    // Normalize: treat empty strings, "null", "undefined" as null
    if (!sessionToken || sessionToken === 'null' || sessionToken === 'undefined') {
      sessionToken = null;
    }

    // Helper: attempt JWT-based fallback authentication when session token is missing or invalid
    const tryJwtFallback = async (reason: string) => {
      console.log(`[custom-auth-verify] ${reason}, attempting JWT fallback...`);

      const { error: jwtError, userId: jwtUserId, authMethod } = await verifyAuth(
        supabase,
        req.headers,
        {}
      );

      if (jwtError || !jwtUserId || authMethod !== 'jwt') {
        console.log('[custom-auth-verify] JWT fallback failed:', jwtError || 'no valid JWT');
        return null;
      }

      const { data: jwtUser } = await supabase
        .from('custom_users')
        .select('id, username, role, is_active')
        .eq('id', jwtUserId)
        .maybeSingle();

      if (!jwtUser || !jwtUser.is_active) {
        console.log('[custom-auth-verify] JWT user not found or inactive');
        return null;
      }

      const newSessionToken = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const newTokenHash = isSessionHashConfigured() ? await hashSessionToken(newSessionToken) : null;
      await supabase.from('user_sessions').insert({
        user_id: jwtUser.id,
        session_token: newSessionToken,
        token_hash: newTokenHash,
        idle_expires_at: computeIdleExpiry().toISOString(),
        expires_at: expiresAt.toISOString(),
      });

      const { data: jwtUserRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', jwtUser.id);

      const jwtRoles = jwtUserRoles?.map((r) => r.role) || [];

      let freshAccessToken: string | null = null;
      try {
        freshAccessToken = await generateSupabaseJWT(jwtUser.id, 86400, {
          roles: jwtRoles,
          userMetadata: { username: jwtUser.username, custom_role: jwtUser.role },
        });
      } catch (e) {
        console.error('[custom-auth-verify] JWT generation failed during fallback:', e);
      }

      console.log('[custom-auth-verify] Created fresh session via JWT fallback for:', jwtUser.username);

      return {
        valid: true,
        user: { id: jwtUser.id, username: jwtUser.username, role: jwtUser.role },
        roles: jwtRoles,
        access_token: freshAccessToken,
        session_token: newSessionToken,
      };
    };

    if (!sessionToken) {
      const fallbackResult = await tryJwtFallback('No session token');
      if (fallbackResult) {
        return new Response(JSON.stringify(fallbackResult), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({ error: 'Session token is required', valid: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // WP-11A: verify through the hardened shared lifecycle — hash-first lookup,
    // revocation check, and idle-expiry (not just absolute expiry). This closes
    // the "verify checks only absolute expiry" gap and ensures a revoked or
    // idle-expired session cannot be re-validated here.
    const sessionResult = await verifySession(supabase, sessionToken);
    if (sessionResult.error || !sessionResult.userId) {
      // Session token was provided but is invalid/expired/revoked — try JWT
      // fallback before giving up.
      const fallbackResult = await tryJwtFallback('Stale/invalid session token');
      if (fallbackResult) {
        return new Response(JSON.stringify(fallbackResult), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session', valid: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: customUser } = await supabase
      .from('custom_users')
      .select('id, username, role, is_active')
      .eq('id', sessionResult.userId)
      .maybeSingle()

    if (!customUser || !customUser.is_active) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session', valid: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch user roles from user_roles table
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', customUser.id)

    const roles = userRoles?.map(r => r.role) || []

    // Generate fresh Supabase-compatible JWT for RLS
    let accessToken: string | null = null;
    try {
      accessToken = await generateSupabaseJWT(customUser.id, 86400, {
        roles: roles,
        userMetadata: {
          username: customUser.username,
          custom_role: customUser.role,
        },
      });
    } catch (jwtError) {
      console.error('JWT generation failed during verify:', jwtError);
      // Continue without JWT - session is still valid
    }

    return new Response(
      JSON.stringify({
        valid: true,
        user: {
          id: customUser.id,
          username: customUser.username,
          role: customUser.role
        },
        roles,
        access_token: accessToken,  // Supabase-compatible JWT for direct queries
        session_token: sessionToken // Fallback token for secure function calls when JWT is unavailable
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Session verification error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', valid: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
