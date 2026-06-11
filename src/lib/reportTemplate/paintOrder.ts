/**
 * paintOrder — single source of truth for content stacking heuristics.
 *
 * The editor canvas (`EditorialCanvas`), the production HTML/WeasyPrint
 * renderer (`htmlRenderer`) and the legacy jsPDF renderer (`pdfRenderer`)
 * must stack overlays and blocks identically, otherwise what you see in the
 * editor is not what exports. These heuristics used to be copy-pasted into
 * each surface; keep them here and import — never re-implement.
 *
 * Stacking rules (bottom → top) when no explicit `zIndex` is set:
 *   backdrop shapes (area > 120k pt², no stroke)
 *   < other shapes < images < unknown types < tables < text / textOnPath
 *
 * An explicit `zIndex` always wins, and the original array index acts as a
 * stable tie-breaker so equal-priority items keep their authored order.
 */

/** Minimal structural shape needed to rank an overlay. */
export interface PaintableOverlay {
  type?: string;
  zIndex?: number | null;
  width?: number | null;
  height?: number | null;
  strokeWidth?: number | null;
}

/** Minimal structural shape needed to rank a block. */
export interface PaintableBlock {
  type?: string;
  style?: { zIndex?: number | null } | null;
  overlays?: PaintableOverlay[] | null;
}

/** Sort key for one overlay within its block (lower paints first). */
export function overlayPaintOrder(overlay: PaintableOverlay, index: number): number {
  const z = Number(overlay?.zIndex);
  if (Number.isFinite(z)) return z * 1000 + index;
  const area = Math.max(0, Number(overlay?.width) || 0) * Math.max(0, Number(overlay?.height) || 0);
  const isBackdropShape = overlay?.type === 'shape' && area > 120_000 && !overlay?.strokeWidth;
  if (isBackdropShape) return -1_000_000 + index;
  if (overlay?.type === 'shape') return -100_000 + index;
  if (overlay?.type === 'image') return -10_000 + index;
  if (overlay?.type === 'table') return 100_000 + index;
  if (overlay?.type === 'text' || overlay?.type === 'textOnPath') return 200_000 + index;
  return index;
}

/** Stable-sorts overlays into paint order (bottom first). */
export function sortOverlaysForPaint<T extends PaintableOverlay>(overlays: T[] = []): T[] {
  return overlays
    .map((overlay, index) => ({ overlay, order: overlayPaintOrder(overlay, index) }))
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.overlay);
}

/** Sort key for one block within its page (lower paints first). */
export function blockPaintOrder(block: PaintableBlock, index: number): number {
  const z = Number(block?.style?.zIndex);
  if (Number.isFinite(z)) return z * 1_000_000 + index;
  const overlays = Array.isArray(block?.overlays) ? block.overlays : [];
  if (block?.type === 'free' && overlays.length) {
    return Math.min(...overlays.map((overlay, overlayIndex) => overlayPaintOrder(overlay, overlayIndex))) + index / 10_000;
  }
  return index;
}

/** Stable-sorts blocks into paint order (bottom first). */
export function sortBlocksForPaint<T extends PaintableBlock>(blocks: T[] = []): T[] {
  return blocks
    .map((block, index) => ({ block, order: blockPaintOrder(block, index) }))
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.block);
}
