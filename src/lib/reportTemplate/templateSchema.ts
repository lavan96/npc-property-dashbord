/**
 * PDF Template Builder — JSON schema (single source of truth).
 *
 * The same `ReportTemplate` JSON drives:
 *   - the visual editor (tldraw canvas + inspector)
 *   - the PDF renderer (jsPDF / pdf-lib)
 *
 * All positional values use **PDF points** (1pt = 1/72 inch).
 * A4 page = 595 × 842 pt.
 */
import { z } from 'zod';

// ─── Bindings ─────────────────────────────────────────────────────────────────
// A field can be a literal, a brand token, or a data path.
//   "Hello"                       → literal
//   "{{property.address}}"        → data binding
//   "{{financials.weeklyRent | currency}}"  → with filter
//   "token:primary"               → brand token reference
export const BindableStringSchema = z.string();
export const BindableColorSchema = z.string(); // "#hex" or "token:primary" or "{{...}}"
export const BindableNumberSchema = z.union([z.number(), z.string()]);

// ─── Tokens ───────────────────────────────────────────────────────────────────
export const TokensSchema = z.object({
  colors: z.record(z.string()).default({}),     // { primary: "#BF9B50", ... }
  fonts: z.record(z.string()).default({}),      // { heading: "Helvetica", body: "Helvetica" }
  spacing: z.record(z.number()).default({}),    // { gutter: 16, ... }
}).default({ colors: {}, fonts: {}, spacing: {} });

export type Tokens = z.infer<typeof TokensSchema>;

// ─── Overlays (free-floating shapes inside a page) ────────────────────────────
const BaseOverlay = z.object({
  id: z.string(),
  x: z.number(),       // pt
  y: z.number(),       // pt — origin top-left of page
  width: z.number(),
  height: z.number(),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  conditional: z.string().optional(),  // e.g. "tier === 'compass'"
});

export const TextOverlaySchema = BaseOverlay.extend({
  type: z.literal('text'),
  content: BindableStringSchema,
  fontFamily: BindableStringSchema.default('Helvetica'),
  fontSize: BindableNumberSchema.default(12),
  fontWeight: z.enum(['normal', 'bold']).default('normal'),
  fontStyle: z.enum(['normal', 'italic']).default('normal'),
  color: BindableColorSchema.default('#000000'),
  align: z.enum(['left', 'center', 'right']).default('left'),
  lineHeight: z.number().default(1.3),
  letterSpacing: z.number().default(0),
});

export const ImageOverlaySchema = BaseOverlay.extend({
  type: z.literal('image'),
  src: BindableStringSchema,
  fit: z.enum(['cover', 'contain', 'fill']).default('cover'),
  // Manual crop, expressed as percent (0–100) of the source image trimmed
  // from each edge before fit/positioning is applied.
  crop: z.object({
    left: z.number().min(0).max(100).default(0),
    right: z.number().min(0).max(100).default(0),
    top: z.number().min(0).max(100).default(0),
    bottom: z.number().min(0).max(100).default(0),
  }).optional(),
});

export const ShapeOverlaySchema = BaseOverlay.extend({
  type: z.literal('shape'),
  shape: z.enum(['rect', 'line', 'ellipse']).default('rect'),
  fill: BindableColorSchema.optional(),
  stroke: BindableColorSchema.optional(),
  strokeWidth: z.number().default(0),
  borderRadius: z.number().default(0),
});

export const OverlaySchema = z.discriminatedUnion('type', [
  TextOverlaySchema,
  ImageOverlaySchema,
  ShapeOverlaySchema,
]);

export type Overlay = z.infer<typeof OverlaySchema>;

// ─── Blocks ───────────────────────────────────────────────────────────────────
// A "block" is a structured, reusable unit (hero, table, disclaimer, ...).
// Each block has its own `props` shape, validated by the block registry.
// `overlays[]` sit on top of the block (free-form text/image/shape).
export const BlockSchema = z.object({
  id: z.string(),
  type: z.string(),                              // 'disclaimer', 'hero', 'kpi-grid', 'free', ...
  props: z.record(z.unknown()).default({}),      // block-specific
  overlays: z.array(OverlaySchema).default([]),
  conditional: z.string().optional(),
});

export type Block = z.infer<typeof BlockSchema>;

// ─── Pages ────────────────────────────────────────────────────────────────────
export const PageSizeSchema = z.object({
  width: z.number().default(595),   // A4 portrait pt
  height: z.number().default(842),
});

export const PageSchema = z.object({
  id: z.string(),
  name: z.string().default('Page'),
  size: PageSizeSchema.default({ width: 595, height: 842 }),
  background: z.object({
    color: BindableColorSchema.optional(),
    imageUrl: BindableStringSchema.optional(),
  }).default({}),
  blocks: z.array(BlockSchema).default([]),
  conditional: z.string().optional(),
});

export type Page = z.infer<typeof PageSchema>;

// ─── Top-level template ───────────────────────────────────────────────────────
export const ReportTemplateSchema = z.object({
  version: z.literal(1).default(1),
  tokens: TokensSchema,
  pages: z.array(PageSchema).default([]),
  /**
   * Reusable component slots (Header / Footer / etc.). Pages reference a slot
   * via a `slot` block whose `props.slotKey` matches a key here. Edit once,
   * applied wherever referenced.
   */
  slots: z.record(BlockSchema).default({}),
});

export type ReportTemplate = z.infer<typeof ReportTemplateSchema>;

// ─── Defaults / factories ─────────────────────────────────────────────────────
export const EMPTY_TEMPLATE: ReportTemplate = {
  version: 1,
  tokens: { colors: {}, fonts: {}, spacing: {} },
  pages: [],
  slots: {},
};

export const DEFAULT_BRAND_TOKENS: Tokens = {
  colors: {
    primary: '#BF9B50',  // gold
    bg: '#141414',
    text: '#FFFFFF',
    muted: '#999999',
  },
  fonts: {
    heading: 'Helvetica',
    body: 'Helvetica',
  },
  spacing: { gutter: 16 },
};

export function makeBlankTemplate(): ReportTemplate {
  return {
    version: 1,
    tokens: DEFAULT_BRAND_TOKENS,
    pages: [
      {
        id: crypto.randomUUID(),
        name: 'Cover',
        size: { width: 595, height: 842 },
        background: { color: 'token:bg' },
        blocks: [],
      },
    ],
  };
}

/** Parse arbitrary JSON safely; returns EMPTY_TEMPLATE on failure. */
export function parseTemplate(input: unknown): ReportTemplate {
  const result = ReportTemplateSchema.safeParse(input);
  if (!result.success) {
    console.warn('[templateSchema] Failed to parse template, using empty', result.error.flatten());
    return EMPTY_TEMPLATE;
  }
  return result.data;
}
