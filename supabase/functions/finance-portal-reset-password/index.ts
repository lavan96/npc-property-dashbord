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
        .from('finance_portal_users')
        .select('id, reset_token, reset_token_expires_at')
        .eq('email', normalizedEmail)
        .maybeSingle()

      if (!portalUser || portalUser.reset_token !== otp) {
        return new Response(
          JSON.stringify({ error: 'Invalid code', success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (!portalUser.reset_token_expires_at || new Date(portalUser.reset_token_expires_at) < new Date()) {
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
      if (new_password.length < 8) {
        return new Response(
          JSON.stringify({ error: 'Password must be at least 8 characters', success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const { data: portalUser } = await supabase
        .from('finance_portal_users')
        .select('id, reset_token, reset_token_expires_at')
        .eq('email', normalizedEmail)
        .maybeSingle()

      if (!portalUser || portalUser.reset_token !== otp) {
        return new Response(
          JSON.stringify({ error: 'Invalid code', success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (!portalUser.reset_token_expires_at || new Date(portalUser.reset_token_expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ error: 'Code has expired', success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const hashedPassword = await hashPassword(new_password);
      await supabase
        .from('finance_portal_users')
        .update({
          password_hash: hashedPassword,
          reset_token: null,
          reset_token_expires_at: null,
          // Invalidate any active session
          session_token: null,
          session_expires_at: null,
          failed_login_attempts: 0,
          locked_until: null,
        })
        .eq('id', portalUser.id)

      await supabase.from('finance_portal_activity_log').insert({
        finance_user_id: portalUser.id,
        actor_user_id: portalUser.id,
        actor_type: 'finance_user',
        action: 'password_reset_completed',
        entity_type: 'auth',
      });

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('Finance portal reset password error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
