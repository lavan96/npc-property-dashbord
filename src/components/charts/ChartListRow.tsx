import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, Maximize2, FileText, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { renderChartImage, type ChartData } from './ChartCard';

interface ChartListRowProps {
  chart: ChartData;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onExpand: (chart: ChartData) => void;
  onExport: (chart: ChartData) => void;
  selectionMode: boolean;
}

export function ChartListRow({ chart, isSelected, onToggleSelect, onExpand, onExport, selectionMode }: ChartListRowProps) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-muted/50 ${isSelected ? 'ring-2 ring-primary bg-primary/5' : ''}`}>
      {selectionMode && (
        <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect(chart.id)} />
      )}

      <div
        className="h-16 w-24 shrink-0 bg-background border rounded-md overflow-hidden cursor-pointer p-1"
        onClick={() => onExpand(chart)}
      >
        {renderChartImage(chart)}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{chart.title}</p>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="text-[10px] h-4 px-1 capitalize">{chart.chart_type}</Badge>
          {chart.generated_reports && (
            <span className="flex items-center gap-1 truncate">
              <FileText className="h-3 w-3 shrink-0" />
              <span className="truncate">{chart.generated_reports.title}</span>
            </span>
          )}
          <span className="flex items-center gap-1 shrink-0">
            <Calendar className="h-3 w-3" />
            {format(new Date(chart.created_at), 'dd MMM yyyy')}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onExpand(chart)}>
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onExport(chart)}>
          <Download className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
