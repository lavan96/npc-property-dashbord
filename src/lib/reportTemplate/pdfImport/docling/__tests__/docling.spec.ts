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
});
