/**
 * "Start from a reference" — unified import & reconstruction (rehaul Phase 3).
 *
 * One entry point that accepts a PDF or an image (drag, click, or paste) and:
 *   - PDF  → `extractPdfToTemplate` (fidelity mode chooser + staged progress),
 *            re-syncing the current template.
 *   - image → the AI vision reconstructor (`template-design-agent`
 *            `screenshot_to_block`) → editable native blocks.
 * The reconstructed schema is validated BEFORE it is applied, so a broken
 * result can't corrupt the working template. Renderer code is untouched.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload, FileText, Image as ImageIcon, Sparkles, CheckCircle2, AlertCircle, Loader2, Link2, Code2,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  extractPdfToTemplate,
  type FidelityMode,
  type ImportProgress,
} from '@/lib/reportTemplate/pdfImport/extractPdfToTemplate';
import { parseTemplate, type ReportTemplate } from '@/lib/reportTemplate/templateSchema';
import {
  detectReferenceKind,
  validateReconstructedSchema,
  fileToDataUrl,
  type ReferenceKind,
} from '@/lib/reportTemplate/referenceImport';
import { groundOcrWords, type GroundedReference, type OcrWord } from '@/lib/reportTemplate/imageGrounding';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { normalizeImportUrl, isHttpUrl, suggestedName } from '@/lib/reportTemplate/importUrl';
import { renderAndGroundCode, looksLikeJsx, type CodeIngestResult, type CodeRenderInput } from '@/lib/reportTemplate/ingestion/codeIngest';
import { codeFlavorForFile } from '@/lib/reportTemplate/ingestion/detect';
import { pickInkColor } from '@/lib/reportTemplate/pdfImport/tokenDerivation';
import { extractMakeAssets, isFigmaMakeFile, MAKE_NO_RASTER_GUIDANCE } from '@/lib/reportTemplate/ingestion/makeImport';
import { ensureCatalogFontFaces } from '@/lib/reportTemplate/fontCatalog';
import { reconstructPdfWithClaude } from '@/lib/reportTemplate/ingestion/pdfDocumentReconstruct';
import { figmaNodesToBoxTree } from '@/lib/reportTemplate/figmaGrounding';
import { groundDomBoxTree } from '@/lib/reportTemplate/codeGrounding';

type ImageMode = 'faithful' | 'redesign';
type CodeSourceFlavor = ReturnType<typeof codeFlavorForFile>;

const MAX_CODE_ZIP_BYTES = 18 * 1024 * 1024;
const CSS_SAMPLE_HTML = '<!doctype html><html><body><main class="template-builder-css-sample"><section class="hero"><p class="eyebrow">CSS preview</p><h1>Template style sample</h1><p>Upload paired HTML or a project ZIP for exact content reconstruction.</p><button>Sample CTA</button></section></main></body></html>';

/** Adapter: secureInvoke → the InvokeFn shape renderAndGroundCode expects. */
const invokeRenderSource = (name: string, payload: unknown, options?: { timeoutMs?: number }) =>
  invokeSecureFunction(name, payload as any, { timeoutMs: options?.timeoutMs ?? 180000 }) as Promise<{ data: any; error: { message: string } | null }>;

/** base64 → File (for documents fetched by URL via the import-from-url function). */
function base64ToFile(b64: string, filename: string, type: string): File {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], filename, { type });
}

/** Downscale large screenshots before sending them to the design agent. */
async function prepareImageForDesignAgent(dataUrl: string, maxLongEdge = 1600, jpegQuality = 0.78): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image load failed'));
    image.src = dataUrl;
  });
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  if (!longest || (longest <= maxLongEdge && dataUrl.length < 1_500_000)) return dataUrl;

  const scale = Math.min(1, maxLongEdge / longest);
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', jpegQuality);
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('')}`;
}

async function extractImagePalette(dataUrl: string, maxColors = 8): Promise<string[]> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('image load failed'));
      image.src = dataUrl;
    });
    const canvas = document.createElement('canvas');
    const sample = 96;
    const scale = Math.min(1, sample / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const buckets = new Map<string, { count: number; r: number; g: number; b: number; sat: number }>();
    for (let i = 0; i < pixels.length; i += 16) {
      const a = pixels[i + 3];
      if (a < 32) continue;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      if ((lum > 0.96 || lum < 0.04) && sat < 0.12) continue;
      const key = `${Math.round(r / 24)}:${Math.round(g / 24)}:${Math.round(b / 24)}`;
      const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0, sat: 0 };
      bucket.count += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.sat += sat;
      buckets.set(key, bucket);
    }
    return Array.from(buckets.values())
      .sort((a, b) => (b.count * (1 + b.sat / Math.max(1, b.count))) - (a.count * (1 + a.sat / Math.max(1, a.count))))
      .slice(0, maxColors)
      .map((bucket) => rgbToHex(bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count));
  } catch (e) {
    console.warn('[reconstruct] palette extraction failed', e);
    return [];
  }
}

/** Impure OCR pass: read measured text boxes from an image (R5 grounding). */
async function ocrImageWords(dataUrl: string): Promise<{ words: OcrWord[]; width: number; height: number } | null> {
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('image load failed'));
      im.src = dataUrl;
    });
    const tess: any = await import(/* @vite-ignore */ 'tesseract.js');
    const worker = await tess.createWorker('eng');
    const { data } = await worker.recognize(dataUrl);
    await worker.terminate();

    // Sample each word's ink colour from the source pixels so the agent gets
    // colour ground truth alongside text + position (OCR alone is colour-blind).
    let sampleCtx: CanvasRenderingContext2D | null = null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      sampleCtx = canvas.getContext('2d', { willReadFrequently: true });
      sampleCtx?.drawImage(img, 0, 0);
    } catch { /* colour sampling is best-effort */ }
    const sampleInk = (x0: number, y0: number, x1: number, y1: number): string | undefined => {
      if (!sampleCtx) return undefined;
      try {
        const px = sampleCtx.getImageData(
          Math.max(0, Math.floor(x0)),
          Math.max(0, Math.floor(y0)),
          Math.max(1, Math.ceil(x1 - x0)),
          Math.max(1, Math.ceil(y1 - y0)),
        );
        return pickInkColor(px.data);
      } catch { return undefined; }
    };

    const words: OcrWord[] = (data?.words ?? [])
      .filter((w: any) => w?.text?.trim())
      .map((w: any) => {
        const x0 = w.bbox?.x0 ?? 0, y0 = w.bbox?.y0 ?? 0, x1 = w.bbox?.x1 ?? 0, y1 = w.bbox?.y1 ?? 0;
        const color = sampleInk(x0, y0, x1, y1);
        return { text: w.text, x0, y0, x1, y1, ...(color ? { color } : {}) };
      });
    return { words, width: img.naturalWidth, height: img.naturalHeight };
  } catch (e) {
    console.warn('[reconstruct] OCR grounding failed', e);
    return null;
  }
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templateId: string;
  templateName: string;
  schema: ReportTemplate;
  activePageId: string | null;
  sampleData?: Record<string, any>;
  /** PDF path completed (caller should reload the freshly re-synced template). */
  onResynced?: () => void;
  /** Image path completed — apply the reconstructed schema to the editor. */
  onApplySchema?: (schema: ReportTemplate) => void;
}

const PDF_MAX = 50 * 1024 * 1024;
const IMG_MAX = 6 * 1024 * 1024;

export function ReferenceImportDialog({
  open,
  onOpenChange,
  templateId,
  templateName,
  schema,
  activePageId,
  sampleData,
  onResynced,
  onApplySchema,
}: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const codeFileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<ReferenceKind>('unsupported');
  const [mode, setMode] = useState<FidelityMode>('hybrid');
  const [imageMode, setImageMode] = useState<ImageMode>('faithful'); // R5: faithful reconstruct by default
  const [pdfClaude, setPdfClaude] = useState(false); // §7a: route the PDF straight to Claude
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [url, setUrl] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [codeText, setCodeText] = useState('');
  const [codeSourceName, setCodeSourceName] = useState<string | null>(null);
  const [codeSourceFlavor, setCodeSourceFlavor] = useState<CodeSourceFlavor>(null);
  const [codeBusy, setCodeBusy] = useState(false);

  const urlInfo = useMemo(() => (url.trim() ? normalizeImportUrl(url.trim()) : null), [url]);

  const reset = () => {
    setFile(null); setKind('unsupported'); setBusy(false);
    setProgress(null); setStage(null); setError(null); setDone(null); setDragging(false);
    setUrl(''); setUrlBusy(false); setCodeText(''); setCodeSourceName(null); setCodeSourceFlavor(null); setCodeBusy(false); setPdfClaude(false);
  };
  const handleClose = (v: boolean) => { if (busy || codeBusy) return; if (!v) reset(); onOpenChange(v); };

  const onFile = useCallback((f: File | null) => {
    if (!f) return;
    const k = detectReferenceKind(f);
    if (k === 'unsupported') { toast.error('Unsupported file. Drop a PDF or an image.'); return; }
    if (k === 'pdf' && f.size > PDF_MAX) { toast.error('PDF too large (max 50 MB).'); return; }
    if (k === 'image' && f.size > IMG_MAX) { toast.error('Image too large (max 6 MB).'); return; }
    setFile(f); setKind(k); setError(null); setDone(null);
  }, []);

  // Paste an image straight from the clipboard while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
      const f = item?.getAsFile();
      if (f) onFile(f);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open, onFile]);

  const pdfPercent = (() => {
    if (!progress?.page || !progress?.totalPages) return progress ? 8 : 0;
    return Math.round((progress.page / progress.totalPages) * 95);
  })();

  const start = useCallback(async () => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      if (kind === 'pdf' && pdfClaude) {
        // §7a — send the PDF straight to Claude (best for scanned/image-only PDFs).
        setStage('Reading the PDF with Claude…');
        const dataUrl = await fileToDataUrl(file);
        const pdfBase64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        const res = await reconstructPdfWithClaude({ pdfBase64, schema, activePageId, sampleData }, invokeRenderSource);
        onApplySchema?.(ensureCatalogFontFaces(res.schema));
        setDone(`Reconstructed ${res.pageCount} page${res.pageCount === 1 ? '' : 's'} from the PDF${res.modelUsed ? ` · ${res.modelUsed}` : ''}.${res.warnings.length ? ` ${res.warnings.length} warning(s).` : ''}`);
      } else if (kind === 'pdf') {
        setStage('Reading PDF…');
        await extractPdfToTemplate(file, {
          mode,
          templateName,
          userId: user?.id ?? null,
          targetTemplateId: templateId,
          onProgress: setProgress,
        });
        setDone('PDF re-synced. Previous version snapshotted to History.');
        onResynced?.();
      } else {
        setStage('Reading image…');
        const dataUrl = await fileToDataUrl(file);
        setStage('Optimising image for reconstruction…');
        const agentImageDataUrl = await prepareImageForDesignAgent(dataUrl);
        const colorPalette = await extractImagePalette(agentImageDataUrl);

        // R5 — FAITHFUL path grounds the agent on measured OCR text so it
        // transcribes/places real copy instead of re-inventing it from a brief.
        // REDESIGN path explicitly opts into the design-brief reinterpretation.
        let groundedReference: GroundedReference | undefined;
        if (imageMode === 'faithful') {
          setStage('Measuring text (OCR)…');
          const ocr = await ocrImageWords(agentImageDataUrl);
          if (ocr && ocr.words.length) groundedReference = groundOcrWords(ocr.words, ocr.width, ocr.height);
        }

        const paletteInstruction = colorPalette.length
          ? ` Dominant source colours detected: ${colorPalette.join(', ')}. Use these exact hex colours for backgrounds, fills, accents, borders, and text where they match the image; do not default to black and white.`
          : '';
        const instruction = imageMode === 'faithful'
          ? `Reconstruct this reference faithfully as editable native blocks on the active page. Transcribe the text exactly and keep the measured positions — do not redesign or rewrite.${paletteInstruction}`
          : `Use this reference as inspiration to (re)design the active page.${paletteInstruction}`;
        setStage(imageMode === 'faithful'
          ? `Reconstructing faithfully…${groundedReference ? ` (${groundedReference.elements.length} measured elements)` : ''}`
          : 'Redesigning with AI… this can take ~20–40s');

        const { data, error: invokeError } = await invokeSecureFunction('template-design-agent', {
          schema,
          messages: [{ role: 'user', content: instruction }],
          instruction,
          activePageId,
          mode: imageMode === 'faithful' ? 'screenshot_to_block' : 'design',
          imageDataUrl: agentImageDataUrl,
          ...(groundedReference ? { groundedReference } : {}),
          sourcePalette: colorPalette,
          sampleData,
        }, { timeoutMs: 180000 });
        if (invokeError) throw new Error(invokeError.message);
        if ((data as any)?.error) throw new Error((data as any).error);
        const reconstructed = (data as any)?.schema;
        const validation = validateReconstructedSchema(reconstructed);
        if (!validation.ok) throw new Error(`Reconstruction was not usable: ${validation.errors.join(' ')}`);
        onApplySchema?.(ensureCatalogFontFaces(parseTemplate(reconstructed)));
        const warnings: string[] = (data as any)?.warnings ?? [];
        const modelUsed = (data as any)?.modelUsed;
        const measured = groundedReference ? ` from ${groundedReference.elements.length} measured text element(s)` : '';
        setDone(`${imageMode === 'faithful' ? 'Reconstructed' : 'Redesigned'} ${validation.pageCount} page${validation.pageCount === 1 ? '' : 's'}${measured}${modelUsed ? ` · ${modelUsed}` : ''}.${warnings.length ? ` ${warnings.length} warning(s) — review in the Design Agent.` : ''}`);
      }
    } catch (e) {
      setError((e as Error).message || 'Import failed.');
    } finally {
      setBusy(false); setStage(null); setProgress(null);
    }
  }, [file, kind, mode, imageMode, pdfClaude, templateName, templateId, user?.id, schema, activePageId, sampleData, onResynced, onApplySchema]);

  // Import by link: normalise the share URL (tested), fetch server-side (CORS +
  // SSRF), then drop the returned PDF/image into the normal file flow.
  const fetchUrlImport = useCallback(async () => {
    const raw = url.trim();
    if (!isHttpUrl(raw)) { setError('Enter a valid http(s) link.'); return; }
    const norm = normalizeImportUrl(raw);
    if ((norm.provider === 'canva' || norm.provider === 'gamma') && norm.needsExport) {
      setError(norm.guidance ?? 'This app has no public file link — export to PDF and paste that link.');
      return;
    }
    setUrlBusy(true); setError(null);
    try {
      const { data, error: invErr } = await invokeSecureFunction('import-from-url', {
        url: raw, fetchUrl: norm.fetchUrl, provider: norm.provider, resourceId: norm.resourceId, expectedKind: norm.expectedKind,
      });
      if (invErr) throw new Error(invErr.message);
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      if (d?.kind === 'needs_export') { setError(d.guidance ?? 'This link needs a PDF/image export.'); return; }
      if (!d?.dataBase64) throw new Error('No file returned from that link.');
      // §7d — Figma: ground on the real node tree (hierarchy-accurate) when present.
      if (d.provider === 'figma' && d.figmaFrame) {
        try {
          const grounded = groundDomBoxTree(figmaNodesToBoxTree(d.figmaFrame));
          if (grounded.elements.length) {
            const pngDataUrl = `data:${d.contentType || 'image/png'};base64,${d.dataBase64}`;
            setUrl('');
            await reconstructFromScreenshot(pngDataUrl, grounded);
            return;
          }
        } catch (e) { console.warn('[figma] hierarchy grounding failed; using image flow', e); }
      }
      const ext = d.kind === 'pdf' ? 'pdf' : 'png';
      const name = d.filename || `${suggestedName(raw, norm.provider)}.${ext}`;
      const f = base64ToFile(d.dataBase64, name, d.contentType || (d.kind === 'pdf' ? 'application/pdf' : 'image/png'));
      onFile(f);
    } catch (e) {
      setError(`Couldn't import from link: ${(e as Error).message}`);
    } finally {
      setUrlBusy(false);
    }
  }, [url, onFile]);

  // Raw-codebase import (plan WS1): render HTML/CSS/URL/JSX/ZIP via the
  // render-source service, then apply the editable CDIR → ReportTemplate result
  // directly. This keeps code/zip imports multi-page and editable-first instead
  // of flattening the rendered output back through a one-page screenshot prompt.
  const applyCodeImportResult = useCallback((result: CodeIngestResult, label: string) => {
    const validation = validateReconstructedSchema(result.editableTemplate);
    if (!validation.ok) throw new Error(`Code import was not usable: ${validation.errors.join(' ')}`);
    onApplySchema?.(result.editableTemplate);
    const fidelity = result.cdirFidelity;
    const score = Math.round(fidelity.overallScore * 100);
    const traceNote = fidelity.rasterFallbackCoverage > 0
      ? ` Trace rasters retained for review (${Math.round(fidelity.rasterFallbackCoverage * 100)}% fallback coverage).`
      : '';
    const warnings = fidelity.warnings.length ? ` ${fidelity.warnings.length} fidelity warning(s) — review imported layers before saving.` : '';
    setDone(`Imported ${validation.pageCount} editable page${validation.pageCount === 1 ? '' : 's'} from ${label} · fidelity ${score}%.${traceNote}${warnings}`);
  }, [onApplySchema]);

  const reconstructFromScreenshot = useCallback(async (dataUrl: string, grounded: GroundedReference) => {
    const preparedDataUrl = await prepareImageForDesignAgent(dataUrl);
    const sourcePalette = await extractImagePalette(preparedDataUrl);
    const paletteInstruction = sourcePalette.length
      ? ` Source colours detected: ${sourcePalette.join(', ')}. Preserve these exact colours for text, fills, background, borders, and accents.`
      : '';
    const instruction = `Reconstruct this rendered design faithfully as editable native blocks on the active page. Transcribe text exactly and keep the measured positions — do not redesign.${paletteInstruction}`;
    const { data, error: invokeError } = await invokeSecureFunction('template-design-agent', {
      schema,
      messages: [{ role: 'user', content: instruction }],
      instruction,
      activePageId,
      mode: 'screenshot_to_block',
      imageDataUrl: preparedDataUrl,
      groundedReference: grounded,
      sourcePalette,
      sampleData,
    }, { timeoutMs: 180000 });
    if (invokeError) throw new Error(invokeError.message);
    if ((data as any)?.error) throw new Error((data as any).error);
    const reconstructed = (data as any)?.schema;
    const validation = validateReconstructedSchema(reconstructed);
    if (!validation.ok) throw new Error(`Reconstruction was not usable: ${validation.errors.join(' ')}`);
    onApplySchema?.(ensureCatalogFontFaces(parseTemplate(reconstructed)));
    const warnings: string[] = (data as any)?.warnings ?? [];
    const modelUsed = (data as any)?.modelUsed;
    setDone(`Reconstructed ${validation.pageCount} page${validation.pageCount === 1 ? '' : 's'} from ${grounded.elements.length} measured element(s)${modelUsed ? ` · ${modelUsed}` : ''}.${warnings.length ? ` ${warnings.length} warning(s) — review in the Design Agent.` : ''}`);
  }, [schema, activePageId, sampleData, onApplySchema]);

  const startCodeReconstruct = useCallback(async () => {
    const raw = codeText.trim();
    if (!raw) return;
    const asUrl = isHttpUrl(raw);
    const flavor = codeSourceFlavor ?? (codeSourceName ? codeFlavorForFile(codeSourceName) : null);
    const isCssOnly = !asUrl && flavor === 'css';
    const isJsx = !asUrl && !isCssOnly && (looksLikeJsx(raw) || flavor === 'jsx' || flavor === 'tsx');
    const input: CodeRenderInput = asUrl
      ? { url: raw }
      : isCssOnly
        ? { html: CSS_SAMPLE_HTML, css: raw, sourceFilename: codeSourceName ?? 'style.css' }
        : isJsx
          ? { jsx: raw, sourceFilename: codeSourceName ?? undefined }
          : { html: raw, sourceFilename: codeSourceName ?? undefined };
    setCodeBusy(true); setError(null); setDone(null);
    try {
      setStage(asUrl ? 'Rendering page…' : isCssOnly ? 'Rendering CSS preview…' : isJsx ? 'Rendering component…' : 'Rendering HTML…');
      const result = await renderAndGroundCode(input, invokeRenderSource);
      setStage(`Building editable template… (${result.cdir.pages.length} page${result.cdir.pages.length === 1 ? '' : 's'})`);
      applyCodeImportResult(result, codeSourceName ?? (asUrl ? 'URL' : isJsx ? 'JSX' : 'HTML'));
    } catch (e) {
      setError(`Couldn't import from code: ${(e as Error).message}`);
    } finally {
      setCodeBusy(false); setStage(null);
    }
  }, [codeText, codeSourceName, codeSourceFlavor, applyCodeImportResult]);

  // Figma Make / local-Figma exports (.make/.fig): unpack the ZIP, pick the
  // largest bundled page raster, and hand it to the standard faithful image
  // pipeline (mode chooser included). The binary canvas.fig itself is not
  // decodable, so a rasterless export gets explicit guidance instead.
  const onMakeFile = useCallback(async (f: File) => {
    setCodeBusy(true); setError(null); setDone(null);
    try {
      setStage('Unpacking Figma export…');
      const assets = await extractMakeAssets(new Uint8Array(await f.arrayBuffer()));
      // Validate candidates by decoded pixel area — exports often bundle a
      // useless 1×1 thumbnail that must not win.
      let best: { file: File; area: number } | null = null;
      for (const img of assets.images) {
        try {
          const candidate = new File([img.bytes.slice().buffer as ArrayBuffer], img.name.split('/').pop() || 'page.png', { type: img.mime });
          const url = URL.createObjectURL(candidate);
          const area = await new Promise<number>((resolve) => {
            const image = new Image();
            image.onload = () => resolve(image.naturalWidth * image.naturalHeight);
            image.onerror = () => resolve(0);
            image.src = url;
          });
          URL.revokeObjectURL(url);
          if (area >= 64 * 64 && (!best || area > best.area)) best = { file: candidate, area };
        } catch { /* skip undecodable entries */ }
      }
      if (!best) {
        setError(MAKE_NO_RASTER_GUIDANCE);
        return;
      }
      toast.success(`Loaded the export's page raster${assets.title ? ` from “${assets.title}”` : ''} — choose a reconstruction mode.`);
      onFile(best.file);
    } catch (e) {
      setError(`Couldn't unpack the Figma export: ${(e as Error).message}`);
    } finally {
      setCodeBusy(false); setStage(null);
    }
  }, [onFile]);

  /** Primary drop-zone router: Figma exports are unpacked, all else flows to PDF/image detection. */
  const onAnyFile = useCallback((f: File | null) => {
    if (f && isFigmaMakeFile(f.name)) { void onMakeFile(f); return; }
    onFile(f);
  }, [onFile, onMakeFile]);

  // C3/C4: a dropped .jsx/.tsx/.html/.css loads into the textarea for review; a
  // .zip project is built + imported immediately.
  const onCodeFile = useCallback(async (f: File | null) => {
    if (!f) return;
    if (isFigmaMakeFile(f.name)) { await onMakeFile(f); return; }
    const flavor = codeFlavorForFile(f.name);
    if (!flavor) { toast.error('Drop a .html/.css/.js/.jsx/.ts/.tsx file, a .zip project, or a Figma .make/.fig export.'); return; }
    if (flavor !== 'zip') {
      try { setCodeText(await f.text()); setCodeSourceName(f.name); setCodeSourceFlavor(flavor); setError(null); setDone(null); } catch { /* ignore */ }
      return;
    }
    if (f.size > MAX_CODE_ZIP_BYTES) {
      setError(`Project ZIP is too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Remove node_modules/build artifacts and keep the upload under ${(MAX_CODE_ZIP_BYTES / 1024 / 1024).toFixed(0)} MB.`);
      return;
    }
    setCodeBusy(true); setError(null); setDone(null);
    try {
      setStage('Building project…');
      const dataUrl = await fileToDataUrl(f);
      const zipBase64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      const result = await renderAndGroundCode({ zipBase64, sourceFilename: f.name }, invokeRenderSource);
      setStage(`Building editable template… (${result.cdir.pages.length} page${result.cdir.pages.length === 1 ? '' : 's'})`);
      applyCodeImportResult(result, f.name);
    } catch (e) {
      setError(`Couldn't import project: ${(e as Error).message}`);
    } finally {
      setCodeBusy(false); setStage(null);
    }
  }, [applyCodeImportResult, onMakeFile]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Start from a reference
          </DialogTitle>
          <DialogDescription>
            Drop a <strong>PDF</strong>, an <strong>image / screenshot</strong>, or a <strong>Figma .make/.fig export</strong>,
            paste an image or a link, or use the dedicated <strong>Code / ZIP template import</strong> section below. PDFs are
            re-synced with selectable fidelity; images and Figma exports are faithfully reconstructed; code/ZIP imports are
            rendered through CDIR into editable pages.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <Card className="p-4 border-success/40 bg-success/5">
            <div className="flex items-center gap-2 text-success font-medium">
              <CheckCircle2 className="h-5 w-5" /> Done
            </div>
            <p className="text-xs text-muted-foreground mt-2">{done}</p>
          </Card>
        ) : (
          <div className="space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); onAnyFile(e.dataTransfer.files?.[0] ?? null); }}
              role="button"
              tabIndex={0}
              onClick={() => !busy && fileRef.current?.click()}
              className={`w-full border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${dragging ? 'border-primary bg-primary/5' : 'hover:border-primary/50'} ${busy ? 'opacity-60 pointer-events-none' : ''}`}
            >
              {file ? (
                <div className="text-sm">
                  {kind === 'pdf' ? <FileText className="h-10 w-10 mx-auto text-primary mb-2" /> : <ImageIcon className="h-10 w-10 mx-auto text-primary mb-2" />}
                  <div className="font-medium">{file.name}</div>
                  <div className="text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB · {kind.toUpperCase()}</div>
                </div>
              ) : (
                <>
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                  <div className="text-sm text-muted-foreground">Drag a PDF or image here, click to browse, or paste an image</div>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/*,.make,.fig"
                className="hidden"
                onChange={(e) => onAnyFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {!file && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') fetchUrlImport(); }}
                      placeholder="…or paste a link — Google Drive, Docs/Slides, Dropbox, OneDrive, Figma…"
                      className="pl-8"
                      disabled={urlBusy || busy}
                    />
                  </div>
                  <Button variant="secondary" onClick={fetchUrlImport} disabled={!url.trim() || urlBusy || busy}>
                    {urlBusy ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Fetching…</> : 'Fetch'}
                  </Button>
                </div>
                {urlInfo && urlInfo.provider !== 'generic' && (
                  <p className="text-[11px] text-muted-foreground pl-1">
                    Detected <span className="font-medium capitalize">{urlInfo.provider.replace(/-/g, ' ')}</span>
                    {urlInfo.needsExport ? ' — needs a PDF/PNG export (we’ll guide you).'
                      : urlInfo.expectedKind === 'pdf' ? ' — exports to PDF.' : ''}
                  </p>
                )}
              </div>
            )}

            {!file && (
              <Card
                className="space-y-3 border-primary/25 bg-primary/5 p-4"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); onCodeFile(e.dataTransfer.files?.[0] ?? null); }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Label className="text-sm font-semibold flex items-center gap-1.5">
                      <Code2 className="h-4 w-4 text-primary" /> Code / ZIP template import
                      <Badge variant="outline" className="text-[10px]">beta</Badge>
                    </Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Upload a .zip project, a Figma .make/.fig export, or paste a URL, HTML, CSS, JSX, TSX, Vue, or Svelte source.
                      We render it, measure the DOM, and import editable CDIR pages with trace rasters for review.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => codeFileRef.current?.click()} disabled={codeBusy || busy}>
                    <Upload className="h-4 w-4 mr-1" /> Upload code / ZIP
                  </Button>
                </div>
                <Textarea
                  value={codeText}
                  onChange={(e) => { setCodeText(e.target.value); setCodeSourceName(null); setCodeSourceFlavor(null); }}
                  placeholder="Paste a live page URL (https://…), raw HTML/CSS, or a React/JSX component. For multi-page projects, upload a .zip."
                  className="text-xs font-mono min-h-[84px] bg-background"
                  disabled={codeBusy || busy}
                />
                {codeSourceName && (
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Badge variant="secondary" className="text-[10px]">Loaded file</Badge>
                    <span className="truncate">{codeSourceName}</span>
                  </div>
                )}
                <input
                  ref={codeFileRef}
                  type="file"
                  accept=".html,.htm,.css,.js,.jsx,.ts,.tsx,.vue,.svelte,.zip,.make,.fig,text/html,text/css,application/javascript,text/javascript,application/zip"
                  className="hidden"
                  onChange={(e) => { onCodeFile(e.target.files?.[0] ?? null); e.target.value = ''; }}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">
                    Tip: drag a project ZIP onto this panel to import multiple rendered pages instead of copy-pasting one page of code.
                  </p>
                  <Button variant="secondary" size="sm" onClick={startCodeReconstruct} disabled={!codeText.trim() || codeBusy || busy}>
                    {codeBusy ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Rendering…</> : <><Code2 className="h-4 w-4 mr-1" /> Render & import</>}
                  </Button>
                </div>
              </Card>
            )}

            {file && kind === 'pdf' && (
              <div>
                <Card className={`p-3 cursor-pointer mb-2 ${pdfClaude ? 'border-primary/40 bg-primary/5' : ''}`} onClick={() => !busy && setPdfClaude((v) => !v)}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={pdfClaude} onChange={() => setPdfClaude((v) => !v)} className="mt-1" disabled={busy} />
                    <div className="flex-1">
                      <Label className="font-medium cursor-pointer flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-primary" /> Reconstruct with Claude (reads the PDF directly)
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Best for scanned / image-only PDFs. Skips the fidelity modes below.</p>
                    </div>
                  </div>
                </Card>
                <Label className="text-sm font-medium">Fidelity mode</Label>
                <RadioGroup value={mode} onValueChange={(v) => setMode(v as FidelityMode)} className="mt-2 space-y-2" disabled={busy}>
                  {([
                    ['hybrid', 'Hybrid', 'Editable extraction + hidden source raster per page for tracing.', true],
                    ['semantic', 'Semantic', 'Editable text, vectors, and images at source colours/fonts. No raster.', false],
                    ['pixel', 'Pixel-perfect', 'High-DPI rasterised page as background. Exact look, not editable.', false],
                  ] as const).map(([val, label, desc, rec]) => (
                    <Card key={val} className={`p-3 cursor-pointer ${rec ? 'border-primary/30' : ''}`} onClick={() => !busy && setMode(val)}>
                      <div className="flex items-start gap-3">
                        <RadioGroupItem value={val} id={`ri-${val}`} className="mt-1" />
                        <div className="flex-1">
                          <Label htmlFor={`ri-${val}`} className="font-medium cursor-pointer flex items-center gap-2">
                            {label} {rec && <Badge variant="default" className="text-[10px]">Recommended</Badge>}
                          </Label>
                          <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </RadioGroup>
              </div>
            )}

            {file && kind === 'image' && (
              <div>
                <Label className="text-sm font-medium">Reconstruction mode</Label>
                <RadioGroup value={imageMode} onValueChange={(v) => setImageMode(v as ImageMode)} className="mt-2 space-y-2" disabled={busy}>
                  <Card className="p-3 cursor-pointer border-primary/30" onClick={() => !busy && setImageMode('faithful')}>
                    <div className="flex items-start gap-3">
                      <RadioGroupItem value="faithful" id="im-faithful" className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor="im-faithful" className="font-medium cursor-pointer flex items-center gap-2">
                          Faithful reconstruct <Badge variant="default" className="text-[10px]">Recommended</Badge>
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Reads the real text with OCR and places it at the measured positions — keeps your copy and layout. No fabrication.
                        </p>
                      </div>
                    </div>
                  </Card>
                  <Card className="p-3 cursor-pointer" onClick={() => !busy && setImageMode('redesign')}>
                    <div className="flex items-start gap-3">
                      <RadioGroupItem value="redesign" id="im-redesign" className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor="im-redesign" className="font-medium cursor-pointer flex items-center gap-2">
                          Redesign from inspiration <Sparkles className="h-3.5 w-3.5 text-primary" />
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Uses the reference as a style brief (palette, vibe, layout) and lets Claude author a fresh design. May rewrite copy.
                        </p>
                      </div>
                    </div>
                  </Card>
                </RadioGroup>
              </div>
            )}

            {(stage || progress) && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="capitalize">{stage ?? `${progress?.phase}${progress?.page && progress?.totalPages ? ` page ${progress.page}/${progress.totalPages}` : ''}`}</span>
                  {kind === 'pdf' && <span>{pdfPercent}%</span>}
                </div>
                {kind === 'pdf' ? <Progress value={pdfPercent} /> : <Progress value={undefined} className="animate-pulse" />}
              </div>
            )}

            {error && (
              <Card className="p-3 bg-destructive/5 border-destructive/30 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium text-destructive">Import failed</div>
                  <div className="text-muted-foreground mt-0.5 break-words">{error}</div>
                </div>
              </Card>
            )}
          </div>
        )}

        <DialogFooter>
          {done ? (
            <Button onClick={() => handleClose(false)}>Close</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => handleClose(false)} disabled={busy}>Cancel</Button>
              <Button onClick={start} disabled={!file || busy}>
                {busy
                  ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> {kind === 'pdf' ? 'Importing…' : imageMode === 'faithful' ? 'Reconstructing…' : 'Redesigning…'}</>
                  : <><Upload className="h-4 w-4 mr-1" /> {error ? 'Retry' : kind === 'image' ? (imageMode === 'faithful' ? 'Reconstruct' : 'Redesign') : 'Import'}</>}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
