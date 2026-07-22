/**
 * internalCall — edge-function-to-edge-function invocation without spreading the
 * service-role key (AUTH-002 / Phase 2).
 *
 * Internal callers previously passed the full Supabase service-role key as the
 * Bearer credential on every inter-function HTTP call. That key bypasses all RLS
 * and grants, so spreading it across the fleet made a leak catastrophic. This
 * helper authenticates the call with the dedicated INTERNAL_EDGE_SECRET in the
 * `x-internal-edge-secret` header (which verifyAuth / verifyInternal accept as
 * an internal service identity). A leak of that secret only permits internal
 * function invocation — not direct DB access.
 *
 * The gateway still needs an apikey; the public anon key is used for routing
 * (functions invoked internally run with verify_jwt=false or accept the
 * internal secret in-function). If INTERNAL_EDGE_SECRET is not configured we
 * fall back to the service-role key so nothing breaks — but that path should be
 * retired once the secret is set fleet-wide.
 */

export interface InternalCallResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

function functionsBaseUrl(): string {
  const url = (Deno.env.get('SUPABASE_URL') || '').trim().replace(/\/$/, '');
  return `${url}/functions/v1`;
}

/**
 * POST a JSON body to another edge function as an authenticated internal call.
 * @param functionName target function slug (e.g. "ai-dashboard-agent")
 * @param body         JSON-serializable payload
 * @param callerName   this function's name (for audit/traceability headers)
 */
export async function callInternalFunction<T = any>(
  functionName: string,
  body: Record<string, unknown>,
  callerName: string,
  opts?: { timeoutMs?: number },
): Promise<InternalCallResult<T>> {
  const anonKey = (Deno.env.get('SUPABASE_ANON_KEY') || '').trim();
  const internalSecret = (Deno.env.get('INTERNAL_EDGE_SECRET') || '').trim();
  const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': anonKey,
    'x-internal-caller': callerName,
  };

  if (internalSecret.length >= 16) {
    // Preferred: dedicated internal secret, NOT the service-role key.
    headers['x-internal-edge-secret'] = internalSecret;
    headers['Authorization'] = `Bearer ${anonKey}`;
  } else {
    // Fallback (unconfigured secret): legacy service-role Bearer. Warn so this
    // is visible in logs and can be eliminated once the secret is set.
    console.warn(`[internalCall] INTERNAL_EDGE_SECRET not set — falling back to service-role Bearer for ${functionName}`);
    headers['Authorization'] = `Bearer ${serviceKey}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 60000);
  try {
    const resp = await fetch(`${functionsBaseUrl()}/${functionName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let data: any = null;
    try { data = await resp.json(); } catch { /* non-JSON */ }
    return {
      ok: resp.ok,
      status: resp.status,
      data,
      error: resp.ok ? null : (data?.error?.message || data?.error || `HTTP ${resp.status}`),
    };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : 'internal call failed' };
  } finally {
    clearTimeout(timeout);
  }
}
