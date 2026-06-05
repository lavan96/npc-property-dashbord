import type { Block } from '../templateSchema';
import { resolveBindable, resolveBindableColor } from '../bindingResolver';
import { esc, type HtmlBlockContext } from './_shared.html';

const MAX_WORDS = 60;
function cap(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  return words.length <= maxWords ? text : words.slice(0, maxWords).join(' ') + '…';
}

export function renderDecisionBoxHtml(block: Block, ctx: HtmlBlockContext): string {
  const p = block.props as Record<string, unknown>;
  const x = Number(p.x ?? 24);
  const y = Number(p.y ?? 80);
  const w = Number(p.width ?? ctx.page.width - 48);
  const heading = resolveBindable(p.heading ?? 'What this means', ctx);
  const body = cap(resolveBindable(p.body ?? '', ctx), MAX_WORDS);
  const accent = resolveBindableColor(p.accent ?? 'token:primary', ctx, '#BF9B50');

  return `<div style="position:absolute;left:${x}pt;top:${y}pt;width:${w}pt;background:#FCFAF6;border-radius:6pt;border-left:4pt solid ${accent};padding:12pt 16pt;">
    <div style="color:${accent};font-weight:700;font-size:9pt;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6pt;">${esc(heading)}</div>
    ${body ? `<div style="color:#1A1A1A;font-size:10pt;line-height:1.4;">${esc(body)}</div>` : ''}
  </div>`;
}
