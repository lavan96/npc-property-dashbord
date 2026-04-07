import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'
import { extractSessionToken, verifyAuth, createCorsHeaders } from "../_shared/auth.ts"
import { generateSupabaseJWT } from "../_shared/jwt.ts"

serve(async (req) => {
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
    try {
      const body = await req.json();
      sessionToken = extractSessionToken(req.headers, body);
    } catch {
      // If body parsing fails, try to extract from headers/cookies only
      sessionToken = extractSessionToken(req.headers);
    }

    if (!sessionToken) {
      // No session token found — try JWT-based authentication as fallback
      // This handles users whose session token was lost/stale but still have a valid JWT
      console.log('[custom-auth-verify] No session token, attempting JWT fallback...');
      
      const { error: jwtError, userId: jwtUserId, username: jwtUsername, authMethod } = await verifyAuth(
        supabase,
        req.headers,
        {} // empty body since we already parsed it
      );
      
      if (jwtError || !jwtUserId || authMethod !== 'jwt') {
        console.log('[custom-auth-verify] JWT fallback failed:', jwtError || 'no valid JWT');
        return new Response(
          JSON.stringify({ error: 'Session token is required', valid: false }), 
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // JWT is valid — fetch user data and create a fresh session
      console.log('[custom-auth-verify] JWT fallback succeeded for user:', jwtUserId.substring(0, 8) + '...');
      
      const { data: jwtUser } = await supabase
        .from('custom_users')
        .select('id, username, role, is_active')
        .eq('id', jwtUserId)
        .maybeSingle();
      
      if (!jwtUser || !jwtUser.is_active) {
        return new Response(
          JSON.stringify({ error: 'User not found or inactive', valid: false }), 
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // Create a fresh session for this user so subsequent calls work
      const newSessionToken = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);
      
      await supabase
        .from('user_sessions')
        .insert({
          user_id: jwtUser.id,
          session_token: newSessionToken,
          expires_at: expiresAt.toISOString()
        });
      
      // Fetch roles
      const { data: jwtUserRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', jwtUser.id);
      
      const jwtRoles = jwtUserRoles?.map(r => r.role) || [];
      
      // Generate fresh JWT
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
      
      return new Response(
        JSON.stringify({
          valid: true,
          user: { id: jwtUser.id, username: jwtUser.username, role: jwtUser.role },
          roles: jwtRoles,
          access_token: freshAccessToken,
          session_token: newSessionToken, // Client will persist this for future calls
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if session exists and is valid
    const { data: session, error: sessionError } = await supabase
      .from('user_sessions')
      .select(`
        *,
        custom_users:user_id (
          id,
          username,
          role,
          is_active
        )
      `)
      .eq('session_token', sessionToken)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (sessionError || !session || !session.custom_users?.is_active) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session', valid: false }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch user roles from user_roles table
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.custom_users.id)

    const roles = userRoles?.map(r => r.role) || []

    // Generate fresh Supabase-compatible JWT for RLS
    let accessToken: string | null = null;
    try {
      accessToken = await generateSupabaseJWT(session.custom_users.id, 86400, {
        roles: roles,
        userMetadata: {
          username: session.custom_users.username,
          custom_role: session.custom_users.role,
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
          id: session.custom_users.id,
          username: session.custom_users.username,
          role: session.custom_users.role
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
