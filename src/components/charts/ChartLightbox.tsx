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
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {chart.title}
            <Badge variant="outline" className="text-xs capitalize">{chart.chart_type}</Badge>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-3 text-xs flex-wrap">
            {chart.generated_reports && (
              <button
                className="flex items-center gap-1 hover:text-primary transition-colors"
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
          <div className="bg-background border rounded-lg p-4 h-[50vh] flex items-center justify-center">
            {renderChartImage(chart)}
          </div>

          {hasPrev && (
            <Button
              variant="outline"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 backdrop-blur-sm shadow-md"
              onClick={onPrev}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          {hasNext && (
            <Button
              variant="outline"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 backdrop-blur-sm shadow-md"
              onClick={onNext}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Analysis panel in lightbox (Enhancement #1) */}
        {chart.analysis_text && (
          <div className="border border-amber-500/20 bg-amber-500/5 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs font-medium">AI Analysis</span>
            </div>
            <ScrollArea className="max-h-24">
              <p className="text-xs text-muted-foreground leading-relaxed">{chart.analysis_text}</p>
            </ScrollArea>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => onExport(chart)}>
            <Download className="h-4 w-4" /> Export as PNG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
