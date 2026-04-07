import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { format } from 'date-fns';
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
  if (!chart) return null;

  return (
    <Dialog open={!!chart} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {chart.title}
            <Badge variant="outline" className="text-xs capitalize">{chart.chart_type}</Badge>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-3 text-xs">
            {chart.generated_reports && (
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {chart.generated_reports.title}
              </span>
            )}
            <span>{format(new Date(chart.created_at), 'PPp')}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 relative">
          <div className="bg-background border rounded-lg p-4 h-[60vh] flex items-center justify-center">
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

        <div className="flex justify-end pt-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => onExport(chart)}>
            <Download className="h-4 w-4" /> Export as PNG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
