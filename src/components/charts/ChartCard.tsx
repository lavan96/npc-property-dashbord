import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Download, Maximize2, FileText, Calendar, ExternalLink, Trash2, Sparkles, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export interface ChartData {
  id: string;
  chart_type: string;
  title: string;
  image_data: string;
  created_at: string;
  report_id: string;
  chart_config?: any;
  analysis_text?: string | null;
  generated_reports: {
    id: string;
    title: string;
    created_at: string;
  } | null;
}

interface ChartCardProps {
  chart: ChartData;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onExpand: (chart: ChartData) => void;
  onExport: (chart: ChartData) => void;
  onDelete?: (chart: ChartData) => void;
  selectionMode: boolean;
}

const CHART_TYPE_CONFIG: Record<string, { color: string; emoji: string; label: string }> = {
  bar: { color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', emoji: '📊', label: 'Bar' },
  pie: { color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', emoji: '🥧', label: 'Pie' },
  line: { color: 'bg-violet-500/10 text-violet-600 border-violet-500/20', emoji: '📈', label: 'Line' },
  doughnut: { color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', emoji: '🍩', label: 'Doughnut' },
  scatter: { color: 'bg-rose-500/10 text-rose-600 border-rose-500/20', emoji: '🔵', label: 'Scatter' },
  radar: { color: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20', emoji: '🕸️', label: 'Radar' },
  area: { color: 'bg-teal-500/10 text-teal-600 border-teal-500/20', emoji: '📉', label: 'Area' },
};

function renderChartImage(chart: ChartData) {
  if (!chart.image_data) {
    return (
      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
        No chart data available
      </div>
    );
  }

  if (chart.image_data.startsWith('data:image/svg+xml;base64,')) {
    try {
      let svgContent = atob(chart.image_data.replace('data:image/svg+xml;base64,', ''));
      if (svgContent.includes('<svg') && svgContent.includes('</svg>')) {
        svgContent = svgContent.replace(/<svg[^>]*>/, (match) => {
          const widthMatch = match.match(/width=["'](\d+)["']/);
          const heightMatch = match.match(/height=["'](\d+)["']/);
          const viewBoxMatch = match.match(/viewBox=["']([^"']*)["']/);
          let viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 800 600';
          if (!viewBoxMatch && widthMatch && heightMatch) {
            viewBox = `0 0 ${widthMatch[1]} ${heightMatch[1]}`;
          }
          return `<svg viewBox="${viewBox}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="max-width:100%;max-height:100%;">`;
        });
        return (
          <div
            dangerouslySetInnerHTML={{ __html: svgContent }}
            className="w-full h-full flex items-center justify-center"
          />
        );
      }
    } catch (error) {
      console.error('SVG parsing error:', error);
    }
    return <div className="w-full h-full flex items-center justify-center text-destructive text-sm">Chart rendering error</div>;
  }

  return (
    <img
      src={chart.image_data}
      alt={`${chart.title} chart`}
      className="w-full h-full object-contain"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}

export function ChartCard({ chart, isSelected, onToggleSelect, onExpand, onExport, onDelete, selectionMode }: ChartCardProps) {
  const cfg = CHART_TYPE_CONFIG[chart.chart_type] || { color: 'bg-muted text-muted-foreground border-border', emoji: '📊', label: chart.chart_type };
  const navigate = useNavigate();
  const [showAnalysis, setShowAnalysis] = useState(false);

  return (
    <Card className={`group overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-primary/30 ${isSelected ? 'ring-2 ring-primary border-primary/50' : ''}`}>
      <CardHeader className="pb-2 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-semibold leading-tight line-clamp-2">
              {chart.title}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {selectionMode && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelect(chart.id)}
                className="mr-1"
              />
            )}
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${cfg.color}`}>
              {cfg.emoji} {cfg.label}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {chart.generated_reports && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="flex items-center gap-1 truncate max-w-[160px] hover:text-primary transition-colors"
                    onClick={() => navigate(`/report/${chart.report_id}`)}
                  >
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="truncate">{chart.generated_reports.title}</span>
                    <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-0 group-hover:opacity-100" />
                  </button>
                </TooltipTrigger>
                <TooltipContent><p>View report: {chart.generated_reports.title}</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <span className="flex items-center gap-1 shrink-0">
            <Calendar className="h-3 w-3" />
            {format(new Date(chart.created_at), 'dd MMM yyyy')}
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-0 pb-3 px-3 space-y-2">
        <div
          className="relative bg-background border rounded-lg overflow-hidden cursor-pointer group/img"
          onClick={() => onExpand(chart)}
        >
          <div className="w-full h-52 p-2">
            {renderChartImage(chart)}
          </div>
          <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/5 transition-colors flex items-center justify-center opacity-0 group-hover/img:opacity-100">
            <div className="bg-background/90 backdrop-blur-sm rounded-full p-2 shadow-md">
              <Maximize2 className="h-4 w-4 text-foreground" />
            </div>
          </div>
        </div>

        {/* Analysis insight */}
        {chart.analysis_text && (
          <Collapsible open={showAnalysis} onOpenChange={setShowAnalysis}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full text-left">
                <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
                <span className="truncate">{showAnalysis ? 'Hide Analysis' : 'View Analysis'}</span>
                <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${showAnalysis ? 'rotate-180' : ''}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1.5 p-2 bg-amber-500/5 border border-amber-500/15 rounded-md">
                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-4">{chart.analysis_text}</p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        <div className="flex items-center justify-between gap-1 opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <div>
            {onDelete && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" onClick={() => onDelete(chart)}>
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
            )}
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => onExport(chart)}>
            <Download className="h-3 w-3" /> Export
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export { renderChartImage, CHART_TYPE_CONFIG };
