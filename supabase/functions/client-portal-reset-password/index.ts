import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'
import { hashPassword } from "../_shared/password.ts"
import { createCorsHeaders } from "../_shared/auth.ts"

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

    const { action, email, otp, new_password } = await req.json()

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (action === 'verify_otp') {
      if (!otp) {
        return new Response(
          JSON.stringify({ error: 'OTP is required', success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: portalUser } = await supabase
        .from('client_portal_users')
        .select('id, password_reset_token, password_reset_expires_at')
        .eq('email', normalizedEmail)
        .maybeSingle()

      if (!portalUser || portalUser.password_reset_token !== otp) {
        return new Response(
          JSON.stringify({ error: 'Invalid code', success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (new Date(portalUser.password_reset_expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ error: 'Code has expired. Please request a new one.', success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'reset_password') {
      if (!otp || !new_password) {
        return new Response(
          JSON.stringify({ error: 'OTP and new password are required', success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Validate password length
      if (new_password.length < 8) {
        return new Response(
          JSON.stringify({ error: 'Password must be at least 8 characters', success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: portalUser } = await supabase
        .from('client_portal_users')
        .select('id, password_reset_token, password_reset_expires_at')
        .eq('email', normalizedEmail)
        .maybeSingle()

      if (!portalUser || portalUser.password_reset_token !== otp) {
        return new Response(
          JSON.stringify({ error: 'Invalid code', success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (new Date(portalUser.password_reset_expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ error: 'Code has expired', success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Hash new password and update
      const hashedPassword = await hashPassword(new_password);
      await supabase
        .from('client_portal_users')
        .update({
          password_hash: hashedPassword,
          password_reset_token: null,
          password_reset_expires_at: null,
        })
        .eq('id', portalUser.id)

      // Invalidate all existing sessions for security
      await supabase
        .from('client_portal_sessions')
        .delete()
        .eq('user_id', portalUser.id)

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Client portal reset password error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
