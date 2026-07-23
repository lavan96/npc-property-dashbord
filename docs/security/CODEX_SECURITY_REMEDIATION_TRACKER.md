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
      "deployed": false,
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
      "deployed": false,
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
      "deployed": false,
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
      "deployed": false,
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
      "deployed": false,
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
      "deployed": false,
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
      "deployed": false,
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
      "deployed": false,
      "live_negative_test": false,
      "residual_risk": "Fail-closed gate added at the executeTool boundary: actor-type check, resource-ownership check (default arg-key resolver against clients.created_by / child-table created_by with client fallback), and step-up gate (delete_*, bulk_*, or policy.requiresStepUp). Confirmation-approved path sets stepUpVerified=true; verified service-role execute-tool callers pass actorType=internal. Ownership resolver currently covers client_id/deal_id/reminder_id/note_id/file_id/activity_id/playbook_id/scheduled_task_id/checklist_instance_id/game_plan_id/agreement_id/chart_id/report_id. Remaining surfaces (appointments via GHL id, memory ids, agent-conversation ids) still rely on the tool implementation's own scoping and are earmarked for WP-05C alongside the internal-caller allowlist + bulk ceilings."
    }
  ]
}
