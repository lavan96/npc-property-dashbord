import type { Block } from '../templateSchema';
import { resolveBindable, resolveBindableColor } from '../bindingResolver';
import { esc, type HtmlBlockContext } from './_shared.html';

export function renderHeroHtml(block: Block, ctx: HtmlBlockContext): string {
  const p = block.props as Record<string, unknown>;
  const x = Number(p.x ?? 0);
  const y = Number(p.y ?? 0);
  const w = Number(p.width ?? ctx.page.width);
  const h = Number(p.height ?? Math.min(280, ctx.page.height * 0.45));
  const align = (p.align as string) || 'left';
  const imageUrl = resolveBindable(p.imageUrl, ctx);
  const tint = p.tint ? resolveBindableColor(p.tint, ctx, 'transparent') : null;
  const titleColor = resolveBindableColor(p.titleColor ?? 'token:text', ctx, '#FFFFFF');
  const subColor = resolveBindableColor(p.subtitleColor ?? 'token:primary', ctx, '#BF9B50');
  const title = resolveBindable(p.title, ctx);
  const subtitle = resolveBindable(p.subtitle, ctx);
  const titleSize = Number(p.titleSize ?? 32);
  const subSize = Number(p.subtitleSize ?? 14);

  const bgImg = imageUrl
    ? `<div style="position:absolute;inset:0;background:url('${esc(imageUrl)}') center/cover no-repeat;"></div>`
    : '';
  const tintLayer = tint
    ? `<div style="position:absolute;inset:0;background:${tint};opacity:0.55;"></div>`
    : '';
  return `<div style="position:absolute;left:${x}pt;top:${y}pt;width:${w}pt;height:${h}pt;overflow:hidden;">
    ${bgImg}${tintLayer}
    <div style="position:absolute;left:24pt;right:24pt;bottom:24pt;text-align:${align};">
      ${title ? `<div style="color:${titleColor};font-weight:700;font-size:${titleSize}pt;font-family:var(--font-heading, Helvetica);line-height:1.1;">${esc(title)}</div>` : ''}
      ${subtitle ? `<div style="color:${subColor};font-size:${subSize}pt;margin-top:6pt;">${esc(subtitle)}</div>` : ''}
    </div>
  </div>`;
}
