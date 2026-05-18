// Mission Control token client — reserve / commit / cancel / balance.
// Aurixa Mission Control is the single source of truth for billing.
// This module is the ONLY place that talks to its public token API.

const BASE_URL = Deno.env.get("MISSION_CONTROL_URL") ?? "";
const API_KEY = Deno.env.get("MISSION_CONTROL_CLONE_API_KEY") ?? "";

// Stable per-agency tenant ref. Single-agency install → Supabase project ref.
// If multi-agency support is ever added, swap this for the agency UUID.
const PROJECT_REF =
  Deno.env.get("SUPABASE_URL")?.match(/https:\/\/([^.]+)\./)?.[1] ?? "prime";
export const AGENCY_TENANT_REF = `prime:${PROJECT_REF}`;

export type TokenKind =
  | "report.investment.compass"
  | "report.investment.executive"
  | "report.investment.snapshot"
  | "report.suburb.compass"
  | "report.postcode.compass"
  | "report.market-intelligence"
  | "report.portfolio-review"
  | "report.bulk-item"
  | "report.chart-analysis"
  | "report.qualitative-regen";

export interface ReserveArgs {
  kind: TokenKind;
  estimatedTokens: number;
  idempotencyKey: string;
  userId: string;
  requestPayload?: Record<string, unknown>;
}

export interface ReserveResult {
  jobId: string;
  reserved: number;
  available: number;
}

export interface BalanceResult {
  available: number;
  allowance: number;
  used: number;
  reserved: number;
}

export class MissionControlError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "MissionControlError";
  }
}

export class InsufficientTokensError extends MissionControlError {
  constructor(public available: number, public requested: number, details?: unknown) {
    super(
      "insufficient_funds",
      `Insufficient tokens: requested ${requested}, available ${available}`,
      402,
      details,
    );
    this.name = "InsufficientTokensError";
  }
}

function assertConfigured() {
  if (!BASE_URL || !API_KEY) {
    throw new MissionControlError(
      "unconfigured",
      "MISSION_CONTROL_URL or MISSION_CONTROL_CLONE_API_KEY missing",
      500,
    );
  }
}

async function mcFetch(path: string, init: RequestInit): Promise<Response> {
  assertConfigured();
  return await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      ...(init.headers ?? {}),
    },
  });
}

async function parseOrThrow(res: Response): Promise<any> {
  const text = await res.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { /* keep raw */ }
  if (res.ok) return body;

  const code = body?.error?.code ?? body?.code ?? "mc_error";
  const message = body?.error?.message ?? body?.message ?? `Mission Control ${res.status}`;
  if (code === "insufficient_funds") {
    throw new InsufficientTokensError(
      Number(body?.error?.available ?? body?.available ?? 0),
      Number(body?.error?.requested ?? body?.requested ?? 0),
      body,
    );
  }
  throw new MissionControlError(code, message, res.status, body);
}

export async function reserveTokens(args: ReserveArgs): Promise<ReserveResult> {
  const res = await mcFetch("/api/public/tokens/reserve", {
    method: "POST",
    body: JSON.stringify({
      tenantRef: AGENCY_TENANT_REF,
      kind: args.kind,
      estimatedTokens: args.estimatedTokens,
      idempotencyKey: args.idempotencyKey,
      request_payload: {
        user_id: args.userId,
        ...(args.requestPayload ?? {}),
      },
    }),
  });
  const body = await parseOrThrow(res);
  return {
    jobId: body.jobId ?? body.job_id,
    reserved: body.reserved ?? args.estimatedTokens,
    available: body.available ?? 0,
  };
}

export async function commitTokens(jobId: string, actualTokens: number): Promise<void> {
  // Commit must always succeed eventually. Retry once on 5xx.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await mcFetch("/api/public/tokens/commit", {
      method: "POST",
      body: JSON.stringify({ jobId, actualTokens }),
    });
    if (res.ok) { await res.text(); return; }
    if (res.status < 500 || attempt === 1) { await parseOrThrow(res); return; }
    await new Promise((r) => setTimeout(r, 500));
  }
}

export async function cancelTokens(jobId: string, reason?: string): Promise<void> {
  try {
    const res = await mcFetch("/api/public/tokens/cancel", {
      method: "POST",
      body: JSON.stringify({ jobId, reason: reason ?? "generation_failed" }),
    });
    await res.text();
  } catch (e) {
    // Best effort — never let cancel failure mask the original error.
    console.error("[missionControl] cancel failed", e);
  }
}

export async function getBalance(): Promise<BalanceResult> {
  const res = await mcFetch(
    `/api/public/tokens/balance?tenantRef=${encodeURIComponent(AGENCY_TENANT_REF)}`,
    { method: "GET" },
  );
  const body = await parseOrThrow(res);
  return {
    available: Number(body.available ?? 0),
    allowance: Number(body.allowance ?? 0),
    used: Number(body.used ?? 0),
    reserved: Number(body.reserved ?? 0),
  };
}

/**
 * Convenience wrapper: reserve → run → commit/cancel.
 * `run` receives the reservation and must return { actualTokens, result }.
 */
export async function withTokenReservation<T>(
  args: ReserveArgs,
  run: (reservation: ReserveResult) => Promise<{ actualTokens: number; result: T }>,
): Promise<T> {
  const reservation = await reserveTokens(args);
  try {
    const { actualTokens, result } = await run(reservation);
    await commitTokens(reservation.jobId, actualTokens);
    return result;
  } catch (err) {
    await cancelTokens(reservation.jobId, err instanceof Error ? err.message : "error");
    throw err;
  }
}
