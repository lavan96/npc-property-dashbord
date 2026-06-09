/**
 * Client-side PDF → ReportTemplate converter.
 *
 * Two fidelity modes:
 *   - 'semantic': Extracts text runs + images at exact coordinates as
 *     editable overlays. Best for digital-native PDFs.
 *   - 'pixel':    Rasterises each page at high DPI as a page background,
 *     then places transparent / coloured text overlays on top so the
 *     output is visually identical AND still editable. Best for heavily
 *     designed brochures or PDFs with embedded custom fonts.
 *   - 'hybrid':   Both — raster background + text overlays. Toggle bg per
 *     page in the editor.
 */
import * as pdfjsLib from 'pdfjs-dist';
import type { ReportTemplate, Page, Block, Overlay } from '@/lib/reportTemplate/templateSchema';
import { supabase } from '@/integrations/supabase/client';
import { resolveFontFamily } from './fontResolver';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export type FidelityMode = 'semantic' | 'pixel' | 'hybrid' | 'ocr';

export interface ImportProgress {
  phase: 'reading' | 'extracting' | 'rasterizing' | 'ocr' | 'uploading' | 'finalizing' | 'done';
  page?: number;
  totalPages?: number;
  message?: string;
}

export interface ImportOptions {
  mode: FidelityMode;
  rasterDpi?: number;        // default 180
  templateName?: string;
  onProgress?: (p: ImportProgress) => void;
  userId?: string | null;
  /** When set, the existing template is updated (resync) instead of creating a new one. */
  targetTemplateId?: string;
  /** OCR language (Tesseract); default 'eng'. */
  ocrLang?: string;
}

export interface ImportResult {
  template: { id: string; name: string };
  importId: string;
  pageCount: number;
  fidelityReport: {
    semanticPages: number;
    rasterizedPages: number;
    textBlocks: number;
    images: number;
    fontsSubstituted: string[];
  };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function invokeImport(body: any) {
  const { data, error } = await supabase.functions.invoke('template-import-pdf', { body });
  if (error) throw new Error(error.message || 'template-import-pdf failed');
  if (data?.error) throw new Error(data.error);
  return data;
}

function bytesToBase64(bytes: Uint8Array): string {
  // chunked to avoid call-stack overflow on large pages
  const CHUNK = 0x8000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  return bytesToBase64(buf);
}

function colorFromArray(rgb: number[] | undefined): string {
  if (!rgb || rgb.length < 3) return '#000000';
  const [r, g, b] = rgb;
  const to255 = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  // pdfjs sometimes returns 0-255 already
  const norm = (v: number) => (v <= 1 ? to255(v) : Math.round(v));
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(norm(r))}${h(norm(g))}${h(norm(b))}`;
}

// ─── main ────────────────────────────────────────────────────────────────────

export async function extractPdfToTemplate(
  file: File,
  options: ImportOptions,
): Promise<ImportResult> {
  const onProgress = options.onProgress ?? (() => {});
  const dpi = options.rasterDpi ?? 180;
  const mode = options.mode;

  onProgress({ phase: 'reading', message: 'Reading PDF…' });
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf, useSystemFonts: true }).promise;
  const totalPages = pdf.numPages;

  // Register import row
  const createRes = await invokeImport({
    operation: 'create_import',
    user_id: options.userId ?? null,
    fidelity_mode: mode,
    source_filename: file.name,
    source_size_bytes: file.size,
    page_count: totalPages,
  });
  const importId: string = createRes.record.id;

  const pages: Page[] = [];
  const fontsUsed = new Set<string>();
  const fontsSubstituted = new Set<string>();
  let textBlocks = 0;
  let imagesFound = 0;
  let rasterized = 0;
  let semantic = 0;

  try {
    for (let pageIndex = 1; pageIndex <= totalPages; pageIndex++) {
      onProgress({ phase: 'extracting', page: pageIndex, totalPages });
      const page = await pdf.getPage(pageIndex);
      const viewport = page.getViewport({ scale: 1 });
      const pageWidth = viewport.width;
      const pageHeight = viewport.height;

      const overlays: Overlay[] = [];

      if (mode === 'ocr') {
        // Skip pdfjs text extraction — rely on Tesseract on the raster image.
        // (Overlays populated in the rasterize block below.)
      } else {
        // Track A: extract text runs
        const content = await page.getTextContent({ includeMarkedContent: false } as any);
        for (const item of content.items as any[]) {
          if (!('str' in item) || !item.str || !item.transform) continue;
          const str = item.str as string;
          if (!str.trim()) continue;
          const t = item.transform as number[]; // [a,b,c,d,e,f]
          const fontSize = Math.hypot(t[2], t[3]) || Math.abs(t[3]) || 12;
          const x = t[4];
          // pdfjs y is text baseline from bottom-left
          const yBaseline = t[5];
          const yTop = pageHeight - yBaseline - fontSize;
          const width = (item.width as number) || fontSize * str.length * 0.5;
          const height = (item.height as number) || fontSize * 1.2;

          const styles = (content.styles as Record<string, any>) || {};
          const styleEntry = styles[item.fontName] || {};
          const psName = styleEntry.fontFamily || item.fontName || 'Helvetica';
          const resolved = resolveFontFamily(psName);
          fontsUsed.add(psName);
          if (resolved.substituted) fontsSubstituted.add(psName);

          overlays.push({
            id: crypto.randomUUID(),
            type: 'text',
            x,
            y: yTop,
            width: Math.max(width + 4, fontSize * 2),
            height: Math.max(height, fontSize * 1.2),
            rotation: 0,
            opacity: 1,
            content: str,
            fontFamily: resolved.family,
            fontSize,
            fontWeight: /bold|black|heavy/i.test(psName) ? 'bold' : 'normal',
            fontStyle: /italic|oblique/i.test(psName) ? 'italic' : 'normal',
            color: '#111111',
            align: 'left',
            lineHeight: 1.2,
            letterSpacing: 0,
          } as Overlay);
          textBlocks++;
        }
      }

      // Optional Track B raster (also used for OCR mode as the source image)
      let backgroundImageUrl: string | undefined;
      const needRaster = mode === 'pixel' || mode === 'hybrid' || mode === 'ocr';
      let rasterCanvas: HTMLCanvasElement | null = null;
      if (needRaster) {
        onProgress({ phase: 'rasterizing', page: pageIndex, totalPages });
        const scale = dpi / 72;
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp } as any).promise;
        rasterCanvas = canvas;

        if (mode === 'pixel' || mode === 'hybrid') {
          const blob: Blob = await new Promise((resolve) =>
            canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.85),
          );
          const b64 = await blobToBase64(blob);
          onProgress({ phase: 'uploading', page: pageIndex, totalPages });
          const up = await invokeImport({
            operation: 'upload_asset',
            import_id: importId,
            kind: 'page',
            page_index: pageIndex,
            seq: 0,
            content_type: 'image/jpeg',
            data_base64: b64,
          });
          backgroundImageUrl = up.url;
          rasterized++;
        } else {
          semantic++;
        }
      } else {
        semantic++;
      }

      // OCR pass — recognise text on the rasterised page and add as overlays
      if (mode === 'ocr' && rasterCanvas) {
        onProgress({ phase: 'ocr', page: pageIndex, totalPages, message: 'Running OCR…' });
        try {
          const tess: any = await import(/* @vite-ignore */ 'tesseract.js');
          const worker = await tess.createWorker(options.ocrLang ?? 'eng');
          const { data } = await worker.recognize(rasterCanvas);
          await worker.terminate();
          const ratio = pageWidth / rasterCanvas.width; // pt per px
          const words: any[] = data?.words ?? [];
          for (const w of words) {
            if (!w?.text?.trim()) continue;
            const bbox = w.bbox || {};
            const x = (bbox.x0 ?? 0) * ratio;
            const y = (bbox.y0 ?? 0) * ratio;
            const ww = ((bbox.x1 ?? 0) - (bbox.x0 ?? 0)) * ratio;
            const hh = ((bbox.y1 ?? 0) - (bbox.y0 ?? 0)) * ratio;
            const fontSize = Math.max(8, hh * 0.85);
            overlays.push({
              id: crypto.randomUUID(),
              type: 'text',
              x, y,
              width: Math.max(ww + 2, fontSize),
              height: Math.max(hh, fontSize * 1.2),
              rotation: 0,
              opacity: 1,
              content: w.text,
              fontFamily: 'Helvetica',
              fontSize,
              fontWeight: 'normal',
              fontStyle: 'normal',
              color: '#111111',
              align: 'left',
              lineHeight: 1.2,
              letterSpacing: 0,
            } as Overlay);
            textBlocks++;
          }
        } catch (err) {
          // Surface the failure instead of swallowing it silently: the page
          // simply gets no OCR text overlays, which the user should know about.
          console.warn('[ocr] failed on page', pageIndex, err);
          onProgress({
            phase: 'ocr',
            page: pageIndex,
            totalPages,
            message: `OCR could not read page ${pageIndex + 1} — it will have no text overlays.`,
          });
        }
      }

      if (rasterCanvas) {
        rasterCanvas.width = 0;
        rasterCanvas.height = 0;
        rasterCanvas = null;
      }

      // Wrap overlays in a single 'free' block so they are positioned absolutely
      const freeBlock: Block = {
        id: crypto.randomUUID(),
        type: 'free',
        props: {},
        overlays,
      } as Block;

      const newPage: Page = {
        id: crypto.randomUUID(),
        name: `Page ${pageIndex}`,
        size: { width: pageWidth, height: pageHeight },
        background: backgroundImageUrl ? { imageUrl: backgroundImageUrl } : {},
        blocks: [freeBlock],
      };
      pages.push(newPage);
    }

    const template: ReportTemplate = {
      version: 1,
      tokens: {
        colors: { primary: '#BF9B50', bg: '#FFFFFF', text: '#111111', muted: '#666666' },
        fonts: { heading: 'Helvetica', body: 'Helvetica' },
        spacing: { gutter: 16 },
      },
      pages,
      slots: {},
      meta: { title: options.templateName ?? file.name.replace(/\.pdf$/i, '') },
    };

    onProgress({ phase: 'finalizing', message: options.targetTemplateId ? 'Re-syncing template…' : 'Creating template…' });
    const finRes = options.targetTemplateId
      ? await invokeImport({
          operation: 'resync',
          import_id: importId,
          template_id: options.targetTemplateId,
          schema: template,
          page_count: totalPages,
          source_filename: file.name,
          note: `Re-synced from ${file.name}`,
        })
      : await invokeImport({
          operation: 'finalize',
          import_id: importId,
          name: options.templateName ?? file.name.replace(/\.pdf$/i, ''),
          schema: template,
          page_count: totalPages,
          source_filename: file.name,
        });

    onProgress({ phase: 'done', totalPages });
    return {
      template: { id: finRes.template.id, name: finRes.template.name ?? options.templateName ?? file.name },
      importId,
      pageCount: totalPages,
      fidelityReport: {
        semanticPages: semantic,
        rasterizedPages: rasterized,
        textBlocks,
        images: imagesFound,
        fontsSubstituted: Array.from(fontsSubstituted),
      },
    };
  } catch (err) {
    await invokeImport({
      operation: 'fail',
      import_id: importId,
      error: (err as Error).message,
    }).catch(() => {});
    throw err;
  }
}
