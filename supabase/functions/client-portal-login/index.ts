import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'
import { verifyPassword } from "../_shared/password.ts"
import { createCorsHeaders, createSessionCookie } from "../_shared/auth.ts"

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

    const { email, password, turnstile_token } = await req.json()

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify Turnstile CAPTCHA token
    const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY')
    if (turnstileSecret) {
      if (!turnstile_token) {
        return new Response(
          JSON.stringify({ error: 'Security verification required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: turnstileSecret, response: turnstile_token }),
      })
      const verifyData = await verifyRes.json()
      if (!verifyData.success) {
        return new Response(
          JSON.stringify({ error: 'Security verification failed. Please try again.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Query client_portal_users
    const { data: portalUser, error: userError } = await supabase
      .from('client_portal_users')
      .select('*, clients:client_id (id, primary_first_name, primary_surname, primary_email)')
      .eq('email', email.toLowerCase().trim())
      .eq('status', 'active')
      .maybeSingle()

    if (userError || !portalUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid email or password' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify password
    const isValid = await verifyPassword(password, portalUser.password_hash)
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: 'Invalid email or password' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate session
    const sessionToken = crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)

    const { error: sessionError } = await supabase
      .from('client_portal_sessions')
      .insert({
        user_id: portalUser.id,
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

    // Update last login
    await supabase
      .from('client_portal_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', portalUser.id)

    // Cleanup expired sessions
    await supabase.rpc('cleanup_expired_portal_sessions')

    const clientData = portalUser.clients as any;
    const sessionCookie = createSessionCookie(sessionToken, expiresAt)

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: portalUser.id,
          client_id: portalUser.client_id,
          email: portalUser.email,
          name: clientData ? `${clientData.primary_first_name || ''} ${clientData.primary_surname || ''}`.trim() : portalUser.email,
        },
        session_token: sessionToken,
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
    console.error('Client portal login error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
