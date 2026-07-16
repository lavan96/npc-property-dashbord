import { supabase } from "@/integrations/supabase/client";

export type AmlRiskFactor = {
  id: string; key: string; label: string; category: "mltf" | "completion" | "verification" | string;
  weight: number; active: boolean; scoring: Record<string, number>; description?: string | null;
};
export type AmlMandatoryTrigger = {
  id: string; key: string; label: string; description?: string | null;
  severity: "block" | "hold"; rule: Record<string, any>; active: boolean;
};
export type AmlRiskAssessment = {
  id: string; case_id: string; completion_score: number; verification_score: number;
  mltf_score: number; risk_rating: "low" | "medium" | "high" | "prohibited" | null;
  triggered_holds: Array<{ key: string; label: string; severity: "block" | "hold" }>;
  factor_breakdown: Array<{ key: string; label: string; input: any; score: number; weight: number; weighted: number }>;
  inputs: Record<string, any>; computed_by: string | null; created_at: string;
};
export type AmlRiskOverride = {
  id: string; case_id: string; assessment_id: string | null; requested_by: string;
  requested_reason: string; requested_rating: string | null;
  status: "pending" | "approved" | "rejected"; reviewer_id: string | null;
  reviewer_note: string | null; decided_at: string | null; created_at: string;
};
export type AmlDecision = {
  id: string; case_id: string; assessment_id: string | null;
  outcome: "cleared" | "blocked" | "escalated" | "conditional";
  rationale: string | null; snapshot: any; snapshot_hash: string;
  decided_by: string; decided_at: string;
};
export type AmlApproval = {
  id: string; case_id: string; decision_id: string | null; kind: string;
  status: "pending" | "approved" | "rejected"; requested_by: string;
  approver_id: string | null; note: string | null; requested_at: string; resolved_at: string | null;
};
export type AmlCaseCondition = {
  id: string; case_id: string; label: string; detail: string | null;
  status: "open" | "resolved" | "waived"; created_by: string | null;
  resolved_by: string | null; resolved_at: string | null; created_at: string; updated_at: string;
};
export type AmlGateStatus = {
  enabled: boolean; purchase_ready: boolean;
  diagnostic: {
    purchase_ready: boolean; reasons: string[];
    latest_decision: AmlDecision | null;
    open_conditions: AmlCaseCondition[];
    latest_assessment: AmlRiskAssessment | null;
  };
};

async function invoke<T = any>(payload: Record<string, any>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("aml-risk", { body: payload });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export const amlRiskApi = {
  listFactors: () => invoke<{ factors: AmlRiskFactor[] }>({ op: "list_factors" }),
  upsertFactor: (factor: Partial<AmlRiskFactor>) => invoke<{ factor: AmlRiskFactor }>({ op: "upsert_factor", factor }),
  listTriggers: () => invoke<{ triggers: AmlMandatoryTrigger[] }>({ op: "list_triggers" }),
  upsertTrigger: (trigger: Partial<AmlMandatoryTrigger>) => invoke<{ trigger: AmlMandatoryTrigger }>({ op: "upsert_trigger", trigger }),

  evaluate: (case_id: string, inputs: Record<string, any>) =>
    invoke<{ assessment: AmlRiskAssessment }>({ op: "evaluate", case_id, inputs }),
  listAssessments: (case_id: string) => invoke<{ assessments: AmlRiskAssessment[] }>({ op: "list_assessments", case_id }),

  requestOverride: (p: { case_id: string; assessment_id?: string; requested_reason: string; requested_rating?: string }) =>
    invoke<{ override: AmlRiskOverride }>({ op: "request_override", ...p }),
  resolveOverride: (override_id: string, status: "approved" | "rejected", reviewer_note?: string) =>
    invoke<{ override: AmlRiskOverride }>({ op: "resolve_override", override_id, status, reviewer_note }),
  listOverrides: (p: { case_id?: string; status?: string } = {}) =>
    invoke<{ overrides: AmlRiskOverride[] }>({ op: "list_overrides", ...p }),

  decide: (p: { case_id: string; assessment_id?: string; outcome: AmlDecision["outcome"]; rationale?: string }) =>
    invoke<{ decision: AmlDecision }>({ op: "decide", ...p }),
  listDecisions: (case_id: string) => invoke<{ decisions: AmlDecision[] }>({ op: "list_decisions", case_id }),
  latestDecision: (case_id: string) => invoke<{ decision: AmlDecision | null }>({ op: "latest_decision", case_id }),

  listApprovals: (p: { case_id?: string; status?: string } = {}) =>
    invoke<{ approvals: AmlApproval[] }>({ op: "list_approvals", ...p }),
  resolveApproval: (approval_id: string, status: "approved" | "rejected", note?: string) =>
    invoke<{ approval: AmlApproval }>({ op: "resolve_approval", approval_id, status, note }),

  listConditions: (case_id: string) => invoke<{ conditions: AmlCaseCondition[] }>({ op: "list_conditions", case_id }),
  upsertCondition: (condition: Partial<AmlCaseCondition> & { case_id: string; label: string }) =>
    invoke<{ condition: AmlCaseCondition }>({ op: "upsert_condition", condition }),
  resolveCondition: (condition_id: string, status: "resolved" | "waived" = "resolved") =>
    invoke<{ condition: AmlCaseCondition }>({ op: "resolve_condition", condition_id, status }),

  gateStatus: (p: { case_id?: string; purchase_file_id?: string }) =>
    invoke<AmlGateStatus>({ op: "gate_status", ...p }),
};
