/**
 * HTML renderer — turns a `ReportTemplate` JSON into a complete HTML document
 * sized for WeasyPrint print rendering. Mirrors `pdfRenderer.ts` (jsPDF) so
 * editors can choose either engine at production time.
 *
 * The same template + data + tokens MUST produce the same visual output across
 * renderers within the bounds of each engine's capabilities (jsPDF is pixel-
 * exact; HTML reflows). Both walk the same schema.
 */
import {
  type ReportTemplate,
  type Page,
  type Tokens,
  parseTemplate,
} from './templateSchema';
import {
  type ResolveContext,
  resolveBindable,
  resolveBindableColor,
  evalConditional,
} from './bindingResolver';
import { getHtmlBlockRenderer, renderUnsupportedHtml, type HtmlBlockContext } from './blocks/html';
import { renderOverlay } from './blocks/_shared.html';
import { tokensToCssVariables, tokensToFontFaceCss } from './cssTokens';

export interface HtmlRenderOptions {
  data?: Record<string, any>;
  tokenOverrides?: Partial<Tokens>;
  /** Optional free-form CSS appended after the base/page styles. */
  customCss?: string;
  /** Document title (PDF metadata). */
  title?: string;
}

export interface HtmlRenderResult {
  html: string;
  css: string;
}

function mergeTokens(base: Tokens, overrides?: Partial<Tokens>): Tokens {
  if (!overrides) return base;
  return {
    colors: { ...base.colors, ...(overrides.colors ?? {}) },
    fonts: { ...base.fonts, ...(overrides.fonts ?? {}) },
    spacing: { ...base.spacing, ...(overrides.spacing ?? {}) },
  };
}

function baseCss(): string {
  return `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: var(--font-body, 'Helvetica', sans-serif); color: var(--color-text, #111); }
.tpl-page {
  position: relative;
  overflow: hidden;
  page-break-after: always;
  break-after: page;
}
.tpl-page:last-child { page-break-after: auto; break-after: auto; }
img { max-width: 100%; }
table { border-collapse: collapse; }
h1, h2, h3, h4 { font-family: var(--font-heading, var(--font-body, 'Helvetica', sans-serif)); }
`;
}

function pageCss(pages: Page[]): string {
  // Group pages by their size so we can emit one @page rule per unique format.
  // WeasyPrint supports named pages: `@page name { size: w h }` + `.foo { page: name }`.
  const sizes = new Map<string, { w: number; h: number; name: string }>();
  pages.forEach((p, i) => {
    const key = `${p.size.width}x${p.size.height}`;
    if (!sizes.has(key)) {
      sizes.set(key, { w: p.size.width, h: p.size.height, name: `pg${sizes.size}` });
    }
  });
  const rules: string[] = [];
  for (const { w, h, name } of sizes.values()) {
    rules.push(`@page ${name} { size: ${w}pt ${h}pt; margin: 0; }`);
  }
  // Per-page class assignments
  pages.forEach((p, i) => {
    const key = `${p.size.width}x${p.size.height}`;
    const named = sizes.get(key)!.name;
    rules.push(`.tpl-page-${i} { page: ${named}; width: ${p.size.width}pt; height: ${p.size.height}pt; }`);
  });
  return rules.join('\n');
}

const SHADOW_PRESETS: Record<string, string> = {
  none: 'none',
  sm: '0 1pt 2pt rgba(15,23,42,0.08)',
  md: '0 3pt 8pt rgba(15,23,42,0.10)',
  lg: '0 8pt 20pt rgba(15,23,42,0.14)',
  xl: '0 16pt 40pt rgba(15,23,42,0.18)',
};

function evalBlockVisibility(v: any, ctx: ResolveContext): boolean {
  if (!v || !v.mode || v.mode === 'always') return true;
  const expr = String(v.expr ?? '').trim();
  if (!expr) return true;
  const truthy = evalConditional(expr, ctx);
  return v.mode === 'unless' ? !truthy : truthy;
}

function decorationBackdrop(block: any, ctx: ResolveContext): string {
  const s = block.style;
  if (!s) return '';
  const hasDecor =
    s.backgroundColor || s.borderColor || s.borderWidth || s.borderRadius || (s.shadow && s.shadow !== 'none');
  if (!hasDecor) return '';
  const p = (block.props ?? {}) as Record<string, unknown>;
  const x = Number(p.x ?? 24);
  const y = Number(p.y ?? 80);
  const w = Number(p.width ?? 547);
  const h = Number(p.height ?? 100);
  const pt = Number(s.paddingTop ?? 0);
  const pr = Number(s.paddingRight ?? 0);
  const pb = Number(s.paddingBottom ?? 0);
  const pl = Number(s.paddingLeft ?? 0);
  const bg = s.backgroundColor ? resolveBindableColor(s.backgroundColor, ctx, 'transparent') : 'transparent';
  const borderCol = s.borderColor ? resolveBindableColor(s.borderColor, ctx, 'transparent') : 'transparent';
  const bw = Number(s.borderWidth ?? 0);
  const bs = String(s.borderStyle ?? 'solid');
  const radius = Number(s.borderRadius ?? 0);
  const shadow = SHADOW_PRESETS[String(s.shadow ?? 'none')] ?? 'none';
  return `<div aria-hidden="true" style="position:absolute;left:${x - pl}pt;top:${y - pt}pt;width:${w + pl + pr}pt;height:${h + pt + pb}pt;background:${bg};border:${bw}pt ${bs} ${borderCol};border-radius:${radius}pt;box-shadow:${shadow};pointer-events:none;"></div>`;
}

function renderBlockOnce(block: any, ctxBase: ResolveContext, blockCtx: HtmlBlockContext): string {
  const renderer = getHtmlBlockRenderer(block.type);
  const body = renderer ? renderer(block, blockCtx) : renderUnsupportedHtml(block, blockCtx);
  const overlays = (block.overlays ?? []).map((o: any) => renderOverlay(o, ctxBase)).join('');
  const backdrop = decorationBackdrop(block, ctxBase);
  const s = block.style ?? {};
  const opacity = s.opacity != null ? Number(s.opacity) : 1;
  const rotation = s.rotation != null ? Number(s.rotation) : 0;
  const z = s.zIndex != null ? `z-index:${Number(s.zIndex)};` : '';
  if (opacity === 1 && rotation === 0 && !z) {
    return `${backdrop}${body}${overlays}`;
  }
  // Transform group — wrap so opacity/rotation apply uniformly. We anchor at
  // the top-left of the block's bounding box for predictable rotation.
  const p = (block.props ?? {}) as Record<string, unknown>;
  const ox = Number(p.x ?? 0);
  const oy = Number(p.y ?? 0);
  return `<div style="position:absolute;left:0;top:0;opacity:${opacity};transform:rotate(${rotation}deg);transform-origin:${ox}pt ${oy}pt;${z}">${backdrop}${body}${overlays}</div>`;
}

function renderBlockWithRepeat(block: any, ctxBase: ResolveContext, blockCtx: HtmlBlockContext): string[] {
  const r = block.repeat;
  if (!r || !r.path) return [renderBlockOnce(block, ctxBase, blockCtx)];
  const raw = r.path.split('.').reduce((acc: any, k: string) => (acc == null ? acc : acc[k.trim()]), ctxBase.data);
  const items = Array.isArray(raw) ? raw : [];
  const max = r.max ?? items.length;
  const alias = r.alias || 'item';
  const spacing = Number(r.spacing ?? 0);
  const baseY = Number((block.props as any)?.y ?? 0);
  const out: string[] = [];
  for (let i = 0; i < Math.min(items.length, max); i++) {
    const offsetY = baseY + i * spacing;
    const itemBlock = {
      ...block,
      props: { ...(block.props ?? {}), y: offsetY },
      repeat: undefined,
    };
    const itemCtx: ResolveContext = { ...ctxBase, data: { ...ctxBase.data, [alias]: items[i], [`${alias}Index`]: i } };
    const itemBlockCtx: HtmlBlockContext = { ...blockCtx, data: itemCtx.data };
    out.push(renderBlockOnce(itemBlock, itemCtx, itemBlockCtx));
  }
  return out;
}

function renderPage(page: Page, ctxBase: ResolveContext, pageIndex: number, template: ReportTemplate, pages: Page[]): string {
  const blockCtx: HtmlBlockContext = {
    ...ctxBase,
    page: { width: page.size.width, height: page.size.height },
    pageIndex,
    pages: pages.map(p => ({ id: p.id, name: p.name })),
    slots: template.slots ?? {},
  };

  let bgStyle = '';
  if (page.background?.color) {
    const c = resolveBindableColor(page.background.color, ctxBase, '#FFFFFF');
    bgStyle += `background-color:${c};`;
  }
  if (page.background?.imageUrl) {
    const url = resolveBindable(page.background.imageUrl, ctxBase);
    if (url) bgStyle += `background-image:url('${url}');background-size:cover;background-position:center;`;
  }

  const blocks: string[] = [];
  for (const block of page.blocks) {
    if (block.hidden) continue;
    if (!evalConditional(block.conditional, ctxBase)) continue;
    if (!evalBlockVisibility(block.visibility, ctxBase)) continue;
    blocks.push(...renderBlockWithRepeat(block, ctxBase, blockCtx));
  }

  // Phase 5 — baseline grid (printed when page.baselineGrid.show is true).
  let baselineEl = '';
  const bg = (page as any).baselineGrid;
  if (bg?.show) {
    const size = Number(bg.size ?? 12);
    const color = String(bg.color ?? 'rgba(191,155,80,0.20)');
    const offset = Number(bg.offset ?? 0);
    baselineEl = `<div aria-hidden="true" style="position:absolute;inset:0;pointer-events:none;background-image:repeating-linear-gradient(to bottom, transparent 0, transparent ${size - 1}pt, ${color} ${size - 1}pt, ${color} ${size}pt);background-position:0 ${offset}pt;"></div>`;
  }

  return `<section class="tpl-page tpl-page-${pageIndex}" style="${bgStyle}">${baselineEl}${blocks.join('\n')}</section>`;
}

/** Compile a template + data into a print-ready HTML document. */
export function renderTemplateToHtml(
  rawTemplate: ReportTemplate | unknown,
  options: HtmlRenderOptions = {},
): HtmlRenderResult {
  const template = parseTemplate(rawTemplate);
  const tokens = mergeTokens(template.tokens, options.tokenOverrides);
  const ctxBase: ResolveContext = { data: options.data ?? {}, tokens };

  const visiblePages = template.pages.filter((p) => evalConditional(p.conditional, ctxBase));

  const pageHtml = visiblePages.map((page, idx) => {
    const pageCtx: ResolveContext = {
      ...ctxBase,
      data: { ...ctxBase.data, pageNumber: idx + 1, pageCount: visiblePages.length },
    };
    return renderPage(page, pageCtx, idx, template, visiblePages);
  }).join('\n');

  const css = [
    tokensToCssVariables(tokens),
    baseCss(),
    pageCss(visiblePages),
    options.customCss ?? '',
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(options.title ?? 'Report')}</title>
<style>${css}</style>
</head>
<body>
${pageHtml}
</body>
</html>`;

  return { html, css };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}
