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

export interface GhlCredentials {
  apiKey: string | undefined;
  locationId: string | undefined;
  label: GhlAccount;
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
