/**
 * Upload-a-PDF → editable Template dialog.
 *
 * Lets a designer choose between Semantic (Track A) and Pixel-perfect
 * (Track B) fidelity, or Hybrid (both), and shows real-time per-page
 * progress + a fidelity report card when finished.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { describeAuthError } from '@/lib/secureInvoke';
import { runReferenceImport } from '@/lib/reportTemplate/ingestion/importOrchestrator';
import { type FidelityMode, type ImportProgress, type ImportResult } from '@/lib/reportTemplate/pdfImport/types';
import { useAuth } from '@/hooks/useAuth';
import { buildImportReviewDraft, type ImportReviewDecision } from '@/lib/reportTemplate/ingestion/review';
import { loadImportReviewDraft, saveImportReviewDecision, type ImportReviewDecisionRecord, type LoadImportReviewDraftResult } from '@/lib/reportTemplate/ingestion/importArtifacts';
import { applyRepairedTemplateToRecord, buildVisualRepairAuditPayload, loadVisualQuality, loadVisualRepairAudit, persistedVisualQualityToReviewSummary, runImportReviewVisualQualityPipeline, runVisualRepairOrchestrationPipeline, saveVisualRepairAudit, type PersistedVisualQuality, type PersistedVisualRepairAudit, type VisualQaReviewSummary, type VisualRepairOrchestrationSummary } from '@/lib/reportTemplate/ingestion/visualQuality';
import { ImportReviewDialog } from './ImportReviewDialog';
import { importAssetToReviewArtifacts, summarizeImportAsset } from '@/lib/reportTemplate/ingestion/reconciliation';


const STAGE_LABELS: Record<string, string> = {
  reading: 'Reading source PDF',
  uploading: 'Uploading to parser',
  extracting: 'Parsing with engine',
  rasterizing: 'Rasterising pages',
  finalizing: 'Mapping and saving template',
  done: 'Import complete',
};
const STAGE_ETA_SECONDS: Record<string, number> = { reading: 5, uploading: 10, extracting: 45, rasterizing: 60, finalizing: 15 };

function progressCopy(progress: ImportProgress | null): { label: string; eta: string } {
  if (!progress) return { label: 'Waiting to start', eta: '' };
  const label = progress.message
    ?? STAGE_LABELS[progress.phase]
    ?? progress.phase;
  const etaSeconds = STAGE_ETA_SECONDS[progress.phase] ?? 20;
  const eta = progress.phase === 'done' ? 'Done' : `ETA ~${etaSeconds < 60 ? `${etaSeconds}s` : `${Math.round(etaSeconds / 60)}m`}`;
  return { label, eta };
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ImportPdfDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { user, isSuperadmin } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<FidelityMode>('hybrid'); // Phase 1: Hybrid is the production default — editable overlays with locked source raster fallback
  const [redactPii, setRedactPii] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [recordedDecision, setRecordedDecision] = useState<ImportReviewDecisionRecord | null>(null);
  const [persistedReview, setPersistedReview] = useState<LoadImportReviewDraftResult | null>(null);
  const [visualQaBusy, setVisualQaBusy] = useState(false);
  const [visualQaSummary, setVisualQaSummary] = useState<VisualQaReviewSummary | null>(null);
  const [persistedVisualQuality, setPersistedVisualQuality] = useState<PersistedVisualQuality | null>(null);
  const [repairBusy, setRepairBusy] = useState(false);
  const [repairSummary, setRepairSummary] = useState<VisualRepairOrchestrationSummary | null>(null);
  const [persistedRepairAudit, setPersistedRepairAudit] = useState<PersistedVisualRepairAudit | null>(null);
  const [applyRepairBusy, setApplyRepairBusy] = useState(false);
  const [repairApplied, setRepairApplied] = useState(false);
  const [repairDraftReady, setRepairDraftReady] = useState(false);

  const reset = () => {
    setFile(null);
    setProgress(null);
    setBusy(false);
    setResult(null);
    setReviewOpen(false);
    setRecordedDecision(null);
    setPersistedReview(null);
    setVisualQaSummary(null);
    setPersistedVisualQuality(null);
    setRepairBusy(false);
    setRepairSummary(null);
    setPersistedRepairAudit(null);
    setApplyRepairBusy(false);
    setRepairApplied(false);
    setRepairDraftReady(false);
    setPersistedReview(null);
    setVisualQaBusy(false);
    setVisualQaSummary(null);
    setPersistedVisualQuality(null);
    setRepairBusy(false);
    setRepairSummary(null);
    setPersistedRepairAudit(null);
    setApplyRepairBusy(false);
    setRepairApplied(false);
    setRepairDraftReady(false);
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
      const outcome = await runReferenceImport({ kind: 'pdf', file, mode }, {
        templateName: file.name.replace(/\.pdf$/i, ''),
        userId: user?.id ?? null,
        isSuperadmin,
        onProgress: setProgress,
        redactPii,
      });
      if (outcome.type !== 'persisted') throw new Error('Unexpected import outcome.');
      setResult(outcome.result);
      setRecordedDecision(null);
      setPersistedReview(null);
      setVisualQaSummary(null);
    setPersistedVisualQuality(null);
    setRepairBusy(false);
    setRepairSummary(null);
    setPersistedRepairAudit(null);
    setApplyRepairBusy(false);
    setRepairApplied(false);
    setRepairDraftReady(false);
      toast.success(`Imported ${outcome.result.pageCount} page${outcome.result.pageCount === 1 ? '' : 's'} via Docling.`);
    } catch (err) {
      toast.error(describeAuthError((err as Error).message) ?? `Import failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [file, mode, user?.id, isSuperadmin, redactPii]);

  const hydratePersistedVisualQuality = useCallback(async (importId: string) => {
    const loadedVisual = await loadVisualQuality(importId);
    if (loadedVisual.kind === 'ok') {
      setPersistedVisualQuality(loadedVisual.payload);
      setVisualQaSummary(persistedVisualQualityToReviewSummary(loadedVisual.payload));
      return loadedVisual.payload;
    }
    if (loadedVisual.kind === 'missing') {
      setPersistedVisualQuality(null);
    setRepairBusy(false);
    setRepairSummary(null);
    setPersistedRepairAudit(null);
    setApplyRepairBusy(false);
    setRepairApplied(false);
    setRepairDraftReady(false);
      return null;
    }
    console.warn('[visualQuality] load failed', loadedVisual.message);
    return null;
  }, []);

  const hydratePersistedRepairAudit = useCallback(async (importId: string) => {
    const loadedRepair = await loadVisualRepairAudit(importId);
    if (loadedRepair.kind === 'ok') {
      setPersistedRepairAudit(loadedRepair.payload);
      setRepairSummary(loadedRepair.payload.payload.summary);
      setRepairDraftReady(false);
      return loadedRepair.payload;
    }

    if (loadedRepair.kind === 'missing') {
      setPersistedRepairAudit(null);
    setApplyRepairBusy(false);
    setRepairApplied(false);
    setRepairDraftReady(false);
      setRepairSummary(null);
      return null;
    }

    console.warn('[visualRepair] load failed', loadedRepair.message);
    return null;
  }, []);

  const openReview = useCallback(async () => {
    if (!result?.importId) return;
    try {
      const loaded = await loadImportReviewDraft({ importId: result.importId });
      setPersistedReview(loaded);
      await hydratePersistedVisualQuality(result.importId);
      await hydratePersistedRepairAudit(result.importId);
      setReviewOpen(true);
    } catch (err) {
      toast.error(`Could not load persisted review artifacts: ${(err as Error).message}`);
      setReviewOpen(true);
    }
  }, [result?.importId, hydratePersistedVisualQuality, hydratePersistedRepairAudit]);

  const runVisualQa = useCallback(async () => {
    if (!persistedReview) {
      toast.error('Persisted review artifacts are not loaded yet.');
      return;
    }

    setVisualQaBusy(true);
    try {
      const qa = await runImportReviewVisualQualityPipeline({
        loaded: persistedReview,
        templateId: result?.template.id ?? persistedReview.record.created_template_id ?? null,
        finalMode: mode === 'pixel' ? 'pixel-perfect' : mode === 'semantic' ? 'semantic' : 'hybrid',
        persist: true,
        maxRasterDim: 768,
      });

      setPersistedReview({
        ...persistedReview,
        draft: qa.draft,
      });
      setRepairDraftReady(false);

      if (qa.visualQa.persistResult.kind === 'ok') {
        const persisted = await hydratePersistedVisualQuality(persistedReview.record.id);
        if (!persisted) setVisualQaSummary(qa.visualQa.summary);
        toast.success(`Visual QA saved · score ${Math.round(qa.visualQa.summary.overallScore * 100)}%`);
      } else {
        setVisualQaSummary(qa.visualQa.summary);
        toast.error(`Visual QA could not be saved: ${qa.visualQa.persistResult.message}`);
      }
    } catch (err) {
      toast.error(`Visual QA failed: ${(err as Error).message}`);
    } finally {
      setVisualQaBusy(false);
    }
  }, [persistedReview, result?.template.id, mode, hydratePersistedVisualQuality]);

  const runRepair = useCallback(async () => {
    if (!persistedReview) {
      toast.error('Persisted review artifacts are not loaded yet.');
      return;
    }

    setRepairBusy(true);
    try {
      const repair = await runVisualRepairOrchestrationPipeline({
        loaded: persistedReview,
        templateId: result?.template.id ?? persistedReview.record.created_template_id ?? null,
        finalMode: mode === 'pixel' ? 'pixel-perfect' : mode === 'semantic' ? 'semantic' : 'hybrid',
        persistVisualQa: true,
        maxRasterDim: 768,
        maxRepairPasses: 2,
      });

      const payload = buildVisualRepairAuditPayload(repair);
      const saved = await saveVisualRepairAudit(repair.importId, payload);

      setPersistedReview({
        ...persistedReview,
        draft: repair.draft,
      });
      setRepairSummary(repair.summary);
      setRepairApplied(false);
      setRepairDraftReady(Boolean(repair.draft?.template));
      setVisualQaSummary(repair.visualQa.visualQa.summary);

      if (saved.kind === 'ok') {
        setPersistedRepairAudit({
          importId: repair.importId,
          payload,
          artifactPaths: {
            summary: saved.auditPath,
            repairFolder: `${repair.importId}/repair`,
          },
        });
        await hydratePersistedVisualQuality(repair.importId);
        toast.success(`Repair audit saved · final score ${Math.round(repair.summary.finalScore * 100)}%`);
      } else {
        toast.error(`Repair completed but audit could not be saved: ${saved.message}`);
      }
    } catch (err) {
      toast.error(`Repair failed: ${(err as Error).message}`);
    } finally {
      setRepairBusy(false);
    }
  }, [persistedReview, result?.template.id, mode, hydratePersistedVisualQuality]);

  const applyRepair = useCallback(async () => {
    if (!persistedReview?.draft?.template) {
      toast.error('No repaired template is available to apply.');
      return;
    }

    const templateId = result?.template.id ?? persistedReview.record.created_template_id ?? null;
    if (!templateId) {
      toast.error('No template record is linked to this import.');
      return;
    }

    setApplyRepairBusy(true);
    try {
      const applied = await applyRepairedTemplateToRecord({
        templateId,
        repairedTemplate: persistedReview.draft.template,
        repairSummary,
        repairAuditPath: persistedRepairAudit?.artifactPaths?.summary ?? null,
        note: 'Applied deterministic PDF visual repair from import review.',
      });

      setRepairApplied(true);
      setRepairDraftReady(false);
      toast.success(`Repair applied to template v${applied.nextVersion}.`);
      onOpenChange(false);
      navigate(`/admin/template-builder/${templateId}`);
    } catch (err) {
      toast.error(`Could not apply repair: ${(err as Error).message}`);
    } finally {
      setApplyRepairBusy(false);
    }
  }, [persistedReview, result?.template.id, repairSummary, persistedRepairAudit?.artifactPaths?.summary, onOpenChange, navigate]);

  const percent = (() => {
    if (!progress) return 0;
    const total = progress.pagesTotal ?? progress.totalPages ?? 0;
    const done = progress.pagesCompleted ?? progress.page ?? 0;
    if (total > 0) return Math.min(99, Math.round((done / total) * 95));
    if (progress.phase === 'done') return 100;
    if (progress.phase === 'finalizing') return 90;
    if (progress.phase === 'rasterizing') return 55;
    if (progress.phase === 'extracting') return 30;
    if (progress.phase === 'uploading') return 15;
    return 5;
  })();

  const progressDetails = progressCopy(progress);

  const importAssetSummary = useMemo(() => summarizeImportAsset(result?.importAsset), [result?.importAsset]);

  const reviewDraft = useMemo(() => {
    if (!result?.cdir) return null;
    return buildImportReviewDraft({
      id: `review_${result.importId}`,
      cdir: result.cdir,
      fidelity: result.cdirFidelity,
      artifacts: importAssetToReviewArtifacts(result.importAsset),
    });
  }, [result]);

  const displayedReviewDraft = persistedReview?.draft ?? reviewDraft;
  const visualQaAvailable = Boolean(persistedReview?.renderArtifactManifest?.sourceRasterCount);
  const repairAvailable = Boolean(persistedReview?.renderArtifactManifest?.sourceRasterCount);
  const applyRepairAvailable = Boolean(repairDraftReady && repairSummary && persistedReview?.draft?.template && !repairApplied);

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
                <Card className="p-3 cursor-pointer border-primary/40 bg-primary/5" onClick={() => !busy && setMode('hybrid')}>
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="hybrid" id="m-hybrid" className="mt-1" />
                    <div className="flex-1">
                      <Label htmlFor="m-hybrid" className="font-medium cursor-pointer flex items-center gap-2">
                        Hybrid <Badge variant="default" className="text-[10px]">Recommended default</Badge>
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Production default. Preserves source-page fidelity using a locked raster reference per page, while generating editable overlays wherever extraction confidence is high. Safest choice for design-heavy reports — falls back gracefully when Docling misses layout, shapes, or spacing.
                      </p>
                    </div>
                  </div>
                </Card>

                <Card className="p-3 cursor-pointer" onClick={() => !busy && setMode('ocr')}>
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="ocr" id="m-ocr" className="mt-1" />
                    <div className="flex-1">
                      <Label htmlFor="m-ocr" className="font-medium cursor-pointer flex items-center gap-2">
                        OCR (scanned PDF) <Badge variant="outline" className="text-[10px]">Docling native</Badge>
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        For scans and image-only PDFs. Docling uses native OCR and parser confidence signals.
                      </p>
                    </div>
                  </div>
                </Card>
              </RadioGroup>
            </div>

            {/* Engine status */}
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-sm">
                <Zap className="h-4 w-4 text-primary" />
                <span className="font-medium">Extraction engine</span>
                <Badge variant="default" className="text-[10px]">Docling (cloud)</Badge>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Legacy pdf.js routing has been retired. All template PDF imports now use the Cloud Run Docling sidecar, including native OCR, high-DPI rastering, diagnostics, and job-ledger telemetry.
              </p>
            </div>


            <label className="flex items-start gap-2 rounded-md border bg-muted/20 p-3 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={redactPii}
                onChange={(e) => setRedactPii(e.target.checked)}
                disabled={busy}
              />
              <span>
                <span className="font-medium">Redact likely PII before diagnostics</span>
                <span className="block text-muted-foreground">Recommended for bank statements, payslips, loan applications, and finance-portal PDFs.</span>
              </span>
            </label>

            {/* Progress */}
            {progress && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground gap-2">
                  <span className="truncate">{progressDetails.label}</span>
                  <span className="whitespace-nowrap">{percent}% · {progressDetails.eta}</span>
                </div>
                <Progress value={percent} />
                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  <Badge variant="outline" className="font-mono">stage: {progress.stage ?? progress.phase}</Badge>
                  {progress.pagesTotal ? (
                    <Badge variant="outline">pages {progress.pagesCompleted ?? 0}/{progress.pagesTotal}</Badge>
                  ) : null}
                  <Badge variant="outline">Docling (cloud)</Badge>
                </div>
                {progress.warning && (
                  <div className="rounded-md border border-warning/40 bg-warning/5 px-2 py-1 text-[11px] text-warning flex items-start gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    <span className="break-words">{progress.warning}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          // Result card
          <div className="space-y-3">
            <Card className="p-4 border-success/40 bg-success/5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-success font-medium">
                  <CheckCircle2 className="h-5 w-5" /> Import complete
                </div>
                <Badge variant="default" className="text-[10px]"><Zap className="h-3 w-3 mr-1" />Docling</Badge>
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

              {importAssetSummary && (
                <div className="mt-3 rounded-md border bg-background/70 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2 font-medium">
                    <span>PDF reference asset</span>
                    <Badge variant="outline">{importAssetSummary.sourcePages}/{importAssetSummary.pageCount} page refs</Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    Rendered source pages were persisted for review, visual diffing, and provider-backed reconciliation.
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Stat label="Reference pages" value={importAssetSummary.sourcePages} />
                    <Stat label="Avg DPI scale" value={Number(importAssetSummary.averageDpiScale.toFixed(2))} />
                  </div>
                </div>
              )}

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
              {reviewDraft && <Button variant="secondary" onClick={openReview}>Review quality</Button>}
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
        draft={displayedReviewDraft}
        onRetry={() => { setReviewOpen(false); setResult(null); setPersistedReview(null); setVisualQaSummary(null); setRepairSummary(null); setPersistedRepairAudit(null); setRepairApplied(false); }}
        onRunVisualQa={runVisualQa}
        visualQaAvailable={visualQaAvailable}
        visualQaBusy={visualQaBusy}
        visualQaSummary={visualQaSummary}
        visualQualitySignedUrls={persistedVisualQuality?.signedUrls ?? null}
        visualQualityArtifactPaths={persistedVisualQuality?.artifactPaths ?? null}
        onRunRepair={runRepair}
        repairAvailable={repairAvailable}
        repairBusy={repairBusy}
        repairSummary={repairSummary}
        repairAuditPath={persistedRepairAudit?.artifactPaths?.summary ?? null}
        onApplyRepair={applyRepair}
        applyRepairAvailable={applyRepairAvailable}
        applyRepairBusy={applyRepairBusy}
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
