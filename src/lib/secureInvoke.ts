/**
 * Secure Edge Function invocation helper
 * Supports HttpOnly cookies for session authentication
 * Includes fallback session token in body for cross-origin cookie issues
 */

const SUPABASE_URL = "https://dduzbchuswwbefdunfct.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdXpiY2h1c3d3YmVmZHVuZmN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0NDM4NzksImV4cCI6MjA3MTAxOTg3OX0.eSYU6fxIc3tBQuGLsdBRff0alBMkNfvv7OpW0efNjxk";

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
    
    // Include session token in body as fallback if cookies fail
    const requestBody = body 
      ? { ...body, session_token: sessionToken }
      : { session_token: sessionToken };
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        // Add session token as custom header for additional fallback
        ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
      },
      credentials: 'include', // Required for HttpOnly cookies
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    
    if (!response.ok) {
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
