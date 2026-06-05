import type { Block } from '../templateSchema';
import { resolveBindable, resolveBindableColor } from '../bindingResolver';
import { absBoxStyle, esc, type HtmlBlockContext } from './_shared.html';

export function renderTextBlockHtml(block: Block, ctx: HtmlBlockContext): string {
  const p = block.props as Record<string, unknown>;
  const heading = resolveBindable(p.heading, ctx);
  const body = resolveBindable(p.body, ctx);
  const headingColor = resolveBindableColor(p.headingColor ?? 'token:primary', ctx, '#BF9B50');
  const color = resolveBindableColor(p.color ?? 'token:text', ctx, '#1A1A1A');
  const headingSize = Number(p.headingSize ?? 16);
  const bodySize = Number(p.bodySize ?? 10);
  const style = absBoxStyle(p, { x: 24, y: 24, w: ctx.page.width - 48 });
  return `<div style="${style}">
    ${heading ? `<h2 style="color:${headingColor};font-size:${headingSize}pt;font-weight:700;margin:0 0 8pt;font-family:var(--font-heading, Helvetica);">${esc(heading)}</h2>` : ''}
    ${body ? `<div style="color:${color};font-size:${bodySize}pt;line-height:1.4;white-space:pre-wrap;font-family:var(--font-body, Helvetica);">${esc(body)}</div>` : ''}
  </div>`;
}
