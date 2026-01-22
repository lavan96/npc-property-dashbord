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
      return new Response(
        JSON.stringify({ error: 'Session token is required', valid: false }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    return new Response(
      JSON.stringify({ 
        valid: true, 
        user: {
          id: session.custom_users.id,
          username: session.custom_users.username,
          role: session.custom_users.role
        },
        roles
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
