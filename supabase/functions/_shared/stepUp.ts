/**
 * WP-11C — Generic step-up (recent-reauth) enforcement.
 *
 * Verifies that the caller holds a live, unrevoked, unexpired step-up session
 * for the requested capability. Tokens are minted by `security-step-up` and
 * stored hashed in `public.step_up_sessions` (SHA-256 with server pepper).
 *
 * The enforcement can be dark-launched via env `STEP_UP_ENFORCED`:
 *   - "true"           → enforce for all capabilities
 *   - "false"/"off"    → soft-audit only (never blocks)  [DEFAULT]
 *   - comma list       → enforce only for listed capabilities
 *     e.g. "role.change,secrets.update"
 *
 * Callers use:
 *   const gate = await requireStepUp(supabase, { userId, capability, req, body });
 *   if (gate) return gate; // 401 response
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-step-up-token, x-session-token, x-command-centre-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type StepUpCapability =
  | "role.change"
  | "role.remove"
  | "aml.role.set"
  | "secrets.update"
  | "commission.payout.generate"
  | "commission.payout.mark_paid"
  | "commission.payout.cancel"
  | "docusign.send"
  | "docusign.void"
  | "storage.destructive"
  | "mailbox.destructive";

async function sha256Hex(input: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(b))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashStepUpToken(userId: string, capability: string, token: string) {
  const pepper = (globalThis as any).Deno?.env?.get?.("STEP_UP_TOKEN_PEPPER") ?? "";
  return sha256Hex(`${pepper}:${userId}:${capability}:${token}`);
}

function enforcementModeFor(capability: string): "enforce" | "audit" {
  const raw = ((globalThis as any).Deno?.env?.get?.("STEP_UP_ENFORCED") ?? "").trim().toLowerCase();
  if (!raw || raw === "false" || raw === "off" || raw === "0") return "audit";
  if (raw === "true" || raw === "on" || raw === "1" || raw === "*") return "enforce";
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(capability.toLowerCase()) ? "enforce" : "audit";
}

function extractStepUpToken(req?: Request, body?: any): string | null {
  const hdr = req?.headers.get("x-step-up-token");
  if (hdr && hdr.length >= 16) return hdr.trim();
  const bodyTok = body?.step_up_token ?? body?.step_up_session_token;
  if (typeof bodyTok === "string" && bodyTok.length >= 16) return bodyTok.trim();
  return null;
}

export interface RequireStepUpArgs {
  userId: string;
  capability: StepUpCapability | string;
  req?: Request;
  body?: any;
  /** When true, always audit-log even if not enforced. */
  logAudit?: boolean;
}

/**
 * Returns a Response (401) when step-up is required and missing/expired;
 * returns null when the caller is authorised (or when running in audit mode).
 */
export async function requireStepUp(
  admin: any,
  args: RequireStepUpArgs,
): Promise<Response | null> {
  const mode = enforcementModeFor(args.capability);
  const token = extractStepUpToken(args.req, args.body);
  const now = Date.now();

  let valid = false;
  let reason: "missing" | "invalid" | "expired" | "ok" = "missing";

  if (token) {
    const hash = await hashStepUpToken(args.userId, args.capability, token);
    const { data } = await admin
      .from("step_up_sessions")
      .select("id, expires_at, revoked_at")
      .eq("user_id", args.userId)
      .eq("capability", args.capability)
      .eq("token_hash", hash)
      .maybeSingle();
    if (!data) reason = "invalid";
    else if (data.revoked_at || new Date(data.expires_at).getTime() <= now) reason = "expired";
    else {
      reason = "ok";
      valid = true;
    }
  }

  if (mode === "audit" || valid) {
    if (args.logAudit && !valid) {
      try {
        await admin.from("security_events").insert({
          event_type: "step_up.audit",
          severity: "info",
          user_id: args.userId,
          details: { capability: args.capability, reason, enforced: false },
        });
      } catch { /* best-effort */ }
    }
    return null;
  }

  // Enforced + not valid → block
  try {
    await admin.from("security_events").insert({
      event_type: "step_up.blocked",
      severity: "warning",
      user_id: args.userId,
      details: { capability: args.capability, reason, enforced: true },
    });
  } catch { /* best-effort */ }

  return new Response(
    JSON.stringify({
      success: false,
      error: "Recent reauthentication required",
      code: "step_up_required",
      capability: args.capability,
      reason,
    }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

/** Utility for issuers: generate a URL-safe token. */
export function generateStepUpToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}
