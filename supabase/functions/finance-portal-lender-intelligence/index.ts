/**
 * Phase 7.4 — Lender Intelligence
 *
 * Operations:
 *  - list_playbooks                                  → all active playbooks (+ computed stats)
 *  - get_playbook   { lender_key }                   → single playbook + stats
 *  - upsert_playbook { lender_key, lender_label, ... } → create/update
 *  - compare_lenders { lender_keys[], loan_amount }  → side-by-side scoring
 *
 * Auth: finance partner session token (x-finance-session-token).
 * Service-role internally to bypass RLS.
 *
 * Turnaround stats are derived from public.lender_submissions
 * (median days from submitted_at → approved_at, last 24 months, min 3 samples).
 */
import { createClient } from 'npm:@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-finance-session-token, x-session-token, x-session-id, x-portal-session-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const normalizeKey = (s: string) =>
  String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function extractToken(req: Request, body: any): string | null {
  return (
    req.headers.get('x-finance-session-token') ||
    req.headers.get('x-session-token') ||
    req.headers.get('x-session-id') ||
    body?.finance_session_token ||
    body?.session_token ||
    null
  );
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const arr = [...values].sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : Math.round((arr[mid - 1] + arr[mid]) / 2);
}

async function computeTurnaroundStats(supabase: any, lenderKey: string, lenderLabel: string) {
  // Match by lender_name (case-insensitive contains) since submissions only have free-text labels.
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 2).toISOString();
  const { data: subs } = await supabase
    .from('lender_submissions')
    .select('submitted_at, approved_at, settled_at, status, lender_name')
    .ilike('lender_name', `%${lenderLabel.split(' ')[0]}%`)
    .gte('submitted_at', since)
    .limit(500);

  const rows = (subs as any[]) || [];
  const filtered = rows.filter((r) => {
    const norm = normalizeKey(r.lender_name || '');
    return norm === lenderKey || norm.includes(lenderKey) || lenderKey.includes(norm);
  });

  const approvalDays = filtered
    .filter((r) => r.submitted_at && r.approved_at)
    .map(
      (r) =>
        (new Date(r.approved_at).getTime() - new Date(r.submitted_at).getTime()) /
        (1000 * 60 * 60 * 24),
    );
  const settlementDays = filtered
    .filter((r) => r.approved_at && r.settled_at)
    .map(
      (r) =>
        (new Date(r.settled_at).getTime() - new Date(r.approved_at).getTime()) /
        (1000 * 60 * 60 * 24),
    );

  const approvedCount = filtered.filter((r) => r.approved_at).length;
  const totalCount = filtered.length;
  const approvalRatePct =
    totalCount >= 3 ? Math.round((approvedCount / totalCount) * 100) : null;

  return {
    sample_size: totalCount,
    median_days_to_approval:
      approvalDays.length >= 3 ? median(approvalDays.map((d) => Math.round(d))) : null,
    median_days_approval_to_settlement:
      settlementDays.length >= 3 ? median(settlementDays.map((d) => Math.round(d))) : null,
    approval_rate_pct: approvalRatePct,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json().catch(() => ({}));
    const { operation = 'list_playbooks' } = body || {};

    const token = extractToken(req, body);
    if (!token) return json({ error: 'Session token required' }, 401);

    const { data: portalUser } = await supabase
      .from('finance_portal_users')
      .select('id, is_active, revoked_at, session_expires_at')
      .eq('session_token', token)
      .maybeSingle();

    if (!portalUser || !portalUser.is_active || portalUser.revoked_at) {
      return json({ error: 'Invalid session' }, 401);
    }
    if (
      !portalUser.session_expires_at ||
      new Date(portalUser.session_expires_at) < new Date()
    ) {
      return json({ error: 'Session expired' }, 401);
    }

    // -----------------------------------------------------------------------
    if (operation === 'list_playbooks') {
      const { data, error } = await supabase
        .from('lender_playbooks')
        .select('*')
        .eq('is_active', true)
        .order('lender_label', { ascending: true });
      if (error) return json({ error: error.message }, 500);

      const enriched = await Promise.all(
        (data || []).map(async (p: any) => ({
          ...p,
          stats: await computeTurnaroundStats(supabase, p.lender_key, p.lender_label),
        })),
      );
      return json({ playbooks: enriched });
    }

    // -----------------------------------------------------------------------
    if (operation === 'get_playbook') {
      const lender_key = normalizeKey(body?.lender_key || '');
      if (!lender_key) return json({ error: 'lender_key required' }, 400);

      const { data } = await supabase
        .from('lender_playbooks')
        .select('*')
        .eq('lender_key', lender_key)
        .maybeSingle();

      const stats = await computeTurnaroundStats(
        supabase,
        lender_key,
        data?.lender_label || lender_key,
      );
      return json({ playbook: data || null, stats });
    }

    // -----------------------------------------------------------------------
    if (operation === 'upsert_playbook') {
      // Any active partner can update workspace lender knowledge.

      const payload = body?.payload || {};
      const lender_key = normalizeKey(payload.lender_key || payload.lender_label || '');
      const lender_label = String(payload.lender_label || '').trim();
      if (!lender_key || !lender_label) {
        return json({ error: 'lender_key and lender_label required' }, 400);
      }

      const row: Record<string, unknown> = {
        lender_key,
        lender_label,
        quirks: payload.quirks ?? null,
        document_rules: payload.document_rules ?? null,
        bdm_name: payload.bdm_name ?? null,
        bdm_email: payload.bdm_email ?? null,
        bdm_phone: payload.bdm_phone ?? null,
        typical_turnaround_days_override:
          payload.typical_turnaround_days_override != null
            ? Number(payload.typical_turnaround_days_override)
            : null,
        rate_band_pa:
          payload.rate_band_pa != null ? Number(payload.rate_band_pa) : null,
        rate_notes: payload.rate_notes ?? null,
        is_active: payload.is_active !== false,
        updated_by_finance_user_id: portalUser.id,
      };

      const { data, error } = await supabase
        .from('lender_playbooks')
        .upsert(row, { onConflict: 'lender_key' })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);

      return json({ playbook: data });
    }

    // -----------------------------------------------------------------------
    if (operation === 'compare_lenders') {
      const keys: string[] = Array.isArray(body?.lender_keys)
        ? body.lender_keys.map(normalizeKey).filter(Boolean)
        : [];
      const loanAmount = Number(body?.loan_amount) || 0;
      if (!keys.length) return json({ error: 'lender_keys required' }, 400);

      const { data: playbooks } = await supabase
        .from('lender_playbooks')
        .select('*')
        .in('lender_key', keys);

      const results = await Promise.all(
        (playbooks || []).map(async (p: any) => {
          const stats = await computeTurnaroundStats(supabase, p.lender_key, p.lender_label);
          const effectiveTurnaround =
            p.typical_turnaround_days_override ?? stats.median_days_to_approval;
          // Simple normalized score (lower turnaround + lower rate = higher score)
          const rateScore =
            p.rate_band_pa != null ? Math.max(0, 100 - (Number(p.rate_band_pa) - 5) * 20) : 50;
          const speedScore =
            effectiveTurnaround != null
              ? Math.max(0, 100 - effectiveTurnaround * 4)
              : 50;
          const approvalScore = stats.approval_rate_pct ?? 50;
          const compositeScore = Math.round(
            rateScore * 0.4 + speedScore * 0.35 + approvalScore * 0.25,
          );

          return {
            lender_key: p.lender_key,
            lender_label: p.lender_label,
            rate_band_pa: p.rate_band_pa,
            rate_notes: p.rate_notes,
            effective_turnaround_days: effectiveTurnaround,
            stats,
            estimated_monthly_repayment:
              loanAmount > 0 && p.rate_band_pa != null
                ? Math.round(
                    (loanAmount * (Number(p.rate_band_pa) / 100 / 12)) /
                      (1 - Math.pow(1 + Number(p.rate_band_pa) / 100 / 12, -30 * 12)),
                  )
                : null,
            composite_score: compositeScore,
          };
        }),
      );

      results.sort((a, b) => b.composite_score - a.composite_score);
      return json({ comparison: results });
    }

    // -----------------------------------------------------------------------
    // Live rates pulled from the Command Centre's bank_lending_rates_cache.
    // Flattens per-lender JSON arrays into a single ranked list.
    if (operation === 'live_rates') {
      const purpose = String(body?.loan_purpose || '').toUpperCase(); // OWNER_OCCUPIED | INVESTMENT
      const repayment = String(body?.repayment_type || '').toUpperCase(); // PRINCIPAL_AND_INTEREST | INTEREST_ONLY
      const rateType = String(body?.rate_type || '').toUpperCase(); // FIXED | VARIABLE
      const lvr = body?.lvr != null ? Number(body.lvr) : null;
      const loanAmount = body?.loan_amount != null ? Number(body.loan_amount) : null;
      const limit = Math.min(Math.max(Number(body?.limit) || 50, 1), 200);

      const { data: caches, error } = await supabase
        .from('bank_lending_rates_cache')
        .select('lender_id, lender_name, rates, fetched_at, expires_at');
      if (error) return json({ error: error.message }, 500);

      const flat: any[] = [];
      for (const row of (caches as any[]) || []) {
        const rates = Array.isArray(row.rates) ? row.rates : [];
        for (const r of rates) {
          if (purpose && r.loanPurpose && String(r.loanPurpose).toUpperCase() !== purpose) continue;
          if (repayment && r.repaymentType && String(r.repaymentType).toUpperCase() !== repayment) continue;
          if (rateType && r.rateType && String(r.rateType).toUpperCase() !== rateType) continue;
          if (lvr != null) {
            if (r.lvrMin != null && lvr < Number(r.lvrMin)) continue;
            if (r.lvrMax != null && lvr > Number(r.lvrMax)) continue;
          }
          if (loanAmount != null) {
            if (r.minLoanAmount != null && loanAmount < Number(r.minLoanAmount)) continue;
            if (r.maxLoanAmount != null && loanAmount > Number(r.maxLoanAmount)) continue;
          }
          flat.push({
            lender_id: row.lender_id,
            lender_name: row.lender_name,
            product_name: r.productName,
            rate: r.rate != null ? Math.round(Number(r.rate) * 100) / 100 : null,
            comparison_rate:
              r.comparisonRate != null ? Math.round(Number(r.comparisonRate) * 100) / 100 : null,
            rate_type: r.rateType,
            loan_purpose: r.loanPurpose,
            repayment_type: r.repaymentType,
            lvr_min: r.lvrMin,
            lvr_max: r.lvrMax,
            min_loan: r.minLoanAmount,
            max_loan: r.maxLoanAmount,
            features: Array.isArray(r.features) ? r.features : [],
            last_updated: r.lastUpdated || row.fetched_at,
          });
        }
      }

      flat.sort((a, b) => (a.rate ?? 99) - (b.rate ?? 99));

      // Build a lightweight lender summary for grouped views.
      const byLender = new Map<string, { lender_id: string; lender_name: string; lowest: number | null; count: number }>();
      for (const r of flat) {
        const cur = byLender.get(r.lender_id) || {
          lender_id: r.lender_id,
          lender_name: r.lender_name,
          lowest: null,
          count: 0,
        };
        cur.count += 1;
        if (r.rate != null && (cur.lowest == null || r.rate < cur.lowest)) cur.lowest = r.rate;
        byLender.set(r.lender_id, cur);
      }

      return json({
        rates: flat.slice(0, limit),
        total: flat.length,
        lenders: Array.from(byLender.values()).sort((a, b) => (a.lowest ?? 99) - (b.lowest ?? 99)),
      });
    }

    return json({ error: `Unknown operation: ${operation}` }, 400);
  } catch (err: any) {
    return json({ error: err?.message || 'Unhandled error' }, 500);
  }
});
