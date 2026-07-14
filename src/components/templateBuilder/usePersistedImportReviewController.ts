import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  applyRepairedTemplateToRecord,
  buildVisualRepairAuditPayload,
  loadVisualQuality,
  loadVisualRepairAudit,
  persistedVisualQualityToReviewSummary,
  runImportReviewVisualQualityPipeline,
  runVisualRepairOrchestrationPipeline,
  saveVisualRepairAudit,
  type PersistedVisualQuality,
  type PersistedVisualRepairAudit,
  type VisualQaReviewSummary,
  type VisualRepairOrchestrationSummary,
} from '@/lib/reportTemplate/ingestion/visualQuality';
import {
  loadImportReviewDraft,
  readImportReviewDecision,
  saveImportReviewDecision,
  type ImportReviewDecisionRecord,
  type LoadImportReviewDraftResult,
  type PersistedImportRecord,
} from '@/lib/reportTemplate/ingestion/importArtifacts';
import type { ImportReviewDecision, ImportReviewDraft } from '@/lib/reportTemplate/ingestion/review';
import { applyFidelityModeToTemplate, type ForcedFidelityMode } from '@/lib/reportTemplate/pdfImport/applyFidelityMode';
import type { FidelityMode } from '@/lib/reportTemplate/pdfImport/types';
import type { ImportAsset, RawImportManifest } from '@/lib/reportTemplate/ingestion/reconciliation';

type ImportReviewDebugSnapshot = Record<string, string | number | boolean | null>;
type FinalMode = 'semantic' | 'hybrid' | 'pixel-perfect';

interface PersistedImportReviewControllerOptions {
  onDecisionSaved?: () => void;
  onRepairApplied?: (templateId: string) => void;
  finalMode?: FinalMode;
  maxRasterDim?: number;
  maxRepairPasses?: number;
}

function toFinalMode(mode?: PersistedImportReviewControllerOptions['finalMode'] | FidelityMode): FinalMode {
  if (mode === 'pixel') return 'pixel-perfect';
  if (mode === 'semantic' || mode === 'pixel-perfect' || mode === 'hybrid') return mode;
  return 'hybrid';
}

function hasVisualArtifacts(loaded: LoadImportReviewDraftResult | null): boolean {
  return Boolean(loaded?.renderArtifactManifest?.sourceRasterCount && loaded.renderArtifactManifest.sourceRasterCount > 0);
}

function buildLoadedReviewDebug(loaded: LoadImportReviewDraftResult, importId: string): ImportReviewDebugSnapshot {
  return {
    stage: 'get_artifacts_loaded',
    importId,
    templateId: loaded.record.created_template_id ?? null,
    pageContextSource: loaded.pageContextSource,
    entrypointAvailable: Boolean(loaded.pageContextEntrypoint?.available),
    entrypointSource: loaded.pageContextEntrypoint?.source ?? null,
    entrypointManifestPath: loaded.pageContextEntrypoint?.manifest_path ?? null,
    pageContextCount: loaded.pageContexts.length,
    pageContextSummaryOk: loaded.pageContextSummary?.ok ?? null,
    pageContextValidationOk: loaded.pageContextValidation.ok,
    pageContextValidationProblemCount: loaded.pageContextValidation.problems.length,
    sourceRasterCount: loaded.renderArtifactManifest.sourceRasterCount,
    doclingPageArtifactCount: loaded.renderArtifactManifest.doclingPageArtifactCount,
    renderProblemCount: loaded.renderArtifactManifest.problems.length,
    visualQaAvailable: Boolean(loaded.renderArtifactManifest.sourceRasterCount),
    repairAvailable: Boolean(loaded.renderArtifactManifest.sourceRasterCount),
  };
}

export function usePersistedImportReviewController(options: PersistedImportReviewControllerOptions = {}) {
  const navigate = useNavigate();
  const finalMode = toFinalMode(options.finalMode);
  const maxRasterDim = options.maxRasterDim ?? 768;
  const maxRepairPasses = options.maxRepairPasses ?? 2;

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<ImportReviewDraft | null>(null);
  const [reviewLoadingId, setReviewLoadingId] = useState<string | null>(null);
  const [reviewImportId, setReviewImportId] = useState<string | null>(null);
  const [recordedDecision, setRecordedDecision] = useState<ImportReviewDecisionRecord | null>(null);
  const [reviewRecord, setReviewRecord] = useState<PersistedImportRecord | null>(null);
  const [reviewImportAsset, setReviewImportAsset] = useState<ImportAsset | null>(null);
  const [reviewImportManifests, setReviewImportManifests] = useState<RawImportManifest[] | null>(null);
  const [persistedReview, setPersistedReview] = useState<LoadImportReviewDraftResult | null>(null);
  const [visualQaBusy, setVisualQaBusy] = useState(false);
  const [visualQaSummary, setVisualQaSummary] = useState<VisualQaReviewSummary | null>(null);
  const [persistedVisualQuality, setPersistedVisualQuality] = useState<PersistedVisualQuality | null>(null);
  const [repairBusy, setRepairBusy] = useState(false);
  const [repairSummary, setRepairSummary] = useState<VisualRepairOrchestrationSummary | null>(null);
  const [persistedRepairAudit, setPersistedRepairAudit] = useState<PersistedVisualRepairAudit | null>(null);
  const [applyRepairBusy, setApplyRepairBusy] = useState(false);
  const [forceModeBusy, setForceModeBusy] = useState(false);
  const [repairApplied, setRepairApplied] = useState(false);
  const [repairDraftReady, setRepairDraftReady] = useState(false);
  const [reviewDebug, setReviewDebug] = useState<ImportReviewDebugSnapshot | null>(null);

  const visualQaAvailable = hasVisualArtifacts(persistedReview);
  const repairAvailable = hasVisualArtifacts(persistedReview);
  const applyRepairAvailable = Boolean(repairDraftReady && repairSummary && persistedReview?.draft?.template && !repairApplied);

  const resetReviewState = useCallback(() => {
    setVisualQaBusy(false);
    setVisualQaSummary(null);
    setPersistedVisualQuality(null);
    setRepairBusy(false);
    setRepairSummary(null);
    setPersistedRepairAudit(null);
    setApplyRepairBusy(false);
    setRepairApplied(false);
    setRepairDraftReady(false);
    setReviewDebug(null);
  }, []);

  const hydratePersistedVisualQuality = useCallback(async (importId: string) => {
    const loadedVisual = await loadVisualQuality(importId);
    if (loadedVisual.kind === 'ok') {
      setPersistedVisualQuality(loadedVisual.payload);
      setVisualQaSummary(persistedVisualQualityToReviewSummary(loadedVisual.payload));
      return loadedVisual.payload;
    }
    if (loadedVisual.kind === 'missing') {
      setPersistedVisualQuality(null);
    } else {
      console.warn('[visualQuality] load failed', loadedVisual.message);
    }
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
      setRepairSummary(null);
    } else {
      console.warn('[visualRepair] load failed', loadedRepair.message);
    }
    return null;
  }, []);

  const openPersistedReview = useCallback(async (importId: string) => {
    setReviewLoadingId(importId);
    resetReviewState();
    try {
      const loaded = await loadImportReviewDraft({ importId });
      setPersistedReview(loaded);
      setReviewDraft(loaded.draft);
      setReviewImportId(importId);
      setReviewRecord(loaded.record);
      setReviewImportAsset(loaded.importAsset);
      setReviewImportManifests(loaded.importManifests);
      setRecordedDecision(readImportReviewDecision(loaded.record.meta));
      setReviewDebug(buildLoadedReviewDebug(loaded, importId));
      await hydratePersistedVisualQuality(importId);
      await hydratePersistedRepairAudit(importId);
      setReviewOpen(true);
    } catch (err) {
      toast.error(`Could not load import review: ${(err as Error).message}`);
    } finally {
      setReviewLoadingId(null);
    }
  }, [hydratePersistedRepairAudit, hydratePersistedVisualQuality, resetReviewState]);

  const runVisualQa = useCallback(async () => {
    if (!reviewImportId || !persistedReview) {
      toast.error('Persisted review artifacts are not loaded yet.');
      return;
    }
    setVisualQaBusy(true);
    setReviewDebug((prev) => ({ ...(prev ?? {}), stage: 'visual_qa_clicked', visualQaClickedAt: new Date().toISOString() }));
    try {
      const qa = await runImportReviewVisualQualityPipeline({
        loaded: persistedReview,
        templateId: reviewRecord?.created_template_id ?? null,
        finalMode,
        persist: true,
        maxRasterDim,
      });
      const nextLoaded = { ...persistedReview, draft: qa.draft };
      setPersistedReview(nextLoaded);
      setReviewDraft(qa.draft);
      setRepairDraftReady(false);
      const persistResult = qa.visualQa.persistResult as any;
      setReviewDebug((prev) => ({
        ...(prev ?? {}),
        stage: 'visual_qa_completed',
        visualQaPersistKind: persistResult?.kind ?? null,
        visualQaPersistMessage: persistResult?.message ?? null,
        visualQaScore: qa.visualQa.summary.overallScore,
        visualQaUploadedCount: qa.visualQa.summary.uploadedCount,
        visualQaProblemCount: qa.visualQa.summary.problems.length,
        visualQaProblems: qa.visualQa.summary.problems.slice(0, 5).join(' | ') || null,
      }));
      if (qa.visualQa.persistResult.kind === 'ok') {
        const persisted = await hydratePersistedVisualQuality(reviewImportId);
        if (!persisted) setVisualQaSummary(qa.visualQa.summary);
        toast.success(`Visual QA saved · score ${Math.round(qa.visualQa.summary.overallScore * 100)}%`);
      } else {
        setVisualQaSummary(qa.visualQa.summary);
        toast.error(`Visual QA could not be saved: ${qa.visualQa.persistResult.message}`);
      }
    } catch (err) {
      const message = (err as Error).message;
      setReviewDebug((prev) => ({ ...(prev ?? {}), stage: 'visual_qa_failed', visualQaError: message }));
      toast.error(`Visual QA failed: ${message}`);
    } finally {
      setVisualQaBusy(false);
    }
  }, [finalMode, hydratePersistedVisualQuality, maxRasterDim, persistedReview, reviewImportId, reviewRecord?.created_template_id]);

  const runRepair = useCallback(async () => {
    if (!reviewImportId || !persistedReview) {
      toast.error('Persisted review artifacts are not loaded yet.');
      return;
    }
    setRepairBusy(true);
    setReviewDebug((prev) => ({ ...(prev ?? {}), stage: 'repair_clicked', repairClickedAt: new Date().toISOString() }));
    try {
      const repair = await runVisualRepairOrchestrationPipeline({
        loaded: persistedReview,
        templateId: reviewRecord?.created_template_id ?? null,
        finalMode,
        persistVisualQa: true,
        maxRasterDim,
        maxRepairPasses,
      });
      const payload = buildVisualRepairAuditPayload(repair);
      const saved = await saveVisualRepairAudit(repair.importId, payload);
      const nextLoaded = { ...persistedReview, draft: repair.draft };
      setPersistedReview(nextLoaded);
      setReviewDraft(repair.draft);
      setRepairSummary(repair.summary);
      setRepairApplied(false);
      setRepairDraftReady(Boolean(repair.draft?.template));
      setVisualQaSummary(repair.visualQa.visualQa.summary);
      const saveResult = saved as any;
      setReviewDebug((prev) => ({
        ...(prev ?? {}),
        stage: 'repair_completed',
        repairStatus: repair.summary.repairStatus,
        repairFinalScore: repair.summary.finalScore,
        repairScoreDelta: repair.summary.scoreDelta,
        repairTotalApplied: repair.summary.totalApplied,
        repairProblemCount: repair.summary.problemCount,
        repairProblems: repair.summary.problems.slice(0, 5).join(' | ') || null,
        repairAuditPath: saveResult?.auditPath ?? null,
        repairAuditSaveKind: saveResult?.kind ?? null,
        repairAuditSaveMessage: saveResult?.message ?? null,
      }));
      if (saved.kind === 'ok') {
        setPersistedRepairAudit({
          importId: repair.importId,
          payload,
          artifactPaths: { summary: saved.auditPath, repairFolder: `${repair.importId}/repair` },
        });
        await hydratePersistedVisualQuality(repair.importId);
        toast.success(`Repair audit saved · final score ${Math.round(repair.summary.finalScore * 100)}%`);
      } else {
        toast.error(`Repair completed but audit could not be saved: ${saved.message}`);
      }
    } catch (err) {
      const message = (err as Error).message;
      setReviewDebug((prev) => ({ ...(prev ?? {}), stage: 'repair_failed', repairError: message }));
      toast.error(`Repair failed: ${message}`);
    } finally {
      setRepairBusy(false);
    }
  }, [finalMode, hydratePersistedVisualQuality, maxRasterDim, maxRepairPasses, persistedReview, reviewImportId, reviewRecord?.created_template_id]);

  const applyRepair = useCallback(async () => {
    const templateId = reviewRecord?.created_template_id ?? null;
    if (!templateId) {
      toast.error('No template record is linked to this import.');
      return;
    }
    if (!persistedReview?.draft?.template) {
      toast.error('No repaired template is available to apply.');
      return;
    }
    if (!repairSummary) {
      toast.error('Run repair before applying a repaired template.');
      return;
    }
    setApplyRepairBusy(true);
    try {
      const applied = await applyRepairedTemplateToRecord({
        templateId,
        repairedTemplate: persistedReview.draft.template,
        repairSummary,
        repairAuditPath: persistedRepairAudit?.artifactPaths?.summary ?? null,
        note: 'Applied deterministic PDF visual repair from persisted import review.',
      });
      setRepairApplied(true);
      setRepairDraftReady(false);
      setReviewDebug((prev) => ({ ...(prev ?? {}), stage: 'apply_repair_completed', appliedTemplateId: applied.templateId, appliedNextVersion: applied.nextVersion }));
      toast.success(`Repair applied to template v${applied.nextVersion}.`);
      setReviewOpen(false);
      options.onRepairApplied?.(templateId);
      navigate(`/admin/template-builder/${templateId}`);
    } catch (err) {
      const message = (err as Error).message;
      setReviewDebug((prev) => ({ ...(prev ?? {}), stage: 'apply_repair_failed', applyRepairError: message }));
      toast.error(`Could not apply repair: ${message}`);
    } finally {
      setApplyRepairBusy(false);
    }
  }, [navigate, options, persistedRepairAudit?.artifactPaths?.summary, persistedReview?.draft?.template, repairSummary, reviewRecord?.created_template_id]);

  const forceMode = useCallback(async (mode: ForcedFidelityMode) => {
    const templateId = reviewRecord?.created_template_id ?? null;
    const baseTemplate = persistedReview?.draft?.template;
    if (!templateId) {
      toast.error('No template record is linked to this import.');
      return;
    }
    if (!baseTemplate) {
      toast.error('No template is loaded to apply a fallback mode to.');
      return;
    }
    setForceModeBusy(true);
    try {
      const { template: forced, pagesChanged, pagesWithoutRaster } = applyFidelityModeToTemplate(baseTemplate, mode);
      if (mode === 'pixel-perfect' && pagesChanged > 0 && pagesWithoutRaster === pagesChanged) {
        toast.error('No source raster is available on these pages to lock behind — re-import in Pixel-perfect mode instead.');
        return;
      }
      const applied = await applyRepairedTemplateToRecord({
        templateId,
        repairedTemplate: forced,
        repairSummary: repairSummary ?? undefined,
        repairAuditPath: persistedRepairAudit?.artifactPaths?.summary ?? null,
        note: `Operator forced ${mode === 'pixel-perfect' ? 'pixel-perfect' : 'hybrid'} fallback from import review.`,
      });
      setReviewDebug((prev) => ({
        ...(prev ?? {}),
        stage: 'force_mode_applied',
        forcedMode: mode,
        forcedPagesChanged: pagesChanged,
        appliedTemplateId: applied.templateId,
        appliedNextVersion: applied.nextVersion,
      }));
      toast.success(`Forced ${mode === 'pixel-perfect' ? 'pixel-perfect' : 'hybrid'} mode · template v${applied.nextVersion}.`);
      setReviewOpen(false);
      options.onRepairApplied?.(templateId);
      navigate(`/admin/template-builder/${templateId}`);
    } catch (err) {
      const message = (err as Error).message;
      setReviewDebug((prev) => ({ ...(prev ?? {}), stage: 'force_mode_failed', forceModeError: message }));
      toast.error(`Could not force ${mode} mode: ${message}`);
    } finally {
      setForceModeBusy(false);
    }
  }, [navigate, options, persistedRepairAudit?.artifactPaths?.summary, persistedReview?.draft?.template, repairSummary, reviewRecord?.created_template_id]);

  const recordDecision = useCallback(async (decision: ImportReviewDecision, note?: string) => {
    if (!reviewImportId) return;
    try {
      const saved = await saveImportReviewDecision({ importId: reviewImportId, decision, note });
      setRecordedDecision(saved.decision);
      toast.success('Import review decision saved.');
      options.onDecisionSaved?.();
    } catch (err) {
      toast.error(`Could not save review decision: ${(err as Error).message}`);
    }
  }, [options, reviewImportId]);

  const dialogProps = useMemo(() => ({
    open: reviewOpen,
    onOpenChange: (open: boolean) => { setReviewOpen(open); if (!open) resetReviewState(); },
    draft: reviewDraft,
    recordedDecision,
    onRunVisualQa: runVisualQa,
    visualQaAvailable,
    visualQaBusy,
    visualQaSummary,
    visualQualitySignedUrls: persistedVisualQuality?.signedUrls ?? null,
    visualQualityArtifactPaths: persistedVisualQuality?.artifactPaths ?? null,
    onRunRepair: runRepair,
    repairAvailable,
    repairBusy,
    repairSummary,
    repairAuditPath: persistedRepairAudit?.artifactPaths?.summary ?? null,
    reviewDebug,
    onApplyRepair: applyRepair,
    applyRepairAvailable,
    applyRepairBusy,
    onForceMode: reviewRecord?.created_template_id ? forceMode : undefined,
    forceModeAvailable: Boolean(reviewRecord?.created_template_id && persistedReview?.draft?.template && !forceModeBusy),
    forceModeBusy,
    onRecordDecision: reviewImportId ? recordDecision : undefined,
  }), [applyRepair, applyRepairAvailable, applyRepairBusy, forceMode, forceModeBusy, persistedRepairAudit?.artifactPaths?.summary, persistedReview?.draft?.template, persistedVisualQuality?.artifactPaths, persistedVisualQuality?.signedUrls, recordDecision, recordedDecision, repairAvailable, repairBusy, repairSummary, resetReviewState, reviewDebug, reviewDraft, reviewImportId, reviewOpen, reviewRecord?.created_template_id, runRepair, runVisualQa, visualQaAvailable, visualQaBusy, visualQaSummary]);

  return {
    reviewOpen,
    setReviewOpen,
    reviewDraft,
    reviewRecord,
    reviewImportId,
    recordedDecision,
    reviewImportAsset,
    reviewImportManifests,
    reviewLoadingId,
    persistedReview,
    visualQaBusy,
    visualQaSummary,
    persistedVisualQuality,
    repairBusy,
    repairSummary,
    persistedRepairAudit,
    applyRepairBusy,
    repairApplied,
    repairDraftReady,
    reviewDebug,
    visualQaAvailable,
    repairAvailable,
    applyRepairAvailable,
    openPersistedReview,
    runVisualQa,
    runRepair,
    applyRepair,
    forceMode,
    forceModeBusy,
    recordDecision,
    resetReviewState,
    getImportReviewDialogProps: () => dialogProps,
    dialogProps,
  };
}
