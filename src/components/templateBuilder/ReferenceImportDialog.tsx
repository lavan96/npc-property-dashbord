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
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Upload, FileText, Image as ImageIcon, Sparkles, CheckCircle2, AlertCircle, Loader2,
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
import { supabase } from '@/integrations/supabase/client';
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

type ImageMode = 'faithful' | 'redesign';

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
    const words: OcrWord[] = (data?.words ?? [])
      .filter((w: any) => w?.text?.trim())
      .map((w: any) => ({ text: w.text, x0: w.bbox?.x0 ?? 0, y0: w.bbox?.y0 ?? 0, x1: w.bbox?.x1 ?? 0, y1: w.bbox?.y1 ?? 0 }));
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
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<ReferenceKind>('unsupported');
  const [mode, setMode] = useState<FidelityMode>('hybrid');
  const [imageMode, setImageMode] = useState<ImageMode>('faithful'); // R5: faithful reconstruct by default
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const reset = () => {
    setFile(null); setKind('unsupported'); setBusy(false);
    setProgress(null); setStage(null); setError(null); setDone(null); setDragging(false);
  };
  const handleClose = (v: boolean) => { if (busy) return; if (!v) reset(); onOpenChange(v); };

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
      if (kind === 'pdf') {
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

        // R5 — FAITHFUL path grounds the agent on measured OCR text so it
        // transcribes/places real copy instead of re-inventing it from a brief.
        // REDESIGN path explicitly opts into the design-brief reinterpretation.
        let groundedReference: GroundedReference | undefined;
        if (imageMode === 'faithful') {
          setStage('Measuring text (OCR)…');
          const ocr = await ocrImageWords(dataUrl);
          if (ocr && ocr.words.length) groundedReference = groundOcrWords(ocr.words, ocr.width, ocr.height);
        }

        const instruction = imageMode === 'faithful'
          ? 'Reconstruct this reference faithfully as editable native blocks on the active page. Transcribe the text exactly and keep the measured positions — do not redesign or rewrite.'
          : 'Use this reference as inspiration to (re)design the active page.';
        setStage(imageMode === 'faithful'
          ? `Reconstructing faithfully…${groundedReference ? ` (${groundedReference.elements.length} measured elements)` : ''}`
          : 'Redesigning with AI… this can take ~20–40s');

        const { data, error: invokeError } = await supabase.functions.invoke('template-design-agent', {
          body: {
            schema,
            messages: [{ role: 'user', content: instruction }],
            instruction,
            activePageId,
            mode: imageMode === 'faithful' ? 'screenshot_to_block' : 'design',
            imageDataUrl: dataUrl,
            ...(groundedReference ? { groundedReference } : {}),
            sampleData,
          },
        });
        if (invokeError) throw new Error(invokeError.message);
        if ((data as any)?.error) throw new Error((data as any).error);
        const reconstructed = (data as any)?.schema;
        const validation = validateReconstructedSchema(reconstructed);
        if (!validation.ok) throw new Error(`Reconstruction was not usable: ${validation.errors.join(' ')}`);
        onApplySchema?.(parseTemplate(reconstructed));
        const warnings: string[] = (data as any)?.warnings ?? [];
        const measured = groundedReference ? ` from ${groundedReference.elements.length} measured text element(s)` : '';
        setDone(`${imageMode === 'faithful' ? 'Reconstructed' : 'Redesigned'} ${validation.pageCount} page${validation.pageCount === 1 ? '' : 's'}${measured}.${warnings.length ? ` ${warnings.length} warning(s) — review in the Design Agent.` : ''}`);
      }
    } catch (e) {
      setError((e as Error).message || 'Import failed.');
    } finally {
      setBusy(false); setStage(null); setProgress(null);
    }
  }, [file, kind, mode, imageMode, templateName, templateId, user?.id, schema, activePageId, sampleData, onResynced, onApplySchema]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Start from a reference
          </DialogTitle>
          <DialogDescription>
            Drop a <strong>PDF</strong> or an <strong>image / screenshot</strong> (or paste an image). PDFs are
            re-synced with selectable fidelity; images are <strong>faithfully reconstructed</strong> (OCR-grounded, keeps your
            copy) or redesigned from inspiration. The result is validated before it touches your template.
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
              onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0] ?? null); }}
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
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {file && kind === 'pdf' && (
              <div>
                <Label className="text-sm font-medium">Fidelity mode</Label>
                <RadioGroup value={mode} onValueChange={(v) => setMode(v as FidelityMode)} className="mt-2 space-y-2" disabled={busy}>
                  {([
                    ['hybrid', 'Hybrid', 'Raster backdrop + editable text overlays.', true],
                    ['semantic', 'Semantic', 'Editable text overlays only, no raster.', false],
                    ['pixel', 'Pixel-perfect', 'High-DPI rasterised page as background.', false],
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
