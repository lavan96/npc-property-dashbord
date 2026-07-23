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
 * internal secret in-function).
 *
 * AUTH-004: the legacy service-role-key fallback has been RETIRED. Inter-function
 * calls authenticate ONLY with INTERNAL_EDGE_SECRET; if it is unset the call
 * fails closed (no service-role key is ever placed on an inter-function request).
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

  // AUTH-004: fail closed. Inter-function calls authenticate ONLY with the
  // dedicated internal secret — never the service-role key. If the secret is
  // missing/too short we refuse the call rather than degrade to a service-role
  // Bearer that bypasses all RLS.
  if (internalSecret.length < 16) {
    console.error(`[internalCall] INTERNAL_EDGE_SECRET not configured — refusing internal call to ${functionName}`);
    return { ok: false, status: 0, data: null, error: 'internal auth not configured' };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': anonKey,
    'x-internal-caller': callerName,
    'x-internal-edge-secret': internalSecret,
    'Authorization': `Bearer ${anonKey}`,
  };

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
