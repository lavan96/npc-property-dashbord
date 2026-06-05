// report-engine-agent
// Dedicated agentic editor for the report generation engine.
// Scope is hard-coded: this agent can read runs/chunks/templates/registry,
// and STAGE proposals to report_engine_proposals. It cannot apply changes
// directly — a superadmin clicks "Apply" in the UI which calls
// report-engine-inspector.apply_proposal.
//
// Auth: superadmin only.
// Model: Lovable AI Gateway, google/gemini-2.5-flash (tool calling).

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

You can:
- Browse recent generation runs, look at the exact system prompt, data packet, and
  per-chunk prompts/responses/retrievals that were used.
- Inspect report_structure_templates (system prompts, structure JSON) and the
  in-memory reportSplitRegistry snapshot.
- PROPOSE changes via the propose_* tools. You cannot apply changes directly —
  every change becomes a pending proposal a human must click "Apply" on.

You cannot:
- Touch any table other than the four engine tables.
- Change RLS, grants, secrets, or any code.
- Make destructive changes without first showing the before/after diff in the proposal.

Style: terse, technical, evidence-based. When proposing an edit, always include:
  1) the smallest possible patch,
  2) the rationale (tie it to data you observed in runs),
  3) what you expect to improve.

If the user asks something outside your scope, refuse politely and explain why.
`.trim();

async function isSuperadmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'superadmin')
    .maybeSingle();
  return !!data;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

function toolDefs() {
  return [
    {
      type: 'function',
      function: {
        name: 'list_runs',
        description: 'List recent generation runs, newest first.',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', default: 20 },
            scope: { type: 'string', description: 'compass | executive | suburb | comparison' },
            status: { type: 'string', description: 'running | completed | failed' },
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
        description: 'Get a single run + all its chunks. Returns the full system prompt, data packet, and per-section detail.',
        parameters: {
          type: 'object',
          properties: { run_id: { type: 'string' } },
          required: ['run_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_templates',
        description: 'List active report_structure_templates.',
        parameters: {
          type: 'object',
          properties: {
            template_type: { type: 'string', description: 'ai_structure | pdf_layout | client_branding' },
            report_tier: { type: 'string' },
            report_category: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_template',
        description: 'Read one report_structure_templates row by id.',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'propose_template_edit',
        description: 'Stage a change to a report_structure_templates row. Returns a proposal id. The user must click Apply for the change to take effect.',
        parameters: {
          type: 'object',
          properties: {
            template_id: { type: 'string' },
            after_value: { type: 'object', description: 'Partial row patch — only the fields to change.' },
            rationale: { type: 'string' },
          },
          required: ['template_id', 'after_value', 'rationale'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'propose_retrieval_config',
        description: 'Stage a change to retrieval knobs (similarity threshold, top-k, filters). Tracked as a proposal only — file-level wiring lands later.',
        parameters: {
          type: 'object',
          properties: {
            after_value: {
              type: 'object',
              properties: {
                similarity_threshold: { type: 'number' },
                max_chunks: { type: 'number' },
                template_type: { type: 'string' },
              },
              additionalProperties: false,
            },
            rationale: { type: 'string' },
          },
          required: ['after_value', 'rationale'],
        },
      },
    },
  ];
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
        .eq('is_active', true)
        .order('priority', { ascending: false });
      if (args.template_type) q.eq('template_type', args.template_type);
      if (args.report_tier) q.eq('report_tier', args.report_tier);
      if (args.report_category) q.eq('report_category', args.report_category);
      const { data, error } = await q;
      if (error) throw error;
      return { templates: data };
    }
    case 'get_template': {
      const { data, error } = await supabase
        .from('report_structure_templates').select('*').eq('id', args.id).maybeSingle();
      if (error) throw error;
      return { template: data };
    }
    case 'propose_template_edit': {
      const { data: before } = await supabase
        .from('report_structure_templates').select('*').eq('id', args.template_id).maybeSingle();
      const { data: proposal, error } = await supabase
        .from('report_engine_proposals')
        .insert({
          target_kind: 'report_structure_template',
          target_id: args.template_id,
          before_value: before,
          after_value: args.after_value,
          rationale: args.rationale,
          proposed_by_agent: true,
          status: 'pending',
        })
        .select('id')
        .single();
      if (error) throw error;
      return { proposal_id: proposal.id, status: 'pending' };
    }
    case 'propose_retrieval_config': {
      const { data: proposal, error } = await supabase
        .from('report_engine_proposals')
        .insert({
          target_kind: 'retrieval_config',
          target_id: 'global',
          after_value: args.after_value,
          rationale: args.rationale,
          proposed_by_agent: true,
          status: 'pending',
        })
        .select('id')
        .single();
      if (error) throw error;
      return { proposal_id: proposal.id, status: 'pending' };
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
    const MAX_TURNS = 6;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages,
          tools: toolDefs(),
        }),
      });

      if (!resp.ok) {
        const t = await resp.text();
        return json({ error: `AI gateway ${resp.status}: ${t.slice(0, 300)}` }, corsHeaders, 500);
      }
      const j = await resp.json();
      const msg = j?.choices?.[0]?.message;
      if (!msg) return json({ error: 'no message from model' }, corsHeaders, 500);

      messages.push(msg);

      const toolCalls = msg.tool_calls || [];
      if (!toolCalls.length) {
        assistantText = msg.content || '';
        break;
      }

      for (const call of toolCalls) {
        const name = call?.function?.name;
        let parsed: any = {};
        try { parsed = JSON.parse(call?.function?.arguments || '{}'); } catch {}
        const started = Date.now();
        let result: any;
        let error: string | undefined;
        try {
          result = await runTool(supabase, name, parsed);
        } catch (e: any) {
          error = e?.message || String(e);
          result = { error };
        }
        const inv = {
          id: call.id,
          name,
          arguments: parsed,
          result,
          error,
          duration_ms: Date.now() - started,
        };
        invocations.push(inv);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name,
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
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
