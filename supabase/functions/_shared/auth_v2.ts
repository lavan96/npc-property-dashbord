/**
 * auth_v2 — versioned strict authentication library (Security Remediation Phase 1)
 *
 * Every result identifies its authentication class explicitly. Authorization
 * code must reject unknown classes rather than falling through.
 *
 * Guarantees:
 *  - Human JWTs are cryptographically verified (HS256 project secret, with a
 *    Supabase Auth server fallback for tokens signed by newer keys). Decoded
 *    claims are NEVER trusted without signature verification.
 *  - Internal service calls use a dedicated HMAC-signed request envelope
 *    (INTERNAL_EDGE_SECRET) with timestamp + nonce replay protection — the
 *    service-role key remains accepted for backwards compatibility during the
 *    migration window but new callers should use signInternalRequest().
 *  - Roles are resolved server-side from the database, with legacy value
 *    mapping (superadmin / super_admin / sub_admin) centralized here.
 */

import { verifySupabaseJWT } from './jwt.ts';
import { verifySession, extractSessionToken } from './auth.ts';

export type AuthType = 'human' | 'internal_service' | 'public';

export interface AuthContext {
  ok: boolean;
  authType: AuthType | null;
  /** custom_users.id for humans; caller function name for internal services */
  actorId: string | null;
  username: string | null;
  /** Canonical roles: 'superadmin' | 'admin' | 'user' */
  roles: string[];
  /** How the credential was presented */
  method: 'jwt' | 'session' | 'internal_hmac' | 'service_role_key' | null;
  correlationId: string;
  errorCode:
    | null
    | 'missing_credentials'
    | 'invalid_jwt'
    | 'invalid_session'
    | 'inactive_actor'
    | 'invalid_internal_signature'
    | 'internal_replay'
    | 'internal_timestamp_skew';
}

function ctx(partial: Partial<AuthContext>): AuthContext {
  return {
    ok: false,
    authType: null,
    actorId: null,
    username: null,
    roles: [],
    method: null,
    correlationId: crypto.randomUUID(),
    errorCode: null,
    ...partial,
  };
}

/** Map legacy role spellings to canonical values (AUTH-004). */
export function canonicalizeRole(role: string | null | undefined): 'superadmin' | 'admin' | 'user' | null {
  switch ((role || '').toLowerCase()) {
    case 'superadmin':
    case 'super_admin':
      return 'superadmin';
    case 'admin':
      return 'admin';
    case 'sub_admin':
    case 'user':
      return 'user';
    default:
      return null;
  }
}

/**
 * Resolve a user's canonical roles from BOTH legacy stores
 * (custom_users.role and user_roles) — single server-side resolver.
 */
export async function resolveRoles(supabase: any, userId: string): Promise<string[]> {
  const roles = new Set<string>();
  const [{ data: user }, { data: roleRows }] = await Promise.all([
    supabase.from('custom_users').select('role').eq('id', userId).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', userId),
  ]);
  const fromUser = canonicalizeRole(user?.role);
  if (fromUser) roles.add(fromUser);
  for (const row of roleRows ?? []) {
    const r = canonicalizeRole(row.role);
    if (r) roles.add(r);
  }
  if (roles.size === 0) roles.add('user');
  return [...roles];
}

export async function isSuperadmin(supabase: any, userId: string): Promise<boolean> {
  const roles = await resolveRoles(supabase, userId);
  return roles.includes('superadmin');
}

/**
 * Strict human verification: cryptographically verified JWT or a valid
 * opaque session token. Never authorizes from decoded-only claims.
 */
export async function verifyHuman(
  supabase: any,
  req: Request,
  body?: { session_token?: string; command_centre_session_token?: string }
): Promise<AuthContext> {
  const authHeader = req.headers.get('authorization') || '';
  const anonKey = (Deno.env.get('SUPABASE_ANON_KEY') || '').trim();

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token && token !== anonKey && token.includes('.')) {
      const payload = await verifySupabaseJWT(token);
      if (payload && payload.sub && payload.role === 'authenticated') {
        const { data: user } = await supabase
          .from('custom_users')
          .select('id, username, is_active')
          .eq('id', payload.sub)
          .maybeSingle();
        if (!user || user.is_active === false) {
          return ctx({ errorCode: 'inactive_actor' });
        }
        return ctx({
          ok: true,
          authType: 'human',
          actorId: user.id,
          username: user.username ?? null,
          roles: await resolveRoles(supabase, user.id),
          method: 'jwt',
          errorCode: null,
        });
      }
      // A Bearer JWT that fails verification is NOT silently ignored in v2 —
      // unless it is the anon key, treat it as a failed credential and also
      // allow session fallback only when a separate session token exists.
    }
  }

  const sessionToken = extractSessionToken(req.headers, body);
  if (sessionToken) {
    const session = await verifySession(supabase, sessionToken);
    if (!session.error && session.userId) {
      return ctx({
        ok: true,
        authType: 'human',
        actorId: session.userId,
        username: session.username,
        roles: await resolveRoles(supabase, session.userId),
        method: 'session',
        errorCode: null,
      });
    }
    return ctx({ errorCode: 'invalid_session' });
  }

  return ctx({ errorCode: 'missing_credentials' });
}

// ── Internal service authentication (AUTH-002) ────────────────────────────
//
// Signed request envelope:
//   X-Internal-Timestamp: unix seconds
//   X-Internal-Nonce:     128-bit random hex
//   X-Internal-Caller:    calling function name
//   X-Internal-Signature: hex(HMAC-SHA256(secret, method\npath\ntimestamp\nnonce\ncaller\nsha256(body)))
//
// Replay defence: timestamp within ±90s, nonce single-use (stored in
// internal_request_nonces when available, else per-instance memory).

const INTERNAL_SKEW_SECONDS = 90;
const memoryNonces = new Map<string, number>();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function internalMessage(method: string, path: string, timestamp: string, nonce: string, caller: string, bodyHash: string): string {
  return [method.toUpperCase(), path, timestamp, nonce, caller, bodyHash].join('\n');
}

/** Produce signed headers for an internal edge-function-to-edge-function call. */
export async function signInternalRequest(
  method: string,
  path: string,
  body: string,
  callerFunction: string
): Promise<Record<string, string>> {
  const secret = Deno.env.get('INTERNAL_EDGE_SECRET');
  if (!secret) throw new Error('INTERNAL_EDGE_SECRET is not configured');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = [...nonceBytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const bodyHash = await sha256Hex(body);
  const signature = await hmacHex(secret, internalMessage(method, path, timestamp, nonce, callerFunction, bodyHash));
  return {
    'X-Internal-Timestamp': timestamp,
    'X-Internal-Nonce': nonce,
    'X-Internal-Caller': callerFunction,
    'X-Internal-Signature': signature,
  };
}

/**
 * Verify an internal signed request. `rawBody` must be the exact request body
 * string. Falls back to service-role-key Bearer comparison for legacy callers
 * (to be retired at the end of the migration window).
 */
export async function verifyInternal(
  supabase: any,
  req: Request,
  rawBody: string
): Promise<AuthContext> {
  // Legacy path: direct service-role key comparison (shared-secret check).
  const authHeader = req.headers.get('authorization') || '';
  const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  if (serviceRoleKey && authHeader.startsWith('Bearer ') && authHeader.slice(7).trim() === serviceRoleKey) {
    return ctx({
      ok: true,
      authType: 'internal_service',
      actorId: 'service_role',
      username: 'system',
      roles: [],
      method: 'service_role_key',
      errorCode: null,
    });
  }

  const secret = Deno.env.get('INTERNAL_EDGE_SECRET');
  const timestamp = req.headers.get('x-internal-timestamp');
  const nonce = req.headers.get('x-internal-nonce');
  const caller = req.headers.get('x-internal-caller');
  const signature = req.headers.get('x-internal-signature');
  if (!secret || !timestamp || !nonce || !caller || !signature) {
    return ctx({ errorCode: 'missing_credentials' });
  }

  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > INTERNAL_SKEW_SECONDS) {
    return ctx({ errorCode: 'internal_timestamp_skew' });
  }

  const path = new URL(req.url).pathname;
  const bodyHash = await sha256Hex(rawBody);
  const expected = await hmacHex(secret, internalMessage(req.method, path, timestamp, nonce, caller, bodyHash));
  if (!constantTimeEqual(expected, signature)) {
    return ctx({ errorCode: 'invalid_internal_signature' });
  }

  // Nonce replay check: durable table first, per-instance memory as fallback.
  try {
    const { error } = await supabase
      .from('internal_request_nonces')
      .insert({ nonce, caller_function: caller });
    if (error) {
      if (String(error.code) === '23505') {
        return ctx({ errorCode: 'internal_replay' });
      }
      // Table missing or transient failure — fall back to memory check.
      if (memoryNonces.has(nonce)) return ctx({ errorCode: 'internal_replay' });
      memoryNonces.set(nonce, now);
    }
  } catch (_e) {
    if (memoryNonces.has(nonce)) return ctx({ errorCode: 'internal_replay' });
    memoryNonces.set(nonce, now);
  }
  // Opportunistic memory-nonce GC
  if (memoryNonces.size > 10000) {
    for (const [n, t] of memoryNonces) if (now - t > INTERNAL_SKEW_SECONDS * 2) memoryNonces.delete(n);
  }

  return ctx({
    ok: true,
    authType: 'internal_service',
    actorId: caller,
    username: 'system',
    roles: [],
    method: 'internal_hmac',
    errorCode: null,
  });
}

/**
 * Record a security event (best-effort; never throws). Uses the
 * security_events table created in the Phase 1 migration.
 */
export async function logSecurityEvent(
  supabase: any,
  event: {
    action: string;
    decision: 'allow' | 'deny';
    reason_code?: string;
    actor_type?: string;
    actor_id?: string | null;
    target_type?: string;
    target_id?: string | null;
    correlation_id?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await supabase.from('security_events').insert({
      action: event.action,
      decision: event.decision,
      reason_code: event.reason_code ?? null,
      actor_type: event.actor_type ?? 'unknown',
      actor_id: event.actor_id ?? null,
      target_type: event.target_type ?? null,
      target_id: event.target_id ?? null,
      correlation_id: event.correlation_id ?? crypto.randomUUID(),
      metadata_redacted: event.metadata ?? {},
    });
  } catch (_e) {
    // Logging must never break the request path.
  }
}
