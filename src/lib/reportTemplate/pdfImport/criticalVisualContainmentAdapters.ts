/**
 * Pure adapters for critical-visual-containment-v1 (E0).
 *
 * Assemble the small, normalized `ContainmentPageInput` the classifier consumes
 * from the two evidence sources — the immutable source Docling document and the
 * candidate ReportTemplate — plus the durable source-raster guarantee helper.
 * No signed URLs, image bytes, or document text bodies enter the persisted
 * assessment; adapters extract only counts, flags, small label lists, and bboxes.
 */
import type { Page, ReportTemplate, Overlay } from '../templateSchema';
import type {
  DoclingDocument,
  DoclingPictureItem,
  DoclingProvenance,
  PdfImportRasterRef,
  RasterManifest,
} from './docling/doclingTypes';
import {
  hasStrongChartTerm,
  type ContainmentCandidateOverlay,
  type ContainmentPageInput,
  type ContainmentSourceRegion,
  type CriticalContentKind,
  type CriticalContainmentQualityCoverage,
} from './criticalVisualContainment.pure';

const CHART_CLASS_RE = /chart|graph|plot|bar|line|pie|scatter|histogram|diagram/i;
const LOGO_CLASS_RE = /logo|brand|icon/i;
const NUMERIC_LABEL_RE = /[$£€]|\d[\d,]*\.?\d*\s*%|\b\d{4}\b|\d[\d,]{2,}/;

function provPage(prov?: DoclingProvenance[]): number | null {
  const p = prov?.[0]?.page_no;
  return typeof p === 'number' && Number.isFinite(p) ? p : null;
}

function bboxFromProv(prov?: DoclingProvenance[]): ContainmentSourceRegion['bbox'] | undefined {
  const b = prov?.[0]?.bbox;
  if (!b) return undefined;
  const x = Math.min(b.l, b.r);
  const y = Math.min(b.t, b.b);
  return { x, y, width: Math.abs(b.r - b.l), height: Math.abs(b.b - b.t) };
}

function pictureClass(pic: DoclingPictureItem): string | null {
  const direct = pic.classification?.predicted_class;
  if (typeof direct === 'string' && direct) return direct.toLowerCase();
  const best = pic.classification?.predicted_classes
    ?.slice()
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0]?.class_name;
  return typeof best === 'string' && best ? best.toLowerCase() : null;
}

function pictureCaptionTerms(pic: DoclingPictureItem): string[] {
  const terms: string[] = [];
  if (typeof pic.caption === 'string' && pic.caption) terms.push(pic.caption);
  for (const a of pic.annotations ?? []) {
    if (typeof a?.text === 'string' && a.text) terms.push(a.text);
  }
  return terms;
}

export interface SourceCriticalEvidence {
  regions: ContainmentSourceRegion[];
  pageTitleChartTerms: string[];
  hasNumericLabels: boolean;
}

/**
 * Extract per-page source critical evidence from the Docling document: tables,
 * pictures (with chart/logo classification + caption), dense vector clusters, and
 * page-title chart terms. Deterministic; returns a page-number-keyed map.
 */
export function buildSourceCriticalEvidenceByPage(
  doc: DoclingDocument | null | undefined,
): Record<number, SourceCriticalEvidence> {
  const byPage: Record<number, SourceCriticalEvidence> = {};
  const ensure = (page: number): SourceCriticalEvidence => (
    byPage[page] ??= { regions: [], pageTitleChartTerms: [], hasNumericLabels: false }
  );
  if (!doc) return byPage;

  // Tables.
  (doc.tables ?? []).forEach((table, idx) => {
    const page = provPage(table.prov);
    if (page === null) return;
    const cells = table.data?.table_cells ?? [];
    const hasHeaderCells = cells.some((c) => c.column_header === true || c.row_header === true);
    ensure(page).regions.push({
      id: table.self_ref ?? `source-table-${page}-${idx}`,
      kind: 'table',
      pageNumber: page,
      hasCrop: false,
      tableRowCount: Number(table.data?.num_rows ?? 0),
      tableColCount: Number(table.data?.num_cols ?? 0),
      tableHasHeaderCells: hasHeaderCells,
      tableCellCount: cells.length,
      bbox: bboxFromProv(table.prov),
    });
    if (typeof table.caption === 'string') ensure(page).pageTitleChartTerms.push(table.caption);
  });

  // Pictures (chart / logo / picture).
  (doc.pictures ?? []).forEach((pic, idx) => {
    const page = provPage(pic.prov);
    if (page === null) return;
    const cls = pictureClass(pic);
    const captionTerms = pictureCaptionTerms(pic);
    const chartLike = (cls != null && CHART_CLASS_RE.test(cls)) || hasStrongChartTerm(captionTerms);
    const kind: CriticalContentKind = chartLike
      ? 'chart'
      : (cls != null && LOGO_CLASS_RE.test(cls)) ? 'logo' : 'picture';
    ensure(page).regions.push({
      id: pic.self_ref ?? `source-picture-${page}-${idx}`,
      kind,
      pageNumber: page,
      hasCrop: Boolean(pic.image?.uri || pic.image?.diagnostics_path),
      classification: cls,
      chartLike,
      captionTerms,
      bbox: bboxFromProv(pic.prov),
    });
  });

  // Dense vector clusters (conservative: many paths in one drawing on a page).
  (doc.vectors ?? []).forEach((vec, idx) => {
    const page = provPage(vec.prov);
    if (page === null) return;
    const pathCount = vec.paths?.length ?? 0;
    if (pathCount >= 14) {
      ensure(page).regions.push({
        id: vec.self_ref ?? `source-vector-${page}-${idx}`,
        kind: 'dense-vector',
        pageNumber: page,
        hasCrop: false,
        bbox: undefined,
      });
    }
  });

  // Page-title chart terms + numeric labels from text items.
  for (const text of doc.texts ?? []) {
    const page = provPage(text.prov);
    if (page === null) continue;
    const label = text.label;
    if (label === 'title' || label === 'section_header' || label === 'caption') {
      if (typeof text.text === 'string') ensure(page).pageTitleChartTerms.push(text.text);
    }
    if (typeof text.text === 'string' && NUMERIC_LABEL_RE.test(text.text)) {
      ensure(page).hasNumericLabels = true;
    }
  }

  return byPage;
}

// ─── Candidate evidence (from the ReportTemplate) ───────────────────────────

function pageOverlays(page: Page): Overlay[] {
  const out: Overlay[] = [];
  for (const block of page.blocks ?? []) {
    for (const ov of block.overlays ?? []) out.push(ov);
  }
  return out;
}

export function buildCandidateOverlaysForPage(page: Page): ContainmentCandidateOverlay[] {
  return pageOverlays(page).map((ov): ContainmentCandidateOverlay => {
    const base = { id: (ov as { id?: string }).id ?? 'overlay', bbox: bboxOfOverlay(ov) };
    if (ov.type === 'image') {
      return { ...base, kind: 'image', hasImageSrc: typeof (ov as { src?: unknown }).src === 'string' && ((ov as { src?: string }).src ?? '').length > 0 };
    }
    if (ov.type === 'table') {
      const t = ov as { columns?: Array<{ label?: string }>; rows?: unknown[]; headerHeight?: number; rowHeight?: number };
      const rowCount = Array.isArray(t.rows) ? t.rows.length : 0;
      const headerHeight = typeof t.headerHeight === 'number' ? t.headerHeight : 22;
      const rowHeight = typeof t.rowHeight === 'number' ? t.rowHeight : 20;
      return {
        ...base, kind: 'table',
        tableColumnLabels: (t.columns ?? []).map((c) => c?.label ?? ''),
        tableRowCount: rowCount,
        tableColCount: (t.columns ?? []).length,
        tableMinHeight: headerHeight + rowCount * rowHeight,
      };
    }
    if (ov.type === 'vector') {
      const v = ov as { paths?: unknown[] };
      return { ...base, kind: 'vector', vectorPathCount: Array.isArray(v.paths) ? v.paths.length : 0 };
    }
    if (ov.type === 'text') return { ...base, kind: 'text' };
    return { ...base, kind: 'other' };
  });
}

function bboxOfOverlay(ov: Overlay): ContainmentCandidateOverlay['bbox'] {
  const o = ov as { x?: number; y?: number; width?: number; height?: number };
  if (typeof o.x !== 'number' || typeof o.y !== 'number' || typeof o.width !== 'number' || typeof o.height !== 'number') {
    return undefined;
  }
  return { x: o.x, y: o.y, width: o.width, height: o.height };
}

// ─── Combined page-input builder ────────────────────────────────────────────

export interface BuildContainmentPageInputArgs {
  page: Page;
  pageNumber: number;
  source?: SourceCriticalEvidence;
  score: number | null;
  qualityCoverage: CriticalContainmentQualityCoverage;
  visualQaRanForPage: boolean;
  visualQaFailed: boolean;
  pageUnscored: boolean;
  sourceRasterAvailable: boolean;
  sourceRasterReadable?: boolean;
}

export function buildContainmentPageInput(args: BuildContainmentPageInputArgs): ContainmentPageInput {
  const candidateOverlays = buildCandidateOverlaysForPage(args.page);
  const source = args.source ?? { regions: [], pageTitleChartTerms: [], hasNumericLabels: false };
  return {
    pageId: args.page.id,
    pageNumber: args.pageNumber,
    candidateOverlays,
    sourceRegions: source.regions,
    pageTitleChartTerms: source.pageTitleChartTerms.map((t) => t.toLowerCase()),
    hasNumericLabels: source.hasNumericLabels,
    score: args.score,
    qualityCoverage: args.qualityCoverage,
    visualQaRanForPage: args.visualQaRanForPage,
    visualQaFailed: args.visualQaFailed,
    pageUnscored: args.pageUnscored,
    sourceRasterAvailable: args.sourceRasterAvailable,
    sourceRasterReadable: args.sourceRasterReadable,
  };
}

// ─── Durable source-raster guarantee ────────────────────────────────────────

export interface EnsureDurableSourceRasterResult {
  page: Page;
  available: boolean;
  /** true when the raster is backed by a durable storage reference (not a data URL). */
  durable: boolean;
  updated: boolean;
  problems: string[];
}

/**
 * Guarantee a page can render a source raster BEFORE a raster-only policy is
 * applied — otherwise a raster-only page with an empty background is a blank
 * page. Prefers a durable `meta.sourceRasterRef` (storage path resolved to a
 * signed URL at render time). A self-contained `data:` URL is accepted as a
 * last resort; an ephemeral `https://` signed URL is NEVER persisted.
 * Never mutates the input page.
 */
export function ensureDurableSourceRasterForPage(
  page: Page,
  ref: PdfImportRasterRef | null | undefined,
  rasterDataUrl?: string | null,
): EnsureDurableSourceRasterResult {
  const meta = (page.meta ?? {}) as Record<string, unknown>;
  const background = (page.background ?? {}) as Record<string, unknown>;
  const existingImage = typeof background.imageUrl === 'string' ? background.imageUrl : '';
  const existingRef = meta.sourceRasterRef as PdfImportRasterRef | undefined;

  // Already renderable (durable ref, or a self-contained data:/https URL).
  if (existingRef?.path) {
    return { page, available: true, durable: true, updated: false, problems: [] };
  }
  if (existingImage && (existingImage.startsWith('data:') || /^https?:\/\//i.test(existingImage))) {
    return { page, available: true, durable: false, updated: false, problems: [] };
  }

  // Attach a durable reference when available.
  if (ref?.path) {
    return {
      page: { ...page, meta: { ...meta, sourceRasterRef: ref } } as Page,
      available: true, durable: true, updated: true, problems: [],
    };
  }

  // Last resort: a self-contained data: URL (persistable, non-durable). A signed
  // https URL is rejected — it would expire in the persisted template.
  if (typeof rasterDataUrl === 'string' && rasterDataUrl.startsWith('data:')) {
    return {
      page: { ...page, background: { ...background, imageUrl: rasterDataUrl } } as Page,
      available: true, durable: false, updated: true, problems: [],
    };
  }

  const problems = ['no_durable_source_raster'];
  if (typeof rasterDataUrl === 'string' && /^https?:\/\//i.test(rasterDataUrl)) {
    problems.push('only_ephemeral_signed_url_available_not_persisted');
  }
  return { page, available: false, durable: false, updated: false, problems };
}

/** Build a durable PdfImportRasterRef map from a raster manifest (page → ref). */
export function buildSourceRasterRefsFromManifest(
  manifest: RasterManifest | null | undefined,
  jobId: string,
  manifestPath: string | null,
): Record<number, PdfImportRasterRef> {
  const out: Record<number, PdfImportRasterRef> = {};
  for (const page of manifest?.pages ?? []) {
    if (page?.page_no == null || !page.path) continue;
    out[page.page_no] = {
      kind: 'pdf_import_raster_ref',
      jobId,
      manifestPath,
      pageNo: page.page_no,
      path: page.path,
      width: Number(page.width ?? 0),
      height: Number(page.height ?? 0),
      mime: page.mime ?? 'image/png',
      dpi: typeof manifest?.dpi === 'number' ? manifest.dpi : null,
    };
  }
  return out;
}
