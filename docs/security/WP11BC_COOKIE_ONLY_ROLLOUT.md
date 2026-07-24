# WP-11B/C — Cookie-only staff sessions rollout

Status: **Phase B in progress** (backend hardened, frontend migration staged).

## What shipped in this pass

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
