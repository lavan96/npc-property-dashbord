/**
 * Secure Edge Function invocation helper
 * Supports HttpOnly cookies for session authentication
 * Includes fallback session token in body for cross-origin cookie issues
 */
import { emitTokensUsed, emitOutOfTokens, isReportGenerator } from "@/lib/tokenEvents";

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

const COMMAND_CENTRE_MESSAGING_FUNCTIONS = new Set([
  'staff-client-portal-messages',
  'finance-portal-messages',
]);

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
    
    const isCommandCentreMessagingFunction = COMMAND_CENTRE_MESSAGING_FUNCTIONS.has(functionName);
    const requestBody = body 
      ? {
        ...body,
        session_token: sessionToken,
        ...(isCommandCentreMessagingFunction ? { command_centre_session_token: sessionToken } : {}),
      }
      : {
        session_token: sessionToken,
        ...(isCommandCentreMessagingFunction ? { command_centre_session_token: sessionToken } : {}),
      };
    
    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs || 60000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${bearerToken}`,
        ...(sessionToken ? {
          'x-session-token': sessionToken,
          ...(isCommandCentreMessagingFunction ? { 'x-command-centre-session-token': sessionToken } : {}),
        } : {}),
      },
      credentials: 'omit',
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    
    if (!response.ok) {
      // Mission Control insufficient_funds → surface global banner.
      if (response.status === 402 && data?.error?.code === 'insufficient_funds') {
        emitOutOfTokens({
          available: Number(data.error.available ?? 0),
          requested: Number(data.error.requested ?? 0),
          functionName,
        });
        return {
          data: data as T,
          error: { message: data.error.message || 'Insufficient tokens' },
        };
      }

      const isTransient = response.status >= 500 && response.status < 600;
      const log = isTransient ? console.warn : console.error;
      log('[invokeSecureFunction] Request failed', {
        functionName,
        status: response.status,
        data,
        hasAccessToken: Boolean(accessToken),
        hasSessionToken: Boolean(sessionToken),
      });

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
        if (isAuthExhausted()) {
          console.warn('[secureInvoke] Clearing stale tokens after repeated auth failures');
          clearStoredToken(ACCESS_TOKEN_KEY);
          clearStoredToken(SESSION_TOKEN_KEY);
        }
      }

      const errorMessage = typeof data?.error === 'object' && data.error?.message
        ? data.error.message
        : data?.error || data?.message || `HTTP ${response.status}`;

      return { 
        data: data as T, 
        error: { message: String(errorMessage) }
      };
    }
    
    resetAuthFailures();

    // Surface token usage for metered generators.
    if (isReportGenerator(functionName)) {
      const headerUsed = Number(response.headers.get('x-tokens-used') || 0);
      const headerReserved = Number(response.headers.get('x-tokens-reserved') || 0);
      const headerEstimated = Number(response.headers.get('x-tokens-estimated') || 0);
      const headerDuration = Number(response.headers.get('x-duration-ms') || 0);
      const bodyUsed = Number((data as any)?.tokensUsed || 0);
      const used = bodyUsed > 0 ? bodyUsed : headerUsed;
      if (used > 0) {
        emitTokensUsed({
          tokensUsed: used,
          tokensReserved: headerReserved || (data as any)?.tokensReserved,
          estimatedTokens: headerEstimated || (data as any)?.estimatedTokens,
          durationMs: headerDuration || (data as any)?.durationMs,
          functionName,
        });
      }
    }

    return { data: data as T, error: null };
  } catch (error: any) {
    const isTimeout = error.name === 'AbortError';
    const rawMessage = error.message || 'Network error';
    const message = isTimeout
      ? 'Request timed out. Please try again.'
      : rawMessage === 'Failed to fetch'
        ? `Network/CORS error calling ${functionName}. Please check the function deployment and auth/CORS configuration.`
        : rawMessage;
    console.error('[invokeSecureFunction] Network invocation failed', {
      functionName,
      message: rawMessage,
      isTimeout,
    });
    return {
      data: null,
      error: { message },
    };
  }
}

/**
 * Check if the user has an active session token or access token stored.
 */
export function hasActiveSession(): boolean {
  return Boolean(getSessionToken() || getAccessToken());
}
