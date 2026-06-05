// report-engine-agent
// Dedicated agentic editor for the report generation engine.
// All mutations stage to report_engine_proposals — superadmin clicks Apply
// in the inspector UI to commit them.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  verifyAuth,
  createCorsHeaders,
  createUnauthorizedResponse,
  createForbiddenResponse,
} from '../_shared/auth.ts';

const SYSTEM_PROMPT = `
You are the Report Engine Operator: a strictly-scoped AI agent whose ONLY job is to
inspect and improve the property investment report generation engine for this app.

You can READ:
- Reports themselves: find_reports (by address), lookup_report, get_report_runs,
  get_report_overrides. ALWAYS prefer a report_id when the user gives one — resolve
  runs and chunks through it.
- Generation runs (list_runs, get_run, get_chunk): exact system prompt, data packet,
  per-section prompts/responses/retrieval results, tokens, latency.
- Diff between runs: compare_runs.
- Templates in report_structure_templates (list_templates, get_template), and the
  embedding chunks attached to a template (list_template_chunks).
- Engine runtime config in report_engine_config (list_engine_config, get_engine_config) —
  system messages per scope, retrieval knobs, hard-exclusion lists, registry overrides.
- Per-scope section→template pinning map (get_section_template_map).
- Pending proposals (list_proposals, get_proposal) and applied audit (get_audit_log).

You can PROPOSE (everything is staged — a superadmin clicks Apply):
- propose_system_prompt_edit: change the system message for a scope
  (default | suburb | postcode | statewide | compass | executive | comparison).
- propose_engine_config: any structured config knob.
- propose_retrieval_config: convenience for similarity_threshold / max_chunks / template_type.
- propose_template_edit / propose_template_create / propose_template_deactivate.
- propose_section_template_map_edit: pin specific templates to specific section_keys for a scope.
- propose_report_override_edit: shallow-merge a patch into a specific report's
  manual_overrides jsonb (pass null for a key to delete it).

You CANNOT:
- Touch any table other than the engine + report tables listed above.
- Change RLS, grants, secrets, or any code.
- Apply your own proposals — only superadmins can.

Style: terse, technical, evidence-based. When proposing an edit always include:
  1) the smallest possible patch (only the fields that change),
  2) the rationale tied to data you observed in runs/chunks,
  3) what you expect to improve.

Always read before you write. If the user gives a report_id, start with lookup_report
to surface address + scope + latest run, then drill into get_run / get_chunk as needed.
Never invent a "before" value — fetch it.

If the user asks something outside your scope, refuse politely and explain why.
`.trim();

async function isSuperadmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_roles').select('role').eq('user_id', userId).eq('role', 'superadmin').maybeSingle();
  return !!data;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

function toolDefs() {
  return [
    // ---------- Read ----------
    {
      type: 'function',
      function: {
        name: 'list_runs',
        description: 'List recent generation runs, newest first.',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number' },
            scope: { type: 'string' },
            status: { type: 'string' },
            report_id: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_run',
        description: 'Get a single run + its chunks (full prompts, packet, retrieval, responses).',
        parameters: { type: 'object', properties: { run_id: { type: 'string' } }, required: ['run_id'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_templates',
        description: 'List active report_structure_templates (RAG sources).',
        parameters: {
          type: 'object',
          properties: {
            template_type: { type: 'string' },
            report_tier: { type: 'string' },
            report_category: { type: 'string' },
            include_inactive: { type: 'boolean' },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_template',
        description: 'Read one report_structure_templates row by id (includes parsed_content).',
        parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_engine_config',
        description: 'List engine runtime config rows (system prompts, retrieval knobs, etc).',
        parameters: {
          type: 'object',
          properties: { config_key: { type: 'string' }, scope: { type: 'string' } },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_engine_config',
        description: 'Get a single engine config value by (config_key, scope).',
        parameters: {
          type: 'object',
          properties: { config_key: { type: 'string' }, scope: { type: 'string' } },
          required: ['config_key'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_proposals',
        description: 'List engine proposals (pending by default).',
        parameters: {
          type: 'object',
          properties: { status: { type: 'string' }, limit: { type: 'number' } },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_proposal',
        description: 'Read one proposal with full before/after diff.',
        parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
    },

    // ---------- Write (staged proposals) ----------
    {
      type: 'function',
      function: {
        name: 'propose_system_prompt_edit',
        description: 'Stage a change to the engine\'s system message for a given scope. scope examples: default, suburb, postcode, statewide, compass, executive, comparison.',
        parameters: {
          type: 'object',
          properties: {
            scope: { type: 'string' },
            new_prompt: { type: 'string', description: 'The full new system message text.' },
            rationale: { type: 'string' },
          },
          required: ['scope', 'new_prompt', 'rationale'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'propose_engine_config',
        description: 'Stage a change to any engine config row (insert or update). value is the full new jsonb value.',
        parameters: {
          type: 'object',
          properties: {
            config_key: { type: 'string', description: 'e.g. system_message, retrieval, hard_exclusions, registry_override, model_settings' },
            scope: { type: 'string', description: 'e.g. default, compass, suburb, executive — defaults to "global"' },
            value: { description: 'Full new value (any JSON type).' },
            rationale: { type: 'string' },
          },
          required: ['config_key', 'value', 'rationale'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'propose_retrieval_config',
        description: 'Stage retrieval knob changes (similarity threshold, top-k, template filters). Convenience wrapper around propose_engine_config with config_key=retrieval.',
        parameters: {
          type: 'object',
          properties: {
            scope: { type: 'string' },
            after_value: {
              type: 'object',
              properties: {
                similarity_threshold: { type: 'number' },
                max_chunks: { type: 'number' },
                template_type: { type: 'string' },
              },
              additionalProperties: true,
            },
            rationale: { type: 'string' },
          },
          required: ['after_value', 'rationale'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'propose_template_edit',
        description: 'Stage a partial update to a report_structure_templates row.',
        parameters: {
          type: 'object',
          properties: {
            template_id: { type: 'string' },
            after_value: {
              type: 'object',
              description: 'Partial patch. Allowed fields: name, description, parsed_content, priority, is_active, metadata, report_tier, report_category, template_type.',
              additionalProperties: true,
            },
            rationale: { type: 'string' },
          },
          required: ['template_id', 'after_value', 'rationale'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'propose_template_create',
        description: 'Stage creation of a brand-new report_structure_templates row.',
        parameters: {
          type: 'object',
          properties: {
            after_value: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                template_type: { type: 'string' },
                report_tier: { type: 'string' },
                report_category: { type: 'string' },
                parsed_content: { type: 'string' },
                description: { type: 'string' },
                priority: { type: 'number' },
                metadata: { type: 'object', additionalProperties: true },
              },
              required: ['name', 'template_type', 'parsed_content'],
            },
            rationale: { type: 'string' },
          },
          required: ['after_value', 'rationale'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'propose_template_deactivate',
        description: 'Stage soft-delete (is_active=false) of a template.',
        parameters: {
          type: 'object',
          properties: { template_id: { type: 'string' }, rationale: { type: 'string' } },
          required: ['template_id', 'rationale'],
        },
      },
    },

    // ---------- Report-centric (resolves report_id → runs/chunks/overrides) ----------
    {
      type: 'function',
      function: {
        name: 'find_reports',
        description: 'Search investment_reports by address substring (case-insensitive). Returns up to 20 most recent matches with id, address, scope, tier, variant, status.',
        parameters: {
          type: 'object',
          properties: {
            address_query: { type: 'string' },
            scope: { type: 'string' },
            variant: { type: 'string' },
            limit: { type: 'number' },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'lookup_report',
        description: 'Get one investment_reports row by id with summary metadata, latest run id, run counts, and override key list. Use this whenever the user gives a report_id.',
        parameters: {
          type: 'object',
          properties: { report_id: { type: 'string' } },
          required: ['report_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_report_runs',
        description: 'List all generation runs for a given report_id, newest first.',
        parameters: {
          type: 'object',
          properties: { report_id: { type: 'string' }, limit: { type: 'number' } },
          required: ['report_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_report_overrides',
        description: 'Return manual_overrides jsonb for a report plus its top-level key list. Use before propose_report_override_edit.',
        parameters: {
          type: 'object',
          properties: { report_id: { type: 'string' } },
          required: ['report_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'propose_report_override_edit',
        description: 'Stage a patch to investment_reports.manual_overrides. patch is shallow-merged into the existing object; pass null for a key to delete it on apply.',
        parameters: {
          type: 'object',
          properties: {
            report_id: { type: 'string' },
            patch: { type: 'object', additionalProperties: true },
            rationale: { type: 'string' },
          },
          required: ['report_id', 'patch', 'rationale'],
        },
      },
    },

    // ---------- Chunk / run drill-down + diff ----------
    {
      type: 'function',
      function: {
        name: 'get_chunk',
        description: 'Get one report_generation_chunks row with full system_prompt, user_prompt, response, retrieval_meta, attached packet keys, and attached template chunk ids.',
        parameters: {
          type: 'object',
          properties: { chunk_id: { type: 'string' } },
          required: ['chunk_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'compare_runs',
        description: 'Diff two runs: system_prompt change, data_packet key set, models, total tokens, and per-section presence/latency/status differences.',
        parameters: {
          type: 'object',
          properties: { run_id_a: { type: 'string' }, run_id_b: { type: 'string' } },
          required: ['run_id_a', 'run_id_b'],
        },
      },
    },

    // ---------- Template chunks (RAG embeddings) ----------
    {
      type: 'function',
      function: {
        name: 'list_template_chunks',
        description: 'List embedding chunks in document_chunks attached to a given template (via metadata.template_id). Returns ids, chunk_index, text preview, length.',
        parameters: {
          type: 'object',
          properties: {
            template_id: { type: 'string' },
            limit: { type: 'number' },
          },
          required: ['template_id'],
        },
      },
    },

    // ---------- Section→template pinning map ----------
    {
      type: 'function',
      function: {
        name: 'get_section_template_map',
        description: 'Read the section→template pinning map for a scope. Stored in report_engine_config under config_key=section_template_map, scope=<scope>.',
        parameters: {
          type: 'object',
          properties: { scope: { type: 'string' } },
          required: ['scope'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'propose_section_template_map_edit',
        description: 'Stage an update to the section→template pinning map for a scope. map is the full new {section_key: [template_id, ...]} object that will overwrite the current value.',
        parameters: {
          type: 'object',
          properties: {
            scope: { type: 'string' },
            map: { type: 'object', additionalProperties: true },
            rationale: { type: 'string' },
          },
          required: ['scope', 'map', 'rationale'],
        },
      },
    },

    // ---------- Audit ----------
    {
      type: 'function',
      function: {
        name: 'get_audit_log',
        description: 'Recent applied engine changes from report_engine_audit (who, when, before/after, rationale).',
        parameters: {
          type: 'object',
          properties: { limit: { type: 'number' }, target_kind: { type: 'string' } },
          additionalProperties: false,
        },
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Tool runners
// ---------------------------------------------------------------------------

const TEMPLATE_EDITABLE_FIELDS = new Set([
  'name', 'description', 'parsed_content', 'priority', 'is_active',
  'metadata', 'report_tier', 'report_category', 'template_type',
]);

function filterTemplatePatch(patch: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (TEMPLATE_EDITABLE_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

async function stageProposal(supabase: any, row: Record<string, any>) {
  const { data, error } = await supabase
    .from('report_engine_proposals').insert(row).select('id, target_kind, target_id, status').single();
  if (error) throw error;
  return data;
}

async function runTool(supabase: any, name: string, args: any): Promise<any> {
  switch (name) {
    case 'list_runs': {
      const q = supabase
        .from('report_generation_runs')
        .select('id, report_id, scope, variant, model, status, started_at, finished_at, total_prompt_tokens, total_completion_tokens, error, data_packet_size_bytes')
        .order('started_at', { ascending: false })
        .limit(Math.min(args.limit ?? 20, 100));
      if (args.scope) q.eq('scope', args.scope);
      if (args.status) q.eq('status', args.status);
      if (args.report_id) q.eq('report_id', args.report_id);
      const { data, error } = await q;
      if (error) throw error;
      return { runs: data };
    }
    case 'get_run': {
      const [{ data: run }, { data: chunks }] = await Promise.all([
        supabase.from('report_generation_runs').select('*').eq('id', args.run_id).maybeSingle(),
        supabase.from('report_generation_chunks')
          .select('id, section_key, section_label, ordinal, model, attached_packet_keys, attached_template_chunk_ids, retrieval_meta, prompt_tokens, completion_tokens, latency_ms, status, error')
          .eq('run_id', args.run_id).order('ordinal'),
      ]);
      return { run, chunks };
    }
    case 'list_templates': {
      const q = supabase.from('report_structure_templates')
        .select('id, name, template_type, report_tier, report_category, is_active, priority, updated_at')
        .order('priority', { ascending: false });
      if (!args.include_inactive) q.eq('is_active', true);
      if (args.template_type) q.eq('template_type', args.template_type);
      if (args.report_tier) q.eq('report_tier', args.report_tier);
      if (args.report_category) q.eq('report_category', args.report_category);
      const { data, error } = await q;
      if (error) throw error;
      return { templates: data };
    }
    case 'get_template': {
      const { data, error } = await supabase.from('report_structure_templates').select('*').eq('id', args.id).maybeSingle();
      if (error) throw error;
      // Trim huge parsed_content for context safety; agent can request specific slices if needed.
      if (data?.parsed_content && data.parsed_content.length > 8000) {
        data.parsed_content_preview = data.parsed_content.slice(0, 8000) + '\n…[truncated]…';
        data.parsed_content_length = data.parsed_content.length;
        delete data.parsed_content;
      }
      return { template: data };
    }
    case 'list_engine_config': {
      const q = supabase.from('report_engine_config').select('*').order('config_key').order('scope');
      if (args.config_key) q.eq('config_key', args.config_key);
      if (args.scope) q.eq('scope', args.scope);
      const { data, error } = await q;
      if (error) throw error;
      return { configs: data };
    }
    case 'get_engine_config': {
      const scope = args.scope || 'global';
      const { data, error } = await supabase
        .from('report_engine_config').select('*')
        .eq('config_key', args.config_key).eq('scope', scope).maybeSingle();
      if (error) throw error;
      return { config: data };
    }
    case 'list_proposals': {
      const q = supabase.from('report_engine_proposals').select('*')
        .order('created_at', { ascending: false }).limit(Math.min(args.limit ?? 30, 100));
      if (args.status) q.eq('status', args.status);
      else q.eq('status', 'pending');
      const { data, error } = await q;
      if (error) throw error;
      return { proposals: data };
    }
    case 'get_proposal': {
      const { data, error } = await supabase.from('report_engine_proposals').select('*').eq('id', args.id).maybeSingle();
      if (error) throw error;
      return { proposal: data };
    }

    case 'propose_system_prompt_edit': {
      const scope = String(args.scope || 'default');
      const { data: before } = await supabase
        .from('report_engine_config').select('*')
        .eq('config_key', 'system_message').eq('scope', scope).maybeSingle();
      const p = await stageProposal(supabase, {
        target_kind: 'engine_config',
        target_id: `system_message:${scope}`,
        before_value: before ?? null,
        after_value: { config_key: 'system_message', scope, value: String(args.new_prompt) },
        rationale: args.rationale,
        proposed_by_agent: true,
        status: 'pending',
      });
      return p;
    }
    case 'propose_engine_config': {
      const scope = String(args.scope || 'global');
      const { data: before } = await supabase
        .from('report_engine_config').select('*')
        .eq('config_key', args.config_key).eq('scope', scope).maybeSingle();
      const p = await stageProposal(supabase, {
        target_kind: 'engine_config',
        target_id: `${args.config_key}:${scope}`,
        before_value: before ?? null,
        after_value: { config_key: args.config_key, scope, value: args.value },
        rationale: args.rationale,
        proposed_by_agent: true,
        status: 'pending',
      });
      return p;
    }
    case 'propose_retrieval_config': {
      const scope = String(args.scope || 'global');
      const { data: before } = await supabase
        .from('report_engine_config').select('*')
        .eq('config_key', 'retrieval').eq('scope', scope).maybeSingle();
      const p = await stageProposal(supabase, {
        target_kind: 'engine_config',
        target_id: `retrieval:${scope}`,
        before_value: before ?? null,
        after_value: { config_key: 'retrieval', scope, value: args.after_value },
        rationale: args.rationale,
        proposed_by_agent: true,
        status: 'pending',
      });
      return p;
    }
    case 'propose_template_edit': {
      const { data: before } = await supabase
        .from('report_structure_templates').select('*').eq('id', args.template_id).maybeSingle();
      if (!before) throw new Error('template not found');
      const patch = filterTemplatePatch(args.after_value);
      if (!Object.keys(patch).length) throw new Error('no editable fields in patch');
      const p = await stageProposal(supabase, {
        target_kind: 'report_structure_template',
        target_id: args.template_id,
        before_value: before,
        after_value: patch,
        rationale: args.rationale,
        proposed_by_agent: true,
        status: 'pending',
      });
      return p;
    }
    case 'propose_template_create': {
      const patch = filterTemplatePatch(args.after_value);
      if (!patch.name || !patch.template_type || !patch.parsed_content) {
        throw new Error('name, template_type, parsed_content required');
      }
      const p = await stageProposal(supabase, {
        target_kind: 'report_structure_template_new',
        target_id: null,
        before_value: null,
        after_value: patch,
        rationale: args.rationale,
        proposed_by_agent: true,
        status: 'pending',
      });
      return p;
    }
    case 'propose_template_deactivate': {
      const { data: before } = await supabase
        .from('report_structure_templates').select('*').eq('id', args.template_id).maybeSingle();
      if (!before) throw new Error('template not found');
      const p = await stageProposal(supabase, {
        target_kind: 'report_structure_template',
        target_id: args.template_id,
        before_value: before,
        after_value: { is_active: false },
        rationale: args.rationale,
        proposed_by_agent: true,
        status: 'pending',
      });
      return p;
    }


    // ----- Report-centric -----
    case 'find_reports': {
      const q = supabase.from('investment_reports')
        .select('id, property_address, report_scope, report_tier, report_variant, status, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(Math.min(args.limit ?? 20, 50));
      if (args.address_query) q.ilike('property_address', `%${args.address_query}%`);
      if (args.scope) q.eq('report_scope', args.scope);
      if (args.variant) q.eq('report_variant', args.variant);
      const { data, error } = await q;
      if (error) throw error;
      return { reports: data };
    }
    case 'lookup_report': {
      const { data: report, error } = await supabase
        .from('investment_reports')
        .select('id, property_address, report_scope, report_tier, report_variant, derived_from_report_id, parent_report_id, status, generation_engine, current_version, total_sections, last_completed_section, error_message, created_at, updated_at, manual_overrides')
        .eq('id', args.report_id).maybeSingle();
      if (error) throw error;
      if (!report) return { error: 'report not found' };
      const { data: runs } = await supabase
        .from('report_generation_runs')
        .select('id, scope, variant, status, started_at, finished_at, model, total_prompt_tokens, total_completion_tokens')
        .eq('report_id', args.report_id)
        .order('started_at', { ascending: false })
        .limit(10);
      const overrideKeys = report.manual_overrides && typeof report.manual_overrides === 'object'
        ? Object.keys(report.manual_overrides) : [];
      const summary = { ...report, manual_overrides: undefined, override_keys: overrideKeys, override_key_count: overrideKeys.length };
      return { report: summary, latest_run: runs?.[0] ?? null, recent_runs: runs ?? [], run_count_recent: runs?.length ?? 0 };
    }
    case 'get_report_runs': {
      const { data, error } = await supabase
        .from('report_generation_runs')
        .select('id, scope, variant, status, started_at, finished_at, model, total_prompt_tokens, total_completion_tokens, error, data_packet_size_bytes')
        .eq('report_id', args.report_id)
        .order('started_at', { ascending: false })
        .limit(Math.min(args.limit ?? 20, 100));
      if (error) throw error;
      return { runs: data };
    }
    case 'get_report_overrides': {
      const { data, error } = await supabase
        .from('investment_reports').select('id, manual_overrides').eq('id', args.report_id).maybeSingle();
      if (error) throw error;
      if (!data) return { error: 'report not found' };
      const overrides = (data.manual_overrides && typeof data.manual_overrides === 'object') ? data.manual_overrides : {};
      return { report_id: data.id, override_keys: Object.keys(overrides), manual_overrides: overrides };
    }
    case 'propose_report_override_edit': {
      const { data: before } = await supabase
        .from('investment_reports').select('id, property_address, manual_overrides').eq('id', args.report_id).maybeSingle();
      if (!before) throw new Error('report not found');
      const p = await stageProposal(supabase, {
        target_kind: 'report_manual_overrides',
        target_id: args.report_id,
        before_value: { manual_overrides: before.manual_overrides ?? {}, property_address: before.property_address },
        after_value: { patch: args.patch },
        rationale: args.rationale,
        proposed_by_agent: true,
        status: 'pending',
      });
      return p;
    }

    // ----- Chunk drill-down / diff -----
    case 'get_chunk': {
      const { data, error } = await supabase
        .from('report_generation_chunks').select('*').eq('id', args.chunk_id).maybeSingle();
      if (error) throw error;
      if (!data) return { error: 'chunk not found' };
      // Trim ultra-large strings for context safety.
      const trim = (s: any, n = 6000) => (typeof s === 'string' && s.length > n)
        ? s.slice(0, n) + `\n…[truncated ${s.length - n} chars]…` : s;
      data.system_prompt = trim(data.system_prompt);
      data.user_prompt = trim(data.user_prompt);
      data.response = trim(data.response);
      return { chunk: data };
    }
    case 'compare_runs': {
      const [{ data: a }, { data: b }] = await Promise.all([
        supabase.from('report_generation_runs').select('id, scope, variant, model, system_prompt, data_packet, total_prompt_tokens, total_completion_tokens, started_at, finished_at, status').eq('id', args.run_id_a).maybeSingle(),
        supabase.from('report_generation_runs').select('id, scope, variant, model, system_prompt, data_packet, total_prompt_tokens, total_completion_tokens, started_at, finished_at, status').eq('id', args.run_id_b).maybeSingle(),
      ]);
      if (!a || !b) return { error: 'one or both runs not found' };
      const [{ data: ca }, { data: cb }] = await Promise.all([
        supabase.from('report_generation_chunks').select('section_key, status, latency_ms, prompt_tokens, completion_tokens').eq('run_id', args.run_id_a),
        supabase.from('report_generation_chunks').select('section_key, status, latency_ms, prompt_tokens, completion_tokens').eq('run_id', args.run_id_b),
      ]);
      const keysA = new Set(Object.keys(a.data_packet || {}));
      const keysB = new Set(Object.keys(b.data_packet || {}));
      const onlyA = [...keysA].filter(k => !keysB.has(k));
      const onlyB = [...keysB].filter(k => !keysA.has(k));
      const sectionsA = new Map((ca || []).map((c: any) => [c.section_key, c]));
      const sectionsB = new Map((cb || []).map((c: any) => [c.section_key, c]));
      const allSections = new Set([...sectionsA.keys(), ...sectionsB.keys()]);
      const sectionDiff = [...allSections].map(k => ({
        section_key: k,
        in_a: sectionsA.has(k), in_b: sectionsB.has(k),
        a: sectionsA.get(k), b: sectionsB.get(k),
      }));
      return {
        a: { id: a.id, scope: a.scope, variant: a.variant, model: a.model, tokens: (a.total_prompt_tokens || 0) + (a.total_completion_tokens || 0), status: a.status },
        b: { id: b.id, scope: b.scope, variant: b.variant, model: b.model, tokens: (b.total_prompt_tokens || 0) + (b.total_completion_tokens || 0), status: b.status },
        system_prompt_changed: a.system_prompt !== b.system_prompt,
        system_prompt_a_len: (a.system_prompt || '').length,
        system_prompt_b_len: (b.system_prompt || '').length,
        packet_keys_only_in_a: onlyA,
        packet_keys_only_in_b: onlyB,
        section_diff: sectionDiff,
      };
    }

    // ----- Template chunks -----
    case 'list_template_chunks': {
      const tplId = String(args.template_id || '');
      const { data, error } = await supabase
        .from('document_chunks')
        .select('id, document_name, chunk_index, chunk_text, page_number, metadata, created_at')
        .eq('document_name', `template:${tplId}`)
        .order('chunk_index', { ascending: true })
        .limit(Math.min(args.limit ?? 50, 200));
      if (error) throw error;
      const chunks = (data || []).map((c: any) => ({
        id: c.id,
        document_name: c.document_name,
        chunk_index: c.chunk_index,
        page_number: c.page_number,
        length: (c.chunk_text || '').length,
        preview: (c.chunk_text || '').slice(0, 400),
      }));
      return { template_id: tplId, chunk_count: chunks.length, chunks };
    }


    // ----- Section→template pinning map -----
    case 'get_section_template_map': {
      const { data, error } = await supabase
        .from('report_engine_config').select('*')
        .eq('config_key', `section_template_map:${args.scope}`).eq('scope', 'default').maybeSingle();
      if (error) throw error;
      return { scope: args.scope, config: data ?? null };
    }
    case 'propose_section_template_map_edit': {
      const { data: before } = await supabase
        .from('report_engine_config').select('*')
        .eq('config_key', `section_template_map:${args.scope}`).eq('scope', 'default').maybeSingle();
      const p = await stageProposal(supabase, {
        target_kind: 'engine_config',
        target_id: `section_template_map:${args.scope}`,
        before_value: before ?? null,
        after_value: { config_key: `section_template_map:${args.scope}`, scope: 'default', value: args.map },
        rationale: args.rationale,
        proposed_by_agent: true,
        status: 'pending',
      });
      return p;
    }

    // ----- Audit -----
    case 'get_audit_log': {
      const q = supabase.from('report_engine_audit')
        .select('*').order('created_at', { ascending: false })
        .limit(Math.min(args.limit ?? 25, 100));
      if (args.target_kind) q.eq('target_kind', args.target_kind);
      const { data, error } = await q;
      if (error) throw error;
      return { audit: data };
    }

    default:
      return { error: `unknown tool ${name}` };
  }
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const body = await req.json().catch(() => ({}));
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError || !userId) return createUnauthorizedResponse(authError || 'auth required', corsHeaders);
    if (!(await isSuperadmin(supabase, userId))) return createForbiddenResponse('superadmin only', corsHeaders);

    const messages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...(Array.isArray(body.messages) ? body.messages : []),
    ];

    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableKey) return json({ error: 'LOVABLE_API_KEY missing' }, corsHeaders, 500);

    const invocations: any[] = [];
    let assistantText = '';
    const MAX_TURNS = 8;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${lovableKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages,
          tools: toolDefs(),
        }),
      });

      if (!resp.ok) {
        const t = await resp.text();
        return json({ error: `AI gateway ${resp.status}: ${t.slice(0, 500)}` }, corsHeaders, 500);
      }
      const j = await resp.json();
      const msg = j?.choices?.[0]?.message;
      if (!msg) return json({ error: 'no message from model' }, corsHeaders, 500);

      messages.push(msg);
      const toolCalls = msg.tool_calls || [];
      if (!toolCalls.length) { assistantText = msg.content || ''; break; }

      for (const call of toolCalls) {
        const name = call?.function?.name;
        let parsed: any = {};
        try { parsed = JSON.parse(call?.function?.arguments || '{}'); } catch {}
        const started = Date.now();
        let result: any; let error: string | undefined;
        try { result = await runTool(supabase, name, parsed); }
        catch (e: any) { error = e?.message || String(e); result = { error }; }
        invocations.push({ id: call.id, name, arguments: parsed, result, error, duration_ms: Date.now() - started });
        messages.push({
          role: 'tool', tool_call_id: call.id, name,
          content: JSON.stringify(result).slice(0, 12000),
        });
      }
    }

    return json({ assistant: assistantText, tool_invocations: invocations }, corsHeaders);
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, createCorsHeaders(origin), 500);
  }
});

function json(body: any, corsHeaders: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
