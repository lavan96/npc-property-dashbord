import { createCorsHeaders } from "../_shared/auth.ts";
import {
  enforceGlobalCircuitBreaker,
  enforceGlobalDailyQuota,
  enforceIpQuota,
  enforceKeyQuota,
  fetchWithTimeout,
  getClientIp,
  killSwitchActive,
  recordProviderFailure,
  recordProviderSuccess,
  redactError,
  sanitizeShortText,
} from "../_shared/publicAbuseControls.ts";

// WP-10 — Google Places autocomplete abuse controls.
//   * Per-IP + per-session + global daily quotas.
//   * Input cap + control-char reject.
//   * Response projection (only fields callers actually need).
//   * Timeout + circuit breaker + redacted upstream errors.
//   * Kill switch: GOOGLE_PLACES_KILL_SWITCH.

const CIRCUIT_SCOPE = 'google_places';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const j = (payload: unknown, status = 200) => new Response(
    JSON.stringify(payload),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );

  if (killSwitchActive('GOOGLE_PLACES_KILL_SWITCH')) {
    return j({ error: 'temporarily_unavailable', success: false }, 503);
  }

  const breaker = enforceGlobalCircuitBreaker(CIRCUIT_SCOPE, { failureThreshold: 20, openMs: 60_000 });
  if (!breaker.ok) return j({ error: 'temporarily_unavailable', success: false }, 503);

  try {
    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!apiKey) return j({ error: 'Places service not configured', success: false }, 500);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const input = sanitizeShortText(body.input, 120);
    const sessionToken = sanitizeShortText(body.sessionToken, 64);

    if (!input || input.length < 3) return j({ success: true, predictions: [] });

    const ip = getClientIp(req);

    // Atomic quotas — layered.
    const ipCheck = enforceIpQuota(ip, 'google_places', { limit: 30, windowMs: 60_000 });
    if (!ipCheck.ok) return j({ error: 'rate_limited', success: false }, 429);
    if (sessionToken) {
      const sess = enforceKeyQuota(sessionToken, 'google_places_session', { limit: 60, windowMs: 60_000 });
      if (!sess.ok) return j({ error: 'rate_limited', success: false }, 429);
    }
    const dailyCap = Number(Deno.env.get('GOOGLE_PLACES_DAILY_LIMIT') ?? '5000');
    const globalCheck = enforceGlobalDailyQuota('google_places', dailyCap);
    if (!globalCheck.ok) return j({ error: 'daily_quota_exceeded', success: false }, 429);

    const params = new URLSearchParams({
      input,
      types: 'address',
      components: 'country:au',
      key: apiKey,
      ...(sessionToken ? { sessiontoken: sessionToken } : {}),
    });

    let response: Response;
    try {
      response = await fetchWithTimeout(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`,
        {},
        5000,
      );
    } catch (e) {
      recordProviderFailure(CIRCUIT_SCOPE, { failureThreshold: 20, openMs: 60_000 });
      console.warn('[google-places-autocomplete] upstream timeout/abort', redactError(e));
      return j({ error: 'upstream_timeout', success: false }, 504);
    }

    const data = await response.json().catch(() => ({}));

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      recordProviderFailure(CIRCUIT_SCOPE, { failureThreshold: 20, openMs: 60_000 });
      console.error('Google Places API error:', data.status);
      return j({ error: 'upstream_error', success: false }, 502);
    }

    recordProviderSuccess(CIRCUIT_SCOPE);

    // Response projection — never leak arbitrary provider fields.
    const predictions = (data.predictions || []).slice(0, 10).map((p: Record<string, unknown>) => ({
      placeId: String(p.place_id ?? '').slice(0, 200),
      description: String(p.description ?? '').slice(0, 300),
      mainText: String((p.structured_formatting as Record<string, unknown>)?.main_text ?? '').slice(0, 200),
      secondaryText: String((p.structured_formatting as Record<string, unknown>)?.secondary_text ?? '').slice(0, 200),
    }));

    return j({ success: true, predictions });
  } catch (error) {
    console.error('Places autocomplete error:', error);
    return j({ error: redactError(error), success: false }, 500);
  }
});
