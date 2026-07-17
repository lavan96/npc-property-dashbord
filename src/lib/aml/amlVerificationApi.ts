import { invokeAmlFunction } from "./invokeAmlFunction";

export type IdvStatus = "pending" | "in_progress" | "verified" | "failed" | "expired" | "manual_review" | "cancelled";
export type ScreeningStatus = "pending" | "in_progress" | "clear" | "matched" | "review" | "failed" | "cancelled";
export type MatchStatus = "open" | "confirmed" | "dismissed" | "escalated";
export type MatchType = "pep" | "sanctions" | "adverse_media" | "watchlist" | "other";
export type ScreeningScope = "pep" | "sanctions" | "adverse_media" | "watchlist";

export interface IdentityCheck {
  id: string; case_id: string; subject_label: string; provider: string;
  provider_reference: string | null; method: string; status: IdvStatus;
  overall_score: number | null; result_payload: any; requested_at: string;
  completed_at: string | null; mc_job_id: string | null; mc_tokens_committed: number | null;
}

export interface ScreeningCheck {
  id: string; case_id: string; subject_label: string; subject_type: string;
  provider: string; provider_reference: string | null; scope: string[];
  status: ScreeningStatus; result_summary: any; requested_at: string;
  completed_at: string | null; mc_job_id: string | null; mc_tokens_committed: number | null;
}

export interface ScreeningMatch {
  id: string; screening_check_id: string; case_id: string; match_type: MatchType;
  list_name: string | null; matched_name: string; score: number | null;
  jurisdiction: string | null; details: any; status: MatchStatus;
  created_at: string; updated_at: string;
}

async function invoke<T = any>(payload: Record<string, unknown>): Promise<T> {
  return invokeAmlFunction<T>("aml-verification", payload);
}

export const amlVerificationApi = {
  initiateIdv: (case_id: string, method?: string, metadata?: Record<string, any>) =>
    invoke<{ identity_check: IdentityCheck; result: any }>({ op: "initiate_idv", case_id, method, metadata }),
  getIdv: (id: string) => invoke<{ identity_check: IdentityCheck; documents: any[] }>({ op: "get_idv", id }),
  listIdv: (case_id?: string, status?: IdvStatus) =>
    invoke<{ identity_checks: IdentityCheck[] }>({ op: "list_idv", case_id, status }),
  cancelIdv: (id: string) => invoke<{ identity_check: IdentityCheck }>({ op: "cancel_idv", id }),

  runScreening: (case_id: string, scope?: ScreeningScope[], metadata?: Record<string, any>) =>
    invoke<{ screening_check: ScreeningCheck; result: any }>({ op: "run_screening", case_id, scope, metadata }),
  listScreening: (case_id?: string, status?: ScreeningStatus) =>
    invoke<{ screening_checks: ScreeningCheck[] }>({ op: "list_screening", case_id, status }),
  getScreening: (id: string) => invoke<{ screening_check: ScreeningCheck; matches: ScreeningMatch[] }>({ op: "get_screening", id }),

  listMatches: (params: { case_id?: string; status?: MatchStatus } = {}) =>
    invoke<{ matches: ScreeningMatch[] }>({ op: "list_matches", ...params }),
  resolveMatch: (match_id: string, disposition: "confirmed" | "dismissed" | "escalated", rationale: string) =>
    invoke<{ resolution: any; match: ScreeningMatch }>({ op: "resolve_match", match_id, disposition, rationale }),
};
