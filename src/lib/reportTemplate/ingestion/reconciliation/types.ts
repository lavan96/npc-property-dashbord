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

export type RawImportBlockType = 'text' | 'image' | 'shape' | 'table' | 'unknown';
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
    color?: string;
    backgroundColor?: string;
    textAlign?: 'left' | 'center' | 'right' | 'justify';
  };
  confidence: number;
  source: RawImportBlockSource;
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

export interface ReconciliationRequest {
  importAsset: ImportAsset;
  manifests: RawImportManifest[];
  vision?: VisionLayoutAnalysis[];
  existingTemplate?: ReportTemplate;
  constraints?: Record<string, unknown>;
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
