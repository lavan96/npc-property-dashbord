// Mission Control purchase-history proxy (user-attributed pricing workflow).
// Returns this install's attributed purchase ledger (who bought what, when,
// for how much) from Mission Control's read-back API. Rows are hard-scoped
// server-side to this clone's API key — no cross-tenant reads are possible.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth } from "../_shared/auth.ts";
import { enforceCsrf, csrfDenied } from "../_shared/csrfGuard.ts";
import { listPurchases, MissionControlError } from "../_shared/missionControl.ts";

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
    const limit = Number(url.searchParams.get("limit") ?? body?.limit ?? 25);
    const offset = Number(url.searchParams.get("offset") ?? body?.offset ?? 0);
    const status = String(url.searchParams.get("status") ?? body?.status ?? "");

    const result = await listPurchases({
      limit,
      offset,
      status: status || undefined,
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
    console.error("[mission-control-purchases] error", payload);
    return new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
