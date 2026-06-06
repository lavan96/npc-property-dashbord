/**
 * Phase 15 — AI Authoring for the Report Template Builder.
 *
 * Actions (dispatched via { action } in JSON body):
 *   - generate_layout    : NL prompt + tier/context  -> Page JSON (blocks)
 *   - rewrite_copy       : { text, mode, tone }      -> rewritten text
 *   - suggest_bindings   : { samplePaths, target }   -> ranked binding suggestions
 *   - name_suggest       : { template summary }      -> { name, description }
 *
 * Uses the Lovable AI Gateway (LOVABLE_API_KEY) with tool-calling for
 * structured output. No DB writes — pure transform.
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const GATEWAY = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-2.5-flash';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function callAI(opts: {
  system: string;
  user: string;
  tool?: { name: string; description: string; parameters: any };
}) {
  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) throw new Error('LOVABLE_API_KEY not configured');

  const body: any = {
    model: MODEL,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
  };
  if (opts.tool) {
    body.tools = [{ type: 'function', function: opts.tool }];
    body.tool_choice = { type: 'function', function: { name: opts.tool.name } };
  }

  const res = await fetch(GATEWAY, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error('Rate limit exceeded — try again shortly.');
  if (res.status === 402) throw new Error('AI credits exhausted — top up the workspace.');
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = await res.json();
  const msg = data?.choices?.[0]?.message;
  if (opts.tool) {
    const call = msg?.tool_calls?.[0];
    if (!call?.function?.arguments) throw new Error('AI returned no structured output');
    try { return JSON.parse(call.function.arguments); }
    catch { throw new Error('Failed to parse AI structured output'); }
  }
  return msg?.content ?? '';
}

// ─── Action: generate_layout ──────────────────────────────────────────────────
async function generateLayout(p: any) {
  const prompt = String(p?.prompt ?? '').trim();
  if (!prompt) throw new Error('Missing prompt');
  const tier = String(p?.tier ?? 'pld');
  const pageWidth = Number(p?.pageWidth ?? 595);
  const pageHeight = Number(p?.pageHeight ?? 842);
  const availableBlocks: string[] = Array.isArray(p?.availableBlocks)
    ? p.availableBlocks.slice(0, 80)
    : [];

  const system = `You are an expert PDF report layout designer for NPC Property Services.
Output ONE page worth of blocks for the report template builder.
Constraints:
- Page size: ${pageWidth} x ${pageHeight} pt (A4 portrait by default).
- Use ONLY block types from the allowed list when populating each block's "type".
- Keep 36pt page margins. Don't overflow.
- Prefer real binding placeholders like {{property.address}}, {{financials.weeklyRent | currency}} where it makes sense.
- Tier: ${tier}. Keep tone editorial, premium, dark-gold brand aware.`;

  const user = `Brief:\n${prompt}\n\nAllowed block types:\n${availableBlocks.join(', ') || '(any)'}\n\nReturn 3–8 blocks for a single page.`;

  const tool = {
    name: 'emit_page_layout',
    description: 'Emit a structured page layout',
    parameters: {
      type: 'object',
      properties: {
        pageName: { type: 'string' },
        rationale: { type: 'string' },
        blocks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'Block type id' },
              name: { type: 'string' },
              props: { type: 'object', additionalProperties: true },
            },
            required: ['type'],
          },
        },
      },
      required: ['pageName', 'blocks'],
    },
  };

  const result = await callAI({ system, user, tool });
  return result;
}

// ─── Action: rewrite_copy ─────────────────────────────────────────────────────
async function rewriteCopy(p: any) {
  const text = String(p?.text ?? '').trim();
  if (!text) throw new Error('Missing text');
  const mode = String(p?.mode ?? 'improve'); // improve|shorten|lengthen|simplify|punch
  const tone = String(p?.tone ?? 'premium-editorial');
  const audience = String(p?.audience ?? 'property investors');
  const preserveBindings = p?.preserveBindings !== false;

  const system = `You rewrite copy for premium property investment reports.
Tone: ${tone}. Audience: ${audience}.
${preserveBindings ? 'CRITICAL: Preserve every {{...}} binding token EXACTLY as written.' : ''}
Return ONLY the rewritten text — no quotes, no preamble.`;
  const user = `Mode: ${mode}\n\nOriginal:\n${text}`;
  const out = await callAI({ system, user });
  return { text: String(out).trim() };
}

// ─── Action: suggest_bindings ─────────────────────────────────────────────────
async function suggestBindings(p: any) {
  const target = String(p?.target ?? '').trim(); // e.g. label "Weekly Rent" or current text
  if (!target) throw new Error('Missing target');
  const paths: string[] = Array.isArray(p?.samplePaths) ? p.samplePaths.slice(0, 200) : [];
  const system = `You map UI labels/copy to data binding paths for an NPC report template.
Choose from the provided paths only. Rank top 5 by relevance.`;
  const user = `Target label/copy:\n${target}\n\nAvailable paths:\n${paths.join('\n')}`;
  const tool = {
    name: 'emit_suggestions',
    description: 'Ranked binding suggestions',
    parameters: {
      type: 'object',
      properties: {
        suggestions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              filter: { type: 'string', description: 'Optional pipe filter e.g. currency, percent, date' },
              confidence: { type: 'number' },
              reason: { type: 'string' },
            },
            required: ['path', 'confidence'],
          },
        },
      },
      required: ['suggestions'],
    },
  };
  return await callAI({ system, user, tool });
}

// ─── Action: name_suggest ─────────────────────────────────────────────────────
async function nameSuggest(p: any) {
  const summary = String(p?.summary ?? '').trim();
  if (!summary) throw new Error('Missing summary');
  const system = 'You name and describe premium property report templates concisely.';
  const user = `Summary:\n${summary}\n\nReturn a short name (max 60 chars) and a one-line description (max 140 chars).`;
  const tool = {
    name: 'emit_name',
    description: 'Template name + description',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['name', 'description'],
    },
  };
  return await callAI({ system, user, tool });
}

// ─── Action: generate_cover ───────────────────────────────────────────────────
// Generative Cover Designer — produces a fully composed cover page (blocks +
// overlays with absolute positions) plus an optional AI hero-image prompt.
async function generateCover(p: any) {
  const brief = String(p?.brief ?? '').trim();
  if (!brief) throw new Error('Missing brief');
  const pageWidth = Number(p?.pageWidth ?? 595);
  const pageHeight = Number(p?.pageHeight ?? 842);
  const tier = String(p?.tier ?? 'pld');
  const brand = p?.brand ?? {};

  const system = `You design premium magazine-quality cover pages for NPC Property Services investment reports.
Output a SINGLE cover page composed of blocks AND overlays placed in absolute coordinates.
Page size: ${pageWidth} x ${pageHeight} pt.
Layout rules:
- Hero image fills the top 60–75% of the page.
- Headline overlay (40–60pt, bold) sits at the lower-left, with a smaller subheadline beneath.
- Reserve a 36pt safe margin on all sides.
- Include a small footer-line overlay with tier + date placeholder using {{report.date | date:'MMM yyyy'}}.
- Bindings are encouraged: {{property.address}}, {{property.suburb}}, {{client.name}}.
Brand context: ${JSON.stringify(brand).slice(0, 400)}.
Tier: ${tier}.`;

  const user = `Brief for the cover:\n${brief}\n\nReturn the page name, an evocative hero-image prompt, and the block+overlay layout.`;

  const tool = {
    name: 'emit_cover_page',
    description: 'Emit a fully composed cover page',
    parameters: {
      type: 'object',
      properties: {
        pageName: { type: 'string' },
        heroImagePrompt: { type: 'string', description: 'Prompt to feed into the hero image generator' },
        rationale: { type: 'string' },
        background: {
          type: 'object',
          properties: { color: { type: 'string' } },
          additionalProperties: true,
        },
        blocks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['image', 'text', 'rect', 'cover'] },
              name: { type: 'string' },
              props: { type: 'object', additionalProperties: true },
              overlays: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['text', 'image', 'rect'] },
                    x: { type: 'number' },
                    y: { type: 'number' },
                    width: { type: 'number' },
                    height: { type: 'number' },
                    content: { type: 'string' },
                    fontSize: { type: 'number' },
                    fontWeight: { type: 'string' },
                    color: { type: 'string' },
                    alt: { type: 'string' },
                  },
                  required: ['type', 'x', 'y', 'width', 'height'],
                },
              },
            },
            required: ['type'],
          },
        },
      },
      required: ['pageName', 'blocks'],
    },
  };

  return await callAI({ system, user, tool });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? '');
    switch (action) {
      case 'generate_layout': return json(await generateLayout(body));
      case 'rewrite_copy':    return json(await rewriteCopy(body));
      case 'suggest_bindings':return json(await suggestBindings(body));
      case 'name_suggest':    return json(await nameSuggest(body));
      default: return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    const status = /rate limit/i.test(msg) ? 429
      : /credits/i.test(msg) ? 402
      : /missing|unknown action/i.test(msg) ? 400
      : 500;
    return json({ error: msg }, status);
  }
});
