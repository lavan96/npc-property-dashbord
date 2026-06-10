/**
 * claudeReconstruct.ts — PROTOTYPE (not yet wired into template-design-agent)
 * =========================================================================
 * Upgraded Anthropic Messages adapter for the **design reconstruction** path,
 * targeting Claude's latest model (`claude-opus-4-8`). It is a drop-in for the
 * existing `_shared/anthropicAdapter.ts#callAnthropic` — same OpenAI-shaped
 * return (`{ ok, status, data: { choices:[{message:{content, tool_calls}}], usage, model } }`)
 * so `template-design-agent/index.ts` can swap call-sites with minimal change —
 * but it uses the modern request surface that `anthropicAdapter` does not:
 *
 *   • Model        → claude-opus-4-8 (1M context, native high-res vision + PDF).
 *   • Vision       → data:image/* parts  →  { type:'image',    source:{ base64 } }.
 *   • Native PDF   → `documents` arg     →  { type:'document', source:{ base64 } }.
 *                    Lets a PDF/scan go straight to Claude when deterministic
 *                    extraction is insufficient (no client raster round-trip).
 *   • Strict tool  → the apply_changes tool is sent with `strict:true`, so the
 *                    returned `tool_calls[0].function.arguments` are schema-valid
 *                    by construction (replaces fragile JSON.parse failure paths).
 *   • Reasoning    → adaptive thinking + `output_config.effort` for the agentic
 *                    (tool_choice:'auto') path. NOTE: the Messages API does NOT
 *                    allow forcing a specific tool *and* extended/adaptive
 *                    thinking at once, so when a tool is forced this adapter
 *                    omits `thinking` (see `buildReasoning`).
 *   • Caching      → the large static system prompt is sent as a cache_control
 *                    block, so the fidelity-repair loop's repeated calls reuse it.
 *   • Streaming    → opt-in SSE aggregation for large op lists (128K ceiling).
 *
 * Removed vs anthropicAdapter (these 400 on Opus 4.7/4.8):
 *   • temperature / top_p / top_k        — sampling params are rejected.
 *   • thinking:{type:'enabled',budget_tokens} — use {type:'adaptive'} instead.
 *
 * This file deliberately has no side effects beyond the fetch; it is pure I/O so
 * it can be unit-tested by stubbing `fetch`.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/** Latest model. Override per-deploy via env; falls back through the legacy var. */
export const RECONSTRUCT_MODEL =
  Deno.env.get('ANTHROPIC_RECONSTRUCT_MODEL') ||
  Deno.env.get('ANTHROPIC_MODEL') ||
  'claude-opus-4-8';

type Role = 'system' | 'user' | 'assistant';
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** OpenAI-style inbound message (what template-design-agent already builds). */
export interface OAMessage {
  role: Role;
  /** string OR array of { type:'text'|'image_url', ... } */
  content: any;
}

/** OpenAI-style function tool (the `apply_changes` TOOL is passed verbatim). */
export interface OATool {
  type: 'function';
  function: { name: string; description?: string; parameters: any };
}

export interface ClaudeReconstructArgs {
  apiKey: string;
  model?: string;
  messages: OAMessage[];
  tools?: OATool[];
  /** 'required' → any tool; {function:{name}} → that tool; 'auto' → model decides. */
  tool_choice?: 'auto' | 'required' | { type: 'function'; function: { name: string } };
  max_tokens?: number;
  /** Extra PDF/document inputs appended to the final user turn as native doc blocks. */
  documents?: Array<{ base64: string; mediaType?: string; title?: string }>;
  /** Thinking depth for the agentic (non-forced-tool) path. Ignored when a tool is forced. */
  effort?: Effort;
  /** Enable adaptive thinking. Auto-disabled when a tool is forced (API constraint). */
  thinking?: boolean;
  /** Stream + aggregate the response (recommended when max_tokens > ~16000). */
  stream?: boolean;
  /** Abort the request after this many ms. */
  timeoutMs?: number;
}

export interface ClaudeReconstructResult {
  ok: boolean;
  status: number;
  /** OpenAI-shaped on success: { choices:[{message:{content,tool_calls}}], usage, model }. */
  data?: any;
  errorText?: string;
}

const IMAGE_DATA_URL = /^data:(image\/(?:png|jpe?g|webp|gif));base64,(.+)$/i;

function imagePartFromDataUrl(dataUrl: string): any | null {
  const m = IMAGE_DATA_URL.exec(String(dataUrl || ''));
  if (!m) return null;
  return { type: 'image', source: { type: 'base64', media_type: m[1].toLowerCase(), data: m[2] } };
}

/** OpenAI content (string | parts[]) → Anthropic content (string | blocks[]). */
function convertContent(content: any): any {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content ?? '');
  const blocks: any[] = [];
  for (const p of content) {
    if (p?.type === 'text') {
      blocks.push({ type: 'text', text: String(p.text ?? '') });
    } else if (p?.type === 'image_url') {
      const url = typeof p.image_url === 'string' ? p.image_url : p.image_url?.url;
      const img = imagePartFromDataUrl(String(url || ''));
      if (img) blocks.push(img);
    } else if (p?.type === 'image' && p.source) {
      blocks.push(p); // already Anthropic-shaped
    } else if (p?.type === 'document' && p.source) {
      blocks.push(p);
    }
  }
  return blocks.length ? blocks : '';
}

/** Append native PDF/document blocks to the final user turn. */
function appendDocuments(turns: any[], documents?: ClaudeReconstructArgs['documents']) {
  if (!documents?.length) return;
  const docBlocks = documents.map((d) => ({
    type: 'document',
    source: { type: 'base64', media_type: d.mediaType || 'application/pdf', data: d.base64 },
    ...(d.title ? { title: d.title } : {}),
  }));
  // Attach to the last user turn, or create one.
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === 'user') {
      const c = turns[i].content;
      turns[i].content = Array.isArray(c)
        ? [...c, ...docBlocks]
        : [{ type: 'text', text: String(c ?? '') }, ...docBlocks];
      return;
    }
  }
  turns.push({ role: 'user', content: docBlocks });
}

/** Map OpenAI tool_choice → Anthropic, and report whether a tool is *forced*. */
function mapToolChoice(tc: ClaudeReconstructArgs['tool_choice']): { value: any; forced: boolean } {
  if (tc === 'required') return { value: { type: 'any' }, forced: true };
  if (tc && typeof tc === 'object' && tc.type === 'function') {
    return { value: { type: 'tool', name: tc.function.name }, forced: true };
  }
  if (tc === 'auto') return { value: { type: 'auto' }, forced: false };
  return { value: undefined, forced: false };
}

/**
 * Reasoning config. The Messages API rejects forcing a specific tool together
 * with extended/adaptive thinking, so when a tool is forced we omit `thinking`
 * (the strict tool schema already guarantees well-formed output). When the tool
 * is not forced we enable adaptive thinking + effort for better reconstruction.
 */
function buildReasoning(args: ClaudeReconstructArgs, toolForced: boolean): Record<string, any> {
  const out: Record<string, any> = {};
  if (toolForced) {
    if (args.thinking) console.warn('[claudeReconstruct] thinking disabled: cannot force a tool and think simultaneously');
    return out; // no thinking; effort is meaningless without thinking
  }
  if (args.thinking) out.thinking = { type: 'adaptive' };
  if (args.effort) out.output_config = { effort: args.effort };
  return out;
}

/** Reshape an Anthropic message (content blocks) → OpenAI { choices, usage, model }. */
function toOpenAIShape(data: any): any {
  const blocks: any[] = data?.content || [];
  const text = blocks.filter((b) => b?.type === 'text').map((b) => b.text).join('\n');
  const toolUses = blocks.filter((b) => b?.type === 'tool_use');
  const tool_calls = toolUses.map((t: any) => ({
    id: t.id,
    type: 'function',
    function: { name: t.name, arguments: JSON.stringify(t.input ?? {}) },
  }));
  return {
    choices: [{
      message: { role: 'assistant', content: text || null, tool_calls: tool_calls.length ? tool_calls : undefined },
      finish_reason: data?.stop_reason || 'stop',
    }],
    usage: data?.usage,
    model: data?.model,
  };
}

/**
 * Aggregate Anthropic SSE stream → a single message object (same shape the
 * non-streaming endpoint returns), so callers parse it identically.
 */
async function aggregateStream(resp: Response): Promise<any> {
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  const blocks: any[] = [];
  // Per-index accumulators for tool_use partial_json.
  const toolJson: Record<number, string> = {};
  let stop_reason: string | undefined;
  let usage: any;
  let model: string | undefined;
  let buf = '';

  const handle = (evt: any) => {
    switch (evt.type) {
      case 'message_start':
        model = evt.message?.model;
        usage = evt.message?.usage;
        break;
      case 'content_block_start':
        blocks[evt.index] = { ...evt.content_block };
        if (evt.content_block?.type === 'tool_use') toolJson[evt.index] = '';
        break;
      case 'content_block_delta': {
        const d = evt.delta;
        if (d?.type === 'text_delta') blocks[evt.index].text = (blocks[evt.index].text || '') + d.text;
        else if (d?.type === 'input_json_delta') toolJson[evt.index] += d.partial_json || '';
        break;
      }
      case 'content_block_stop':
        if (toolJson[evt.index] != null && blocks[evt.index]?.type === 'tool_use') {
          try { blocks[evt.index].input = JSON.parse(toolJson[evt.index] || '{}'); } catch { blocks[evt.index].input = {}; }
        }
        break;
      case 'message_delta':
        if (evt.delta?.stop_reason) stop_reason = evt.delta.stop_reason;
        if (evt.usage) usage = { ...usage, ...evt.usage };
        break;
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split('\n\n');
    buf = frames.pop() ?? '';
    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try { handle(JSON.parse(payload)); } catch { /* ignore keep-alives */ }
    }
  }
  return { content: blocks.filter(Boolean), stop_reason, usage, model };
}

/**
 * Main entry. Builds + sends the claude-opus-4-8 request and returns an
 * OpenAI-shaped result that is a drop-in for `callAnthropic`.
 */
export async function callClaudeReconstruct(args: ClaudeReconstructArgs): Promise<ClaudeReconstructResult> {
  const { apiKey, messages, tools, max_tokens = 8192 } = args;

  // --- Split system blocks from user/assistant turns. ---
  const systemText: string[] = [];
  const turns: any[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      const t = typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content.filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('\n')
          : String(m.content ?? '');
      if (t.trim()) systemText.push(t);
      continue;
    }
    turns.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: convertContent(m.content) });
  }
  appendDocuments(turns, args.documents);

  // System as blocks, with the (large, static) first block marked cacheable.
  const systemBlocks = systemText.map((text, i) => (
    i === 0 ? { type: 'text', text, cache_control: { type: 'ephemeral' } } : { type: 'text', text }
  ));

  const { value: toolChoice, forced } = mapToolChoice(args.tool_choice);

  const body: any = {
    model: args.model || RECONSTRUCT_MODEL,
    max_tokens,
    system: systemBlocks,
    messages: turns,
    ...buildReasoning(args, forced),
  };
  if (args.stream) body.stream = true;
  if (tools?.length) {
    body.tools = tools.map((t) => ({
      name: t.function.name,
      description: t.function.description || '',
      input_schema: t.function.parameters,
      strict: true, // schema-valid tool args by construction
    }));
    if (toolChoice) body.tool_choice = toolChoice;
  }

  // --- Fetch (with optional abort timeout). ---
  let resp: Response;
  const controller = args.timeoutMs ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), args.timeoutMs) : undefined;
  try {
    resp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
  } catch (e) {
    return { ok: false, status: 504, errorText: `claudeReconstruct fetch failed: ${String(e)}` };
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => '');
    return { ok: false, status: resp.status, errorText };
  }

  const message = args.stream ? await aggregateStream(resp) : await resp.json();
  return { ok: true, status: 200, data: toOpenAIShape(message) };
}
