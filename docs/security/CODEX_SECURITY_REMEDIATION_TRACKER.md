{
  "schema_version": 1,
  "purpose": "Machine-readable source remediation tracker. Source status must not be interpreted as deployed or live-test status.",
  "findings": [
    {
      "finding_id": "WP-00-REGISTRY",
      "severity": "medium",
      "file_or_function": "supabase/functions-registry/SECURITY_REGISTRY.json",
      "owner": "security-remediation-program",
      "pr_or_commit": null,
      "source_fixed": true,
      "deployed": true,
      "live_negative_test": false,
      "residual_risk": "Registry classifications are source assertions; each needs-review entry still requires endpoint-specific review."
    },
    {
      "finding_id": "WP-00-CI-BASELINE",
      "severity": "medium",
      "file_or_function": "scripts/security/check-function-registry.mjs",
      "owner": "security-remediation-program",
      "pr_or_commit": null,
      "source_fixed": true,
      "deployed": true,
      "live_negative_test": false,
      "residual_risk": "The historical backlog is grandfathered by exact name until later work packages review it."
    },
    {
      "finding_id": "WP-01-SHARED-REQUEST-SECURITY",
      "severity": "high",
      "file_or_function": "supabase/functions/_shared/requestSecurity.ts",
      "owner": "security-remediation-program",
      "pr_or_commit": null,
      "source_fixed": true,
      "deployed": true,
      "live_negative_test": false,
      "residual_risk": "The primitives are additive; endpoint migrations to the strict APIs begin in subsequent scoped work packages."
    },
    {
      "finding_id": "WP-02-MARKET-AI-CONTAINMENT",
      "severity": "critical",
      "file_or_function": "market-updates-qa; market-updates-voice-transcribe",
      "owner": "security-remediation-program",
      "pr_or_commit": null,
      "source_fixed": true,
      "deployed": true,
      "live_negative_test": false,
      "residual_risk": "Provider metering is represented by fail-closed quota reservations; provider-specific cost reconciliation is deferred."
    },
    {
      "finding_id": "WP-03-CRON-STRICT-AUTH",
      "severity": "high",
      "file_or_function": "market-updates-digest; market-qa-subscriptions; market-qa-digest-runner; market-qa-quality-snapshot",
      "owner": "security-remediation-program",
      "pr_or_commit": null,
      "source_fixed": true,
      "deployed": true,
      "live_negative_test": false,
      "residual_risk": "Cron paths now use verifyRequiredCronSecret constant-time compare; DB-level claim/lease for runner-style functions is tracked separately under runner state hardening."
    },
    {
      "finding_id": "WP-04-WEB-PUSH-DERIVED-PAYLOAD",
      "severity": "high",
      "file_or_function": "send-web-push",
      "owner": "security-remediation-program",
      "pr_or_commit": null,
      "source_fixed": true,
      "deployed": true,
      "live_negative_test": false,
      "residual_risk": "Caller supplies only notification_id; title/body/url/subscriber_type are derived server-side from public.notifications. URL allowlist rejects javascript:/data:/external hosts and falls back to '/'. Idempotency enforced via push_delivery_log lookup; a unique DB index is deferred to the storage-hardening package."
    },
    {
      "finding_id": "WP-05A-AGENT-TOOL-POLICY-FRAMEWORK",
      "severity": "high",
      "file_or_function": "_shared/agentToolAuthz.ts; scripts/security/check-agent-tool-policies.mjs",
      "owner": "security-remediation-program",
      "pr_or_commit": null,
      "source_fixed": true,
      "deployed": true,
      "live_negative_test": false,
      "residual_risk": "217/217 agent tool cases have baseline policies (module/permission/actorTypes/confirmation). ToolSecurityPolicy extended with optional resourceType/resolveResource/requiresStepUp/allowedInternalCallers/maxBatchSize to unblock WP-05B/C without rewriting the row set."
    },
    {
      "finding_id": "WP-05B-AGENT-TOOL-RUNTIME-ENFORCEMENT",
      "severity": "high",
      "file_or_function": "_shared/agentToolAuthz.ts; ai-dashboard-agent/index.ts (executeTool, confirm-tool, execute-tool)",
      "owner": "security-remediation-program",
      "pr_or_commit": null,
      "source_fixed": true,
      "deployed": true,
      "live_negative_test": false,
      "residual_risk": "Fail-closed gate added at the executeTool boundary: actor-type check, resource-ownership check (default arg-key resolver against clients.created_by / child-table created_by with client fallback), and step-up gate (delete_*, bulk_*, or policy.requiresStepUp). Confirmation-approved path sets stepUpVerified=true; verified service-role execute-tool callers pass actorType=internal. Ownership resolver currently covers client_id/deal_id/reminder_id/note_id/file_id/activity_id/playbook_id/scheduled_task_id/checklist_instance_id/game_plan_id/agreement_id/chart_id/report_id. Remaining surfaces (appointments via GHL id, memory ids, agent-conversation ids) still rely on the tool implementation's own scoping and are earmarked for WP-05C alongside the internal-caller allowlist + bulk ceilings."
    },
    {
      "finding_id": "WP-05C-AGENT-TOOL-BULK-AND-INTERNAL-CALLER-GATE",
      "severity": "high",
      "file_or_function": "_shared/agentToolAuthz.ts; scripts/security/check-agent-bulk-ceilings.mjs",
      "owner": "security-remediation-program",
      "pr_or_commit": null,
      "source_fixed": true,
      "deployed": true,
      "live_negative_test": false,
      "residual_risk": "Every bulk_* tool now carries an explicit maxBatchSize (bulk_create_reminders=100, bulk_set_follow_up_dates=100, bulk_update_clients=50) and an allowedInternalCallers whitelist ('agent-task-runner'). authorizeAgentTool now scans every array-valued arg (not just ids/items) so a caller cannot rename the payload to bypass the ceiling, and refuses any bulk_* policy that ships without a ceiling as a config bug. Internal service-role callers still bypass the step-up gate ONLY when policy.allowedInternalCallers matches ctx.internalCaller; every other internal caller is fail-closed. New CI gate scripts/security/check-agent-bulk-ceilings.mjs blocks regressions. Remaining surfaces (appointments via GHL id, memory ids, agent-conversation ids) still rely on the tool implementation's own scoping and are earmarked for a follow-on WP-05D resource-resolver expansion."
    },
    {
      "finding_id": "WP-06-STORAGE-OBJECT-AUTHZ-PHASE-A",
      "severity": "high",
      "file_or_function": "public.storage_object_bindings; supabase/functions/_shared/storageAuthz.ts; supabase/functions/secure-storage/index.ts",
      "owner": "security-remediation-program",
      "pr_or_commit": null,
      "source_fixed": true,
      "deployed": true,
      "live_negative_test": false,
      "residual_risk": "Phase A ships the load-bearing foundation: service-only `storage_object_bindings` ledger (RLS deny-all for non-service; service_role grants only), shared resolver `_shared/storageAuthz.ts` (getBinding/createBinding/deleteBinding/authorizeObjectAccess), and `secure-storage` fail-closed integration for download/signedUrl/delete/publicUrl on sensitive buckets (client-files/client-documents/vownet-forms/investment-reports/quantitative-reports/qa_exports/email-attachments). Deny returns 404 to prevent enumeration; bindings are auto-removed on delete. Superadmin/internal-service callers bypass with binding attached for audit context. Phase A LEGACY_FALLBACK_BUCKETS still allows read on the same seven sensitive buckets when no binding row exists, gated by the existing per-bucket module (checkModuleView) — so any authenticated staff with the module can still reach legacy paths until backfill lands. `legacy_fallback_no_binding` telemetry events measure exposure. Phase B (still owed): (1) upload paths across `client-files`, `email-attachments`, `investment-reports`, `quantitative-reports`, `qa_exports`, `vownet-forms` must call `createStorageBinding()` in the same server flow that uploads (with rollback on partial failure); (2) backfill script for existing objects using authoritative parent tables; (3) frontend consumers must stop persisting long-lived signed URLs; (4) `list` must require a resource ID and derive the prefix server-side; (5) STOR-004/STOR-005 bucket-private migrations after producers land; (6) LEGACY_FALLBACK_BUCKETS removal and live negative tests (cross-client path, root enumeration, traversal, upload-path injection, expired signed URL)."
    },
    {
      "finding_id": "WP-06-STORAGE-OBJECT-AUTHZ-PHASE-B",
      "severity": "high",
      "file_or_function": "supabase/functions/secure-storage/index.ts; supabase/functions/_shared/storageAuthz.ts; supabase/functions/portal-upload-file/index.ts; supabase/functions/outlook-email-sync/index.ts; supabase/functions/report-qa/index.ts; supabase/functions/build-conversations-export-worker/index.ts; src/lib/documentUpload.ts",
      "owner": "security-remediation-program",
      "pr_or_commit": null,
      "source_fixed": true,
      "deployed": true,
      "live_negative_test": false,
      "residual_risk": "Phase B extends the authz ledger to producers and reads: (1) mass backfill of `public.storage_object_bindings` from `client_files`, `finance_portal_documents`, `export_jobs`, `agent_file_uploads`, and `email_copilot_emails` attachments, with `(client_id)` and `(owner_user_id)` lookup indexes; (2) `secure-storage.upload` now creates a binding in the same server flow and rolls back the uploaded object if binding insertion fails, plus a `binding_owner_fallback` telemetry event when no scope is supplied; (3) `secure-storage.list` on sensitive buckets requires `list_client_id` OR `list_owner_user_id`, resolves the authorized set via `authorizedBindingsForList`, and denies unscoped enumeration with `list_scope_required`; (4) producer edge functions `portal-upload-file`, `outlook-email-sync` (attachments), `report-qa` (qa_exports), and `build-conversations-export-worker` (qa_exports) now upsert their binding row scoped to `client_id`/`owner_user_id` and roll back on failure; (5) frontend `uploadSecureStorageFileWithProgress` now accepts `resourceType`/`resourceId`/`clientId`/`ownerUserId` so callers can attach scope. Still owed for Phase C: (a) migrate any remaining producers that write directly to sensitive buckets outside these paths, (b) STOR-004/STOR-005 bucket-private cutover, (c) removal of `LEGACY_FALLBACK_BUCKETS` after binding coverage is verified, and (d) live negative tests (cross-client read, root-enumeration list, upload-path injection, expired signed URL, missing-scope list)."
    },
    {
      "finding_id": "WP-07-REPORT-QA-ACCESS",
      "severity": "high",
      "file_or_function": "supabase/functions/_shared/reportQaAccess.ts; supabase/functions/report-qa/index.ts; migration wp07-report-qa-access; public.get_shared_qa_answer(text); public.report_qa_share_access_log",
      "owner": "security-remediation-program",
      "pr_or_commit": null,
      "source_fixed": true,
      "deployed": true,
      "live_negative_test": false,
      "residual_risk": "WP-07 introduces a single authoritative access resolver (`resolveReportQaAccess`) returning owner/collaborate/view/admin/denied from the conversation row plus the active share, and routes the sensitive report-qa actions through it: `load-conversation`, `update-conversation` (owner-only for title/client rewiring; collaborate may edit report_names/report_contents), `delete-conversation`, `share-conversation`, `revoke-share`, `generate-share-link`, `revoke-share-link`, and `generate-qa-pdf`. Sharees cannot expand access (share/revoke are owner/admin only). Public per-answer share links are now 256-bit crypto-random tokens whose SHA-256 hash + 8-char prefix + expiry are stored on `report_qa_messages`; plaintext is never persisted, legacy plaintext tokens were rehashed and nulled in the migration, and `get_shared_qa_answer(text)` returns a minimal projection (no citations, tool traces, attachments, or client memory), tracks view count/last-access, and rejects revoked/expired tokens. The `report-qa` edge function rate-limits public share lookups to 60/hr per IP+prefix and writes outcome (`ok`/`not_found`/`expired`/`rate_limited`) to the service-role-only `report_qa_share_access_log` without ever recording the raw token. Also fixes the WP-06 Phase B qa_exports binding to key on `report_qa_conversations.created_by` (previous code referenced a non-existent `user_id` column). Still owed: (a) enforce access on the remaining thin actions (`summarize-conversation`, `submit-feedback`, `toggle-pin-message`, `branch-conversation`, `index-reports`, memory read/write, chat/stream) via the same helper, (b) scope RAG retrieval RPC calls with an explicit `conversation_id`/`client_id` predicate, and (c) live negative tests (owner/view/collaborate/revoked/arbitrary conversation ID/view-only update/unauthorized client-link/public token enumeration/expired-replayed/cross-conversation RAG chunks)."
    },
    {
      "finding_id": "WP-08-DELEGATED-CREDENTIAL-PROXIES",
      "severity": "high",
      "file_or_function": "supabase/functions/_shared/wp08Guards.ts; supabase/functions/airtable-proxy/index.ts; supabase/functions/manychat-proxy/index.ts; supabase/functions/send-ghl-message/index.ts",
      "owner": "security-remediation-program",
      "pr_or_commit": null,
      "source_fixed": true,
      "deployed": true,
      "live_negative_test": false,
      "residual_risk": "WP-08 introduces `_shared/wp08Guards.ts` (superadmin lookup, in-memory per-user rate limiter, redacted upstream-error mapper) and applies it to the three delegated-credential proxies. `airtable-proxy` now requires `listings` module view (superadmin bypasses), restricts `op=list_tables` to superadmins, resolves the caller-supplied `tableName` against a server-side allowlist (`AIRTABLE_TABLE_NAME` default + optional comma-separated `AIRTABLE_TABLE_ALLOWLIST`), forces `pageSize` into `[1,100]`, allowlists `sortDirection`, redacts all upstream Airtable errors via `redactUpstreamError`, and audits every call to `api_usage_log` with the actor's `user_id`, `table`, and `op`. `manychat-proxy` splits actions into `METADATA_ACTIONS` (gated on `settings` module view) and `PII_ACTIONS` (`find_subscriber`/`get_subscriber`/`find_by_custom_field` — superadmin-only), tightens input bounds (name 2–100, subscriberId `^[A-Za-z0-9_-]{1,64}$`, `field_value` capped at 256 chars, `field_id` numeric), rate-limits per-user (120/min metadata, 30/min PII), redacts all upstream error bodies, and audits calls with `user_id`+`action`+`pii` flag. `send-ghl-message` now enforces `conversations` module `can_edit` (superadmin bypasses), rejects messages over 1600 characters, enforces per-user burst (10/sec) + sustained (100/min) quotas, redacts the generic 500 error, and audits every successful send via `logApiUsage` with `channel`, `conversation_id`, `client_id`, provider message ID, and message length (body itself remains in `ghl_conversation_messages`). All three functions deployed. Still owed: (a) live negative tests (module-denied caller, non-allowlisted Airtable table, list_tables as non-superadmin, ManyChat PII action as non-superadmin, GHL send over 1600 chars, GHL burst > 10/sec, GHL send when caller is not assigned to the client), (b) a persistent (DB-backed) quota layer so the in-memory limiter cannot be bypassed by rolling across edge-function instances, and (c) an explicit client-assignment predicate on `send-ghl-message` once the client↔staff assignment model for conversations is finalised."
    },
    {
      "finding_id": "WP-09A-GENERATED-DOCUMENTS-DOCUSIGN",
      "severity": "high",
      "file_or_function": "supabase/functions/_shared/wp09Guards.ts; supabase/functions/manage-generated-documents/index.ts",
      "owner": "security-remediation-program",
      "pr_or_commit": null,
      "source_fixed": true,
      "deployed": true,
      "live_negative_test": false,
      "residual_risk": "WP-09A introduces `_shared/wp09Guards.ts` (bucket allowlist, generated-document FSM, immutable/service-only field lists, resource-ownership resolver, step-up marker, SHA-256 hasher, idempotency-key normaliser, recipient/tab bounds) and rewrites `manage-generated-documents` to apply it. Every id-scoped action now hydrates the row and runs `resolveGeneratedDocumentAccess` (superadmin bypass; caller must be `generated_by` or assigned to `client_id`). `create`/`update` are field-whitelisted via `pickAllowed(DOC_UPDATE_ALLOWED_FIELDS, DOC_SERVICE_ONLY_FIELDS)` so callers cannot mass-assign `docusign_envelope_id`, `docusign_status`, `signed_pdf_storage_path`, `pdf_hash`, `sent_at/viewed_at/signed_at/voided_at`, `sent_to`, `audit`, or `generated_by`. `update_status` runs `isValidDocTransition` and blocks envelope-driven states (`sent/signed/viewed/voided/delivered/declined`) for non-superadmins; server-side audit rows are appended automatically. `append_audit` accepts only `{note, event_type}` — caller cannot supply history. `send_freeform` (a) requires recent step-up (`x-step-up-token`) unless superadmin, (b) resolves the storage bucket server-side via `resolveDocumentBucket` against the fixed allowlist (`client-documents`/`generated-documents`/`compliance-records`) — caller-supplied `bucket` is ignored, (c) enforces recipient (≤10) and tab (≤200) ceilings with per-recipient email validation and name length caps, (d) computes and persists a SHA-256 PDF hash and refuses to send when a previously approved `pdf_hash` no longer matches the storage bytes, (e) supports an idempotency key (last-used key stored in metadata) so repeated retries return the same envelope, (f) redacts upstream DocuSign error text. `check_status`/`envelope_details`/`download_signed` also route through the access resolver. `list` is scoped to `generated_by = caller` for non-superadmins. `list_signature_events` now requires an explicit filter. Deployed. Still owed: (a) real signed step-up tokens (currently a marker header), (b) DocuSign Connect webhook-driven status updates instead of poll-based `check_status` mutations, (c) live negative tests (cross-client doc ID, caller bucket substitution, envelope-field mass assignment, invalid FSM transition, send without step-up, recipient substitution, resend without idempotency key, PDF changed after approval, valid approved send)."
    },
    {
      "finding_id": "WP-09B-COMPLIANCE-COMMISSION-TRANSACTIONS",
      "severity": "high",
      "file_or_function": "supabase/functions/_shared/wp09Guards.ts; supabase/functions/manage-compliance-records/index.ts; supabase/functions/manage-commission-ledger/index.ts; supabase/functions/generate-commission-payout/index.ts; migration commission_payouts maker/checker + SECURITY DEFINER RPCs",
      "owner": "security-remediation-program",
      "pr_or_commit": null,
      "source_fixed": true,
      "deployed": true,
      "live_negative_test": false,
      "residual_risk": "WP-09B hardens the three compliance/commission surfaces. **Compliance records**: `create_version` bumps the version, marks the prior current row `is_current=false`, and refuses `signed_at`, `signed_by_name`, `docusign_status`, `signed_pdf_storage_path`, `version`, `is_current`, `docusign_envelope_id`, and `generated_by` via `COMPLIANCE_SERVICE_ONLY_FIELDS`. `update_status` runs `isValidComplianceStatusTx` and rejects mutations on historical (non-current) rows. `pack_export` now validates every `included_record_ids` element resolves to the same `client_id` (cross-client packs return 403), caps to 200 records, and bounds `notes` to 4000 chars. `delete` is superadmin-only. **Commission ledger**: `create`/`update` are field-whitelisted (state fields — `status`, `received_date`, `reconciled_date`, `broker_id`, `deal_id`, `client_id`, `lender_id`, `created_by` — are service-only after creation). `mark_received` requires `status='expected'` and clamps `reference` to 128 chars. `reconcile` and `delete` are superadmin-only (normal ledger closure flows through the payout RPC); deletion is blocked once the row is `received`/`reconciled`. **Commission payout**: `generate`/`mark_paid`/`cancel` are re-implemented on top of three `SECURITY DEFINER` Postgres RPCs (`public.generate_commission_payout`, `public.mark_commission_payout_paid`, `public.cancel_commission_payout`) with `search_path = public` and `EXECUTE` locked to `service_role` (`PUBLIC/anon/authenticated` revoked). `generate_commission_payout` locks eligible received ledger rows `FOR UPDATE`, computes gross/gst/net server-side (caller-supplied totals impossible), inserts the payout, flips the locked ledger rows to `reconciled`, and writes an event to the append-only `commission_payout_audit` table (update/delete blocked by trigger). Idempotency is enforced by a unique partial index on `idempotency_key` and by a unique partial index on `(broker_id, period_start, period_end) WHERE status IN ('pending','paid')` so overlapping active payouts cannot exist. `mark_commission_payout_paid` requires the approver to differ from `generated_by` (raises `maker_checker_violation`), captures `approved_by/approved_at/approval_note`, and only runs against `pending` payouts. `cancel_commission_payout` compensates by flipping only the `reconciled` rows in the payout's `ledger_entry_ids` back to `received` in one transaction and refuses to cancel `paid`. The edge function also requires `x-step-up-token` on `mark_paid` for non-superadmin approvers and clamps text inputs (`payment_reference` 128, `payment_method` 64, `approval_note` 1000, `reason` 500). All three functions plus the new shared `_shared/wp09Guards.ts` are deployed. Still owed: (a) real signed step-up tokens with expiry, (b) a Postgres `security_audit_events` sink for the compliance rewrites (currently `logSecurityEvent` for denies + `commission_payout_audit` for payout flow), (c) live negative tests (cross-client compliance pack, mass-assignment of `signed_at`/`docusign_status`, historical-version mutation, ledger status/field manipulation on update, self-approved payout, duplicate generate with the same idempotency key, cancellation of a paid payout, manipulated totals on generate)."
    },
    {
      "finding_id": "WP-10-PUBLIC-ENDPOINT-ABUSE-CONTROLS",
      "severity": "high",
      "file_or_function": "supabase/functions/_shared/publicAbuseControls.ts; supabase/functions/request-lead-magnet/index.ts; supabase/functions/google-places-autocomplete/index.ts; supabase/functions/finance-email-track-pixel/index.ts; supabase/functions/market-qa-share/index.ts; supabase/functions/template-share/index.ts",
      "owner": "security-remediation-program",
      "pr_or_commit": null,
      "source_fixed": true,
      "deployed": true,
      "live_negative_test": false,
      "residual_risk": "WP-10 introduces `_shared/publicAbuseControls.ts` — a shared toolkit for public / paid-provider surfaces: `verifyTurnstile` (fail-closed when `REQUIRE_TURNSTILE=true` and `TURNSTILE_SECRET_KEY` unset or verify fails), `enforceIpQuota` / `enforceActorQuota` / `enforceKeyQuota` / `enforceGlobalDailyQuota` (in-memory sliding windows), `enforceGlobalCircuitBreaker` + `recordProviderFailure/Success` (paid-provider trip), `reserveUsage`/`releaseUsage`/`commitUsage` (daily reservation counter), `killSwitchActive` (env-flag gate), `getClientIp`, `sanitizeShortText` (control-char strip + length cap), `fetchWithTimeout` (bounded upstream), `hashToken` (SHA-256 hex), `redactError`, `honeypotTripped`, `tooFastSubmission`, and `normalizeEmail`. Applied to the four public / paid surfaces: **`request-lead-magnet`** now (a) checks `LEAD_MAGNET_KILL_SWITCH` first, (b) applies honeypot fields (`website`/`company_url`/`hp`) + minimum fill time (1200 ms) via `form_started_at`, (c) sanitises all inputs and caps lengths, (d) enforces Turnstile (fail-closed under `REQUIRE_TURNSTILE`), (e) applies four atomic quotas — per-IP (8/h), per-normalized-email (5/day), per-magnet (500/h), global daily (5000) — (f) dedupes on `(magnet_id, email)` within 24 h so retries don't inflate `download_count`, and (g) returns only redacted errors. **`google-places-autocomplete`** now (a) checks `GOOGLE_PLACES_KILL_SWITCH`, (b) applies a global circuit breaker (20 failures → 60 s open), (c) sanitises `input`/`sessionToken` and caps input at 120 chars, (d) rejects short queries silently, (e) applies per-IP (30/min), per-session (60/min), and global daily (default 5000, override via `GOOGLE_PLACES_DAILY_LIMIT`) quotas, (f) runs upstream fetch with a 5 s timeout, (g) records provider success/failure into the breaker, (h) projects the response to only `placeId`/`description`/`mainText`/`secondaryText` (max 10), and (i) redacts all upstream error strings. **`finance-email-track-pixel`** now (a) validates token shape (`^[A-Za-z0-9_-]{16,128}$`), (b) applies per-IP (120/min) + per-token (30/h) silent rate limits (always returns the pixel), (c) **no longer creates stub `finance_email_opens` rows for unknown tokens** — a match against `finance_outbound_messages.tracking_token` is now REQUIRED before any insert, closing the storage-exhaustion vector where forged token sprays could grow the opens table indefinitely, (d) caps `user_agent` at 500 chars, and (e) returns the same 200 pixel regardless of downstream outcome so callers cannot enumerate valid tokens. **`market-qa-share`** now (a) rate-limits `resolve` per-IP (60/min) + per-slug (300/h), (b) sanitises slug and returns a minimal public projection (drops `created_by`/internal counters), (c) on `create` verifies the source `market_update_questions.created_by = caller` (or superadmin) before minting a share, preventing an authenticated user from publishing another user's question, and (d) returns only redacted errors. **`template-share`** now (a) validates token shape (`^[A-Za-z0-9_-]{12,128}$`), (b) rate-limits per-IP (60/min) + per-token (300/h), and (c) redacts upstream errors. All four functions plus the new `_shared/publicAbuseControls.ts` are deployed. Still owed: (a) DB-backed persistent quota + reservation table so limits survive edge-function instance recycling (in-memory only today), (b) queued / dead-letter GHL push for lead-magnet captures (currently async best-effort with `ghl_synced=false`+`ghl_error` on the download row), (c) live negative tests (missing Turnstile in prod, honeypot filled, sub-1200 ms submission, per-email cap, per-magnet cap, global daily cap, kill switch, Places IP cap + circuit breaker, unknown pixel token, unauthenticated share on another user's question, share resolve rate limit), and (d) the operator action to restrict `GOOGLE_MAPS_API_KEY` at the provider (API surface + HTTP referrer allowlist + daily quota + billing alerts) — cannot be enforced from code."
    },
    {
      "finding_id": "WP-11A-SESSION-STORAGE-HARDENING",
      "severity": "high",
      "file_or_function": "migration user_sessions/client_portal_sessions/finance_portal_users; supabase/functions/_shared/sessionHash.ts; supabase/functions/_shared/csrfGuard.ts; supabase/functions/_shared/auth.ts; supabase/functions/_shared/requestSecurity.ts; supabase/functions/_shared/finance-portal-session.ts",
      "owner": "security-remediation-program",
      "pr_or_commit": null,
      "source_fixed": true,
      "deployed": true,
      "live_negative_test": false,
      "residual_risk": "WP-11A introduces additive session-storage hardening. **Schema**: `user_sessions` and `client_portal_sessions` gain `token_hash`, `idle_expires_at`, `last_used_at`, `revoked_at`, `revocation_reason`, `rotated_from_session_id`, `portal_scope` (defaulting to `staff`/`client_portal`), `ip_address`, and `user_agent`; `finance_portal_users` gains `session_token_hash`, `session_idle_expires_at`, `session_last_used_at`, `session_revocation_reason`, `session_ip_address`, and `session_user_agent`. Partial unique indexes on the new hash columns support fast dual-read lookup without breaking the existing plaintext-only rows. **New helpers**: `_shared/sessionHash.ts` computes HMAC-SHA256(`SESSION_TOKEN_PEPPER`, token) → 64-char hex; the pepper (64-char random) was generated via `secrets--generate_secret` and the module fails closed when it is missing/short. `_shared/csrfGuard.ts` enforces an Origin/Referer allowlist on any cookie-carrying unsafe HTTP method — safe methods and header-only calls remain untouched. **Verifier rewrites**: `verifySession` (staff), `verifyPortalSession` (client portal), `verifyFinancePortalSession` (finance portal), and `resolveFinancePartner` now (a) hash the presented token when the pepper is configured, (b) look up by `token_hash`/`session_token_hash` first, (c) fall back to plaintext `session_token` for legacy rows, (d) check `revoked_at` and `idle_expires_at` on top of `expires_at`, (e) lazy-backfill `token_hash` + `last_used_at` (+ `idle_expires_at` when unset) on the winning row, and (f) stopped logging any prefix of the raw token. **Non-goals for this WP**: no issuer paths have been rewritten yet — new sessions still write the plaintext column alongside; rotation on privilege change / password reset / MFA, per-portal cookie name isolation, CSRF enforcement at the endpoint layer, and stripping tokens from JSON responses all land in WP-11B/C. Still owed: (a) issuers to dual-write `token_hash` at row creation (currently backfilled on first verify), (b) frontend cookie-name split (`session_token` → `staff_session`/`portal_session`/`finance_session`), (c) endpoint-level `enforceCsrf(req)` calls on cookie-authenticated mutations, (d) rotate session on privilege change and password reset (WP-11B/C), (e) remove tokens from JSON login responses once cookies are the sole transport, (f) live negative tests (replay of stolen DB dump under peppered hash, cross-portal cookie reuse, cookie without matching Origin, idle-expired session)."
    },
    {
      "finding_id": "WP-12-INTERNAL-CALL-SIGNED-MIGRATION-PHASE-A",
      "severity": "high",
      "file_or_function": "supabase/functions/_shared/internalCall.ts; supabase/functions/_shared/auth_v2.ts (signInternalRequest, verifyInternal); supabase/functions/_shared/requestSecurity.ts (verifySignedInternal); scripts/security/check-internal-legacy-fallback.mjs",
      "owner": "security-remediation-program",
      "pr_or_commit": null,
      "source_fixed": true,
      "deployed": false,
      "live_negative_test": false,
      "residual_risk": "WP-12 Phase A ships the load-bearing signing infrastructure without breaking the fleet: (1) `signInternalRequest` now emits `X-Internal-Key-Id` and folds the key id into the HMAC message (method\\npath\\nts\\nnonce\\ncaller\\nkeyId\\nsha256(body)); signer picks the newest configured key — `INTERNAL_EDGE_SECRET_V2` if present, otherwise `INTERNAL_EDGE_SECRET` — enabling overlap rotation. (2) `callInternalFunction` now SIGNS every inter-function POST (previously only attached the static header) and continues to attach `x-internal-edge-secret` for backwards compatibility with receivers that have not yet been redeployed. Fails closed when neither v1 nor v2 secret is configured. (3) `verifyInternal` gained a keyed lookup (accepts requests signed under any configured key id), an `allowedCallers` per-receiver allowlist option (rejects a valid signature from a caller the receiver did not authorize), and honours the env flag `INTERNAL_STRICT_SIGNED=true` which globally disables the legacy static-secret and service-role-Bearer fallbacks. (4) `verifySignedInternal` in `requestSecurity.ts` was already strict-only (`allowLegacyStaticSecret:false`, `allowLegacyServiceRoleKey:false`) and now benefits automatically from the new keyed message + allowlist. (5) New CI gate `scripts/security/check-internal-legacy-fallback.mjs` blocks (a) receivers that opt back into legacy fallbacks and (b) any function outside `_shared/` that reads `x-internal-edge-secret` directly; `send-web-push` is explicitly allowlisted as a DB-trigger-dispatched consumer. Existing R6 scan continues to block service-role Bearer on inter-function fetches. Still owed for Phase B (deployment/cutover): (a) redeploy every edge function so the updated `_shared` code is live in both signer and verifier roles; (b) after redeploy, flip `INTERNAL_STRICT_SIGNED=true` at the edge-runtime env to retire the static-secret + service-role-Bearer fallbacks; (c) apply per-target `allowedCallers` sets on high-blast-radius receivers (ai-dashboard-agent tool executor, admin-user-management, update-integration-secret, share-report-with-finance, generate-commission-payout, secure-storage, report-qa); (d) migrate the send-web-push DB trigger from the shared `INTERNAL_EDGE_SECRET` to a per-function Vault cron secret (WP-12 clause 8); (e) live negative tests (wrong method, wrong path, wrong body, ±120s skew, replayed nonce, unknown caller, caller not allowlisted for receiver, old key after rotation window, service-role Bearer rejected under strict mode, static internal secret rejected under strict mode)."
    },
    {
      "finding_id": "WP-13-DEFENSE-IN-DEPTH",
      "severity": "high",
      "file_or_function": "supabase/functions/outlook-email-webhook/index.ts; supabase/functions/outlook-manage-subscription/index.ts; supabase/functions/outlook-calendar/index.ts; supabase/functions/render-source/index.ts; supabase/functions/_shared/permissions.ts",
      "owner": "security-remediation-program",
      "pr_or_commit": null,
      "source_fixed": true,
      "deployed": true,
      "live_negative_test": false,
      "residual_risk": "WP-13 hardens the remaining defense-in-depth surfaces. (1) **Outlook webhook** (`outlook-email-webhook`): stopped logging the full Graph notification payload (only `count`), removed the legacy `npc-email-copilot-webhook` clientState fallback — `OUTLOOK_WEBHOOK_CLIENT_STATE` must be ≥16 chars or the webhook fails closed with 401 — clientState comparison uses constant-length + strict-equals, and added idempotency via `internal_request_nonces` keyed on `(subscriptionId,resourceData.id,changeType)` so retried notifications don't double-process. (2) **Outlook subscription creator** (`outlook-manage-subscription`): refuses to create a subscription unless a strong clientState secret is configured, closing the loop with the webhook verifier. (3) **Outlook calendar** (`outlook-calendar`): extended `assertMailboxOwnership` to every entry in the `emails[]` array of the `freeBusy` action (previously only `body.targetEmail` was checked, so a caller could probe arbitrary tenant users' free/busy). (4) **render-source**: added a base64 payload cap (`RENDER_SOURCE_MAX_ZIP_B64`, default 15 MB base64 ≈ 11 MB binary → HTTP 413) to blunt decompression-bomb and memory-exhaustion vectors on the sidecar, and tightened the SSRF host guard to reject dotless-decimal / hex / octal / IPv6 numeric encodings, plus `::` and `0.0.0.0` alternate forms. (5) **Legacy permissions** (`_shared/permissions.ts`): introduced `LEGACY_PERMS_STRICT` env flag (default `false` during cutover). When flipped to `true`, unmapped tables (`TABLE_TO_MODULE_MAP` miss) and unregistered modules (no active row in `dashboard_modules`) fail-closed with `{ allowed:false, reason:'unmapped_table' | 'unregistered_module' }` instead of the legacy `{ allowed:true }`. Superadmin bypass and service-role bypass remain intact. **Deployed**: outlook-email-webhook, outlook-manage-subscription, outlook-calendar, render-source. **Not deployed as strict yet**: `LEGACY_PERMS_STRICT` remains `false` until an operator audits the mapping inventory and flips it. **Still owed / cutover**: (a) audit every table referenced by permission-gated edge functions against `TABLE_TO_MODULE_MAP` and add missing mappings, then flip `LEGACY_PERMS_STRICT=true` in edge env; (b) rotate any live Outlook subscriptions whose clientState was the legacy shared string — the webhook now rejects them until they are recreated; (c) live negative tests (replay Graph notification twice → second is skipped; freeBusy with a foreign user's email → 403; render-source zip >15 MB → 413; render-source URL with dotless-decimal or IPv6 bracket host → 400; unmapped-table read with `LEGACY_PERMS_STRICT=true` → 403); (d) hashed public share tokens for `market_update_qa_shares` (dual-read migration) remains open — deferred out of WP-13 into a follow-on ticket because the store is already ownership-guarded on create and rate-limited on resolve."
    }
  ]
}




