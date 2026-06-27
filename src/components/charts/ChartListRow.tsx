import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, Maximize2, FileText, Calendar, ExternalLink, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { renderChartImage, type ChartData } from './ChartCard';

interface ChartListRowProps {
  chart: ChartData;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onExpand: (chart: ChartData) => void;
  onExport: (chart: ChartData) => void;
  onDelete?: (chart: ChartData) => void;
  selectionMode: boolean;
}

export function ChartListRow({ chart, isSelected, onToggleSelect, onExpand, onExport, onDelete, selectionMode }: ChartListRowProps) {
  const navigate = useNavigate();

  return (
    <div
      className={`flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-card/80 p-3 shadow-lg shadow-black/5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/5 hover:shadow-primary/10 ${isSelected ? 'ring-2 ring-primary bg-primary/10' : ''}`}
      onClick={() => {
        if (selectionMode) {
          onToggleSelect(chart.id);
        }
      }}
    >
      {selectionMode && (
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(chart.id)}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      <div
        className="h-16 w-24 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border/60 bg-background/80 p-1 shadow-inner transition-all hover:border-primary/35"
        onClick={(e) => { e.stopPropagation(); onExpand(chart); }}
      >
        {renderChartImage(chart)}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{chart.title}</p>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
          <Badge variant="outline" className="text-[10px] h-4 px-1 capitalize">{chart.chart_type}</Badge>
          {chart.generated_reports && (
            <button
              className="flex items-center gap-1 truncate hover:text-primary transition-colors"
              onClick={(e) => { e.stopPropagation(); navigate(`/report/${chart.report_id}`); }}
            >
              <FileText className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[120px]">{chart.generated_reports.title}</span>
              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
            </button>
          )}
          <span className="flex items-center gap-1 shrink-0">
            <Calendar className="h-3 w-3" />
            {format(new Date(chart.created_at), 'dd MMM yyyy')}
          </span>
          {chart.analysis_text && (
            <Badge variant="outline" className="text-[10px] h-4 px-1 text-amber-600 border-amber-500/20 bg-amber-500/10">
              ✨ Analysis
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onExpand(chart); }}>
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onExport(chart); }}>
          <Download className="h-3.5 w-3.5" />
        </Button>
        {onDelete && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(chart); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
