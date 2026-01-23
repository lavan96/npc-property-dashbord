import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'
import { verifyPassword, isLegacyPassword, hashPassword } from "../_shared/password.ts"
import { createCorsHeaders, createSessionCookie } from "../_shared/auth.ts"
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

    const { username, password } = await req.json()

    if (!username || !password) {
      return new Response(
        JSON.stringify({ error: 'Username and password are required' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Query custom_users table for the user
    const { data: user, error: userError } = await supabase
      .from('custom_users')
      .select('*')
      .eq('username', username)
      .eq('is_active', true)
      .single()

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid username or password' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate password using bcrypt (with legacy plaintext fallback)
    const isValid = await verifyPassword(password, user.password_hash);
    
    if (!isValid) {
      console.log(`Login failed for user ${username}: incorrect password`);
      return new Response(
        JSON.stringify({ error: 'Invalid username or password' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If using legacy plaintext password, upgrade to bcrypt hash
    if (isLegacyPassword(user.password_hash)) {
      console.log(`Upgrading password hash for user ${username}`);
      const hashedPassword = await hashPassword(password);
      await supabase
        .from('custom_users')
        .update({ 
          password_hash: hashedPassword,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
    }

    console.log(`Login successful for user ${username}`);

    // Generate session token
    const sessionToken = crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24) // 24 hour session

    // Create session
    const { error: sessionError } = await supabase
      .from('user_sessions')
      .insert({
        user_id: user.id,
        session_token: sessionToken,
        expires_at: expiresAt.toISOString()
      })

    if (sessionError) {
      console.error('Session creation error:', sessionError)
      return new Response(
        JSON.stringify({ error: 'Failed to create session' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Clean up expired sessions
    await supabase.rpc('cleanup_expired_sessions')

    // Fetch user roles from user_roles table
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)

    const roles = userRoles?.map(r => r.role) || []

    // Generate Supabase-compatible JWT for RLS
    let accessToken: string | null = null;
    try {
      accessToken = await generateSupabaseJWT(user.id, 86400, {
        email: user.email,
        roles: roles,
        userMetadata: {
          username: user.username,
          custom_role: user.role,
        },
      });
      console.log(`Generated JWT for user ${username}`);
    } catch (jwtError) {
      console.error('JWT generation failed:', jwtError);
      // Continue without JWT - session cookie still works for edge functions
    }

    // Create HttpOnly session cookie
    const sessionCookie = createSessionCookie(sessionToken, expiresAt);

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        },
        roles,
        access_token: accessToken,  // Supabase-compatible JWT
        expires_at: expiresAt.toISOString()
      }),
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Set-Cookie': sessionCookie
        } 
      }
    )

  } catch (error) {
    console.error('Login error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
