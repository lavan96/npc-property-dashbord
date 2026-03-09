import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'
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
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { email } = await req.json()

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Look up portal user
    const { data: portalUser } = await supabase
      .from('client_portal_users')
      .select('id, email, status, clients:client_id (primary_first_name)')
      .eq('email', normalizedEmail)
      .maybeSingle()

    // Always return success to prevent email enumeration
    if (!portalUser || portalUser.status === 'disabled') {
      console.log(`Password reset requested for unknown/disabled email: ${normalizedEmail}`)
      return new Response(
        JSON.stringify({ success: true, message: 'If an account exists with this email, a reset link has been sent.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate reset token (6-digit OTP)
    const resetToken = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15); // 15 min expiry

    // Store reset token
    await supabase
      .from('client_portal_users')
      .update({
        password_reset_token: resetToken,
        password_reset_expires_at: expiresAt.toISOString()
      })
      .eq('id', portalUser.id)

    // Send email via Resend if configured
    if (resendApiKey) {
      const clientName = (portalUser.clients as any)?.primary_first_name || 'there';
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: 'NPC Services <noreply@npcservices.com.au>',
            to: [normalizedEmail],
            subject: 'Password Reset Code - Client Portal',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
                <h2 style="color: #1a1a1a; margin-bottom: 16px;">Password Reset</h2>
                <p style="color: #555;">Hi ${clientName},</p>
                <p style="color: #555;">You requested a password reset for your client portal account. Use this code to reset your password:</p>
                <div style="background: #f4f4f4; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
                  <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a;">${resetToken}</span>
                </div>
                <p style="color: #888; font-size: 14px;">This code expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
              </div>
            `,
          }),
        });

        if (!emailRes.ok) {
          const errData = await emailRes.text();
          console.error('Resend email failed:', errData);
        } else {
          console.log(`Password reset email sent to ${normalizedEmail}`);
        }
      } catch (emailErr) {
        console.error('Failed to send reset email:', emailErr);
      }
    } else {
      console.warn('RESEND_API_KEY not configured - reset token generated but email not sent');
      console.log(`Reset token for ${normalizedEmail}: ${resetToken}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'If an account exists with this email, a reset link has been sent.' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Client portal forgot password error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
