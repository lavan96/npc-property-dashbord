import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, Maximize2, FileText, Calendar, ExternalLink, Trash2, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { CHART_TYPE_CONFIG, renderChartImage, type ChartData } from './ChartCard';

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
  const cfg = CHART_TYPE_CONFIG[chart.chart_type] || { color: 'border-border/70 bg-muted/70 text-muted-foreground shadow-muted/10', emoji: '📊', label: chart.chart_type };

  return (
    <div
      className={`relative flex cursor-pointer items-center gap-3 rounded-xl border bg-card/80 p-3 shadow-lg shadow-black/5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/5 hover:shadow-primary/10 ${selectionMode && isSelected ? 'border-amber-300/80 bg-amber-500/10 ring-2 ring-amber-400/70 shadow-[0_16px_34px_hsl(43_74%_49%/0.16)]' : 'border-border/60'}`}
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
          className="border-amber-300/60 data-[state=checked]:border-amber-400 data-[state=checked]:bg-amber-500 data-[state=checked]:text-primary-foreground"
          aria-label={`Select ${chart.title}`}
        />
      )}
      {selectionMode && isSelected && (
        <div className="pointer-events-none absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-amber-100/70 bg-gradient-to-br from-amber-300 to-primary text-primary-foreground shadow-lg shadow-amber-950/20" aria-hidden="true">
          <CheckCircle2 className="h-3.5 w-3.5" />
        </div>
      )}

      <div
        className="group/thumb relative h-16 w-24 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-border/60 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.10),transparent_38%),linear-gradient(145deg,hsl(var(--background))_0%,hsl(var(--muted)/0.34)_100%)] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.70),0_8px_18px_rgba(15,23,42,0.08)] transition-all duration-200 hover:border-primary/35 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_10px_24px_rgba(15,23,42,0.12)] dark:bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.16),transparent_38%),linear-gradient(145deg,hsl(var(--card))_0%,hsl(var(--muted)/0.16)_100%)]"
        onClick={(e) => { e.stopPropagation(); onExpand(chart); }}
      >
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg border border-white/70 bg-white/95 p-1 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.05)] transition-transform duration-200 group-hover/thumb:scale-[1.02] dark:border-white/10 dark:bg-slate-950/70">
          {renderChartImage(chart)}
          <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-slate-950/5 group-hover/thumb:ring-primary/20 dark:ring-white/10" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-semibold leading-snug tracking-[-0.01em] text-foreground" title={chart.title}>{chart.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-muted-foreground">
          <Badge variant="outline" className={`h-5 rounded-full px-2 text-[10px] font-semibold leading-none shadow-sm ${cfg.color}`}>
            <span className="text-[11px] leading-none" aria-hidden="true">{cfg.emoji}</span>
            <span className="capitalize">{chart.chart_type}</span>
          </Badge>
          {chart.generated_reports && (
            <button
              className="flex items-center gap-1.5 truncate rounded-full border border-border/45 bg-background/55 px-2 py-0.5 transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              onClick={(e) => { e.stopPropagation(); navigate(`/report/${chart.report_id}`); }}
            >
              <FileText className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[120px]">{chart.generated_reports.title}</span>
              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
            </button>
          )}
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/45 bg-background/55 px-2 py-0.5 tabular-nums">
            <Calendar className="h-3 w-3 text-primary/70" />
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
