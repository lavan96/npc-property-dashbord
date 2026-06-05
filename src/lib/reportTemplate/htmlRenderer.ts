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

function escapeCssString(s: string): string {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
}

interface PageRuleInfo {
  ruleName: string;       // unique @page name combining size + master + numbering tweaks
  className: string;      // matching .tpl-page-N class
}

function pageCss(
  pages: Page[],
  template: ReportTemplate,
  ctxBase: ResolveContext,
): { css: string; pageInfo: PageRuleInfo[] } {
  const masters = (template as any).pageMasters as Record<string, any> | undefined;
  const defaultMasterId = (template as any).defaultPageMasterId as string | undefined;
  const rules: string[] = [];
  const seen = new Set<string>();
  const pageInfo: PageRuleInfo[] = [];

  pages.forEach((p, i) => {
    const masterId = (p as any).pageMasterId || defaultMasterId;
    const master = masterId && masters ? masters[masterId] : null;
    const numbering = ((p as any).numbering ?? master?.numbering ?? {}) as any;
    const fmt = numbering.format || 'decimal';
    const suppressFirst = master?.suppressOnFirstPage && i === 0;
    const isHidden = (p as any).numbering?.hide;

    // Unique rule key so masters with different boxes get isolated @page rules.
    const key = `${p.size.width}x${p.size.height}|${masterId ?? ''}|${fmt}|${i}`;
    const ruleName = `pg${i}`;

    // Build margin-box content (skip on suppressed first page).
    const boxes = (!suppressFirst && master?.boxes) ? master.boxes : {};
    const styleFs = master?.style?.fontSize ? `font-size:${Number(master.style.fontSize)}pt;` : 'font-size:9pt;';
    const styleFf = master?.style?.fontFamily ? `font-family:${master.style.fontFamily};` : '';
    const styleColor = master?.style?.color ? `color:${resolveBindableColor(master.style.color, ctxBase, '#666')};` : 'color:#666;';
    const styleBorderColor = master?.style?.borderColor
      ? resolveBindableColor(master.style.borderColor, ctxBase, '#ddd') : '#ddd';

    const renderBox = (zone: string, raw: any): string => {
      if (!raw) return '';
      // Resolve bindings (pageNumber/pageCount already injected by caller).
      // Replace {{pageCounter}} with CSS content counter(page, fmt).
      let s = String(raw);
      const hasCounter = s.includes('{{pageCounter}}');
      // Resolve other bindings except pageCounter
      s = s.replace(/\{\{\s*pageCounter\s*\}\}/g, '__PAGECOUNTER__');
      const resolved = resolveBindable(s, ctxBase);
      // Split around the counter placeholder so we can interleave with counter().
      const parts = resolved.split('__PAGECOUNTER__');
      const counterStr = `" counter(page, ${fmt}) "`;
      const contentExpr = hasCounter
        ? '"' + parts.map(escapeCssString).join(counterStr) + '"'
        : `"${escapeCssString(resolved)}"`;
      const borderRule =
        (zone.startsWith('top') && master?.style?.borderBottom) ? `border-bottom:0.5pt solid ${styleBorderColor};padding-bottom:4pt;` :
        (zone.startsWith('bottom') && master?.style?.borderTop) ? `border-top:0.5pt solid ${styleBorderColor};padding-top:4pt;` : '';
      return `@${zone} { content: ${contentExpr}; ${styleFs}${styleFf}${styleColor}${borderRule} }`;
    };

    const margins = master?.margins ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const mb = isHidden ? {} : boxes;
    const marginBoxRules = [
      renderBox('top-left',     mb.topLeft),
      renderBox('top-center',   mb.topCenter),
      renderBox('top-right',    mb.topRight),
      renderBox('bottom-left',  mb.bottomLeft),
      renderBox('bottom-center',mb.bottomCenter),
      renderBox('bottom-right', mb.bottomRight),
    ].filter(Boolean).join(' ');

    const marginCss = master
      ? `margin: ${margins.top}pt ${margins.right}pt ${margins.bottom}pt ${margins.left}pt;`
      : `margin: 0;`;

    rules.push(
      `@page ${ruleName} { size: ${p.size.width}pt ${p.size.height}pt; ${marginCss} ${marginBoxRules} }`,
    );
    rules.push(`.tpl-page-${i} { page: ${ruleName}; width: ${p.size.width}pt; height: ${p.size.height}pt; }`);

    // Counter restart on this page if requested
    const numStart = (p as any).numbering?.startAt ?? master?.numbering?.startAt;
    const numRestart = (p as any).numbering?.restart;
    if ((i === 0 && numStart) || numRestart) {
      const start = Math.max(1, Number(numStart || 1)) - 1;
      rules.push(`.tpl-page-${i} { counter-reset: page ${start}; }`);
    }

    pageInfo.push({ ruleName, className: `tpl-page-${i}` });
    seen.add(key);
  });

  return { css: rules.join('\n'), pageInfo };
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

function resolveLinkHref(
  link: any,
  ctxBase: ResolveContext,
  pages: Page[],
): { href: string; target: string; title: string } | null {
  if (!link?.href) return null;
  const raw = resolveBindable(link.href, ctxBase).trim();
  if (!raw) return null;
  let href = raw;
  if (raw.startsWith('page:')) {
    const pid = raw.slice(5);
    const idx = pages.findIndex((p) => p.id === pid);
    href = idx >= 0 ? `#tpl-page-${idx}` : '#';
  } else if (raw.startsWith('anchor:')) {
    href = `#anc-${raw.slice(7).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  }
  const target = link.target ?? (href.startsWith('#') ? '_self' : '_blank');
  const title = link.title ? resolveBindable(link.title, ctxBase) : '';
  return { href, target, title };
}

function bookmarkAttrs(bm: any, ctxBase: ResolveContext): string {
  if (!bm?.name) return '';
  const anchorId = `anc-${String(bm.name).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const label = bm.label ? resolveBindable(bm.label, ctxBase) : bm.name;
  const level = Number(bm.level ?? 2);
  // WeasyPrint reads `bookmark-label` / `bookmark-level` for the PDF outline.
  return ` id="${anchorId}" style="bookmark-label:'${String(label).replace(/'/g, "\\'")}';bookmark-level:${level};"`;
}

function renderBlockOnce(block: any, ctxBase: ResolveContext, blockCtx: HtmlBlockContext, pages: Page[]): string {
  const renderer = getHtmlBlockRenderer(block.type);
  const body = renderer ? renderer(block, blockCtx) : renderUnsupportedHtml(block, blockCtx);
  const overlays = (block.overlays ?? []).map((o: any) => renderOverlay(o, ctxBase)).join('');
  const backdrop = decorationBackdrop(block, ctxBase);
  const s = block.style ?? {};
  const opacity = s.opacity != null ? Number(s.opacity) : 1;
  const rotation = s.rotation != null ? Number(s.rotation) : 0;
  const z = s.zIndex != null ? `z-index:${Number(s.zIndex)};` : '';

  // Phase 8 — bookmark + link wrapping
  const bmAttrs = bookmarkAttrs(block.bookmark, ctxBase);
  const link = resolveLinkHref(block.link, ctxBase, pages);
  const wrap = (inner: string) => {
    if (link) {
      const titleAttr = link.title ? ` title="${escapeHtml(link.title)}"` : '';
      return `<a href="${link.href}" target="${link.target}"${titleAttr} style="text-decoration:none;color:inherit;display:contents;">${inner}</a>`;
    }
    return inner;
  };

  let content: string;
  if (opacity === 1 && rotation === 0 && !z) {
    content = `${backdrop}${body}${overlays}`;
  } else {
    const p = (block.props ?? {}) as Record<string, unknown>;
    const ox = Number(p.x ?? 0);
    const oy = Number(p.y ?? 0);
    content = `<div style="position:absolute;left:0;top:0;opacity:${opacity};transform:rotate(${rotation}deg);transform-origin:${ox}pt ${oy}pt;${z}">${backdrop}${body}${overlays}</div>`;
  }

  // If we have a bookmark, attach the id to a wrapping span so anchor jumps work
  if (bmAttrs) {
    content = `<span${bmAttrs}>${content}</span>`;
  }
  return wrap(content);
}


function renderBlockWithRepeat(block: any, ctxBase: ResolveContext, blockCtx: HtmlBlockContext, pages: Page[]): string[] {
  const r = block.repeat;
  if (!r || !r.path) return [renderBlockOnce(block, ctxBase, blockCtx, pages)];
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
    out.push(renderBlockOnce(itemBlock, itemCtx, itemBlockCtx, pages));
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
    blocks.push(...renderBlockWithRepeat(block, ctxBase, blockCtx, pages));
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

  return `<section id="tpl-page-${pageIndex}" class="tpl-page tpl-page-${pageIndex}" style="${bgStyle}">${baselineEl}${blocks.join('\n')}</section>`;
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

  // Phase 8 — walk all bookmarks to build a TOC index that auto-toc blocks read.
  const tocEntries: Array<{ label: string; level: number; pageIndex: number; anchor: string }> = [];
  visiblePages.forEach((pg, pi) => {
    for (const b of pg.blocks) {
      const bm: any = (b as any).bookmark;
      if (!bm?.name) continue;
      if (bm.includeInToc === false) continue;
      const label = bm.label ? resolveBindable(bm.label, ctxBase) : (b.name || bm.name);
      tocEntries.push({
        label: String(label),
        level: Number(bm.level ?? 2),
        pageIndex: pi,
        anchor: `anc-${String(bm.name).replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      });
    }
  });

  const pageHtml = visiblePages.map((page, idx) => {
    const pageCtx: ResolveContext = {
      ...ctxBase,
      data: { ...ctxBase.data, pageNumber: idx + 1, pageCount: visiblePages.length, __tocEntries: tocEntries },
    };
    return renderPage(page, pageCtx, idx, template, visiblePages);
  }).join('\n');


  const css = [
    tokensToFontFaceCss(tokens),
    tokensToCssVariables(tokens),
    baseCss(),
    pageCss(visiblePages),
    options.customCss ?? '',
  ].join('\n');

  // Phase 8 — document metadata
  const meta = (template as any).meta ?? {};
  const lang = meta.lang || 'en';
  const r = (v: unknown) => v ? escapeHtml(resolveBindable(v, ctxBase)) : '';
  const metaTags = [
    meta.author   && `<meta name="author" content="${r(meta.author)}"/>`,
    meta.subject  && `<meta name="description" content="${r(meta.subject)}"/>`,
    meta.keywords && `<meta name="keywords" content="${r(meta.keywords)}"/>`,
    meta.creator  && `<meta name="generator" content="${r(meta.creator)}"/>`,
  ].filter(Boolean).join('\n');
  const docTitle = options.title ?? (meta.title ? resolveBindable(meta.title, ctxBase) : 'Report');

  const html = `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(docTitle)}</title>
${metaTags}
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
