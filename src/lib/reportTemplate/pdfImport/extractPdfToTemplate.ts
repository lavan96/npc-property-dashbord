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
import type { ReportTemplate, Page, Block, Overlay, FontFace as FontFaceToken } from '@/lib/reportTemplate/templateSchema';
import { supabase } from '@/integrations/supabase/client';
import { resolveFontFamily } from './fontResolver';
import { spansToTextOverlays, type RawSpan } from './textLayout';
import {
  decodeConstructPath,
  extractVectorOverlays,
  matMul,
  type DrawCommand,
  type Matrix,
  type PathOpCodes,
} from './vectorExtract';
import { collectColorSamples, nearestColor, type TextColorCommand, type ColorSample } from './textColor';
import { imageRectFromCtm } from './imageExtract';
import { buildEmbeddedFontFace, type EmbeddedFontResult } from './fontFaceBuilder';

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
    vectors: number;
    fontsEmbedded: number;
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

// ─── vector geometry (R2) ──────────────────────────────────────────────────────

const hex2 = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');

/** A pdf.js colour-op argument list (RGB) → hex, tolerating 0-1 or 0-255 ranges. */
function rgbArgsToHex(args: any): string {
  let r: number, g: number, b: number;
  if (Array.isArray(args) && args.length >= 3 && typeof args[0] === 'number') {
    [r, g, b] = args as number[];
  } else if (args && (Array.isArray(args[0]) || ArrayBuffer.isView(args[0]))) {
    const a = args[0] as ArrayLike<number>;
    r = a[0]; g = a[1]; b = a[2];
  } else {
    return '#000000';
  }
  if (Math.max(r, g, b) <= 1) { r *= 255; g *= 255; b *= 255; }
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

const grayToHex = (g: number): string => { const v = g <= 1 ? g * 255 : g; return `#${hex2(v)}${hex2(v)}${hex2(v)}`; };

function cmykToHex(args: any): string {
  const a = Array.isArray(args) && Array.isArray(args[0]) ? args[0] : args;
  const c = a?.[0] ?? 0, m = a?.[1] ?? 0, y = a?.[2] ?? 0, k = a?.[3] ?? 0;
  return `#${hex2(255 * (1 - c) * (1 - k))}${hex2(255 * (1 - m) * (1 - k))}${hex2(255 * (1 - y) * (1 - k))}`;
}

/**
 * Translate a pdf.js operator list into the abstract `DrawCommand[]` stream the
 * pure `vectorExtract` interpreter understands. Defensive: any op pdf.js doesn't
 * expose in this version is simply skipped (its OPS code is `undefined`).
 */
function operatorListToDrawCommands(opList: any, OPS: any): DrawCommand[] {
  const codes: PathOpCodes = {
    moveTo: OPS.moveTo, lineTo: OPS.lineTo, curveTo: OPS.curveTo,
    curveTo2: OPS.curveTo2, curveTo3: OPS.curveTo3, rectangle: OPS.rectangle, closePath: OPS.closePath,
  };
  const fnArray: number[] = opList.fnArray ?? [];
  const argsArray: any[] = opList.argsArray ?? [];
  const cmds: DrawCommand[] = [];
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];
    switch (fn) {
      case OPS.save: cmds.push({ op: 'save' }); break;
      case OPS.restore: cmds.push({ op: 'restore' }); break;
      case OPS.transform: cmds.push({ op: 'transform', m: args as Matrix }); break;
      case OPS.constructPath: cmds.push({ op: 'constructPath', segments: decodeConstructPath(args[0], args[1], codes) }); break;
      case OPS.setLineWidth: cmds.push({ op: 'setLineWidth', width: Number(args[0]) || 0 }); break;
      case OPS.setFillRGBColor: cmds.push({ op: 'setFillColor', color: rgbArgsToHex(args) }); break;
      case OPS.setStrokeRGBColor: cmds.push({ op: 'setStrokeColor', color: rgbArgsToHex(args) }); break;
      case OPS.setFillGray: cmds.push({ op: 'setFillColor', color: grayToHex(Number(args[0])) }); break;
      case OPS.setStrokeGray: cmds.push({ op: 'setStrokeColor', color: grayToHex(Number(args[0])) }); break;
      case OPS.setFillCMYKColor: cmds.push({ op: 'setFillColor', color: cmykToHex(args) }); break;
      case OPS.setStrokeCMYKColor: cmds.push({ op: 'setStrokeColor', color: cmykToHex(args) }); break;
      case OPS.fill: cmds.push({ op: 'fill', rule: 'nonzero' }); break;
      case OPS.eoFill: cmds.push({ op: 'fill', rule: 'evenodd' }); break;
      case OPS.stroke: cmds.push({ op: 'stroke' }); break;
      case OPS.closeStroke: cmds.push({ op: 'stroke' }); break;
      case OPS.fillStroke: cmds.push({ op: 'fillStroke', rule: 'nonzero' }); break;
      case OPS.eoFillStroke: cmds.push({ op: 'fillStroke', rule: 'evenodd' }); break;
      case OPS.closeFillStroke: cmds.push({ op: 'fillStroke', rule: 'nonzero' }); break;
      case OPS.closeEOFillStroke: cmds.push({ op: 'fillStroke', rule: 'evenodd' }); break;
      case OPS.endPath: cmds.push({ op: 'endPath' }); break;
      default: break;
    }
  }
  return cmds;
}

/**
 * Translate the colour/text-matrix slice of a pdf.js operator list into the
 * abstract `TextColorCommand` stream `collectColorSamples` consumes (R1 colour).
 */
function operatorListToTextColorCommands(opList: any, OPS: any): TextColorCommand[] {
  const fnArray: number[] = opList.fnArray ?? [];
  const argsArray: any[] = opList.argsArray ?? [];
  const cmds: TextColorCommand[] = [];
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];
    if (fn === OPS.save) cmds.push({ op: 'save' });
    else if (fn === OPS.restore) cmds.push({ op: 'restore' });
    else if (fn === OPS.transform) cmds.push({ op: 'transform', m: args as Matrix });
    else if (fn === OPS.setFillRGBColor) cmds.push({ op: 'setFillColor', color: rgbArgsToHex(args) });
    else if (fn === OPS.setFillGray) cmds.push({ op: 'setFillColor', color: grayToHex(Number(args[0])) });
    else if (fn === OPS.setFillCMYKColor) cmds.push({ op: 'setFillColor', color: cmykToHex(args) });
    else if (fn === OPS.beginText) cmds.push({ op: 'beginText' });
    else if (fn === OPS.setTextMatrix) cmds.push({ op: 'setTextMatrix', m: args as Matrix });
    else if (fn === OPS.setLeading) cmds.push({ op: 'setLeading', leading: Number(args[0]) || 0 });
    else if (fn === OPS.moveText) cmds.push({ op: 'moveText', tx: Number(args[0]) || 0, ty: Number(args[1]) || 0 });
    else if (fn === OPS.moveTextSetLeading) {
      cmds.push({ op: 'setLeading', leading: -(Number(args[1]) || 0) });
      cmds.push({ op: 'moveText', tx: Number(args[0]) || 0, ty: Number(args[1]) || 0 });
    } else if (fn === OPS.nextLine) cmds.push({ op: 'nextLine' });
    else if (fn === OPS.showText || fn === OPS.showSpacedText) cmds.push({ op: 'showText' });
    else if (fn === OPS.nextLineShowText || fn === OPS.nextLineSetSpacingShowText) {
      cmds.push({ op: 'nextLine' });
      cmds.push({ op: 'showText' });
    }
  }
  return cmds;
}

interface ImageDraw { objId?: string; inline?: any; ctm: Matrix; }

/** Walk the operator list tracking the CTM and capture each image-paint with it. */
function collectImageDraws(opList: any, OPS: any): ImageDraw[] {
  const fnArray: number[] = opList.fnArray ?? [];
  const argsArray: any[] = opList.argsArray ?? [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  const out: ImageDraw[] = [];
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];
    if (fn === OPS.save) stack.push([...ctm] as Matrix);
    else if (fn === OPS.restore) { const m = stack.pop(); if (m) ctm = m; }
    else if (fn === OPS.transform) ctm = matMul(ctm, args as Matrix);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) out.push({ objId: args[0] as string, ctm: [...ctm] as Matrix });
    else if (fn === OPS.paintInlineImageXObject) out.push({ inline: args[0], ctm: [...ctm] as Matrix });
  }
  return out;
}

/** Resolve a pdf.js page object (image) by id; null if it never becomes ready. */
function getPdfObj(objs: any, id: string, timeoutMs = 3000): Promise<any> {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v: any) => { if (!done) { done = true; resolve(v); } };
    try {
      if (objs && typeof objs.has === 'function' && objs.has(id)) { fin(objs.get(id)); return; }
      if (objs && typeof objs.get === 'function') objs.get(id, fin);
      else fin(null);
    } catch { fin(null); }
    setTimeout(() => fin(null), timeoutMs);
  });
}

/** Decode a pdf.js image object (bitmap or raw kind+data) to a base64 PNG. */
async function pdfImageToPngBase64(img: any): Promise<string | null> {
  if (!img) return null;
  const width = img.width | 0;
  const height = img.height | 0;
  if (width <= 0 || height <= 0 || width * height > 40_000_000) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  try {
    if (img.bitmap) {
      ctx.drawImage(img.bitmap, 0, 0);
    } else if (img.data) {
      const out = ctx.createImageData(width, height);
      const dst = out.data;
      const src: any = img.data;
      const px = width * height;
      if (img.kind === 3 || src.length >= px * 4) {
        dst.set(src.subarray(0, dst.length));
      } else if (img.kind === 2 || src.length >= px * 3) {
        for (let i = 0, j = 0; i < px; i++) { dst[j++] = src[i * 3]; dst[j++] = src[i * 3 + 1]; dst[j++] = src[i * 3 + 2]; dst[j++] = 255; }
      } else if (img.kind === 1) {
        const rowBytes = (width + 7) >> 3;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const bit = (src[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
            const v = bit ? 255 : 0;
            const j = (y * width + x) * 4;
            dst[j] = v; dst[j + 1] = v; dst[j + 2] = v; dst[j + 3] = 255;
          }
        }
      } else {
        return null;
      }
      ctx.putImageData(out, 0, 0);
    } else {
      return null;
    }
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/png'));
    return blob ? await blobToBase64(blob) : null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Resolve a pdf.js embedded font (by loadedName) into an `@font-face` build +
 * its byte length, or null when the font has no usable embedded program (a
 * standard/substituted font — the caller falls back to the web-stack resolver).
 */
async function extractEmbeddedFont(
  commonObjs: any,
  loadedName: string,
  psName: string,
): Promise<{ build: EmbeddedFontResult; byteLength: number } | null> {
  const fontObj: any = await getPdfObj(commonObjs, loadedName);
  if (!fontObj) return null;
  const raw = fontObj.data ?? fontObj._data ?? null;
  let bytes: Uint8Array | null = null;
  if (raw instanceof Uint8Array) bytes = raw;
  else if (raw instanceof ArrayBuffer) bytes = new Uint8Array(raw);
  else if (raw && typeof raw.length === 'number') bytes = Uint8Array.from(raw as ArrayLike<number>);
  if (!bytes || !bytes.length) return null;
  const build = buildEmbeddedFontFace({
    loadedName,
    postscriptName: (fontObj.name as string) || psName,
    base64: bytesToBase64(bytes),
    mimetype: fontObj.mimetype as string | undefined,
    bold: !!fontObj.bold,
    italic: !!fontObj.italic,
  });
  return { build, byteLength: bytes.length };
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
  // fontExtraProperties keeps the reconstructed embedded-font bytes available on
  // the main thread (commonObjs) so R3 can capture them as @font-face entries.
  const pdf = await pdfjsLib.getDocument({ data: buf, useSystemFonts: true, fontExtraProperties: true } as any).promise;
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
  let vectorCount = 0;
  let rasterized = 0;
  let semantic = 0;

  // R3 — embedded fonts captured as @font-face entries (deduped by loadedName).
  type EmbeddedRef = { family: string; weight: number; style: 'normal' | 'italic' };
  const embeddedFaces: FontFaceToken[] = [];
  const embeddedByLoaded = new Map<string, EmbeddedRef | null>();
  let embeddedBytesTotal = 0;
  const PER_FONT_CAP = 2_000_000;       // skip an individual font larger than ~2 MB
  const FONT_BYTE_BUDGET = 6_000_000;   // total embedded-font budget per template

  const resolveEmbeddedFont = async (commonObjs: any, loadedName: string, psName: string): Promise<EmbeddedRef | null> => {
    if (!loadedName) return null;
    if (embeddedByLoaded.has(loadedName)) return embeddedByLoaded.get(loadedName)!;
    let ref: EmbeddedRef | null = null;
    try {
      if (embeddedBytesTotal < FONT_BYTE_BUDGET) {
        const ex = await extractEmbeddedFont(commonObjs, loadedName, psName);
        if (ex && ex.byteLength <= PER_FONT_CAP && embeddedBytesTotal + ex.byteLength <= FONT_BYTE_BUDGET) {
          embeddedBytesTotal += ex.byteLength;
          embeddedFaces.push(ex.build.face as unknown as FontFaceToken);
          ref = { family: ex.build.family, weight: ex.build.weight, style: ex.build.style };
        }
      }
    } catch (err) {
      console.warn('[font] embed failed on', loadedName, err);
    }
    embeddedByLoaded.set(loadedName, ref);
    return ref;
  };

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
      } else if (mode === 'pixel') {
        // Pixel-perfect (non-editable): raster only, emitted as the page background below.
      } else {
        // A single operator-list walk powers three reconstruction tracks:
        //   R2 vectors · R4 images · R1 text colour.
        // Stacking order (bottom→top): vectors, images, text. This favours the
        // common case (a background fill behind a photo behind labels); precise
        // per-element paint-order z-indexing is deferred to the R6 fidelity loop.
        const OPS = (pdfjsLib as any).OPS;
        const initialCtm = (viewport as any).transform as Matrix;
        let opList: any = null;
        try {
          opList = await page.getOperatorList();
        } catch (err) {
          console.warn('[reconstruct] operator list failed on page', pageIndex, err);
        }

        // R2 — editable vector geometry (logos, icons, dividers, fills).
        if (opList) {
          try {
            const commands = operatorListToDrawCommands(opList, OPS);
            for (const v of extractVectorOverlays(commands, { initialCtm })) {
              overlays.push({
                id: crypto.randomUUID(),
                type: 'vector',
                x: v.x, y: v.y, width: v.width, height: v.height,
                rotation: 0,
                opacity: 1,
                viewBox: v.viewBox,
                preserveAspectRatio: 'xMidYMid meet',
                paths: v.paths,
              } as Overlay);
              vectorCount++;
            }
          } catch (err) {
            console.warn('[vector] extraction failed on page', pageIndex, err);
          }
        }

        // R4 — embedded raster images (XObjects + inline) as image overlays.
        if (opList) {
          try {
            let seq = 0;
            for (const draw of collectImageDraws(opList, OPS)) {
              const place = imageRectFromCtm(draw.ctm, initialCtm);
              if (place.width < 3 || place.height < 3) continue; // skip slivers / spacer pixels
              const imgObj = draw.inline ?? (draw.objId ? await getPdfObj(page.objs, draw.objId) : null);
              const b64 = await pdfImageToPngBase64(imgObj);
              if (!b64) continue;
              onProgress({ phase: 'uploading', page: pageIndex, totalPages });
              const up = await invokeImport({
                operation: 'upload_asset',
                import_id: importId,
                kind: 'image',
                page_index: pageIndex,
                seq: seq++,
                content_type: 'image/png',
                data_base64: b64,
              });
              overlays.push({
                id: crypto.randomUUID(),
                type: 'image',
                x: place.x, y: place.y, width: place.width, height: place.height,
                rotation: 0,
                opacity: 1,
                src: up.url,
                fit: 'fill',
              } as Overlay);
              imagesFound++;
            }
          } catch (err) {
            console.warn('[image] extraction failed on page', pageIndex, err);
          }
        }

        // R1 — recover per-glyph fill colour from the same operator list.
        let colorSamples: ColorSample[] = [];
        if (opList) {
          try {
            colorSamples = collectColorSamples(operatorListToTextColorCommands(opList, OPS));
          } catch (err) {
            console.warn('[textcolor] sampling failed on page', pageIndex, err);
          }
        }

        // Track A (R1): collect raw spans (now colour-tagged), then merge into
        // correctly-positioned, non-overlapping lines via the textLayout pipeline.
        const content = await page.getTextContent({ includeMarkedContent: false } as any);
        const spans: RawSpan[] = [];
        for (const item of content.items as any[]) {
          if (!('str' in item) || !item.str || !item.transform) continue;
          if (!(item.str as string).trim()) continue;
          const styles = (content.styles as Record<string, any>) || {};
          const psName = styles[item.fontName]?.fontFamily || item.fontName || 'Helvetica';
          // R3: prefer the actual embedded font program; else fall back to a web stack.
          const embedded = await resolveEmbeddedFont(page.commonObjs, item.fontName, psName);
          const resolved = resolveFontFamily(psName);
          fontsUsed.add(psName);
          if (!embedded && resolved.substituted) fontsSubstituted.add(psName);
          const t = item.transform as number[];
          spans.push({
            text: item.str as string,
            transform: t,
            width: item.width as number,
            fontFamily: embedded ? embedded.family : resolved.family,
            fontWeight: embedded ? embedded.weight : (/bold|black|heavy/i.test(psName) ? 'bold' : 'normal'),
            fontStyle: embedded ? embedded.style : (/italic|oblique/i.test(psName) ? 'italic' : 'normal'),
            color: colorSamples.length ? nearestColor(colorSamples, t[4], t[5]) : undefined,
          });
        }
        for (const spec of spansToTextOverlays(spans, pageHeight)) {
          overlays.push({
            id: crypto.randomUUID(),
            type: 'text',
            x: spec.x,
            y: spec.y,
            width: spec.width,
            height: spec.height,
            rotation: spec.rotation,
            opacity: 1,
            content: spec.content,
            fontFamily: spec.fontFamily ?? 'Helvetica',
            fontSize: spec.fontSize,
            // Numeric weight (from an embedded font) goes to fontWeightNumeric so
            // the renderer emits it exactly; fontWeight keeps the enum the browser
            // uses to match the single embedded face (no synthetic bolding).
            fontWeight: typeof spec.fontWeight === 'number' ? (spec.fontWeight >= 600 ? 'bold' : 'normal') : (spec.fontWeight ?? 'normal'),
            ...(typeof spec.fontWeight === 'number' ? { fontWeightNumeric: spec.fontWeight } : {}),
            fontStyle: spec.fontStyle ?? 'normal',
            color: spec.color ?? '#111111',
            align: spec.align,
            lineHeight: spec.lineHeight,
            letterSpacing: 0,
            ...(spec.runs ? { runs: spec.runs } : {}),
          } as Overlay);
          textBlocks++;
        }
      }

      // Optional Track B raster (also used for OCR mode as the source image)
      let backgroundImageUrl: string | undefined;
      // R1: editable modes (semantic/hybrid) no longer bake a text-bearing raster
      // behind live text. Only 'pixel' (non-editable trace) and 'ocr' rasterize.
      const needRaster = mode === 'pixel' || mode === 'ocr';
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

        // Keep the rasterised page as the background for both pixel and OCR
        // modes — so OCR pages (scanned PDFs, rendered decks) show the original
        // image *and* carry editable recognised-text overlays, not blank pages.
        if (mode === 'pixel' || mode === 'ocr') {
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
        // R3 — embedded fonts captured from the source so text renders faithfully.
        ...(embeddedFaces.length ? { fontFaces: embeddedFaces } : {}),
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
        vectors: vectorCount,
        fontsEmbedded: embeddedFaces.length,
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
