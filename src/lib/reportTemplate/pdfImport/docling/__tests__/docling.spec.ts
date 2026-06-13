import { describe, expect, it } from 'vitest';
import type { DoclingDocument } from '../doclingTypes';
import { mapDoclingToRawBlocks } from '../mapDoclingToRawBlocks';
import { mapDoclingToPagePlan } from '../mapDoclingToPagePlan';

const FIXTURE: DoclingDocument = {
  schema_version: '1.0.0',
  pages: {
    '1': { page_no: 1, size: { width: 595, height: 842 } },
  },
  texts: [
    {
      label: 'title',
      text: 'Cloverton Package',
      prov: [{ page_no: 1, bbox: { l: 60, t: 60, r: 535, b: 100, coord_origin: 'TOPLEFT' } }],
      confidence: 0.95,
    },
    {
      label: 'paragraph',
      text: 'Background paragraph that explains the deal.',
      prov: [{ page_no: 1, bbox: { l: 60, t: 120, r: 535, b: 200, coord_origin: 'TOPLEFT' } }],
      confidence: 0.55,
    },
  ],
  tables: [
    {
      data: { num_rows: 2, num_cols: 2, table_cells: [{ text: 'A' }, { text: 'B' }, { text: '1' }, { text: '2' }] },
      prov: [{ page_no: 1, bbox: { l: 60, t: 250, r: 535, b: 360, coord_origin: 'TOPLEFT' } }],
    },
  ],
};

describe('docling adapter', () => {
  it('maps text + table blocks into the RawImportBlock IR', () => {
    const mapped = mapDoclingToRawBlocks(FIXTURE);
    expect(mapped.pages).toHaveLength(1);
    expect(mapped.byPage[1]).toHaveLength(3);
    expect(mapped.byPage[1][0].text).toBe('Cloverton Package');
    expect(mapped.byPage[1][2].type).toBe('table');
  });

  it('hybrid mode locks low-confidence overlays only', () => {
    const plan = mapDoclingToPagePlan(FIXTURE, { importId: 'imp-1', mode: 'hybrid' });
    const page = plan.pages[0];
    const overlays = page.overlays;
    expect(overlays).toHaveLength(3);
    const title = overlays.find((o) => o.id.includes('title'));
    const para = overlays.find((o) => o.id.includes('paragraph'));
    expect(title?.locked).toBe(false);
    expect(para?.locked).toBe(true); // confidence 0.55 < default 0.7 threshold
    expect(plan.importSummary.visualFidelityMode).toBe('hybrid');
  });

  it('pixel-perfect locks every overlay and uses background-first mode', () => {
    const plan = mapDoclingToPagePlan(FIXTURE, { importId: 'imp-2', mode: 'pixel-perfect' });
    expect(plan.pages[0].overlays.every((o) => o.locked)).toBe(true);
    expect(plan.importSummary.visualFidelityMode).toBe('background-first');
  });

  it('semantic mode leaves overlays editable and skips raster background', () => {
    const plan = mapDoclingToPagePlan(FIXTURE, { importId: 'imp-3', mode: 'semantic' });
    expect(plan.pages[0].overlays.every((o) => o.locked === false)).toBe(true);
    expect(plan.pages[0].background.imageUrl).toBe('');
    expect(plan.importSummary.visualFidelityMode).toBe('semantic');
  });

  it('Phase B: pairs picture + caption via shared groupId and lifts alt-text into the overlay name', () => {
    const doc: DoclingDocument = {
      pages: { '1': { page_no: 1, size: { width: 595, height: 842 } } },
      texts: [
        {
          self_ref: '#/texts/0',
          label: 'caption',
          text: 'Figure 1. Suburb growth trajectory.',
          prov: [{ page_no: 1, bbox: { l: 60, t: 410, r: 535, b: 430, coord_origin: 'TOPLEFT' } }],
          confidence: 0.9,
        },
      ],
      pictures: [
        {
          self_ref: '#/pictures/0',
          prov: [{ page_no: 1, bbox: { l: 60, t: 250, r: 535, b: 400, coord_origin: 'TOPLEFT' } }],
          captions: [{ $ref: '#/texts/0' }],
          classification: { predicted_class: 'chart' },
          annotations: [{ kind: 'description', text: 'Line chart of suburb median price 2015–2024.' }],
        } as DoclingDocument['pictures'] extends (infer U)[] ? U : never,
      ],
    };
    const plan = mapDoclingToPagePlan(doc, { importId: 'imp-b1', mode: 'semantic' });
    const overlays = plan.pages[0].overlays;
    const img = overlays.find((o) => o.id.includes('picture'));
    const cap = overlays.find((o) => o.id.includes('caption'));
    expect(img?.groupId).toBeTruthy();
    expect(cap?.groupId).toBe(img?.groupId);
    expect(img?.name).toContain('Line chart');
  });

  it('Phase B: page headers/footers always lock and carry a master groupId', () => {
    const doc: DoclingDocument = {
      pages: { '1': { page_no: 1, size: { width: 595, height: 842 } } },
      texts: [
        {
          label: 'page_header',
          text: 'NPC Property Report',
          prov: [{ page_no: 1, bbox: { l: 60, t: 20, r: 535, b: 40, coord_origin: 'TOPLEFT' } }],
        },
        {
          label: 'page_footer',
          text: 'Page 1',
          prov: [{ page_no: 1, bbox: { l: 60, t: 800, r: 535, b: 820, coord_origin: 'TOPLEFT' } }],
        },
      ],
    };
    const plan = mapDoclingToPagePlan(doc, { importId: 'imp-b2', mode: 'semantic' });
    const overlays = plan.pages[0].overlays;
    expect(overlays).toHaveLength(2);
    expect(overlays.every((o) => o.locked === true)).toBe(true);
    expect(overlays[0].groupId).toMatch(/master-header/);
    expect(overlays[1].groupId).toMatch(/master-footer/);
  });

  it('Phase D: maps formula/code labels with LaTeX + code language metadata', () => {
    const doc: DoclingDocument = {
      pages: { '1': { page_no: 1, size: { width: 595, height: 842 } } },
      texts: [
        {
          label: 'formula',
          text: 'E = mc^2',
          latex: 'E = mc^{2}',
          prov: [{ page_no: 1, bbox: { l: 60, t: 100, r: 300, b: 130, coord_origin: 'TOPLEFT' } }],
        },
        {
          label: 'code',
          text: 'print("hello")',
          code_language: 'python',
          prov: [{ page_no: 1, bbox: { l: 60, t: 150, r: 300, b: 180, coord_origin: 'TOPLEFT' } }],
        },
      ],
    };
    const mapped = mapDoclingToRawBlocks(doc);
    const blocks = mapped.byPage[1];
    const formula = blocks.find((b) => b.type === 'formula');
    const code = blocks.find((b) => b.type === 'code');
    expect(formula?.meta?.latex).toBe('E = mc^{2}');
    expect(formula?.text).toBe('E = mc^{2}');
    expect(code?.meta?.codeLanguage).toBe('python');
  });

  it('Phase D: derives outline from title + section_header text items when sidecar omits it', () => {
    const doc: DoclingDocument = {
      pages: { '1': { page_no: 1, size: { width: 595, height: 842 } } },
      texts: [
        {
          label: 'title',
          text: 'Investment Report',
          prov: [{ page_no: 1, bbox: { l: 60, t: 60, r: 535, b: 90, coord_origin: 'TOPLEFT' } }],
        },
        {
          label: 'section_header',
          text: 'Market Summary',
          level: 2,
          prov: [{ page_no: 1, bbox: { l: 60, t: 120, r: 535, b: 145, coord_origin: 'TOPLEFT' } }],
        },
      ],
    };
    const mapped = mapDoclingToRawBlocks(doc);
    expect(mapped.outline).toHaveLength(2);
    expect(mapped.outline[0]).toMatchObject({ title: 'Investment Report', level: 1, page_no: 1 });
    expect(mapped.outline[1]).toMatchObject({ title: 'Market Summary', level: 2 });
  });

  it('Phase D: picture meta.imageUri flows into the ImageOverlay src', () => {
    const doc: DoclingDocument = {
      pages: { '1': { page_no: 1, size: { width: 595, height: 842 } } },
      pictures: [
        {
          prov: [{ page_no: 1, bbox: { l: 60, t: 200, r: 400, b: 400, coord_origin: 'TOPLEFT' } }],
          image: { uri: 'data:image/png;base64,iVBORw0KG' },
        } as DoclingDocument['pictures'] extends (infer U)[] ? U : never,
      ],
    };
    const plan = mapDoclingToPagePlan(doc, { importId: 'imp-d1', mode: 'semantic' });
    const img = plan.pages[0].overlays.find((o) => o.id.includes('picture')) as { src?: string } | undefined;
    expect(img?.src).toBe('data:image/png;base64,iVBORw0KG');
  });
});
