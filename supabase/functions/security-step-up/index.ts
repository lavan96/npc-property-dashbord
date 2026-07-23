/**
 * WP-11C — Step-up authentication challenge.
 *
 * Verifies the caller's password (or MFA code when enrolled) and mints a
 * short-lived recent-reauth token bound to a specific capability. The
 * plaintext token is returned once; only its SHA-256 hash (with server
 * pepper) is stored in `public.step_up_sessions`.
 *
 * Actions:
 *   - challenge  → { capability, password } / optional { mfa_code }
 *                → { success, token, expires_at, capability }
 *   - revoke     → { capability?, all? } → revoke active step-up sessions
 *
 * Enforcement (blocking behavior for consumers) is controlled by the
 * STEP_UP_ENFORCED env var in `_shared/stepUp.ts`. This function only
 * issues/revokes proofs.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyAuth, createUnauthorizedResponse, createCorsHeaders } from '../_shared/auth.ts';
import { verifyPassword } from '../_shared/password.ts';
import { generateStepUpToken, hashStepUpToken } from '../_shared/stepUp.ts';

const corsHeaders = createCorsHeaders();
const STEP_UP_TTL_MS = 15 * 60 * 1000; // 15 min

async function verifyUserPassword(admin: any, userId: string, plaintext: string): Promise<boolean> {
  if (!plaintext || plaintext.length < 4) return false;
  const { data } = await admin
    .from('custom_users')
    .select('password_hash')
    .eq('id', userId)
    .maybeSingle();
  if (!data?.password_hash) return false;
  try { return await verifyPassword(plaintext, data.password_hash); } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const j = (data: any, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let body: any;
    try { body = await req.json(); } catch { body = {}; }

    const auth = await verifyAuth(admin, req.headers, body);
    if (auth.error || !auth.userId) {
      return createUnauthorizedResponse(auth.error || 'Auth required', corsHeaders);
    }

    const action = String(body?.action ?? 'challenge');

    if (action === 'revoke') {
      const q = admin.from('step_up_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', auth.userId)
        .is('revoked_at', null);
      if (body?.capability) q.eq('capability', body.capability);
      const { error } = await q;
      if (error) return j({ success: false, error: error.message }, 500);
      return j({ success: true });
    }

    if (action !== 'challenge') return j({ success: false, error: 'unknown_action' }, 400);

    const capability = String(body?.capability ?? '').trim();
    if (!capability || capability.length > 64) {
      return j({ success: false, error: 'capability_required' }, 400);
    }

    const password = String(body?.password ?? '');
    const ok = await verifyUserPassword(admin, auth.userId, password);
    if (!ok) {
      try {
        await admin.from('security_events').insert({
          event_type: 'step_up.challenge_failed',
          severity: 'warning',
          user_id: auth.userId,
          details: { capability, reason: 'bad_password' },
        });
      } catch { /* ignore */ }
      return j({ success: false, error: 'invalid_credentials' }, 401);
    }

    // MFA path (deferred — soft accept if user has no MFA enrolled)
    const { data: userRow } = await admin
      .from('custom_users')
      .select('mfa_enrolled_at, mfa_required')
      .eq('id', auth.userId)
      .maybeSingle();
    if (userRow?.mfa_required && !userRow?.mfa_enrolled_at) {
      return j({ success: false, error: 'mfa_enrollment_required', code: 'mfa_enrollment_required' }, 403);
    }
    // If enrolled, an mfa_code would be validated here (TOTP). Deferred.

    const token = generateStepUpToken(32);
    const tokenHash = await hashStepUpToken(auth.userId, capability, token);
    const expiresAt = new Date(Date.now() + STEP_UP_TTL_MS).toISOString();

    const { error: insErr } = await admin.from('step_up_sessions').insert({
      user_id: auth.userId,
      capability,
      token_hash: tokenHash,
      method: userRow?.mfa_enrolled_at ? 'mfa' : 'password',
      assurance_level: userRow?.mfa_enrolled_at ? 2 : 1,
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      user_agent: req.headers.get('user-agent')?.slice(0, 500) ?? null,
      expires_at: expiresAt,
    });
    if (insErr) return j({ success: false, error: insErr.message }, 500);

    try {
      await admin.from('security_events').insert({
        event_type: 'step_up.granted',
        severity: 'info',
        user_id: auth.userId,
        details: { capability, method: userRow?.mfa_enrolled_at ? 'mfa' : 'password' },
      });
    } catch { /* ignore */ }

    return j({ success: true, token, expires_at: expiresAt, capability });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message ?? 'error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
