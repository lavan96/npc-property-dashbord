/**
 * Upload-a-PDF → editable Template dialog.
 *
 * Lets a designer choose between Semantic (Track A) and Pixel-perfect
 * (Track B) fidelity, or Hybrid (both), and shows real-time per-page
 * progress + a fidelity report card when finished.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { extractPdfToTemplate, type FidelityMode, type ImportProgress, type ImportResult } from '@/lib/reportTemplate/pdfImport/extractPdfToTemplate';
import { useAuth } from '@/hooks/useAuth';
import { buildImportReviewDraft, type ImportReviewDecision } from '@/lib/reportTemplate/ingestion/review';
import { saveImportReviewDecision, type ImportReviewDecisionRecord } from '@/lib/reportTemplate/ingestion/importArtifacts';
import { ImportReviewDialog } from './ImportReviewDialog';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ImportPdfDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<FidelityMode>('semantic'); // R1: clean editable text by default
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [recordedDecision, setRecordedDecision] = useState<ImportReviewDecisionRecord | null>(null);

  const reset = () => {
    setFile(null);
    setProgress(null);
    setBusy(false);
    setResult(null);
    setReviewOpen(false);
    setRecordedDecision(null);
  };

  const handleClose = (v: boolean) => {
    if (busy) return;
    if (!v) reset();
    onOpenChange(v);
  };

  const onFile = (f: File | null) => {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name)) {
      toast.error('Only PDF files are supported.');
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      toast.error('Max 50 MB.');
      return;
    }
    setFile(f);
    setResult(null);
    setRecordedDecision(null);
  };

  const start = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setProgress({ phase: 'reading' });
    try {
      const res = await extractPdfToTemplate(file, {
        mode,
        templateName: file.name.replace(/\.pdf$/i, ''),
        userId: user?.id ?? null,
        onProgress: setProgress,
      });
      setResult(res);
      setRecordedDecision(null);
      toast.success(`Imported ${res.pageCount} page${res.pageCount === 1 ? '' : 's'}.`);
    } catch (err) {
      toast.error(`Import failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [file, mode, user?.id]);

  const percent = (() => {
    if (!progress?.page || !progress?.totalPages) return progress ? 5 : 0;
    return Math.round((progress.page / progress.totalPages) * 95);
  })();

  const reviewDraft = useMemo(() => {
    if (!result?.cdir) return null;
    return buildImportReviewDraft({
      id: `review_${result.importId}`,
      cdir: result.cdir,
      fidelity: result.cdirFidelity,
    });
  }, [result]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" /> Import PDF as editable template
          </DialogTitle>
          <DialogDescription>
            Convert any PDF brochure or report into a fully editable template. Choose how faithful the conversion should be.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            {/* Dropzone */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="w-full border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors disabled:opacity-60"
            >
              <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              {file ? (
                <div className="text-sm">
                  <div className="font-medium">{file.name}</div>
                  <div className="text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Click to select a PDF (max 50 MB)
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
            </button>

            {/* Mode */}
            <div>
              <Label className="text-sm font-medium">Fidelity mode</Label>
              <RadioGroup
                value={mode}
                onValueChange={(v) => setMode(v as FidelityMode)}
                className="mt-2 space-y-2"
                disabled={busy}
              >
                <Card className="p-3 cursor-pointer" onClick={() => !busy && setMode('semantic')}>
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="semantic" id="m-semantic" className="mt-1" />
                    <div className="flex-1">
                      <Label htmlFor="m-semantic" className="font-medium cursor-pointer">Semantic (Track A)</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Extract text, vectors, and images at exact coordinates and source colours/fonts as editable overlays. Smallest file size, best for digital-native PDFs.
                      </p>
                    </div>
                  </div>
                </Card>
                <Card className="p-3 cursor-pointer" onClick={() => !busy && setMode('pixel')}>
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="pixel" id="m-pixel" className="mt-1" />
                    <div className="flex-1">
                      <Label htmlFor="m-pixel" className="font-medium cursor-pointer">Pixel-perfect (Track B)</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Rasterise each page at 180 DPI as the page background. Looks identical to the source, but is not editable.
                      </p>
                    </div>
                  </div>
                </Card>
                <Card className="p-3 cursor-pointer border-primary/30" onClick={() => !busy && setMode('hybrid')}>
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="hybrid" id="m-hybrid" className="mt-1" />
                    <div className="flex-1">
                      <Label htmlFor="m-hybrid" className="font-medium cursor-pointer flex items-center gap-2">
                        Hybrid <Badge variant="default" className="text-[10px]">Recommended</Badge>
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Editable extraction + a hidden, locked source raster per page. Toggle it visible in the Layers panel to trace against the original.
                      </p>
                    </div>
                  </div>
                </Card>
                <Card className="p-3 cursor-pointer" onClick={() => !busy && setMode('ocr')}>
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="ocr" id="m-ocr" className="mt-1" />
                    <div className="flex-1">
                      <Label htmlFor="m-ocr" className="font-medium cursor-pointer flex items-center gap-2">
                        OCR (scanned PDF) <Badge variant="outline" className="text-[10px]">Tesseract</Badge>
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        For scans and image-only PDFs. Rasterises each page and recognises text via Tesseract (English). Slower.
                      </p>
                    </div>
                  </div>
                </Card>
              </RadioGroup>
            </div>

            {/* Progress */}
            {progress && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="capitalize">{progress.phase}{progress.page && progress.totalPages ? ` page ${progress.page} / ${progress.totalPages}` : ''}</span>
                  <span>{percent}%</span>
                </div>
                <Progress value={percent} />
              </div>
            )}
          </div>
        ) : (
          // Result card
          <div className="space-y-3">
            <Card className="p-4 border-success/40 bg-success/5">
              <div className="flex items-center gap-2 text-success font-medium">
                <CheckCircle2 className="h-5 w-5" /> Import complete
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <Stat label="Pages" value={result.pageCount} />
                <Stat label="Text overlays" value={result.fidelityReport.textBlocks} />
                <Stat label="Vector groups" value={result.fidelityReport.vectors} />
                <Stat label="Images" value={result.fidelityReport.images} />
                <Stat label="Fonts embedded" value={result.fidelityReport.fontsEmbedded} />
                <Stat label="Rasterised" value={result.fidelityReport.rasterizedPages} />
                <Stat label="Semantic only" value={result.fidelityReport.semanticPages} />
              </div>
              {result.fidelityReport.fontsSubstituted.length > 0 && (
                <div className="mt-3 text-xs text-muted-foreground flex items-start gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <div>
                    Fonts substituted: {result.fidelityReport.fontsSubstituted.slice(0, 6).join(', ')}
                    {result.fidelityReport.fontsSubstituted.length > 6 ? ` +${result.fidelityReport.fontsSubstituted.length - 6} more` : ''}
                  </div>
                </div>
              )}

              {result.cdirFidelity && (
                <div className="mt-4 rounded-md border bg-background/70 p-3">
                  <div className="flex items-center justify-between gap-2 text-xs font-medium">
                    <span>Editable fidelity score</span>
                    <Badge variant={result.cdirFidelity.warnings.length ? 'secondary' : 'default'}>
                      {Math.round(result.cdirFidelity.overallScore * 100)}%
                    </Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <PercentStat label="Native coverage" value={result.cdirFidelity.nativeCoverage} />
                    <PercentStat label="Raster fallback" value={result.cdirFidelity.rasterFallbackCoverage} />
                    {result.cdirFidelity.textAccuracy !== null && (
                      <PercentStat label="Text accuracy" value={result.cdirFidelity.textAccuracy} />
                    )}
                    {result.cdirFidelity.medianPositionDrift !== null && (
                      <Stat label="Median drift" value={Math.round(result.cdirFidelity.medianPositionDrift)} />
                    )}
                  </div>
                  {result.cdirFidelity.warnings.length > 0 && (
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      {result.cdirFidelity.warnings.slice(0, 2).map((warning) => warning.message).join(' ')}
                      {result.cdirFidelity.warnings.length > 2 ? ` +${result.cdirFidelity.warnings.length - 2} more warning(s).` : ''}
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="ghost" onClick={() => handleClose(false)} disabled={busy}>Cancel</Button>
              <Button onClick={start} disabled={!file || busy}>
                {busy ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Importing…</> : 'Import'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => handleClose(false)}>Close</Button>
              {reviewDraft && <Button variant="secondary" onClick={() => setReviewOpen(true)}>Review quality</Button>}
              <Button onClick={() => { onOpenChange(false); navigate(`/admin/template-builder/${result.template.id}`); }}>
                Open in editor
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
      <ImportReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        draft={reviewDraft}
        onRetry={() => { setReviewOpen(false); setResult(null); }}
        onOpenTemplate={result ? () => { onOpenChange(false); navigate(`/admin/template-builder/${result.template.id}`); } : undefined}
        recordedDecision={recordedDecision}
        onRecordDecision={result ? async (decision: ImportReviewDecision, note?: string) => {
          try {
            const saved = await saveImportReviewDecision({ importId: result.importId, decision, note });
            setRecordedDecision(saved.decision);
            toast.success('Import review decision saved.');
          } catch (err) {
            toast.error(`Could not save review decision: ${(err as Error).message}`);
          }
        } : undefined}
      />
    </Dialog>
  );
}

function PercentStat({ label, value }: { label: string; value: number }) {
  return <Stat label={label} value={Math.round(value * 100)} suffix="%" />;
}

function Stat({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="flex justify-between border-b border-border/40 pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}{suffix}</span>
    </div>
  );
}
