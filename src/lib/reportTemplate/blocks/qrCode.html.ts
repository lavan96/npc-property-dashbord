import type { Block } from '../templateSchema';
import { resolveBindable, resolveBindableColor } from '../bindingResolver';
import { esc, type HtmlBlockContext } from './_shared.html';

export function renderQrCodeHtml(block: Block, ctx: HtmlBlockContext): string {
  const p = block.props as Record<string, unknown>;
  const x = Number(p.x ?? 24);
  const y = Number(p.y ?? 320);
  const size = Number(p.size ?? 120);
  const data = resolveBindable(p.data, ctx);
  const url = (p.qrUrl as string) || (data ? `https://api.qrserver.com/v1/create-qr-code/?size=${size * 2}x${size * 2}&data=${encodeURIComponent(data)}` : '');
  const caption = resolveBindable(p.caption, ctx);
  const capColor = resolveBindableColor(p.color ?? 'token:muted', ctx, '#666');
  const inner = url
    ? `<img src="${esc(url)}" style="width:${size}pt;height:${size}pt;object-fit:contain;"/>`
    : `<div style="width:${size}pt;height:${size}pt;border:1pt solid #ccc;display:flex;align-items:center;justify-content:center;color:#999;">QR</div>`;
  return `<div style="position:absolute;left:${x}pt;top:${y}pt;text-align:center;">
    ${inner}
    ${caption ? `<div style="color:${capColor};font-size:${Number(p.captionSize ?? 9)}pt;margin-top:6pt;max-width:${size + 80}pt;">${esc(caption)}</div>` : ''}
  </div>`;
}
