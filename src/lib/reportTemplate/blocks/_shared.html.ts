/**
 * Shared helpers for the HTML block renderers.
 * Mirrors the jsPDF `_shared.ts` contract but emits HTML strings.
 */
import type { Block, Overlay } from '../templateSchema';
import {
  type ResolveContext,
  resolveBindable,
  resolveBindableColor,
  resolveBindableNumber,
  evalConditional,
} from '../bindingResolver';

export interface HtmlBlockContext extends ResolveContext {
  page: { width: number; height: number };
  pageIndex: number;
  pages?: Array<{ id: string; name: string }>;
  slots?: Record<string, Block>;
}

export type HtmlBlockRenderer = (block: Block, ctx: HtmlBlockContext) => string;

export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Render the absolute-positioning wrapper for blocks that use x/y/width/height. */
export function absBoxStyle(p: Record<string, unknown>, fallback: { x?: number; y?: number; w?: number; h?: number } = {}): string {
  const x = Number(p.x ?? fallback.x ?? 0);
  const y = Number(p.y ?? fallback.y ?? 0);
  const w = p.width != null ? `width:${Number(p.width)}pt;` : fallback.w != null ? `width:${fallback.w}pt;` : '';
  const h = p.height != null ? `height:${Number(p.height)}pt;` : fallback.h != null ? `height:${fallback.h}pt;` : '';
  return `position:absolute;left:${x}pt;top:${y}pt;${w}${h}`;
}

/** Render an overlay (text / image / shape) as an absolute-positioned HTML element. */
export function renderOverlay(overlay: Overlay, ctx: ResolveContext): string {
  if (!evalConditional(overlay.conditional, ctx)) return '';
  const base = `position:absolute;left:${overlay.x}pt;top:${overlay.y}pt;width:${overlay.width}pt;height:${overlay.height}pt;opacity:${overlay.opacity};transform:rotate(${overlay.rotation}deg);transform-origin:top left;`;
  switch (overlay.type) {
    case 'text': {
      const text = resolveBindable(overlay.content, ctx);
      if (!text) return '';
      const size = resolveBindableNumber(overlay.fontSize, ctx, 12);
      const color = resolveBindableColor(overlay.color, ctx, '#000000');
      const family = resolveBindable(overlay.fontFamily, ctx) || 'Helvetica';
      const style = `${base}color:${color};font-family:${esc(family)};font-size:${size}pt;font-weight:${overlay.fontWeight};font-style:${overlay.fontStyle};text-align:${overlay.align};line-height:${overlay.lineHeight};letter-spacing:${overlay.letterSpacing}pt;`;
      return `<div style="${style}">${esc(text).replace(/\n/g, '<br/>')}</div>`;
    }
    case 'image': {
      const src = resolveBindable(overlay.src, ctx);
      if (!src) return '';
      const fit = overlay.fit === 'fill' ? 'fill' : overlay.fit;
      return `<img src="${esc(src)}" style="${base}object-fit:${fit};"/>`;
    }
    case 'shape': {
      const fill = overlay.fill ? resolveBindableColor(overlay.fill, ctx, 'transparent') : 'transparent';
      const stroke = overlay.stroke ? resolveBindableColor(overlay.stroke, ctx, 'transparent') : 'transparent';
      const sw = overlay.strokeWidth || 0;
      const radius = overlay.shape === 'ellipse' ? '50%' : `${overlay.borderRadius || 0}pt`;
      if (overlay.shape === 'line') {
        return `<div style="${base}border-top:${sw}pt solid ${stroke};"></div>`;
      }
      return `<div style="${base}background:${fill};border:${sw}pt solid ${stroke};border-radius:${radius};"></div>`;
    }
  }
  return '';
}
