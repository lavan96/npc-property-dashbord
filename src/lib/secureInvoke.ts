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

// Template-builder endpoints read the session token from the request BODY
// (shared extractSessionToken), so the custom `x-session-token` header is
// redundant for them — and a custom header forces a CORS preflight that hard-
// fails ("Failed to fetch") against any function deployment whose CORS
// allowlist predates the header. Token-in-body keeps the preflight to plain
// authorization/apikey/content-type, which every deployment accepts.
const BODY_TOKEN_FUNCTIONS = new Set([
  'template-import-pdf',
  'template-design-agent',
  'render-source',
  'import-from-url',
  'pdf-parse-dispatch',
]);

/** Human-readable guidance for auth failures from secured edge functions. */
export function describeAuthError(message: string | undefined | null): string | null {
  const m = String(message ?? '').toLowerCase();
  if (
    m.includes('authentication required')
    || m.includes('invalid or expired session')
    || m.includes('session not found')
    || m === 'unauthorized'
  ) {
    return 'Your sign-in session has expired. Sign out, sign back in, and retry the import.';
  }
  return null;
}

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
 * Attempt to refresh the stored Supabase access token by calling
 * custom-auth-verify with the existing session_token. Returns the new
 * access token on success, or null when no refresh is possible.
 */
async function tryRefreshAccessToken(): Promise<string | null> {
  const sessionToken = getSessionToken();
  if (!sessionToken) return null;
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/custom-auth-verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'x-session-token': sessionToken,
      },
      credentials: 'include',
      body: JSON.stringify({ session_token: sessionToken }),
    });
    if (!resp.ok) return null;
    const json = await resp.json().catch(() => null) as any;
    if (json?.valid && json?.access_token) {
      try { sessionStorage.setItem(ACCESS_TOKEN_KEY, json.access_token); } catch { /* ignore */ }
      try { localStorage.setItem(ACCESS_TOKEN_KEY, json.access_token); } catch { /* ignore */ }
      if (json?.session_token) {
        try { sessionStorage.setItem(SESSION_TOKEN_KEY, json.session_token); } catch { /* ignore */ }
        try { localStorage.setItem(SESSION_TOKEN_KEY, json.session_token); } catch { /* ignore */ }
      }
      return json.access_token as string;
    }
  } catch (err) {
    console.warn('[secureInvoke] Token refresh failed', err);
  }
  return null;
}

/**
 * Invoke an edge function with HttpOnly cookie support
 */
export async function invokeSecureFunction<T = any>(
  functionName: string,
  body?: Record<string, any>,
  options?: { timeoutMs?: number; _isRetry?: boolean; stepUpCapability?: string }
): Promise<InvokeResult<T>> {
  try {
    const sessionToken = getSessionToken();
    let accessToken = getAccessToken();
    // Native Supabase Auth fallback: users signed in through supabase-js keep
    // their JWT in the client's own storage, not under our custom keys — for
    // them the old code silently sent the ANON key and secured functions 401'd.
    if (!accessToken) {
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? null;
      } catch { /* native session lookup is best-effort */ }
    }
    const bearerToken = accessToken || SUPABASE_ANON_KEY;

    const isCommandCentreMessagingFunction = COMMAND_CENTRE_MESSAGING_FUNCTIONS.has(functionName);
    const tokenInBodyOnly = BODY_TOKEN_FUNCTIONS.has(functionName);

    // WP-11C: attach a live step-up token when the caller declares a capability.
    let stepUpToken: string | null = null;
    if (options?.stepUpCapability) {
      try {
        const { getStepUpToken } = await import('@/lib/security/stepUp');
        stepUpToken = getStepUpToken(options.stepUpCapability);
      } catch { /* module optional at boot */ }
    }

    const requestBody = body
      ? {
        ...body,
        session_token: sessionToken,
        ...(isCommandCentreMessagingFunction ? { command_centre_session_token: sessionToken } : {}),
        ...(stepUpToken ? { step_up_token: stepUpToken } : {}),
      }
      : {
        session_token: sessionToken,
        ...(isCommandCentreMessagingFunction ? { command_centre_session_token: sessionToken } : {}),
        ...(stepUpToken ? { step_up_token: stepUpToken } : {}),
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
        ...(sessionToken && !tokenInBodyOnly ? {
          'x-session-token': sessionToken,
          ...(isCommandCentreMessagingFunction ? { 'x-command-centre-session-token': sessionToken } : {}),
        } : {}),
        ...(stepUpToken ? { 'x-step-up-token': stepUpToken } : {}),
      },
      credentials: 'include',
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

      // ── One-shot token refresh + retry on auth failure ──
      if (isAuthFailure && !options?._isRetry && functionName !== 'custom-auth-verify') {
        const refreshed = await tryRefreshAccessToken();
        if (refreshed) {
          console.log('[invokeSecureFunction] Access token refreshed, retrying', functionName);
          return invokeSecureFunction<T>(functionName, body, { ...options, _isRetry: true });
        }
      }

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
