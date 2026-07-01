/**
 * PdfImportEngineAdmin — retired rollout console.
 *
 * Wave F7 removes the legacy pdf.js engine toggle. This page remains as a
 * superadmin landing page so old bookmarks explain the new Docling-only state
 * and direct operators to diagnostics instead of a deleted flag editor.
 */
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, DatabaseZap, FileUp, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DashboardThemeFrame } from '@/components/layout/DashboardThemeFrame';
import { useAuth } from '@/hooks/useAuth';

export default function PdfImportEngineAdmin() {
  const { isSuperadmin } = useAuth();

  if (!isSuperadmin) {
    return (
      <DashboardThemeFrame as="main" variant="page" className="p-4 sm:p-6">
        <DashboardThemeFrame variant="section" className="mx-auto max-w-3xl border-primary/10">
          <Card className="border-border/70 bg-card/80 shadow-none">
            <CardContent className="p-6 text-sm text-muted-foreground">
              Superadmin role required to view PDF import engine status.
            </CardContent>
          </Card>
        </DashboardThemeFrame>
      </DashboardThemeFrame>
    );
  }

  return (
    <DashboardThemeFrame
      as="main"
      variant="page"
      className="relative max-w-6xl space-y-6 px-3 py-4 sm:px-5 sm:py-6 lg:px-6"
    >
      <DashboardThemeFrame
        as="header"
        variant="hero"
        className="isolate border-primary/20 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.20),transparent_32%),radial-gradient(circle_at_bottom_right,hsl(var(--primary)/0.10),transparent_30%),linear-gradient(135deg,hsl(var(--card)/0.98),hsl(var(--background)/0.90)_56%,hsl(var(--primary)/0.10))] p-5 shadow-[0_24px_70px_rgba(15,23,42,0.12)] ring-1 ring-primary/10 dark:shadow-black/35 sm:p-6 lg:p-8"
      >
        <div className="absolute right-0 top-0 -z-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-5">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--primary)/0.68))] text-primary-foreground shadow-lg shadow-primary/20 ring-1 ring-white/40 dark:ring-white/10">
                <Zap className="h-7 w-7" aria-hidden="true" />
                <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-background bg-card text-primary shadow-sm">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </div>
              <div className="min-w-0 space-y-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                  <h1 className="min-w-0 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    PDF import engine
                  </h1>
                  <Badge className="shrink-0 rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary shadow-sm hover:bg-primary/20">
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Docling only
                  </Badge>
                </div>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
                  The Wave F7 retirement removed the legacy in-browser pdf.js template importer and the
                  feature-flag rollout controls. New imports, re-imports, rasters, OCR, diagnostics, and
                  reconciliation metadata now flow through the Cloud Run Docling pipeline.
                </p>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row lg:justify-end">
            <Button
              asChild
              className="h-11 rounded-xl px-5 font-semibold shadow-lg shadow-primary/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/25 focus-visible:ring-primary/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <Link to="/admin/pdf-import-diagnostics">
                <DatabaseZap className="mr-2 h-4 w-4" aria-hidden="true" />
                Open diagnostics
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-11 rounded-xl border-primary/25 bg-background/70 px-5 font-semibold text-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/45 hover:bg-primary/10 hover:text-primary focus-visible:ring-primary/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <Link to="/admin/template-builder">
                <FileUp className="mr-2 h-4 w-4" aria-hidden="true" />
                Import a PDF
              </Link>
            </Button>
          </div>
        </div>
      </DashboardThemeFrame>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
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
            <CardTitle className="flex items-center gap-2 text-base">
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
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" /> Compliance defaults
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Signed diagnostic URLs are short lived, PII redaction remains available from import
            dialogs, and diagnostic downloads are audited.
          </CardContent>
        </Card>
      </div>
    </DashboardThemeFrame>
  );
}
