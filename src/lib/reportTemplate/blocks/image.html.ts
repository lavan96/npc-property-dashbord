import type { Block } from '../templateSchema';
import { resolveBindable, resolveBindableColor } from '../bindingResolver';
import { esc, absBoxStyle, type HtmlBlockContext } from './_shared.html';

export function renderImageBlockHtml(block: Block, ctx: HtmlBlockContext): string {
  const p = block.props as Record<string, unknown>;
  const src = resolveBindable(p.src, ctx);
  const caption = resolveBindable(p.caption, ctx);
  const fit = (p.fit as string) || 'cover';
  const capColor = resolveBindableColor(p.captionColor ?? 'token:muted', ctx, '#666');
  const style = absBoxStyle(p, { x: 24, y: 24, w: ctx.page.width - 48, h: 220 });
  const imgH = caption ? 'calc(100% - 14pt)' : '100%';
  const inner = src
    ? `<img src="${esc(src)}" style="width:100%;height:${imgH};object-fit:${fit};"/>`
    : `<div style="width:100%;height:${imgH};border:1pt solid #ddd;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:10pt;">No image</div>`;
  return `<div style="${style}">
    ${inner}
    ${caption ? `<div style="font-style:italic;font-size:8pt;color:${capColor};margin-top:2pt;">${esc(caption)}</div>` : ''}
  </div>`;
}
