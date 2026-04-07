/**
 * Secure Edge Function invocation helper
 * Supports HttpOnly cookies for session authentication
 * Includes fallback session token in body for cross-origin cookie issues
 */

const SUPABASE_URL = "https://dduzbchuswwbefdunfct.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdXpiY2h1c3d3YmVmZHVuZmN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0NDM4NzksImV4cCI6MjA3MTAxOTg3OX0.eSYU6fxIc3tBQuGLsdBRff0alBMkNfvv7OpW0efNjxk";

// ── Global auth-failure circuit breaker ──
// Module-level flag that survives component re-mounts.
// Once set, ALL polling/secure calls skip until a successful auth restores it.
let _globalAuthExhausted = false;
const GLOBAL_AUTH_FAIL_LIMIT = 5;
let _globalAuthFailCount = 0;

export function markAuthFailure(): void {
  _globalAuthFailCount++;
  if (_globalAuthFailCount >= GLOBAL_AUTH_FAIL_LIMIT) {
    _globalAuthExhausted = true;
    console.warn('[secureInvoke] Global auth circuit breaker tripped – all polling stopped until re-login.');
  }
}

export function resetAuthFailures(): void {
  _globalAuthFailCount = 0;
  _globalAuthExhausted = false;
}

export function isAuthExhausted(): boolean {
  return _globalAuthExhausted;
}

// Matches src/hooks/useAuth.tsx
const ACCESS_TOKEN_KEY = 'supabase_access_token';
const SESSION_TOKEN_KEY = 'session_token';

export interface InvokeResult<T = any> {
  data: T | null;
  error: { message: string } | null;
}

function getStoredToken(key: string): string | null {
  try {
    return sessionStorage.getItem(key) || localStorage.getItem(key);
  } catch {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
}

/**
 * Get session token fallback for custom auth flow
 */
function getSessionToken(): string | null {
  return getStoredToken(SESSION_TOKEN_KEY);
}

/**
 * Get access token from storage (sessionStorage first, localStorage fallback)
 */
function getAccessToken(): string | null {
  return getStoredToken(ACCESS_TOKEN_KEY);
}

/**
 * Invoke an edge function with HttpOnly cookie support
 * This replaces supabase.functions.invoke for authenticated requests
 * 
 * @param functionName - The name of the edge function to invoke
 * @param body - Optional request body
 * @returns Promise with data and error properties
 */
export async function invokeSecureFunction<T = any>(
  functionName: string,
  body?: Record<string, any>
): Promise<InvokeResult<T>> {
  try {
    // Get session token as fallback for cross-origin cookie issues
    const sessionToken = getSessionToken();

    // Prefer bearer access token when available (avoids cross-site cookie issues)
    const accessToken = getAccessToken();
    const bearerToken = accessToken || SUPABASE_ANON_KEY;
    
    // Include session token in body as fallback if cookies fail
    const requestBody = body 
      ? { ...body, session_token: sessionToken }
      : { session_token: sessionToken };
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        // Use real user token when available; fall back to anon for public functions.
        'Authorization': `Bearer ${bearerToken}`,
        // Add session token as custom header for additional fallback
        ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
      },
      // Do NOT include cross-site cookies here.
      // Using `credentials: 'include'` makes this a credentialed CORS request, which is
      // incompatible with wildcard CORS (`Access-Control-Allow-Origin: *`) and surfaces as
      // a browser-level "Failed to fetch".
      // We authenticate via Bearer token instead.
      credentials: 'omit',
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('[invokeSecureFunction] Request failed', {
        functionName,
        status: response.status,
        data,
        hasAccessToken: Boolean(accessToken),
        hasSessionToken: Boolean(sessionToken),
      });

      // Track auth failures globally
      if (response.status === 401) {
        markAuthFailure();
      }

      return { 
        data: data as T, 
        error: { message: data.error || `HTTP ${response.status}` } 
      };
    }
    
    // Successful response resets the global auth breaker
    resetAuthFailures();

    return { data: data as T, error: null };
  } catch (error: any) {
    return { 
      data: null, 
      error: { message: error.message || 'Network error' } 
    };
  }
}

/**
 * Check if the user has an active session token or access token stored.
 * Lightweight client-side check — the server still validates.
 */
export function hasActiveSession(): boolean {
  return Boolean(getSessionToken() || getAccessToken());
}
