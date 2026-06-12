/**
 * Feature-flag aware entry point for PDF → ReportTemplate imports.
 *
 * Picks between the legacy in-browser pdf.js extractor and the new async
 * Docling pipeline (Cloud Run sidecar + `pdf-parse-dispatch`). Callers always
 * get the same `ImportResult` shape, so the editor doesn't need to care.
 */
import { extractPdfToTemplate, type ImportOptions, type ImportResult } from './extractPdfToTemplate';
import { extractPdfViaDocling } from './extractPdfViaDocling';
import { resolvePdfImportEngine, type PdfImportEngine } from '@/lib/featureFlags/pdfImportEngine';

export type { ImportOptions, ImportResult } from './extractPdfToTemplate';

export interface RoutedImportOptions extends ImportOptions {
  /** Force a specific engine, bypassing the feature flag. */
  engine?: PdfImportEngine;
  /** Used by the feature-flag resolver. */
  isSuperadmin?: boolean;
}

export async function extractPdfToTemplateRouted(
  file: File,
  options: RoutedImportOptions,
): Promise<ImportResult & { engine: PdfImportEngine }> {
  const engine = options.engine
    ?? await resolvePdfImportEngine({ userId: options.userId, isSuperadmin: options.isSuperadmin });

  // OCR mode keeps the legacy Tesseract path — Docling has no equivalent we
  // surface to the editor yet, and forcing it would silently change behaviour.
  if (engine === 'docling' && options.mode !== 'ocr') {
    const result = await extractPdfViaDocling(file, options);
    return { ...result, engine: 'docling' };
  }
  const result = await extractPdfToTemplate(file, options);
  return { ...result, engine: 'legacy' };
}
