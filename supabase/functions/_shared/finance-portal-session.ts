/**
 * Shared helper for finance portal session resolution.
 * Returns the validated portal user or throws via a Response thunk.
 */
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.55.0";

export function extractFinanceToken(headers: Headers, body?: any): string | null {
  return headers.get('x-finance-session-token')
    || body?.finance_session_token
    || headers.get('x-session-token')
    || body?.session_token
    || null;
}

export function makeServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

export async function resolveFinancePartner(supabase: SupabaseClient, token: string | null) {
  if (!token) return { error: 'Session token required', status: 401 };
  const { data: portalUser } = await supabase
    .from('finance_portal_users')
    .select('id, email, full_name, is_active, revoked_at, session_expires_at, global_permissions')
    .eq('session_token', token)
    .maybeSingle();
  if (!portalUser || !portalUser.is_active || portalUser.revoked_at) {
    return { error: 'Invalid session', status: 401 };
  }
  if (!portalUser.session_expires_at || new Date(portalUser.session_expires_at) < new Date()) {
    return { error: 'Session expired', status: 401 };
  }
  return { portalUser };
}
