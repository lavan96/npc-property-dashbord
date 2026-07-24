// Mission Control top-up packs proxy.
// Returns the public catalogue + deep-link `topup_url` for the OutOfTokensBanner CTA.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth } from "../_shared/auth.ts";
import { enforceCsrf, csrfDenied } from "../_shared/csrfGuard.ts";
import { listTopupPacks, MissionControlError } from "../_shared/missionControl.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-session-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // SEC5-CSRF: reject cross-site cookie-authenticated mutations (exact-origin).
  // No-op for GET/HEAD/OPTIONS and any request without the session cookie.
  const __csrf = enforceCsrf(req);
  if (!__csrf.ok) return csrfDenied(corsHeaders, __csrf);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: any = {};
    try { body = await req.json(); } catch { /* allow empty */ }

    const auth = await verifyAuth(supabase, req.headers, body);
    if (auth.error || !auth.userId) {
      return new Response(
        JSON.stringify({ error: auth.error ?? "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? body?.limit ?? 50);
    const offset = Number(url.searchParams.get("offset") ?? body?.offset ?? 0);

    // Pass the signed-in user through so Mission Control mints the topup deep
    // link as an attributed handoff (user-attributed pricing workflow) — the
    // pre-fetched CTA then carries the initiating user with no extra hops.
    const result = await listTopupPacks({
      limit,
      offset,
      originUserId: auth.userId,
      originUsername: auth.username ?? null,
    });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    const isMc = e instanceof MissionControlError;
    const status = isMc ? e.status : 500;
    const payload = isMc
      ? { error: e.code, message: e.message }
      : { error: "internal_error", message: e instanceof Error ? e.message : String(e) };
    console.error("[mission-control-packs] error", payload);
    return new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
