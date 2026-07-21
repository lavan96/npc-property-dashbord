# Live Backend Security Audit Evidence — 21 July 2026

Read-only audit of the production Supabase project (`dduzbchuswwbefdunfct`,
Postgres 17.4) run as part of the Backend Security Remediation Program
(Appendix B queries + Supabase security advisors). No live changes were made
during this audit; all remediation in this branch is repository-side and must
be applied through the deployment order at the bottom of this document.

## 1. Headline live findings

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | Critical | `password_reset_tokens` had a `{public}` `ALL` policy with `qual=true` — any PostgREST caller with the (published) anon key could read plaintext reset OTPs | Fix in this branch: policy dropped (phase 7 migration) + OTPs hashed at rest (phase 6 code) |
| 2 | Critical | `notifications` world-readable/updatable/deletable (`qual=true`, `{public}`) | Fix in this branch (phase 7 migration + frontend client change) |
| 3 | High | Storage buckets `client-files`, `email-attachments`, `investment-reports`, `qa_exports` are **public buckets** — objects are fetchable unauthenticated by URL | **Open — requires coordinated change** (see §4) |
| 4 | High | `_shared/auth.ts` trusted decoded JWT claims (forged `role=service_role` / `sub`) in `verify_jwt=false` functions | Fix in this branch (phase 1) — requires function redeploy |
| 5 | High | 70 tables carry `rls_policy_always_true` policies, including `user_roles`, `user_permissions`, `permission_invite_tokens`, `whitelabel_settings`, `activity_logs` | Open — next RLS tranche (see §3) |
| 6 | Error | 3 `SECURITY DEFINER` views exposed via API: `client_portfolio_properties`, `purchase_file_activity_feed`, `v_purchase_file_deal_drift` | Open |
| 7 | Warn | 116 `SECURITY DEFINER` functions executable by `anon`/`authenticated`; 8 functions with mutable `search_path` | Open |
| 8 | Warn | Postgres version has outstanding security patches; Auth leaked-password protection disabled | Open — platform settings |

## 2. Supabase security advisor summary (357 lints)

| Level | Lint | Count |
|-------|------|-------|
| ERROR | security_definer_view | 3 |
| WARN | anon_security_definer_function_executable | 116 |
| WARN | authenticated_security_definer_function_executable | 116 |
| WARN | rls_policy_always_true | 87 (70 distinct tables) |
| WARN | function_search_path_mutable | 8 |
| WARN | public_bucket_allows_listing | 2 (`branding-assets`, `lead-magnets`) |
| WARN | extension_in_public | 2 (`vector`, `pg_net`) |
| WARN | materialized_view_in_api | 1 (`pdf_import_cost_daily`) |
| WARN | vulnerable_postgres_version | 1 |
| WARN | auth_leaked_password_protection | 1 |
| INFO | rls_enabled_no_policy | 20 (deny-all by default — safe, but service-role-only access should be made explicit) |

Remediation reference: https://supabase.com/docs/guides/database/database-linter

## 3. `rls_policy_always_true` tables (next RLS tranche, priority order)

**Priority A (auth/permission surface):** `user_roles`, `user_permissions`,
`permission_invite_tokens`, `password_reset_tokens`*, `notifications`*,
`whitelabel_settings`, `dashboard_modules`.

**Priority B (client data):** `client_deals`, `client_income_sources`,
`client_address_history`, `client_portal_messages`,
`client_portal_notifications`, `finance_agent_contacts`, `game_plans` (+
`game_plan_*`), `generated_reports`, `report_versions`, `activity_logs`,
`api_usage_log`.

**Priority C (reference/cache data — may legitimately stay broad for reads
but not writes):** `*_cache` tables, `suburb_directory`, `schools_directory`,
`land_tax_*`, `deal_stages`, `design_tokens`, `charts`,
`checklist_template_*`, `template_*`, `marketing_*`.

\* fixed by this branch's phase 7 migration once applied.

## 4. Public storage buckets holding sensitive data (open, coordinated fix)

`client-files`, `email-attachments`, `investment-reports` and `qa_exports`
are `public = true`: any object URL is fetchable without authentication.
Flipping them private is the right end state (STOR-004) but will break every
stored `pdf_url`/public link currently persisted in `investment_reports` and
email flows, so it must ship together with:

1. signed-URL generation replacing `getPublicUrl` in the report pipeline
   (`PixelPerfectPDFGenerator` step 8) and portal-share flows;
2. a backfill that rewrites stored public URLs to storage paths;
3. bucket flip `public → private` + cache invalidation.

Until then the secure-storage proxy hardening in this branch limits what the
proxy will do, but direct URL access to already-public objects remains.

## 5. What this branch changes (deploy order)

Per the remediation plan §21.2, deploy in this order:

1. **Migration `20260721000000`** (additive: nonce/security-event tables,
   lockout + attempt columns, `owner_user_id` + backfill). Safe to apply
   ahead of function deploys.
2. **Edge functions** (auth.ts fix + hardened functions):
   `secure-storage`, `get-email-data`, `outlook-email-sync`,
   `send-email-reply`, `custom-auth-login`, `client-portal-login`,
   `finance-portal-login`, `admin-password-reset`,
   `client-portal-forgot-password`, `client-portal-reset-password`,
   `finance-portal-forgot-password`, `finance-portal-reset-password`,
   `market-updates-ingest` — plus every function that imports
   `_shared/auth.ts` (shared module is bundled per-function, so a bulk
   redeploy is required for the F-01 fix to take effect everywhere).
3. **Frontend deploy** (NotificationsContext authenticated client).
4. **Migration `20260721000001`** (RLS tightening) — after 2 and 3 are live,
   since the notifications policies assume the JWT-bearing client and the
   email scoping assumes owner stamping is in place.
5. Optional env: set `REQUIRE_TURNSTILE=true` (with `TURNSTILE_SECRET_KEY`
   set) to make CAPTCHA fail closed; set `INTERNAL_EDGE_SECRET` to enable
   the HMAC internal-call envelope; set `RESET_TOKEN_PEPPER` for peppered
   reset-token hashes.

Rollback: migrations are additive except policy swaps; re-creating the prior
policies restores previous behaviour (do **not** re-create the
`password_reset_tokens` public policy — that is the exploitable state the
plan forbids returning to).

## 6. Verification checklist after deploy (acceptance tests)

- Forged JWT (`alg=none`, modified `sub`, `role=service_role`) → 401 on any
  `verify_jwt=false` function using `verifyAuth`.
- Anon-key PostgREST read of `password_reset_tokens` / `notifications` → 0
  rows / permission denied.
- Non-superadmin `outlook-email-sync action=clear` → 403 + `security_events`
  row.
- Cross-user personal `email_id` fetch via `get-email-data` → 404.
- `secure-storage` `publicUrl` on `client-files` → 403; path with `..` → 400;
  6th wrong reset OTP → token invalidated.
- 5 failed staff/client-portal logins → 429 lockout for 15 minutes.
