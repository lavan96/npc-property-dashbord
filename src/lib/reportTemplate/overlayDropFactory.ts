/**
 * Drag-and-drop "drop to place" helpers for the V2 canvas (rehaul Phase 1).
 *
 * Free-placed elements are overlays — which both renderers already position
 * absolutely — so dropping a palette item onto the canvas just creates an
 * overlay of the matching kind at the drop point. Pure + unit-tested; the
 * defaults mirror the palette in `PagesPanel.tsx`.
 */
import { type Overlay } from './templateSchema';

export interface DropPoint {
  x: number;
  y: number;
}

/** Overlay kinds that can be dragged from the palette onto the canvas. */
export type DraggableOverlayKind = 'text' | 'rect' | 'image';

/** MIME-ish key used on the drag DataTransfer. */
export const OVERLAY_DRAG_MIME = 'application/x-tpl-overlay-kind';

const defaultMakeId = (): string => crypto.randomUUID();

/**
 * Convert a screen point (clientX/clientY) to page-point coordinates on the
 * canvas stage. Mirrors `EditorialCanvas.stagePoint`: page point =
 * (client - stageRect origin) / zoom. Clamped to the page origin and rounded.
 */
export function screenToPagePoint(args: {
  clientX: number;
  clientY: number;
  rect: { left: number; top: number };
  zoom: number;
}): DropPoint {
  const { clientX, clientY, rect } = args;
  const zoom = args.zoom || 1;
  return {
    x: Math.max(0, Math.round((clientX - rect.left) / zoom)),
    y: Math.max(0, Math.round((clientY - rect.top) / zoom)),
  };
}

const KIND_BY_OVERLAY_TYPE: Record<string, DraggableOverlayKind> = {
  text: 'text',
  shape: 'rect',
  image: 'image',
};

/** Map a palette overlay's `type` to a draggable kind, or null if not draggable. */
export function draggableKindForOverlayType(type: string | undefined | null): DraggableOverlayKind | null {
  if (!type) return null;
  return KIND_BY_OVERLAY_TYPE[type] ?? null;
}

const DEFAULT_SIZE: Record<DraggableOverlayKind, { width: number; height: number }> = {
  text: { width: 300, height: 40 },
  rect: { width: 200, height: 120 },
  image: { width: 200, height: 140 },
};

/**
 * Build a new overlay of `kind`, centred on the drop point (so it lands "under
 * the cursor"), with the same defaults the click-to-insert palette uses.
 */
export function makeOverlayForKind(
  kind: DraggableOverlayKind,
  point: DropPoint,
  makeId: () => string = defaultMakeId,
): Overlay {
  const { width, height } = DEFAULT_SIZE[kind];
  const x = Math.max(0, Math.round(point.x - width / 2));
  const y = Math.max(0, Math.round(point.y - height / 2));
  const base = { id: makeId(), x, y, width, height, rotation: 0, opacity: 1 };

  if (kind === 'rect') {
    return { ...base, type: 'shape', shape: 'rect', fill: 'token:primary', strokeWidth: 0, borderRadius: 6 } as unknown as Overlay;
  }
  if (kind === 'image') {
    return { ...base, type: 'image', src: '{{property.imageUrl}}', fit: 'cover' } as unknown as Overlay;
  }
  return {
    ...base,
    type: 'text',
    content: 'New text',
    fontFamily: 'Helvetica',
    fontSize: 18,
    fontWeight: 'normal',
    fontStyle: 'normal',
    color: '#000000',
    align: 'left',
    lineHeight: 1.3,
    letterSpacing: 0,
  } as unknown as Overlay;
}
