/**
 * Browser PDF text extraction compatibility shim.
 *
 * The bundled PDF.js dependency was retired with Docling Wave F7. A few
 * non-template experiences still need lightweight browser text extraction, so
 * this module loads PDF.js from the same CDN-backed utility path used by PDF
 * image previews instead of adding pdf.js back to the application bundle.
 */

const PDFJS_VERSION = '4.4.168';
const PDFJS_CDN_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

let pdfjsPromise: Promise<any> | null = null;

async function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const mod = await import(/* @vite-ignore */ `${PDFJS_CDN_BASE}/pdf.min.mjs`);
      mod.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN_BASE}/pdf.worker.min.mjs`;
      return mod;
    })();
  }
  return pdfjsPromise;
}

export interface ExtractionResult {
  text: string;
  totalPages: number;
  extractedPages: number;
}

export type ProgressCallback = (current: number, total: number) => void;

export async function extractPdfTextClientSide(
  file: File,
  onProgress?: ProgressCallback,
): Promise<ExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfjs = await getPdfJs();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer, useSystemFonts: true }).promise;
  const totalPages = pdf.numPages;

  const pageTexts: string[] = [];
  let extractedPages = 0;

  for (let i = 1; i <= totalPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let lastY: number | null = null;
      const parts: string[] = [];

      for (const item of content.items) {
        if ('str' in item && item.str) {
          const y = (item as any).transform?.[5];
          if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) parts.push('\n');
          parts.push(item.str);
          if (y !== undefined) lastY = y;
        }
      }

      const pageText = parts.join(' ').replace(/ \n /g, '\n').trim();
      if (pageText) {
        pageTexts.push(`--- Page ${i} ---\n${pageText}`);
        extractedPages++;
      }
    } finally {
      onProgress?.(i, totalPages);
    }
  }

  return { text: pageTexts.join('\n\n'), totalPages, extractedPages };
}
