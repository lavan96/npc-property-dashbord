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
import { tokensToCssVariables } from './cssTokens';

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


  return `<section class="tpl-page tpl-page-${pageIndex}" style="${bgStyle}">${blocks.join('\n')}</section>`;
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
