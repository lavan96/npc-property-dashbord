import { useEffect, useCallback } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, ChevronLeft, ChevronRight, FileText, ExternalLink, Sparkles, X } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { getChartTypeConfig, renderChartImage, type ChartData } from './ChartCard';

interface ChartLightboxProps {
  chart: ChartData | null;
  onClose: () => void;
  onExport: (chart: ChartData) => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export function ChartLightbox({ chart, onClose, onExport, onPrev, onNext, hasPrev, hasNext }: ChartLightboxProps) {
  const navigate = useNavigate();
  const cfg = chart ? getChartTypeConfig(chart.chart_type) : null;

  // Keyboard navigation (Enhancement #3)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!chart) return;
    if (e.key === 'ArrowLeft' && hasPrev && onPrev) {
      e.preventDefault();
      onPrev();
    } else if (e.key === 'ArrowRight' && hasNext && onNext) {
      e.preventDefault();
      onNext();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [chart, hasPrev, hasNext, onPrev, onNext, onClose]);

  useEffect(() => {
    if (chart) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [chart, handleKeyDown]);

  if (!chart) return null;

  return (
    <Dialog open={!!chart} onOpenChange={() => onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/88 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-0.75rem)] max-w-7xl sm:max-h-[94dvh] sm:w-[min(96vw,84rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[1.75rem] border border-amber-300/25 bg-card/98 p-0 shadow-[0_32px_90px_rgba(0,0,0,0.62)] ring-1 ring-white/10 backdrop-blur-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" />
          <div className="pointer-events-none absolute -right-24 -top-28 h-56 w-56 rounded-full bg-amber-400/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-28 bottom-10 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <DialogPrimitive.Close className="absolute right-3 top-3 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-slate-950/70 text-white/80 shadow-[0_14px_36px_rgba(0,0,0,0.32)] ring-1 ring-white/10 backdrop-blur-xl transition-all hover:scale-105 hover:border-amber-300/55 hover:bg-amber-400/15 hover:text-white hover:shadow-[0_18px_42px_rgba(245,158,11,0.18)] focus:outline-none focus:ring-2 focus:ring-amber-300/80 focus:ring-offset-2 focus:ring-offset-slate-950 sm:right-4 sm:top-4">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>

          <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-3 sm:p-6 lg:p-7">
            <DialogHeader className="border-b border-border/60 pb-4 pr-12 text-left sm:pb-5" aria-live="polite">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <DialogTitle className="max-w-4xl break-words text-xl font-bold leading-tight tracking-[-0.035em] text-foreground sm:text-3xl">
                    {chart.title}
                  </DialogTitle>
                  <DialogDescription className="flex flex-wrap items-center gap-2 text-xs sm:gap-3">
                    {chart.generated_reports && (
                      <button
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-3 py-1.5 font-medium text-foreground/85 shadow-sm transition-all hover:border-amber-300/60 hover:bg-amber-500/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/55"
                        onClick={() => { onClose(); navigate(`/report/${chart.report_id}`); }}
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{chart.generated_reports.title}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </button>
                    )}
                    <span className="rounded-full border border-border/50 bg-muted/50 px-3 py-1.5 font-medium text-muted-foreground">{format(new Date(chart.created_at), 'PPp')}</span>
                    <span className="rounded-full border border-dashed border-amber-300/35 bg-amber-500/10 px-3 py-1.5 font-medium text-amber-700 dark:text-amber-300">Use ← → to navigate</span>
                  </DialogDescription>
                </div>
                <Badge variant="outline" className={`w-fit shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] shadow-sm ${cfg?.color ?? ''}`}>
                  <span className="mr-1 text-xs" aria-hidden="true">{cfg?.emoji}</span>
                  {cfg?.label ?? chart.chart_type}
                </Badge>
              </div>
            </DialogHeader>

            <div className="relative mt-4 min-h-[240px] flex-1 px-0 sm:mt-5 sm:px-14">
              <div className="relative flex h-[42dvh] min-h-[240px] max-h-[680px] sm:h-[56vh] sm:min-h-[320px] items-center justify-center overflow-hidden rounded-[1.75rem] border border-amber-200/25 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.14),transparent_42%),linear-gradient(145deg,hsl(222_47%_11%/0.96),hsl(220_40%_6%/0.94))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-24px_60px_rgba(0,0,0,0.28),0_22px_64px_rgba(0,0,0,0.30)] ring-1 ring-white/10 sm:p-5 lg:p-7">
                <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/65 to-transparent" />
                <div className="pointer-events-none absolute -left-24 top-10 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
                <div className="pointer-events-none absolute -right-20 bottom-8 h-48 w-48 rounded-full bg-amber-400/12 blur-3xl" />
                <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[1.25rem] border border-slate-200/85 bg-white p-2 shadow-[0_20px_58px_rgba(0,0,0,0.34),inset_0_0_0_1px_rgba(15,23,42,0.06)] sm:p-6 lg:p-8 dark:border-white/15">
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.62),transparent_28%,transparent_72%,rgba(15,23,42,0.035))]" />
                  <div className="relative flex h-full w-full items-center justify-center [&>div]:max-h-full [&>div]:max-w-full [&_img]:max-h-full [&_img]:max-w-full [&_svg]:max-h-full [&_svg]:max-w-full">
                    {renderChartImage(chart)}
                  </div>
                </div>
                <div className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-slate-950/62 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70 shadow-lg backdrop-blur-xl sm:flex">
                  <span>← Previous</span>
                  <span className="h-1 w-1 rounded-full bg-amber-300/70" />
                  <span>Next →</span>
                </div>
              </div>

              {hasPrev && (
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute bottom-3 left-3 top-auto inline-flex h-11 w-11 sm:top-1/2 sm:h-12 sm:w-12 translate-y-0 items-center sm:-translate-y-1/2 justify-center rounded-full border-amber-200/45 bg-slate-950/78 text-amber-100 shadow-[0_16px_42px_rgba(0,0,0,0.36)] ring-1 ring-white/10 backdrop-blur-xl transition-all hover:-translate-x-0.5 hover:scale-105 hover:border-amber-200/85 hover:bg-amber-400/22 hover:text-white hover:shadow-[0_18px_46px_rgba(245,158,11,0.22)] active:scale-100 focus-visible:ring-2 focus-visible:ring-amber-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:left-2 lg:left-4"
                  onClick={onPrev}
                  aria-label="View previous chart"
                >
                  <ChevronLeft className="h-6 w-6 shrink-0 drop-shadow" />
                </Button>
              )}
              {hasNext && (
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute bottom-3 right-3 top-auto inline-flex h-11 w-11 sm:top-1/2 sm:h-12 sm:w-12 translate-y-0 items-center sm:-translate-y-1/2 justify-center rounded-full border-amber-200/45 bg-slate-950/78 text-amber-100 shadow-[0_16px_42px_rgba(0,0,0,0.36)] ring-1 ring-white/10 backdrop-blur-xl transition-all hover:translate-x-0.5 hover:scale-105 hover:border-amber-200/85 hover:bg-amber-400/22 hover:text-white hover:shadow-[0_18px_46px_rgba(245,158,11,0.22)] active:scale-100 focus-visible:ring-2 focus-visible:ring-amber-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:right-2 lg:right-4"
                  onClick={onNext}
                  aria-label="View next chart"
                >
                  <ChevronRight className="h-6 w-6 shrink-0 drop-shadow" />
                </Button>
              )}
            </div>

            {/* Analysis panel in lightbox (Enhancement #1) */}
            {chart.analysis_text && (
              <div className="mt-4 rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/12 to-primary/5 p-4 shadow-inner">
                <div className="mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/80">Analysis</span>
                </div>
                <ScrollArea className="max-h-40 pr-3 sm:max-h-32">
                  <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{chart.analysis_text}</p>
                </ScrollArea>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                Use <kbd className="rounded border border-border/70 bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] text-foreground">Esc</kbd> to close and <kbd className="rounded border border-border/70 bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] text-foreground">←</kbd> <kbd className="rounded border border-border/70 bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] text-foreground">→</kbd> to navigate.
              </p>
              <Button variant="outline" size="sm" className="group inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-full border-amber-300/45 bg-gradient-to-r from-background/95 via-amber-50/80 to-background/95 px-4 font-semibold text-foreground shadow-[0_10px_28px_rgba(217,119,6,0.13)] ring-1 ring-amber-200/25 transition-all hover:-translate-y-0.5 hover:border-amber-400/70 hover:bg-amber-50 hover:text-amber-700 hover:shadow-[0_16px_34px_rgba(217,119,6,0.20)] focus-visible:ring-2 focus-visible:ring-amber-300/80 focus-visible:ring-offset-2 dark:from-slate-950/85 dark:via-amber-400/10 dark:to-slate-950/85 dark:hover:bg-amber-400/15 dark:hover:text-amber-200 sm:w-auto" onClick={() => onExport(chart)} aria-label={`Export ${chart.title} as PNG`}>
                <Download className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-y-0.5" />
                <span>Export as PNG</span>
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
