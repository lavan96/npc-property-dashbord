/**
 * Phase 7 — Finance Portal Loan & Funding Integration.
 *
 * Ops (POST {op, ...args}):
 *   Comparisons:    list_comparisons, get_comparison, upsert_comparison, delete_comparison,
 *                   import_from_purchase_file
 *   Discrepancies:  list_discrepancies, upsert_discrepancy, resolve_discrepancy, delete_discrepancy,
 *                   recompute_discrepancies
 *   Evidence:       list_evidence, add_evidence, delete_evidence
 *   Limited view:   limited_status (returns status pill only for finance-portal panel)
 *
 * Reads: any AML role (limited_status is auth-only, no role required — scoped by purchase_file_id).
 * Writes: analyst/reviewer/mlro.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jr = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function sha256Hex(input: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function appendCaseEvent(
  admin: any, caseId: string, category: string, summary: string,
  payload: any, actorId: string | null, actorLabel: string | null,
) {
  const { data: prev } = await admin.schema("aml").from("case_events")
    .select("row_hash").eq("case_id", caseId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const prevHash = prev?.row_hash ?? null;
  const now = new Date().toISOString();
  const rowHash = await sha256Hex(JSON.stringify({
    case_id: caseId, category, summary, payload, actor_id: actorId, actor_label: actorLabel, prev_hash: prevHash, created_at: now,
  }));
  await admin.schema("aml").from("case_events").insert({
    case_id: caseId, category, summary, payload, actor_id: actorId, actor_label: actorLabel,
    prev_hash: prevHash, row_hash: rowHash, created_at: now,
  });
}

type Comparison = {
  id?: string;
  case_id: string;
  purchase_file_id?: string | null;
  source?: string;
  purchase_price?: number | null;
  loan_amount?: number | null;
  lender?: string | null;
  lvr?: number | null;
  borrower_contribution?: number | null;
  refi_equity?: number | null;
  gift_amount?: number | null;
  gift_source?: string | null;
  smsf_lrba?: boolean;
  smsf_details?: any;
  loan_purpose?: string | null;
  funding_notes?: string | null;
  raw_payload?: any;
};

/** Deterministic discrepancy engine. */
function detectDiscrepancies(current: Comparison, previous: Comparison | null, pf: any | null): Array<{
  kind: string; severity: "info"|"low"|"medium"|"high"|"critical"; summary: string; detail?: string;
  expected_value?: any; observed_value?: any;
}> {
  const out: any[] = [];
  const price = Number(current.purchase_price ?? 0);
  const loan = Number(current.loan_amount ?? 0);
  const contribution = Number(current.borrower_contribution ?? 0);
  const gift = Number(current.gift_amount ?? 0);
  const refi = Number(current.refi_equity ?? 0);
  const lvr = Number(current.lvr ?? 0);

  if (price > 0 && loan > 0) {
    const impliedLvr = (loan / price) * 100;
    if (lvr > 0 && Math.abs(impliedLvr - lvr) > 2.5) {
      out.push({
        kind: "lvr_mismatch", severity: "medium",
        summary: `Declared LVR ${lvr.toFixed(1)}% differs from loan÷price (${impliedLvr.toFixed(1)}%)`,
        expected_value: { lvr: Number(impliedLvr.toFixed(2)) }, observed_value: { lvr },
      });
    }
    const fundingGap = price - (loan + contribution + gift + refi);
    if (Math.abs(fundingGap) > 5000) {
      out.push({
        kind: "funding_gap", severity: fundingGap > 20000 ? "high" : "medium",
        summary: `Funding sources do not reconcile to price (gap ${fundingGap.toLocaleString(undefined,{maximumFractionDigits:0})})`,
        detail: `price=${price}, loan+contribution+gift+refi=${loan+contribution+gift+refi}`,
        expected_value: { total: price }, observed_value: { total: loan + contribution + gift + refi },
      });
    }
  }

  if (gift > 0 && !current.gift_source) {
    out.push({
      kind: "unexplained_gift", severity: "high",
      summary: `Gift of ${gift.toLocaleString()} declared without documented source`,
    });
  }
  if (gift > 0 && price > 0 && gift / price > 0.2) {
    out.push({
      kind: "large_gift_ratio", severity: "high",
      summary: `Gift represents ${((gift/price)*100).toFixed(0)}% of purchase price — enhanced SoF review required`,
    });
  }
  if (lvr > 95) {
    out.push({
      kind: "lvr_over_95", severity: "medium",
      summary: `LVR ${lvr.toFixed(1)}% exceeds 95% — confirm LMI + serviceability`,
    });
  }
  if (current.smsf_lrba) {
    out.push({
      kind: "smsf_lrba_declared", severity: "info",
      summary: "SMSF LRBA declared — verify trustee structure, custodian bare trust, single-acquirable-asset rule",
    });
  }

  if (previous) {
    if (previous.lender && current.lender && previous.lender !== current.lender) {
      out.push({
        kind: "lender_changed", severity: "low",
        summary: `Lender changed from ${previous.lender} to ${current.lender}`,
        expected_value: { lender: previous.lender }, observed_value: { lender: current.lender },
      });
    }
    const prevLoan = Number(previous.loan_amount ?? 0);
    if (prevLoan > 0 && loan > 0 && Math.abs(loan - prevLoan) / prevLoan > 0.1) {
      out.push({
        kind: "loan_amount_shift", severity: "medium",
        summary: `Loan amount moved by ${(((loan-prevLoan)/prevLoan)*100).toFixed(1)}% vs last snapshot`,
        expected_value: { loan_amount: prevLoan }, observed_value: { loan_amount: loan },
      });
    }
  }

  if (pf) {
    const pfPrice = Number(pf.purchase_price ?? 0);
    if (pfPrice > 0 && price > 0 && Math.abs(pfPrice - price) > 5000) {
      out.push({
        kind: "price_mismatch_pf", severity: "medium",
        summary: `Finance portal purchase price ${pfPrice.toLocaleString()} differs from AML capture ${price.toLocaleString()}`,
        expected_value: { purchase_price: pfPrice }, observed_value: { purchase_price: price },
      });
    }
    if (pf.lender && current.lender && String(pf.lender).toLowerCase() !== String(current.lender).toLowerCase()) {
      out.push({
        kind: "lender_mismatch_pf", severity: "low",
        summary: `Finance portal lender "${pf.lender}" differs from AML capture "${current.lender}"`,
      });
    }
  }

  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return jr({ error: "Unauthorized" }, 401);

    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: userData, error: uErr } = await userClient.auth.getUser();
    if (uErr || !userData?.user) return jr({ error: "Invalid session" }, 401);
    const userId = userData.user.id;
    const userLabel = userData.user.email ?? null;

    const admin = createClient(url, service);
    const aml = admin.schema("aml");

    const body = await req.json().catch(() => ({}));
    const op = String(body?.op ?? "");

    // Limited status endpoint — auth only, does NOT require AML role.
    // Returns just enough for the Finance Portal to show a status pill.
    if (op === "limited_status") {
      const pfId = body.purchase_file_id ? String(body.purchase_file_id) : null;
      const clientId = body.client_id ? String(body.client_id) : null;
      if (!pfId && !clientId) return jr({ error: "purchase_file_id or client_id required" }, 400);

      let q = aml.from("cases").select("id, status, risk_rating, updated_at, purchase_file_id, client_id");
      if (pfId) q = q.eq("purchase_file_id", pfId);
      else if (clientId) q = q.eq("client_id", clientId);
      const { data: rows } = await q.order("updated_at", { ascending: false }).limit(1);
      const c = (rows ?? [])[0] ?? null;
      if (!c) return jr({ status: "not_started", risk_rating: null, updated_at: null });

      // Count open discrepancies without leaking detail.
      const { count } = await aml.from("finance_discrepancies")
        .select("id", { count: "exact", head: true })
        .eq("case_id", c.id).in("status", ["open", "under_review", "escalated"]);

      return jr({
        status: c.status,
        risk_rating: c.risk_rating,
        updated_at: c.updated_at,
        open_finance_discrepancies: count ?? 0,
      });
    }

    // All other ops require an AML role.
    const { data: hasAny } = await admin.rpc("has_any_aml_role", { _user_id: userId });
    if (!hasAny) return jr({ error: "AML role required" }, 403);

    const { data: roleRows } = await aml.from("role_assignments")
      .select("role").eq("user_id", userId).is("revoked_at", null);
    const roles = new Set<string>((roleRows ?? []).map((r: any) => r.role));
    const canWrite = roles.has("analyst") || roles.has("reviewer") || roles.has("mlro");
    const requireWrite = () => {
      if (!canWrite) throw new Response(JSON.stringify({ error: "Insufficient permissions" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    };

    // ── COMPARISONS ────────────────────────────────────────
    if (op === "list_comparisons") {
      const caseId = String(body.case_id ?? "");
      if (!caseId) return jr({ error: "case_id required" }, 400);
      const { data, error } = await aml.from("finance_comparisons")
        .select("*").eq("case_id", caseId).order("captured_at", { ascending: false });
      if (error) return jr({ error: error.message }, 400);
      return jr({ comparisons: data ?? [] });
    }

    if (op === "get_comparison") {
      const id = String(body.id ?? "");
      const { data, error } = await aml.from("finance_comparisons").select("*").eq("id", id).maybeSingle();
      if (error) return jr({ error: error.message }, 400);
      return jr({ comparison: data });
    }

    if (op === "upsert_comparison") {
      requireWrite();
      const payload: Comparison = body.comparison ?? {};
      if (!payload.case_id) return jr({ error: "case_id required" }, 400);

      const { data: prevList } = await aml.from("finance_comparisons")
        .select("*").eq("case_id", payload.case_id).order("captured_at", { ascending: false }).limit(1);
      const previous = (prevList ?? [])[0] ?? null;

      let pfRow: any = null;
      if (payload.purchase_file_id) {
        const { data: pf } = await admin.from("purchase_files")
          .select("id, purchase_price, lender, finance_status, title")
          .eq("id", payload.purchase_file_id).maybeSingle();
        pfRow = pf;
      }

      const row = {
        ...payload,
        captured_by: userId,
        source: payload.source ?? "manual_entry",
        raw_payload: payload.raw_payload ?? {},
        smsf_details: payload.smsf_details ?? {},
      };
      const upsertResp = payload.id
        ? await aml.from("finance_comparisons").update(row).eq("id", payload.id).select("*").maybeSingle()
        : await aml.from("finance_comparisons").insert(row).select("*").maybeSingle();
      if (upsertResp.error) return jr({ error: upsertResp.error.message }, 400);
      const comparison = upsertResp.data;

      // Detect and persist discrepancies.
      const detected = detectDiscrepancies(comparison, previous, pfRow);
      let created = 0;
      for (const d of detected) {
        await aml.from("finance_discrepancies").insert({
          case_id: comparison.case_id, comparison_id: comparison.id,
          kind: d.kind, severity: d.severity, summary: d.summary, detail: d.detail ?? null,
          expected_value: d.expected_value ?? null, observed_value: d.observed_value ?? null,
          detected_by: "system",
        });
        created++;
      }

      await appendCaseEvent(
        admin, comparison.case_id, "system",
        payload.id ? "Finance comparison updated" : "Finance comparison captured",
        { comparison_id: comparison.id, discrepancies_created: created, source: comparison.source },
        userId, userLabel,
      );
      return jr({ comparison, discrepancies_created: created });
    }

    if (op === "delete_comparison") {
      requireWrite();
      const id = String(body.id ?? "");
      const { data: existing } = await aml.from("finance_comparisons").select("case_id").eq("id", id).maybeSingle();
      const { error } = await aml.from("finance_comparisons").delete().eq("id", id);
      if (error) return jr({ error: error.message }, 400);
      if (existing?.case_id) {
        await appendCaseEvent(admin, existing.case_id, "system", "Finance comparison deleted", { id }, userId, userLabel);
      }
      return jr({ ok: true });
    }

    if (op === "import_from_purchase_file") {
      requireWrite();
      const caseId = String(body.case_id ?? "");
      const pfId = String(body.purchase_file_id ?? "");
      if (!caseId || !pfId) return jr({ error: "case_id and purchase_file_id required" }, 400);

      const { data: pf, error: pfErr } = await admin.from("purchase_files")
        .select("id, purchase_price, lender, finance_status, title, max_approved_budget")
        .eq("id", pfId).maybeSingle();
      if (pfErr || !pf) return jr({ error: "purchase file not found" }, 404);

      // Latest lender submission for loan amount / LVR.
      const { data: subs } = await admin.from("lender_submissions")
        .select("loan_amount, lender_name, lvr, submitted_at")
        .eq("purchase_file_id", pfId).order("submitted_at", { ascending: false, nullsFirst: false }).limit(1);
      const sub = (subs ?? [])[0] ?? null;

      const payload: Comparison = {
        case_id: caseId,
        purchase_file_id: pfId,
        source: "finance_portal",
        purchase_price: pf.purchase_price ?? null,
        loan_amount: sub?.loan_amount ?? pf.max_approved_budget ?? null,
        lender: sub?.lender_name ?? pf.lender ?? null,
        lvr: sub?.lvr ?? null,
        raw_payload: { purchase_file: pf, latest_submission: sub },
      };

      // Call our own upsert path via internal call.
      const { data: prevList } = await aml.from("finance_comparisons")
        .select("*").eq("case_id", caseId).order("captured_at", { ascending: false }).limit(1);
      const previous = (prevList ?? [])[0] ?? null;

      const { data: comp, error: cErr } = await aml.from("finance_comparisons")
        .insert({ ...payload, captured_by: userId }).select("*").maybeSingle();
      if (cErr) return jr({ error: cErr.message }, 400);

      const detected = detectDiscrepancies(comp, previous, pf);
      for (const d of detected) {
        await aml.from("finance_discrepancies").insert({
          case_id: caseId, comparison_id: comp.id,
          kind: d.kind, severity: d.severity, summary: d.summary, detail: d.detail ?? null,
          expected_value: d.expected_value ?? null, observed_value: d.observed_value ?? null,
          detected_by: "system",
        });
      }
      await appendCaseEvent(admin, caseId, "system", "Imported finance data from purchase file",
        { purchase_file_id: pfId, comparison_id: comp.id, discrepancies_created: detected.length },
        userId, userLabel);
      return jr({ comparison: comp, discrepancies_created: detected.length });
    }

    // ── DISCREPANCIES ──────────────────────────────────────
    if (op === "list_discrepancies") {
      const caseId = body.case_id ? String(body.case_id) : null;
      const status = body.status ? String(body.status) : null;
      const severity = body.severity ? String(body.severity) : null;
      let q = aml.from("finance_discrepancies").select("*");
      if (caseId) q = q.eq("case_id", caseId);
      if (status) q = q.eq("status", status);
      if (severity) q = q.eq("severity", severity);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(500);
      if (error) return jr({ error: error.message }, 400);
      return jr({ discrepancies: data ?? [] });
    }

    if (op === "upsert_discrepancy") {
      requireWrite();
      const d = body.discrepancy ?? {};
      if (!d.case_id || !d.summary || !d.kind) return jr({ error: "case_id, kind, summary required" }, 400);
      const row = { ...d, detected_by: d.detected_by ?? "manual" };
      const resp = d.id
        ? await aml.from("finance_discrepancies").update(row).eq("id", d.id).select("*").maybeSingle()
        : await aml.from("finance_discrepancies").insert(row).select("*").maybeSingle();
      if (resp.error) return jr({ error: resp.error.message }, 400);
      await appendCaseEvent(admin, d.case_id, "edd_note",
        d.id ? "Discrepancy updated" : "Discrepancy recorded",
        { id: resp.data?.id, kind: d.kind, severity: d.severity }, userId, userLabel);
      return jr({ discrepancy: resp.data });
    }

    if (op === "resolve_discrepancy") {
      requireWrite();
      const id = String(body.id ?? "");
      const status = String(body.status ?? "resolved");
      const note = body.resolution_note ? String(body.resolution_note) : null;
      const { data, error } = await aml.from("finance_discrepancies")
        .update({ status, resolution_note: note, resolved_by: userId, resolved_at: new Date().toISOString() })
        .eq("id", id).select("*").maybeSingle();
      if (error) return jr({ error: error.message }, 400);
      if (data?.case_id) {
        await appendCaseEvent(admin, data.case_id, "edd_note",
          `Discrepancy ${status}`, { id, kind: data.kind, note }, userId, userLabel);
      }
      return jr({ discrepancy: data });
    }

    if (op === "delete_discrepancy") {
      requireWrite();
      const id = String(body.id ?? "");
      const { data: existing } = await aml.from("finance_discrepancies").select("case_id").eq("id", id).maybeSingle();
      const { error } = await aml.from("finance_discrepancies").delete().eq("id", id);
      if (error) return jr({ error: error.message }, 400);
      if (existing?.case_id) {
        await appendCaseEvent(admin, existing.case_id, "system", "Discrepancy deleted", { id }, userId, userLabel);
      }
      return jr({ ok: true });
    }

    if (op === "recompute_discrepancies") {
      requireWrite();
      const compId = String(body.comparison_id ?? "");
      const { data: comp } = await aml.from("finance_comparisons").select("*").eq("id", compId).maybeSingle();
      if (!comp) return jr({ error: "comparison not found" }, 404);
      const { data: prevList } = await aml.from("finance_comparisons")
        .select("*").eq("case_id", comp.case_id).lt("captured_at", comp.captured_at)
        .order("captured_at", { ascending: false }).limit(1);
      let pfRow: any = null;
      if (comp.purchase_file_id) {
        const { data: pf } = await admin.from("purchase_files")
          .select("id, purchase_price, lender").eq("id", comp.purchase_file_id).maybeSingle();
        pfRow = pf;
      }
      const detected = detectDiscrepancies(comp, (prevList ?? [])[0] ?? null, pfRow);
      for (const d of detected) {
        await aml.from("finance_discrepancies").insert({
          case_id: comp.case_id, comparison_id: comp.id,
          kind: d.kind, severity: d.severity, summary: d.summary, detail: d.detail ?? null,
          expected_value: d.expected_value ?? null, observed_value: d.observed_value ?? null,
          detected_by: "system_recompute",
        });
      }
      return jr({ discrepancies_created: detected.length });
    }

    // ── EVIDENCE ───────────────────────────────────────────
    if (op === "list_evidence") {
      const caseId = String(body.case_id ?? "");
      const { data, error } = await aml.from("evidence_references")
        .select("*").eq("case_id", caseId).order("created_at", { ascending: false });
      if (error) return jr({ error: error.message }, 400);
      return jr({ evidence: data ?? [] });
    }

    if (op === "add_evidence") {
      requireWrite();
      const ev = body.evidence ?? {};
      if (!ev.case_id || !ev.reference_type || !ev.label) {
        return jr({ error: "case_id, reference_type, label required" }, 400);
      }
      const { data, error } = await aml.from("evidence_references")
        .insert({ ...ev, added_by: userId }).select("*").maybeSingle();
      if (error) return jr({ error: error.message }, 400);
      await appendCaseEvent(admin, ev.case_id, "document_added",
        `Finance evidence attached: ${ev.label}`, { reference_type: ev.reference_type }, userId, userLabel);
      return jr({ evidence: data });
    }

    if (op === "delete_evidence") {
      requireWrite();
      const id = String(body.id ?? "");
      const { data: existing } = await aml.from("evidence_references").select("case_id, label").eq("id", id).maybeSingle();
      const { error } = await aml.from("evidence_references").delete().eq("id", id);
      if (error) return jr({ error: error.message }, 400);
      if (existing?.case_id) {
        await appendCaseEvent(admin, existing.case_id, "system", "Finance evidence removed", { id, label: existing.label }, userId, userLabel);
      }
      return jr({ ok: true });
    }

    return jr({ error: `Unknown op: ${op}` }, 400);
  } catch (e: any) {
    if (e instanceof Response) return e;
    console.error("aml-finance error", e);
    return jr({ error: e?.message ?? "internal error" }, 500);
  }
});
