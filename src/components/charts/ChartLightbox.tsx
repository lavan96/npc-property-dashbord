import { useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, ChevronLeft, ChevronRight, FileText, ExternalLink, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { renderChartImage, type ChartData } from './ChartCard';

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
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden border-primary/20 bg-card/95 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
            {chart.title}
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-xs capitalize text-primary">{chart.chart_type}</Badge>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-3 text-xs flex-wrap">
            {chart.generated_reports && (
              <button
                className="flex items-center gap-1 rounded-md transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                onClick={() => { onClose(); navigate(`/report/${chart.report_id}`); }}
              >
                <FileText className="h-3 w-3" />
                {chart.generated_reports.title}
                <ExternalLink className="h-2.5 w-2.5" />
              </button>
            )}
            <span>{format(new Date(chart.created_at), 'PPp')}</span>
            <span className="text-muted-foreground/50">← → to navigate</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 relative">
          <div className="flex h-[52vh] items-center justify-center rounded-2xl border border-border/60 bg-background/80 p-5 shadow-inner ring-1 ring-white/5">
            {renderChartImage(chart)}
          </div>

          {hasPrev && (
            <Button
              variant="outline"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border-primary/25 bg-background/85 shadow-lg shadow-primary/10 backdrop-blur-sm hover:bg-primary/10 hover:text-primary"
              onClick={onPrev}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          {hasNext && (
            <Button
              variant="outline"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border-primary/25 bg-background/85 shadow-lg shadow-primary/10 backdrop-blur-sm hover:bg-primary/10 hover:text-primary"
              onClick={onNext}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Analysis panel in lightbox (Enhancement #1) */}
        {chart.analysis_text && (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3 shadow-inner">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs font-medium">Analysis</span>
            </div>
            <ScrollArea className="max-h-24">
              <p className="text-xs text-muted-foreground leading-relaxed">{chart.analysis_text}</p>
            </ScrollArea>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button variant="outline" size="sm" className="gap-2 border-primary/25 bg-background/70 hover:border-primary/50 hover:bg-primary/10 hover:text-primary" onClick={() => onExport(chart)}>
            <Download className="h-4 w-4" /> Export as PNG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
