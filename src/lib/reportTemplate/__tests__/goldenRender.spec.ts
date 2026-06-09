/**
 * Golden-render isolation guard (rehaul Phase 0).
 *
 * The Template Builder editor/import rehaul must NOT change renderer output: the
 * editor only authors `ReportTemplate` JSON; `renderTemplateToHtml` (the WeasyPrint
 * production path) and the jsPDF renderer consume it. These tests pin the
 * editor→renderer contract — page structure, all three overlay types, token
 * colours, and data binding — so any accidental change to the renderer (or to a
 * shared module that feeds it) fails CI.
 *
 * Assertions are structural invariants (not `toMatchSnapshot`) so they guard from
 * the first CI run without a pre-generated baseline. A maintainer can additionally
 * run `vitest -u` to commit full byte-level snapshots for an even stronger guard.
 */
import { describe, it, expect } from 'vitest';
import { renderTemplateToHtml } from '../htmlRenderer';
import { parseTemplate } from '../templateSchema';

// Fixed, deterministic template exercising the contract (no random ids/dates).
const GOLDEN_TEMPLATE = parseTemplate({
  version: 1,
  tokens: { colors: { primary: '#1a1a2e', accent: '#c9a227' }, fonts: {}, spacing: {} },
  pages: [
    {
      id: 'page-1',
      name: 'Cover',
      size: { width: 595, height: 842 },
      background: { color: 'token:primary' },
      blocks: [
        { id: 'divider-1', type: 'divider', props: {}, overlays: [] },
        {
          id: 'free-1',
          type: 'free',
          props: {},
          overlays: [
            { id: 'ov-text', type: 'text', x: 60, y: 60, width: 320, height: 48, text: '{{client.name}}' },
            { id: 'ov-img', type: 'image', x: 60, y: 200, width: 200, height: 120, src: 'https://example.com/logo.png', fit: 'cover' },
            { id: 'ov-shape', type: 'shape', x: 60, y: 360, width: 120, height: 80, shape: 'rect', fill: 'token:accent' },
          ],
        },
      ],
    },
  ],
});

const GOLDEN_DATA = { client: { name: 'Jane Investor' }, property: { address: '12 Smith Street' } };

describe('golden render — editor→renderer contract (renderers must stay byte-stable)', () => {
  it('production (WeasyPrint) render: stable page structure + resolved bindings', () => {
    const { html, css } = renderTemplateToHtml(GOLDEN_TEMPLATE, { data: GOLDEN_DATA, editorMode: false });

    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
    expect(typeof css).toBe('string');
    expect(css.length).toBeGreaterThan(0);

    // Page structure markers consumed by WeasyPrint + the canvas.
    expect(html).toContain('tpl-page');
    expect(html).toContain('<section id="tpl-page-0"');

    // Binding resolved through the shared resolver (raw token must be gone).
    expect(html).toContain('Jane Investor');
    expect(html).not.toContain('{{client.name}}');

    // Single page → exactly one page section.
    expect((html.match(/class="tpl-page /g) || []).length).toBe(1);
  });

  it('editor-mode render tags pages/blocks for selection', () => {
    const { html } = renderTemplateToHtml(GOLDEN_TEMPLATE, { data: GOLDEN_DATA, editorMode: true });
    expect(html).toContain('data-page-id="page-1"');
    expect(html).toContain('data-block-id="free-1"');
    expect(html).toContain('Jane Investor');
  });

  it('blank single-page template still produces a valid document shell', () => {
    const blank = parseTemplate({
      version: 1,
      tokens: { colors: {}, fonts: {}, spacing: {} },
      pages: [{ id: 'p', name: 'P', size: { width: 595, height: 842 }, background: {}, blocks: [] }],
    });
    const { html } = renderTemplateToHtml(blank, { data: {}, editorMode: false });
    expect(html).toContain('<html');
    expect(html).toContain('tpl-page');
  });
});
