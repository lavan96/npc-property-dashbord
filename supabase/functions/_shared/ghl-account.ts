/**
 * Shared GoHighLevel account credential resolver.
 *
 * Allows edge functions to dynamically choose between the LEGACY GHL account
 * (the long-running production account) and the NEW GHL account being
 * migrated to, without duplicating sync infrastructure.
 *
 * Default = 'legacy' so every existing function keeps its current behaviour
 * unless a caller explicitly opts into the new account.
 */

export type GhlAccount = 'legacy' | 'new';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

export interface GhlCredentials {
  apiKey: string | undefined;
  locationId: string | undefined;
  label: GhlAccount;
}

export interface GhlTokenDiagnostics {
  token_format: 'jwt' | 'opaque' | 'missing';
  token_type_hint: 'sub_account' | 'agency_or_main' | 'unknown';
  has_location_id: boolean;
  location_id_matches_secret: boolean | null;
  has_company_id: boolean;
  expires_at: string | null;
  exchange_attempted?: boolean;
  exchange_succeeded?: boolean;
  exchange_error?: string;
}

export interface GhlResolvedAccessToken {
  accessToken: string;
  diagnostics: GhlTokenDiagnostics;
}

export function getGhlCredentials(account: GhlAccount = 'legacy'): GhlCredentials {
  if (account === 'new') {
    return {
      apiKey: Deno.env.get('GOHIGHLEVEL_API_KEY_NEW'),
      locationId: Deno.env.get('GOHIGHLEVEL_LOCATION_ID_NEW'),
      label: 'new',
    };
  }
  return {
    apiKey: Deno.env.get('GOHIGHLEVEL_API_KEY'),
    locationId: Deno.env.get('GOHIGHLEVEL_LOCATION_ID'),
    label: 'legacy',
  };
}

/**
 * Validates that credentials exist for the chosen account; returns a
 * friendly error message if not, otherwise null.
 */
export function validateGhlCredentials(creds: GhlCredentials): string | null {
  if (!creds.apiKey || !creds.locationId) {
    const missing: string[] = [];
    if (!creds.apiKey) missing.push(`GOHIGHLEVEL_API_KEY${creds.label === 'new' ? '_NEW' : ''}`);
    if (!creds.locationId) missing.push(`GOHIGHLEVEL_LOCATION_ID${creds.label === 'new' ? '_NEW' : ''}`);
    return `Missing GHL ${creds.label} credentials: ${missing.join(', ')}`;
  }
  return null;
}

/**
 * Build standard GHL API request headers.
 */
export function buildGhlHeaders(apiKey: string, version: string = '2021-07-28') {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Version': version,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
}

function decodeJwtPayload(token: string | undefined): Record<string, any> | null {
  if (!token || !token.startsWith('eyJ')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function getGhlTokenDiagnostics(creds: GhlCredentials): GhlTokenDiagnostics {
  if (!creds.apiKey) {
    return {
      token_format: 'missing',
      token_type_hint: 'unknown',
      has_location_id: false,
      location_id_matches_secret: null,
      has_company_id: false,
      expires_at: null,
    };
  }

  const payload = decodeJwtPayload(creds.apiKey);
  if (!payload) {
    return {
      token_format: creds.apiKey.startsWith('eyJ') ? 'jwt' : 'opaque',
      token_type_hint: 'unknown',
      has_location_id: false,
      location_id_matches_secret: null,
      has_company_id: false,
      expires_at: null,
    };
  }

  const tokenLocationId = payload.locationId || payload.location_id || null;
  const tokenCompanyId = payload.companyId || payload.company_id || null;

  return {
    token_format: 'jwt',
    token_type_hint: tokenLocationId ? 'sub_account' : tokenCompanyId ? 'agency_or_main' : 'unknown',
    has_location_id: Boolean(tokenLocationId),
    location_id_matches_secret: tokenLocationId && creds.locationId ? tokenLocationId === creds.locationId : null,
    has_company_id: Boolean(tokenCompanyId),
    expires_at: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
  };
}

/**
 * Contact/opportunity/note writes require a GHL Sub-Account token. If an
 * agency/main OAuth token is supplied and it carries companyId, exchange it
 * for a location token before making write calls.
 */
export async function resolveGhlAccessTokenForLocation(creds: GhlCredentials): Promise<GhlResolvedAccessToken> {
  const diagnostics = getGhlTokenDiagnostics(creds);
  if (!creds.apiKey) throw new Error(`Missing GHL ${creds.label} API key`);

  if (diagnostics.token_type_hint !== 'agency_or_main') {
    return { accessToken: creds.apiKey, diagnostics };
  }

  const payload = decodeJwtPayload(creds.apiKey);
  const companyId = payload?.companyId || payload?.company_id;
  if (!companyId || !creds.locationId) {
    return {
      accessToken: creds.apiKey,
      diagnostics: {
        ...diagnostics,
        exchange_attempted: false,
        exchange_succeeded: false,
        exchange_error: 'Token appears to be agency/main level, but companyId or locationId is unavailable for location-token exchange.',
      },
    };
  }

  const exchangeDiagnostics: GhlTokenDiagnostics = {
    ...diagnostics,
    exchange_attempted: true,
    exchange_succeeded: false,
  };

  try {
    const body = new URLSearchParams({ companyId, locationId: creds.locationId });
    const response = await fetch(`${GHL_API_BASE}/oauth/locationToken`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${creds.apiKey}`,
        'Version': '2021-07-28',
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const text = await response.text();
    if (!response.ok) {
      return {
        accessToken: creds.apiKey,
        diagnostics: {
          ...exchangeDiagnostics,
          exchange_error: `Location token exchange failed: ${response.status} ${text.substring(0, 220)}`,
        },
      };
    }

    const data = JSON.parse(text || '{}');
    if (!data.access_token) {
      return {
        accessToken: creds.apiKey,
        diagnostics: {
          ...exchangeDiagnostics,
          exchange_error: 'Location token exchange succeeded but returned no access_token.',
        },
      };
    }

    return {
      accessToken: data.access_token,
      diagnostics: {
        ...exchangeDiagnostics,
        exchange_succeeded: true,
      },
    };
  } catch (err: any) {
    return {
      accessToken: creds.apiKey,
      diagnostics: {
        ...exchangeDiagnostics,
        exchange_error: `Location token exchange threw: ${err.message || 'Unknown error'}`,
      },
    };
  }
}

export function describeGhlWriteAuthFailure(diagnostics: GhlTokenDiagnostics): string {
  if (diagnostics.token_type_hint === 'agency_or_main') {
    const exchange = diagnostics.exchange_attempted
      ? diagnostics.exchange_succeeded
        ? 'Location-token exchange succeeded, but GHL still rejected the write token.'
        : diagnostics.exchange_error || 'Location-token exchange failed.'
      : diagnostics.exchange_error || 'No location-token exchange was possible.';
    return `GHL write rejected. The configured token appears to be an Agency/Main token; contacts/upsert requires a Sub-Account token. ${exchange}`;
  }

  if (diagnostics.token_type_hint === 'sub_account' && diagnostics.location_id_matches_secret === false) {
    return 'GHL write rejected. The token is a Sub-Account token, but its embedded locationId does not match GOHIGHLEVEL_LOCATION_ID_NEW.';
  }

  return 'GHL write rejected. Confirm the token is a Sub-Account Private Integration/OAuth token with contacts.write for the configured location.';
}
