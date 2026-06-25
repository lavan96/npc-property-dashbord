import { describe, expect, it } from 'vitest';
import { getPreferredPdfPageContextSource, validatePdfPageContexts } from '../ingestion/pageContexts';

const makeContext = (pageNo: number) => ({
  version: 'pdf-page-context-v1',
  page_no: pageNo,
  page_index: pageNo - 1,
  width: 100,
  height: 200,
  artifacts: {
    docling_path: `job/pages/page-${String(pageNo).padStart(3, '0')}/docling.json`,
    blocks_path: `job/pages/page-${String(pageNo).padStart(3, '0')}/blocks.json`,
    tables_path: `job/pages/page-${String(pageNo).padStart(3, '0')}/tables.json`,
    pictures_path: `job/pages/page-${String(pageNo).padStart(3, '0')}/pictures.json`,
    summary_path: `job/pages/page-${String(pageNo).padStart(3, '0')}/summary.json`,
    raster_path: `job/pages/page-${String(pageNo).padStart(3, '0')}.png`,
  },
  flags: {
    has_docling: true,
    has_blocks: true,
    has_tables: true,
    has_pictures: true,
    has_summary: true,
    has_raster: true,
    has_parent_global_artifacts: true,
  },
});

describe('Phase 4F PDF page context consumer', () => {
  it('prefers parent per-page Docling contexts when entrypoint and validation are valid', () => {
    const selected = getPreferredPdfPageContextSource({
      pageContextEntrypoint: { available: true, page_count: 2 },
      pageContexts: [makeContext(2), makeContext(1)],
      pageContextSummary: {
        ok: true,
        expected_page_count: 2,
        observed_page_count: 2,
        problems: [],
      },
    });

    expect(selected.source).toBe('per_page_docling');
    expect(selected.pageContextValidation.ok).toBe(true);
    expect(selected.pageContexts.map((ctx) => ctx.page_no)).toEqual([1, 2]);
    expect(selected.pageContexts[0].artifacts.docling_path).toContain('/pages/page-001/docling.json');
  });

  it('falls back to legacy Docling when required page artifacts are missing', () => {
    const bad = makeContext(1);
    bad.artifacts.summary_path = null;
    bad.flags.has_summary = false;

    const selected = getPreferredPdfPageContextSource({
      pageContextEntrypoint: { available: true, page_count: 1 },
      pageContexts: [bad],
      pageContextSummary: {
        ok: true,
        expected_page_count: 1,
        observed_page_count: 1,
        problems: [],
      },
    });

    expect(selected.source).toBe('legacy_docling');
    expect(selected.pageContexts).toEqual([]);
    expect(selected.pageContextValidation.ok).toBe(false);
    expect(selected.pageContextValidation.problems).toContain('page_1_summary_path_missing');
  });

  it('fails validation when page coverage is not continuous', () => {
    const validation = validatePdfPageContexts({
      pageContextEntrypoint: { available: true, page_count: 3 },
      pageContexts: [makeContext(1), makeContext(3)],
      pageContextSummary: {
        ok: true,
        expected_page_count: 3,
        observed_page_count: 2,
        problems: [],
      },
    });

    expect(validation.ok).toBe(false);
    expect(validation.missing_page_numbers).toEqual([2]);
    expect(validation.problems).toContain('missing_page_contexts:2');
  });

  it('requires raster paths for Phase 4F.4 context validation', () => {
    const bad = makeContext(1);
    bad.artifacts.raster_path = null;
    bad.flags.has_raster = false;

    const validation = validatePdfPageContexts({
      pageContextEntrypoint: { available: true, page_count: 1 },
      pageContexts: [bad],
      pageContextSummary: {
        ok: true,
        expected_page_count: 1,
        observed_page_count: 1,
        problems: [],
      },
    });

    expect(validation.ok).toBe(false);
    expect(validation.problems).toContain('page_1_raster_path_missing');
  });
});
