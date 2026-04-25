/**
 * Secure Edge Function invocation helper
 * Supports HttpOnly cookies for session authentication
 * Includes fallback session token in body for cross-origin cookie issues
 */

const SUPABASE_URL = "https://dduzbchuswwbefdunfct.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdXpiY2h1c3d3YmVmZHVuZmN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0NDM4NzksImV4cCI6MjA3MTAxOTg3OX0.eSYU6fxIc3tBQuGLsdBRff0alBMkNfvv7OpW0efNjxk";

// ── Global auth-failure circuit breaker ──
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

function clearStoredToken(key: string): void {
  try { sessionStorage.removeItem(key); } catch { /* ignore */ }
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

function getSessionToken(): string | null {
  return getStoredToken(SESSION_TOKEN_KEY);
}

function getAccessToken(): string | null {
  return getStoredToken(ACCESS_TOKEN_KEY);
}

/**
 * Invoke an edge function with HttpOnly cookie support
 */
export async function invokeSecureFunction<T = any>(
  functionName: string,
  body?: Record<string, any>,
  options?: { timeoutMs?: number }
): Promise<InvokeResult<T>> {
  try {
    const sessionToken = getSessionToken();
    const accessToken = getAccessToken();
    const bearerToken = accessToken || SUPABASE_ANON_KEY;
    
    const requestBody = body 
      ? { ...body, session_token: sessionToken }
      : { session_token: sessionToken };
    
    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs || 60000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${bearerToken}`,
        ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
      },
      credentials: 'omit',
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    
    if (!response.ok) {
      // Transient platform errors (5xx) should be warnings, not errors.
      // The Supabase edge runtime intermittently returns 503/502 even when
      // the function itself is healthy — logging these as console.error
      // triggers the runtime error overlay and creates a poor UX. Callers
      // already handle these with backoff via the returned error.
      const isTransient = response.status >= 500 && response.status < 600;
      const log = isTransient ? console.warn : console.error;
      log('[invokeSecureFunction] Request failed', {
        functionName,
        status: response.status,
        data,
        hasAccessToken: Boolean(accessToken),
        hasSessionToken: Boolean(sessionToken),
      });

      // Only definitive authentication failures should trip the auth circuit breaker.
      // Business-rule 400s (for example GHL token preflight failures) must not clear
      // the user's dashboard session or turn a handled validation error into a blank screen.
      const message = String(data?.error || data?.message || '').toLowerCase();
      const isAuthFailure = response.status === 401
        || response.status === 403
        || (response.status === 400 && (
          message.includes('authentication required')
          || message.includes('auth required')
          || message.includes('invalid session')
          || message.includes('session expired')
        ));

      if (isAuthFailure) {
        markAuthFailure();

        // If circuit breaker trips, proactively clear stale tokens
        // so the next page load starts clean and shows the login screen
        if (isAuthExhausted()) {
          console.warn('[secureInvoke] Clearing stale tokens after repeated auth failures');
          clearStoredToken(ACCESS_TOKEN_KEY);
          clearStoredToken(SESSION_TOKEN_KEY);
        }
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
    const isTimeout = error.name === 'AbortError';
    return { 
      data: null, 
      error: { message: isTimeout ? 'Request timed out. Please try again.' : (error.message || 'Network error') } 
    };
  }
}

/**
 * Check if the user has an active session token or access token stored.
 */
export function hasActiveSession(): boolean {
  return Boolean(getSessionToken() || getAccessToken());
}
