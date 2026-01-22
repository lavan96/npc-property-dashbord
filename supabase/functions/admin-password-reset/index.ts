import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hashPassword } from "../_shared/password.ts";
import { validatePasswordStrength } from "../_shared/passwordValidation.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple email sending via Resend REST API
async function sendEmail(to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    return { success: false, error: "RESEND_API_KEY not configured" };
  }
  
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "NPC Admin <admin@npcservices.com.au>",
        to: [to],
        subject,
        html,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error("Resend API error:", errorData);
      return { success: false, error: errorData.message || "Failed to send email" };
    }
    
    return { success: true };
  } catch (error) {
    console.error("Email sending error:", error);
    return { success: false, error: "Failed to send email" };
  }
}

interface RequestBody {
  action: 'request_otp' | 'verify_otp' | 'reset_password';
  username?: string;
  email?: string;
  otp?: string;
  new_password?: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: RequestBody = await req.json();
    const { action } = body;

    if (action === 'request_otp') {
      const { username, email } = body;
      
      if (!username && !email) {
        return new Response(
          JSON.stringify({ success: false, error: 'Username or email required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Find user by username or email
      let query = supabase.from('custom_users').select('id, username, email, is_active');
      if (username) {
        query = query.eq('username', username);
      } else if (email) {
        query = query.eq('email', email);
      }

      const { data: user, error: userError } = await query.single();

      if (userError || !user) {
        // Don't reveal if user exists
        return new Response(
          JSON.stringify({ success: true, message: 'If the account exists, an OTP has been sent' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!user.is_active) {
        return new Response(
          JSON.stringify({ success: false, error: 'Account is deactivated' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!user.email) {
        return new Response(
          JSON.stringify({ success: false, error: 'No email associated with this account' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Invalidate existing OTPs
      await supabase
        .from('password_reset_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('used_at', null);

      // Store OTP
      const { error: insertError } = await supabase
        .from('password_reset_tokens')
        .insert({
          user_id: user.id,
          otp_code: otp,
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) {
        console.error('Failed to store OTP:', insertError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to generate OTP' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Send email via Resend using REST API
      console.log(`Attempting to send OTP email to ${user.email} for user ${user.username}`);
      
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Password Reset Request</h1>
          <p>Hello ${user.username},</p>
          <p>Your password reset OTP is:</p>
          <div style="background: #f4f4f4; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${otp}</span>
          </div>
          <p>This code expires in 10 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            This is an automated message from NPC Dashboard.
          </p>
        </div>
      `;
      
      const emailResult = await sendEmail(
        user.email,
        'Password Reset OTP - NPC Dashboard',
        emailHtml
      );

      console.log('Email send result:', JSON.stringify(emailResult));

      if (!emailResult.success) {
        console.error('Failed to send email:', emailResult.error);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to send OTP email' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`OTP sent to ${user.email} for user ${user.username}`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'OTP sent to your email',
          email_hint: user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3')
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'verify_otp') {
      const { username, otp } = body;

      if (!username || !otp) {
        return new Response(
          JSON.stringify({ success: false, error: 'Username and OTP required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Find user
      const { data: user, error: userError } = await supabase
        .from('custom_users')
        .select('id')
        .eq('username', username)
        .single();

      if (userError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid username' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify OTP
      const { data: token, error: tokenError } = await supabase
        .from('password_reset_tokens')
        .select('*')
        .eq('user_id', user.id)
        .eq('otp_code', otp)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (tokenError || !token) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid or expired OTP' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: 'OTP verified', token_id: token.id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'reset_password') {
      const { username, otp, new_password } = body;

      if (!username || !otp || !new_password) {
        return new Response(
          JSON.stringify({ success: false, error: 'Username, OTP, and new password required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate password strength
      const validation = validatePasswordStrength(new_password);
      if (!validation.isValid) {
        return new Response(
          JSON.stringify({ success: false, error: validation.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Find user
      const { data: user, error: userError } = await supabase
        .from('custom_users')
        .select('id')
        .eq('username', username)
        .single();

      if (userError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid username' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify OTP one more time
      const { data: token, error: tokenError } = await supabase
        .from('password_reset_tokens')
        .select('*')
        .eq('user_id', user.id)
        .eq('otp_code', otp)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (tokenError || !token) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid or expired OTP' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Mark OTP as used
      await supabase
        .from('password_reset_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('id', token.id);

      // Hash the new password with bcrypt
      const hashedPassword = await hashPassword(new_password);

      // Update password with bcrypt hash
      const { error: updateError } = await supabase
        .from('custom_users')
        .update({ 
          password_hash: hashedPassword,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) {
        console.error('Failed to update password:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update password' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Invalidate all sessions for this user
      await supabase
        .from('user_sessions')
        .delete()
        .eq('user_id', user.id);

      console.log(`Password reset successful for user ${username}`);
      return new Response(
        JSON.stringify({ success: true, message: 'Password reset successful' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Password reset error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
