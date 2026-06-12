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
    name: block.text ? block.text.slice(0, 48) : block.type,
  } as const;

  if (block.type === 'text') {
    const overlay: TextOverlay = {
      ...base,
      type: 'text',
      content: block.text ?? '',
      fontFamily: block.style?.fontFamily ?? 'Helvetica',
      fontSize: block.style?.fontSize ?? 11,
      fontWeight: (block.style?.fontWeight === 'bold' ? 'bold' : 'normal') as 'normal' | 'bold',
      fontStyle: 'normal',
      color: block.style?.color ?? '#111111',
      align: (block.style?.textAlign ?? 'left') as TextOverlay['align'],
      lineHeight: 1.3,
      letterSpacing: 0,
    } as TextOverlay;
    return overlay;
  }
  if (block.type === 'image') {
    const overlay: ImageOverlay = {
      ...base,
      type: 'image',
      src: '',
      fit: 'contain',
    } as ImageOverlay;
    return overlay;
  }
  if (block.type === 'table') {
    const overlay: TableOverlay = {
      ...base,
      type: 'table',
      columns: [],
      rows: [],
      showHeader: true,
      headerHeight: 22,
      rowHeight: 20,
      fontSize: block.style?.fontSize ?? 9,
      headerFontWeight: 'bold',
      borderWidth: 0.5,
      cellPadding: 6,
    } as TableOverlay;
    return overlay;
  }
  return null;
}

function pageWarnings(blocks: RawImportBlock[], lockThreshold: number): ImportWarning[] {
  const lowConf = blocks.filter((b) => b.confidence < lockThreshold).length;
  if (!blocks.length) return [];
  const ratio = lowConf / blocks.length;
  if (ratio < 0.2) return [];
  return [{
    code: 'docling.low_confidence_majority',
    severity: 'warning',
    message: `Docling reported low confidence on ${Math.round(ratio * 100)}% of blocks; review the editable overlays carefully.`,
  }];
}

function pagePlanForPage(
  page: DoclingPageInfo,
  blocks: RawImportBlock[],
  opts: DoclingPlanOptions,
): TemplateImportPagePlan {
  const lockThreshold = opts.lockBelowConfidence ?? DEFAULT_LOCK_THRESHOLD;
  const raster = opts.rastersByPage?.[page.page_no];
  const overlays: Overlay[] = [];
  for (const block of blocks) {
    let locked: boolean;
    if (opts.mode === 'pixel-perfect') locked = true;
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
    },
    overlays,
    sourcePageId: pageId(page.page_no),
    warnings: pageWarnings(blocks, lockThreshold),
  };
}

export function mapDoclingToPagePlan(
  doc: DoclingDocument,
  opts: DoclingPlanOptions,
): TemplateImportPlan {
  const mapped = mapDoclingToRawBlocks(doc);
  const pages: TemplateImportPagePlan[] = mapped.pages.map((page) =>
    pagePlanForPage(page, mapped.byPage[page.page_no] ?? [], opts),
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
