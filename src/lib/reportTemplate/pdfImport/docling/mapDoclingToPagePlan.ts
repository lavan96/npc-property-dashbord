/**
 * Convert mapped Docling blocks → TemplateImportPagePlan[] (the contract the
 * existing reconciliation/plan validators already consume).
 *
 * Mode policy (matches the implementation plan):
 *   - 'semantic'      → no raster background; all overlays editable.
 *   - 'hybrid'        → raster page background + editable overlays for items
 *                       with confidence ≥ 0.7; lower-confidence items locked.
 *   - 'pixel-perfect' → raster background + ALL overlays locked.
 */
import type { Overlay } from '@/lib/reportTemplate/templateSchema';

type TextOverlay = Extract<Overlay, { type: 'text' }>;
type ImageOverlay = Extract<Overlay, { type: 'image' }>;
type TableOverlay = Extract<Overlay, { type: 'table' }>;
import type {
  ImportWarning,
  RawImportBlock,
  TemplateImportPagePlan,
  TemplateImportPlan,
} from '@/lib/reportTemplate/ingestion/reconciliation';
import type { DoclingDocument, DoclingPageInfo, DoclingRasterByPage } from './doclingTypes';
import { mapDoclingToRawBlocks } from './mapDoclingToRawBlocks';

export type DoclingPlanMode = 'semantic' | 'hybrid' | 'pixel-perfect';

export interface DoclingPlanOptions {
  importId: string;
  mode: DoclingPlanMode;
  /** Per-page raster URLs (when /raster ran upstream). */
  rastersByPage?: DoclingRasterByPage;
  /** Engine version recorded in importSummary. */
  engineVersion?: string;
  /** Confidence cutoff for hybrid lock policy. */
  lockBelowConfidence?: number;
}

const DEFAULT_LOCK_THRESHOLD = 0.7;

function pageId(pageNo: number): string {
  return `docling-page-${pageNo}`;
}

function overlayId(block: RawImportBlock, suffix = 'ov'): string {
  return `${block.id}-${suffix}`;
}

function blockToOverlay(block: RawImportBlock, locked: boolean): Overlay | null {
  // Phase B: prefer alt-text / caption for the human-readable layer label.
  const layerName = block.meta?.altText
    ?? block.meta?.caption
    ?? (block.text ? block.text.slice(0, 64) : block.type);
  const base = {
    id: overlayId(block),
    x: block.bbox.x,
    y: block.bbox.y,
    width: block.bbox.width,
    height: block.bbox.height,
    rotation: 0,
    opacity: 1,
    confidence: block.confidence,
    locked,
    name: layerName,
    ...(block.meta?.groupId ? { groupId: block.meta.groupId } : {}),
  } as const;

  if (block.type === 'text' || block.type === 'formula' || block.type === 'code') {
    const isCode = block.type === 'code';
    const isFormula = block.type === 'formula';
    const overlay: TextOverlay = {
      ...base,
      type: 'text',
      content: block.text ?? '',
      fontFamily: isCode ? 'Menlo, Consolas, monospace'
        : isFormula ? 'Times, "Times New Roman", serif'
        : (block.style?.fontFamily ?? 'Helvetica'),
      fontSize: block.style?.fontSize ?? 11,
      fontWeight: (block.style?.fontWeight === 'bold' ? 'bold' : 'normal') as 'normal' | 'bold',
      fontStyle: isFormula ? 'italic' : (block.style?.fontStyle ?? 'normal'),
      color: block.style?.color ?? '#111111',
      align: (block.style?.textAlign ?? 'left') as TextOverlay['align'],
      lineHeight: isCode ? 1.4 : 1.3,
      letterSpacing: 0,
    } as TextOverlay;
    return overlay;
  }
  if (block.type === 'image') {
    const overlay: ImageOverlay = {
      ...base,
      type: 'image',
      // Phase D: wire embedded picture crop URI when the parser provided one.
      src: block.meta?.imageUri ?? '',
      fit: 'contain',
    } as ImageOverlay;
    return overlay;
  }
  if (block.type === 'table') {
    const td = block.meta?.tableData;
    const numCols = td?.numCols ?? 0;
    const headerRows = td?.headerRows ?? 0;
    const firstHeaderRow = headerRows > 0 ? td?.rows[0] ?? [] : [];
    const columns = Array.from({ length: numCols }, (_, i) => ({
      key: `c${i}`,
      label: (firstHeaderRow[i] ?? `Column ${i + 1}`).trim() || `Column ${i + 1}`,
      align: 'left' as const,
      format: 'raw' as const,
    }));
    // Skip header rows from `rows` (they live in `columns.label`).
    const bodyRows = (td?.rows ?? []).slice(headerRows).map((row) => {
      const out = row.slice(0, numCols);
      while (out.length < numCols) out.push('');
      return out;
    });
    const overlay: TableOverlay = {
      ...base,
      type: 'table',
      columns,
      rows: bodyRows,
      showHeader: headerRows > 0 || numCols > 0,
      headerHeight: 22,
      rowHeight: 20,
      fontSize: block.style?.fontSize ?? 9,
      headerFontWeight: 'bold',
      borderWidth: 0.5,
      cellPadding: 6,
      cellSpans: (td?.cells ?? [])
        .filter((cell) => cell.rowSpan > 1 || cell.colSpan > 1)
        .map((cell) => ({
          row: cell.row - headerRows,
          col: cell.col,
          rowSpan: cell.rowSpan,
          colSpan: cell.colSpan,
        }))
        .filter((cell) => cell.row >= -1),
    } as TableOverlay;
    return overlay;
  }
  return null;
}

function pageWarnings(
  pageNo: number,
  blocks: RawImportBlock[],
  lockThreshold: number,
  doc: DoclingDocument,
): ImportWarning[] {
  const warnings: ImportWarning[] = [];
  const pageConfidence = doc.summary?.page_confidence?.find((p) => Number(p.page_no) === pageNo);
  const avgTextConfidence = typeof pageConfidence?.avg_text_confidence === 'number'
    ? pageConfidence.avg_text_confidence
    : null;
  if (avgTextConfidence != null && avgTextConfidence < 0.6) {
    warnings.push({
      code: 'docling.page_low_text_confidence',
      severity: 'warning',
      pageId: pageId(pageNo),
      message: `Page ${pageNo} average text confidence is ${Math.round(avgTextConfidence * 100)}%; manual review is required.`,
    });
  }
  if (doc.summary?.ocr_pages?.includes(pageNo)) {
    warnings.push({
      code: 'docling.page_ocr_detected',
      severity: 'info',
      pageId: pageId(pageNo),
      message: `Page ${pageNo} used OCR text extraction; verify text fidelity against the page image.`,
    });
  }
  const lowConf = blocks.filter((b) => b.confidence < lockThreshold).length;
  if (!blocks.length) return warnings;
  const ratio = lowConf / blocks.length;
  if (ratio >= 0.2) {
    warnings.push({
      code: 'docling.low_confidence_majority',
      severity: 'warning',
      pageId: pageId(pageNo),
      message: `Docling reported low confidence on ${Math.round(ratio * 100)}% of blocks; review the editable overlays carefully.`,
    });
  }
  return warnings;
}

function pagePlanForPage(
  page: DoclingPageInfo,
  blocks: RawImportBlock[],
  opts: DoclingPlanOptions,
  doc: DoclingDocument,
): TemplateImportPagePlan {
  const lockThreshold = opts.lockBelowConfidence ?? DEFAULT_LOCK_THRESHOLD;
  const raster = opts.rastersByPage?.[page.page_no];
  const overlays: Overlay[] = [];
  for (const block of blocks) {
    let locked: boolean;
    if (block.meta?.pageRegion) {
      // Phase B: page headers/footers always lock — they're master-page furniture
      // and shouldn't be nudged on individual pages.
      locked = true;
    } else if (opts.mode === 'pixel-perfect') locked = true;
    else if (opts.mode === 'hybrid') locked = block.confidence < lockThreshold;
    else locked = false; // semantic
    const ov = blockToOverlay(block, locked);
    if (ov) overlays.push(ov);
  }
  return {
    id: pageId(page.page_no),
    name: `Page ${page.page_no}`,
    width: page.size.width,
    height: page.size.height,
    background: {
      color: '#FFFFFF',
      imageUrl: opts.mode === 'semantic' ? '' : (raster?.dataUrl ?? page.image_uri ?? ''),
      opacity: opts.mode === 'pixel-perfect' ? 1 : opts.mode === 'hybrid' ? 0.85 : 0,
      // Full-page source raster must fill the exact page box, never crop/stretch.
      ...(opts.mode === 'semantic' ? {} : { imageFit: 'fill' as const }),
    },
    overlays,
    sourcePageId: pageId(page.page_no),
    warnings: pageWarnings(page.page_no, blocks, lockThreshold, doc),
  };
}

export function mapDoclingToPagePlan(
  doc: DoclingDocument,
  opts: DoclingPlanOptions,
): TemplateImportPlan {
  const mapped = mapDoclingToRawBlocks(doc);
  const pages: TemplateImportPagePlan[] = mapped.pages.map((page) =>
    pagePlanForPage(page, mapped.byPage[page.page_no] ?? [], opts, doc),
  );
  const warnings: ImportWarning[] = pages.flatMap((p) => p.warnings);
  const editableElementsCreated = pages.reduce(
    (acc, p) => acc + p.overlays.filter((o) => !o.locked).length,
    0,
  );
  const lockThreshold = opts.lockBelowConfidence ?? DEFAULT_LOCK_THRESHOLD;
  const allConfidences = mapped.all.map((b) => b.confidence).filter((n) => Number.isFinite(n));
  const meanConfidence = allConfidences.length
    ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
    : 0.7;
  return {
    version: 1,
    importId: opts.importId,
    pages,
    warnings,
    confidenceScore: Number(meanConfidence.toFixed(3)),
    importSummary: {
      visualFidelityMode:
        opts.mode === 'semantic' ? 'semantic' : opts.mode === 'pixel-perfect' ? 'background-first' : 'hybrid',
      editableElementsCreated,
      manualReviewRequired:
        warnings.length > 0 || mapped.all.some((b) => b.confidence < lockThreshold),
      repairPassesApplied: 0,
    },
  };
}
