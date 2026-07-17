/**
 * Phase 8 — Property Transactions, Counterparty CDD & Settlement Gate.
 *
 * Ops:
 *   Transactions:     list_transactions, get_transaction, upsert_transaction, delete_transaction, append_event, list_events
 *   Parties:          list_parties, upsert_party, delete_party
 *   Counterparty:     list_cp_cases, upsert_cp_case, delete_cp_case,
 *                     list_cp_requests, upsert_cp_request, resolve_cp_request,
 *                     list_cp_attempts, add_cp_attempt
 *   Gate:             settlement_gate_status (returns { gate_enabled, blocked, reasons[] } — auth only)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { verifyAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token, x-command-centre-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jr = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function sha256Hex(input: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function appendTxEvent(
  aml: any, txId: string, caseId: string, category: string, summary: string,
  payload: any, actorId: string | null, actorLabel: string | null,
) {
  const { data: prev } = await aml.from("transaction_events")
    .select("row_hash").eq("transaction_id", txId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const prevHash = prev?.row_hash ?? null;
  const now = new Date().toISOString();
  const rowHash = await sha256Hex(JSON.stringify({
    transaction_id: txId, case_id: caseId, category, summary, payload,
    actor_id: actorId, actor_label: actorLabel, prev_hash: prevHash, created_at: now,
  }));
  await aml.from("transaction_events").insert({
    transaction_id: txId, case_id: caseId, category, summary, payload,
    actor_id: actorId, actor_label: actorLabel, prev_hash: prevHash, row_hash: rowHash, created_at: now,
  });
}

async function evaluateSettlementGate(admin: any, aml: any, pfId: string) {
  // Find AML case for this purchase file.
  const { data: cases } = await aml.from("cases")
    .select("id, status, risk_rating, updated_at")
    .eq("purchase_file_id", pfId).order("updated_at", { ascending: false }).limit(1);
  const c = (cases ?? [])[0] ?? null;

  const { data: flagRow } = await admin.from("feature_flags")
    .select("value").eq("key", "aml_settlement_gate").maybeSingle();
  const enabled = Boolean((flagRow?.value ?? {}).enabled);

  if (!c) {
    return { gate_enabled: enabled, blocked: enabled, reasons: enabled ? ["no_aml_case_linked"] : [], aml_case_id: null };
  }

  const reasons: string[] = [];

  // Blocking statuses
  const blockingStatuses = new Set(["draft", "kyc_in_progress", "edd_required", "under_review", "escalated_mlro", "blocked"]);
  if (blockingStatuses.has(c.status)) reasons.push(`case_status:${c.status}`);
  if (c.risk_rating === "prohibited") reasons.push("risk_rating:prohibited");

  // Open discrepancies
  const { count: discCount } = await aml.from("finance_discrepancies")
    .select("id", { count: "exact", head: true })
    .eq("case_id", c.id).in("status", ["open", "under_review", "escalated"]);
  if ((discCount ?? 0) > 0) reasons.push(`open_finance_discrepancies:${discCount}`);

  // Open counterparty requests past due
  const today = new Date().toISOString().slice(0, 10);
  const { count: reqCount } = await aml.from("counterparty_requests")
    .select("id", { count: "exact", head: true })
    .eq("case_id", c.id).in("status", ["pending", "sent", "awaiting_response"])
    .lte("due_date", today);
  if ((reqCount ?? 0) > 0) reasons.push(`overdue_counterparty_requests:${reqCount}`);

  return {
    gate_enabled: enabled,
    blocked: enabled && reasons.length > 0,
    reasons,
    aml_case_id: c.id,
    case_status: c.status,
    risk_rating: c.risk_rating,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service);
    const aml = admin.schema("aml");

    const body = await req.json().catch(() => ({}));
    const auth = await verifyAuth(admin, req.headers, body);
    if (auth.error || !auth.userId || auth.userId === "service_role") return jr({ error: auth.error || "Authentication required" }, 401);
    const userId = auth.userId;
    const userLabel = auth.username ?? null;
    const op = String(body?.op ?? "");

    // Settlement gate — auth only, no AML role needed (used by finance portal).
    if (op === "settlement_gate_status") {
      const pfId = String(body.purchase_file_id ?? "");
      if (!pfId) return jr({ error: "purchase_file_id required" }, 400);
      const result = await evaluateSettlementGate(admin, aml, pfId);
      return jr(result);
    }

    const { data: hasAny } = await admin.rpc("has_any_aml_role", { _user_id: userId });
    if (!hasAny) return jr({ error: "AML role required" }, 403);

    const { data: canWriteRow } = await admin.rpc("has_aml_write_role", { _user_id: userId });
    const canWrite = Boolean(canWriteRow);
    const requireWrite = () => {
      if (!canWrite) throw new Response(JSON.stringify({ error: "Insufficient permissions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    };

    // ── TRANSACTIONS ──
    if (op === "list_transactions") {
      const caseId = String(body.case_id ?? "");
      if (!caseId) return jr({ error: "case_id required" }, 400);
      const { data, error } = await aml.from("transactions")
        .select("*").eq("case_id", caseId).order("created_at", { ascending: false });
      if (error) return jr({ error: error.message }, 400);
      return jr({ transactions: data ?? [] });
    }
    if (op === "get_transaction") {
      const id = String(body.id ?? "");
      const { data, error } = await aml.from("transactions").select("*").eq("id", id).maybeSingle();
      if (error) return jr({ error: error.message }, 400);
      return jr({ transaction: data });
    }
    if (op === "upsert_transaction") {
      requireWrite();
      const p = body.transaction ?? {};
      if (!p.case_id) return jr({ error: "case_id required" }, 400);

      let originalSettlement = p.original_settlement_date ?? null;
      let settlementChanged = false;
      let existing: any = null;
      if (p.id) {
        const { data: ex } = await aml.from("transactions").select("*").eq("id", p.id).maybeSingle();
        existing = ex;
        if (ex) {
          if (!originalSettlement && ex.original_settlement_date) originalSettlement = ex.original_settlement_date;
          if (!originalSettlement && ex.settlement_date && ex.settlement_date !== p.settlement_date) {
            originalSettlement = ex.settlement_date;
          }
          if (ex.settlement_date && p.settlement_date && ex.settlement_date !== p.settlement_date) {
            settlementChanged = true;
          }
        }
      } else if (p.settlement_date) {
        originalSettlement = originalSettlement ?? p.settlement_date;
      }

      const row = { ...p, created_by: userId, original_settlement_date: originalSettlement };
      const resp = p.id
        ? await aml.from("transactions").update(row).eq("id", p.id).select("*").maybeSingle()
        : await aml.from("transactions").insert(row).select("*").maybeSingle();
      if (resp.error) return jr({ error: resp.error.message }, 400);

      const tx = resp.data;
      await appendTxEvent(aml, tx.id, tx.case_id,
        p.id ? "updated" : "created",
        p.id ? "Transaction updated" : "Transaction captured",
        { fields: Object.keys(p), settlement_changed: settlementChanged },
        userId, userLabel);
      if (settlementChanged) {
        await appendTxEvent(aml, tx.id, tx.case_id, "settlement_rescheduled",
          `Settlement date changed from ${existing?.settlement_date} to ${tx.settlement_date}`,
          { from: existing?.settlement_date, to: tx.settlement_date }, userId, userLabel);
      }
      return jr({ transaction: tx });
    }
    if (op === "delete_transaction") {
      requireWrite();
      const id = String(body.id ?? "");
      const { error } = await aml.from("transactions").delete().eq("id", id);
      if (error) return jr({ error: error.message }, 400);
      return jr({ ok: true });
    }
    if (op === "list_events") {
      const txId = String(body.transaction_id ?? "");
      const { data, error } = await aml.from("transaction_events")
        .select("*").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(200);
      if (error) return jr({ error: error.message }, 400);
      return jr({ events: data ?? [] });
    }
    if (op === "append_event") {
      requireWrite();
      const txId = String(body.transaction_id ?? "");
      const { data: tx } = await aml.from("transactions").select("case_id").eq("id", txId).maybeSingle();
      if (!tx) return jr({ error: "transaction not found" }, 404);
      await appendTxEvent(aml, txId, tx.case_id,
        String(body.category ?? "note"), String(body.summary ?? ""),
        body.payload ?? {}, userId, userLabel);
      return jr({ ok: true });
    }

    // ── PARTIES ──
    if (op === "list_parties") {
      const txId = String(body.transaction_id ?? "");
      const { data, error } = await aml.from("transaction_parties")
        .select("*").eq("transaction_id", txId).order("created_at", { ascending: true });
      if (error) return jr({ error: error.message }, 400);
      return jr({ parties: data ?? [] });
    }
    if (op === "upsert_party") {
      requireWrite();
      const p = body.party ?? {};
      if (!p.transaction_id || !p.case_id || !p.display_name || !p.party_type) {
        return jr({ error: "transaction_id, case_id, display_name, party_type required" }, 400);
      }
      const resp = p.id
        ? await aml.from("transaction_parties").update(p).eq("id", p.id).select("*").maybeSingle()
        : await aml.from("transaction_parties").insert(p).select("*").maybeSingle();
      if (resp.error) return jr({ error: resp.error.message }, 400);
      await appendTxEvent(aml, p.transaction_id, p.case_id, "party_updated",
        `Party ${p.display_name} (${p.party_type}) ${p.id ? "updated" : "added"}`,
        { party_id: resp.data.id, party_type: p.party_type }, userId, userLabel);
      return jr({ party: resp.data });
    }
    if (op === "delete_party") {
      requireWrite();
      const id = String(body.id ?? "");
      const { error } = await aml.from("transaction_parties").delete().eq("id", id);
      if (error) return jr({ error: error.message }, 400);
      return jr({ ok: true });
    }

    // ── COUNTERPARTY CASES ──
    if (op === "list_cp_cases") {
      const caseId = String(body.case_id ?? "");
      const { data, error } = await aml.from("counterparty_cases")
        .select("*").eq("case_id", caseId).order("created_at", { ascending: false });
      if (error) return jr({ error: error.message }, 400);
      return jr({ counterparty_cases: data ?? [] });
    }
    if (op === "upsert_cp_case") {
      requireWrite();
      const p = body.counterparty_case ?? {};
      if (!p.case_id || !p.subject_display_name) return jr({ error: "case_id and subject_display_name required" }, 400);
      const row = { ...p, created_by: userId };
      const resp = p.id
        ? await aml.from("counterparty_cases").update(row).eq("id", p.id).select("*").maybeSingle()
        : await aml.from("counterparty_cases").insert(row).select("*").maybeSingle();
      if (resp.error) return jr({ error: resp.error.message }, 400);
      return jr({ counterparty_case: resp.data });
    }
    if (op === "delete_cp_case") {
      requireWrite();
      const id = String(body.id ?? "");
      const { error } = await aml.from("counterparty_cases").delete().eq("id", id);
      if (error) return jr({ error: error.message }, 400);
      return jr({ ok: true });
    }

    // ── COUNTERPARTY REQUESTS ──
    if (op === "list_cp_requests") {
      const cpcId = body.counterparty_case_id ? String(body.counterparty_case_id) : null;
      const caseId = body.case_id ? String(body.case_id) : null;
      let q = aml.from("counterparty_requests").select("*").order("created_at", { ascending: false });
      if (cpcId) q = q.eq("counterparty_case_id", cpcId);
      else if (caseId) q = q.eq("case_id", caseId);
      const { data, error } = await q;
      if (error) return jr({ error: error.message }, 400);
      return jr({ requests: data ?? [] });
    }
    if (op === "upsert_cp_request") {
      requireWrite();
      const p = body.request ?? {};
      if (!p.counterparty_case_id || !p.case_id || !p.request_type || !p.summary) {
        return jr({ error: "counterparty_case_id, case_id, request_type, summary required" }, 400);
      }
      const row = { ...p, created_by: userId };
      const resp = p.id
        ? await aml.from("counterparty_requests").update(row).eq("id", p.id).select("*").maybeSingle()
        : await aml.from("counterparty_requests").insert(row).select("*").maybeSingle();
      if (resp.error) return jr({ error: resp.error.message }, 400);
      return jr({ request: resp.data });
    }
    if (op === "resolve_cp_request") {
      requireWrite();
      const id = String(body.id ?? "");
      const status = String(body.status ?? "resolved");
      const { data, error } = await aml.from("counterparty_requests")
        .update({ status, metadata: body.metadata ?? undefined }).eq("id", id).select("*").maybeSingle();
      if (error) return jr({ error: error.message }, 400);
      return jr({ request: data });
    }

    if (op === "list_cp_attempts") {
      const rid = String(body.request_id ?? "");
      const { data, error } = await aml.from("counterparty_attempts")
        .select("*").eq("request_id", rid).order("attempted_at", { ascending: false });
      if (error) return jr({ error: error.message }, 400);
      return jr({ attempts: data ?? [] });
    }
    if (op === "add_cp_attempt") {
      requireWrite();
      const p = body.attempt ?? {};
      if (!p.request_id || !p.counterparty_case_id || !p.channel) {
        return jr({ error: "request_id, counterparty_case_id, channel required" }, 400);
      }
      const { data, error } = await aml.from("counterparty_attempts")
        .insert({ ...p, actor_id: userId }).select("*").maybeSingle();
      if (error) return jr({ error: error.message }, 400);
      return jr({ attempt: data });
    }

    return jr({ error: `Unknown op: ${op}` }, 400);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return jr({ error: e?.message ?? "Internal error" }, 500);
  }
});
