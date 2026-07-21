import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'
import { hashPassword } from "../_shared/password.ts"
import { createCorsHeaders } from "../_shared/auth.ts"
import { verifyResetToken, MAX_RESET_ATTEMPTS } from "../_shared/resetTokens.ts"

Deno.serve(async (req) => {
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

    // Verify the OTP with attempt limiting (ABUSE-003). Failed attempts
    // increment a counter; at the limit the token is invalidated. Comparison
    // supports hashed-at-rest tokens with legacy plaintext dual-read.
    const checkOtp = async (): Promise<{ ok: boolean; userId?: string; error?: string }> => {
      const { data: portalUser } = await supabase
        .from('finance_portal_users')
        .select('id, reset_token, reset_token_expires_at, reset_token_attempts')
        .eq('email', normalizedEmail)
        .maybeSingle()

      if (!portalUser || !portalUser.reset_token) {
        return { ok: false, error: 'Invalid code' }
      }
      if ((portalUser.reset_token_attempts || 0) >= MAX_RESET_ATTEMPTS) {
        await supabase
          .from('finance_portal_users')
          .update({ reset_token: null, reset_token_expires_at: null })
          .eq('id', portalUser.id)
        return { ok: false, error: 'Too many attempts. Please request a new code.' }
      }
      if (!portalUser.reset_token_expires_at || new Date(portalUser.reset_token_expires_at) < new Date()) {
        return { ok: false, error: 'Code has expired. Please request a new one.' }
      }
      const valid = await verifyResetToken(portalUser.reset_token, otp)
      if (!valid) {
        await supabase
          .from('finance_portal_users')
          .update({ reset_token_attempts: (portalUser.reset_token_attempts || 0) + 1 })
          .eq('id', portalUser.id)
        return { ok: false, error: 'Invalid code' }
      }
      return { ok: true, userId: portalUser.id }
    }

    if (action === 'verify_otp') {
      if (!otp) {
        return new Response(
          JSON.stringify({ error: 'OTP is required', success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const result = await checkOtp()
      if (!result.ok) {
        return new Response(
          JSON.stringify({ error: result.error, success: false }),
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
      const result = await checkOtp()
      if (!result.ok) {
        return new Response(
          JSON.stringify({ error: result.error, success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const hashedPassword = await hashPassword(new_password);
      await supabase
        .from('finance_portal_users')
        .update({
          password_hash: hashedPassword,
          must_change_password: false,
          reset_token: null,
          reset_token_expires_at: null,
          // Invalidate any active session
          session_token: null,
          session_expires_at: null,
          failed_login_attempts: 0,
          locked_until: null,
          reset_token_attempts: 0,
        })
        .eq('id', result.userId)

      await supabase.from('finance_portal_activity_log').insert({
        finance_user_id: result.userId,
        actor_user_id: result.userId,
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
