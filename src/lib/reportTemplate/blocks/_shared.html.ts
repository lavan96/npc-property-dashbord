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
  resolveTokenReference,
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

/** Compose font-feature-settings from individual options. */
function buildFontFeatures(o: any): string {
  const explicit = String(o.fontFeatureSettings ?? '').trim();
  if (explicit) return explicit;
  const parts: string[] = [];
  if (o.ligatures && o.ligatures !== 'none') {
    if (o.ligatures === 'common' || o.ligatures === 'all') parts.push(`"liga" 1`, `"clig" 1`);
    if (o.ligatures === 'discretionary' || o.ligatures === 'all') parts.push(`"dlig" 1`);
    if (o.ligatures === 'historical' || o.ligatures === 'all') parts.push(`"hlig" 1`);
    if (o.ligatures === 'contextual' || o.ligatures === 'all') parts.push(`"calt" 1`);
  } else if (o.ligatures === 'none') {
    parts.push(`"liga" 0`, `"clig" 0`, `"dlig" 0`);
  }
  return parts.join(', ');
}

/** Render an overlay (text / image / shape) as an absolute-positioned HTML element. */
export function renderOverlay(overlay: Overlay, ctx: ResolveContext): string {
  if (!evalConditional(overlay.conditional, ctx)) return '';
  const base = `position:absolute;left:${overlay.x}pt;top:${overlay.y}pt;width:${overlay.width}pt;height:${overlay.height}pt;opacity:${overlay.opacity};transform:rotate(${overlay.rotation}deg);transform-origin:top left;`;
  switch (overlay.type) {
    case 'text': {
      const o = overlay as any;
      const text = resolveBindable(o.content, ctx);
      if (!text && !o.rich) return '';
      const size = resolveBindableNumber(o.fontSize, ctx, 12);
      const color = resolveBindableColor(o.color, ctx, '#000000');
      const family = resolveTokenReference(o.fontFamily, ctx) || 'Helvetica';
      const pt = Number(o.paddingTop ?? 0);
      const pr = Number(o.paddingRight ?? 0);
      const pb = Number(o.paddingBottom ?? 0);
      const pl = Number(o.paddingLeft ?? 0);
      const valign = o.verticalAlign === 'middle' ? 'center'
        : o.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start';
      const features = buildFontFeatures(o);
      const decls: string[] = [
        `color:${color}`,
        `font-family:${esc(family)}`,
        `font-size:${size}pt`,
        `font-weight:${o.fontWeight}`,
        `font-style:${o.fontStyle}`,
        `text-align:${o.align}`,
        `line-height:${o.lineHeight}`,
        `letter-spacing:${o.letterSpacing}pt`,
        `padding:${pt}pt ${pr}pt ${pb}pt ${pl}pt`,
        `display:flex`,
        `flex-direction:column`,
        `justify-content:${valign}`,
      ];
      if (o.textDecoration) decls.push(`text-decoration:${o.textDecoration}`);
      if (o.textTransform === 'small-caps') decls.push(`font-variant-caps:small-caps`);
      else if (o.textTransform) decls.push(`text-transform:${o.textTransform}`);
      if (o.textShadow) decls.push(`text-shadow:${o.textShadow}`);
      if (o.whiteSpace) decls.push(`white-space:${o.whiteSpace}`);
      if (o.hyphens) decls.push(`hyphens:${o.hyphens}`, `-webkit-hyphens:${o.hyphens}`);
      if (o.columns && o.columns > 1) {
        decls.push(`columns:${o.columns}`);
        if (o.columnGap != null) decls.push(`column-gap:${o.columnGap}pt`);
      }
      if (o.kerning === false) decls.push(`font-kerning:none`);
      else if (o.kerning === true) decls.push(`font-kerning:normal`);
      if (o.fontVariantNumeric && o.fontVariantNumeric !== 'normal') decls.push(`font-variant-numeric:${o.fontVariantNumeric}`);
      if (features) decls.push(`font-feature-settings:${features}`);
      if (o.fontVariationSettings) decls.push(`font-variation-settings:${o.fontVariationSettings}`);
      if (o.maxLines && !o.columns) {
        decls.push(
          `display:-webkit-box`,
          `-webkit-line-clamp:${o.maxLines}`,
          `-webkit-box-orient:vertical`,
          `overflow:hidden`,
        );
      }
      const style = `${base}${decls.join(';')};`;
      // Rich text: render content raw (designer-authored HTML).
      // Plain: escape, honour paragraph spacing + first-line indent if any text contains \n.
      let inner: string;
      if (o.rich) {
        inner = String(text ?? '');
      } else {
        const paras = String(text).split(/\n{2,}/);
        if (paras.length > 1 || o.paragraphIndent || o.paragraphSpacing) {
          const gap = Number(o.paragraphSpacing ?? 0);
          const indent = Number(o.paragraphIndent ?? 0);
          inner = paras.map((p, i) => {
            const mt = i === 0 ? 0 : gap;
            return `<p style="margin:${mt}pt 0 0 0;text-indent:${indent}pt;">${esc(p).replace(/\n/g,'<br/>')}</p>`;
          }).join('');
        } else {
          inner = esc(text).replace(/\n/g, '<br/>');
        }
      }
      return `<div style="${style}">${inner}</div>`;
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
