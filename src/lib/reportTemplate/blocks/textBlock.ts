/**
 * Text-block — paragraph of body copy (auto-wrap), with heading.
 *
 * Props:
 *   x,y,width,height
 *   heading?: bindable string
 *   body: bindable string (line breaks honoured)
 *   bodySize?: pt (default 10)
 *   color?: bindable color
 */
import type { Block } from '../templateSchema';
import type { BlockRenderContext } from './index';
import { resolveBindable, resolveBindableColor } from '../bindingResolver';

export function drawTextBlock(block: Block, ctx: BlockRenderContext): void {
  const { doc, page } = ctx;
  const p = block.props as Record<string, unknown>;
  const x = Number(p.x ?? 24);
  const y = Number(p.y ?? 24);
  const w = Number(p.width ?? page.width - 48);

  let cursor = y;

  const heading = resolveBindable(p.heading, ctx);
  if (heading) {
    const c = hex(resolveBindableColor(p.headingColor ?? 'token:primary', ctx, '#BF9B50'));
    doc.setTextColor(c.r, c.g, c.b);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(Number(p.headingSize ?? 16));
    doc.text(heading, x, cursor + Number(p.headingSize ?? 16), { maxWidth: w });
    cursor += Number(p.headingSize ?? 16) + 8;
  }

  const body = resolveBindable(p.body, ctx);
  if (body) {
    const size = Number(p.bodySize ?? 10);
    const c = hex(resolveBindableColor(p.color ?? 'token:text', ctx, '#1A1A1A'));
    doc.setTextColor(c.r, c.g, c.b);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    const wrapped = doc.splitTextToSize(body, w);
    doc.text(wrapped, x, cursor + size, { lineHeightFactor: 1.4, maxWidth: w });
  }
}

function hex(s: string) {
  let h = s.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
