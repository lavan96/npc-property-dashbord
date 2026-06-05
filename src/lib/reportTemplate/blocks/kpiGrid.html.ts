import type { Block } from '../templateSchema';
import { resolveBindable, resolveBindableColor } from '../bindingResolver';
import { absBoxStyle, esc, type HtmlBlockContext } from './_shared.html';

interface KpiItem { label: string; value: string; accent?: string }

export function renderKpiGridHtml(block: Block, ctx: HtmlBlockContext): string {
  const p = block.props as Record<string, unknown>;
  const items = Array.isArray(p.items) ? (p.items as KpiItem[]) : [];
  if (items.length === 0) return '';
  const cols = Math.min(Number(p.columns ?? items.length), 6);
  const gap = Number(p.gap ?? 12);
  const tileBg = resolveBindableColor(p.tileBg ?? 'token:bg', ctx, '#1A1A1A');
  const accentDefault = resolveBindableColor(p.accent ?? 'token:primary', ctx, '#BF9B50');
  const labelColor = resolveBindableColor(p.labelColor ?? 'token:muted', ctx, '#999999');
  const style = absBoxStyle(p, { x: 24, y: 24, w: ctx.page.width - 48, h: 90 });

  const tiles = items.slice(0, cols).map((item) => {
    const value = resolveBindable(item.value, ctx) || '—';
    const accent = item.accent ? resolveBindableColor(item.accent, ctx, accentDefault) : accentDefault;
    return `<div style="position:relative;background:${tileBg};border-radius:6pt;padding:12pt 12pt 10pt 16pt;overflow:hidden;">
      <div style="position:absolute;left:0;top:0;bottom:0;width:3pt;background:${accent};"></div>
      <div style="color:${accent};font-weight:700;font-size:20pt;line-height:1.1;">${esc(value)}</div>
      <div style="color:${labelColor};font-size:8pt;text-transform:uppercase;letter-spacing:0.08em;margin-top:8pt;">${esc(String(item.label || ''))}</div>
    </div>`;
  }).join('');

  return `<div style="${style}display:grid;grid-template-columns:repeat(${cols}, 1fr);gap:${gap}pt;">${tiles}</div>`;
}
