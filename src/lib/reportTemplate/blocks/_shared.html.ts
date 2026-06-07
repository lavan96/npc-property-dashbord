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

/** Resolve a paragraph style (with `basedOn` inheritance, max depth 4). */
function resolveParagraphStyle(ctx: ResolveContext, ref?: string): Record<string, any> {
  if (!ref) return {};
  const tokens: any = (ctx as any).tokens ?? {};
  const styles: Record<string, any> = tokens.paragraphStyles ?? {};
  const seen = new Set<string>();
  const acc: Record<string, any> = {};
  let cur: any = styles[ref];
  let depth = 0;
  while (cur && depth < 4 && !seen.has(cur.id ?? '')) {
    seen.add(cur.id ?? '');
    for (const [k, v] of Object.entries(cur)) {
      if (acc[k] === undefined && v !== undefined && k !== 'id' && k !== 'name' && k !== 'basedOn') acc[k] = v;
    }
    cur = cur.basedOn ? styles[cur.basedOn] : null;
    depth += 1;
  }
  return acc;
}

function fmtCell(value: any, format?: string): string {
  if (value == null) return '';
  switch (format) {
    case 'currency': {
      const n = Number(value); if (!Number.isFinite(n)) return String(value);
      return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
    }
    case 'number': { const n = Number(value); return Number.isFinite(n) ? new Intl.NumberFormat('en-AU').format(n) : String(value); }
    case 'percent': { const n = Number(value); return Number.isFinite(n) ? `${(n * (n <= 1 ? 100 : 1)).toFixed(1)}%` : String(value); }
    case 'date': {
      const d = new Date(value); return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-AU');
    }
    default: return String(value);
  }
}

/** Render an overlay (text / image / shape / textOnPath / table) as an absolute-positioned HTML element. */
export function renderOverlay(overlay: Overlay, ctx: ResolveContext): string {
  if (!evalConditional(overlay.conditional, ctx)) return '';
  const base = `position:absolute;left:${overlay.x}pt;top:${overlay.y}pt;width:${overlay.width}pt;height:${overlay.height}pt;opacity:${overlay.opacity};transform:rotate(${overlay.rotation}deg);transform-origin:top left;`;
  switch (overlay.type) {
    case 'text': {
      const raw = overlay as any;
      const ps = resolveParagraphStyle(ctx, raw.styleRef);
      // Overlay-level wins on conflict; paragraph style fills the gap.
      const o: any = { ...ps, ...Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v !== null && v !== '')) };
      // Always restore base fields the editor sets even when ps had a value
      for (const k of ['type','id','x','y','width','height','rotation','opacity','content']) o[k] = raw[k];
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
        `font-weight:${o.fontWeight ?? 'normal'}`,
        `font-style:${o.fontStyle ?? 'normal'}`,
        `text-align:${o.align ?? 'left'}`,
        `line-height:${o.lineHeight ?? 1.3}`,
        `letter-spacing:${o.letterSpacing ?? 0}pt`,
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
      // Drop cap — render the first non-whitespace character as a floated span.
      const dc = o.dropCap;
      const renderWithDropCap = (s: string): string => {
        if (!dc?.enabled) return esc(s).replace(/\n/g, '<br/>');
        const match = /^(\s*)(\S)([\s\S]*)$/.exec(s);
        if (!match) return esc(s).replace(/\n/g, '<br/>');
        const lines = Math.max(2, Math.min(8, Number(dc.lines ?? 3)));
        const dcSize = Number(size) * lines * 0.95;
        const dcColor = dc.color ? resolveBindableColor(dc.color, ctx, color) : color;
        const dcFamily = dc.fontFamily ? esc(dc.fontFamily) : esc(family);
        const dcWeight = dc.fontWeight ?? 'bold';
        const dcMr = Number(dc.marginRight ?? 6);
        const dcStyle = `float:left;font-size:${dcSize}pt;line-height:${lines * 0.95};font-family:${dcFamily};font-weight:${dcWeight};color:${dcColor};padding-right:${dcMr}pt;margin-top:-2pt;`;
        return `${esc(match[1])}<span style="${dcStyle}">${esc(match[2])}</span>${esc(match[3]).replace(/\n/g,'<br/>')}`;
      };
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
            const body = i === 0 ? renderWithDropCap(p) : esc(p).replace(/\n/g,'<br/>');
            return `<p style="margin:${mt}pt 0 0 0;text-indent:${indent}pt;">${body}</p>`;
          }).join('');
        } else {
          inner = renderWithDropCap(String(text));
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
    case 'textOnPath': {
      const o: any = overlay;
      const text = resolveBindable(o.content, ctx);
      if (!text) return '';
      const size = resolveBindableNumber(o.fontSize, ctx, 18);
      const color = resolveBindableColor(o.color, ctx, '#000000');
      const family = resolveTokenReference(o.fontFamily, ctx) || 'Helvetica';
      const w = overlay.width, h = overlay.height;
      const curvature = Math.max(-1, Math.min(1, Number(o.curvature ?? 0.5)));
      let d = '';
      switch (o.curve) {
        case 'circle': {
          const r = Math.min(w, h) / 2 - 1;
          const cx = w / 2, cy = h / 2;
          // Closed circle path (sweep clockwise)
          d = `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy}`;
          break;
        }
        case 'wave': {
          const amp = (h / 4) * Math.abs(curvature || 0.5) * (curvature < 0 ? -1 : 1);
          d = `M 0 ${h / 2} Q ${w / 4} ${h / 2 - amp} ${w / 2} ${h / 2} T ${w} ${h / 2}`;
          break;
        }
        case 'arc-down': {
          const sag = (h * Math.abs(curvature)) || h * 0.5;
          d = `M 0 ${h / 2 - sag / 2} Q ${w / 2} ${h / 2 + sag} ${w} ${h / 2 - sag / 2}`;
          break;
        }
        case 'arc-up':
        default: {
          const sag = (h * Math.abs(curvature)) || h * 0.5;
          d = `M 0 ${h / 2 + sag / 2} Q ${w / 2} ${h / 2 - sag} ${w} ${h / 2 + sag / 2}`;
          break;
        }
      }
      const pathId = `txp-${overlay.id}`;
      const offset = Math.max(0, Math.min(100, Number(o.startOffset ?? 0)));
      return `<svg xmlns="http://www.w3.org/2000/svg" style="${base}overflow:visible;" viewBox="0 0 ${w} ${h}" width="${w}pt" height="${h}pt"><defs><path id="${pathId}" d="${d}" fill="none"/></defs><text fill="${color}" font-family="${esc(family)}" font-size="${size}" font-weight="${o.fontWeight ?? 'normal'}" letter-spacing="${o.letterSpacing ?? 0}"><textPath href="#${pathId}" startOffset="${offset}%">${esc(text)}</textPath></text></svg>`;
    }
    case 'table': {
      const o: any = overlay;
      const cols: Array<any> = Array.isArray(o.columns) ? o.columns : [];
      // Resolve data binding → array of objects, otherwise fall back to static rows.
      let rows: Array<Record<string, any>> = [];
      if (o.data) {
        const arr = String(o.data).split('.').reduce((acc: any, k: string) => acc?.[k.trim()], ctx.data);
        if (Array.isArray(arr)) {
          rows = arr.map((r: any) => (r && typeof r === 'object' ? r : { value: r }));
        }
      } else if (Array.isArray(o.rows)) {
        rows = o.rows.map((r: any[]) => Object.fromEntries(cols.map((c, i) => [c.key || `col${i}`, r?.[i] ?? ''])));
      }
      if (o.maxRows) rows = rows.slice(0, o.maxRows);
      const family = o.fontFamily ? esc(resolveTokenReference(o.fontFamily, ctx) || 'Helvetica') : 'inherit';
      const headerBg = o.headerBg ? resolveBindableColor(o.headerBg, ctx, '#111') : '#111';
      const headerColor = o.headerColor ? resolveBindableColor(o.headerColor, ctx, '#fff') : '#fff';
      const rowBg = o.rowBg ? resolveBindableColor(o.rowBg, ctx, 'transparent') : 'transparent';
      const altRowBg = o.altRowBg ? resolveBindableColor(o.altRowBg, ctx, '') : '';
      const rowColor = o.rowColor ? resolveBindableColor(o.rowColor, ctx, '#111') : '#111';
      const borderColor = o.borderColor ? resolveBindableColor(o.borderColor, ctx, '#ddd') : '#ddd';
      const bw = Number(o.borderWidth ?? 0.5);
      const cp = Number(o.cellPadding ?? 6);
      const cellStyles: Array<any> = Array.isArray(o.cellStyles) ? o.cellStyles : [];
      const styleFor = (row: number, col: number) =>
        cellStyles.find((s) => Number(s.row) === row && Number(s.col) === col) ?? {};
      const colGroup = cols.map((c) => c.width != null ? `<col style="width:${Number(c.width)}pt"/>` : `<col/>`).join('');
      const headerCells = cols.map((c, i) => {
        const s = styleFor(-1, i);
        const align = s.align ?? c.align ?? 'left';
        const bg = s.bg ?? headerBg;
        const fg = s.color ?? headerColor;
        const fw = s.fontWeight ?? o.headerFontWeight ?? 'bold';
        return `<th style="padding:${cp}pt;text-align:${align};background:${bg};color:${fg};font-weight:${fw};border:${bw}pt solid ${borderColor};height:${Number(o.headerHeight ?? 22)}pt">${esc(c.label ?? c.key)}</th>`;
      }).join('');
      const bodyRows = rows.map((r, ri) => {
        const baseRowBg = altRowBg && ri % 2 === 1 ? altRowBg : rowBg;
        const tds = cols.map((c, ci) => {
          const s = styleFor(ri, ci);
          const align = s.align ?? c.align ?? 'left';
          const bg = s.bg ?? baseRowBg;
          const fg = s.color ?? rowColor;
          const fw = s.fontWeight ?? 'normal';
          let raw: any = r[c.key];
          if (typeof raw === 'string') raw = resolveBindable(raw, ctx);
          const val = fmtCell(raw, c.format);
          return `<td style="padding:${cp}pt;text-align:${align};background:${bg};color:${fg};font-weight:${fw};border:${bw}pt solid ${borderColor};height:${Number(o.rowHeight ?? 20)}pt">${esc(val)}</td>`;
        }).join('');
        return `<tr>${tds}</tr>`;
      }).join('');
      return `<div style="${base}overflow:hidden;"><table style="width:100%;border-collapse:collapse;font-family:${family};font-size:${Number(o.fontSize ?? 10)}pt;table-layout:fixed;">${colGroup ? `<colgroup>${colGroup}</colgroup>` : ''}${o.showHeader !== false ? `<thead><tr>${headerCells}</tr></thead>` : ''}<tbody>${bodyRows}</tbody></table></div>`;
    }
  }
  return '';
}
