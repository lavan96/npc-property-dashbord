/**
 * PdfImportEngineAdmin — retired rollout console.
 *
 * Wave F7 removes the legacy pdf.js engine toggle. This page remains as a
 * superadmin landing page so old bookmarks explain the new Docling-only state
 * and direct operators to diagnostics instead of a deleted flag editor.
 */
import { Link } from 'react-router-dom';
import { CheckCircle2, DatabaseZap, ShieldCheck, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';

export default function PdfImportEngineAdmin() {
  const { isSuperadmin } = useAuth();

  if (!isSuperadmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Superadmin role required to view PDF import engine status.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">PDF import engine</h1>
          <Badge variant="default">Docling only</Badge>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          The Wave F7 retirement removed the legacy in-browser pdf.js template importer and the
          feature-flag rollout controls. New imports, re-imports, rasters, OCR, diagnostics, and
          reconciliation metadata now flow through the Cloud Run Docling pipeline.
        </p>
      </header>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" /> Legacy toggle retired
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            The `pdf_import.engine` flag and UI selector are no longer used. Dispatcher requests are
            idempotent and always target the Docling sidecar.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <DatabaseZap className="h-4 w-4 text-primary" /> Observable pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Use diagnostics for attempts, summaries, SSIM artifacts, cost telemetry, and diagnostics
            bundle links instead of side-by-side legacy comparisons.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> Compliance defaults
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Signed diagnostic URLs are short lived, PII redaction remains available from import
            dialogs, and diagnostic downloads are audited.
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Button asChild>
          <Link to="/admin/pdf-import-diagnostics">Open diagnostics</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/admin/template-builder">Import a PDF</Link>
        </Button>
      </div>
    </div>
  );
}
