/**
 * Sub-components for the report generation progress widget.
 * Kept in one file to limit fragmentation while still separating concerns.
 */
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Layers, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertCircle,
  CalendarIcon,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  History as HistoryIcon,
  Loader2,
  MoreVertical,
  Octagon,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import type { GenerationHistoryEntry } from '@/hooks/useGenerationHistory';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

/* ---------- Types shared with parent ---------- */

export interface ReportProgress {
  id: string;
  property_address: string;
  status: string;
  sectionsCompleted: number;
  totalSections: number;
  contentLength: number;
  error_message?: string | null;
  lastUpdated: Date;
  lastCompletedSection: number;
  createdAt: Date;
  bulkJobId?: string | null;
  generationEngine?: 'legacy' | 'compass-40' | null;
}

export interface AutoContinueSettings {
  enabled: boolean;
  maxRetries: number;
  delaySeconds: number;
}

export interface AggregateCounts {
  queued: number;
  processing: number;
  stalled: number;
  failed: number;
  total: number;
  completedSections: number;
  totalSections: number;
}

/* ---------- Header (chips + overflow menu) ---------- */

interface HeaderProps {
  counts: AggregateCounts;
  paused: boolean;
  autoContinueSettings: AutoContinueSettings;
  onTogglePaused: () => void;
  onResumeAllStalled: () => void;
  onClearCompleted: () => void;
  onToggleHistory: () => void;
  historyOpen: boolean;
  onToggleAutoContinue: (enabled: boolean) => void;
  onChangeDelay: (seconds: number) => void;
  onMinimize: () => void;
  onDragStart?: (e: React.PointerEvent) => void;
  draggable?: boolean;
}

export function GenerationProgressHeader({
  counts,
  paused,
  autoContinueSettings,
  onTogglePaused,
  onResumeAllStalled,
  onClearCompleted,
  onToggleHistory,
  historyOpen,
  onToggleAutoContinue,
  onChangeDelay,
  onMinimize,
  onDragStart,
  draggable,
}: HeaderProps) {
  const aggregatePct =
    counts.totalSections > 0
      ? Math.round((counts.completedSections / counts.totalSections) * 100)
      : 0;

  return (
    <div
      className={cn(
        'border-b border-border bg-muted/50',
        draggable && 'cursor-grab active:cursor-grabbing select-none'
      )}
      onPointerDown={draggable ? onDragStart : undefined}
    >
      <div className="flex items-center justify-between px-3 py-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-foreground whitespace-nowrap">
            {historyOpen ? 'History' : 'Generating'}
          </span>
          {!historyOpen && (
            <div className="flex items-center gap-1 flex-wrap">
              <StatusChip
                icon={<Clock className="h-3 w-3" />}
                value={counts.queued}
                label="Queued"
                tone="muted"
              />
              <StatusChip
                icon={<Loader2 className="h-3 w-3 animate-spin" />}
                value={counts.processing}
                label="Processing"
                tone="primary"
              />
              <StatusChip
                icon={<Zap className="h-3 w-3" />}
                value={counts.stalled}
                label="Stalled"
                tone="warning"
              />
              <StatusChip
                icon={<AlertCircle className="h-3 w-3" />}
                value={counts.failed}
                label="Failed"
                tone="destructive"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={onToggleHistory}
                aria-label="Toggle history"
                aria-pressed={historyOpen}
              >
                <HistoryIcon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>History (last 10)</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                aria-label="Generation options"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Bulk actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={onTogglePaused}>
                {paused ? (
                  <>
                    <PlayCircle className="h-4 w-4 mr-2" /> Resume polling
                  </>
                ) : (
                  <>
                    <PauseCircle className="h-4 w-4 mr-2" /> Pause polling
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onResumeAllStalled} disabled={counts.stalled === 0}>
                <RefreshCw className="h-4 w-4 mr-2" /> Retry all stalled
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onClearCompleted}>
                <Trash2 className="h-4 w-4 mr-2" /> Clear dismissed
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Auto-continue</DropdownMenuLabel>
              <div className="px-2 py-1.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs">Enabled</span>
                  <Switch
                    checked={autoContinueSettings.enabled}
                    onCheckedChange={onToggleAutoContinue}
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Retry delay</span>
                    <span className="text-muted-foreground">
                      {autoContinueSettings.delaySeconds}s
                    </span>
                  </div>
                  <Slider
                    min={5}
                    max={60}
                    step={5}
                    value={[autoContinueSettings.delaySeconds]}
                    onValueChange={(v) => onChangeDelay(v[0] ?? 15)}
                    disabled={!autoContinueSettings.enabled}
                  />
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={onMinimize}
                aria-label="Minimize"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Minimize (⌘⇧R)</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {!historyOpen && counts.total > 0 && (
        <div className="px-3 pb-2 space-y-1">
          <Progress value={aggregatePct} className="h-1" />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>
              {counts.completedSections}/{counts.totalSections} sections across {counts.total}{' '}
              report{counts.total === 1 ? '' : 's'}
            </span>
            <span>{aggregatePct}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusChip({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  tone: 'muted' | 'primary' | 'warning' | 'destructive';
}) {
  if (value === 0) return null;
  const toneClass = {
    muted: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
    warning: 'bg-warning/10 text-warning',
    destructive: 'bg-destructive/10 text-destructive',
  }[tone];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
            toneClass
          )}
        >
          {icon}
          {value}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/* ---------- Rich minimised pill ---------- */

interface PillProps {
  counts: AggregateCounts;
  etaMs: number | null;
  onClick: () => void;
}

export function GenerationProgressPill({ counts, etaMs, onClick }: PillProps) {
  const pct =
    counts.totalSections > 0
      ? Math.round((counts.completedSections / counts.totalSections) * 100)
      : 0;
  const eta = formatEta(etaMs);
  return (
    <Button
      variant="default"
      onClick={onClick}
      aria-label={`${counts.total} reports generating, ${pct}% complete${eta ? `, ${eta} remaining` : ''}`}
      className="h-11 rounded-full bg-primary text-primary-foreground shadow-2xl shadow-primary/35 ring-1 ring-primary-foreground/20 pl-2 pr-3 gap-2 transition-all duration-200 hover:scale-[1.03] hover:bg-primary/90 hover:shadow-primary/50 focus-visible:ring-2 focus-visible:ring-primary-foreground/70 active:scale-[0.98]"
    >
      <span className="relative flex h-7 w-7 items-center justify-center">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 28 28">
          <circle
            cx="14"
            cy="14"
            r="12"
            strokeWidth="3"
            className="fill-none stroke-primary-foreground/25"
          />
          <circle
            cx="14"
            cy="14"
            r="12"
            strokeWidth="3"
            className="fill-none stroke-primary-foreground"
            strokeDasharray={`${(pct / 100) * 75.4} 75.4`}
            strokeLinecap="round"
          />
        </svg>
        <span className="text-[10px] font-bold tabular-nums">{pct}</span>
      </span>
      <span className="flex flex-col items-start leading-tight">
        <span className="text-xs font-semibold">
          {counts.total} report{counts.total === 1 ? '' : 's'}
        </span>
        <span className="text-[10px] opacity-80">{eta ?? 'Estimating…'}</span>
      </span>
      {counts.failed > 0 && (
        <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
          {counts.failed}
        </span>
      )}
    </Button>
  );
}

/* ---------- Per-report item ---------- */

interface ItemProps {
  report: ReportProgress;
  etaMs: number | null;
  retryState?: { attempts: number; lastAttempt: number };
  autoContinueSettings: AutoContinueSettings;
  sectionTimeline: number[]; // epoch ms of each section completion
  onContinue: () => void;
  onDismiss: () => void;
  onKill?: () => void;
  isMobile?: boolean;
}

export function GenerationProgressItem({
  report,
  etaMs,
  retryState,
  autoContinueSettings,
  sectionTimeline,
  onContinue,
  onDismiss,
  onKill,
  isMobile = false,
}: ItemProps) {
  const navigate = useNavigate();
  const [killOpen, setKillOpen] = useState(false);
  const percentage = Math.round((report.sectionsCompleted / report.totalSections) * 100);

  const timeSinceUpdate = Date.now() - report.lastUpdated.getTime();
  const timeSinceCreation = Date.now() - report.createdAt.getTime();
  const minutesSinceUpdate = Math.floor(timeSinceUpdate / 60000);
  const secondsSinceUpdate = Math.floor(timeSinceUpdate / 1000);

  const isTimedOut = timeSinceUpdate > 120000;
  const hasPartialContent = report.contentLength > 1000;
  const isIncomplete = report.sectionsCompleted < report.totalSections;
  const isStuck =
    report.status === 'processing' && isTimedOut && hasPartialContent && isIncomplete;

  const showContinueButton =
    isStuck || (report.status === 'pending' && report.sectionsCompleted > 0);
  const currentSection = Math.min(report.sectionsCompleted + 1, report.totalSections);

  const retriesUsed = retryState?.attempts || 0;
  const maxRetriesReached = retriesUsed >= autoContinueSettings.maxRetries;
  const hasScheduledRetry = isStuck && autoContinueSettings.enabled && !maxRetriesReached;

  const openReport = () => navigate(`/investment-report/${report.id}`);

  const copyError = () => {
    const text = report.error_message || 'No error message';
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success('Error copied to clipboard'))
      .catch(() => toast.error('Could not copy error'));
  };

  return (
    <div className={cn('p-3 border-b border-border last:border-b-0', isMobile && 'px-4 py-3')}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={openReport}
            className={cn(
              'group flex items-center gap-1 text-left font-medium text-foreground truncate w-full hover:text-primary transition-colors',
              isMobile ? 'text-sm' : 'text-xs'
            )}
            title={`Open report for ${report.property_address}`}
          >
            <span className="truncate">{report.property_address}</span>
            <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 shrink-0" />
          </button>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {report.status === 'pending' && !isStuck && (
              <>
                <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />
                <span className="text-xs text-muted-foreground">Queued</span>
              </>
            )}
            {report.status === 'processing' && !isStuck && (
              <>
                <Loader2 className="h-3 w-3 text-primary animate-spin" />
                <span className="text-xs text-primary">
                  Section {currentSection}/{report.totalSections}
                </span>
                <span className="text-xs text-muted-foreground">
                  • {formatElapsed(timeSinceCreation)}
                </span>
                {etaMs !== null && (
                  <span className="text-xs text-muted-foreground">
                    • ~{formatEta(etaMs)} left
                  </span>
                )}
              </>
            )}
            {report.status === 'failed' && !isStuck && (
              <>
                <Octagon className="h-3 w-3 text-destructive" />
                <span className="text-xs text-destructive font-medium">
                  {report.error_message?.toLowerCase().startsWith('cancelled')
                    ? report.error_message
                    : 'Failed'}
                </span>
              </>
            )}
            {isStuck && (
              <>
                {hasScheduledRetry ? (
                  <>
                    <Zap className="h-3 w-3 text-warning" />
                    <span className="text-xs text-warning font-medium">
                      Auto-retry {retriesUsed + 1}/{autoContinueSettings.maxRetries}
                    </span>
                  </>
                ) : maxRetriesReached ? (
                  <>
                    <AlertCircle className="h-3 w-3 text-destructive" />
                    <span className="text-xs text-destructive font-medium">
                      Failed ({retriesUsed})
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3 text-warning" />
                    <span className="text-xs text-warning font-medium">Stalled</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {showContinueButton && !hasScheduledRetry && (
            <Button
              size="sm"
              variant="outline"
              className={cn('h-6 text-xs', isMobile ? 'px-3' : 'px-2')}
              onClick={onContinue}
            >
              <PlayCircle className="h-3 w-3 mr-1" />
              {isMobile ? 'Resume' : 'Continue'}
            </Button>
          )}
          {onKill && (report.status === 'pending' || report.status === 'processing') && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-40"
                  disabled={hasScheduledRetry}
                  onClick={() => setKillOpen(true)}
                  aria-label="Stop report generation"
                >
                  <Octagon className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {hasScheduledRetry
                  ? 'Wait — auto-retry in progress'
                  : 'Stop / kill this job'}
              </TooltipContent>
            </Tooltip>
          )}
          <AlertDialog open={killOpen} onOpenChange={setKillOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Stop report generation?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground">
                        {report.property_address}
                      </span>{' '}
                      will be marked as <span className="text-destructive font-medium">failed</span>{' '}
                      and removed from the active queue.
                    </p>
                    <p>
                      Progress so far: {report.sectionsCompleted}/{report.totalSections} sections.
                      This cannot be undone, but you can re-generate the report later.
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep running</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => {
                    onKill?.();
                    setKillOpen(false);
                  }}
                >
                  Stop generation
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            onClick={onDismiss}
            title="Dismiss (hide locally, job keeps running)"
            aria-label="Dismiss report"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Segmented progress */}
      <SegmentedProgress
        total={report.totalSections}
        completed={report.sectionsCompleted}
        currentInProgress={report.status === 'processing' && !isStuck}
        failed={report.status === 'failed' || maxRetriesReached}
      />

      <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help underline decoration-dotted">
                {report.sectionsCompleted}/{report.totalSections} sections
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-1 text-xs">
                <p>
                  <strong>DB Saved:</strong> Section {report.lastCompletedSection}/
                  {report.totalSections}
                </p>
                <p>
                  <strong>Content Detected:</strong> Section {report.sectionsCompleted}/
                  {report.totalSections}
                </p>
                <p>
                  <strong>Content Size:</strong> {(report.contentLength / 1024).toFixed(1)} KB
                </p>
                {sectionTimeline.length >= 2 && (
                  <p>
                    <strong>Avg/section:</strong>{' '}
                    {formatElapsed(
                      (sectionTimeline[sectionTimeline.length - 1] - sectionTimeline[0]) /
                        Math.max(1, sectionTimeline.length - 1)
                    )}
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span>{percentage}%</span>
      </div>

      {/* Mini sparkline of section completion timestamps */}
      {sectionTimeline.length >= 2 && (
        <Sparkline timestamps={sectionTimeline} startedAt={report.createdAt.getTime()} />
      )}

      {retriesUsed > 0 && (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3 w-3" />
          <span>
            {retriesUsed} auto-retry attempt{retriesUsed > 1 ? 's' : ''} used
            {maxRetriesReached && ' (max reached)'}
          </span>
        </div>
      )}

      {isStuck && (
        <div
          className={cn(
            'mt-2 p-2 rounded text-xs border',
            maxRetriesReached
              ? 'bg-destructive/10 border-destructive/20 text-destructive'
              : 'bg-warning/10 border-warning/20 text-warning'
          )}
        >
          <div className="flex items-start gap-1.5">
            {hasScheduledRetry ? (
              <Zap className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            ) : maxRetriesReached ? (
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            ) : (
              <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            )}
            <div className="space-y-0.5 flex-1">
              {hasScheduledRetry ? (
                <>
                  <p className="font-medium">Auto-resuming in {autoContinueSettings.delaySeconds}s</p>
                  <p className="opacity-80">
                    Attempt {retriesUsed + 1} of {autoContinueSettings.maxRetries} • Resume from
                    section {currentSection}
                  </p>
                </>
              ) : maxRetriesReached ? (
                <>
                  <p className="font-medium">Max retries reached</p>
                  <p className="opacity-80">
                    Tried {retriesUsed} times • Last update {minutesSinceUpdate}m ago
                  </p>
                  <p className="opacity-80">
                    Press <span className="font-medium">Continue</span> to manually retry from
                    section {currentSection}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">Generation stalled</p>
                  <p className="opacity-80">
                    No progress for{' '}
                    {minutesSinceUpdate > 0
                      ? `${minutesSinceUpdate} min`
                      : `${secondsSinceUpdate}s`}
                  </p>
                  {autoContinueSettings.enabled ? (
                    <p className="opacity-80">Auto-continue will retry shortly…</p>
                  ) : (
                    <p className="opacity-80">
                      Press <span className="font-medium">Continue</span> to resume from section{' '}
                      {currentSection}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {report.error_message && (
        <div className="mt-2 p-2 bg-destructive/10 rounded text-xs text-destructive">
          <div className="flex items-start gap-1.5">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span className="line-clamp-2 flex-1">{report.error_message}</span>
            <button
              type="button"
              onClick={copyError}
              className="shrink-0 hover:text-foreground"
              title="Copy error"
              aria-label="Copy error message"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Segmented progress bar ---------- */

function SegmentedProgress({
  total,
  completed,
  currentInProgress,
  failed,
}: {
  total: number;
  completed: number;
  currentInProgress: boolean;
  failed: boolean;
}) {
  return (
    <div className="flex gap-0.5" role="progressbar" aria-valuenow={completed} aria-valuemax={total}>
      {Array.from({ length: total }).map((_, i) => {
        const isDone = i < completed;
        const isCurrent = i === completed && currentInProgress;
        const isFailed = i === completed && failed;
        return (
          <span
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-sm transition-colors',
              isDone && 'bg-primary',
              isCurrent && 'bg-primary/60 animate-pulse',
              isFailed && 'bg-destructive',
              !isDone && !isCurrent && !isFailed && 'bg-muted'
            )}
          />
        );
      })}
    </div>
  );
}

/* ---------- Sparkline ---------- */

function Sparkline({ timestamps, startedAt }: { timestamps: number[]; startedAt: number }) {
  const points = [startedAt, ...timestamps];
  const intervals = points.slice(1).map((t, i) => t - points[i]);
  if (intervals.length === 0) return null;
  const max = Math.max(...intervals, 1);
  const w = 100;
  const h = 16;
  const stepX = w / Math.max(intervals.length, 1);
  const path = intervals
    .map((v, i) => {
      const x = i * stepX + stepX / 2;
      const y = h - (v / max) * (h - 2) - 1;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <div className="mt-1.5" title="Time per section (lower is faster)">
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1" className="text-primary/60" />
      </svg>
    </div>
  );
}

/* ---------- History list ---------- */

type HistoryFilter = 'all' | 'completed' | 'failed' | 'cancelled' | 'dismissed';
type HistorySort = 'recent' | 'oldest';

export function GenerationHistoryList({
  entries,
  onClear,
}: {
  entries: GenerationHistoryEntry[];
  onClear: () => void;
}) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [sort, setSort] = useState<HistorySort>('recent');
  const [query, setQuery] = useState('');
  const [cancelledByFilter, setCancelledByFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const cancellers = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.cancelledBy) set.add(e.cancelledBy);
    });
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => (filter === 'all' ? true : e.status === filter))
      .filter((e) => (q ? e.property_address.toLowerCase().includes(q) : true))
      .filter((e) => {
        if (cancelledByFilter === 'all') return true;
        return e.cancelledBy === cancelledByFilter;
      })
      .filter((e) => {
        if (!dateFrom && !dateTo) return true;
        const startOfDay = dateFrom ? new Date(dateFrom).setHours(0, 0, 0, 0) : null;
        const endOfDay = dateTo ? new Date(dateTo).setHours(23, 59, 59, 999) : null;
        if (startOfDay && e.finishedAt < startOfDay) return false;
        if (endOfDay && e.finishedAt > endOfDay) return false;
        return true;
      })
      .sort((a, b) =>
        sort === 'recent' ? b.finishedAt - a.finishedAt : a.finishedAt - b.finishedAt,
      );
  }, [entries, filter, sort, query, cancelledByFilter, dateFrom, dateTo]);

  const hasActiveFilters =
    filter !== 'all' ||
    query.trim().length > 0 ||
    cancelledByFilter !== 'all' ||
    dateFrom !== undefined ||
    dateTo !== undefined;

  if (entries.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground">
        <HistoryIcon className="h-6 w-6 mx-auto mb-2 opacity-50" />
        <p>No completed jobs yet.</p>
      </div>
    );
  }
  return (
    <>
      <div className="px-3 py-2 space-y-2 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {filtered.length} of {entries.length}
          </span>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setFilter('all');
                  setQuery('');
                  setCancelledByFilter('all');
                  setDateFrom(undefined);
                  setDateTo(undefined);
                }}
                className="text-[10px] text-primary hover:text-primary/80"
              >
                Reset filters
              </button>
            )}
            <button
              type="button"
              onClick={onClear}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search address…"
            className="h-7 pl-7 text-xs"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Select value={filter} onValueChange={(v) => setFilter(v as HistoryFilter)}>
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as HistorySort)}>
            <SelectTrigger className="h-7 text-xs w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {cancellers.length > 0 && (
          <Select value={cancelledByFilter} onValueChange={setCancelledByFilter}>
            <SelectTrigger className="h-7 text-xs w-full">
              <SelectValue placeholder="Stopped by…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any user</SelectItem>
              {cancellers.map((name) => (
                <SelectItem key={name} value={name}>
                  Stopped by {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'h-7 text-xs flex-1 justify-start text-left font-normal',
                  !dateFrom && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-1.5 h-3 w-3" />
                {dateFrom ? format(dateFrom, 'dd MMM yyyy') : 'From date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateFrom}
                onSelect={setDateFrom}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'h-7 text-xs flex-1 justify-start text-left font-normal',
                  !dateTo && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-1.5 h-3 w-3" />
                {dateTo ? format(dateTo, 'dd MMM yyyy') : 'To date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateTo}
                onSelect={setDateTo}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          No matches for current filters.
        </div>
      ) : (
        filtered.map((e) => (
          <button
            key={e.id + e.finishedAt}
            type="button"
            onClick={() => navigate(`/investment-report/${e.id}`)}
            className="w-full text-left p-3 border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-start gap-2">
              {e.status === 'completed' ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
              ) : e.status === 'failed' ? (
                <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
              ) : e.status === 'cancelled' ? (
                <Octagon className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
              ) : (
                <X className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {e.property_address}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {e.sectionsCompleted}/{e.totalSections} sections • {formatElapsed(e.durationMs)} •{' '}
                  {timeAgo(e.finishedAt)}
                </p>
                {e.status === 'cancelled' && (
                  <p className="text-[10px] text-destructive/80 mt-0.5">
                    Stopped by {e.cancelledBy || 'user'}
                  </p>
                )}
                {e.error_message && e.status !== 'cancelled' && (
                  <p className="text-[10px] text-destructive line-clamp-1 mt-0.5">
                    {e.error_message}
                  </p>
                )}
              </div>
            </div>
          </button>
        ))
      )}
    </>
  );
}

/* ---------- Bulk job grouping ---------- */

export interface BulkGroup {
  jobId: string;
  reports: ReportProgress[];
}

export function groupReportsByBulkJob(reports: ReportProgress[]): {
  groups: BulkGroup[];
  loose: ReportProgress[];
} {
  const map = new Map<string, ReportProgress[]>();
  const loose: ReportProgress[] = [];
  for (const r of reports) {
    if (r.bulkJobId) {
      const arr = map.get(r.bulkJobId) ?? [];
      arr.push(r);
      map.set(r.bulkJobId, arr);
    } else {
      loose.push(r);
    }
  }
  const groups: BulkGroup[] = Array.from(map.entries())
    .filter(([, list]) => list.length > 1) // only group if 2+ from same job
    .map(([jobId, list]) => ({ jobId, reports: list }));
  // Reports that were in a singleton group should fall back to loose
  for (const [jobId, list] of map.entries()) {
    if (list.length <= 1) loose.push(...list);
  }
  return { groups, loose };
}

export function BulkJobGroup({
  group,
  children,
  defaultOpen = true,
  etaForReport,
  onRetryAllFailed,
  onKillAll,
}: {
  group: BulkGroup;
  children: React.ReactNode;
  defaultOpen?: boolean;
  etaForReport?: (r: ReportProgress) => number | null;
  onRetryAllFailed?: (reportIds: string[]) => void;
  onKillAll?: (reportIds: string[]) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [killAllOpen, setKillAllOpen] = useState(false);

  const completedSections = group.reports.reduce((s, r) => s + r.sectionsCompleted, 0);
  const totalSections = group.reports.reduce((s, r) => s + r.totalSections, 0);
  const pct = totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0;
  const completed = group.reports.filter(
    (r) => r.sectionsCompleted >= r.totalSections,
  ).length;

  const failedReports = group.reports.filter((r) => r.status === 'failed');
  const failed = failedReports.length;

  const groupEta = (() => {
    if (!etaForReport) return null;
    const etas = group.reports.map(etaForReport).filter((v): v is number => v !== null);
    if (etas.length === 0) return null;
    return Math.max(...etas); // reports run in parallel — wall time is max
  })();

  // Build a chronological transition log derived from per-report timestamps.
  const transitions = (() => {
    type T = { ts: number; address: string; kind: 'queued' | 'processing' | 'failed' };
    const out: T[] = [];
    for (const r of group.reports) {
      out.push({ ts: r.createdAt.getTime(), address: r.property_address, kind: 'queued' });
      if (r.status === 'processing' || r.sectionsCompleted > 0) {
        out.push({
          ts: r.lastUpdated.getTime(),
          address: r.property_address,
          kind: 'processing',
        });
      }
      if (r.status === 'failed') {
        out.push({ ts: r.lastUpdated.getTime(), address: r.property_address, kind: 'failed' });
      }
    }
    return out.sort((a, b) => a.ts - b.ts);
  })();

  return (
    <div className="border-b border-border last:border-b-0 bg-muted/20">
      <div className="px-3 py-1.5 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors min-w-0"
            aria-expanded={open}
          >
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 shrink-0 transition-transform',
                !open && '-rotate-90',
              )}
            />
            <Layers className="h-3 w-3 shrink-0" />
            <span className="font-medium text-foreground">Bulk job</span>
            <span className="font-mono text-[10px] opacity-70">
              {group.jobId.slice(0, 8)}
            </span>
            <span className="opacity-50">•</span>
            <span className="truncate">
              {completed}/{group.reports.length} done
              {failed > 0 ? `, ${failed} failed` : ''}
            </span>
          </button>

          <div className="flex items-center gap-0.5 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => setTimelineOpen((o) => !o)}
                  aria-pressed={timelineOpen}
                  aria-label="Toggle timeline"
                >
                  <Clock className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Timeline</TooltipContent>
            </Tooltip>
            {failed > 0 && onRetryAllFailed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => onRetryAllFailed(failedReports.map((r) => r.id))}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Retry {failed}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Retry all failed in this job</TooltipContent>
              </Tooltip>
            )}
            {onKillAll && (() => {
              const active = group.reports.filter(
                (r) => r.status === 'pending' || r.status === 'processing',
              );
              if (active.length === 0) return null;
              return (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px] text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setKillAllOpen(true)}
                      >
                        <Octagon className="h-3 w-3 mr-1" />
                        Stop {active.length}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Kill all active jobs in this bulk job</TooltipContent>
                  </Tooltip>
                  <AlertDialog open={killAllOpen} onOpenChange={setKillAllOpen}>
                    <AlertDialogContent className="max-w-md">
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Stop {active.length} active report
                          {active.length === 1 ? '' : 's'}?
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-2 text-sm text-muted-foreground">
                            <p>
                              The following report{active.length === 1 ? '' : 's'} in bulk job{' '}
                              <span className="font-mono text-xs">
                                {group.jobId.slice(0, 8)}
                              </span>{' '}
                              will be marked as{' '}
                              <span className="text-destructive font-medium">failed</span>:
                            </p>
                            <ScrollArea className="max-h-40 rounded border border-border bg-muted/30 p-2">
                              <ul className="space-y-1">
                                {active.map((r) => (
                                  <li
                                    key={r.id}
                                    className="text-xs text-foreground flex items-center justify-between gap-2"
                                  >
                                    <span className="truncate">{r.property_address}</span>
                                    <span className="text-[10px] text-muted-foreground shrink-0">
                                      {r.sectionsCompleted}/{r.totalSections}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </ScrollArea>
                            <p className="text-xs">
                              Already-completed reports in this job are unaffected.
                            </p>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep running</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => {
                            onKillAll(active.map((r) => r.id));
                            setKillAllOpen(false);
                          }}
                        >
                          Stop {active.length} report{active.length === 1 ? '' : 's'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              );
            })()}
          </div>
        </div>

        {/* Aggregate progress + ETA */}
        <div className="space-y-0.5">
          <Progress value={pct} className="h-1" />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>
              {completedSections}/{totalSections} sections
            </span>
            <span>
              {pct}%
              {groupEta !== null && (
                <span className="opacity-80"> • ~{formatEta(groupEta)} left</span>
              )}
            </span>
          </div>
        </div>

        {/* Inline transition timeline */}
        {timelineOpen && transitions.length > 0 && (
          <div className="rounded border border-border bg-background/60 p-2 mt-1 max-h-32 overflow-y-auto">
            <ol className="space-y-1 text-[10px]">
              {transitions.map((t, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'inline-block h-1.5 w-1.5 rounded-full shrink-0',
                      t.kind === 'queued' && 'bg-muted-foreground',
                      t.kind === 'processing' && 'bg-primary',
                      t.kind === 'failed' && 'bg-destructive',
                    )}
                  />
                  <span className="font-mono tabular-nums text-muted-foreground shrink-0">
                    {formatClock(t.ts)}
                  </span>
                  <span className="capitalize text-muted-foreground shrink-0">{t.kind}</span>
                  <span className="opacity-50">·</span>
                  <span className="truncate text-foreground">{t.address}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      {open && <div>{children}</div>}
    </div>
  );
}

function formatClock(epoch: number): string {
  const d = new Date(epoch);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}


/* ---------- helpers ---------- */

export function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function formatEta(ms: number | null): string | null {
  if (ms === null || !isFinite(ms) || ms < 0) return null;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function timeAgo(epoch: number): string {
  const diff = Date.now() - epoch;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
