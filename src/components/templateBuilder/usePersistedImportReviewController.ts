import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { applyRepairedTemplateToRecord, buildVisualRepairAuditPayload, loadVisualQuality, loadVisualRepairAudit, persistedVisualQualityToReviewSummary, runImportReviewVisualQualityPipeline, runVisualRepairOrchestrationPipeline, saveVisualRepairAudit, type PersistedVisualQuality, type PersistedVisualRepairAudit, type VisualQaReviewSummary, type VisualRepairOrchestrationSummary } from '@/lib/reportTemplate/ingestion/visualQuality';
import { loadImportReviewDraft, readImportReviewDecision, saveImportReviewDecision, type ImportReviewDecisionRecord, type LoadImportReviewDraftResult, type PersistedImportRecord } from '@/lib/reportTemplate/ingestion/importArtifacts';
import type { ImportReviewDecision, ImportReviewDraft } from '@/lib/reportTemplate/ingestion/review';
import type { ImportAsset, RawImportManifest } from '@/lib/reportTemplate/ingestion/reconciliation';

type ImportReviewDebugSnapshot = Record<string, string | number | boolean | null>;

export function usePersistedImportReviewController(options: { onDecisionSaved?: () => void; onRepairApplied?: (templateId: string) => void } = {}) {
  const navigate = useNavigate();
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
  const [repairApplied, setRepairApplied] = useState(false);
  const [repairDraftReady, setRepairDraftReady] = useState(false);
  const [reviewDebug, setReviewDebug] = useState<ImportReviewDebugSnapshot | null>(null);

  const resetVolatile = useCallback(() => {
    setVisualQaBusy(false); setVisualQaSummary(null); setPersistedVisualQuality(null); setRepairBusy(false);
    setRepairSummary(null); setPersistedRepairAudit(null); setApplyRepairBusy(false); setRepairApplied(false);
    setRepairDraftReady(false); setReviewDebug(null);
  }, []);

  const hydratePersistedVisualQuality = useCallback(async (importId: string) => {
    const loadedVisual = await loadVisualQuality(importId);
    if (loadedVisual.kind === 'ok') {
      setPersistedVisualQuality(loadedVisual.payload);
      setVisualQaSummary(persistedVisualQualityToReviewSummary(loadedVisual.payload));
      return loadedVisual.payload;
    }
    if (loadedVisual.kind === 'missing') setPersistedVisualQuality(null);
    else console.warn('[visualQuality] load failed', loadedVisual.message);
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
    if (loadedRepair.kind === 'missing') { setPersistedRepairAudit(null); setRepairSummary(null); }
    else console.warn('[visualRepair] load failed', loadedRepair.message);
    return null;
  }, []);

  const openPersistedReview = useCallback(async (importId: string) => {
    setReviewLoadingId(importId); resetVolatile();
    try {
      const loaded = await loadImportReviewDraft({ importId });
      const { draft, record, importAsset, importManifests } = loaded;
      setPersistedReview(loaded); setReviewDraft(draft); setReviewImportId(importId); setReviewRecord(record);
      setReviewImportAsset(importAsset); setReviewImportManifests(importManifests); setRecordedDecision(readImportReviewDecision(record.meta));
      setReviewDebug({
        stage: 'get_artifacts_loaded', importId, templateId: record.created_template_id ?? null,
        pageContextSource: loaded.pageContextSource, entrypointAvailable: Boolean(loaded.pageContextEntrypoint?.available),
        entrypointSource: loaded.pageContextEntrypoint?.source ?? null, entrypointManifestPath: loaded.pageContextEntrypoint?.manifest_path ?? null,
        pageContextCount: loaded.pageContexts.length, pageContextValidationOk: loaded.pageContextValidation.ok,
        pageContextValidationProblemCount: loaded.pageContextValidation.problems.length,
        sourceRasterCount: loaded.renderArtifactManifest.sourceRasterCount, renderProblemCount: loaded.renderArtifactManifest.problems.length,
        visualQaAvailable: Boolean(loaded.renderArtifactManifest.sourceRasterCount), repairAvailable: Boolean(loaded.renderArtifactManifest.sourceRasterCount),
      });
      await hydratePersistedVisualQuality(importId); await hydratePersistedRepairAudit(importId); setReviewOpen(true);
    } catch (err) { toast.error(`Could not load import review: ${(err as Error).message}`); }
    finally { setReviewLoadingId(null); }
  }, [hydratePersistedRepairAudit, hydratePersistedVisualQuality, resetVolatile]);

  const runVisualQa = useCallback(async () => {
    if (!reviewImportId || !persistedReview) { toast.error('Persisted review artifacts are not loaded yet.'); return; }
    setVisualQaBusy(true); setReviewDebug((p) => ({ ...(p ?? {}), stage: 'visual_qa_clicked', visualQaClickedAt: new Date().toISOString() }));
    try {
      const qa = await runImportReviewVisualQualityPipeline({ loaded: persistedReview, templateId: reviewRecord?.created_template_id ?? null, finalMode: 'hybrid', persist: true, maxRasterDim: 768 });
      const nextLoaded = { ...persistedReview, draft: qa.draft }; setPersistedReview(nextLoaded); setReviewDraft(qa.draft); setRepairDraftReady(false);
      const persistResult = qa.visualQa.persistResult as any;
      setReviewDebug((p) => ({ ...(p ?? {}), stage: 'visual_qa_completed', visualQaPersistKind: persistResult?.kind ?? null, visualQaPersistMessage: persistResult?.message ?? null, visualQaScore: qa.visualQa.summary.overallScore, visualQaUploadedCount: qa.visualQa.summary.uploadedCount, visualQaProblemCount: qa.visualQa.summary.problems.length }));
      if (qa.visualQa.persistResult.kind === 'ok') { const persisted = await hydratePersistedVisualQuality(reviewImportId); if (!persisted) setVisualQaSummary(qa.visualQa.summary); toast.success(`Visual QA saved · score ${Math.round(qa.visualQa.summary.overallScore * 100)}%`); }
      else { setVisualQaSummary(qa.visualQa.summary); toast.error(`Visual QA could not be saved: ${qa.visualQa.persistResult.message}`); }
    } catch (err) { const message = (err as Error).message; setReviewDebug((p) => ({ ...(p ?? {}), stage: 'visual_qa_failed', visualQaError: message })); toast.error(`Visual QA failed: ${message}`); }
    finally { setVisualQaBusy(false); }
  }, [hydratePersistedVisualQuality, persistedReview, reviewImportId, reviewRecord?.created_template_id]);

  const runRepair = useCallback(async () => {
    if (!reviewImportId || !persistedReview) { toast.error('Persisted review artifacts are not loaded yet.'); return; }
    setRepairBusy(true); setReviewDebug((p) => ({ ...(p ?? {}), stage: 'repair_clicked', repairClickedAt: new Date().toISOString() }));
    try {
      const repair = await runVisualRepairOrchestrationPipeline({ loaded: persistedReview, templateId: reviewRecord?.created_template_id ?? null, finalMode: 'hybrid', persistVisualQa: true, maxRasterDim: 768, maxRepairPasses: 2 });
      const payload = buildVisualRepairAuditPayload(repair); const saved = await saveVisualRepairAudit(repair.importId, payload);
      const nextLoaded = { ...persistedReview, draft: repair.draft }; setPersistedReview(nextLoaded); setReviewDraft(repair.draft);
      setRepairSummary(repair.summary); setRepairApplied(false); setRepairDraftReady(Boolean(repair.draft?.template)); setVisualQaSummary(repair.visualQa.visualQa.summary);
      const saveResult = saved as any;
      setReviewDebug((p) => ({ ...(p ?? {}), stage: 'repair_completed', repairStatus: repair.summary.repairStatus, repairFinalScore: repair.summary.finalScore, repairTotalApplied: repair.summary.totalApplied, repairAuditSaveKind: saveResult?.kind ?? null, repairAuditPath: saveResult?.auditPath ?? null }));
      if (saved.kind === 'ok') { setPersistedRepairAudit({ importId: repair.importId, payload, artifactPaths: { summary: saved.auditPath, repairFolder: `${repair.importId}/repair` } }); await hydratePersistedVisualQuality(repair.importId); toast.success(`Repair audit saved · final score ${Math.round(repair.summary.finalScore * 100)}%`); }
      else toast.error(`Repair completed but audit could not be saved: ${saved.message}`);
    } catch (err) { const message = (err as Error).message; setReviewDebug((p) => ({ ...(p ?? {}), stage: 'repair_failed', repairError: message })); toast.error(`Repair failed: ${message}`); }
    finally { setRepairBusy(false); }
  }, [hydratePersistedVisualQuality, persistedReview, reviewImportId, reviewRecord?.created_template_id]);

  const applyRepair = useCallback(async () => {
    const templateId = reviewRecord?.created_template_id ?? null;
    if (!templateId) { toast.error('No template record is linked to this import.'); return; }
    if (!persistedReview?.draft?.template) { toast.error('No repaired template is available to apply.'); return; }
    setApplyRepairBusy(true);
    try {
      const applied = await applyRepairedTemplateToRecord({ templateId, repairedTemplate: persistedReview.draft.template, repairSummary, repairAuditPath: persistedRepairAudit?.artifactPaths?.summary ?? null, note: 'Applied deterministic PDF visual repair from persisted import review.' });
      setRepairApplied(true); setRepairDraftReady(false); setReviewDebug((p) => ({ ...(p ?? {}), stage: 'apply_repair_completed', appliedTemplateId: applied.templateId, appliedNextVersion: applied.nextVersion }));
      toast.success(`Repair applied to template v${applied.nextVersion}.`); setReviewOpen(false); options.onRepairApplied?.(templateId); navigate(`/admin/template-builder/${templateId}`);
    } catch (err) { const message = (err as Error).message; setReviewDebug((p) => ({ ...(p ?? {}), stage: 'apply_repair_failed', applyRepairError: message })); toast.error(`Could not apply repair: ${message}`); }
    finally { setApplyRepairBusy(false); }
  }, [navigate, options, persistedRepairAudit?.artifactPaths?.summary, persistedReview?.draft?.template, repairSummary, reviewRecord?.created_template_id]);

  const recordDecision = useCallback(async (decision: ImportReviewDecision, note?: string) => {
    if (!reviewImportId) return;
    const saved = await saveImportReviewDecision({ importId: reviewImportId, decision, note });
    setRecordedDecision(saved.decision); toast.success('Import review decision saved.'); options.onDecisionSaved?.();
  }, [options, reviewImportId]);

  const dialogProps = useMemo(() => ({
    open: reviewOpen,
    onOpenChange: (v: boolean) => { setReviewOpen(v); if (!v) resetVolatile(); },
    draft: reviewDraft,
    recordedDecision,
    onRunVisualQa: runVisualQa,
    visualQaAvailable: Boolean(persistedReview?.renderArtifactManifest?.sourceRasterCount),
    visualQaBusy,
    visualQaSummary,
    visualQualitySignedUrls: persistedVisualQuality?.signedUrls ?? null,
    visualQualityArtifactPaths: persistedVisualQuality?.artifactPaths ?? null,
    onRunRepair: runRepair,
    repairAvailable: Boolean(persistedReview?.renderArtifactManifest?.sourceRasterCount),
    repairBusy,
    repairSummary,
    repairAuditPath: persistedRepairAudit?.artifactPaths?.summary ?? null,
    reviewDebug,
    onApplyRepair: applyRepair,
    applyRepairAvailable: Boolean(repairDraftReady && repairSummary && persistedReview?.draft?.template && !repairApplied),
    applyRepairBusy,
    onRecordDecision: reviewImportId ? recordDecision : undefined,
  }), [applyRepair, applyRepairBusy, persistedRepairAudit?.artifactPaths?.summary, persistedReview?.draft?.template, persistedReview?.renderArtifactManifest?.sourceRasterCount, persistedVisualQuality?.artifactPaths, persistedVisualQuality?.signedUrls, recordDecision, recordedDecision, repairApplied, repairBusy, repairDraftReady, repairSummary, resetVolatile, reviewDebug, reviewDraft, reviewImportId, reviewOpen, runRepair, runVisualQa, visualQaBusy, visualQaSummary]);

  return { reviewOpen, setReviewOpen, reviewDraft, reviewLoadingId, reviewImportId, reviewRecord, reviewImportAsset, reviewImportManifests, persistedReview, openPersistedReview, runVisualQa, runRepair, applyRepair, dialogProps };
}
