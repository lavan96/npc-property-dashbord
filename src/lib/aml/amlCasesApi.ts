import { invokeAmlFunction } from "./invokeAmlFunction";

export type AmlCaseStatus =
  | "draft" | "kyc_in_progress" | "kyc_complete" | "edd_required"
  | "under_review" | "escalated_mlro" | "cleared" | "blocked" | "closed";

export type AmlRiskRating = "low" | "medium" | "high" | "prohibited";

export type AmlEventCategory =
  | "case_created" | "status_changed" | "risk_rescored" | "document_added"
  | "idv_result" | "pep_sanctions_hit" | "edd_note" | "mlro_decision"
  | "austrac_report" | "system";

export interface AmlCase {
  id: string;
  case_reference: string;
  client_id: string | null;
  purchase_file_id: string | null;
  subject_type: string;
  subject_display_name: string;
  status: AmlCaseStatus;
  risk_rating: AmlRiskRating | null;
  risk_score: number | null;
  assigned_analyst_id: string | null;
  assigned_mlro_id: string | null;
  opened_at: string;
  closed_at: string | null;
  metadata: Record<string, any>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AmlCaseEvent {
  id: string;
  case_id: string;
  category: AmlEventCategory;
  summary: string;
  payload: Record<string, any>;
  actor_id: string | null;
  actor_label: string | null;
  prev_hash: string | null;
  row_hash: string | null;
  created_at: string;
}

async function invoke<T = any>(payload: Record<string, any>): Promise<T> {
  return invokeAmlFunction<T>("aml-cases", payload);
}

export const amlCasesApi = {
  list: (params: {
    status?: AmlCaseStatus; risk?: AmlRiskRating; assigned_to_me?: boolean;
    search?: string; limit?: number; offset?: number;
  } = {}) => invoke<{ cases: AmlCase[]; total: number }>({ op: "list", ...params }),

  get: (case_id: string) =>
    invoke<{ case: AmlCase; events: AmlCaseEvent[] }>({ op: "get", case_id }),

  create: (params: {
    subject_display_name: string; subject_type?: "individual" | "entity" | "trust";
    client_id?: string; purchase_file_id?: string; risk_rating?: AmlRiskRating; notes?: string;
  }) => invoke<{ case: AmlCase }>({ op: "create", ...params }),

  update: (case_id: string, patch: Partial<AmlCase>) =>
    invoke<{ case: AmlCase }>({ op: "update", case_id, patch }),

  transition: (case_id: string, to_status: AmlCaseStatus, reason?: string) =>
    invoke<{ case: AmlCase }>({ op: "transition", case_id, to_status, reason }),

  appendEvent: (case_id: string, category: AmlEventCategory, summary: string, payload: Record<string, any> = {}) =>
    invoke<{ event: AmlCaseEvent }>({ op: "append_event", case_id, category, summary, payload }),

  listEvents: (case_id: string, limit = 200) =>
    invoke<{ events: AmlCaseEvent[] }>({ op: "list_events", case_id, limit }),
};
