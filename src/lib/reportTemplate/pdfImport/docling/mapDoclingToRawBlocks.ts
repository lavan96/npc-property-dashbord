/**
 * Map a Docling `DoclingDocument` into the existing `RawImportBlock[]` IR,
 * grouped by page. The downstream reconciliation/plan builders already know
 * how to turn `RawImportBlock` into editor overlays — so this is the single
 * bridge between Docling's schema and our import pipeline.
 *
 * Coordinate convention: our overlays use top-left origin in PDF points.
 * Docling bboxes may be either TOPLEFT or BOTTOMLEFT — we normalise to
 * TOPLEFT using the page height when needed.
 */
import type {
  RawImportBlock,
  RawImportBlockSource,
  RawImportBlockType,
  ImportBBox,
} from '@/lib/reportTemplate/ingestion/reconciliation';
import type {
  DoclingBBox,
  DoclingDocument,
  DoclingPageInfo,
  DoclingPictureItem,
  DoclingProvenance,
  DoclingTableItem,
  DoclingTextItem,
  DoclingTextLabel,
} from './doclingTypes';

const DEFAULT_FONT_FAMILY = 'Helvetica';

function bboxToTopLeft(bbox: DoclingBBox, pageHeight: number): ImportBBox {
  const width = Math.max(0, bbox.r - bbox.l);
  const height = Math.max(0, bbox.t - bbox.b !== 0 ? Math.abs(bbox.t - bbox.b) : 0);
  if (bbox.coord_origin === 'BOTTOMLEFT') {
    // In BL space, t > b. Top in TL space = pageHeight - t.
    const top = Math.max(0, pageHeight - Math.max(bbox.t, bbox.b));
    return { x: bbox.l, y: top, width, height };
  }
  // TOPLEFT (or unspecified — Docling defaults to TL for `BoundingBox.from_top_left_corner`)
  const top = Math.min(bbox.t, bbox.b);
  return { x: bbox.l, y: top, width, height };
}

function pickProv(prov: DoclingProvenance[] | undefined, pageNo: number): DoclingProvenance | null {
  if (!prov || prov.length === 0) return null;
  const onPage = prov.find((p) => p.page_no === pageNo);
  return onPage ?? prov[0];
}

function labelToBlockType(label: DoclingTextLabel | undefined): RawImportBlockType {
  if (!label) return 'text';
  return 'text';
}

/** Map Docling label → font-weight hint (titles + headings get bold). */
function labelDefaultWeight(label: DoclingTextLabel | undefined): 'bold' | 'normal' {
  if (label === 'title' || label === 'section_header' || label === 'page_header') return 'bold';
  return 'normal';
}

/** Map Docling label → default font size (when the item has no explicit font). */
function labelDefaultFontSize(label: DoclingTextLabel | undefined): number {
  switch (label) {
    case 'title': return 22;
    case 'section_header': return 16;
    case 'page_header':
    case 'page_footer':
    case 'caption':
    case 'footnote': return 9;
    default: return 11;
  }
}

function normaliseWeight(value: unknown): number | 'normal' | 'bold' | undefined {
  if (value === 'bold' || value === 'normal') return value;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n >= 600 ? 'bold' : 'normal';
  return undefined;
}

function blockId(prefix: string, pageNo: number, index: number): string {
  return `docling-${prefix}-p${pageNo}-${index.toString(36)}`;
}

interface MapOptions {
  /** Default confidence when Docling does not provide one. */
  defaultConfidence?: number;
  source?: RawImportBlockSource;
}

function textItemToBlock(
  item: DoclingTextItem,
  pageInfo: DoclingPageInfo,
  index: number,
  opts: MapOptions,
): RawImportBlock | null {
  const prov = pickProv(item.prov, pageInfo.page_no);
  if (!prov) return null;
  const bbox = bboxToTopLeft(prov.bbox, pageInfo.size.height);
  if (bbox.width <= 0 || bbox.height <= 0) return null;
  const fontSize = item.font?.size ?? labelDefaultFontSize(item.label);
  const fontWeight = normaliseWeight(item.font?.weight) ?? labelDefaultWeight(item.label);
  return {
    id: blockId(String(item.label ?? 'text'), pageInfo.page_no, index),
    type: labelToBlockType(item.label),
    text: item.text,
    bbox,
    style: {
      fontFamily: item.font?.family ?? DEFAULT_FONT_FAMILY,
      fontSize,
      fontWeight,
      color: item.font?.color ?? '#111111',
      textAlign: item.label === 'title' || item.label === 'section_header' ? 'left' : 'left',
    },
    confidence: typeof item.confidence === 'number' ? item.confidence : opts.defaultConfidence ?? 0.85,
    source: opts.source ?? 'pdf-text',
  };
}

function tableItemToBlock(
  item: DoclingTableItem,
  pageInfo: DoclingPageInfo,
  index: number,
  opts: MapOptions,
): RawImportBlock | null {
  const prov = pickProv(item.prov, pageInfo.page_no);
  if (!prov) return null;
  const bbox = bboxToTopLeft(prov.bbox, pageInfo.size.height);
  if (bbox.width <= 0 || bbox.height <= 0) return null;
  const cells = item.data?.table_cells ?? item.data?.grid?.flat() ?? [];
  const previewText = cells
    .slice(0, 12)
    .map((c) => c?.text?.trim())
    .filter(Boolean)
    .join(' · ');
  return {
    id: blockId('table', pageInfo.page_no, index),
    type: 'table',
    text: previewText || '[table]',
    bbox,
    style: {
      fontFamily: DEFAULT_FONT_FAMILY,
      fontSize: 9,
      fontWeight: 'normal',
      color: '#111111',
    },
    confidence: typeof item.confidence === 'number' ? item.confidence : opts.defaultConfidence ?? 0.7,
    source: opts.source ?? 'pdf-text',
  };
}

function pictureItemToBlock(
  item: DoclingPictureItem,
  pageInfo: DoclingPageInfo,
  index: number,
  opts: MapOptions,
): RawImportBlock | null {
  const prov = pickProv(item.prov, pageInfo.page_no);
  if (!prov) return null;
  const bbox = bboxToTopLeft(prov.bbox, pageInfo.size.height);
  if (bbox.width <= 0 || bbox.height <= 0) return null;
  return {
    id: blockId('picture', pageInfo.page_no, index),
    type: 'image',
    text: item.caption ?? '[image]',
    bbox,
    style: { backgroundColor: '#00000000' },
    confidence: typeof item.confidence === 'number' ? item.confidence : opts.defaultConfidence ?? 0.6,
    source: opts.source ?? 'pdf-text',
  };
}

export interface MappedDoclingBlocks {
  /** Map of page_no (1-indexed in Docling) → ordered RawImportBlocks. */
  byPage: Record<number, RawImportBlock[]>;
  /** Flat list (handy for tests / debugging). */
  all: RawImportBlock[];
  /** Page metadata keyed by page_no. */
  pages: DoclingPageInfo[];
}

export function mapDoclingToRawBlocks(
  doc: DoclingDocument,
  opts: MapOptions = {},
): MappedDoclingBlocks {
  const pages = Object.values(doc.pages ?? {}).sort((a, b) => a.page_no - b.page_no);
  const byPage: Record<number, RawImportBlock[]> = {};
  for (const page of pages) byPage[page.page_no] = [];

  let textIdx = 0;
  for (const text of doc.texts ?? []) {
    const prov = pickProv(text.prov, text.prov?.[0]?.page_no ?? 0);
    if (!prov) { textIdx += 1; continue; }
    const page = pages.find((p) => p.page_no === prov.page_no);
    if (!page) { textIdx += 1; continue; }
    const block = textItemToBlock(text, page, textIdx, opts);
    if (block) byPage[page.page_no]?.push(block);
    textIdx += 1;
  }

  let tableIdx = 0;
  for (const table of doc.tables ?? []) {
    const prov = pickProv(table.prov, table.prov?.[0]?.page_no ?? 0);
    if (!prov) { tableIdx += 1; continue; }
    const page = pages.find((p) => p.page_no === prov.page_no);
    if (!page) { tableIdx += 1; continue; }
    const block = tableItemToBlock(table, page, tableIdx, opts);
    if (block) byPage[page.page_no]?.push(block);
    tableIdx += 1;
  }

  let pictureIdx = 0;
  for (const picture of doc.pictures ?? []) {
    const prov = pickProv(picture.prov, picture.prov?.[0]?.page_no ?? 0);
    if (!prov) { pictureIdx += 1; continue; }
    const page = pages.find((p) => p.page_no === prov.page_no);
    if (!page) { pictureIdx += 1; continue; }
    const block = pictureItemToBlock(picture, page, pictureIdx, opts);
    if (block) byPage[page.page_no]?.push(block);
    pictureIdx += 1;
  }

  // Order overlays top→bottom, then left→right inside each page so
  // selection order matches reading order in the editor.
  for (const pageNo of Object.keys(byPage)) {
    byPage[Number(pageNo)].sort((a, b) => (a.bbox.y - b.bbox.y) || (a.bbox.x - b.bbox.x));
  }

  const all = Object.values(byPage).flat();
  return { byPage, all, pages };
}
