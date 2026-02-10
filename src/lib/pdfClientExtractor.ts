/**
 * Client-side PDF text extraction using pdfjs-dist.
 * 
 * This runs entirely in the browser, eliminating edge function timeouts
 * and enabling extraction from PDFs of any size (100+ pages).
 */
import * as pdfjsLib from 'pdfjs-dist';

// Use the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface ExtractionResult {
  text: string;
  totalPages: number;
  extractedPages: number;
}

export type ProgressCallback = (current: number, total: number) => void;

/**
 * Extract all text from a PDF file client-side using pdfjs-dist.
 * Handles any size document by processing page-by-page.
 */
export async function extractPdfTextClientSide(
  file: File,
  onProgress?: ProgressCallback
): Promise<ExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;

  console.log(`[pdfClientExtractor] Starting extraction: ${totalPages} pages, ${(file.size / 1024 / 1024).toFixed(1)}MB`);

  const pageTexts: string[] = [];
  let extractedPages = 0;

  for (let i = 1; i <= totalPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      
      // Build page text from items, preserving spacing
      let lastY: number | null = null;
      const parts: string[] = [];
      
      for (const item of content.items) {
        if ('str' in item && item.str) {
          const y = (item as any).transform?.[5];
          // Detect line breaks from Y-position changes
          if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) {
            parts.push('\n');
          }
          parts.push(item.str);
          if (y !== undefined) lastY = y;
        }
      }
      
      const pageText = parts.join(' ').replace(/ \n /g, '\n').trim();
      if (pageText) {
        pageTexts.push(`--- Page ${i} ---\n${pageText}`);
        extractedPages++;
      }
      
      onProgress?.(i, totalPages);
    } catch (err) {
      console.warn(`[pdfClientExtractor] Failed to extract page ${i}:`, err);
      onProgress?.(i, totalPages);
    }
  }

  const fullText = pageTexts.join('\n\n');
  console.log(`[pdfClientExtractor] Extracted ${fullText.length} chars from ${extractedPages}/${totalPages} pages`);

  return {
    text: fullText,
    totalPages,
    extractedPages,
  };
}
