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
import { PROMPT_CATALOG, getPromptCatalogEntry } from '../_shared/engine-prompts.ts';
import { COMPASS_40_SECTIONS } from '../_shared/compassSectionRegistry.ts';
import { FIN_SECTION_ORDER, PLDD_SECTION_ORDER } from '../_shared/reportSplitRegistry.ts';

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

    const rawOp = String(body?.op || body?.operation || body?.action || body?.type || '').trim();
    const opAliases: Record<string, string> = {
      listPrompts: 'list_prompts',
      upsertPrompt: 'upsert_prompt',
      deletePrompt: 'delete_prompt',
      exportPrompts: 'export_prompts',
      importPrompts: 'import_prompts',
    };
    const op = opAliases[rawOp] || rawOp;

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
        const proposalId = String(body.proposal_id || '');
        const { data: prop, error: pErr } = await supabase
          .from('report_engine_proposals').select('*').eq('id', proposalId).maybeSingle();
        if (pErr) throw pErr;
        if (!prop || prop.status !== 'pending') {
          return json({ error: 'proposal not pending' }, corsHeaders, 400);
        }

        let appliedOk = false;
        let appliedErr: string | null = null;
        let newTargetId: string | null = prop.target_id;

        try {
          if (prop.target_kind === 'report_structure_template' && prop.target_id) {
            const { error } = await supabase
              .from('report_structure_templates')
              .update(prop.after_value || {})
              .eq('id', prop.target_id);
            if (error) throw error;
            appliedOk = true;
          } else if (prop.target_kind === 'report_structure_template_new') {
            const row = { ...(prop.after_value || {}), is_active: prop.after_value?.is_active ?? true, created_by: userId };
            const { data: ins, error } = await supabase
              .from('report_structure_templates').insert(row).select('id').single();
            if (error) throw error;
            newTargetId = ins?.id ?? null;
            appliedOk = true;
          } else if (prop.target_kind === 'engine_config') {
            const payload = prop.after_value || {};
            const config_key = payload.config_key;
            const scope = payload.scope || 'global';
            if (!config_key) throw new Error('engine_config proposal missing config_key');
            const { error } = await supabase
              .from('report_engine_config')
              .upsert({
                config_key, scope, value: payload.value ?? null,
                description: payload.description ?? null, updated_by: userId,
              }, { onConflict: 'config_key,scope' });
            if (error) throw error;
            appliedOk = true;
          } else {
            throw new Error(`unknown target_kind: ${prop.target_kind}`);
          }
        } catch (e: any) {
          appliedErr = e?.message || String(e);
        }

        await supabase.from('report_engine_proposals').update({
          status: appliedOk ? 'applied' : 'failed',
          applied_by_user: userId,
          applied_at: new Date().toISOString(),
          rejection_reason: appliedErr,
          target_id: newTargetId,
        }).eq('id', proposalId);

        if (appliedOk) {
          await supabase.from('report_engine_audit').insert({
            proposal_id: proposalId,
            target_kind: prop.target_kind,
            target_id: newTargetId,
            before_value: prop.before_value,
            after_value: prop.after_value,
            performed_by: userId,
            rationale: prop.rationale,
          });
        }

        return json({ ok: appliedOk, error: appliedErr, target_id: newTargetId }, corsHeaders);
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

      case 'list_engine_config': {
        const q = supabase.from('report_engine_config').select('*')
          .order('config_key').order('scope');
        if (body.config_key) q.eq('config_key', body.config_key);
        if (body.scope) q.eq('scope', body.scope);
        const { data, error } = await q;
        if (error) throw error;
        return json({ configs: data ?? [] }, corsHeaders);
      }

      case 'upsert_engine_config': {
        // Direct superadmin edit (UI form), no proposal staging.
        const { config_key, scope = 'global', value, description } = body;
        if (!config_key) return json({ error: 'config_key required' }, corsHeaders, 400);
        const { data: before } = await supabase
          .from('report_engine_config').select('*')
          .eq('config_key', config_key).eq('scope', scope).maybeSingle();
        const { error } = await supabase.from('report_engine_config').upsert({
          config_key, scope, value: value ?? null, description: description ?? null, updated_by: userId,
        }, { onConflict: 'config_key,scope' });
        if (error) throw error;
        await supabase.from('report_engine_audit').insert({
          proposal_id: null,
          target_kind: 'engine_config',
          target_id: `${config_key}:${scope}`,
          before_value: before ?? null,
          after_value: { config_key, scope, value },
          performed_by: userId,
          rationale: body.rationale || 'direct edit',
        });
        return json({ ok: true }, corsHeaders);
      }

      case 'delete_engine_config': {
        const { config_key, scope = 'global' } = body;
        if (!config_key) return json({ error: 'config_key required' }, corsHeaders, 400);
        const { data: before } = await supabase
          .from('report_engine_config').select('*')
          .eq('config_key', config_key).eq('scope', scope).maybeSingle();
        const { error } = await supabase.from('report_engine_config')
          .delete().eq('config_key', config_key).eq('scope', scope);
        if (error) throw error;
        if (before) {
          await supabase.from('report_engine_audit').insert({
            proposal_id: null, target_kind: 'engine_config',
            target_id: `${config_key}:${scope}`,
            before_value: before, after_value: null,
            performed_by: userId, rationale: body.rationale || 'direct delete',
          });
        }
        return json({ ok: true }, corsHeaders);
      }

      case 'list_prompts': {
        // Return the full catalog joined with any overrides currently in DB.
        const keys = PROMPT_CATALOG.map((p) => `prompt:${p.key}`);
        const { data: overrides } = await supabase
          .from('report_engine_config')
          .select('config_key, scope, value, description, updated_at, updated_by')
          .in('config_key', keys);
        const byKey = new Map<string, any>();
        for (const o of overrides ?? []) {
          if (o.scope === 'default') byKey.set(o.config_key, o);
        }
        const prompts = PROMPT_CATALOG.map((p) => {
          const ov = byKey.get(`prompt:${p.key}`);
          const overrideText = ov
            ? (typeof ov.value === 'string' ? ov.value : ov.value?.text ?? ov.value?.value ?? null)
            : null;
          return {
            key: p.key,
            label: p.label,
            family: p.family,
            function: p.function,
            description: p.description,
            tokens: p.tokens ?? [],
            default: p.default,
            override: overrideText,
            has_override: !!ov,
            updated_at: ov?.updated_at ?? null,
            override_description: ov?.description ?? null,
          };
        });
        return json({ prompts }, corsHeaders);
      }

      case 'upsert_prompt': {
        const key = String(body.key || '');
        const entry = getPromptCatalogEntry(key);
        if (!entry) return json({ error: `unknown prompt key: ${key}` }, corsHeaders, 400);
        const text = body.text;
        if (typeof text !== 'string' || !text.trim()) {
          return json({ error: 'text required (non-empty string)' }, corsHeaders, 400);
        }
        const config_key = `prompt:${key}`;
        const { data: before } = await supabase
          .from('report_engine_config').select('*')
          .eq('config_key', config_key).eq('scope', 'default').maybeSingle();
        const { error } = await supabase.from('report_engine_config').upsert({
          config_key,
          scope: 'default',
          value: text,
          description: body.description ?? entry.label,
          updated_by: userId,
        }, { onConflict: 'config_key,scope' });
        if (error) throw error;
        await supabase.from('report_engine_audit').insert({
          proposal_id: null,
          target_kind: 'prompt_override',
          target_id: key,
          before_value: before ?? null,
          after_value: { key, text, description: body.description ?? null },
          performed_by: userId,
          rationale: body.rationale || 'direct prompt edit',
        });
        return json({ ok: true }, corsHeaders);
      }

      case 'delete_prompt': {
        const key = String(body.key || '');
        const entry = getPromptCatalogEntry(key);
        if (!entry) return json({ error: `unknown prompt key: ${key}` }, corsHeaders, 400);
        const config_key = `prompt:${key}`;
        const { data: before } = await supabase
          .from('report_engine_config').select('*')
          .eq('config_key', config_key).eq('scope', 'default').maybeSingle();
        const { error } = await supabase.from('report_engine_config').delete()
          .eq('config_key', config_key).eq('scope', 'default');
        if (error) throw error;
        if (before) {
          await supabase.from('report_engine_audit').insert({
            proposal_id: null, target_kind: 'prompt_override', target_id: key,
            before_value: before, after_value: null,
            performed_by: userId, rationale: body.rationale || 'reverted to default',
          });
        }
        return json({ ok: true }, corsHeaders);
      }

      case 'export_prompts': {
        const keys = PROMPT_CATALOG.map((p) => `prompt:${p.key}`);
        const { data: overrides } = await supabase
          .from('report_engine_config')
          .select('config_key, value, description, updated_at')
          .in('config_key', keys);
        const out: Record<string, any> = {};
        for (const o of overrides ?? []) {
          const k = (o.config_key as string).replace(/^prompt:/, '');
          out[k] = { text: typeof o.value === 'string' ? o.value : o.value?.text ?? o.value?.value ?? null, description: o.description, updated_at: o.updated_at };
        }
        return json({ exported_at: new Date().toISOString(), prompts: out }, corsHeaders);
      }

      case 'import_prompts': {
        const incoming = body.prompts;
        if (!incoming || typeof incoming !== 'object') {
          return json({ error: 'prompts object required' }, corsHeaders, 400);
        }
        const results: Array<{ key: string; ok: boolean; error?: string }> = [];
        for (const [key, raw] of Object.entries(incoming)) {
          const entry = getPromptCatalogEntry(key);
          if (!entry) { results.push({ key, ok: false, error: 'unknown key' }); continue; }
          const text = typeof raw === 'string' ? raw : (raw as any)?.text;
          if (!text || typeof text !== 'string') { results.push({ key, ok: false, error: 'invalid text' }); continue; }
          const { error } = await supabase.from('report_engine_config').upsert({
            config_key: `prompt:${key}`, scope: 'default', value: text,
            description: (raw as any)?.description ?? entry.label, updated_by: userId,
          }, { onConflict: 'config_key,scope' });
          if (error) { results.push({ key, ok: false, error: error.message }); continue; }
          results.push({ key, ok: true });
        }
        await supabase.from('report_engine_audit').insert({
          proposal_id: null, target_kind: 'prompt_import', target_id: null,
          before_value: null, after_value: { count: results.filter((r) => r.ok).length, results },
          performed_by: userId, rationale: body.rationale || 'bulk import',
        });
        return json({ results }, corsHeaders);
      }

      case 'resolve_templates': {
        // Input: { template_ids: string[] } accepts raw UUIDs or "template:<uuid>".
        const raw: any[] = Array.isArray(body.template_ids) ? body.template_ids : [];
        const ids = Array.from(new Set(raw
          .map((v) => String(v || '').replace(/^template:/, '').trim())
          .filter((v) => /^[0-9a-f-]{36}$/i.test(v))));
        if (ids.length === 0) return json({ templates: [] }, corsHeaders);
        const { data, error } = await supabase
          .from('report_structure_templates')
          .select('id, name, template_type, report_tier, report_category, is_active, priority')
          .in('id', ids);
        if (error) throw error;
        return json({ templates: data ?? [] }, corsHeaders);
      }

      case 'get_report_overrides': {
        // Pre-gen overrides + best-effort post-gen audit entries for a report.
        const reportId = String(body.report_id || '');
        if (!reportId) return json({ error: 'report_id required' }, corsHeaders, 400);
        const { data: report } = await supabase
          .from('investment_reports')
          .select('id, manual_overrides, updated_at, created_at, report_scope')
          .eq('id', reportId).maybeSingle();
        const { data: audit } = await supabase
          .from('report_engine_audit')
          .select('target_kind, target_id, before_value, after_value, performed_at, rationale')
          .eq('target_id', reportId)
          .order('performed_at', { ascending: false })
          .limit(50);
        return json({
          report,
          pre_gen_overrides: report?.manual_overrides ?? null,
          post_gen_edits: audit ?? [],
        }, corsHeaders);
      }

      default:
        console.warn('[report-engine-inspector] unknown op', { rawOp, op, bodyKeys: Object.keys(body ?? {}) });
        return json({
          error: `unknown op: ${op || '(missing)'}`,
          allowed_ops: [
            'list_runs', 'get_run', 'get_chunk', 'list_proposals', 'list_audit',
            'apply_proposal', 'reject_proposal', 'list_engine_config', 'upsert_engine_config',
            'delete_engine_config', 'list_prompts', 'upsert_prompt', 'delete_prompt',
            'export_prompts', 'import_prompts', 'resolve_templates', 'get_report_overrides',
          ],
        }, corsHeaders, 400);
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
