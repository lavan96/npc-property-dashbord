/**
 * HTML block-renderer registry — mirror of `blocks/index.ts` for the
 * WeasyPrint pipeline. One entry per block type; Phase 1 covers the
 * foundational set, Phase 2 will fill in the rest.
 */
import type { Block } from '../templateSchema';
import type { HtmlBlockContext, HtmlBlockRenderer } from './_shared.html';
import { renderCoverHtml } from './cover.html';
import { renderTextBlockHtml } from './textBlock.html';
import { renderKpiGridHtml } from './kpiGrid.html';
import { renderDataTableHtml } from './dataTable.html';
import { renderDividerHtml } from './divider.html';
import { renderSpacerHtml } from './spacer.html';
import { renderFooterHtml } from './footer.html';
import { renderPageNumberHtml } from './pageNumber.html';

const HTML_RENDERERS: Record<string, HtmlBlockRenderer> = {
  cover: renderCoverHtml,
  text: renderTextBlockHtml,
  'kpi-grid': renderKpiGridHtml,
  'data-table': renderDataTableHtml,
  divider: renderDividerHtml,
  spacer: renderSpacerHtml,
  footer: renderFooterHtml,
  'page-number': renderPageNumberHtml,
};

export function getHtmlBlockRenderer(type: string): HtmlBlockRenderer | undefined {
  return HTML_RENDERERS[type];
}

export function htmlBlockTypes(): string[] {
  return Object.keys(HTML_RENDERERS);
}

export type { HtmlBlockContext, HtmlBlockRenderer };

/** Fallback for unsupported block types — emits a visible placeholder so
 * editors can see at a glance which blocks need an HTML renderer ported. */
export function renderUnsupportedHtml(block: Block, _ctx: HtmlBlockContext): string {
  return `<div style="position:absolute;left:24pt;top:24pt;padding:8pt 12pt;background:#FFF4D6;border:1pt dashed #BF9B50;color:#7A5B00;font-size:9pt;font-family:Helvetica;">
    Block type "<strong>${block.type}</strong>" not yet supported by the WeasyPrint renderer (Phase 2).
  </div>`;
}
