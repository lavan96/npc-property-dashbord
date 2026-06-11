/**
 * Template Builder — admin landing page (Phase 1).
 *
 * Lists report templates and lets superadmins create new ones.
 * The visual editor (EditorialCanvas WYSIWYG surface) lives at
 * /admin/template-builder/:id.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, Edit, Trash2, CheckCircle2, Layers, Upload, History, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useReportTemplates, useReportTemplateMutations } from '@/hooks/useReportTemplates';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { makeBlankTemplate } from '@/lib/reportTemplate/templateSchema';
import { getAdapter, listAdapters } from '@/lib/reportTemplate/adapters';
import { ImportPdfDialog } from '@/components/templateBuilder/ImportPdfDialog';
import { ImportReviewDialog } from '@/components/templateBuilder/ImportReviewDialog';
import { loadImportReviewDraft, readImportReviewDecision, saveImportReviewDecision, type ImportReviewDecisionRecord } from '@/lib/reportTemplate/ingestion/importArtifacts';
import type { ImportReviewDecision, ImportReviewDraft } from '@/lib/reportTemplate/ingestion/review';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

const REPORT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  listAdapters().map((adapter) => [adapter.reportType, adapter.label]),
);

export default function TemplateBuilder() {
  const navigate = useNavigate();
  const { data: templates = [], isLoading } = useReportTemplates();
  const { create, remove } = useReportTemplateMutations();
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

  const openPersistedReview = async (importId: string) => {
    setReviewLoadingId(importId);
    try {
      const { draft, record } = await loadImportReviewDraft({ importId });
      setReviewDraft(draft);
      setReviewImportId(importId);
      setRecordedDecision(readImportReviewDecision(record.meta));
      setReviewOpen(true);
    } catch (err) {
      toast.error(`Could not load import review: ${(err as Error).message}`);
    } finally {
      setReviewLoadingId(null);
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
        <div className="flex gap-2">
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
        onOpenChange={setReviewOpen}
        draft={reviewDraft}
        recordedDecision={recordedDecision}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tpl) => {
            const pageCount = tpl.schema?.pages?.length ?? 0;
            return (
              <Card key={tpl.id} className="hover:border-primary/40 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base truncate">{tpl.name}</CardTitle>
                      <CardDescription className="mt-1 line-clamp-2 text-xs">
                        {tpl.description || 'No description'}
                      </CardDescription>
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
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        disabled={tpl.is_active || !!tpl.locked_for_review}
                        title={tpl.is_active ? 'Deactivate before deleting' : tpl.locked_for_review ? 'Unlock review before deleting' : 'Delete template'}
                        onClick={() => {
                          if (tpl.is_active || tpl.locked_for_review) return;
                          if (confirm(`Delete "${tpl.name}"? This cannot be undone.`)) {
                            remove.mutate(tpl.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
