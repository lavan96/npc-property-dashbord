// Superadmin-only proxy for the Mission Control seat entitlement + list APIs.
// Used by the Settings → Plan & Seats card. The clone API key never leaves
// the server.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth } from "../_shared/auth.ts";
import { getSeatEntitlement, listSeats } from "../_shared/missionControlSeats.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }

    const auth = await verifyAuth(supabase, req.headers, body);
    if (auth.error || !auth.userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const { data: role } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", auth.userId).eq("role", "superadmin").maybeSingle();
    if (!role) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const includeList = body?.include_list !== false;
    const status = (body?.status ?? "active") as "active" | "reserved" | "removed";
    const limit = Math.min(200, Math.max(1, Number(body?.limit ?? 50)));
    const offset = Math.max(0, Number(body?.offset ?? 0));

    const [entitlement, seats] = await Promise.all([
      getSeatEntitlement(),
      includeList ? listSeats({ status, limit, offset }) : Promise.resolve(null),
    ]);

    return new Response(JSON.stringify({
      entitlement,
      seats: seats?.seats ?? [],
      total: seats?.total ?? 0,
    }), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[mission-control-seats]", e);
    return new Response(JSON.stringify({
      error: "internal_error",
      message: e instanceof Error ? e.message : String(e),
    }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
