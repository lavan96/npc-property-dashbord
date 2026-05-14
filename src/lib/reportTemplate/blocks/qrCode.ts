/**
 * QR code block — uses api.qrserver.com to render a PNG that the image
 * preloader fetches and embeds as a data URL.
 *
 * Props: data (bindable, encoded payload), x, y, size, caption?, color?
 */
import type { Block } from '../templateSchema';
import type { BlockRenderContext } from './index';
import { resolveBindable, resolveBindableColor } from '../bindingResolver';

export function drawQrBlock(block: Block, ctx: BlockRenderContext): void {
  const { doc } = ctx;
  const p = block.props as Record<string, unknown>;
  const x = Number(p.x ?? 24);
  const y = Number(p.y ?? 320);
  const size = Number(p.size ?? 120);
  // qrUrl is populated by the preloader (see imagePreloader).
  const url = (p.qrUrl as string) || '';
  if (url && (url.startsWith('data:') || url.startsWith('http'))) {
    try {
      doc.addImage(url, 'PNG', x, y, size, size);
    } catch (e) { console.warn('[qr] addImage failed', e); }
  } else {
    doc.setDrawColor(200, 200, 200);
    doc.rect(x, y, size, size, 'S');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('QR', x + size / 2, y + size / 2, { align: 'center', baseline: 'middle' });
  }
  const caption = resolveBindable(p.caption, ctx);
  if (caption) {
    const c = hex(resolveBindableColor(p.color ?? 'token:muted', ctx, '#666'));
    doc.setTextColor(c.r, c.g, c.b);
    doc.setFontSize(Number(p.captionSize ?? 9));
    doc.setFont('helvetica', 'normal');
    doc.text(caption, x + size / 2, y + size + 12, { align: 'center', maxWidth: size + 80 });
  }
}

function hex(s: string) {
  let h = s.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
