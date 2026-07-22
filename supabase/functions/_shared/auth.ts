/**
 * Shared authentication utilities for Edge Functions
 * Validates session tokens from the custom auth system
 * Supports HttpOnly cookies for XSS protection
 * Also supports Supabase JWT when verify_jwt is enabled (defense in depth)
 *
 * SECURITY: Bearer JWTs are ALWAYS cryptographically verified before any
 * claim (sub/role) is trusted. Most functions run with verify_jwt=false at
 * the gateway, so in-function signature verification is the trust boundary.
 */

import { verifySupabaseJWT } from './jwt.ts';

/** Constant-time string comparison (avoids leaking a secret via timing). */
function constantTimeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface SessionValidationResult {
  error: string | null;
  userId: string | null;
  username: string | null;
  authMethod?: 'jwt' | 'session' | 'service_role'; // Track which auth method was used
}

/**
 * Verify a session token is valid and not expired
 * @param supabase - Supabase client with service_role
 * @param sessionToken - The session token from the request
 * @returns Session validation result with user info or error
 */
export async function verifySession(
  supabase: any,
  sessionToken: string | null | undefined
): Promise<SessionValidationResult> {
  if (!sessionToken) {
    console.log('[verifySession] No session token provided');
    return { error: 'Authentication required', userId: null, username: null };
  }

  console.log('[verifySession] Verifying session token:', sessionToken.substring(0, 8) + '...');

  try {
    const { data: session, error: sessionError } = await supabase
      .from('user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(); // Use maybeSingle() to avoid "Cannot coerce" errors

    if (sessionError) {
      console.log('[verifySession] Session query error:', sessionError.code, sessionError.message);
    }

    if (sessionError || !session) {
      const errorMsg = sessionError?.message || 'Session not found or expired';
      console.log('[verifySession] Session validation failed:', errorMsg, {
        errorCode: sessionError?.code,
        hasSession: !!session,
        sessionTokenPreview: sessionToken.substring(0, 8) + '...'
      });
      // Provide more specific error message
      if (sessionError?.code === 'PGRST116') {
        return { error: 'Session not found', userId: null, username: null };
      }
      return { error: 'Invalid or expired session', userId: null, username: null };
    }

    console.log('[verifySession] Session found, user_id:', session.user_id?.substring(0, 8) + '...');

    // Optionally fetch username for logging
    const { data: user } = await supabase
      .from('custom_users')
      .select('username')
      .eq('id', session.user_id)
      .maybeSingle(); // Use maybeSingle() to avoid errors if user doesn't exist

    console.log('[verifySession] Session authentication successful:', {
      userId: session.user_id?.substring(0, 8) + '...',
      username: user?.username || 'not found'
    });

    return {
      error: null,
      userId: session.user_id,
      username: user?.username || null,
      authMethod: 'session',
    };
  } catch (err) {
    console.error('[verifySession] Session verification error:', err);
    return { error: 'Session verification failed', userId: null, username: null };
  }
}

/**
 * Verify authentication using either Supabase JWT (when verify_jwt is enabled) or custom session token
 * This provides defense in depth - JWT is checked first, then falls back to session token
 * @param supabase - Supabase client with service_role
 * @param headers - Request headers (for JWT from Authorization header)
 * @param body - Request body (for session_token)
 * @returns Session validation result with user info or error
 */
export async function verifyAuth(
  supabase: any,
  headers: Headers,
  body?: { session_token?: string; command_centre_session_token?: string }
): Promise<SessionValidationResult> {
  // DIAGNOSTIC: Log all headers for debugging
  const authHeader = headers.get('authorization');
  const cookieHeader = headers.get('cookie');
  const commandCentreSessionHeader = headers.get('x-command-centre-session-token');
  const sessionHeader = headers.get('x-session-token');
  console.log('[verifyAuth] Headers check:', {
    hasAuthHeader: !!authHeader,
    authHeaderPrefix: authHeader?.substring(0, 20) + '...',
    hasCookieHeader: !!cookieHeader,
    cookieHeaderPreview: cookieHeader ? cookieHeader.substring(0, 50) + '...' : null,
    hasCommandCentreSessionHeader: !!commandCentreSessionHeader,
    hasSessionHeader: !!sessionHeader,
    hasBody: !!body,
    bodyHasCommandCentreSessionToken: !!(body?.command_centre_session_token),
    bodyHasSessionToken: !!(body?.session_token)
  });

  // Internal-service auth (AUTH-002): a dedicated INTERNAL_EDGE_SECRET presented
  // in x-internal-edge-secret authorizes an internal edge-to-edge call as
  // service_role, WITHOUT spreading the crown-jewel service-role key on the
  // wire. Constant-time compared; headers-only. This lets every receiver that
  // already accepts service_role via verifyAuth transparently accept the safer
  // internal credential.
  const internalSecret = (Deno.env.get('INTERNAL_EDGE_SECRET') || '').trim();
  const presentedInternal = (headers.get('x-internal-edge-secret') || '').trim();
  if (internalSecret.length >= 16 && presentedInternal.length > 0 && constantTimeEqualStr(internalSecret, presentedInternal)) {
    console.log('[verifyAuth] Valid x-internal-edge-secret - allowing internal service call');
    return { error: null, userId: 'service_role', username: 'system', authMethod: 'service_role' };
  }

  // First, try the Authorization header. SECURITY: claims from a Bearer JWT
  // are only trusted after cryptographic verification. Most functions run
  // with verify_jwt=false at the gateway, so a decoded-but-unverified payload
  // is attacker-controlled input (forged sub/role, alg=none, etc.).
  if (authHeader?.startsWith('Bearer ')) {
    const jwtToken = authHeader.substring(7).trim();

    // CRITICAL: Check if the bearer token is the service_role key by direct comparison
    // This handles non-JWT service role keys (e.g., sb_secret_* format) used in
    // service-to-service calls between edge functions. A direct secret match is a
    // cryptographically sound shared-secret check.
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (serviceRoleKey && jwtToken === serviceRoleKey.trim()) {
      console.log('[verifyAuth] Service role key matched by direct comparison - allowing internal service call');
      return {
        error: null,
        userId: 'service_role',
        username: 'system',
        authMethod: 'service_role',
      };
    }

    // The anon key is public and identifies nobody; fall through to session auth.
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const isAnonKey = !!anonKey && jwtToken === anonKey.trim();

    if (jwtToken.includes('.') && !isAnonKey) {
      try {
        // 1) Verify the HS256 signature against the project JWT secret. This
        //    covers both custom-auth JWTs (issued by _shared/jwt.ts) and
        //    legacy Supabase keys/JWTs signed with the same secret.
        const payload = await verifySupabaseJWT(jwtToken);

        if (payload) {
          if ((payload as any).role === 'service_role') {
            console.log('[verifyAuth] Verified service_role JWT - allowing internal service call');
            return {
              error: null,
              userId: 'service_role',
              username: 'system',
              authMethod: 'service_role',
            };
          }

          if (payload.sub && payload.role === 'authenticated') {
            // Signature is valid; confirm the user exists and is active.
            const { data: user, error: userError } = await supabase
              .from('custom_users')
              .select('username, id, is_active')
              .eq('id', payload.sub)
              .maybeSingle();

            if (!userError && user && user.is_active !== false) {
              console.log('[verifyAuth] JWT authentication successful:', { userId: payload.sub.substring(0, 8) + '...', username: user.username });
              return {
                error: null,
                userId: payload.sub,
                username: user.username || null,
                authMethod: 'jwt',
              };
            }
            console.log('[verifyAuth] Verified JWT but user missing/inactive in custom_users, falling back to session token');
          } else {
            console.log('[verifyAuth] Verified JWT is not an authenticated user token (role:', payload.role, '), falling back to session token');
          }
        } else {
          // 2) HS256 verification failed. The token may be a native Supabase
          //    Auth JWT signed with a newer (possibly asymmetric) key — verify
          //    it with the Auth server instead of trusting decoded claims.
          const supabaseUrl = Deno.env.get('SUPABASE_URL');
          if (supabaseUrl && anonKey) {
            const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
              headers: { Authorization: `Bearer ${jwtToken}`, apikey: anonKey },
            });
            if (resp.ok) {
              const authUser = await resp.json();
              if (authUser?.id) {
                const { data: user, error: userError } = await supabase
                  .from('custom_users')
                  .select('username, id, is_active')
                  .eq('id', authUser.id)
                  .maybeSingle();
                if (!userError && user && user.is_active !== false) {
                  console.log('[verifyAuth] Auth-server-verified JWT successful:', { userId: String(authUser.id).substring(0, 8) + '...' });
                  return {
                    error: null,
                    userId: String(authUser.id),
                    username: user.username || null,
                    authMethod: 'jwt',
                  };
                }
              }
            }
          }
          console.log('[verifyAuth] Bearer JWT failed cryptographic verification, falling back to session token');
        }
      } catch (err) {
        console.log('[verifyAuth] JWT verification errored, falling back to session token:', err);
        // Fall through to session token check
      }
    }
  }

  // Fall back to custom session token authentication
  // This is the primary authentication method for the custom auth system
  console.log('[verifyAuth] Attempting session token extraction...');
  const sessionToken = extractSessionToken(headers, body);
  console.log('[verifyAuth] Session token extracted:', sessionToken ? sessionToken.substring(0, 8) + '...' : 'null');
  
  if (!sessionToken) {
    console.log('[verifyAuth] No session token found - returning authentication required');
    return { error: 'Authentication required', userId: null, username: null };
  }

  console.log('[verifyAuth] Verifying session token...');
  return await verifySession(supabase, sessionToken);
}

/**
 * Verify the caller as EITHER a custom-auth user (session token / custom HS256
 * JWT → `custom_users`) OR a native Supabase Auth user (JWT verified against
 * the Auth server). The template-builder endpoints authenticate real humans
 * from both systems; accepting only one of them locked out the other and
 * surfaced as blanket "Authentication required" errors on every import.
 */
export async function verifyAuthOrNativeUser(
  supabase: any,
  req: Request,
  body?: { session_token?: string; command_centre_session_token?: string }
): Promise<SessionValidationResult> {
  const custom = await verifyAuth(supabase, req.headers, body);
  if (!custom.error) return custom;

  // Fallback: a native Supabase Auth user (verify the JWT with the Auth server).
  try {
    const authHeader = req.headers.get('authorization');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (authHeader?.startsWith('Bearer ') && anonKey && supabaseUrl) {
      const jwt = authHeader.substring(7).trim();
      // The anon key itself is not a user.
      if (jwt && jwt !== anonKey.trim()) {
        const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey },
        });
        if (resp.ok) {
          const user = await resp.json();
          if (user?.id) {
            console.log('[verifyAuthOrNativeUser] Native Supabase Auth user verified:', String(user.id).substring(0, 8) + '...');
            return {
              error: null,
              userId: String(user.id),
              username: user.email ?? null,
              authMethod: 'jwt',
            };
          }
        }
      }
    }
  } catch (err) {
    console.log('[verifyAuthOrNativeUser] Native auth fallback failed:', err);
  }
  return custom; // original custom-auth error (message + null user)
}

/**
 * Parse cookies from Cookie header
 */
export function parseCookies(cookieHeader: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name && rest.length > 0) {
      cookies[name] = rest.join('=');
    }
  });
  
  return cookies;
}

/**
 * Extract session token from request headers, cookies, or body
 * Priority: Cookie > x-command-centre-session-token header > x-session-token header > body > Authorization header (only if not a JWT)
 * Supports HttpOnly cookies for XSS protection
 * 
 * NOTE: We check Authorization header LAST and only if it doesn't look like a JWT
 * to avoid treating the Supabase anon key as a session token
 */
export function extractSessionToken(
  headers: Headers,
  body?: { session_token?: string | null; command_centre_session_token?: string | null }
): string | null {
  // Helper: reject falsy, "null", "undefined", empty strings
  const isValidToken = (t: any): t is string => 
    typeof t === 'string' && t.length > 0 && t !== 'null' && t !== 'undefined';
  // Check Cookie header first (HttpOnly cookie - primary method)
  const cookieHeader = headers.get('cookie');
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    console.log('[extractSessionToken] Cookie header found, parsed cookies:', Object.keys(cookies));
    if (isValidToken(cookies['session_token'])) {
      console.log('[extractSessionToken] Found session_token in cookie');
      return cookies['session_token'];
    }
  } else {
    console.log('[extractSessionToken] No cookie header found');
  }

  // Check explicit Command Centre session header before generic portal headers.
  // This prevents staff dashboard calls from being misclassified by portal-specific
  // endpoints that also accept their own session-token headers.
  const commandCentreSessionHeader = headers.get('x-command-centre-session-token');
  if (isValidToken(commandCentreSessionHeader)) {
    console.log('[extractSessionToken] Found session_token in x-command-centre-session-token header');
    return commandCentreSessionHeader;
  } else {
    console.log('[extractSessionToken] No valid x-command-centre-session-token header found');
  }

  // Check custom session header (reliable fallback for cross-origin)
  const sessionHeader = headers.get('x-session-token');
  if (isValidToken(sessionHeader)) {
    console.log('[extractSessionToken] Found session_token in x-session-token header');
    return sessionHeader;
  } else {
    console.log('[extractSessionToken] No valid x-session-token header found');
  }

  // Check explicit Command Centre body parameter before legacy generic body support.
  if (isValidToken(body?.command_centre_session_token)) {
    console.log('[extractSessionToken] Found session_token in command_centre_session_token body field');
    return body!.command_centre_session_token!;
  } else {
    console.log('[extractSessionToken] No valid command_centre_session_token in body');
  }

  // Check body parameter (legacy support)
  if (isValidToken(body?.session_token)) {
    console.log('[extractSessionToken] Found session_token in body');
    return body!.session_token!;
  } else {
    console.log('[extractSessionToken] No valid session_token in body');
  }

  // Check Authorization header LAST (only if it doesn't look like a JWT)
  // JWTs have 3 parts separated by dots (header.payload.signature)
  // Session tokens are typically UUIDs or random strings without dots
  const authHeader = headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // If it doesn't look like a JWT (no dots), treat it as a session token
    if (!token.includes('.')) {
      console.log('[extractSessionToken] Found non-JWT token in Authorization header, treating as session token');
      return token;
    } else {
      console.log('[extractSessionToken] Authorization header contains JWT, not treating as session token');
    }
  }

  console.log('[extractSessionToken] No session token found in any location');
  return null;
}

/**
 * Create CORS headers with credentials support for cookies
 * Uses dynamic origin for security
 *
 * Allowed origins are sourced from the `ALLOWED_ORIGINS` environment variable
 * (comma-separated list of fully-qualified URLs). Lovable platform domains
 * (`*.lovable.app`, `*.lovableproject.com`) and `localhost` are always
 * allowed for preview/development.
 *
 * SAFETY FALLBACK: If `ALLOWED_ORIGINS` is unset, we fall back to the
 * legacy production origin so existing deployments never break. Set
 * `ALLOWED_ORIGINS` once and remove the fallback in a future migration.
 */

const LEGACY_FALLBACK_ORIGINS = [
  'https://command-centre.npcservices.com.au',
  'https://npc-property-dashbord.lovable.app',
];

function parseAllowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS') || '';
  const fromEnv = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (fromEnv.length > 0) {
    return fromEnv;
  }
  console.warn('[auth.cors] ALLOWED_ORIGINS env var is unset; using legacy fallback origins. Set ALLOWED_ORIGINS to override.');
  return LEGACY_FALLBACK_ORIGINS;
}

export function createCorsHeaders(origin: string | null = null): Record<string, string> {
  const allowedOrigins = [
    ...parseAllowedOrigins(),
    'http://localhost:5173',
    'http://localhost:8080',
  ];

  // Lovable preview iframes run on *.lovable.app and *.lovableproject.com.
  // These are platform infrastructure and are always allowed.
  const allowedOrigin = origin && (
    allowedOrigins.includes(origin) ||
    origin.endsWith('.lovable.app') ||
    origin.endsWith('.lovableproject.com')
  ) ? origin : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    // Required for browser preflight (POST + application/json)
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token, x-command-centre-session-token, x-portal-session-token, x-finance-session-token, x-generation-run-id',
    // Required for HttpOnly cookie auth
    'Access-Control-Allow-Credentials': 'true',
    // Ensure caches/proxies don't mix CORS responses across origins
    'Vary': 'Origin',
  };
}

/**
 * CORS headers for TOKEN-authenticated endpoints (no cookies involved — the
 * app calls them with `credentials: 'omit'` and auth travels in the
 * Authorization header / `session_token` body field).
 *
 * Wildcard origin is deliberate: the origin-allowlist variant returned a
 * mismatched `Access-Control-Allow-Origin` for any origin missing from
 * `ALLOWED_ORIGINS`, which the browser surfaces as an opaque
 * "Failed to fetch" hard error on EVERY call — indistinguishable from an
 * outage. Authentication is enforced in-function, not by CORS.
 */
export function createTokenAuthCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token, x-generation-run-id',
  };
}

/**
 * Create session cookie header for login response
 */
export function createSessionCookie(
  sessionToken: string,
  expiresAt: Date,
  options?: { clear?: boolean }
): string {
  const maxAge = options?.clear ? 0 : Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  const expires = options?.clear ? new Date(0).toUTCString() : expiresAt.toUTCString();
  
  // HttpOnly: prevents JavaScript access (XSS protection)
  // Secure: only sent over HTTPS
  // SameSite=None: required because the app runs on a different site than *.supabase.co
  // (cross-site fetch). We rely on:
  //  - strict Origin allow-listing in createCorsHeaders
  //  - required apikey header (not possible in CSRF form posts)
  // to preserve CSRF protection.
  // Path=/: cookie available for all paths
  return `session_token=${options?.clear ? '' : sessionToken}; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}; Expires=${expires}; Path=/`;
}

/**
 * Create a clear session cookie header for logout
 */
export function createClearSessionCookie(): string {
  return createSessionCookie('', new Date(0), { clear: true });
}

/**
 * Create an unauthorized response with proper CORS headers
 */
export function createUnauthorizedResponse(
  message: string = 'Authentication required',
  corsHeaders: Record<string, string> = createCorsHeaders()
): Response {
  return new Response(
    // `code` lets clients distinguish a real sign-in problem from other
    // failures and show actionable guidance instead of a raw 401.
    JSON.stringify({ error: message, code: 'auth_required', success: false }),
    {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Create a forbidden response with proper CORS headers
 */
export function createForbiddenResponse(
  message: string = 'Access denied',
  corsHeaders: Record<string, string> = createCorsHeaders()
): Response {
  return new Response(
    JSON.stringify({ error: message, success: false }),
    {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}
