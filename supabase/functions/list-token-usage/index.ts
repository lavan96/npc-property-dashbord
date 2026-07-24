// Lists recent token_usage_history rows.
// - Regular users: only their own rows.
// - Admin/superadmin: all rows in the agency.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth } from "../_shared/auth.ts";

import { enforceCsrf, csrfDenied } from "../_shared/csrfGuard.ts";
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
    try { body = await req.json(); } catch { /* */ }

    const auth = await verifyAuth(supabase, req.headers, body);
    if (auth.error || !auth.userId) {
      return new Response(JSON.stringify({ error: auth.error ?? "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const limit = Math.min(Number(body?.limit ?? 100), 500);
    const scope: "mine" | "agency" = body?.scope === "agency" ? "agency" : "mine";

    let isAdmin = false;
    if (scope === "agency") {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", auth.userId);
      isAdmin = (roles ?? []).some((r: any) =>
        ["superadmin", "admin"].includes(String(r.role)),
      );
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403, headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }
    }

    let q = supabase
      .from("token_usage_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (scope === "mine") {
      // Reconcile personal usage to the agency-wide index: a row belongs to the
      // caller if their id appears in EITHER user_id (legacy attribution) or
      // billing_user_id (updated attribution written by newer metering paths).
      q = q.or(`user_id.eq.${auth.userId},billing_user_id.eq.${auth.userId}`);
    }

    const { data, error } = await q;
    if (error) throw error;
    return new Response(JSON.stringify({ rows: data ?? [] }), {
      status: 200, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[list-token-usage]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
