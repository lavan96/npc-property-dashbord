import type { CdirDocument } from '@/lib/reportTemplate/ingestion/cdir';
import type { CdirFidelityReport } from '@/lib/reportTemplate/ingestion/fidelity';
import type { ImportAsset, RawImportManifest } from '@/lib/reportTemplate/ingestion/reconciliation';

export type FidelityMode = 'semantic' | 'pixel' | 'hybrid' | 'ocr';

export interface ImportProgress {
  phase: 'reading' | 'extracting' | 'rasterizing' | 'ocr' | 'uploading' | 'finalizing' | 'done';
  page?: number;
  totalPages?: number;
  message?: string;
}

export interface ImportOptions {
  mode: FidelityMode;
  rasterDpi?: number;
  templateName?: string;
  onProgress?: (p: ImportProgress) => void;
  userId?: string | null;
  targetTemplateId?: string;
  ocrLang?: string;
  redactPii?: boolean;
}

export interface ImportResult {
  template: { id: string; name: string };
  importId: string;
  pageCount: number;
  cdir?: CdirDocument;
  cdirFidelity?: CdirFidelityReport;
  importAsset?: ImportAsset;
  importManifests?: RawImportManifest[];
  engine?: 'docling';
  fidelityReport: {
    semanticPages: number;
    rasterizedPages: number;
    textBlocks: number;
    images: number;
    vectors: number;
    fontsEmbedded: number;
    fontsSubstituted: string[];
  };
}

export type PdfImportEngine = 'docling';
