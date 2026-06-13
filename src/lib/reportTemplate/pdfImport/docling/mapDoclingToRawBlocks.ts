/**
 * Map a Docling `DoclingDocument` into the existing `RawImportBlock[]` IR,
 * grouped by page. The downstream reconciliation/plan builders already know
 * how to turn `RawImportBlock` into editor overlays — so this is the single
 * bridge between Docling's schema and our import pipeline.
 *
 * Coordinate convention: our overlays use top-left origin in PDF points.
 * Docling bboxes may be either TOPLEFT or BOTTOMLEFT — we normalise to
 * TOPLEFT using the page height when needed.
 *
 * Phase A enrichments:
 *   - Reading order is preserved from the Docling document iteration order
 *     (DocLayNet → reading-order model). Final per-page sort is by that
 *     index, not raw y/x, so 2-column layouts flow correctly.
 *   - Heading levels (`section_header` H1–H6) drive font size + meta.headingLevel.
 *   - Contiguous `list_item` runs are tagged with a shared `listGroupId`.
 *   - Tables expose the full cell grid via `meta.tableData` so downstream
 *     overlay builders can populate `TableOverlay.columns/rows` instead of
 *     just a preview string.
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
  DoclingRef,
  DoclingTableCell,
  DoclingTableItem,
  DoclingTextItem,
  DoclingTextLabel,
} from './doclingTypes';

/** Resolve a Docling ref ($ref / cref / string) to the string self_ref form. */
function refToString(ref: DoclingRef | string | undefined): string | undefined {
  if (!ref) return undefined;
  if (typeof ref === 'string') return ref;
  return ref.$ref ?? ref.cref;
}

/** Pick the top classifier label from either schema variant. */
function topPictureClass(picture: DoclingPictureItem): string | undefined {
  const c = picture.classification;
  if (!c) return undefined;
  if (c.predicted_class) return c.predicted_class;
  if (Array.isArray(c.predicted_classes) && c.predicted_classes.length) {
    const sorted = [...c.predicted_classes].sort(
      (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0),
    );
    return sorted[0]?.class_name;
  }
  return undefined;
}

/** First VLM description annotation, if present. */
function pictureAltText(picture: DoclingPictureItem): string | undefined {
  const ann = (picture.annotations ?? []).find(
    (a) => (a.kind ?? '').toLowerCase().includes('descr') && (a.text ?? '').trim().length > 0,
  );
  return ann?.text?.trim();
}

const DEFAULT_FONT_FAMILY = 'Helvetica';

function bboxToTopLeft(bbox: DoclingBBox, pageHeight: number): ImportBBox {
  const width = Math.max(0, bbox.r - bbox.l);
  const height = Math.max(0, bbox.t - bbox.b !== 0 ? Math.abs(bbox.t - bbox.b) : 0);
  if (bbox.coord_origin === 'BOTTOMLEFT') {
    const top = Math.max(0, pageHeight - Math.max(bbox.t, bbox.b));
    return { x: bbox.l, y: top, width, height };
  }
  const top = Math.min(bbox.t, bbox.b);
  return { x: bbox.l, y: top, width, height };
}

function pickProv(prov: DoclingProvenance[] | undefined, pageNo: number): DoclingProvenance | null {
  if (!prov || prov.length === 0) return null;
  const onPage = prov.find((p) => p.page_no === pageNo);
  return onPage ?? prov[0];
}

function labelToBlockType(_label: DoclingTextLabel | undefined): RawImportBlockType {
  return 'text';
}

function labelDefaultWeight(label: DoclingTextLabel | undefined): 'bold' | 'normal' {
  if (label === 'title' || label === 'section_header' || label === 'page_header') return 'bold';
  return 'normal';
}

/**
 * Map heading depth → font size. Mirrors a typical doc rhythm (22/18/15/13/12/11).
 * For `title` we always use H1.
 */
function headingFontSize(level: number): number {
  const clamped = Math.max(1, Math.min(6, Math.round(level)));
  return [22, 18, 15, 13, 12, 11][clamped - 1];
}

function labelDefaultFontSize(label: DoclingTextLabel | undefined, level?: number): number {
  if (label === 'title') return headingFontSize(1);
  if (label === 'section_header') return headingFontSize(level ?? 2);
  switch (label) {
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
  defaultConfidence?: number;
  source?: RawImportBlockSource;
}

function textItemToBlock(
  item: DoclingTextItem,
  pageInfo: DoclingPageInfo,
  index: number,
  readingOrder: number,
  listGroupId: string | undefined,
  opts: MapOptions,
): RawImportBlock | null {
  const prov = pickProv(item.prov, pageInfo.page_no);
  if (!prov) return null;
  const bbox = bboxToTopLeft(prov.bbox, pageInfo.size.height);
  if (bbox.width <= 0 || bbox.height <= 0) return null;
  const headingLevel = item.label === 'title'
    ? 1
    : item.label === 'section_header'
      ? Math.max(1, Math.min(6, Math.round(item.level ?? 2)))
      : undefined;
  const fontSize = item.font?.size ?? labelDefaultFontSize(item.label, headingLevel);
  const fontWeight = normaliseWeight(item.font?.weight) ?? labelDefaultWeight(item.label);
  // Phase B: tag page furniture so the plan builder can route it to a master page.
  const pageRegion: 'header' | 'footer' | undefined =
    item.label === 'page_header' ? 'header'
    : item.label === 'page_footer' ? 'footer'
    : undefined;
  const masterGroupId = pageRegion
    ? `docling-master-${pageRegion}-p${pageInfo.page_no}`
    : undefined;
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
      textAlign: 'left',
    },
    confidence: typeof item.confidence === 'number' ? item.confidence : opts.defaultConfidence ?? 0.85,
    source: opts.source ?? 'pdf-text',
    meta: {
      label: item.label,
      headingLevel,
      listGroupId,
      readingOrder,
      pageRegion,
      groupId: masterGroupId,
    },
  };
}

/** Build a dense row-major string grid from Docling's sparse `table_cells`. */
function buildTableGrid(item: DoclingTableItem): {
  rows: string[][];
  headerRows: number;
  numRows: number;
  numCols: number;
} {
  const numRows = Math.max(0, item.data?.num_rows ?? 0);
  const numCols = Math.max(0, item.data?.num_cols ?? 0);
  const grid: string[][] = Array.from({ length: numRows }, () => Array<string>(numCols).fill(''));
  const cells: DoclingTableCell[] = item.data?.table_cells
    ?? (item.data?.grid ? item.data.grid.flat() : []);

  for (const cell of cells) {
    const r0 = cell.start_row_offset_idx ?? 0;
    const c0 = cell.start_col_offset_idx ?? 0;
    const r1 = cell.end_row_offset_idx ?? r0 + (cell.row_span ?? 1);
    const c1 = cell.end_col_offset_idx ?? c0 + (cell.col_span ?? 1);
    const text = (cell.text ?? '').trim();
    for (let r = r0; r < r1 && r < numRows; r += 1) {
      for (let c = c0; c < c1 && c < numCols; c += 1) {
        // Only the anchor cell gets the text; merged spans leave duplicates blank
        // so downstream renderers can detect spans if they care.
        if (r === r0 && c === c0) grid[r][c] = text;
      }
    }
  }

  // Header row count = max(column_header rows) — count contiguous rows from top
  // where every populated cell is flagged column_header.
  let headerRows = 0;
  if (cells.length) {
    const headerRowSet = new Set<number>();
    for (const cell of cells) {
      if (cell.column_header) headerRowSet.add(cell.start_row_offset_idx ?? 0);
    }
    if (headerRowSet.size) {
      // Take contiguous header rows starting at 0.
      for (let r = 0; r < numRows; r += 1) {
        if (headerRowSet.has(r)) headerRows = r + 1;
        else break;
      }
    }
  }

  return { rows: grid, headerRows, numRows, numCols };
}

function tableItemToBlock(
  item: DoclingTableItem,
  pageInfo: DoclingPageInfo,
  index: number,
  readingOrder: number,
  opts: MapOptions,
): RawImportBlock | null {
  const prov = pickProv(item.prov, pageInfo.page_no);
  if (!prov) return null;
  const bbox = bboxToTopLeft(prov.bbox, pageInfo.size.height);
  if (bbox.width <= 0 || bbox.height <= 0) return null;
  const tableData = buildTableGrid(item);
  const preview = tableData.rows
    .flat()
    .filter(Boolean)
    .slice(0, 12)
    .join(' · ');
  return {
    id: blockId('table', pageInfo.page_no, index),
    type: 'table',
    text: preview || '[table]',
    bbox,
    style: {
      fontFamily: DEFAULT_FONT_FAMILY,
      fontSize: 9,
      fontWeight: 'normal',
      color: '#111111',
    },
    confidence: typeof item.confidence === 'number' ? item.confidence : opts.defaultConfidence ?? 0.7,
    source: opts.source ?? 'pdf-text',
    meta: {
      label: 'table',
      readingOrder,
      tableData,
      caption: item.caption,
    },
  };
}

function pictureItemToBlock(
  item: DoclingPictureItem,
  pageInfo: DoclingPageInfo,
  index: number,
  readingOrder: number,
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
    meta: {
      label: 'picture',
      readingOrder,
      caption: item.caption,
    },
  };
}

export interface MappedDoclingBlocks {
  byPage: Record<number, RawImportBlock[]>;
  all: RawImportBlock[];
  pages: DoclingPageInfo[];
}

export function mapDoclingToRawBlocks(
  doc: DoclingDocument,
  opts: MapOptions = {},
): MappedDoclingBlocks {
  const pages = Object.values(doc.pages ?? {}).sort((a, b) => a.page_no - b.page_no);
  const byPage: Record<number, RawImportBlock[]> = {};
  const orderCounters: Record<number, number> = {};
  for (const page of pages) {
    byPage[page.page_no] = [];
    orderCounters[page.page_no] = 0;
  }

  const nextOrder = (pageNo: number): number => {
    const n = orderCounters[pageNo] ?? 0;
    orderCounters[pageNo] = n + 1;
    return n;
  };

  // --- Text items: iterate in document order so reading order is preserved.
  // Contiguous list_item runs share a listGroupId.
  let textIdx = 0;
  let activeListPage: number | null = null;
  let activeListId: string | null = null;
  let listSeq = 0;
  for (const text of doc.texts ?? []) {
    const prov = pickProv(text.prov, text.prov?.[0]?.page_no ?? 0);
    if (!prov) { textIdx += 1; continue; }
    const page = pages.find((p) => p.page_no === prov.page_no);
    if (!page) { textIdx += 1; continue; }

    let listGroupId: string | undefined;
    if (text.label === 'list_item') {
      if (activeListPage !== page.page_no || !activeListId) {
        listSeq += 1;
        activeListId = `docling-list-p${page.page_no}-${listSeq}`;
        activeListPage = page.page_no;
      }
      listGroupId = activeListId;
    } else {
      activeListPage = null;
      activeListId = null;
    }

    const order = nextOrder(page.page_no);
    const block = textItemToBlock(text, page, textIdx, order, listGroupId, opts);
    if (block) byPage[page.page_no]?.push(block);
    textIdx += 1;
  }

  // --- Tables (preserve their relative document order on each page).
  let tableIdx = 0;
  for (const table of doc.tables ?? []) {
    const prov = pickProv(table.prov, table.prov?.[0]?.page_no ?? 0);
    if (!prov) { tableIdx += 1; continue; }
    const page = pages.find((p) => p.page_no === prov.page_no);
    if (!page) { tableIdx += 1; continue; }
    const order = nextOrder(page.page_no);
    const block = tableItemToBlock(table, page, tableIdx, order, opts);
    if (block) byPage[page.page_no]?.push(block);
    tableIdx += 1;
  }

  // --- Pictures.
  let pictureIdx = 0;
  for (const picture of doc.pictures ?? []) {
    const prov = pickProv(picture.prov, picture.prov?.[0]?.page_no ?? 0);
    if (!prov) { pictureIdx += 1; continue; }
    const page = pages.find((p) => p.page_no === prov.page_no);
    if (!page) { pictureIdx += 1; continue; }
    const order = nextOrder(page.page_no);
    const block = pictureItemToBlock(picture, page, pictureIdx, order, opts);
    if (block) byPage[page.page_no]?.push(block);
    pictureIdx += 1;
  }

  // Final sort: reading order first (Docling document order), then y/x as a
  // deterministic tiebreaker for blocks without a meta index.
  for (const pageNo of Object.keys(byPage)) {
    byPage[Number(pageNo)].sort((a, b) => {
      const ao = a.meta?.readingOrder ?? Number.POSITIVE_INFINITY;
      const bo = b.meta?.readingOrder ?? Number.POSITIVE_INFINITY;
      if (ao !== bo) return ao - bo;
      return (a.bbox.y - b.bbox.y) || (a.bbox.x - b.bbox.x);
    });
  }

  const all = Object.values(byPage).flat();
  return { byPage, all, pages };
}
