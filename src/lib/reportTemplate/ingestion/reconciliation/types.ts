import type { ReportTemplate, Overlay } from '../../templateSchema';

export type ImportFileType = 'pdf' | 'image';
export type ImportPageSource = 'pdf-render' | 'image-normalized';
export type ImportWarningSeverity = 'info' | 'warning' | 'error';

export interface ImportWarning {
  code: string;
  message: string;
  severity: ImportWarningSeverity;
  pageId?: string;
  blockId?: string;
}

export interface ImportPage {
  id: string;
  pageIndex: number;
  width: number;
  height: number;
  referenceImageUrl: string;
  dpiScale: number;
  source: ImportPageSource;
  backgroundColor?: string;
}

export interface ImportAsset {
  fileId: string;
  fileName?: string;
  fileType: ImportFileType;
  pages: ImportPage[];
  createdAt: string;
}

export type RawImportBlockType = 'text' | 'image' | 'shape' | 'table' | 'formula' | 'code' | 'vector' | 'unknown';
export type RawImportBlockSource = 'pdf-text' | 'ocr' | 'vision' | 'detected' | 'dom';

export interface ImportBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RawImportBlock {
  id: string;
  type: RawImportBlockType;
  text?: string;
  bbox: ImportBBox;
  style?: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number | 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
    color?: string;
    backgroundColor?: string;
    textAlign?: 'left' | 'center' | 'right' | 'justify';
    /** Phase 2: real typography from the PyMuPDF span pass. */
    lineHeight?: number;     // multiplier
    letterSpacing?: number;  // pt
  };
  confidence: number;
  source: RawImportBlockSource;
  /**
   * Optional structural metadata preserved from the parser (Docling, etc).
   * Consumers may use it to build richer overlays without re-inferring structure.
   */
  meta?: {
    /** Original semantic label (e.g. 'title', 'section_header', 'list_item'). */
    label?: string;
    /** Heading depth 1–6 when label is a heading. */
    headingLevel?: number;
    /** Stable id grouping contiguous list_items into a single visual list. */
    listGroupId?: string;
    /** Monotonic reading-order index within the page (Docling document order). */
    readingOrder?: number;
    /** Parsed table cell grid — row-major strings, plus the header row count. */
    tableData?: {
      rows: string[][];
      headerRows: number;
      numRows: number;
      numCols: number;
      cells?: Array<{
        text: string;
        row: number;
        col: number;
        rowSpan: number;
        colSpan: number;
        columnHeader?: boolean;
        rowHeader?: boolean;
      }>;
    };
    /** Caption text linked to this image/table item (when the parser provides it). */
    caption?: string;
    /** Phase B: VLM-generated alt-text/description for images. */
    altText?: string;
    /** Phase B: picture classifier label (e.g. chart, logo, photo, diagram, map). */
    pictureClass?: string;
    /** Phase B: stable group id for caption↔figure / header↔footer co-movement. */
    groupId?: string;
    /** Phase B: master-page eligibility — 'header' or 'footer'. */
    pageRegion?: 'header' | 'footer';
    /** Phase D: LaTeX representation for `formula` blocks. */
    latex?: string;
    /** Phase D: detected language for `code` blocks (python, sql, …). */
    codeLanguage?: string;
    /** Phase D: data URI / storage URI for the extracted picture crop. */
    imageUri?: string;
    /** Wave F3: diagnostics-bucket object path for the extracted picture crop. */
    imageDiagnosticsPath?: string;
    /** Phase D: BCP-47 language detected for this block. */
    language?: string;
    /** Phase D: cross-reference target ($ref form). */
    xref?: string;
    /** Phase 2: vector geometry for `vector` blocks (SVG paths + viewBox). */
    vector?: {
      viewBox: string;
      paths: Array<{
        d: string;
        fill?: string;
        stroke?: string;
        strokeWidth?: number;
        fillRule?: 'nonzero' | 'evenodd';
        opacity?: number;
      }>;
    };
  };
}


export interface RawImportManifest {
  importId: string;
  page: {
    id: string;
    pageIndex: number;
    width: number;
    height: number;
    backgroundColor?: string;
    referenceImageUrl: string;
    dpiScale: number;
  };
  palette: string[];
  rawBlocks: RawImportBlock[];
  extractionSummary: {
    hasPdfTextLayer: boolean;
    hasOcrTextLayer: boolean;
    hasEmbeddedImages: boolean;
    blockCount: number;
    textBlockCount: number;
    imageBlockCount: number;
  };
  warnings: ImportWarning[];
}

export interface TypographyRole {
  id: string;
  role: 'title' | 'heading' | 'subheading' | 'body' | 'caption' | 'label' | 'unknown';
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | 'normal' | 'bold';
  color?: string;
}

export interface VisionSection {
  id: string;
  role: 'hero' | 'header' | 'footer' | 'kpi-card' | 'body' | 'table' | 'map' | 'decorative' | 'unknown';
  bbox: ImportBBox;
  confidence: number;
  rawBlockIds?: string[];
}

export interface VisionLayoutAnalysis {
  pageId: string;
  pageType: 'cover' | 'market_summary' | 'suburb_analysis' | 'cashflow' | 'appendix' | 'unknown';
  sections: VisionSection[];
  designSystem: {
    palette: string[];
    typographyRoles: TypographyRole[];
    spacingStyle: 'tight' | 'balanced' | 'luxury' | 'unknown';
  };
  recommendations: {
    keepAsBackground: string[];
    makeEditable: string[];
    needsManualReview: string[];
  };
  confidence: number;
}

export interface TemplateImportPagePlan {
  id: string;
  name: string;
  width: number;
  height: number;
  background: {
    color?: string;
    imageUrl: string;
    opacity?: number;
    /** Sizing for the background image; 'fill' for full-page source rasters. */
    imageFit?: 'cover' | 'contain' | 'fill';
  };
  overlays: Overlay[];
  sourcePageId: string;
  warnings: ImportWarning[];
}

export interface TemplateImportPlan {
  version: 1;
  importId: string;
  pages: TemplateImportPagePlan[];
  warnings: ImportWarning[];
  confidenceScore: number;
  importSummary: {
    visualFidelityMode: 'background-first' | 'hybrid' | 'semantic';
    editableElementsCreated: number;
    manualReviewRequired: boolean;
    repairPassesApplied: number;
  };
}

export interface PlanValidationResult {
  ok: boolean;
  errors: string[];
  warnings: ImportWarning[];
}

export interface ParserQualitySummary {
  engine?: string;
  engineVersion?: string | null;
  textChars?: number;
  ocrChars?: number;
  ocrPages?: number[];
  totalPages?: number;
  ocrRatio?: number | null;
  avgTextConfidence?: number | null;
  tableCount?: number;
  pictureCount?: number;
  lowConfidencePages?: Array<{ pageNo: number; avgTextConfidence: number }>;
}

export interface ReconciliationRequest {
  importAsset: ImportAsset;
  manifests: RawImportManifest[];
  vision?: VisionLayoutAnalysis[];
  existingTemplate?: ReportTemplate;
  constraints?: Record<string, unknown>;
  /** Wave F4: parser quality roll-up (Docling summary) used by AI reconciliation. */
  parserSummary?: ParserQualitySummary;
}

export type TemplateImportPatch =
  | {
      operation: 'updatePageBackground';
      pageId: string;
      changes: { color?: string; imageUrl?: string; opacity?: number };
    }
  | {
      operation: 'updateOverlay';
      pageId: string;
      blockId: string;
      overlayId: string;
      changes: Partial<Overlay>;
    }
  | {
      operation: 'addOverlay';
      pageId: string;
      blockId: string;
      overlay: Overlay;
    }
  | {
      operation: 'removeOverlay';
      pageId: string;
      blockId: string;
      overlayId: string;
      reason: string;
    };
