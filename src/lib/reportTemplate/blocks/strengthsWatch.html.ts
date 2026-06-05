import type { Block } from '../templateSchema';
import { resolveBindable } from '../bindingResolver';
import { esc, type HtmlBlockContext } from './_shared.html';

export function renderStrengthsWatchHtml(block: Block, ctx: HtmlBlockContext): string {
  const p = block.props as Record<string, unknown>;
  const x = Number(p.x ?? 24);
  const y = Number(p.y ?? 80);
  const w = Number(p.width ?? ctx.page.width - 48);
  const strengths = Array.isArray(p.strengths) ? (p.strengths as string[]) : [];
  const watch = Array.isArray(p.watch) ? (p.watch as string[]) : [];
  const strengthsTitle = resolveBindable(p.strengthsTitle ?? 'Strengths', ctx);
  const watchTitle = resolveBindable(p.watchTitle ?? 'Watch Points', ctx);

  const column = (title: string, items: string[], color: string, glyph: string) => {
    const li = items.map((it) => {
      const text = resolveBindable(it, ctx);
      return `<div style="display:flex;gap:8pt;align-items:flex-start;margin-bottom:8pt;">
        <span style="background:${color};color:#fff;border-radius:50%;width:14pt;height:14pt;display:inline-flex;align-items:center;justify-content:center;font-size:8pt;font-weight:700;flex-shrink:0;">${esc(glyph)}</span>
        <span style="color:#1A1A1A;font-size:9.5pt;line-height:1.35;">${esc(text)}</span>
      </div>`;
    }).join('');
    return `<div>
      <div style="background:${color};color:#fff;font-weight:700;font-size:10pt;padding:6pt 12pt;text-transform:uppercase;margin-bottom:10pt;">${esc(title)}</div>
      ${li}
    </div>`;
  };

  return `<div style="position:absolute;left:${x}pt;top:${y}pt;width:${w}pt;display:grid;grid-template-columns:1fr 1fr;gap:14pt;">
    ${column(String(strengthsTitle), strengths, '#16A34A', '+')}
    ${column(String(watchTitle), watch, '#D97706', '!')}
  </div>`;
}
