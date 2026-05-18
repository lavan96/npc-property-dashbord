// Report metering middleware.
// Wraps an edge function handler with Mission Control reserve → run → commit/cancel.
// Adds `tokensUsed` to JSON responses and an `x-tokens-used` header.
// Translates `insufficient_funds` to HTTP 402 with a structured body the
// frontend can detect uniformly.

import {
  reserveTokens,
  commitTokens,
  cancelTokens,
  InsufficientTokensError,
  MissionControlError,
  type ReserveResult,
  type TokenKind,
} from "./missionControl.ts";
import { estimateTokens, fallbackActual, type EstimateOptions } from "./tokenEstimator.ts";

export interface MeteringPlan {
  kind: TokenKind;
  userId: string;
  idempotencyKey: string;
  estimateOptions?: EstimateOptions;
  requestPayload?: Record<string, unknown>;
  /** Optional explicit estimate override (skips estimator). */
  estimatedTokensOverride?: number;
}

export type PlanResolver = (
  body: any,
  req: Request,
) => Promise<MeteringPlan | null> | MeteringPlan | null;

const baseCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token, x-portal-session-token",
};

function corsFor(req: Request) {
  const origin = req.headers.get("origin");
  return origin ? { ...baseCors, "Access-Control-Allow-Origin": origin } : baseCors;
}

/** Clone a request with a re-serialised body so downstream `req.json()` still works. */
function rebuildRequest(req: Request, body: any): Request {
  if (body === undefined) return req;
  const headers = new Headers(req.headers);
  return new Request(req.url, {
    method: req.method,
    headers,
    body: JSON.stringify(body),
  });
}

export function withReportMetering(
  resolvePlan: PlanResolver,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    if (req.method === "OPTIONS") {
      return handler(req);
    }

    // Read body once, then rebuild request so handler can re-parse it.
    let body: any = undefined;
    try {
      const text = await req.text();
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }
    const forwardReq = rebuildRequest(req, body);
    const cors = corsFor(req);

    let plan: MeteringPlan | null = null;
    try {
      plan = await resolvePlan(body, req);
    } catch (e) {
      console.warn("[reportMetering] plan resolver threw, bypassing metering", e);
      plan = null;
    }

    // No plan (anonymous, missing fields, resolver opted out) → run unmetered.
    if (!plan || !plan.userId || !plan.idempotencyKey) {
      return handler(forwardReq);
    }

    const estimated =
      plan.estimatedTokensOverride && plan.estimatedTokensOverride > 0
        ? plan.estimatedTokensOverride
        : estimateTokens(plan.kind, plan.estimateOptions);

    let reservation: ReserveResult | null = null;
    try {
      reservation = await reserveTokens({
        kind: plan.kind,
        estimatedTokens: estimated,
        idempotencyKey: plan.idempotencyKey,
        userId: plan.userId,
        requestPayload: plan.requestPayload,
      });
    } catch (e) {
      if (e instanceof InsufficientTokensError) {
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: "insufficient_funds",
              message: e.message,
              available: e.available,
              requested: e.requested,
            },
          }),
          { status: 402, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }
      if (e instanceof MissionControlError && e.code === "unconfigured") {
        // Mission Control not yet wired — proceed without metering so the app stays functional.
        console.warn("[reportMetering] Mission Control unconfigured — bypassing");
        return handler(forwardReq);
      }
      console.error("[reportMetering] reserve failed, bypassing metering", e);
      return handler(forwardReq);
    }

    let response: Response;
    try {
      response = await handler(forwardReq);
    } catch (err) {
      await cancelTokens(
        reservation!.jobId,
        err instanceof Error ? err.message : "handler_threw",
      );
      throw err;
    }

    const ok = response.ok;
    const headerUsedRaw = response.headers.get("x-mc-tokens-used");
    const headerUsed = headerUsedRaw ? Number(headerUsedRaw) : 0;
    const actual =
      headerUsed > 0 ? Math.ceil(headerUsed) : fallbackActual(estimated, ok);

    if (!ok) {
      await cancelTokens(reservation!.jobId, `handler_status_${response.status}`);
      return response;
    }

    try {
      await commitTokens(reservation!.jobId, actual);
    } catch (e) {
      console.error("[reportMetering] commit failed", e);
    }

    // Inject tokensUsed into JSON responses for the frontend indicator.
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        const json = await response.clone().json();
        const merged =
          json && typeof json === "object" && !Array.isArray(json)
            ? { ...json, tokensUsed: actual, tokensReserved: estimated }
            : { data: json, tokensUsed: actual, tokensReserved: estimated };
        const headers = new Headers(response.headers);
        headers.set("x-tokens-used", String(actual));
        headers.set("x-tokens-reserved", String(estimated));
        return new Response(JSON.stringify(merged), {
          status: response.status,
          headers,
        });
      } catch {
        // fall through and return original
      }
    }

    const headers = new Headers(response.headers);
    headers.set("x-tokens-used", String(actual));
    headers.set("x-tokens-reserved", String(estimated));
    return new Response(response.body, { status: response.status, headers });
  };
}

/** Build a deterministic idempotency key for a generator. */
export function buildIdempotencyKey(
  prefix: string,
  parts: Array<string | number | null | undefined>,
): string {
  const safe = parts.map((p) => String(p ?? "").trim().toLowerCase()).join("|");
  return `${prefix}:${safe}`;
}
