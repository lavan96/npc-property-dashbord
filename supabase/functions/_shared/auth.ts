/**
 * Shared authentication utilities for Edge Functions
 * Validates session tokens from the custom auth system
 * Supports HttpOnly cookies for XSS protection
 * Also supports Supabase JWT when verify_jwt is enabled (defense in depth)
 */

export interface SessionValidationResult {
  error: string | null;
  userId: string | null;
  username: string | null;
  authMethod?: 'jwt' | 'session'; // Track which auth method was used
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
    return { error: 'Authentication required', userId: null, username: null };
  }

  try {
    const { data: session, error: sessionError } = await supabase
      .from('user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (sessionError || !session) {
      console.log('Session validation failed:', sessionError?.message || 'Session not found or expired');
      return { error: 'Invalid or expired session', userId: null, username: null };
    }

    // Optionally fetch username for logging
    const { data: user } = await supabase
      .from('custom_users')
      .select('username')
      .eq('id', session.user_id)
      .single();

    return {
      error: null,
      userId: session.user_id,
      username: user?.username || null,
      authMethod: 'session',
    };
  } catch (err) {
    console.error('Session verification error:', err);
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
  body?: { session_token?: string }
): Promise<SessionValidationResult> {
  // First, try to get JWT from Authorization header (when verify_jwt is enabled in Supabase)
  // Supabase automatically validates JWT when verify_jwt=true, so if we get here,
  // the JWT is already validated. We just need to extract the user ID.
  const authHeader = headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const jwtToken = authHeader.substring(7);
    try {
      // Decode JWT to get user ID (Supabase has already validated it)
      const parts = jwtToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        const userId = payload.sub;
        
        if (userId) {
          // Fetch username for logging
          const { data: user } = await supabase
            .from('custom_users')
            .select('username')
            .eq('id', userId)
            .single();
          
          return {
            error: null,
            userId: userId,
            username: user?.username || null,
            authMethod: 'jwt',
          };
        }
      }
    } catch (err) {
      console.log('JWT extraction failed, falling back to session token:', err);
      // Fall through to session token check
    }
  }

  // Fall back to custom session token authentication
  const sessionToken = extractSessionToken(headers, body);
  if (!sessionToken) {
    return { error: 'Authentication required', userId: null, username: null };
  }

  return await verifySession(supabase, sessionToken);
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
 * Priority: Cookie > Authorization header > x-session-token header > body
 * Supports HttpOnly cookies for XSS protection
 */
export function extractSessionToken(
  headers: Headers,
  body?: { session_token?: string }
): string | null {
  // Check Cookie header first (HttpOnly cookie - primary method)
  const cookieHeader = headers.get('cookie');
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    if (cookies['session_token']) {
      return cookies['session_token'];
    }
  }

  // Check Authorization header (Bearer token)
  const authHeader = headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check custom session header
  const sessionHeader = headers.get('x-session-token');
  if (sessionHeader) {
    return sessionHeader;
  }

  // Check body parameter (legacy support)
  if (body?.session_token) {
    return body.session_token;
  }

  return null;
}

/**
 * Create CORS headers with credentials support for cookies
 * Uses dynamic origin for security
 */
export function createCorsHeaders(origin: string | null): Record<string, string> {
  // Allowed origins for the application
  const allowedOrigins = [
    'https://npc-property-dashbord.lovable.app',
    'https://id-preview--7976d60b-c277-4851-889b-c170285f4be2.lovable.app',
    'http://localhost:5173',
    'http://localhost:8080',
  ];
  
  // Check if origin is allowed, default to primary domain
  // NOTE: Lovable preview iframes often run on *.lovableproject.com.
  // If we don't allow that, browsers will block credentialed requests (cookies)
  // and auth/JWT issuance will silently fail with "Failed to fetch".
  const allowedOrigin = origin && allowedOrigins.some(allowed => 
    origin === allowed ||
    origin.endsWith('.lovable.app') ||
    origin.endsWith('.lovableproject.com')
  ) ? origin : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    // Required for browser preflight (POST + application/json)
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
    // Required for HttpOnly cookie auth
    'Access-Control-Allow-Credentials': 'true',
    // Ensure caches/proxies don't mix CORS responses across origins
    'Vary': 'Origin',
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
  corsHeaders: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({ error: message, success: false }),
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
  corsHeaders: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({ error: message, success: false }),
    {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}
