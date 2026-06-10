/**
 * Client-side PDF → ReportTemplate converter.
 *
 * Fidelity modes:
 *   - 'semantic': Extracts text runs + vectors + images at exact coordinates
 *     as editable overlays. Best for digital-native PDFs.
 *   - 'hybrid':   Semantic extraction PLUS the page raster attached as a
 *     locked, hidden "Source reference" overlay per page — toggle it visible
 *     in the editor to trace against the original. Hidden overlays are never
 *     rendered, so there is no ghosted double text.
 *   - 'pixel':    Rasterises each page at high DPI as the page background.
 *     Visually identical to the source, but not editable.
 *   - 'ocr':      Rasterises and runs Tesseract for scanned/image-only PDFs;
 *     word colours are sampled from the raster.
 */
import * as pdfjsLib from 'pdfjs-dist';
import type { ReportTemplate, Page, Block, Overlay, FontFace as FontFaceToken } from '@/lib/reportTemplate/templateSchema';
import type { CdirDocument } from '@/lib/reportTemplate/ingestion/cdir';
import { reportTemplateToCdir } from '@/lib/reportTemplate/ingestion/cdir';
import {
  buildCdirFidelityReport,
  type CdirFidelityReport,
  type SourceBoundsExpectation,
  type SourceTextExpectation,
} from '@/lib/reportTemplate/ingestion/fidelity';
import { invokeSecureFunction, describeAuthError } from '@/lib/secureInvoke';
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
import { deriveTokensFromExtraction, pickInkColor, type TextObservation, type FillObservation } from './tokenDerivation';
import { parseShadingIR, shadingToOverlaySpec, pathPointsToPageBBox, type ShadingOverlaySpec } from './shadingExtract';
import { applyAlphaToColor } from '@/lib/reportTemplate/cssColor';
import { ensureCatalogFontFaces } from '@/lib/reportTemplate/fontCatalog';

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
  /** Phase 1/2 normalized editable IR and quality metrics for import review. */
  cdir?: CdirDocument;
  cdirFidelity?: CdirFidelityReport;
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
  // invokeSecureFunction attaches the custom-auth session token; the edge
  // function now verifies it (supabase.functions.invoke only carries the anon
  // key for this app, which the secured function rejects).
  const { data, error } = await invokeSecureFunction('template-import-pdf', body, { timeoutMs: 120000 });
  if (error) throw new Error(describeAuthError(error.message) ?? error.message ?? 'template-import-pdf failed');
  if (data?.error) throw new Error(describeAuthError(String(data.error)) ?? String(data.error));
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

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', buf.slice(0));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (_) {
    return `unverified-${buf.byteLength}`;
  }
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
 *
 * ExtGState fill/stroke alpha (`ca`/`CA`) is folded into the emitted colour as
 * 8-digit hex — without it a 10%-white "glass" panel imported as opaque white.
 */
function operatorListToDrawCommands(opList: any, OPS: any): DrawCommand[] {
  const codes: PathOpCodes = {
    moveTo: OPS.moveTo, lineTo: OPS.lineTo, curveTo: OPS.curveTo,
    curveTo2: OPS.curveTo2, curveTo3: OPS.curveTo3, rectangle: OPS.rectangle, closePath: OPS.closePath,
  };
  const fnArray: number[] = opList.fnArray ?? [];
  const argsArray: any[] = opList.argsArray ?? [];
  const cmds: DrawCommand[] = [];
  // Alpha is part of the graphics state, so it must mirror save/restore.
  let gs = { fill: '#000000', stroke: '#000000', ca: 1, CA: 1 };
  const gsStack: Array<typeof gs> = [];
  const emitFill = () => cmds.push({ op: 'setFillColor', color: gs.ca < 1 ? applyAlphaToColor(gs.fill, gs.ca) : gs.fill });
  const emitStroke = () => cmds.push({ op: 'setStrokeColor', color: gs.CA < 1 ? applyAlphaToColor(gs.stroke, gs.CA) : gs.stroke });
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];
    switch (fn) {
      case OPS.save: gsStack.push({ ...gs }); cmds.push({ op: 'save' }); break;
      case OPS.restore: {
        const prev = gsStack.pop();
        if (prev) gs = prev;
        cmds.push({ op: 'restore' });
        break;
      }
      case OPS.transform: cmds.push({ op: 'transform', m: args as Matrix }); break;
      case OPS.constructPath: cmds.push({ op: 'constructPath', segments: decodeConstructPath(args[0], args[1], codes) }); break;
      case OPS.setLineWidth: cmds.push({ op: 'setLineWidth', width: Number(args[0]) || 0 }); break;
      case OPS.setFillRGBColor: gs.fill = rgbArgsToHex(args); emitFill(); break;
      case OPS.setStrokeRGBColor: gs.stroke = rgbArgsToHex(args); emitStroke(); break;
      case OPS.setFillGray: gs.fill = grayToHex(Number(args[0])); emitFill(); break;
      case OPS.setStrokeGray: gs.stroke = grayToHex(Number(args[0])); emitStroke(); break;
      case OPS.setFillCMYKColor: gs.fill = cmykToHex(args); emitFill(); break;
      case OPS.setStrokeCMYKColor: gs.stroke = cmykToHex(args); emitStroke(); break;
      case OPS.setGState: {
        // args = [[['ca', 0.1], ['CA', 1], …]] — fold alpha into colours.
        const states = Array.isArray(args?.[0]) ? args[0] : [];
        let fillChanged = false, strokeChanged = false;
        for (const entry of states) {
          if (!Array.isArray(entry) || entry.length < 2) continue;
          if (entry[0] === 'ca' && Number.isFinite(Number(entry[1]))) { gs.ca = Number(entry[1]); fillChanged = true; }
          if (entry[0] === 'CA' && Number.isFinite(Number(entry[1]))) { gs.CA = Number(entry[1]); strokeChanged = true; }
        }
        if (fillChanged) emitFill();
        if (strokeChanged) emitStroke();
        break;
      }
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
 * Walk the operator list for `shadingFill` ops (axial/radial/mesh gradients —
 * how designed covers paint their backgrounds), tracking the CTM and an
 * approximate clip rect so each shading maps to its page-space extent.
 */
function collectShadingOverlaySpecs(
  opList: any,
  OPS: any,
  viewportCtm: Matrix,
  pageWidth: number,
  pageHeight: number,
): ShadingOverlaySpec[] {
  const codes: PathOpCodes = {
    moveTo: OPS.moveTo, lineTo: OPS.lineTo, curveTo: OPS.curveTo,
    curveTo2: OPS.curveTo2, curveTo3: OPS.curveTo3, rectangle: OPS.rectangle, closePath: OPS.closePath,
  };
  const fnArray: number[] = opList.fnArray ?? [];
  const argsArray: any[] = opList.argsArray ?? [];
  type Clip = { x: number; y: number; width: number; height: number } | null;
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  let clip: Clip = null;
  let lastPathPoints: Array<[number, number]> = [];
  const stack: Array<{ ctm: Matrix; clip: Clip }> = [];
  const out: ShadingOverlaySpec[] = [];

  const segPoints = (segments: Array<{ type: string; coords: number[] }>): Array<[number, number]> => {
    const pts: Array<[number, number]> = [];
    for (const seg of segments) {
      const c = seg.coords;
      if (seg.type === 're') {
        pts.push([c[0], c[1]], [c[0] + c[2], c[1] + c[3]]);
      } else {
        for (let i = 0; i + 1 < c.length; i += 2) pts.push([c[i], c[i + 1]]);
      }
    }
    return pts;
  };

  for (let i = 0; i < fnArray.length && out.length < 40; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];
    if (fn === OPS.save) stack.push({ ctm: [...ctm] as Matrix, clip });
    else if (fn === OPS.restore) { const s = stack.pop(); if (s) { ctm = s.ctm; clip = s.clip; } }
    else if (fn === OPS.transform) ctm = matMul(ctm, args as Matrix);
    else if (fn === OPS.constructPath) {
      try { lastPathPoints = segPoints(decodeConstructPath(args[0], args[1], codes)); } catch { lastPathPoints = []; }
    } else if (fn === OPS.clip || fn === OPS.eoClip) {
      const box = pathPointsToPageBBox(lastPathPoints, ctm, viewportCtm);
      if (box) {
        clip = clip
          ? (() => {
              const x = Math.max(clip.x, box.x);
              const y = Math.max(clip.y, box.y);
              const r = Math.min(clip.x + clip.width, box.x + box.width);
              const b = Math.min(clip.y + clip.height, box.y + box.height);
              return r > x && b > y ? { x, y, width: r - x, height: b - y } : clip;
            })()
          : box;
      }
    } else if (fn === OPS.shadingFill) {
      try {
        const parsed = parseShadingIR(args?.[0]);
        if (parsed) {
          out.push(shadingToOverlaySpec({ parsed, ctm: [...ctm] as Matrix, viewportCtm, pageWidth, pageHeight, clip }));
        }
      } catch (err) {
        console.warn('[shading] failed to reconstruct shading fill', err);
      }
    }
  }
  return out;
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
  const sourceChecksum = `sha256:${await sha256Hex(buf)}`;
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
    meta: { source_checksum: sourceChecksum },
  });
  const importId: string = createRes.record.id;

  const pages: Page[] = [];
  const fontsUsed = new Set<string>();
  const fontsSubstituted = new Set<string>();
  // Observations feeding document-level token derivation (colors/fonts from the
  // SOURCE, replacing the old hard-coded gold/Helvetica defaults).
  const textObs: TextObservation[] = [];
  const fillObs: FillObservation[] = [];
  let textBlocks = 0;
  let imagesFound = 0;
  let vectorCount = 0;
  let rasterized = 0;
  let semantic = 0;
  const expectedText: SourceTextExpectation[] = [];
  const expectedBounds: SourceBoundsExpectation[] = [];

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
      let extractedPageText = '';

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

        // Shading fills (axial/radial/mesh gradients) — these paint the page
        // backgrounds of designed covers and were previously dropped entirely,
        // importing as a blank white page behind (often white) text.
        if (opList) {
          try {
            for (const spec of collectShadingOverlaySpecs(opList, OPS, initialCtm, pageWidth, pageHeight)) {
              overlays.push({
                id: crypto.randomUUID(),
                type: 'shape',
                shape: 'rect',
                name: 'Background gradient',
                x: spec.x, y: spec.y, width: spec.width, height: spec.height,
                rotation: 0,
                opacity: 1,
                fill: spec.fill,
                strokeWidth: 0,
                borderRadius: 0,
              } as Overlay);
              vectorCount++;
              fillObs.push({ color: spec.averageColor, area: spec.width * spec.height });
            }
          } catch (err) {
            console.warn('[shading] extraction failed on page', pageIndex, err);
          }
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
              const fills = (v.paths ?? []).filter((p: any) => p.fill && p.fill !== 'none');
              for (const p of fills) {
                fillObs.push({ color: p.fill as string, area: (v.width * v.height) / fills.length });
              }
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
        const pageTextParts: string[] = [];
        for (const item of content.items as any[]) {
          if (!('str' in item) || !item.str || !item.transform) continue;
          if (!(item.str as string).trim()) continue;
          pageTextParts.push(item.str as string);
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
        extractedPageText = pageTextParts.join(' ').replace(/\s+/g, ' ').trim();
        for (const spec of spansToTextOverlays(spans, pageHeight)) {
          if (spec.runs?.length) {
            for (const run of spec.runs) {
              textObs.push({
                color: run.color,
                fontFamily: run.fontFamily,
                fontSize: run.fontSize ?? spec.fontSize,
                chars: String(run.text ?? '').length,
              });
            }
          } else {
            textObs.push({
              color: spec.color,
              fontFamily: spec.fontFamily,
              fontSize: spec.fontSize,
              chars: String(spec.content ?? '').length,
            });
          }
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
      // R1: editable modes no longer bake a text-bearing raster BEHIND live text
      // (that double-paints every glyph). 'pixel' keeps the raster as the page
      // background; 'hybrid' rasterizes too but attaches it as a HIDDEN, locked
      // reference overlay for tracing — excluded from preview/export render.
      const needRaster = mode === 'pixel' || mode === 'ocr' || mode === 'hybrid';
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
          if (mode === 'pixel') {
            // Pixel-perfect mode must be self-contained for both iframe preview and
            // WeasyPrint. Public storage URLs can be misconfigured or unavailable to
            // the render service, which produced blank white pages; embedding the
            // page raster as a data URL guarantees the raster is present at render.
            backgroundImageUrl = `data:image/jpeg;base64,${b64}`;
            rasterized++;
          } else {
            // Hybrid: keep the source raster available as a locked, hidden trace
            // layer (renderers skip hidden overlays, so no ghosted double text).
            overlays.unshift({
              id: crypto.randomUUID(),
              type: 'image',
              name: 'Source reference (hidden)',
              x: 0, y: 0, width: pageWidth, height: pageHeight,
              rotation: 0,
              opacity: 1,
              src: up.url,
              fit: 'fill',
              hidden: true,
              locked: true,
              zIndex: -1_000_000,
            } as Overlay);
            semantic++;
          }
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
          const ocrTextParts: string[] = [];
          const rasterCtx = rasterCanvas.getContext('2d', { willReadFrequently: true });
          for (const w of words) {
            if (!w?.text?.trim()) continue;
            const bbox = w.bbox || {};
            const x = (bbox.x0 ?? 0) * ratio;
            const y = (bbox.y0 ?? 0) * ratio;
            const ww = ((bbox.x1 ?? 0) - (bbox.x0 ?? 0)) * ratio;
            const hh = ((bbox.y1 ?? 0) - (bbox.y0 ?? 0)) * ratio;
            const fontSize = Math.max(8, hh * 0.85);
            ocrTextParts.push(w.text);
            // Sample the word's actual ink colour from the raster instead of
            // hard-coding near-black for every recognised word.
            let inkColor: string | undefined;
            try {
              if (rasterCtx) {
                const px = rasterCtx.getImageData(
                  Math.max(0, Math.floor(bbox.x0 ?? 0)),
                  Math.max(0, Math.floor(bbox.y0 ?? 0)),
                  Math.max(1, Math.ceil((bbox.x1 ?? 0) - (bbox.x0 ?? 0))),
                  Math.max(1, Math.ceil((bbox.y1 ?? 0) - (bbox.y0 ?? 0))),
                );
                inkColor = pickInkColor(px.data);
              }
            } catch { /* sampling is best-effort */ }
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
              color: inkColor ?? '#111111',
              align: 'left',
              lineHeight: 1.2,
              letterSpacing: 0,
            } as Overlay);
            textObs.push({ color: inkColor, fontFamily: 'Helvetica', fontSize, chars: String(w.text).length });
            textBlocks++;
          }
          extractedPageText = ocrTextParts.join(' ').replace(/\s+/g, ' ').trim();
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
      const newPageId = crypto.randomUUID();
      const textForPage = extractedPageText || overlays
        .filter((overlay) => overlay.type === 'text')
        .map((overlay) => (overlay as any).content)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (textForPage) expectedText.push({ pageId: newPageId, text: textForPage });
      for (const overlay of overlays) {
        if ((overlay as any).hidden) continue; // trace layers are not part of the rendered output
        expectedBounds.push({
          pageId: newPageId,
          layerId: overlay.id,
          bounds: { x: overlay.x, y: overlay.y, width: overlay.width, height: overlay.height },
        });
      }

      const freeBlock: Block = {
        id: crypto.randomUUID(),
        type: 'free',
        props: {},
        overlays,
      } as Block;

      const newPage: Page = {
        id: newPageId,
        name: `Page ${pageIndex}`,
        size: { width: pageWidth, height: pageHeight },
        background: backgroundImageUrl ? { imageUrl: backgroundImageUrl } : {},
        blocks: [freeBlock],
      };
      pages.push(newPage);
    }

    // Document-level tokens derived from what extraction actually measured —
    // colours weighted by glyph count / painted area, fonts by usage — so the
    // template's token-driven styling matches the reference instead of the old
    // hard-coded gold/white/Helvetica defaults.
    const derivedTokens = deriveTokensFromExtraction(textObs, fillObs, {
      pageArea: pages.length ? pages[0].size.width * pages[0].size.height : undefined,
    });

    // ensureCatalogFontFaces makes every catalog-known family referenced by the
    // import (e.g. a substituted "Roboto" or "Playfair Display") actually load
    // in the editor preview AND the WeasyPrint export via a Google Fonts cssUrl.
    const template: ReportTemplate = ensureCatalogFontFaces({
      version: 1,
      tokens: {
        colors: derivedTokens.colors,
        fonts: derivedTokens.fonts,
        spacing: { gutter: 16 },
        // R3 — embedded fonts captured from the source so text renders faithfully.
        ...(embeddedFaces.length ? { fontFaces: embeddedFaces } : {}),
      },
      pages,
      slots: {},
      meta: { title: options.templateName ?? file.name.replace(/\.pdf$/i, '') },
    } as ReportTemplate);

    const cdir = reportTemplateToCdir(template, {
      kind: 'pdf',
      checksum: sourceChecksum,
      filename: file.name,
    });
    const cdirFidelity = buildCdirFidelityReport(cdir, { expectedText, expectedBounds });

    onProgress({ phase: 'finalizing', message: options.targetTemplateId ? 'Re-syncing template…' : 'Creating template…' });
    const finRes = options.targetTemplateId
      ? await invokeImport({
          operation: 'resync',
          import_id: importId,
          template_id: options.targetTemplateId,
          schema: template,
          page_count: totalPages,
          source_filename: file.name,
          source_checksum: sourceChecksum,
          cdir,
          cdir_fidelity: cdirFidelity,
          note: `Re-synced from ${file.name}`,
        })
      : await invokeImport({
          operation: 'finalize',
          import_id: importId,
          name: options.templateName ?? file.name.replace(/\.pdf$/i, ''),
          schema: template,
          page_count: totalPages,
          source_filename: file.name,
          source_checksum: sourceChecksum,
          cdir,
          cdir_fidelity: cdirFidelity,
        });

    onProgress({ phase: 'done', totalPages });
    return {
      template: { id: finRes.template.id, name: finRes.template.name ?? options.templateName ?? file.name },
      importId,
      pageCount: totalPages,
      cdir,
      cdirFidelity,
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
