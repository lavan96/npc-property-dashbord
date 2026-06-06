/**
 * Design Brief pipeline for the Template Design Agent.
 *
 * Stage 1: analyzeReferenceImage(imageDataUrl) → DesignBrief (GPT-5 vision)
 * Stage 2: integrateBriefTokens(template, brief)  → tokens + auto-contrast guarded
 * Stage 3: synthesisSystemPrompt(brief, tokens, pageSize) → SYSTEM addendum used
 *          when the existing apply_changes tool is called for layout synthesis.
 *
 * Stages 1 and 3 both go through Lovable AI Gateway (openai/gpt-5).
 */

import { hexToRgb, contrastRatioHex, pickContrastingFg, nearestHex } from './colorScience.ts';

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const VISION_MODEL = 'openai/gpt-5';

export type BriefPaletteRole = 'bg' | 'surface' | 'text' | 'accent' | 'muted';
export interface BriefPaletteEntry { role: BriefPaletteRole; hex: string; label?: string }
export interface BriefSection { role: string; title: string; span: number; notes?: string }
export interface DesignBrief {
  palette: BriefPaletteEntry[];
  typography: { heading: string; body: string; vibe: string };
  layout: { grid: '12col'; density: 'sparse' | 'balanced' | 'dense'; sections: BriefSection[] };
  content: { headline?: string; deck?: string; body?: string; labels?: string[] };
  motifs: string[];
}

const BRIEF_TOOL = {
  type: 'function',
  function: {
    name: 'emit_design_brief',
    description: 'Produce a structured design brief describing the reference image so a downstream layout engine can recreate it on a token-driven PDF page.',
    parameters: {
      type: 'object',
      properties: {
        palette: {
          type: 'array',
          description: '4–6 colours extracted from the image. Use uppercase 6-digit hex.',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['bg', 'surface', 'text', 'accent', 'muted'] },
              hex: { type: 'string', description: '#RRGGBB' },
              label: { type: 'string' },
            },
            required: ['role', 'hex'],
            additionalProperties: false,
          },
        },
        typography: {
          type: 'object',
          properties: {
            heading: { type: 'string', description: 'Heading style family, e.g. "serif display", "geometric sans".' },
            body: { type: 'string', description: 'Body style family, e.g. "humanist sans", "modern serif".' },
            vibe: { type: 'string', description: 'editorial | brutalist | minimal | maximalist | corporate | luxe | playful' },
          },
          required: ['heading', 'body', 'vibe'],
          additionalProperties: false,
        },
        layout: {
          type: 'object',
          properties: {
            grid: { type: 'string', enum: ['12col'] },
            density: { type: 'string', enum: ['sparse', 'balanced', 'dense'] },
            sections: {
              type: 'array',
              description: 'Vertical sections, top to bottom. span = column count (1–12).',
              items: {
                type: 'object',
                properties: {
                  role: { type: 'string', description: 'hero | header | kpi-strip | body | gallery | quote | footer | callout | data-table | divider' },
                  title: { type: 'string' },
                  span: { type: 'number' },
                  notes: { type: 'string' },
                },
                required: ['role', 'title', 'span'],
                additionalProperties: false,
              },
            },
          },
          required: ['grid', 'density', 'sections'],
          additionalProperties: false,
        },
        content: {
          type: 'object',
          properties: {
            headline: { type: 'string' },
            deck: { type: 'string' },
            body: { type: 'string' },
            labels: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
        },
        motifs: {
          type: 'array',
          description: 'Short labels for visual motifs: large_hero, gold_rule, pill_badges, gradient_panel, oversized_numeral, etc.',
          items: { type: 'string' },
        },
      },
      required: ['palette', 'typography', 'layout', 'motifs'],
      additionalProperties: false,
    },
  },
};

const BRIEF_SYSTEM = `You are a senior art director. Examine the reference image and translate it into a STRUCTURED DESIGN BRIEF for a PDF page builder.

RULES:
- Output ONLY via the emit_design_brief tool. Do not reply with prose.
- Palette: extract 4–6 distinct colours actually visible in the image. Use uppercase 6-digit hex (#RRGGBB). Roles:
  • bg = dominant page background
  • surface = secondary panel/card background (may equal bg if none)
  • text = main type colour against bg
  • accent = highest-saturation brand/accent colour
  • muted = low-contrast secondary text colour
- Typography: describe the family vibe, not specific fonts. Heading vs body must be distinguishable.
- Layout: read the image top-to-bottom; emit 3–7 sections with role + short title + column span (1–12).
- Content: extract any visible headline / deck / body / labels (verbatim, max 240 chars each).
- Motifs: 2–6 short snake_case tags for distinctive visual moves.

IF the image is unreadable, still emit your best-effort brief — never refuse.`;

export async function analyzeReferenceImage(
  imageDataUrl: string,
  apiKey: string,
  hint?: string,
): Promise<{ brief: DesignBrief; raw: any } | { error: string; raw?: any }> {
  const messages = [
    { role: 'system', content: BRIEF_SYSTEM },
    {
      role: 'user',
      content: [
        { type: 'text', text: hint ? `Designer hint: ${hint}\n\nAnalyse this reference image.` : 'Analyse this reference image.' },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    },
  ];

  const resp = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages,
      tools: [BRIEF_TOOL],
      tool_choice: { type: 'function', function: { name: 'emit_design_brief' } },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return { error: `vision gateway ${resp.status}: ${text.slice(0, 300)}` };
  }
  const data = await resp.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) {
    return { error: 'no tool_call from vision model', raw: data };
  }
  try {
    const parsed = JSON.parse(call.function.arguments) as DesignBrief;
    // Normalise hex casing
    parsed.palette = (parsed.palette || []).map((p) => ({ ...p, hex: String(p.hex || '').toUpperCase() }));
    return { brief: parsed, raw: data };
  } catch (e) {
    return { error: `bad JSON: ${(e as Error).message}`, raw: data };
  }
}

/**
 * Stage 2 — merge the brief's palette into template tokens under a `brief.*`
 * namespace, then run a WCAG contrast guard to make sure the synthesis pass
 * has at least one valid (bg, text) pairing it can reference.
 *
 * Returns the additive token patch plus a swap log for the chat UI.
 */
export function integrateBriefTokens(
  templateTokens: Record<string, any>,
  brief: DesignBrief,
): { tokenPatch: Record<string, string>; pairings: { bg: string; text: string; ratio: number; swapped: boolean }[]; swaps: string[] } {
  const existing = (templateTokens?.colors ?? {}) as Record<string, string>;
  const allHex = [
    ...Object.values(existing).filter((v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)),
    '#FFFFFF', '#000000',
  ];
  const tokenPatch: Record<string, string> = {};
  for (const entry of brief.palette) {
    if (!hexToRgb(entry.hex)) continue;
    tokenPatch[`brief.${entry.role}`] = entry.hex;
  }

  const bgHex = tokenPatch['brief.bg'] || existing.bg || '#FFFFFF';
  const textHex = tokenPatch['brief.text'] || existing.text || '#111111';
  const accentHex = tokenPatch['brief.accent'] || existing.primary || '#BF9B50';

  const swaps: string[] = [];
  const pairings: { bg: string; text: string; ratio: number; swapped: boolean }[] = [];

  // Ensure text passes 4.5:1 on bg
  let safeText = textHex;
  const textRatio = contrastRatioHex(textHex, bgHex);
  if (textRatio < 4.5) {
    const candidates = [...new Set([...Object.values(existing), ...brief.palette.map((p) => p.hex), '#FFFFFF', '#111111'])];
    const swap = pickContrastingFg(bgHex, candidates, 4.5);
    if (swap && swap.toUpperCase() !== safeText.toUpperCase()) {
      swaps.push(`text ${textHex} → ${swap} on bg ${bgHex} (was ${textRatio.toFixed(2)}:1, needed ≥4.5)`);
      safeText = swap;
      tokenPatch['brief.text'] = swap;
    }
  }
  pairings.push({ bg: bgHex, text: safeText, ratio: contrastRatioHex(safeText, bgHex), swapped: safeText !== textHex });

  // Ensure accent passes 3:1 on bg (non-text decorative)
  const accentRatio = contrastRatioHex(accentHex, bgHex);
  if (accentRatio < 3) {
    const candidates = [...new Set([...Object.values(existing), ...brief.palette.map((p) => p.hex), '#FFFFFF', '#111111'])];
    const swap = pickContrastingFg(bgHex, candidates, 3);
    if (swap && swap.toUpperCase() !== accentHex.toUpperCase()) {
      swaps.push(`accent ${accentHex} → ${swap} on bg ${bgHex} (was ${accentRatio.toFixed(2)}:1, needed ≥3)`);
      tokenPatch['brief.accent'] = swap;
    }
  }
  pairings.push({ bg: bgHex, text: tokenPatch['brief.accent'] || accentHex, ratio: contrastRatioHex(tokenPatch['brief.accent'] || accentHex, bgHex), swapped: !!tokenPatch['brief.accent'] && tokenPatch['brief.accent'] !== accentHex });

  return { tokenPatch, pairings, swaps };
}

/**
 * Stage 3 — system addendum that turns the brief into precise instructions for
 * the existing apply_changes tool. The orchestrator forces clear_page first
 * and binds colours through tokens.brief.* (set in stage 2).
 */
export function synthesisSystemAddendum(
  brief: DesignBrief,
  activePageId: string,
  pageSize: { width: number; height: number },
  tokenPatch: Record<string, string>,
): string {
  const palette = Object.entries(tokenPatch).map(([k, v]) => `  token:${k} = ${v}`).join('\n');
  const sections = (brief.layout.sections || [])
    .map((s, i) => `  ${i + 1}. [${s.role}] "${s.title}" span=${s.span}/12${s.notes ? ` — ${s.notes}` : ''}`)
    .join('\n');
  const labels = brief.content?.labels?.length ? brief.content.labels.join(' · ') : '—';

  return `
[BRIEF-DRIVEN SYNTHESIS]
Recreate the active page (id=${activePageId}, ${pageSize.width}×${pageSize.height}pt) from this DESIGN BRIEF.

PALETTE (use ONLY these via "token:<key>" references — never hard-code these hexes):
${palette || '  (none)'}

TYPOGRAPHY:
  heading vibe: ${brief.typography.heading}
  body vibe:    ${brief.typography.body}
  overall vibe: ${brief.typography.vibe}

LAYOUT (top to bottom, 12-col grid, 48pt outer margin, 24pt gutters):
${sections || '  (single hero section)'}

CONTENT TO PLACE:
  headline: ${JSON.stringify(brief.content?.headline ?? '')}
  deck:     ${JSON.stringify(brief.content?.deck ?? '')}
  body:     ${JSON.stringify(brief.content?.body ?? '')}
  labels:   ${labels}

MOTIFS to incorporate: ${brief.motifs?.join(', ') || '—'}
DENSITY: ${brief.layout.density}

MANDATORY OPS ORDER:
  1. { "op": "clear_page", "pageId": "${activePageId}" }
  2. For each palette colour above: { "op": "set_token", "path": "colors.<key without 'token:' prefix>", "value": "<hex>" }
     (e.g. path "colors.brief.bg"). This makes the colours referenceable.
  3. Build the layout with add_block / add_overlay, binding every colour to "token:brief.bg|surface|text|accent|muted" — NEVER raw hex.

CONTRAST: text overlays MUST use color "token:brief.text" on bg "token:brief.bg" or "token:brief.surface". Accents use "token:brief.accent" sparingly (rules, eyebrow text, single CTA).

Cap at ~25 ops. Emit the entire layout in ONE apply_changes call.`;
}
