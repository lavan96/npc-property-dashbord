/**
 * Template Builder — admin landing page (Phase 1).
 *
 * Lists report templates and lets superadmins create new ones.
 * The visual editor (EditorialCanvas WYSIWYG surface) lives at
 * /admin/template-builder/:id.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, FileText, Edit, Trash2, CheckCircle2, Layers, Upload, History, Loader2, Search, SlidersHorizontal } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useReportTemplates, useReportTemplateMutations } from '@/hooks/useReportTemplates';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { makeBlankTemplate } from '@/lib/reportTemplate/templateSchema';
import { getAdapter, listAdapters } from '@/lib/reportTemplate/adapters';
import {
  DEFAULT_TEMPLATE_LIST_FILTERS,
  filterAndSortTemplates,
  formatTemplateDate,
  getTemplateReportTypeOptions,
  getTemplateStats,
  getTemplatePageCount,
  readTemplateListFiltersFromParams,
  writeTemplateListFiltersToParams,
  type TemplateSortOption,
  type TemplateStatusFilter,
} from '@/lib/reportTemplate/templateListControls';
import { ImportPdfDialog } from '@/components/templateBuilder/ImportPdfDialog';
import { ImportReviewDialog } from '@/components/templateBuilder/ImportReviewDialog';
import { loadImportReviewDraft, readImportReviewDecision, saveImportReviewDecision, type ImportReviewDecisionRecord, type LoadImportReviewDraftResult, type PersistedImportRecord } from '@/lib/reportTemplate/ingestion/importArtifacts';
import type { ImportReviewDecision, ImportReviewDraft } from '@/lib/reportTemplate/ingestion/review';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { ensureCatalogFontFaces } from '@/lib/reportTemplate/fontCatalog';
import { applyTemplateImportPlan, reconcilePdfImportAsset, TemplateDesignAgentReconciliationClient, type ImportAsset, type RawImportManifest } from '@/lib/reportTemplate/ingestion/reconciliation';
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

type ImportReviewDebugSnapshot = Record<string, string | number | boolean | null>;

const REPORT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  listAdapters().map((adapter) => [adapter.reportType, adapter.label]),
);

export default function TemplateBuilder() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: templates = [], isLoading } = useReportTemplates();
  const { create, update, remove } = useReportTemplateMutations();
  const { canEdit, canDelete } = usePermissions();
  const { user } = useAuth();
  const canEditTemplates = canEdit('templates');
  const canDeleteTemplates = canDelete('templates');
  const [importOpen, setImportOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<ImportReviewDraft | null>(null);
  const [reviewLoadingId, setReviewLoadingId] = useState<string | null>(null);
  const [reviewImportId, setReviewImportId] = useState<string | null>(null);
  const [recordedDecision, setRecordedDecision] = useState<ImportReviewDecisionRecord | null>(null);
  const [reviewRecord, setReviewRecord] = useState<PersistedImportRecord | null>(null);
  const [reviewImportAsset, setReviewImportAsset] = useState<ImportAsset | null>(null);
  const [reviewImportManifests, setReviewImportManifests] = useState<RawImportManifest[] | null>(null);
  const [reconcilingReview, setReconcilingReview] = useState(false);
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

  const resetPersistedReviewState = () => {
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
  };
  const [filters, setFilters] = useState(() => readTemplateListFiltersFromParams(searchParams));
  const searchParamString = searchParams.toString();
  const { search, reportType: reportTypeFilter, status: statusFilter, sort } = filters;

  useEffect(() => {
    setFilters(readTemplateListFiltersFromParams(new URLSearchParams(searchParamString)));
  }, [searchParamString]);

  useEffect(() => {
    const next = writeTemplateListFiltersToParams(filters);
    if (next.toString() !== searchParamString) {
      setSearchParams(next, { replace: true });
    }
  }, [filters, searchParamString, setSearchParams]);

  const reportTypeOptions = useMemo(() => {
    return getTemplateReportTypeOptions(templates)
      .sort((a: string, b: string) => (REPORT_TYPE_LABELS[a] || a).localeCompare(REPORT_TYPE_LABELS[b] || b));
  }, [templates]);

  const visibleTemplates = useMemo(() => {
    return filterAndSortTemplates(templates, filters);
  }, [templates, filters]);

  const templateStats = useMemo(() => getTemplateStats(templates), [templates]);

  const hasTemplateFilters = search.trim() !== '' || reportTypeFilter !== 'all' || statusFilter !== 'all';
  const clearTemplateFilters = () => {
    setFilters((current) => ({
      ...current,
      search: DEFAULT_TEMPLATE_LIST_FILTERS.search,
      reportType: DEFAULT_TEMPLATE_LIST_FILTERS.reportType,
      status: DEFAULT_TEMPLATE_LIST_FILTERS.status,
    }));
  };
  const clearTemplateView = () => {
    setFilters(DEFAULT_TEMPLATE_LIST_FILTERS);
  };

  const handleCreate = () => {
    if (!canEditTemplates) return;
    create.mutate(
      { name: 'Untitled template', schema: makeBlankTemplate() },
      {
        onSuccess: (record: any) => {
          if (record?.id) navigate(`/admin/template-builder/${record.id}`);
        },
      },
    );
  };


  const { data: recentImports = [], isLoading: importsLoading, refetch: refetchRecentImports } = useQuery({
    queryKey: ['template-imports', 'recent', user?.id],
    enabled: !!user?.id && canEditTemplates,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('template_imports')
        .select('id,source_filename,page_count,status,created_template_id,created_at,meta')
        .eq('user_id', user!.id)
        .eq('status', 'completed')
        .not('meta->>cdir_artifact_path', 'is', null)
        .order('created_at', { ascending: false })
        .limit(3);
      if (error) throw error;
      return data ?? [];
    },
  });

  const hydratePersistedVisualQuality = async (importId: string) => {
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
  };

  const hydratePersistedRepairAudit = async (importId: string) => {
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
  };

  const openPersistedReview = async (importId: string) => {
    setReviewLoadingId(importId);
    resetPersistedReviewState();
    try {
      const loaded = await loadImportReviewDraft({ importId });
      const { draft, record, importAsset, importManifests } = loaded;
      setPersistedReview(loaded);
      setReviewDraft(draft);
      setReviewImportId(importId);
      setReviewRecord(record);
      setReviewImportAsset(importAsset);
      setReviewImportManifests(importManifests);
      setRecordedDecision(readImportReviewDecision(record.meta));
      setReviewDebug({
        stage: 'get_artifacts_loaded',
        importId,
        templateId: record.created_template_id ?? null,
        pageContextSource: loaded.pageContextSource,
        entrypointAvailable: Boolean(loaded.pageContextEntrypoint?.available),
        entrypointSource: loaded.pageContextEntrypoint?.source ?? null,
        entrypointManifestPath: loaded.pageContextEntrypoint?.manifest_path ?? null,
        pageContextCount: loaded.pageContexts.length,
        pageContextValidationOk: loaded.pageContextValidation.ok,
        pageContextValidationProblemCount: loaded.pageContextValidation.problems.length,
        sourceRasterCount: loaded.renderArtifactManifest.sourceRasterCount,
        renderProblemCount: loaded.renderArtifactManifest.problems.length,
        visualQaAvailable: Boolean(loaded.renderArtifactManifest.sourceRasterCount),
        repairAvailable: Boolean(loaded.renderArtifactManifest.sourceRasterCount),
      });
      await hydratePersistedVisualQuality(importId);
      await hydratePersistedRepairAudit(importId);
      setReviewOpen(true);
    } catch (err) {
      toast.error(`Could not load import review: ${(err as Error).message}`);
    } finally {
      setReviewLoadingId(null);
    }
  };

  const runPersistedVisualQa = async () => {
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
        finalMode: 'hybrid',
        persist: true,
        maxRasterDim: 768,
      });
      const nextLoaded = { ...persistedReview, draft: qa.draft };
      setPersistedReview(nextLoaded);
      setReviewDraft(qa.draft);
      setRepairDraftReady(false);
      const visualPersistResult = qa.visualQa.persistResult as any;
      setReviewDebug((prev) => ({
        ...(prev ?? {}),
        stage: 'visual_qa_completed',
        visualQaPersistKind: visualPersistResult?.kind ?? null,
        visualQaScore: qa.visualQa.summary.overallScore,
        visualQaUploadedCount: qa.visualQa.summary.uploadedCount,
        visualQaProblemCount: qa.visualQa.summary.problems.length,
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
  };

  const runPersistedRepair = async () => {
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
        finalMode: 'hybrid',
        persistVisualQa: true,
        maxRasterDim: 768,
        maxRepairPasses: 2,
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
      const repairSaveResult = saved as any;
      setReviewDebug((prev) => ({
        ...(prev ?? {}),
        stage: 'repair_completed',
        repairStatus: repair.summary.repairStatus,
        repairFinalScore: repair.summary.finalScore,
        repairTotalApplied: repair.summary.totalApplied,
        repairAuditSaveKind: repairSaveResult?.kind ?? null,
        repairAuditPath: repairSaveResult?.auditPath ?? null,
      }));
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
      const message = (err as Error).message;
      setReviewDebug((prev) => ({ ...(prev ?? {}), stage: 'repair_failed', repairError: message }));
      toast.error(`Repair failed: ${message}`);
    } finally {
      setRepairBusy(false);
    }
  };

  const applyPersistedRepair = async () => {
    const templateId = reviewRecord?.created_template_id ?? null;
    if (!templateId) {
      toast.error('No template record is linked to this import.');
      return;
    }
    if (!persistedReview?.draft?.template) {
      toast.error('No repaired template is available to apply.');
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
      setReviewDebug((prev) => ({
        ...(prev ?? {}),
        stage: 'apply_repair_completed',
        appliedTemplateId: applied.templateId,
        appliedNextVersion: applied.nextVersion,
      }));
      toast.success(`Repair applied to template v${applied.nextVersion}.`);
      setReviewOpen(false);
      navigate(`/admin/template-builder/${templateId}`);
    } catch (err) {
      const message = (err as Error).message;
      setReviewDebug((prev) => ({ ...(prev ?? {}), stage: 'apply_repair_failed', applyRepairError: message }));
      toast.error(`Could not apply repair: ${message}`);
    } finally {
      setApplyRepairBusy(false);
    }
  };

  const runPersistedPdfReconciliation = async () => {
    if (!reviewDraft || !reviewRecord?.created_template_id || !reviewImportAsset) {
      toast.error('This review does not have persisted PDF reference assets to reconcile.');
      return;
    }
    setReconcilingReview(true);
    const t = toast.loading('Reconciling persisted PDF references…');
    try {
      const result = await reconcilePdfImportAsset(reviewImportAsset, {
        manifests: reviewImportManifests ?? undefined,
        existingTemplate: reviewDraft.template,
        client: new TemplateDesignAgentReconciliationClient(invokeSecureFunction as any),
        constraints: {
          mode: 'persisted-import-review-reconcile',
          importId: reviewImportId,
          sourceFilename: reviewDraft.sourceFilename,
        },
      });
      const schema = ensureCatalogFontFaces(applyTemplateImportPlan(result.plan, {
        templateName: reviewDraft.sourceFilename ?? 'Reconciled PDF import',
        baseTemplate: reviewDraft.template,
      }));
      await update.mutateAsync({
        id: reviewRecord.created_template_id,
        patch: { schema },
        snapshot: true,
        note: `AI reconciled persisted PDF import ${reviewImportId ?? reviewRecord.id}`,
      });
      toast.success(`Applied reconciliation plan with ${result.plan.importSummary.editableElementsCreated} editable overlay(s).`, { id: t });
      navigate(`/admin/template-builder/${reviewRecord.created_template_id}`);
    } catch (err) {
      toast.error(`PDF reconciliation failed: ${(err as Error).message}`, { id: t });
    } finally {
      setReconcilingReview(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-2">
            <Layers className="h-7 w-7 text-primary" />
            Template Builder
          </h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
            Visual editor for every PDF report template. Drag, drop, bind to live data, and
            preview the actual generated PDF in real time.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {canEditTemplates && (
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-1" />
              Import PDF
            </Button>
          )}
          {canEditTemplates && (
            <Button onClick={handleCreate} disabled={create.isPending}>
              <Plus className="h-4 w-4 mr-1" />
              New template
            </Button>
          )}
        </div>
      </div>
      <ImportPdfDialog open={importOpen} onOpenChange={setImportOpen} />
      <ImportReviewDialog
        open={reviewOpen}
        onOpenChange={(v) => {
          setReviewOpen(v);
          if (!v) resetPersistedReviewState();
        }}
        draft={reviewDraft}
        recordedDecision={recordedDecision}
        reconciliationAvailable={!!reviewImportAsset && !!reviewRecord?.created_template_id}
        reconciliationBusy={reconcilingReview}
        onRunReconciliation={runPersistedPdfReconciliation}
        onRunVisualQa={runPersistedVisualQa}
        visualQaAvailable={Boolean(persistedReview?.renderArtifactManifest?.sourceRasterCount)}
        visualQaBusy={visualQaBusy}
        visualQaSummary={visualQaSummary}
        visualQualitySignedUrls={persistedVisualQuality?.signedUrls ?? null}
        visualQualityArtifactPaths={persistedVisualQuality?.artifactPaths ?? null}
        onRunRepair={runPersistedRepair}
        repairAvailable={Boolean(persistedReview?.renderArtifactManifest?.sourceRasterCount)}
        repairBusy={repairBusy}
        repairSummary={repairSummary}
        repairAuditPath={persistedRepairAudit?.artifactPaths?.summary ?? null}
        reviewDebug={reviewDebug}
        onApplyRepair={applyPersistedRepair}
        applyRepairAvailable={Boolean(repairDraftReady && repairSummary && persistedReview?.draft?.template && !repairApplied)}
        applyRepairBusy={applyRepairBusy}
        onRecordDecision={reviewImportId ? async (decision: ImportReviewDecision, note?: string) => {
          try {
            const saved = await saveImportReviewDecision({ importId: reviewImportId, decision, note });
            setRecordedDecision(saved.decision);
            toast.success('Import review decision saved.');
            refetchRecentImports();
          } catch (err) {
            toast.error(`Could not save review decision: ${(err as Error).message}`);
          }
        } : undefined}
      />


      {canEditTemplates && (importsLoading || recentImports.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4 text-primary" /> Recent import reviews
            </CardTitle>
            <CardDescription>
              Reopen persisted CDIR/fidelity reviews for recent PDF imports.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {importsLoading ? (
              <Skeleton className="h-10" />
            ) : recentImports.map((imp: any) => {
              const summary = (imp.meta as any)?.cdir_fidelity_summary ?? {};
              const savedDecision = readImportReviewDecision(imp.meta as any);
              return (
                <div key={imp.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{imp.source_filename || 'Imported PDF'}</div>
                    <div className="text-xs text-muted-foreground">
                      {imp.page_count ?? 0} page{imp.page_count === 1 ? '' : 's'} · score {summary.overallScore == null ? '—' : `${Math.round(summary.overallScore * 100)}%`}
                      {savedDecision ? ` · ${savedDecision.decision.replace(/_/g, ' ')}` : ''}
                    </div>
                    {savedDecision?.note && <div className="text-[11px] text-muted-foreground line-clamp-1">Note: {savedDecision.note}</div>}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openPersistedReview(imp.id)}
                    disabled={reviewLoadingId === imp.id}
                  >
                    {reviewLoadingId === imp.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <History className="h-3.5 w-3.5 mr-1" />}
                    Review
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {!isLoading && templates.length > 0 && (
        <div className="grid gap-3 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Total templates</div>
              <div className="mt-1 text-2xl font-semibold">{templateStats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Active</div>
              <div className="mt-1 text-2xl font-semibold text-primary">{templateStats.active}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Draft</div>
              <div className="mt-1 text-2xl font-semibold">{templateStats.draft}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Preview-only</div>
              <div className="mt-1 text-2xl font-semibold">{templateStats.previewOnly}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {!isLoading && templates.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              Find the right template quickly
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_150px_170px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setFilters((current) => ({ ...current, search: e.target.value }))}
                  placeholder="Search by name, description, report type, or tier…"
                  className="pl-9"
                />
              </div>
              <Select
                value={reportTypeFilter}
                onValueChange={(value) => setFilters((current) => ({ ...current, reportType: value }))}
              >
                <SelectTrigger aria-label="Filter by report type">
                  <SelectValue placeholder="Report type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All report types</SelectItem>
                  {reportTypeOptions.map((type) => (
                    <SelectItem key={type} value={type}>{REPORT_TYPE_LABELS[type] || type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(value) => setFilters((current) => ({ ...current, status: value as TemplateStatusFilter }))}
              >
                <SelectTrigger aria-label="Filter by status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="draft">Draft only</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={sort}
                onValueChange={(value) => setFilters((current) => ({ ...current, sort: value as TemplateSortOption }))}
              >
                <SelectTrigger aria-label="Sort templates">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updated_desc">Recently updated</SelectItem>
                  <SelectItem value="name_asc">Name A–Z</SelectItem>
                  <SelectItem value="name_desc">Name Z–A</SelectItem>
                  <SelectItem value="type">Report type</SelectItem>
                  <SelectItem value="active_first">Active first</SelectItem>
                  <SelectItem value="pages_desc">Most pages</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Showing {visibleTemplates.length} of {templates.length} template{templates.length === 1 ? '' : 's'}.</span>
              {hasTemplateFilters && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearTemplateFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <CardTitle className="text-lg">No templates yet</CardTitle>
            <CardDescription className="mt-2 max-w-md mx-auto">
              Create your first template to start designing report layouts visually.
            </CardDescription>
            {canEditTemplates && (
              <Button onClick={handleCreate} className="mt-6" disabled={create.isPending}>
                <Plus className="h-4 w-4 mr-1" /> Create first template
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        visibleTemplates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <CardTitle className="text-lg">No templates match your filters</CardTitle>
              <CardDescription className="mt-2 max-w-md mx-auto">
                Broaden the search, change the report type/status, or clear filters to view all templates.
              </CardDescription>
              <Button variant="outline" className="mt-5" onClick={clearTemplateView}>
                Clear filters
              </Button>
            </CardContent>
          </Card>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleTemplates.map((tpl) => {
            const pageCount = getTemplatePageCount(tpl);
            return (
              <Card key={tpl.id} className="hover:border-primary/40 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base truncate">{tpl.name}</CardTitle>
                      <CardDescription className="mt-1 line-clamp-2 text-xs">
                        {tpl.description || 'No description'}
                      </CardDescription>
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        Updated {formatTemplateDate(tpl.updated_at)}
                      </div>
                    </div>
                    {tpl.is_active && (
                      <Badge variant="default" className="text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Active
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {tpl.report_type && (() => {
                      const adapter = getAdapter(tpl.report_type);
                      return (
                        <Badge variant={adapter?.supportsProduction ? 'secondary' : 'outline'} title={adapter?.supportsProduction ? 'Production adapter available' : 'Preview-only report type'}>
                          {adapter?.label || REPORT_TYPE_LABELS[tpl.report_type] || tpl.report_type}
                          {adapter && !adapter.supportsProduction ? ' · preview-only' : ''}
                        </Badge>
                      );
                    })()}
                    {tpl.tier && <Badge variant="outline">{tpl.tier}</Badge>}
                    <Badge variant="outline">v{tpl.version}</Badge>
                    <Badge variant="outline">
                      {pageCount} page{pageCount === 1 ? '' : 's'}
                    </Badge>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="default"
                      className="flex-1"
                      disabled={!canEditTemplates}
                      title={canEditTemplates ? 'Open editor' : 'Edit permission required'}
                      onClick={() => navigate(`/admin/template-builder/${tpl.id}`)}
                    >
                      <Edit className="h-3.5 w-3.5 mr-1" /> Open editor
                    </Button>
                    {canDeleteTemplates && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 rounded-full text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-destructive/40 disabled:text-muted-foreground disabled:hover:bg-transparent"
                            disabled={tpl.is_active || !!tpl.locked_for_review}
                            title={tpl.is_active ? 'Deactivate before deleting' : tpl.locked_for_review ? 'Unlock review before deleting' : `Delete template ${tpl.name}`}
                            aria-label={`Delete template ${tpl.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="border-destructive/25 bg-background text-foreground shadow-2xl shadow-destructive/10 sm:max-w-md">
                          <AlertDialogHeader className="space-y-3">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive sm:mx-0">
                              <Trash2 className="h-5 w-5" />
                            </div>
                            <AlertDialogTitle className="text-destructive">Delete template?</AlertDialogTitle>
                            <AlertDialogDescription className="space-y-2 text-left text-muted-foreground">
                              <span className="block">
                                This will permanently delete <span className="font-medium text-foreground">{tpl.name}</span>.
                              </span>
                              <span className="block">Only inactive, unlocked templates can be deleted. This cannot be undone.</span>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="gap-2 sm:gap-0">
                            <AlertDialogCancel className="border-border bg-background text-foreground hover:bg-muted">Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/40"
                              onClick={() => {
                                if (tpl.is_active || tpl.locked_for_review) return;
                                remove.mutate(tpl.id);
                              }}
                            >
                              Delete template
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        )
      )}
    </div>
  );
}
