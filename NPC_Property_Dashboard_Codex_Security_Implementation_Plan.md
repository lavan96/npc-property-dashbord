# NPC Property Dashboard
## Codex-Optimized Backend Security Implementation Plan

**Repository:** `lavan96/npc-property-dashbord`  
**Baseline commit:** `de6987f6064f2b056e33655943908f50f3b10a50`  
**Baseline assessment:** 54/100, production security sign-off blocked  
**Target:** ≥90/100, zero open Critical or High findings, verified source/deployment parity  
**Primary platform:** Supabase/Postgres, Supabase Edge Functions/Deno, custom staff auth, client portal auth, finance portal auth, Microsoft Graph, GHL, Airtable, ManyChat, OpenAI/Lovable AI, Google Places, storage, background workers, webhooks and cron jobs.

---

# 1. How to use this plan with Codex

Do **not** give the entire remediation program to one Codex task and ask it to “fix everything.” Execute it as a sequence of focused pull requests. A task may inspect the whole repository, but its write scope must remain bounded to the work package named in the prompt.

Recommended workflow:

1. Start every task from the exact latest `main`.
2. Give Codex the root `AGENTS.md` from Section 3.
3. Run Work Package 00 first.
4. Run shared-auth and internal-auth work sequentially; they touch fleet-wide trust boundaries.
5. Run independent endpoint groups in parallel only after the shared primitives are merged.
6. Require each task to add tests before or alongside behavior changes.
7. Require a clean commit, a concise threat-model summary, the commands run, test output, migration/deployment order and residual risks.
8. Do not allow Codex to deploy to production, rotate secrets, or execute destructive database operations unless a separate owner-approved deployment task explicitly authorizes it.

## 1.1 Required Codex completion format

Every Codex task must finish with:

1. **Threat fixed** — exact pre-fix attack path.
2. **Files changed** — paths and purpose.
3. **Database changes** — migration names, grants, RLS, indexes and rollback considerations.
4. **Security properties now enforced** — authentication, authorization, resource binding, rate limits, idempotency and auditability.
5. **Tests added** — positive and negative cases.
6. **Commands run** — exact commands and results.
7. **Deployment order** — code, secrets, migrations and frontend ordering.
8. **Residual risk** — anything not proven or intentionally deferred.
9. **Commit** — resulting commit SHA and clean worktree confirmation.

---

# 2. Security invariants for every implementation task

These are non-negotiable. Codex must reject a design that violates any item.

1. **Header presence is never authentication.** A Bearer value must be cryptographically verified or compared to a dedicated secret with constant-time comparison.
2. **A request-body field never confers trust.** Fields such as `source`, `role`, `user_id`, `is_admin`, `scheduled`, `internal` and `_service_token` are data, not identity.
3. **Missing security configuration fails closed.** Missing webhook, cron, HMAC, CAPTCHA, metering or token-pepper secrets must disable the protected path with `401`, `403` or `503`; never silently allow it.
4. **The Supabase service-role key is never used as an HTTP credential.** It remains only inside a function process to create a server-side Supabase client.
5. **Authentication and authorization are separate.** A valid session does not imply permission to use every feature.
6. **Authorization is action- and resource-specific.** Check module permission, record ownership/client assignment, share permission and state transition immediately before the sensitive operation.
7. **Service-role database access must be mediated.** Every service-role query must be preceded by explicit in-function authorization unless the function is strictly signed-internal-only.
8. **Sensitive storage reads require object binding.** Bucket access or module access alone is insufficient.
9. **Public and paid endpoints require abuse controls.** Apply body limits, CAPTCHA where appropriate, per-IP/per-actor quotas, global circuit breakers and provider spend limits.
10. **Webhooks and cron jobs are replay-safe and fail closed.** Use mandatory strong secrets or signed request envelopes, timestamps/nonces where practical and idempotency keys.
11. **No mass assignment.** Construct insert/update objects from explicit allowlists and validated schemas.
12. **Errors returned to clients are generic.** Upstream bodies, SQL errors, Graph errors, tokens, object paths and secrets stay in structured server logs.
13. **Security-sensitive migrations are idempotent and reversible where possible.** Pin `search_path` on `SECURITY DEFINER`, revoke `PUBLIC`, `anon` and `authenticated` execution unless explicitly required.
14. **All changes require negative tests.** A passing happy path alone is not security evidence.
15. **No placeholders, TODO-only fixes or comment-only remediation.** The task is incomplete unless enforcement exists in code and tests.

---

# 3. Root `AGENTS.md` to add before implementation

Create the following file at repository root. Codex should read it before every subsequent task.

```md
# AGENTS.md — NPC Property Dashboard

## Mission

Maintain and improve the NPC Property Dashboard without weakening its backend
security. This repository handles client PII, financial information, email,
documents, Microsoft Graph, GHL, Airtable, ManyChat, paid AI APIs, storage,
webhooks and scheduled automation.

## Security trust boundaries

- Supabase Edge Functions frequently create service-role clients. The service
  role bypasses RLS, so in-function authentication and authorization are the
  primary trust boundary.
- `verify_jwt=false` at the gateway is acceptable only when the function performs
  strict in-function authentication appropriate to its exposure class.
- Human authentication, portal authentication, internal-service authentication,
  webhooks and public endpoints are distinct classes. Never blend them.
- Request data never establishes identity or service trust.
- The Supabase service-role key must never be sent between functions.
- Internal edge-to-edge traffic must use signed internal requests or a dedicated
  fail-closed credential approved for that exact receiver.
- Public endpoints using paid providers require quotas, request limits and a
  global kill switch.

## Existing shared modules

Prefer extending and consolidating these rather than creating competing auth
libraries:

- `supabase/functions/_shared/auth.ts`
- `supabase/functions/_shared/auth_v2.ts`
- `supabase/functions/_shared/authz.ts`
- `supabase/functions/_shared/permissions.ts`
- `supabase/functions/_shared/internalCall.ts`
- `supabase/functions/_shared/resetTokens.ts`
- `supabase/functions/_shared/notify.ts`
- `supabase/functions/_shared/reportMetering.ts`

New code must use deny-by-default helpers. Do not use allow-by-default behavior
for new or remediated sensitive paths.

## Required workflow

1. Inspect `git status`, current commit and relevant security docs before editing.
2. Trace every caller and consumer of a changed function.
3. Write or update negative tests for the vulnerability before completing the fix.
4. Keep migrations idempotent. Never edit an already-applied migration to change
   production behavior; add a new migration.
5. Do not deploy, rotate secrets or mutate production from a normal coding task.
6. Do not weaken a control merely to preserve compatibility. Use a staged
   migration, feature flag or compatibility window that remains fail closed.
7. Do not include secrets, real client data or access tokens in tests, fixtures,
   logs, commits or documentation.
8. Finish with a committed change and a clean worktree.

## Required validation

Run all commands relevant to the touched surface, including:

- `node scripts/security/check-function-registry.mjs`
- `node scripts/security/scan-auth-patterns.mjs`
- `npm run build`
- affected Vitest suites
- affected Deno tests
- `deno check` on every changed Edge Function and shared module
- migration lint/local database tests when SQL changes

If a required command cannot run, explain exactly why and provide the safest
reproducible owner command. Do not report success for an unexecuted test.

## Review checklist

Before committing, confirm:

- invalid, expired and forged credentials are rejected;
- missing secrets fail closed;
- low-privilege users cannot access another user/client/resource;
- internal callers cannot impersonate arbitrary callers;
- no service-role key appears in an inter-function request;
- paid-provider calls are metered or quota-limited;
- storage paths are bound to an authorized database record;
- mutations use explicit fields and valid state transitions;
- audit logs identify actor, action, target, decision and correlation ID;
- client responses do not contain sensitive provider/database details.
```

---

# 4. Master Codex task prompt

Use this prefix for every work package and append the package-specific instructions.

```text
You are working in the GitHub repository lavan96/npc-property-dashbord.

Read the root AGENTS.md and the current security documentation before editing.
Confirm the current HEAD and do not assume the baseline commit is still HEAD.
This is a security remediation task. Work read-first, then implement, test and
commit. Do not deploy or modify production.

Security constraints:
- fail closed;
- no request-body trust;
- no service-role key over HTTP;
- cryptographically verify credentials;
- enforce action-level and object-level authorization;
- no mass assignment;
- no raw provider/database errors to clients;
- add negative tests;
- keep migrations idempotent and revoke PUBLIC/anon/authenticated privileges on
  privileged SECURITY DEFINER functions;
- do not leave TODO-only remediation or compatibility bypasses.

Before changing code:
1. map every caller and consumer of the target;
2. identify current auth class, service-role use, data touched and paid providers;
3. state the exploit precondition and expected post-fix security property.

After changing code:
1. run the relevant security scripts, Deno checks, unit/integration tests and build;
2. update SECURITY_REGISTRY.json and security docs;
3. provide threat fixed, files changed, tests, commands/results, deployment order,
   residual risk and commit SHA;
4. leave the worktree clean.
```

---

# 5. Dependency and parallelization map

## Sequential foundation

- **WP-00** Repository/Codex guardrails
- **WP-01** Strict authentication, request-limit and rate-limit primitives
- **WP-02** Market AI endpoint containment
- **WP-03** Signed cron and Market job orchestration
- **WP-12** Complete internal HMAC migration and remove legacy trust paths

Do not run tasks that modify `auth.ts`, `auth_v2.ts` or `internalCall.ts` in
parallel.

## Safe parallel group after WP-01

- **WP-04** Web Push
- **WP-06** Storage object authorization
- **WP-07** Report Q&A ownership
- **WP-08** Airtable/ManyChat/GHL
- **WP-09A** Generated documents/DocuSign
- **WP-10** Public endpoint and paid-API abuse controls

## Sequential high-conflict group

- **WP-05A** AI tool policy framework
- **WP-05B** AI read-tool authorization
- **WP-05C** AI write/destructive/scheduled authorization
- **WP-09B** Compliance and commission transaction controls
- **WP-11A/B/C** Session and step-up migration
- **WP-13** Remaining defense-in-depth
- **WP-14** Final CI gate
- **WP-15** Deployment verification and pentest gate

---

# 6. Work Package 00 — establish a trustworthy remediation baseline

## Objective

Make every later Codex task reproducible, measurable and prevented from silently
adding another unreviewed function.

## Files

- `AGENTS.md` — add Section 3 content.
- `docs/security/CODEX_SECURITY_REMEDIATION_TRACKER.md`
- `scripts/security/security-inventory.mjs`
- `package.json`
- `.github/workflows/ci.yml`
- `supabase/functions-registry/SECURITY_REGISTRY.json`

## Implementation

1. Record:
   - current HEAD;
   - Edge Function count;
   - `verify_jwt=false` count;
   - exposure-class counts;
   - `needs-review` count;
   - functions importing each shared auth module;
   - inter-function caller/receiver graph where statically derivable.
2. Add a machine-readable remediation tracker with:
   - finding ID;
   - severity;
   - file/function;
   - owner;
   - PR/commit;
   - source fixed;
   - deployed;
   - live negative test;
   - residual risk.
3. Add scripts that fail on:
   - missing registry entry;
   - duplicate `config.toml` declaration;
   - registry/config drift;
   - an unreviewed new function;
   - an empty or invalid exposure class.
4. Do not yet fail the build merely because the historical backlog exists. Create
   a baseline file with exact entries and require the count to decrease or stay
   unchanged. WP-14 removes the baseline and requires zero.
5. Add package scripts:
   - `security:inventory`
   - `security:registry`
   - `security:static`
   - `security:edge-check`
   - `security:test`
6. Document current staged migrations and whether each is code-dependent.

## Tests and acceptance criteria

- Inventory output is deterministic.
- Adding a temporary unregistered function causes the registry test to fail.
- Adding a duplicate config declaration causes failure.
- Increasing `needs-review` causes failure.
- No production behavior changes.

## Copy-paste Codex task

```text
Execute Work Package 00 from docs/security/CODEX_SECURITY_IMPLEMENTATION_PLAN.md.
Add the root AGENTS.md, deterministic security inventory, machine-readable
remediation tracker and CI baseline controls. Do not alter runtime behavior.
Prove the guard scripts fail on synthetic violations, then remove the synthetic
changes. Commit the result.
```

---

# 7. Work Package 01 — strict shared authentication and abuse-control primitives

## Objective

Provide one reusable, tested way to authenticate human, portal, webhook, cron and
internal-service callers and one reusable way to enforce body limits and quotas.

## Primary files

- `supabase/functions/_shared/auth.ts`
- `supabase/functions/_shared/auth_v2.ts`
- `supabase/functions/_shared/authz.ts`
- `supabase/functions/_shared/internalCall.ts`
- new `supabase/functions/_shared/requestSecurity.ts`
- new Deno tests under `supabase/functions/_shared/tests/`
- new migration only if rate-limit/nonce schema changes are required

## Required APIs

Codex may adjust names, but the capabilities must be explicit:

```ts
verifyHuman(...)
verifyPortalSession(...)
verifyFinancePortalSession(...)
verifySignedInternal(...)
verifyRequiredWebhookSecret(...)
verifyRequiredCronSecret(...)
requireHumanOrSignedInternal(...)
requireModulePermission(...)
requireSuperadmin(...)
getTrustedClientIp(...)
enforceJsonBodyLimit(...)
enforceBase64Limit(...)
consumeRateLimit(...)
securityJsonError(...)
```

## Requirements

1. `verifyHuman` rejects:
   - missing credentials;
   - anon key;
   - arbitrary Bearer;
   - malformed JWT;
   - invalid signature;
   - expired JWT;
   - inactive user;
   - revoked/expired opaque session.
2. `verifySignedInternal` verifies method, path, body hash, timestamp, nonce,
   caller and HMAC. It must support receiver-side caller allowlists.
3. A static internal secret alone must not be considered equivalent to a signed
   request in new code.
4. `verifyRequiredWebhookSecret` and `verifyRequiredCronSecret`:
   - require a minimum entropy/length;
   - compare in constant time;
   - fail closed when unset;
   - return generic client errors.
5. Rate-limit helper uses an atomic database operation. It accepts a normalized
   key, maximum count and fixed/sliding window, and returns retry metadata.
6. IP extraction trusts only the platform-provided header order documented for
   the deployment; it must not accept a caller-controlled leftmost value without
   normalization.
7. Add correlation IDs and structured security events.
8. Do not remove legacy call paths yet if doing so would break the fleet; mark
   them deprecated and add telemetry. WP-12 removes them.

## Tests

- forged JWT and `alg=none`;
- anon key;
- inactive user;
- expired/revoked session;
- valid human;
- valid signed internal request;
- wrong path/body;
- stale timestamp;
- repeated nonce;
- unapproved caller;
- missing/weak webhook and cron secrets;
- atomic rate-limit boundary and parallel requests;
- body-limit rejection before JSON/base64 allocation.

## Acceptance criteria

- New sensitive functions can use the primitives without custom auth code.
- No helper authorizes from decoded-only JWT claims.
- No new helper sends or accepts the service-role key over HTTP.
- All shared-module tests and Deno checks pass.

---

# 8. Work Package 02 — close Market AI authentication and paid-credit paths

## Scope

- `supabase/functions/market-updates-voice-transcribe/index.ts`
- `supabase/functions/market-updates-qa/index.ts`
- relevant registry/config/CI files
- paid-usage/metering helper if needed

## Threats fixed

- Arbitrary Bearer strings accepted as authentication.
- Invalid JWTs continuing as anonymous users.
- Paid transcription/Q&A without actor attribution or quota.
- Oversize base64 allocation and provider error leakage.

## Implementation requirements

### Voice transcription

1. Authenticate with `verifyHuman`; optionally permit only a signed internal
   caller explicitly allowlisted.
2. Require the existing Market Updates/Market Q&A module’s view permission.
   Inspect existing module keys before adding one. If none exists, add an
   idempotent module migration and document initial permission assignment.
3. Enforce:
   - request `Content-Length` ceiling;
   - base64 character ceiling before decode;
   - decoded byte ceiling;
   - audio MIME allowlist;
   - filename normalization;
   - maximum duration if metadata or provider supports it.
4. Apply per-user and per-IP rate limits.
5. Reserve paid usage before calling the provider; commit or release the
   reservation after the call.
6. Use timeouts and a maximum fallback count.
7. Return generic errors; log provider details server-side with correlation ID.

### Market Q&A

1. Replace header-presence checks with strict human or signed-internal
   authentication.
2. An invalid Bearer credential must return `401`; never continue with
   `userId = null`.
3. Apply module permission, user/IP quotas and a global daily circuit breaker.
4. Bound question length, history count/length, update ID count and response
   tokens.
5. Bind any persisted conversation/question record to the authenticated actor.
6. Meter every provider attempt, including fallbacks.
7. Do not use the service-role key as the credential for internal invocations.

## Tests

- no header, anon key, fake Bearer, forged JWT and expired JWT → no provider call;
- valid user without module permission → `403`;
- valid permitted user → success;
- invalid internal signature and replay → `401`;
- oversize audio rejected before decode;
- rate-limit N+1 request → `429`;
- metering failure → `503`, no paid call;
- provider error does not leak upstream body.

## Definition of done

The functions have no path where unverified callers reach a paid provider or a
service-role query.

---

# 9. Work Package 03 — secure Market cron, digest and fan-out execution

## Scope

At minimum:

- `market-qa-subscriptions`
- `market-qa-digest-runner`
- `market-qa-quality-snapshot`
- `market-updates-digest`
- every Market function with a cron-only or `run-due` action
- all Market inter-function calls

## Implementation

1. Inventory every cron/action trigger and classify it:
   - signed internal;
   - dedicated mandatory cron secret;
   - authenticated admin manual action;
   - intentionally public.
2. For cron paths:
   - missing secret/signature must reject;
   - an absent header must never bypass the check;
   - use constant-time secret verification or signed internal requests;
   - include idempotency/lease protection.
3. Replace `Authorization: Bearer ${SERVICE_KEY}` and `apikey: SERVICE_KEY`
   inter-function calls with the signed internal-call helper and public anon key
   only for gateway routing.
4. Add a database claim/lease mechanism:
   - atomically claim due rows;
   - `FOR UPDATE SKIP LOCKED` or equivalent;
   - worker ID;
   - claimed timestamp;
   - retry count;
   - stale-claim recovery.
5. Cap records and provider calls per run.
6. Do not advance `next_run_at` until work is recorded deterministically.
7. Add unique/idempotency constraints for subscription runs and digest periods.
8. Record actor/caller, run ID, counts, failures and cost usage.
9. Manual admin actions use `verifyHuman` plus admin/module authorization; they
   do not share the cron bypass.

## Tests

- missing/wrong secret;
- arbitrary Authorization header;
- valid signed call;
- replayed signed call;
- two concurrent runners process each due item once;
- repeated run is idempotent;
- provider/metering failure does not mark a run successful;
- max work-per-run enforced.

---

# 10. Work Package 04 — make Web Push an internal, data-derived dispatcher

## Scope

- `supabase/functions/send-web-push/index.ts`
- notification trigger/function that invokes it
- `push_delivery_log` schema/indexes
- registry and tests

## Implementation

1. `send-web-push` becomes signed-internal-only.
2. External input is reduced to an immutable `notification_id` and, if required,
   a delivery-attempt ID.
3. Load the notification row with the service role and derive:
   - target user;
   - subscriber type;
   - title;
   - body;
   - safe application-relative URL;
   - category.
4. Do not accept caller-provided `user_id`, title, body or arbitrary URL.
5. Require the internal caller to be the approved notification dispatcher or DB
   bridge.
6. Add a unique constraint on `(notification_id, subscription_id)` or equivalent
   idempotency key.
7. Permit only relative application routes or an explicit same-origin URL
   allowlist. Reject `javascript:`, `data:`, protocol-relative and external URLs.
8. Add per-user and global delivery ceilings and timeouts.
9. Redact subscription endpoints and VAPID/provider errors from client output.
10. Audit successful and denied dispatches.

## Tests

- anonymous request;
- arbitrary user/title/link injection;
- unapproved internal caller;
- replay/duplicate;
- inactive subscription;
- malicious URL;
- valid notification fan-out.

---

# 11. Work Package 05 — enforce AI-agent tool authorization

This package is intentionally split into three pull requests because
`ai-dashboard-agent` has a very large tool surface.

## WP-05A — policy framework and inventory

### Files

- `supabase/functions/ai-dashboard-agent/index.ts`
- new `supabase/functions/_shared/agentToolAuthz.ts`
- new `scripts/security/check-agent-tool-policies.mjs`
- CI and tests

### Policy model

Every tool must have a policy entry similar to:

```ts
interface ToolSecurityPolicy {
  moduleKey: string | null;
  permission: 'can_view' | 'can_edit' | 'can_delete';
  resourceType?: 'client' | 'deal' | 'conversation' | 'document' | 'report' | 'system';
  resolveResource?: string;
  allowedActorTypes: Array<'human' | 'scheduled' | 'internal'>;
  allowedInternalCallers?: string[];
  requiresConfirmation?: boolean;
  requiresStepUp?: boolean;
  maxBatchSize?: number;
}
```

1. Missing policy means deny.
2. A script extracts every tool switch/registry name and fails when no policy
   exists.
3. `executeTool` receives a verified actor context, not only `userId`.
4. All authorization executes immediately before the tool.
5. External/RAG/email/report text is marked untrusted and cannot change policy.
6. The model cannot supply or override actor, role, permission or client
   assignment.
7. Add structured decision logs.

## WP-05B — read-tool resource authorization

Classify and enforce all read tools:

- client and contacts;
- income/assets/liabilities/employment;
- deals and pipeline;
- emails and calls;
- reports/files;
- commissions;
- users, system health and API usage.

Implement reusable resource resolvers that load the authoritative row and
derive `client_id`, `deal_id`, owner or assignment. Never trust a caller/model
supplied `client_id` when an object ID can be resolved server-side.

Tests must demonstrate that:

- a user without a module is denied;
- a user with the module but no client/resource access is denied;
- a shared/assigned resource is allowed;
- superadmin behavior is explicit and audited.

## WP-05C — writes, confirmations, playbooks and scheduled tasks

1. Every write/destructive tool requires edit/delete permission.
2. High-risk tools require confirmation:
   - email/SMS send;
   - delete client/deal/file;
   - change deal stage or financial status;
   - generate/send agreement;
   - portal invitation/revocation;
   - report generation with paid spend;
   - commission/payout operations.
3. Bind confirmation records to:
   - actor;
   - conversation;
   - tool name;
   - canonical argument hash;
   - expiry;
   - one-time nonce;
   - current permission snapshot.
4. Re-check authorization and resource state at approval time.
5. Scheduled tasks:
   - are created only by an authorized actor;
   - store owner/run-as actor;
   - use a server-side allowlist of schedulable tools;
   - re-check the owner’s current permissions at execution;
   - cannot run as arbitrary `body.user_id`;
   - cannot use a revoked/disabled user.
6. Playbooks cannot introduce unregistered tools.
7. Cap tool calls, batch sizes and paid work.
8. Add prompt-injection regression tests: untrusted report/email text asking the
   agent to ignore policy must not change authorization.

## Completion criteria

- Security-policy inventory covers 100% of agent tools.
- No tool can be executed without a policy decision.
- Conversation access alone never grants cross-module access.

---

# 12. Work Package 06 — object-level storage authorization and private buckets

## Scope

- `supabase/functions/secure-storage/index.ts`
- storage-producing/consuming Edge Functions
- frontend consumers of signed URLs
- storage migrations:
  - STOR-004
  - STOR-005
  - any new metadata/backfill migration
- storage tests

## Preferred architecture

Create a canonical service-only table such as:

```sql
storage_object_bindings (
  id uuid primary key,
  bucket text not null,
  object_path text not null,
  resource_type text not null,
  resource_id uuid,
  client_id uuid,
  owner_user_id uuid,
  sensitivity text not null,
  created_by uuid,
  created_at timestamptz not null,
  unique(bucket, object_path)
)
```

Use existing authoritative tables when practical, but make one resolver the
single authorization entry point.

## Implementation

1. Every upload to a sensitive bucket:
   - validates the parent resource;
   - generates the server-side object path;
   - uploads;
   - creates the binding;
   - rolls back/cleans up on partial failure.
2. Every download/signed URL/delete:
   - loads the binding or authoritative record;
   - verifies module permission;
   - verifies client assignment/ownership/share;
   - returns `404` for unauthorized/nonexistent paths.
3. Sensitive bucket `list`:
   - never lists bucket root;
   - requires a resource ID;
   - derives the prefix server-side;
   - returns only bound authorized objects.
4. Remove caller-controlled arbitrary paths for sensitive uploads.
5. Add legacy per-bucket resolvers only as a temporary backfill path, with
   telemetry and a removal date.
6. Backfill bindings for:
   - client files/documents/VOW forms;
   - email attachments;
   - investment/quantitative reports;
   - QA exports;
   - agency agreements where applicable.
7. Eliminate sensitive `getPublicUrl()` use.
8. Signed URLs are short-lived, download-oriented and never persisted as the
   canonical database value.
9. Apply bucket-private migrations only after all code/frontends are live.
10. Query and verify `storage.objects` policies after deployment.

## Tests

- known cross-client object path;
- authorized and unauthorized module users;
- owner vs non-owner personal email attachment;
- shared report vs unshared report;
- root/prefix enumeration;
- traversal/encoded traversal;
- upload path injection;
- stale binding;
- private bucket direct anon read;
- signed URL expiry.

---

# 13. Work Package 07 — complete Report Q&A ownership and share security

## Scope

- `supabase/functions/report-qa/index.ts`
- Report Q&A share tables/RPCs
- QA export paths
- tests

## Access model

Define:

- **owner** — full control;
- **view share** — read/chat only if product requires;
- **collaborate share** — read/chat/update title/content as explicitly allowed;
- **admin** — audited override;
- **public share** — minimal read-only projection through an unguessable,
  expiring, revocable token.

## Implementation

1. Add one helper/RPC that resolves access from the authoritative conversation
   row and active share.
2. Apply it to every action:
   - list;
   - load;
   - get messages;
   - chat/stream;
   - index reports;
   - update;
   - delete;
   - summarize;
   - export;
   - share/revoke;
   - client-memory read/write.
3. Scope database queries directly; do not select the entire table and filter
   afterward.
4. Validate any linked `client_id` against the caller’s client access.
5. A shared user cannot expand sharing unless policy explicitly grants it.
6. Public shares:
   - use at least 128 bits of randomness;
   - store only a hash;
   - enforce expiry/revocation;
   - return a minimal projection;
   - exclude client memory, internal prompts, raw tool data and hidden metadata;
   - rate-limit resolution;
   - audit views without logging the raw token.
7. Bind QA exports to the owner/share and short-lived signed URLs.
8. Ensure RAG retrieval functions include conversation/client scope in the
   database predicate.

## Tests

- owner;
- view/collaborate share;
- revoked share;
- arbitrary conversation ID;
- update/delete by view-only user;
- link to unauthorized client;
- public token enumeration;
- expired/replayed/revoked public share;
- cross-conversation RAG chunk retrieval.

---

# 14. Work Package 08 — narrow Airtable, ManyChat and GHL delegated credentials

## Airtable

1. Require an existing integrations/listings module permission.
2. `list_tables` is superadmin-only or removed from production.
3. Replace arbitrary `tableName` with a server-side allowlist.
4. Enforce bounded page size, pagination and total records.
5. Return only approved fields for each table.
6. Rate-limit and audit actor/table/action.
7. Redact upstream errors.

## ManyChat

1. Require marketing/integrations permission.
2. Separate metadata actions from subscriber-PII actions.
3. Subscriber search/get requires a stronger permission and audit reason.
4. Minimize returned fields.
5. Validate IDs and custom-field allowlists.
6. Add per-user/provider rate limits.
7. Never return raw provider errors.

## GHL messaging

1. Require conversations edit permission.
2. Resolve `conversationId` to the internal row and authoritative client.
3. Enforce staff client assignment/resource access.
4. Apply channel allowlist, message/subject length, attachment policy and
   recipient policy.
5. Add per-user, per-client and global send quotas.
6. Add idempotency keys to prevent duplicate sends.
7. Audit actor, conversation, client, channel and provider message ID.
8. Do not let ordinary users select alternate GHL account/location credentials.
9. Return generic provider errors.

## Tests

- valid session without module;
- valid module but unauthorized client/conversation;
- arbitrary Airtable table;
- ManyChat PII action by marketing-read-only actor;
- duplicate GHL idempotency key;
- send quota;
- provider error redaction.

---

# 15. Work Package 09A — generated documents and DocuSign

## Scope

- `manage-generated-documents`
- DocuSign shared modules
- generated-document/storage tables
- audit and step-up integration

## Implementation

1. Replace `...(body.data || {})` and broad updates with validated, explicit
   schemas per action.
2. For every document:
   - resolve client/deal/submission;
   - verify record-level access;
   - verify allowed document type;
   - derive storage bucket/path server-side.
3. Remove caller-controlled storage bucket from send/download operations.
4. Use a fixed bucket allowlist and verify the object binding.
5. Define a state machine:
   - draft → prepared → approved → sent → delivered/viewed → signed;
   - voided/cancelled terminal behavior;
   - reject invalid transitions.
6. `send_freeform`:
   - requires edit permission plus recent step-up;
   - validates recipient against client/deal contacts or requires documented
     override approval;
   - validates fields/tabs and maximum counts;
   - computes and records a PDF hash;
   - uses an idempotency key;
   - prevents resend unless explicitly authorized.
7. Append immutable audit events; do not allow caller-supplied audit history.
8. Enforce file size/type and malware/content checks where available.
9. Webhook-originated signature status changes must use a verified DocuSign
   webhook path, not a human-supplied status field.

## Tests

- cross-client document ID;
- arbitrary bucket/path;
- mass assignment of status/generated_by/envelope ID;
- invalid transition;
- send without step-up;
- recipient substitution;
- duplicate send;
- changed PDF after approval;
- valid approved send.

---

# 16. Work Package 09B — compliance and commission integrity

## Compliance

1. Enforce client/deal resource access in addition to module permission.
2. Explicit input schemas; no broad record spread.
3. Signed/DocuSign fields are service/webhook-only.
4. Define valid version and status transitions.
5. Preserve immutable historical versions.
6. Make pack export deterministic and verify every included record belongs to
   the same authorized scope.

## Commission and payout

1. Move money/state-changing operations into transaction-safe database RPCs.
2. RPC requirements:
   - `SECURITY DEFINER`;
   - fixed `search_path`;
   - explicit service-role grant;
   - revoke `PUBLIC`, `anon`, `authenticated`;
   - row locks;
   - state preconditions;
   - idempotency key;
   - immutable audit event.
3. Generate payout and reconcile ledger entries in one transaction.
4. Add unique constraints preventing overlapping duplicate payouts.
5. Implement maker/checker:
   - creator cannot approve/pay own payout;
   - approval and payment require separate authorized actors;
   - payment requires recent step-up/MFA.
6. Never accept arbitrary totals from the caller; calculate from locked ledger
   rows.
7. Reversal/cancellation uses a compensating transaction, not ad hoc updates.
8. Add alerts for unusual amount/count or repeated failures.

## Tests

- cross-client or unauthorized broker;
- duplicate/concurrent generate;
- manipulated totals;
- creator self-approves;
- invalid transition;
- partial failure rollback;
- cancellation restores exactly the affected ledger rows;
- audit immutability.

---

# 17. Work Package 10 — public endpoints and paid-API cost controls

## Public lead magnet

1. Make Turnstile mandatory in production and fail closed.
2. Add honeypot, minimum form-fill time and normalized input validation.
3. Atomic limits:
   - per IP;
   - per normalized email;
   - per magnet;
   - global daily.
4. Deduplicate captures and GHL upserts.
5. Queue provider work rather than fire-and-forget in the request.
6. Add retry/backoff/dead-letter state.
7. Add a global kill switch.
8. Return the magnet only after policy succeeds; do not leak internal errors.

## Google Places

1. Decide whether it is staff-only, portal-only or intentionally public.
2. If public, issue a short-lived server-side application session and enforce
   per-IP/session quotas.
3. Cap input length and reject control characters.
4. Cache identical prefixes briefly.
5. Restrict response fields.
6. Add timeout, global circuit breaker and usage logging.
7. Owner action: restrict the Google key by API and provider-supported source
   controls; set daily quota and billing alerts.

## Tracking pixels and public share resolvers

1. Unknown finance-email tracking tokens must not create stub rows.
2. Use high-entropy tokens and update only an existing authoritative outbound
   record.
3. Add rate limits and data-retention rules for IP/user agent.
4. Public share resolution receives rate limits and minimal data projection.

## Generic paid-provider gate

Implement or extend a reusable helper:

```ts
reserveUsage(...)
commitUsage(...)
releaseUsage(...)
enforceActorQuota(...)
enforceIpQuota(...)
enforceGlobalCircuitBreaker(...)
```

- If metering is configured and reservation fails, reject.
- In production, unmetered paid execution requires an explicit, documented
  emergency feature flag that defaults off.
- Every fallback provider attempt is counted.
- Add timeouts and bounded retries.

---

# 18. Work Package 11 — cookie-only sessions, MFA and step-up

This is a staged product/deployment change and must be split into separate PRs.

## WP-11A — session storage and server behavior

1. Add hashed session-token storage:
   - store HMAC/SHA-256 + server pepper;
   - never store reusable plaintext;
   - dual-read migration only for a short, logged compatibility window.
2. Rotate session on login, privilege change, password reset and MFA change.
3. Add idle and absolute expiry, revocation reason and last-used metadata.
4. Use separate cookie names/scopes for staff, client portal and finance portal.
5. `Secure`, `HttpOnly`, appropriate `SameSite`, narrow `Path`, no broad domain
   unless required.
6. Add CSRF protection for cookie-authenticated mutations:
   - strict Origin/Referer allowlist;
   - CSRF token or signed double-submit pattern.
7. Do not return session/access tokens in JSON after migration.
8. Do not log token previews.

## WP-11B — frontend migration

1. Determine same-origin architecture:
   - preferred custom API domain under the application parent domain; or
   - same-origin reverse proxy/BFF.
2. Do not rely on third-party cookies working across unrelated app and Supabase
   domains.
3. Migrate staff first behind a feature flag, then client portal, then finance
   portal.
4. Remove localStorage/sessionStorage token reads and request-body token
   fallbacks.
5. Keep rollback feature flags time-bounded and fail closed.
6. Add logout/revocation propagation and multi-tab behavior.

## WP-11C — MFA and step-up

1. Require MFA for superadmins and high-risk finance roles.
2. Implement recent step-up for:
   - DocuSign send/void;
   - payout approve/pay/reverse;
   - role/permission changes;
   - secret/integration changes;
   - destructive mailbox/storage actions.
3. Store `step_up_verified_at`, method and assurance level in the server-side
   session.
4. Require reauthentication after a short window.
5. Add recovery-code lifecycle, audit and rate limits.

## Tests

- XSS cannot read credentials;
- cross-site mutation blocked;
- session fixation;
- revoked/expired/idle session;
- privilege change rotates session;
- cookie scoping across three portals;
- high-risk action without/recent/expired step-up;
- MFA brute force/recovery code one-time use.

---

# 19. Work Package 12 — complete signed internal-call migration

## Objective

Eliminate globally reusable static internal credentials and all HTTP use of the
service-role key.

## Implementation

1. Make `internalCall.ts` sign every request with:
   - method;
   - exact path;
   - body hash;
   - timestamp;
   - nonce;
   - caller ID;
   - key ID/version.
2. Receiver uses strict signed verification before body-derived work.
3. Add per-target caller allowlists. A valid internal signature from an
   unrelated function must still be denied.
4. Remove from `verifyAuth`:
   - `x-internal-edge-secret` static-secret authorization;
   - internal-secret-as-Bearer;
   - service-role key as normal HTTP authentication.
5. Remove from `verifyInternal`:
   - static secret shortcut;
   - service-role Bearer fallback.
6. Keep human auth and internal auth in separate APIs.
7. Migrate every caller and receiver. Generate a call graph and prove no
   `Authorization: Bearer ${serviceRole...}` or equivalent remains.
8. Cron jobs that cannot compute HMAC use a dedicated mandatory function-specific
   cron secret from Vault, never the service-role key.
9. Support key rotation by key ID with a short current/previous overlap and a
   documented removal date.
10. Redact signatures and secrets from logs.

## Tests

- valid signature;
- wrong method/path/body;
- timestamp skew;
- nonce replay;
- unknown caller;
- caller not allowlisted for receiver;
- old key during/after rotation window;
- service-role Bearer rejected;
- static internal secret rejected;
- missing secret fails closed.

## CI

Replace regex-only R6 with an AST/Semgrep rule or broader deterministic scanner
that catches aliases such as `SERVICE_KEY`, `serviceKey`, `supabaseKey` and body
tokens.

---

# 20. Work Package 13 — remaining defense-in-depth

## Outlook

1. Remove predictable `clientState` fallback. Missing
   `OUTLOOK_WEBHOOK_CLIENT_STATE` must fail closed.
2. Recreate subscriptions after secret rotation.
3. Apply ownership/team authorization to `freeBusy` email arrays, not only
   `targetEmail`.
4. Stop logging full webhook payloads.
5. Route webhook notifications through targeted notification helper; never
   create null-target broadcasts.
6. Add webhook idempotency from subscription/message/change identifiers.

## Market Q&A shares

1. Verify the source question belongs to the creator before creating a share.
2. Store only hashed share tokens.
3. Enforce expiration, revocation and minimal public projection.
4. Rate-limit resolve and audit without token disclosure.

## Render service and SSRF

1. Resolve DNS and reject private/reserved IPs before connection.
2. Revalidate every redirect target and limit redirect count.
3. Block alternate numeric/IPv6/encoded host forms.
4. Disable outbound network for HTML/JSX/ZIP renders unless an explicit allowlist
   is required.
5. Cap `zipBase64` before decode; cap entries, expanded bytes, compression ratio,
   path depth and execution time.
6. Sandbox scripts, file access and child processes in the render service.
7. Add SSRF and decompression-bomb tests.

## Legacy permissions

1. Change `checkPermission` and `checkModuleView` to deny when:
   - table is unmapped;
   - module is absent/inactive;
   - operation is unknown.
2. Migrate all callers to `authz.ts`.
3. Delete the allow-by-default code after the last caller moves.
4. Add a CI test ensuring every sensitive table has a module mapping.

## Email/DLP

1. Decide and document production recipient policy; do not leave high-risk
   workflows dependent on an unset optional allowlist.
2. Add attachment extension/MIME validation and malware scanning where feasible.
3. Block active content and dangerous archives.
4. Add external-recipient confirmation/step-up for sensitive document types.
5. Ensure all email events target an explicit user or module audience.

## Errors, logging, CORS and headers

1. Centralize safe error responses.
2. Remove raw provider/database details from client responses.
3. Redact PII, tokens, webhook bodies and object paths from logs.
4. Use origin allowlists for browser-facing authenticated functions.
5. Add application security headers at the hosting/proxy layer:
   CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`,
   `Permissions-Policy`, frame restrictions.
6. Add retention rules for security, email-open and API-usage logs.

---

# 21. Work Package 14 — make CI a real launch gate

## Registry

1. Reduce `needs-review` to zero.
2. Fail CI on any active `needs-review` entry.
3. Require:
   - exposure class;
   - auth helper;
   - authorization policy;
   - owner;
   - test path;
   - reviewed commit/date.
4. For `verify_jwt=false`, require a declared in-function auth class.

## Edge compilation and tests

1. `deno check` every Edge Function entry point, not only shared modules.
2. Add Deno tests for shared auth, internal signing, authz, storage binding and
   tool policies.
3. Add local Supabase migration tests or `supabase db reset` in CI.
4. Add negative HTTP tests against a local/test project where practical.
5. Fail on skipped security tests.

## Static analysis

Add Semgrep/CodeQL/custom AST checks for:

- Authorization-header presence used as authentication;
- service-role client creation with no auth gate;
- service-role key in fetch headers/body;
- request-body fields used for trust;
- fail-open webhook/cron secrets;
- `getPublicUrl` on sensitive buckets;
- caller-controlled storage bucket/path;
- broad `select('*')` or update/delete behind generic auth on sensitive tables;
- missing tool policy;
- raw upstream error returned;
- wildcard credentialed CORS;
- `SECURITY DEFINER` without pinned `search_path`/revokes.

## Supply chain

1. Regenerate and commit a synchronized lockfile; use `npm ci`.
2. Block unaccepted **High and Critical** advisories.
3. Make SBOM generation blocking, not best-effort.
4. Add dependency review on pull requests.
5. Pin GitHub Actions to immutable SHAs where policy permits.
6. Add CodeQL and secret scanning required checks.

## Branch/release controls

Owner action:

- require all security jobs and review;
- require code-owner approval for:
  - `_shared/auth*`;
  - `authz`;
  - migrations;
  - `config.toml`;
  - registry;
  - CI/security scripts;
- disallow direct production deploy from unreviewed commits.

---

# 22. Work Package 15 — deployment, runtime verification and launch gate

## 22.1 Required sequence

1. Merge source changes with passing CI.
2. Configure required secrets before deploying fail-closed functions.
3. Deploy shared-auth-dependent Edge Functions as a fleet; verify versions.
4. Deploy frontend/session changes.
5. Apply additive schema migrations.
6. Apply RLS/grant and bucket-private migrations only after compatible code is
   live.
7. Rotate credentials that may have traversed old insecure paths.
8. Run negative tests.
9. Monitor logs/cost/error rate.
10. Perform independent penetration testing.
11. Sign off only when all Critical and High findings are closed.

## 22.2 Required secret/config checklist

At minimum verify:

- JWT signing/auth configuration;
- `RESET_TOKEN_PEPPER`;
- Turnstile secret and production-required flag;
- internal HMAC current/previous keys and key IDs;
- function-specific cron secrets;
- webhook secrets:
  - auto report;
  - GHL;
  - VAPI;
  - Outlook client state;
  - DocuSign where applicable;
- paid-provider keys and account-level spend caps;
- recipient/DLP policy;
- storage bucket privacy;
- Postgres patch version;
- leaked-password protection;
- security alert destinations.

Never print secret values; verify only presence, minimum length, version and
rotation timestamp.

## 22.3 Live database verification queries

Codex should place reviewed, read-only queries in
`docs/security/live-verification.sql`. Include checks equivalent to:

```sql
-- RLS and FORCE RLS
select n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','p')
  and n.nspname in ('public','storage','aml')
order by 1,2;

-- Policies with always-true conditions
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public','storage','aml')
order by 1,2,3;

-- SECURITY DEFINER exposed to client roles
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.prosecdef
  and (
    has_function_privilege('anon', p.oid, 'EXECUTE')
    or has_function_privilege('authenticated', p.oid, 'EXECUTE')
    or has_function_privilege('public', p.oid, 'EXECUTE')
  )
order by 1,2;

-- Sensitive bucket privacy
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;

-- Direct storage policies
select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;

-- Privilege-bearing tables
select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema in ('public','storage','aml')
  and grantee in ('anon','authenticated','public')
order by 1,2,3,4;
```

Review exact role syntax against the live Postgres environment before execution.

## 22.4 Required runtime negative-test matrix

- forged, expired and `alg=none` JWTs;
- anon key to every `verify_jwt=false` sensitive function;
- arbitrary Bearer to Market AI;
- missing/wrong/replayed cron and HMAC credentials;
- unapproved internal caller;
- cross-user/client conversation, file, report, email and document IDs;
- low-privilege AI tool calls;
- replayed confirmation;
- duplicate payout and duplicate provider sends;
- public storage URL/direct-object access;
- CSRF and cookie theft attempts;
- oversized base64/ZIP/attachment payloads;
- webhook replay/client-state mismatch;
- metering/provider failure;
- public form spam and quota boundary.

## 22.5 Launch criteria

All must be true:

- score ≥90/100;
- zero open Critical findings;
- zero open High findings;
- zero active `needs-review` functions;
- no service-role key in inter-function traffic;
- sensitive buckets private;
- object-level storage authorization verified;
- all privileged functions have explicit authz tests;
- current source commit equals deployed function/frontend/migration versions;
- Postgres and Auth platform settings hardened;
- independent pentest completed and findings resolved or formally accepted;
- incident response and key rotation tabletop completed.

---

# 23. Suggested pull-request sequence

1. `security/wp00-codex-guardrails`
2. `security/wp01-shared-security-primitives`
3. `security/wp02-market-ai-auth`
4. `security/wp03-market-cron-hmac`
5. `security/wp04-web-push-internal-only`
6. `security/wp05a-agent-policy-framework`
7. `security/wp05b-agent-read-authz`
8. `security/wp05c-agent-write-scheduled-authz`
9. `security/wp06-storage-object-bindings`
10. `security/wp07-report-qa-access`
11. `security/wp08-provider-proxy-authz`
12. `security/wp09a-documents-docusign`
13. `security/wp09b-compliance-commission`
14. `security/wp10-public-abuse-cost`
15. `security/wp11a-session-server`
16. `security/wp11b-session-frontend-portals`
17. `security/wp11c-mfa-step-up`
18. `security/wp12-internal-hmac-fleet`
19. `security/wp13-defense-in-depth`
20. `security/wp14-ci-launch-gate`
21. `security/wp15-deploy-verification`

Use the repository’s normal branching conventions if they differ. The critical
requirement is one reviewable security objective per PR.

---

# 24. Global definition of done

The implementation program is not complete because code “looks safer.” It is
complete only when:

1. Every finding has a committed fix and negative regression test.
2. Every database change is represented by an idempotent migration.
3. Every relevant Edge Function is deployed from the reviewed commit.
4. Every staged bucket/RLS migration is applied and verified live.
5. Secrets are configured and rotated without being printed or committed.
6. CI has zero grandfathered security backlog.
7. Direct PostgREST and storage tests fail for unauthorized roles.
8. Paid-provider paths cannot be invoked anonymously or without quota.
9. Low-privilege actors cannot cross modules, clients, conversations or objects.
10. Internal request replay and caller impersonation are rejected.
11. Browser JavaScript cannot read long-lived session credentials.
12. High-risk actions require current permissions and step-up.
13. Audit logs are attributable and do not expose secrets/PII.
14. Independent penetration testing confirms the negative test matrix.
15. The final audit reaches at least 90/100 with zero Critical or High findings.
