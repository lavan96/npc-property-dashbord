import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertTriangle, Download, Maximize2, FileText, Calendar, ExternalLink, Trash2, Sparkles, ChevronDown, CheckCircle2 } from 'lucide-react';
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

export const PREMIUM_CHART_CARD_CLASS = 'group relative overflow-hidden rounded-[1.35rem] border border-border/60 bg-[linear-gradient(145deg,hsl(var(--card)/0.96)_0%,hsl(var(--muted)/0.18)_48%,hsl(var(--card)/0.92)_100%)] shadow-[0_18px_48px_rgba(15,23,42,0.10)] ring-1 ring-white/45 transition-all duration-300 ease-out hover:-translate-y-1 hover:border-amber-300/75 hover:shadow-[0_24px_64px_rgba(15,23,42,0.16),0_0_0_1px_rgba(245,158,11,0.26),0_0_34px_rgba(245,158,11,0.16)] focus-within:border-amber-300/80 focus-within:ring-2 focus-within:ring-amber-300/35 focus-within:shadow-[0_24px_64px_rgba(15,23,42,0.16),0_0_0_1px_rgba(245,158,11,0.26),0_0_30px_rgba(245,158,11,0.14)] dark:ring-white/10';

const DEFAULT_TYPE_BADGE = { color: 'border-border/70 bg-muted/70 text-muted-foreground shadow-muted/10', emoji: '📊', label: 'Chart' };

const CHART_TYPE_CONFIG: Record<string, { color: string; emoji: string; label: string }> = {
  bar: { color: 'border-blue-400/35 bg-gradient-to-r from-blue-500/12 to-violet-500/12 text-blue-700 shadow-blue-500/10 dark:text-blue-200', emoji: '📊', label: 'Bar' },
  pie: { color: 'border-emerald-400/35 bg-gradient-to-r from-emerald-500/12 to-teal-500/12 text-emerald-700 shadow-emerald-500/10 dark:text-emerald-200', emoji: '🥧', label: 'Pie' },
  line: { color: 'border-violet-400/35 bg-gradient-to-r from-violet-500/12 to-blue-500/12 text-violet-700 shadow-violet-500/10 dark:text-violet-200', emoji: '📈', label: 'Line' },
  doughnut: { color: 'border-amber-400/35 bg-gradient-to-r from-amber-500/12 to-orange-500/12 text-amber-700 shadow-amber-500/10 dark:text-amber-200', emoji: '🍩', label: 'Doughnut' },
  scatter: { color: 'border-rose-400/35 bg-gradient-to-r from-rose-500/12 to-pink-500/12 text-rose-700 shadow-rose-500/10 dark:text-rose-200', emoji: '🔵', label: 'Scatter' },
  radar: { color: 'border-cyan-400/35 bg-gradient-to-r from-cyan-500/12 to-sky-500/12 text-cyan-700 shadow-cyan-500/10 dark:text-cyan-200', emoji: '🕸️', label: 'Radar' },
  area: { color: 'border-teal-400/35 bg-gradient-to-r from-teal-500/12 to-emerald-500/12 text-teal-700 shadow-teal-500/10 dark:text-teal-200', emoji: '📉', label: 'Area' },
  distribution: { color: 'border-sky-400/35 bg-gradient-to-r from-sky-500/12 to-cyan-500/12 text-sky-700 shadow-sky-500/10 dark:text-sky-200', emoji: '📐', label: 'Distribution' },
  pricing_trend: { color: 'border-violet-400/35 bg-gradient-to-r from-violet-500/12 to-fuchsia-500/12 text-violet-700 shadow-violet-500/10 dark:text-violet-200', emoji: '💹', label: 'Pricing Trend' },
  suburb: { color: 'border-indigo-400/35 bg-gradient-to-r from-indigo-500/12 to-blue-500/12 text-indigo-700 shadow-indigo-500/10 dark:text-indigo-200', emoji: '🏘️', label: 'Suburb' },
  property_type: { color: 'border-lime-400/35 bg-gradient-to-r from-lime-500/12 to-emerald-500/12 text-lime-700 shadow-lime-500/10 dark:text-lime-200', emoji: '🏢', label: 'Property Type' },
};

function normalizeChartType(type: string) {
  return type.toLowerCase().trim().replace(/[\s-]+/g, '_');
}

export function getChartTypeConfig(type: string) {
  const normalized = normalizeChartType(type);
  const semanticKey = normalized.includes('distribution') ? 'distribution'
    : normalized.includes('pricing') || normalized.includes('trend') ? 'pricing_trend'
    : normalized.includes('suburb') ? 'suburb'
    : normalized.includes('property') && normalized.includes('type') ? 'property_type'
    : normalized.includes('doughnut') || normalized.includes('donut') ? 'doughnut'
    : normalized.includes('scatter') ? 'scatter'
    : normalized.includes('radar') ? 'radar'
    : normalized.includes('area') ? 'area'
    : normalized.includes('line') ? 'line'
    : normalized.includes('pie') ? 'pie'
    : normalized.includes('bar') ? 'bar'
    : normalized;

  return CHART_TYPE_CONFIG[semanticKey] || { ...DEFAULT_TYPE_BADGE, label: type.replace(/[_-]+/g, ' ') };
}

function ChartImageErrorState({ title = 'Chart preview unavailable', helper = 'The saved chart image could not be rendered.' }: { title?: string; helper?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-amber-300/40 bg-amber-500/8 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-500/12 text-amber-700 dark:text-amber-200">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="max-w-xs text-xs leading-5 text-muted-foreground">{helper}</p>
      </div>
    </div>
  );
}

function ChartBitmapImage({ chart }: { chart: ChartData }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return <ChartImageErrorState helper="Try refreshing the gallery. If the issue persists, regenerate or re-export the source report chart." />;
  }

  return (
    <img
      src={chart.image_data}
      alt={`${chart.title} chart`}
      className="block h-full w-full object-contain transition-transform duration-300 ease-out group-hover/img:scale-[1.025]"
      onError={() => setHasError(true)}
    />
  );
}

function renderChartImage(chart: ChartData) {
  if (!chart.image_data) {
    return (
      <ChartImageErrorState
        title="No chart image saved"
        helper="This chart record exists, but it does not include renderable image data."
      />
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
            className="h-full w-full overflow-hidden transition-transform duration-300 ease-out group-hover/img:scale-[1.025] [&>svg]:block [&>svg]:h-full [&>svg]:max-h-full [&>svg]:w-full [&>svg]:max-w-full"
          />
        );
      }
    } catch (error) {
      console.error('SVG parsing error:', error);
    }
    return <ChartImageErrorState helper="The chart SVG could not be parsed safely. Refresh or regenerate the report if this continues." />;
  }

  return <ChartBitmapImage chart={chart} />;
}

export function ChartCard({ chart, isSelected, onToggleSelect, onExpand, onExport, onDelete, selectionMode }: ChartCardProps) {
  const cfg = getChartTypeConfig(chart.chart_type);
  const navigate = useNavigate();
  const [showAnalysis, setShowAnalysis] = useState(false);

  return (
    <Card className={`${PREMIUM_CHART_CARD_CLASS} flex h-full min-h-[430px] ${selectionMode ? 'border-amber-300/45 ring-1 ring-amber-300/25 hover:ring-amber-300/45' : ''} ${selectionMode && isSelected ? 'border-amber-300/90 bg-gradient-to-b from-amber-500/12 via-card/95 to-card/85 ring-2 ring-amber-400/85 shadow-[0_24px_56px_hsl(43_74%_49%/0.24),0_0_0_1px_hsl(43_96%_56%/0.24),0_0_40px_hsl(43_96%_56%/0.18)]' : ''}`}>
      {selectionMode && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full border border-amber-200/60 bg-background/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-700 shadow-lg shadow-amber-950/10 backdrop-blur-md dark:text-amber-200">
          {isSelected ? 'Selected' : 'Selectable'}
        </div>
      )}
      {selectionMode && isSelected && (
        <div className="pointer-events-none absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-amber-100/70 bg-gradient-to-br from-amber-300 to-primary text-primary-foreground shadow-lg shadow-amber-950/20" aria-hidden="true">
          <CheckCircle2 className="h-4 w-4" />
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/0 to-transparent transition-all duration-300 group-hover:via-amber-300/80" />
      <CardHeader className="space-y-3 border-b border-border/40 bg-gradient-to-b from-muted/25 to-transparent px-4 pb-4 pt-4 sm:px-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle
              className="line-clamp-2 text-base font-semibold leading-snug tracking-[-0.01em] text-foreground transition-colors group-hover:text-primary sm:text-[17px]"
              title={chart.title}
            >
              {chart.title}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {selectionMode && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelect(chart.id)}
                className="mr-1 h-5 w-5 rounded-md border-2 border-amber-300/75 bg-background/90 shadow-[0_4px_12px_hsl(43_74%_49%/0.16)] ring-2 ring-background/80 transition-all hover:border-amber-300 hover:shadow-[0_0_0_3px_hsl(43_96%_56%/0.18)] focus-visible:ring-2 focus-visible:ring-amber-300/60 data-[state=checked]:border-amber-300 data-[state=checked]:bg-gradient-to-br data-[state=checked]:from-amber-400 data-[state=checked]:to-primary data-[state=checked]:text-primary-foreground data-[state=checked]:shadow-[0_0_0_3px_hsl(43_96%_56%/0.20)]" aria-label={`Select ${chart.title}`}
              />
            )}
            <Badge variant="outline" className={`h-6 rounded-full px-2 py-0 text-[10px] font-semibold leading-none tracking-wide shadow-sm backdrop-blur-sm ${cfg.color}`}>
              <span className="text-[11px] leading-none" aria-hidden="true">{cfg.emoji}</span>
              <span>{cfg.label}</span>
            </Badge>
          </div>
        </div>

        <div className="flex min-h-[1rem] flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px] font-medium text-muted-foreground">
          {chart.generated_reports && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="flex max-w-[180px] items-center gap-1.5 truncate rounded-full border border-border/45 bg-background/55 px-2 py-1 outline-none transition-colors hover:border-amber-300/60 hover:bg-amber-500/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-amber-300/55"
                    onClick={() => navigate(`/report/${chart.report_id}`)}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                    <span className="truncate">{chart.generated_reports.title}</span>
                    <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" />
                  </button>
                </TooltipTrigger>
                <TooltipContent><p>View report: {chart.generated_reports.title}</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-border/45 bg-background/55 px-2 py-1 tabular-nums">
            <Calendar className="h-3.5 w-3.5 text-primary/70" />
            {format(new Date(chart.created_at), 'dd MMM yyyy')}
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col space-y-4 px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
        <div
          className={`group/img relative cursor-pointer overflow-hidden rounded-2xl border bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.10),transparent_34%),linear-gradient(145deg,hsl(var(--background))_0%,hsl(var(--muted)/0.38)_100%)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_14px_32px_rgba(15,23,42,0.08)] transition-all duration-300 hover:border-amber-300/60 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_18px_42px_rgba(15,23,42,0.14),0_0_0_1px_rgba(245,158,11,0.12)] dark:bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.16),transparent_36%),linear-gradient(145deg,hsl(var(--card))_0%,hsl(var(--muted)/0.16)_100%)] ${selectionMode ? 'border-amber-300/45 ring-1 ring-amber-300/25' : 'border-border/60'} ${selectionMode && isSelected ? 'border-amber-300/90 ring-2 ring-amber-400/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_18px_42px_rgba(15,23,42,0.14),0_0_34px_rgba(245,158,11,0.22)]' : ''}`}
          onClick={() => onExpand(chart)}
        >
          <div className="relative flex h-56 w-full items-center justify-center overflow-hidden rounded-xl border border-white/70 bg-white/95 p-4 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.05),inset_0_12px_28px_rgba(15,23,42,0.035)] transition-transform duration-300 group-hover/img:scale-[1.012] sm:h-60 dark:border-white/10 dark:bg-slate-950/70 dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),inset_0_12px_28px_rgba(0,0,0,0.20)]">
            {renderChartImage(chart)}
          </div>
          <div className="pointer-events-none absolute inset-2 rounded-xl ring-1 ring-inset ring-slate-950/5 transition-all duration-300 group-hover/img:ring-amber-400/25 dark:ring-white/10" />
          {selectionMode && (
            <div className="pointer-events-none absolute inset-2 rounded-xl bg-gradient-to-br from-amber-500/10 via-transparent to-primary/10 opacity-100" />
          )}
          {selectionMode && isSelected && (
            <div className="pointer-events-none absolute inset-2 rounded-xl bg-amber-950/10 ring-2 ring-inset ring-amber-300/70" />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover/img:bg-amber-950/5 group-hover/img:opacity-100">
            <div className="rounded-full border border-primary/25 bg-background/90 p-2 shadow-lg shadow-primary/10 backdrop-blur-sm">
              <Maximize2 className="h-4 w-4 text-foreground" />
            </div>
          </div>
        </div>

        {/* Analysis insight */}
        {chart.analysis_text && (
          <Collapsible open={showAnalysis} onOpenChange={setShowAnalysis}>
            <CollapsibleTrigger asChild>
              <button
                className="group/analysis flex w-full items-center gap-2 rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-background/70 to-primary/5 px-3 py-2 text-left text-xs font-semibold text-foreground shadow-sm shadow-amber-950/5 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-400/45 hover:from-amber-500/15 hover:to-primary/10 hover:shadow-md hover:shadow-amber-950/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/35 focus-visible:ring-offset-2"
                aria-label={showAnalysis ? `Hide analysis for ${chart.title}` : `View analysis for ${chart.title}`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-400/30 bg-amber-500/15 text-amber-600 shadow-inner transition-colors group-hover/analysis:bg-amber-500/25 dark:text-amber-300">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate leading-tight">{showAnalysis ? 'Hide Analysis' : 'View Analysis'}</span>
                  <span className="block truncate text-[10px] font-medium leading-snug text-muted-foreground">
                    {showAnalysis ? 'Collapse AI insight' : 'Expand AI insight'}
                  </span>
                </span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/50 bg-background/75 text-muted-foreground shadow-sm transition-all duration-200 group-hover/analysis:border-amber-400/40 group-hover/analysis:text-amber-600 dark:group-hover/analysis:text-amber-300">
                  <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showAnalysis ? 'rotate-180' : ''}`} />
                </span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 overflow-hidden rounded-2xl border border-amber-500/25 bg-[radial-gradient(circle_at_top_left,hsl(43_96%_56%/0.16),transparent_42%),linear-gradient(145deg,hsl(var(--background)/0.98),hsl(var(--muted)/0.36))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_12px_28px_rgba(15,23,42,0.08)] dark:bg-[radial-gradient(circle_at_top_left,hsl(43_96%_56%/0.16),transparent_42%),linear-gradient(145deg,hsl(var(--card)),hsl(var(--muted)/0.16))]">
                <div className="max-h-72 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">
                  <p className="whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground [overflow-wrap:anywhere]">
                    {chart.analysis_text}
                  </p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        <div className="mt-auto flex items-center justify-between gap-1 pt-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
          <div>
            {onDelete && (
              <Button variant="ghost" size="sm" className="h-7 gap-1 rounded-full text-xs text-destructive transition-all hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-destructive/35" onClick={() => onDelete(chart)}>
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
            )}
          </div>
          <Button variant="ghost" size="sm" className="h-7 gap-1 rounded-full text-xs transition-all hover:border-amber-300/50 hover:bg-amber-500/10 hover:text-primary hover:shadow-[0_8px_20px_hsl(43_74%_49%/0.12)] focus-visible:ring-2 focus-visible:ring-amber-300/45" onClick={() => onExport(chart)}>
            <Download className="h-3 w-3" /> Export
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export { renderChartImage, CHART_TYPE_CONFIG };
