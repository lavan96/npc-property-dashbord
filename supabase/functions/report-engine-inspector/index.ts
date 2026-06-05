// report-engine-inspector
// Superadmin-only read API for the report generation observability tables.
// Operations: list_runs, get_run (with chunks), get_chunk, recent_for_report,
// list_proposals, list_audit.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  verifyAuth,
  createCorsHeaders,
  createUnauthorizedResponse,
  createForbiddenResponse,
} from '../_shared/auth.ts';

async function isSuperadmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'superadmin')
    .maybeSingle();
  return !!data;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(url, key);

    const body = await req.json().catch(() => ({}));
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError || !userId) return createUnauthorizedResponse(authError || 'auth required', corsHeaders);

    if (!(await isSuperadmin(supabase, userId))) {
      return createForbiddenResponse('superadmin only', corsHeaders);
    }

    const op = String(body?.op || '');

    switch (op) {
      case 'list_runs': {
        const limit = Math.min(Number(body.limit ?? 50), 200);
        const filter = supabase
          .from('report_generation_runs')
          .select('id, report_id, scope, variant, model, status, total_prompt_tokens, total_completion_tokens, total_cost_cents, started_at, finished_at, trigger_source, error, data_packet_size_bytes')
          .order('started_at', { ascending: false })
          .limit(limit);
        if (body.report_id) filter.eq('report_id', body.report_id);
        if (body.status) filter.eq('status', body.status);
        if (body.scope) filter.eq('scope', body.scope);
        const { data, error } = await filter;
        if (error) throw error;
        return json({ runs: data ?? [] }, corsHeaders);
      }

      case 'get_run': {
        const runId = String(body.run_id || '');
        if (!runId) return json({ error: 'run_id required' }, corsHeaders, 400);
        const [{ data: run, error: rErr }, { data: chunks, error: cErr }] = await Promise.all([
          supabase.from('report_generation_runs').select('*').eq('id', runId).maybeSingle(),
          supabase.from('report_generation_chunks').select('*').eq('run_id', runId).order('ordinal', { ascending: true }),
        ]);
        if (rErr) throw rErr;
        if (cErr) throw cErr;
        return json({ run, chunks: chunks ?? [] }, corsHeaders);
      }

      case 'get_chunk': {
        const id = String(body.chunk_id || '');
        const { data, error } = await supabase.from('report_generation_chunks').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        return json({ chunk: data }, corsHeaders);
      }

      case 'list_proposals': {
        const status = body.status || null;
        const q = supabase
          .from('report_engine_proposals')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        if (status) q.eq('status', status);
        const { data, error } = await q;
        if (error) throw error;
        return json({ proposals: data ?? [] }, corsHeaders);
      }

      case 'list_audit': {
        const { data, error } = await supabase
          .from('report_engine_audit')
          .select('*')
          .order('performed_at', { ascending: false })
          .limit(100);
        if (error) throw error;
        return json({ audit: data ?? [] }, corsHeaders);
      }

      case 'apply_proposal': {
        // Superadmin click-to-apply. Writes audit row and (best-effort) mutates
        // the staged target. For safety, only known target_kinds are honored.
        const proposalId = String(body.proposal_id || '');
        const { data: prop, error: pErr } = await supabase
          .from('report_engine_proposals').select('*').eq('id', proposalId).maybeSingle();
        if (pErr) throw pErr;
        if (!prop || prop.status !== 'pending') {
          return json({ error: 'proposal not pending' }, corsHeaders, 400);
        }

        let appliedOk = false;
        let appliedErr: string | null = null;
        try {
          if (prop.target_kind === 'report_structure_template' && prop.target_id) {
            const { error } = await supabase
              .from('report_structure_templates')
              .update(prop.after_value || {})
              .eq('id', prop.target_id);
            if (error) throw error;
            appliedOk = true;
          } else {
            // Other target kinds (registry, retrieval_config) are file-based.
            // We still mark the proposal applied + audit it so the change is
            // tracked, but the file edit happens outside this fn.
            appliedOk = true;
          }
        } catch (e: any) {
          appliedErr = e?.message || String(e);
        }

        await supabase.from('report_engine_proposals').update({
          status: appliedOk ? 'applied' : 'failed',
          applied_by_user: userId,
          applied_at: new Date().toISOString(),
          rejection_reason: appliedErr,
        }).eq('id', proposalId);

        if (appliedOk) {
          await supabase.from('report_engine_audit').insert({
            proposal_id: proposalId,
            target_kind: prop.target_kind,
            target_id: prop.target_id,
            before_value: prop.before_value,
            after_value: prop.after_value,
            performed_by: userId,
            rationale: prop.rationale,
          });
        }

        return json({ ok: appliedOk, error: appliedErr }, corsHeaders);
      }

      case 'reject_proposal': {
        const proposalId = String(body.proposal_id || '');
        const { error } = await supabase.from('report_engine_proposals').update({
          status: 'rejected',
          rejected_at: new Date().toISOString(),
          rejection_reason: body.reason ?? null,
        }).eq('id', proposalId);
        if (error) throw error;
        return json({ ok: true }, corsHeaders);
      }

      default:
        return json({ error: 'unknown op' }, corsHeaders, 400);
    }
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, createCorsHeaders(origin), 500);
  }
});

function json(body: any, corsHeaders: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
