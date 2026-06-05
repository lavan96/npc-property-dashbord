import type { Block } from '../templateSchema';
import { resolveBindable, resolveBindableColor } from '../bindingResolver';
import { esc, type HtmlBlockContext } from './_shared.html';

export function renderCoverHtml(block: Block, ctx: HtmlBlockContext): string {
  const p = block.props as Record<string, unknown>;
  const bg = resolveBindableColor(p.bg ?? 'token:bg', ctx, '#0D0D0D');
  const accent = resolveBindableColor(p.accent ?? 'token:primary', ctx, '#BF9B50');
  const text = resolveBindableColor(p.color ?? '#FFFFFF', ctx, '#FFFFFF');
  const imageUrl = resolveBindable(p.imageUrl, ctx);
  const eyebrow = resolveBindable(p.eyebrow, ctx);
  const title = resolveBindable(p.title, ctx);
  const subtitle = resolveBindable(p.subtitle, ctx);
  const footnote = resolveBindable(p.footnote, ctx);
  const titleSize = Number(p.titleSize ?? 40);

  const bgImage = imageUrl
    ? `<div style="position:absolute;inset:0;background:url('${esc(imageUrl)}') center/cover no-repeat;"></div>
       <div style="position:absolute;inset:0;background:${bg};opacity:0.55;"></div>`
    : '';

  return `
  <div class="block-cover" style="position:absolute;inset:0;background:${bg};color:${text};">
    ${bgImage}
    <div style="position:absolute;left:48pt;top:55%;right:48pt;">
      <div style="width:60pt;height:3pt;background:${accent};margin-bottom:12pt;"></div>
      ${eyebrow ? `<div style="color:${accent};font-weight:700;font-size:10pt;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8pt;">${esc(eyebrow)}</div>` : ''}
      ${title ? `<h1 style="font-family:var(--font-heading, Helvetica);font-size:${titleSize}pt;line-height:1.1;font-weight:700;margin:0;">${esc(title)}</h1>` : ''}
      ${subtitle ? `<div style="font-size:14pt;margin-top:${titleSize * 0.6}pt;opacity:0.9;">${esc(subtitle)}</div>` : ''}
    </div>
    ${footnote ? `<div style="position:absolute;left:48pt;bottom:36pt;color:${accent};font-size:9pt;">${esc(footnote)}</div>` : ''}
  </div>`;
}
