// Template Design Agent — conversational tool-calling editor for ReportTemplate JSON.
//
// Accepts a chat history + the current schema, asks GPT-5.5 to plan and emit
// a batch of structured operations via tool calling, applies them server-side
// (so the schema returned is always valid), and returns:
//   { reply, schema, operations: [{ op, summary }] }
//
// Designed for high contextual awareness: passes a compact outline of every
// page/block/overlay plus the active selection, lets the model issue many
// operations in a single turn.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-5.5';
const VISION_MODEL = 'google/gemini-2.5-pro';

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// ─── helpers: outline + uuid ──────────────────────────────────────────────────
function uid() { return crypto.randomUUID(); }
function ensureIds(node: any): any {
  if (node && typeof node === 'object') {
    if (!node.id) node.id = uid();
    if (Array.isArray(node.blocks)) node.blocks.forEach(ensureIds);
    if (Array.isArray(node.overlays)) node.overlays.forEach((o: any) => { if (!o.id) o.id = uid(); });
  }
  return node;
}
function outline(schema: any): string {
  if (!schema?.pages) return '(empty template)';
  const lines: string[] = [];
  const tokens = schema.tokens || {};
  lines.push(`tokens.colors=${JSON.stringify(tokens.colors || {})}`);
  lines.push(`tokens.fonts=${JSON.stringify(tokens.fonts || {})}`);
  schema.pages.forEach((p: any, i: number) => {
    lines.push(`page[${i}] id=${p.id} name=${JSON.stringify(p.name)} size=${p.size?.width}x${p.size?.height} bg=${p.background?.color || p.background?.imageUrl || '-'}`);
    (p.blocks || []).forEach((b: any, bi: number) => {
      const ov = (b.overlays || []).length;
      lines.push(`  block[${bi}] id=${b.id} type=${b.type} overlays=${ov}${b.name ? ` name="${b.name}"` : ''}`);
      (b.overlays || []).slice(0, 12).forEach((o: any, oi: number) => {
        const sample = o.type === 'text' ? ` "${String(o.content || '').slice(0, 40)}"` : '';
        lines.push(`    ov[${oi}] id=${o.id} type=${o.type}${sample} @${Math.round(o.x)},${Math.round(o.y)} ${Math.round(o.width)}x${Math.round(o.height)}`);
      });
      if ((b.overlays || []).length > 12) lines.push(`    … +${b.overlays.length - 12} more overlays`);
    });
  });
  return lines.join('\n');
}

// ─── operation applier ────────────────────────────────────────────────────────
type Op = { op: string; [k: string]: any };

function deepSet(obj: any, path: string, value: any) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}
function deepMerge<T>(target: any, patch: any): T {
  if (patch == null) return target;
  if (Array.isArray(patch)) return patch as T;
  if (typeof patch !== 'object') return patch as T;
  const out: any = { ...(target || {}) };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}
function findPage(s: any, id: string) { return s.pages.find((p: any) => p.id === id); }
function findBlock(p: any, id: string) { return (p.blocks || []).find((b: any) => b.id === id); }

function applyOps(schema: any, ops: Op[]): { schema: any; summaries: string[]; warnings: string[] } {
  const s = JSON.parse(JSON.stringify(schema));
  const summaries: string[] = [];
  const warnings: string[] = [];
  for (const op of ops) {
    try {
      switch (op.op) {
        case 'set_token': {
          if (!s.tokens) s.tokens = { colors: {}, fonts: {}, spacing: {} };
          deepSet(s.tokens, op.path, op.value);
          summaries.push(`token ${op.path} = ${JSON.stringify(op.value)}`);
          break;
        }
        case 'set_meta': {
          s.meta = deepMerge(s.meta || {}, op.patch || {});
          summaries.push(`meta updated`);
          break;
        }
        case 'add_page': {
          const page = ensureIds({
            id: uid(),
            name: op.page?.name || `Page ${s.pages.length + 1}`,
            size: op.page?.size || { width: 595, height: 842 },
            background: op.page?.background || {},
            blocks: op.page?.blocks || [],
            ...(op.page || {}),
          });
          if (typeof op.afterIndex === 'number') s.pages.splice(op.afterIndex + 1, 0, page);
          else s.pages.push(page);
          summaries.push(`added page "${page.name}" (${page.id})`);
          break;
        }
        case 'duplicate_page': {
          const idx = s.pages.findIndex((p: any) => p.id === op.pageId);
          if (idx < 0) { warnings.push(`duplicate_page: page ${op.pageId} not found`); break; }
          const clone = JSON.parse(JSON.stringify(s.pages[idx]));
          clone.id = uid();
          clone.name = `${clone.name} copy`;
          (clone.blocks || []).forEach((b: any) => {
            b.id = uid();
            (b.overlays || []).forEach((o: any) => { o.id = uid(); });
          });
          s.pages.splice(idx + 1, 0, clone);
          summaries.push(`duplicated page → ${clone.id}`);
          break;
        }
        case 'delete_page': {
          const before = s.pages.length;
          s.pages = s.pages.filter((p: any) => p.id !== op.pageId);
          if (s.pages.length === before) warnings.push(`delete_page: ${op.pageId} not found`);
          else summaries.push(`deleted page ${op.pageId}`);
          break;
        }
        case 'reorder_pages': {
          const order: string[] = op.pageIds || [];
          const map = new Map(s.pages.map((p: any) => [p.id, p]));
          const reordered = order.map((id) => map.get(id)).filter(Boolean);
          // append any pages missing from order
          for (const p of s.pages) if (!order.includes(p.id)) reordered.push(p);
          s.pages = reordered;
          summaries.push(`reordered pages`);
          break;
        }
        case 'update_page': {
          const p = findPage(s, op.pageId);
          if (!p) { warnings.push(`update_page: ${op.pageId} not found`); break; }
          Object.assign(p, deepMerge(p, op.patch || {}));
          summaries.push(`updated page ${op.pageId}`);
          break;
        }
        case 'add_block': {
          const p = findPage(s, op.pageId);
          if (!p) { warnings.push(`add_block: page ${op.pageId} not found`); break; }
          const block = ensureIds({
            id: uid(),
            type: op.block?.type || 'free',
            props: op.block?.props || {},
            overlays: op.block?.overlays || [],
            ...(op.block || {}),
          });
          if (op.afterBlockId) {
            const i = p.blocks.findIndex((b: any) => b.id === op.afterBlockId);
            p.blocks.splice(i >= 0 ? i + 1 : p.blocks.length, 0, block);
          } else p.blocks.push(block);
          summaries.push(`added ${block.type} block → page ${op.pageId}`);
          break;
        }
        case 'update_block': {
          const p = findPage(s, op.pageId);
          const b = p && findBlock(p, op.blockId);
          if (!b) { warnings.push(`update_block: ${op.blockId} not found`); break; }
          Object.assign(b, deepMerge(b, op.patch || {}));
          summaries.push(`updated block ${op.blockId}`);
          break;
        }
        case 'delete_block': {
          const p = findPage(s, op.pageId);
          if (!p) { warnings.push(`delete_block: page ${op.pageId}`); break; }
          const before = p.blocks.length;
          p.blocks = p.blocks.filter((b: any) => b.id !== op.blockId);
          if (p.blocks.length === before) warnings.push(`delete_block: ${op.blockId} not found`);
          else summaries.push(`deleted block ${op.blockId}`);
          break;
        }
        case 'add_overlay': {
          const p = findPage(s, op.pageId);
          const b = p && findBlock(p, op.blockId);
          if (!b) { warnings.push(`add_overlay: target not found`); break; }
          const overlay = { id: uid(), rotation: 0, opacity: 1, ...op.overlay };
          b.overlays = b.overlays || [];
          b.overlays.push(overlay);
          summaries.push(`added ${overlay.type} overlay → block ${b.id}`);
          break;
        }
        case 'update_overlay': {
          const p = findPage(s, op.pageId);
          const b = p && findBlock(p, op.blockId);
          const o = b && (b.overlays || []).find((x: any) => x.id === op.overlayId);
          if (!o) { warnings.push(`update_overlay: ${op.overlayId} not found`); break; }
          Object.assign(o, deepMerge(o, op.patch || {}));
          summaries.push(`updated overlay ${op.overlayId}`);
          break;
        }
        case 'delete_overlay': {
          const p = findPage(s, op.pageId);
          const b = p && findBlock(p, op.blockId);
          if (!b) { warnings.push(`delete_overlay: target not found`); break; }
          const before = b.overlays.length;
          b.overlays = b.overlays.filter((o: any) => o.id !== op.overlayId);
          if (b.overlays.length === before) warnings.push(`delete_overlay: ${op.overlayId} not found`);
          else summaries.push(`deleted overlay ${op.overlayId}`);
          break;
        }
        case 'apply_theme': {
          // quick built-in palettes
          const themes: Record<string, any> = {
            luxe: { colors: { primary: '#BF9B50', bg: '#0D0D0D', text: '#F5F1E8', muted: '#9A8E73' }, fonts: { heading: '"Playfair Display", serif', body: 'Inter, sans-serif' } },
            editorial: { colors: { primary: '#1A1A1A', bg: '#FAFAF7', text: '#1A1A1A', muted: '#666' }, fonts: { heading: '"Playfair Display", serif', body: 'Georgia, serif' } },
            modern: { colors: { primary: '#0F62FE', bg: '#FFFFFF', text: '#161616', muted: '#525252' }, fonts: { heading: 'Inter, sans-serif', body: 'Inter, sans-serif' } },
            print: { colors: { primary: '#000000', bg: '#FFFFFF', text: '#111111', muted: '#555' }, fonts: { heading: 'Georgia, serif', body: 'Georgia, serif' } },
            dark: { colors: { primary: '#D4A843', bg: '#0D0D0D', text: '#FFFFFF', muted: '#9A8E73' }, fonts: { heading: 'Inter, sans-serif', body: 'Inter, sans-serif' } },
          };
          const t = themes[String(op.name).toLowerCase()];
          if (!t) { warnings.push(`apply_theme: unknown theme ${op.name}`); break; }
          s.tokens = s.tokens || { colors: {}, fonts: {}, spacing: {} };
          s.tokens.colors = { ...s.tokens.colors, ...t.colors };
          s.tokens.fonts = { ...s.tokens.fonts, ...t.fonts };
          summaries.push(`applied theme "${op.name}"`);
          break;
        }
        default:
          warnings.push(`unknown op: ${op.op}`);
      }
    } catch (e) {
      warnings.push(`${op.op} failed: ${(e as Error).message}`);
    }
  }
  return { schema: s, summaries, warnings };
}

// ─── tool schema ──────────────────────────────────────────────────────────────
const TOOL = {
  type: 'function',
  function: {
    name: 'apply_changes',
    description:
      'Apply a batch of operations to the ReportTemplate JSON. Emit ALL changes for the current user turn as a single call (multiple ops). The server validates and applies them in order.',
    parameters: {
      type: 'object',
      properties: {
        reply: { type: 'string', description: 'Short, plain-English summary for the designer of what you changed and why.' },
        operations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              op: {
                type: 'string',
                enum: [
                  'set_token','set_meta',
                  'add_page','duplicate_page','delete_page','reorder_pages','update_page',
                  'add_block','update_block','delete_block',
                  'add_overlay','update_overlay','delete_overlay',
                  'apply_theme',
                ],
              },
              path: { type: 'string' },
              value: {},
              patch: { type: 'object', additionalProperties: true },
              pageId: { type: 'string' },
              blockId: { type: 'string' },
              overlayId: { type: 'string' },
              afterIndex: { type: 'number' },
              afterBlockId: { type: 'string' },
              pageIds: { type: 'array', items: { type: 'string' } },
              page: { type: 'object', additionalProperties: true },
              block: { type: 'object', additionalProperties: true },
              overlay: { type: 'object', additionalProperties: true },
              name: { type: 'string' },
            },
            required: ['op'],
            additionalProperties: false,
          },
        },
      },
      required: ['reply', 'operations'],
      additionalProperties: false,
    },
  },
};

const SYSTEM = `You are the **Template Design Agent** for a premium PDF report builder.
You edit a ReportTemplate JSON document on behalf of a designer through a single tool: \`apply_changes\`.

Schema vocabulary you must respect:
- Coordinates are PDF points (1pt = 1/72 inch). A4 portrait = 595 × 842.
- Page = { id, name, size{width,height}, background{color,imageUrl}, blocks[] }.
- Block = { id, type, props, overlays[] }. Block types include: free, hero, kpi-grid, callout, dataTable, gallery, divider, footer, disclaimer, signature, twoColumn, chart, image, textBlock, spacer, pageNumber, qrCode, slot, decisionBox, riskRegister, scorecard, badgeList, autoToc.
- Overlay = text | image | shape, each with x,y (top-left origin), width, height, rotation, opacity.
  - text: content, fontFamily, fontSize, fontWeight, fontStyle, color (#hex or "token:primary"), align, lineHeight.
  - shape: shape='rect'|'line'|'ellipse', fill, stroke, strokeWidth, borderRadius.
  - image: src, fit='cover'|'contain'|'fill'.
- Tokens: colors{}, fonts{}, spacing{}. Reference via "token:<key>" in any color or string.
- Bindings: "{{path.to.data}}" anywhere a string is allowed; do not invent paths.

DESIGN STANDARDS — be opinionated and creative:
- Use rich typographic hierarchy (display 48–72pt, h1 32, h2 20, body 11).
- Prefer 36pt page margins; align overlays to a 12pt grid.
- Use the token palette; only hard-code colours when the designer explicitly asks.
- For new sections, compose: section title overlay + supporting copy + KPI/data block + accent shape.
- When asked to "redesign" or "improve", make decisive structural changes — never just tweak one value.

CONVERSATIONAL RULES:
- Treat each user message as a possibly multi-step instruction. Break it down silently, then emit ALL operations in ONE \`apply_changes\` call.
- Reference targets by the exact ids shown in the outline. Never invent ids.
- When you ADD elements, do not include an "id" — the server generates one.
- Reply in 1–3 short sentences for the designer; keep it concrete ("Added a Cover with hero title + gold accent line; switched primary token to #BF9B50").
- If the request is ambiguous, make the most tasteful interpretation and proceed; ask only when you genuinely cannot proceed.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!LOVABLE_API_KEY) return json({ error: 'LOVABLE_API_KEY missing' }, 500);

  try {
    const body = await req.json();
    const schema = body.schema || { version: 1, pages: [], tokens: {}, slots: {} };
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = body.messages || [];
    const userInstruction: string = body.instruction || (history[history.length - 1]?.content ?? '');
    const activePageId: string | undefined = body.activePageId;
    const selectedBlockId: string | undefined = body.selectedBlockId;
    const selectedOverlayId: string | undefined = body.selectedOverlayId;
    const mode: 'design' | 'art_director' | 'screenshot_to_block' | 'inline_text' | 'auto_fill' = body.mode || 'design';
    const imageDataUrl: string | undefined = body.imageDataUrl; // data:image/...;base64,...
    const memoryFacts: string[] = Array.isArray(body.memoryFacts) ? body.memoryFacts : [];
    const sampleData: any = body.sampleData ?? null;

    if (!userInstruction?.trim() && !imageDataUrl && mode !== 'auto_fill') return json({ error: 'empty instruction' }, 400);

    // Mode-specific system addendum
    let modeAddendum = '';
    if (mode === 'art_director') {
      modeAddendum = `\n\n[ART DIRECTOR MODE]
You are doing a DECISIVE polish pass on the active page (id=${activePageId}).
Make bold structural improvements: refine typographic hierarchy, fix alignment to a 12pt grid, tighten spacing, add a tasteful accent shape or rule, ensure colour harmony via tokens, upgrade copywriting clarity. Emit 8–20 operations targeting only the active page unless tokens need updates. Do NOT ask the user — just execute.`;
    } else if (mode === 'screenshot_to_block') {
      modeAddendum = `\n\n[SCREENSHOT-TO-BLOCK MODE]
The user has attached an image showing a design they want recreated as native blocks/overlays on the active page (id=${activePageId}).
Analyse the image: identify sections, headings, body copy, KPI numbers, accent shapes, images. Recreate the layout faithfully using add_block / add_overlay operations on the active page. Match colours via tokens when possible, otherwise hex. Approximate positions in PDF points on a 595×842 canvas (or the active page's actual size). Aim for 1:1 visual parity; ignore content you cannot make out.`;
    } else if (mode === 'inline_text') {
      modeAddendum = `\n\n[INLINE TEXT MODE]
Modify ONLY the selected text overlay (overlay id=${selectedOverlayId}, block id=${selectedBlockId}, page id=${activePageId}). Emit exactly one update_overlay operation patching the "content" field. Do not change anything else. Preserve bindings ({{...}} tokens) unless the user explicitly asks to remove them.`;
    } else if (mode === 'auto_fill') {
      modeAddendum = `\n\n[AUTO-FILL MODE]
Walk the entire template. For every text overlay whose content is empty, a placeholder (Lorem ipsum / "Heading" / "Subtitle" / etc.), or an unresolvable binding, replace it with a concrete, well-written value drawn from SAMPLE DATA below.
- Prefer keeping a {{binding}} when sample data has the value at that path. Only inline a literal when the path is missing or the placeholder is clearly generic.
- For headings/eyebrows, write crisp 2–6 word lines. For body copy, 1–3 short sentences in the document's tone.
- Use update_overlay only. Do NOT add new blocks/pages. Cap at ~40 ops.
SAMPLE DATA (JSON):
${JSON.stringify(sampleData ?? {}, null, 2).slice(0, 4000)}`;
    }

    // Persistent memory facts about this template (brand voice, do/don'ts, etc.)
    const memoryBlock = memoryFacts.length
      ? `\n\nPERSISTENT MEMORY (apply to every turn):\n${memoryFacts.map((f, i) => `  ${i + 1}. ${f}`).join('\n')}`
      : '';

    const context = `CURRENT TEMPLATE OUTLINE:
${outline(schema)}

ACTIVE SELECTION:
  page=${activePageId ?? '-'} block=${selectedBlockId ?? '-'} overlay=${selectedOverlayId ?? '-'}${memoryBlock}`;

    const useVision = !!imageDataUrl;

    const messages: any[] = [
      { role: 'system', content: SYSTEM + modeAddendum },
      { role: 'system', content: context },
      ...history.slice(-12).map((m) => ({ role: m.role, content: m.content })),
    ];

    // Build final user turn — multimodal when image attached
    if (useVision) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: userInstruction || 'Recreate this design as native template blocks on the active page.' },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      });
    } else {
      const finalText = userInstruction || (mode === 'auto_fill'
        ? 'Auto-fill every empty/placeholder text overlay with concrete values from the sample data above.'
        : '');
      if (finalText && messages[messages.length - 1]?.content !== finalText) {
        messages.push({ role: 'user', content: finalText });
      }
    }

    const aiResp = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: useVision ? VISION_MODEL : DEFAULT_MODEL,
        messages,
        tools: [TOOL],
        tool_choice: { type: 'function', function: { name: 'apply_changes' } },
        // Note: gpt-5.5 rejects reasoning_effort when tools are provided in /v1/chat/completions.
      }),
    });

    if (!aiResp.ok) {
      const text = await aiResp.text();
      if (aiResp.status === 429) return json({ error: 'Rate limited — try again shortly.' }, 429);
      if (aiResp.status === 402) return json({ error: 'AI credits exhausted. Add credits in Workspace settings.' }, 402);
      console.error('design agent gateway error', aiResp.status, text);
      return json({ error: `AI gateway error (${aiResp.status})` }, 500);
    }
    const aiData = await aiResp.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      const reply = aiData?.choices?.[0]?.message?.content ?? 'No changes proposed.';
      return json({ reply, schema, operations: [], warnings: ['Model did not call apply_changes.'] });
    }
    let parsed: { reply: string; operations: Op[] };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      return json({ error: 'AI returned malformed tool arguments', detail: String(e) }, 500);
    }

    const { schema: newSchema, summaries, warnings } = applyOps(schema, parsed.operations || []);
    return json({
      reply: parsed.reply || '',
      schema: newSchema,
      operations: summaries,
      warnings,
      raw_ops: parsed.operations,
    });
  } catch (e) {
    console.error('template-design-agent error', e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
