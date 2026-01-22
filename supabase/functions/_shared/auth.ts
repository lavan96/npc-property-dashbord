/**
 * Shared authentication utilities for Edge Functions
 * Validates session tokens from the custom auth system
 */

export interface SessionValidationResult {
  error: string | null;
  userId: string | null;
  username: string | null;
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
    };
  } catch (err) {
    console.error('Session verification error:', err);
    return { error: 'Session verification failed', userId: null, username: null };
  }
}

/**
 * Extract session token from request headers or body
 * Supports both header-based and body-based token passing
 */
export function extractSessionToken(
  headers: Headers,
  body?: { session_token?: string }
): string | null {
  // Check Authorization header first (Bearer token)
  const authHeader = headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check custom session header
  const sessionHeader = headers.get('x-session-token');
  if (sessionHeader) {
    return sessionHeader;
  }

  // Check body parameter
  if (body?.session_token) {
    return body.session_token;
  }

  return null;
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
