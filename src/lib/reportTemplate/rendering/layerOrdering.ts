/**
 * layerOrdering — a coarse, cross-surface render-layer taxonomy.
 *
 * Phase 7D fidelity hardening. `paintOrder.ts` already ranks individual overlays
 * and blocks for the WYSIWYG/export surfaces; this module sits one level up and
 * answers "what *kind* of layer is this, and how high should it sit?" so the
 * editor, the renderer, and the Visual QA capture can agree on a stable
 * bottom→top stack:
 *
 *   page_background < source_raster < image < shape < table < text < editor_control
 *
 * `unknown` sits just below text so unclassified content never hides text or
 * editor chrome. `editor_control` is intentionally the highest rank and must be
 * excluded from any exported/captured render (selection handles, guides, etc.).
 *
 * Pure and dependency-free so any surface can import it.
 */

export type RenderLayerKind =
  | 'page_background'
  | 'source_raster'
  | 'image'
  | 'shape'
  | 'table'
  | 'text'
  | 'editor_control'
  | 'unknown';

const LAYER_RANKS: Record<RenderLayerKind, number> = {
  page_background: 0,
  source_raster: 10,
  image: 20,
  shape: 30,
  table: 40,
  text: 50,
  unknown: 45,
  editor_control: 60,
};

/** Lower rank paints first (further back). Unrecognised kinds fall back to `unknown`. */
export function getLayerRank(kind: RenderLayerKind): number {
  return LAYER_RANKS[kind] ?? LAYER_RANKS.unknown;
}

/**
 * Best-effort classification of a schema block/overlay into a render-layer kind.
 * Defensive against arbitrary input — never throws, defaults to `unknown`.
 */
export function inferBlockLayerKind(block: unknown): RenderLayerKind {
  if (!block || typeof block !== 'object') return 'unknown';
  const b = block as Record<string, unknown>;

  // Explicit hints win.
  const explicit = String((b.layerKind ?? b.renderLayerKind ?? '')).toLowerCase();
  if (explicit && explicit in LAYER_RANKS) return explicit as RenderLayerKind;

  // PDF-import source page rasters are tagged structurally, not by `type`.
  if (b.sourceRasterRef || b.isSourceRaster === true) return 'source_raster';

  const type = String((b.type ?? '')).toLowerCase();
  switch (type) {
    case 'page_background':
    case 'background':
      return 'page_background';
    case 'source_raster':
    case 'raster':
      return 'source_raster';
    case 'image':
    case 'img':
      return 'image';
    case 'shape':
    case 'rect':
    case 'rectangle':
    case 'line':
    case 'ellipse':
    case 'circle':
      return 'shape';
    case 'table':
      return 'table';
    case 'text':
    case 'textonpath':
    case 'richtext':
      return 'text';
    case 'editor_control':
    case 'control':
    case 'handle':
    case 'guide':
      return 'editor_control';
    default:
      return 'unknown';
  }
}

/**
 * Stable-sort blocks bottom→top by inferred layer kind. Equal-rank blocks keep
 * their authored order (stable), so this only re-stacks across layer classes and
 * never reshuffles content that is already at the same level.
 */
export function sortBlocksForRender<T>(blocks: T[]): T[] {
  return blocks
    .map((block, index) => ({ block, index, rank: getLayerRank(inferBlockLayerKind(block)) }))
    .sort((a, b) => (a.rank - b.rank) || (a.index - b.index))
    .map((entry) => entry.block);
}
