import type { Block } from '../templateSchema';
import { resolveBindable, resolveBindableColor } from '../bindingResolver';
import { esc, type HtmlBlockContext } from './_shared.html';

export function renderTocHtml(block: Block, ctx: HtmlBlockContext): string {
  const p = block.props as Record<string, unknown>;
  const x = Number(p.x ?? 24);
  const y = Number(p.y ?? 80);
  const w = Number(p.width ?? ctx.page.width - 48);
  const title = resolveBindable(p.title ?? 'Contents', ctx);
  const titleSize = Number(p.titleSize ?? 22);
  const size = Number(p.size ?? 11);
  const lh = Number(p.lineHeight ?? 18);
  const titleColor = resolveBindableColor(p.titleColor ?? 'token:primary', ctx, '#BF9B50');
  const color = resolveBindableColor(p.color ?? 'token:text', ctx, '#1A1A1A');
  const idxColor = resolveBindableColor(p.indexColor ?? 'token:muted', ctx, '#888');
  const pages = ctx.pages ?? [];

  const rows = pages.map((pg, i) =>
    `<div style="display:flex;justify-content:space-between;line-height:${lh}pt;font-size:${size}pt;color:${color};">
      <span>${i + 1}. ${esc(pg.name || `Page ${i + 1}`)}</span>
      <span style="color:${idxColor};">${i + 1}</span>
    </div>`,
  ).join('');

  return `<div style="position:absolute;left:${x}pt;top:${y}pt;width:${w}pt;">
    ${title ? `<div style="color:${titleColor};font-weight:700;font-size:${titleSize}pt;margin-bottom:${titleSize * 0.6}pt;font-family:var(--font-heading, Helvetica);">${esc(title)}</div>` : ''}
    ${rows}
  </div>`;
}
