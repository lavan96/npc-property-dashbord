# WP-11B/C — Cookie-only staff sessions rollout

Status: **Phase B/C frontend cutover shipped** (backend + frontend hardened;
legacy dual-read window still open on the receivers).

## What shipped in this pass (Phase 2 / frontend)

1. `src/hooks/useAuth.tsx`
   - Removed durable `localStorage` mirror. Access-token JWT persists only
     in tab-scoped `sessionStorage`.
   - Staff session token is no longer written to any web-storage backend;
     an in-memory-only copy is kept as a legacy header/body fallback while
     the `__Host-session_token` cookie is the authoritative carrier.
   - `invokeEdgeFunction()` now sends `credentials: 'include'` so the
     HttpOnly cookie is attached automatically.
   - `checkSession()` no longer preflights web-storage; it always calls
     `custom-auth-verify` and lets the cookie authenticate the request.

2. `src/hooks/useFinancePortalAuth.tsx`
   - Same treatment: in-memory-only session token, `credentials: 'include'`
     on both the primary invoker and the 401 re-verify probe, scrub of
     legacy `localStorage`/`sessionStorage` mirrors on module load,
     unconditional server-side session verify on mount.

3. `src/hooks/useAuthenticatedSupabase.ts`
   - `getAuthenticatedSupabaseClient()` no longer reads from
     `localStorage`; only tab-scoped `sessionStorage` is consulted.

4. `src/lib/secureInvoke.ts`, `src/lib/streamSecureFunction.ts`
   - Flipped from `credentials: 'omit'` to `credentials: 'include'` so
     every staff edge-function call participates in the cookie session.



1. `supabase/functions/_shared/auth.ts`
   - `extractSessionToken()` now prefers `__Host-session_token` and falls back
     to legacy `session_token` (dual-read window).
   - `createSessionCookie()` emits the host-prefixed name only. Browsers
     reject `__Host-` cookies that are not `Secure`, that carry a `Domain`
     attribute, or that use a `Path` other than `/`, so the prefix mechanically
     enforces the invariants WP-11B requires.
   - `createClearSessionCookies()` clears BOTH names on logout so a legacy
     cookie cannot resurrect a session after sign-out.

2. `scripts/security/wp15-negative-tests.mjs` — runnable NT-05/06/07/09/09b/11
   harness against the deployed environment. Writes JSONL evidence under
   `docs/security/wp15-evidence/<date>/negative-tests.jsonl`.

## Remaining WP-11B/C work (frontend + login issuers)

The following must land before the legacy cookie name and the
`sessionStorage`/`localStorage` token stash can be removed:

### Backend login/refresh issuers

Every function that issues a session cookie must call `createSessionCookie()`
(now `__Host-`) and must **stop** returning the raw token in the JSON body.
Grep target list:

```
rg -n "createSessionCookie|session_token=" supabase/functions --glob '!_shared/**'
```

Confirmed issuers (non-exhaustive): `auth-login`, `auth-refresh-session`,
`portal-login`, `finance-portal-login`, `security-step-up` (proof cookie).

### Frontend

Files that persist the raw token to storage must be reduced to cookie-only:

- `src/hooks/useAuth.tsx` — remove `sessionStorage.setItem('supabase_access_token', …)`
  and its `localStorage` mirror. Rely on the `__Host-session_token` cookie set
  by the login response; send `credentials: 'include'` on every edge-function
  call.
- `src/hooks/useAuthenticatedSupabase.ts` — replace the sessionStorage read
  with a `whoami`-style edge call that returns the derived roles.
- `src/hooks/useFinancePortalAuth.tsx` — same pattern for the finance portal
  session cookie (already namespaced separately).
- `src/lib/security/stepUp.ts` — the step-up proof token can remain in
  `sessionStorage` **only** until we mint it as an HttpOnly cookie (planned as
  WP-11C-Step-up follow-up). It is short-lived and single-capability, so this
  gap is documented rather than blocking Phase B rollout.

### CORS

All authenticated edge functions already include `Access-Control-Allow-Credentials: true`
in `createCorsHeaders()`. Frontend fetches must set `credentials: 'include'`
consistently — audit with:

```
rg -n "fetch\\(.+functions/v1" src | rg -v "credentials:"
```

### Cutover order

1. Deploy backend receivers (already done in this pass — dual-read).
2. Update login/refresh issuers to emit `__Host-` cookie only.
3. Ship frontend change: remove storage token stash; add
   `credentials: 'include'` audit.
4. Run WP-15 negative tests + smoke both portals for one week.
5. Delete the legacy `session_token` fallback branch from `extractSessionToken`.

## Verification

- Static: `node scripts/security/wp15-negative-tests.mjs` (needs env vars).
- Live: check DevTools → Application → Cookies for `__Host-session_token`
  with attributes `HttpOnly`, `Secure`, `SameSite=None`, `Path=/`, no
  `Domain`. If `Domain` is present or the prefix is stripped, the browser
  rejected the cookie — inspect the server response.
