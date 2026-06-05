import type { Block } from '../templateSchema';
import { resolveBindableColor } from '../bindingResolver';
import type { HtmlBlockContext } from './_shared.html';

export function renderDividerHtml(block: Block, ctx: HtmlBlockContext): string {
  const p = block.props as Record<string, unknown>;
  const x = Number(p.x ?? 24);
  const y = Number(p.y ?? 0);
  const w = Number(p.width ?? ctx.page.width - 48);
  const t = Number(p.thickness ?? 1);
  const style = (p.style as string) ?? 'solid';
  const color = resolveBindableColor(p.color ?? 'token:muted', ctx, '#999999');
  return `<div style="position:absolute;left:${x}pt;top:${y}pt;width:${w}pt;border-top:${t}pt ${style} ${color};"></div>`;
}
