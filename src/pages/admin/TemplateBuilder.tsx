/**
 * Template Builder — admin landing page (Phase 1).
 *
 * Lists report templates and lets superadmins create new ones.
 * The visual editor (tldraw canvas) lives at /admin/template-builder/:id (Phase 2).
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, Edit, Trash2, CheckCircle2, Layers, Upload } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useReportTemplates, useReportTemplateMutations } from '@/hooks/useReportTemplates';
import { usePermissions } from '@/hooks/usePermissions';
import { makeBlankTemplate } from '@/lib/reportTemplate/templateSchema';
import { getAdapter, listAdapters } from '@/lib/reportTemplate/adapters';
import { ImportPdfDialog } from '@/components/templateBuilder/ImportPdfDialog';

const REPORT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  listAdapters().map((adapter) => [adapter.reportType, adapter.label]),
);

export default function TemplateBuilder() {
  const navigate = useNavigate();
  const { data: templates = [], isLoading } = useReportTemplates();
  const { create, remove } = useReportTemplateMutations();
  const { canEdit, canDelete } = usePermissions();
  const canEditTemplates = canEdit('templates');
  const canDeleteTemplates = canDelete('templates');
  const [importOpen, setImportOpen] = useState(false);

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
