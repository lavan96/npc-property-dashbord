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
// Phase 5 — fontFaces entry. Supports either a remote stylesheet (Google Fonts
// CSS URL) via `cssUrl`, or a direct font-file `src` for self-hosting.
export const FontFaceSchema = z.object({
  family: z.string(),                     // e.g. "Playfair Display"
  cssUrl: z.string().url().optional(),    // https://fonts.googleapis.com/css2?...
  src: z.string().url().optional(),       // direct .woff2 / .otf
  weight: z.union([z.number(), z.string()]).optional(),
  style: z.enum(['normal', 'italic']).optional(),
  display: z.enum(['auto', 'swap', 'block', 'fallback', 'optional']).optional(),
});
export type FontFace = z.infer<typeof FontFaceSchema>;

export const ComputedFieldSchema = z.object({
  name: z.string().min(1),                 // exposed as data.@name or {{=name}}
  expr: z.string().min(1),                 // JS-like expression evaluated against data + tokens
  description: z.string().optional(),
  format: z.enum(['raw','currency','number','percent','date']).optional(),
});
export type ComputedField = z.infer<typeof ComputedFieldSchema>;

export const TokensSchema = z.object({
  colors: z.record(z.string()).default({}),     // { primary: "#BF9B50", ... }
  fonts: z.record(z.string()).default({}),      // { heading: "Helvetica", body: "Helvetica" }
  spacing: z.record(z.number()).default({}),    // { gutter: 16, ... }
  // Phase 1 extensions — optional, additive, backwards-compatible
  radii: z.record(z.number()).optional(),
  shadows: z.record(z.string()).optional(),
  gradients: z.record(z.string()).optional(),
  typeScale: z.record(z.number()).optional(),
  brandKitId: z.string().uuid().optional(),
  activeTheme: z.enum(['light','dark','print','custom']).optional(),
  // Phase 5 — registered web fonts to inject via @font-face / @import
  fontFaces: z.array(FontFaceSchema).optional(),
  // Phase 7 — computed/derived fields available in bindings as `{{=name}}`
  computed: z.array(ComputedFieldSchema).optional(),
}).default({ colors: {}, fonts: {}, spacing: {} });


export type Tokens = z.infer<typeof TokensSchema>;

// ─── Interaction (Phase 8) ─────────────────────────────────────────────────────
// Links can be: external URL ("https://…"), internal page ("page:<pageId>"),
// or named anchor ("anchor:<name>"). Resolved at render time.
export const LinkSchema = z.object({
  href: BindableStringSchema,                           // url, page:<id>, anchor:<name>
  target: z.enum(['_self','_blank']).optional(),
  title: BindableStringSchema.optional(),
}).optional();

// Bookmark = a named destination for cross-linking + PDF outline entry.
export const BookmarkSchema = z.object({
  name: z.string().min(1),                              // unique within template, used in anchor:<name>
  label: BindableStringSchema.optional(),               // display label (TOC/outline)
  level: z.number().int().min(1).max(6).optional(),     // outline depth
  includeInToc: z.boolean().optional(),
}).optional();

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
  link: LinkSchema,
  bookmark: BookmarkSchema,
});



export const TextOverlaySchema = BaseOverlay.extend({
  type: z.literal('text'),
  content: BindableStringSchema,
  fontFamily: BindableStringSchema.default('Helvetica'),
  fontSize: BindableNumberSchema.default(12),
  fontWeight: z.enum(['normal', 'bold']).default('normal'),
  fontStyle: z.enum(['normal', 'italic']).default('normal'),
  color: BindableColorSchema.default('#000000'),
  align: z.enum(['left', 'center', 'right', 'justify']).default('left'),
  lineHeight: z.number().default(1.3),
  letterSpacing: z.number().default(0),
  // Phase 5 — advanced typography (all optional, additive)
  rich: z.boolean().optional(),                                   // interpret content as HTML
  textDecoration: z.enum(['none','underline','line-through','overline']).optional(),
  textTransform: z.enum(['none','uppercase','lowercase','capitalize','small-caps']).optional(),
  textShadow: z.string().optional(),                              // raw CSS
  whiteSpace: z.enum(['normal','nowrap','pre','pre-wrap','pre-line']).optional(),
  hyphens: z.enum(['none','manual','auto']).optional(),
  columns: z.number().int().min(1).max(6).optional(),
  columnGap: z.number().min(0).max(96).optional(),
  paragraphIndent: z.number().min(0).max(96).optional(),          // pt — first-line indent
  paragraphSpacing: z.number().min(0).max(96).optional(),         // pt — gap between <p>
  verticalAlign: z.enum(['top','middle','bottom']).optional(),
  maxLines: z.number().int().min(1).max(50).optional(),           // -webkit-line-clamp
  paddingTop: z.number().min(0).max(96).optional(),
  paddingRight: z.number().min(0).max(96).optional(),
  paddingBottom: z.number().min(0).max(96).optional(),
  paddingLeft: z.number().min(0).max(96).optional(),
  // OpenType
  kerning: z.boolean().optional(),                                // font-kerning
  ligatures: z.enum(['none','common','discretionary','historical','contextual','all']).optional(),
  fontVariantNumeric: z.enum(['normal','lining-nums','oldstyle-nums','tabular-nums','proportional-nums']).optional(),
  fontFeatureSettings: z.string().optional(),                     // raw, advanced override
  fontVariationSettings: z.string().optional(),                   // variable axes
  // Baseline alignment — snap top to baseline grid in pt
  snapToBaseline: z.boolean().optional(),
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
// Phase 4 — Block-level style/decoration (additive, all optional).
export const BlockStyleSchema = z.object({
  // Decoration (rendered as a backdrop behind the block bounds)
  backgroundColor: BindableColorSchema.optional(),
  borderColor: BindableColorSchema.optional(),
  borderWidth: z.number().min(0).max(8).optional(),    // pt
  borderStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
  borderRadius: z.number().min(0).max(48).optional(),  // pt
  shadow: z.enum(['none', 'sm', 'md', 'lg', 'xl']).optional(),
  // Padding inset for the decoration backdrop (pt)
  paddingTop: z.number().min(0).max(96).optional(),
  paddingRight: z.number().min(0).max(96).optional(),
  paddingBottom: z.number().min(0).max(96).optional(),
  paddingLeft: z.number().min(0).max(96).optional(),
  // Transform applied to the rendered group (block + overlays)
  opacity: z.number().min(0).max(1).optional(),
  rotation: z.number().min(-360).max(360).optional(),  // deg
  zIndex: z.number().int().optional(),
}).optional();

// Phase 4 — Repeat from binding (render this block once per item).
export const BlockRepeatSchema = z.object({
  path: z.string().min(1),                      // e.g. "properties" → data.properties[]
  alias: z.string().optional(),                 // default "item" → exposed as data.{alias}
  max: z.number().int().min(1).max(50).optional(),
  spacing: z.number().min(0).max(400).optional(), // pt — vertical offset between repeats
}).optional();

// Phase 4 — Multi-rule visibility (compiles to conditional expression).
export const BlockVisibilitySchema = z.object({
  mode: z.enum(['always', 'when', 'unless']).default('always'),
  expr: z.string().optional(),                   // mirrors `conditional` semantics
}).optional();

export const BlockSchema = z.object({
  id: z.string(),
  type: z.string(),                              // 'disclaimer', 'hero', 'kpi-grid', 'free', ...
  props: z.record(z.unknown()).default({}),      // block-specific
  overlays: z.array(OverlaySchema).default([]),
  conditional: z.string().optional(),
  // Phase 4 additions — all optional, backwards compatible
  style: BlockStyleSchema,
  repeat: BlockRepeatSchema,
  visibility: BlockVisibilitySchema,
  locked: z.boolean().optional(),                // editor-only: prevent selection/drag
  hidden: z.boolean().optional(),                // skip render entirely
  name: z.string().optional(),                   // designer label (Outline)
  // Phase 8 — block-level interactions / outline
  link: LinkSchema,
  bookmark: BookmarkSchema,
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
  // Phase 2 — canvas/print furniture (all optional, additive)
  master: z.boolean().optional(),                   // true → reusable master/template page
  masterPageId: z.string().optional(),              // resolve master backdrop at render
  bleed: z.number().min(0).max(36).optional(),      // pt — print bleed
  safeArea: z.number().min(0).max(72).optional(),   // pt — content safe-area margin
  notes: z.string().optional(),                     // designer notes (not rendered)
  // Phase 5 — baseline grid (typography rhythm)
  baselineGrid: z.object({
    size: z.number().min(4).max(64).default(12),    // pt between baselines
    color: z.string().default('rgba(191,155,80,0.20)'),
    show: z.boolean().default(false),
    offset: z.number().min(0).max(72).default(0),
  }).optional(),
  // Phase 9 — page master + numbering overrides per page
  pageMasterId: z.string().optional(),
  numbering: z.object({
    startAt: z.number().int().min(1).optional(),
    restart: z.boolean().optional(),                  // restart counter on this page
    format: z.enum(['decimal','lower-roman','upper-roman','lower-alpha','upper-alpha']).optional(),
    prefix: BindableStringSchema.optional(),
    suffix: BindableStringSchema.optional(),
    hide: z.boolean().optional(),                     // suppress page number for this page
  }).optional(),
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
  // Phase 2 — canvas preferences + saved selections
  canvas: z.object({
    gridSize: z.number().min(2).max(64).default(8),
    showGrid: z.boolean().default(false),
    showRulers: z.boolean().default(true),
    snapToGrid: z.boolean().default(false),
    showBleed: z.boolean().default(false),
    showSafeArea: z.boolean().default(false),
    showBaselineGrid: z.boolean().default(false),
  }).default({}).optional(),
  savedSelections: z.record(z.array(z.string())).optional(),
  // Phase 8 — document metadata, embedded as PDF info dictionary.
  meta: z.object({
    title: BindableStringSchema.optional(),
    author: BindableStringSchema.optional(),
    subject: BindableStringSchema.optional(),
    keywords: BindableStringSchema.optional(),
    lang: z.string().optional(),                  // BCP 47, e.g. "en-AU"
    creator: BindableStringSchema.optional(),
  }).optional(),
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
