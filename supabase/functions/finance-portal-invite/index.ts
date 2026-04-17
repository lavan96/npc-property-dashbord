import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'
import { createCorsHeaders, verifyAuth } from "../_shared/auth.ts"

const INVITE_EXPIRY_HOURS = 72;

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
    const configuredAppUrl = Deno.env.get('APP_URL')?.trim()
    const fallbackAppUrl = 'https://npc-property-dashbord.lovable.app'
    const appUrl = configuredAppUrl && !configuredAppUrl.includes('preview--') && !configuredAppUrl.includes('localhost')
      ? configuredAppUrl.replace(/\/+$/, '')
      : fallbackAppUrl
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const body = await req.json()
    const { action, finance_contact_id, resend_invite } = body

    // Admin auth required for all operations
    const auth = await verifyAuth(supabase, req.headers, body)
    if (auth.error || !auth.userId) {
      return new Response(
        JSON.stringify({ error: 'Admin authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // === CHECK STATUS ===
    if (action === 'check_status') {
      if (!finance_contact_id) {
        return new Response(
          JSON.stringify({ error: 'finance_contact_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const { data: portalUser } = await supabase
        .from('finance_portal_users')
        .select('id, email, is_active, revoked_at, invite_sent_at, invite_accepted_at, invite_token_expires_at, last_login_at, has_accepted_terms')
        .eq('finance_contact_id', finance_contact_id)
        .maybeSingle()

      return new Response(
        JSON.stringify({
          success: true,
          portal_user: portalUser,
          has_portal_access: !!portalUser && portalUser.is_active && !portalUser.revoked_at && !!portalUser.invite_accepted_at,
          is_invited: !!portalUser && !portalUser.invite_accepted_at,
          is_revoked: !!portalUser?.revoked_at,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // === REVOKE ===
    if (action === 'revoke') {
      if (!finance_contact_id) {
        return new Response(
          JSON.stringify({ error: 'finance_contact_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const adminUserId = auth.userId === 'service_role' ? null : auth.userId;
      const { data: updated } = await supabase
        .from('finance_portal_users')
        .update({
          is_active: false,
          revoked_at: new Date().toISOString(),
          revoked_by: adminUserId,
          session_token: null,
          session_expires_at: null,
        })
        .eq('finance_contact_id', finance_contact_id)
        .select('id')
        .maybeSingle()

      if (updated) {
        await supabase.from('finance_portal_activity_log').insert({
          finance_user_id: updated.id,
          actor_user_id: adminUserId,
          actor_type: 'admin',
          action: 'access_revoked',
          entity_type: 'finance_portal_user',
          entity_id: updated.id,
        });
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Portal access revoked' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // === REINSTATE ===
    if (action === 'reinstate') {
      if (!finance_contact_id) {
        return new Response(
          JSON.stringify({ error: 'finance_contact_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const { data: updated } = await supabase
        .from('finance_portal_users')
        .update({
          is_active: true,
          revoked_at: null,
          revoked_by: null,
        })
        .eq('finance_contact_id', finance_contact_id)
        .select('id')
        .maybeSingle()

      if (updated) {
        const adminUserId = auth.userId === 'service_role' ? null : auth.userId;
        await supabase.from('finance_portal_activity_log').insert({
          finance_user_id: updated.id,
          actor_user_id: adminUserId,
          actor_type: 'admin',
          action: 'access_reinstated',
          entity_type: 'finance_portal_user',
          entity_id: updated.id,
        });
      }
      return new Response(
        JSON.stringify({ success: true, message: 'Portal access reinstated' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // === SEND INVITE ===
    if (!finance_contact_id) {
      return new Response(
        JSON.stringify({ error: 'finance_contact_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Resolve finance contact
    const { data: contact, error: contactError } = await supabase
      .from('finance_agent_contacts')
      .select('id, name, email, company, contact_type, is_active')
      .eq('id', finance_contact_id)
      .maybeSingle()

    if (contactError || !contact) {
      return new Response(
        JSON.stringify({ error: 'Finance contact not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!contact.is_active) {
      return new Response(
        JSON.stringify({ error: 'Cannot invite an inactive finance contact. Please activate the contact first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!contact.email) {
      return new Response(
        JSON.stringify({ error: 'Finance contact has no email address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const normalizedEmail = contact.email.toLowerCase().trim();

    // Check existing portal user
    const { data: existingUser } = await supabase
      .from('finance_portal_users')
      .select('id, is_active, invite_accepted_at, revoked_at')
      .eq('finance_contact_id', finance_contact_id)
      .maybeSingle()

    const inviteToken = crypto.randomUUID() + '-' + crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + INVITE_EXPIRY_HOURS)
    const adminUserId = auth.userId === 'service_role' ? null : auth.userId;

    if (existingUser) {
      if (existingUser.invite_accepted_at && existingUser.is_active && !existingUser.revoked_at && !resend_invite) {
        return new Response(
          JSON.stringify({ error: 'This finance contact already has active portal access', already_active: true }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      // Reset / refresh invite
      await supabase
        .from('finance_portal_users')
        .update({
          email: normalizedEmail,
          invite_token: inviteToken,
          invite_token_expires_at: expiresAt.toISOString(),
          invite_sent_at: new Date().toISOString(),
          // Re-accepting invite reactivates and clears revocation
          is_active: true,
          revoked_at: null,
          revoked_by: null,
          // Clear any stale auth state
          session_token: null,
          session_expires_at: null,
          failed_login_attempts: 0,
          locked_until: null,
          // For resend, keep invite_accepted_at as-is so existing users don't lose acceptance
          ...(existingUser.invite_accepted_at ? {} : {
            password_hash: null,
            has_accepted_terms: false,
            terms_accepted_at: null,
            has_completed_onboarding: false,
          }),
        })
        .eq('id', existingUser.id)
    } else {
      const { error: insertError } = await supabase
        .from('finance_portal_users')
        .insert({
          finance_contact_id: contact.id,
          email: normalizedEmail,
          password_hash: null,
          is_active: true,
          invite_token: inviteToken,
          invite_token_expires_at: expiresAt.toISOString(),
          invite_sent_at: new Date().toISOString(),
          invited_by: adminUserId,
        })
      if (insertError) {
        console.error('[finance-portal-invite] Insert failed:', insertError)
        return new Response(
          JSON.stringify({ error: 'Failed to create portal invite', details: insertError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    const inviteLink = `${appUrl}/finance/accept-invite?token=${encodeURIComponent(inviteToken)}`

    let emailSent = false;
    if (resendApiKey) {
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
            subject: 'You\'re Invited to the NPC Finance Portal',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; background: #ffffff;">
                <div style="text-align: center; margin-bottom: 32px;">
                  <h1 style="color: #0D264D; font-size: 24px; margin: 0;">Welcome to the Finance Portal</h1>
                </div>
                <p style="color: #555; font-size: 16px; line-height: 1.6;">Hi ${contact.name},</p>
                <p style="color: #555; font-size: 16px; line-height: 1.6;">
                  You've been invited to access the NPC Finance Portal. From there you can manage assigned client financial profiles —
                  property valuations, purchase prices, and other key data points.
                </p>
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${inviteLink}"
                     style="display: inline-block; background: #BF9B50; color: #0D264D; padding: 14px 32px;
                            border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: 700;">
                    Set Up Your Account
                  </a>
                </div>
                <p style="color: #888; font-size: 14px; line-height: 1.5;">
                  This invitation expires in ${INVITE_EXPIRY_HOURS} hours. If you didn't expect this, you can safely ignore this email.
                </p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
                <p style="color: #aaa; font-size: 12px; text-align: center;">
                  NPC Services — Property Investment Advisory
                </p>
              </div>
            `,
          }),
        })
        if (emailRes.ok) {
          emailSent = true;
          console.log(`[finance-portal-invite] Email sent to ${normalizedEmail}`)
        } else {
          console.error('[finance-portal-invite] Resend failed:', await emailRes.text())
        }
      } catch (err) {
        console.error('[finance-portal-invite] Email error:', err)
      }
    }

    // Activity log
    const { data: portalUserRow } = await supabase
      .from('finance_portal_users')
      .select('id')
      .eq('finance_contact_id', finance_contact_id)
      .maybeSingle()

    if (portalUserRow) {
      await supabase.from('finance_portal_activity_log').insert({
        finance_user_id: portalUserRow.id,
        actor_user_id: adminUserId,
        actor_type: 'admin',
        action: existingUser ? 'invite_resent' : 'invite_sent',
        entity_type: 'finance_portal_user',
        entity_id: portalUserRow.id,
        metadata: { email: normalizedEmail, expires_at: expiresAt.toISOString() },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: emailSent ? `Invite sent to ${normalizedEmail}` : 'Invite created — copy the link manually',
        invite_link: inviteLink,
        email_sent: emailSent,
        expires_at: expiresAt.toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('Finance portal invite error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error?.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
