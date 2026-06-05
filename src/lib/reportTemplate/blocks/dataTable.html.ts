import type { Block } from '../templateSchema';
import { resolveBindable, resolveBindableColor } from '../bindingResolver';
import { absBoxStyle, esc, type HtmlBlockContext } from './_shared.html';

export function renderDataTableHtml(block: Block, ctx: HtmlBlockContext): string {
  const p = block.props as Record<string, unknown>;
  const headers = Array.isArray(p.headers) ? (p.headers as string[]) : [];
  const rows = Array.isArray(p.rows) ? (p.rows as Array<{ cells: string[] }>) : [];
  if (headers.length === 0) return '';

  const headerBg = resolveBindableColor(p.headerBg ?? 'token:primary', ctx, '#BF9B50');
  const headerFg = resolveBindableColor(p.headerFg ?? '#FFFFFF', ctx, '#FFFFFF');
  const stripeBg = resolveBindableColor(p.stripeBg ?? '#F4F0E6', ctx, '#F4F0E6');
  const cellFg = resolveBindableColor(p.cellFg ?? '#1A1A1A', ctx, '#1A1A1A');
  const widths = Array.isArray(p.columnWidths) && (p.columnWidths as number[]).length === headers.length
    ? (p.columnWidths as number[])
    : headers.map(() => 1 / headers.length);
  const style = absBoxStyle(p, { x: 24, y: 24, w: ctx.page.width - 48 });

  const colgroup = `<colgroup>${widths.map(w => `<col style="width:${w * 100}%;"/>`).join('')}</colgroup>`;
  const thead = `<thead><tr style="background:${headerBg};color:${headerFg};">
    ${headers.map(h => `<th style="padding:6pt 8pt;text-align:left;font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">${esc(h)}</th>`).join('')}
  </tr></thead>`;
  const tbody = `<tbody>${rows.map((row, i) => `
    <tr style="background:${i % 2 ? stripeBg : 'transparent'};color:${cellFg};">
      ${(row.cells || []).map((c) => `<td style="padding:6pt 8pt;font-size:9pt;">${esc(resolveBindable(c, ctx))}</td>`).join('')}
    </tr>`).join('')}</tbody>`;

  return `<div style="${style}"><table style="width:100%;border-collapse:collapse;border:0.5pt solid #DCDCDC;">${colgroup}${thead}${tbody}</table></div>`;
}
