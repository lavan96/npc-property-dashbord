/**
 * Phase 13 — Client-side lookup for active step-up session tokens.
 *
 * AmlGuard persists a verified session under `aml_step_up_session:<capability>`
 * containing `{ session_token, expires_at }`. `invokeAmlFunction` reads from
 * here to attach the token to privileged edge-function calls, so the server
 * can require a live step-up session for restricted operations.
 */
import type { AmlCapability } from "./permissions";

interface StoredStepUp {
  session_token?: string;
  expires_at?: string;
}

export function getStepUpToken(capability: AmlCapability): string | null {
  try {
    const raw = sessionStorage.getItem(`aml_step_up_session:${capability}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredStepUp;
    if (!parsed?.session_token || !parsed?.expires_at) return null;
    if (new Date(parsed.expires_at).getTime() <= Date.now()) return null;
    return parsed.session_token;
  } catch {
    return null;
  }
}

/**
 * Map of `${functionName}:${op}` → required capability. Only these ops attach
 * a step-up token; regular reads are unaffected.
 */
const RESTRICTED_OPS: Record<string, AmlCapability> = {
  // AUSTRAC lodgement + sign-off — aml.report
  "aml-reporting:submit_record": "aml.report",
  "aml-reporting:mlro_signoff": "aml.report",
  "aml-reporting:mlro_reject": "aml.report",
  "aml-reporting:withdraw_report": "aml.report",
  "aml-reporting:record_receipt": "aml.report",
  "aml-reporting:delete_report": "aml.report",
  // Tenant / plan / provider config — aml.configure
  "aml-tenant:update_tenant_settings": "aml.configure",
  "aml-tenant:upsert_plan": "aml.configure",
  "aml-tenant:upsert_provider": "aml.configure",
  "aml-tenant:delete_provider": "aml.configure",
  "aml-tenant:set_provider_health": "aml.configure",
  "aml-tenant:upsert_entitlement_override": "aml.configure",
  "aml-tenant:delete_entitlement_override": "aml.configure",
};

export function requiredCapabilityFor(functionName: string, op: string | undefined): AmlCapability | null {
  if (!op) return null;
  return RESTRICTED_OPS[`${functionName}:${op}`] ?? null;
}
