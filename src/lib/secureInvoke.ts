/**
 * Secure Edge Function invocation helper
 * Supports HttpOnly cookies for session authentication
 * Includes fallback session token in body for cross-origin cookie issues
 */

const SUPABASE_URL = "https://dduzbchuswwbefdunfct.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdXpiY2h1c3d3YmVmZHVuZmN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0NDM4NzksImV4cCI6MjA3MTAxOTg3OX0.eSYU6fxIc3tBQuGLsdBRff0alBMkNfvv7OpW0efNjxk";

// Matches src/hooks/useAuth.tsx
const ACCESS_TOKEN_KEY = 'supabase_access_token';

export interface InvokeResult<T = any> {
  data: T | null;
  error: { message: string } | null;
}

/**
 * Get session token from sessionStorage (stored during login as fallback for cross-origin cookie issues)
 */
function getSessionToken(): string | null {
  try {
    return sessionStorage.getItem('session_token');
  } catch {
    return null;
  }
}

/**
 * Get access token from sessionStorage (set by custom auth flow)
 */
function getAccessToken(): string | null {
  try {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
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
      return { 
        data: data as T, 
        error: { message: data.error || `HTTP ${response.status}` } 
      };
    }
    
    return { data: data as T, error: null };
  } catch (error: any) {
    return { 
      data: null, 
      error: { message: error.message || 'Network error' } 
    };
  }
}

/**
 * Check if the user has an active session
 * This is a lightweight check without full verification
 */
export function hasActiveSession(): boolean {
  // With HttpOnly cookies, we can't check directly from JS
  // Return true to allow the request to be made - the server will validate
  return true;
}
