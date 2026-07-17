/**
 * VisualQualityPageReviewCard — the real per-page review surface (C7).
 *
 * Renders one page's source / generated / diff imagery (lazy beyond the top of
 * the grid), the full metric breakdown, the applied output policy, coverage,
 * warnings, the repair diary, and the per-page operator actions. Presentational
 * only: all data comes from the pure `PageReviewModel` view-model and all
 * mutations are routed through the `onAction` callback (confirmed where the
 * action policy demands it).
 */
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, ImageOff, Layers3, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { PageReviewModel } from '@/lib/reportTemplate/ingestion/visualQuality';
import {
  describePageActions,
  type PageActionDescriptor,
  type PageReviewAction,
} from '@/lib/reportTemplate/ingestion/visualQuality';
import type { VisualRecommendedAction } from '@/lib/reportTemplate/ingestion/visualQuality';

interface Props {
  model: PageReviewModel;
  aiRepairEnabled?: boolean;
  busy?: boolean;
  onAction?: (pageId: string, action: PageReviewAction) => void;
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

function scoreTone(score: number | null): 'success' | 'warning' | 'destructive' | 'secondary' {
  if (score === null) return 'secondary';
  if (score >= 0.8) return 'success';
  if (score >= 0.5) return 'warning';
  return 'destructive';
}

function strategyBadge(model: PageReviewModel): { label: string; variant: 'success' | 'warning' | 'info' | 'secondary' } {
  const strategy = model.outputStrategy;
  const mode = model.policy?.finalMode;
  if (strategy === 'raster-only') {
    return mode === 'pixel-perfect'
      ? { label: 'Pixel fallback', variant: 'warning' }
      : { label: 'Hybrid fallback', variant: 'warning' };
  }
  if (strategy === 'native') return { label: mode === 'hybrid' ? 'Native · hybrid ref' : 'Native', variant: 'success' };
  return { label: 'Unscored', variant: 'secondary' };
}

const ACTION_COPY: Record<VisualRecommendedAction, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' | 'info' }> = {
  accept: { label: 'Accept', variant: 'success' },
  accept_with_warnings: { label: 'Accept w/ warnings', variant: 'info' },
  repair: { label: 'Repair', variant: 'warning' },
  fallback_to_hybrid: { label: 'Fallback → hybrid', variant: 'warning' },
  fallback_to_pixel: { label: 'Fallback → pixel', variant: 'warning' },
  manual_review: { label: 'Manual review', variant: 'destructive' },
};

function ThumbSlot({ label, url, eager }: { label: string; url: string | null; eager: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded border bg-muted/30">
          <img
            src={url}
            alt={`${label} raster`}
            loading={eager ? 'eager' : 'lazy'}
            className="h-28 w-full object-contain transition-transform group-hover:scale-[1.02]"
          />
        </a>
      ) : (
        <div className="flex h-28 w-full items-center justify-center rounded border border-dashed bg-muted/20 text-muted-foreground">
          <ImageOff className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

export function VisualQualityPageReviewCard({ model, aiRepairEnabled, busy, onAction }: Props) {
  const [confirm, setConfirm] = useState<PageActionDescriptor | null>(null);
  const strategy = strategyBadge(model);
  const rec = model.recommendedAction ? ACTION_COPY[model.recommendedAction] : null;

  const descriptors = describePageActions({
    hasSourceRaster: model.artifacts.source,
    outputStrategy: model.outputStrategy,
    score: model.overallScore,
    aiRepairEnabled,
    nativeMode: model.policy?.finalMode,
  });

  const runAction = (descriptor: PageActionDescriptor) => {
    if (!descriptor.available || busy) return;
    if (descriptor.requiresConfirm) {
      setConfirm(descriptor);
      return;
    }
    onAction?.(model.pageId, descriptor.action);
  };

  return (
    <Card className={`flex flex-col gap-3 p-3 ${model.scored ? '' : 'border-warning/40 bg-warning/5'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{model.label}</div>
          <div className="text-[11px] text-muted-foreground">Page {model.pageNumber}</div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          <Badge variant={strategy.variant} className="gap-1"><Layers3 className="h-3 w-3" />{strategy.label}</Badge>
          <Badge variant={scoreTone(model.overallScore)}>{pct(model.overallScore)}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <ThumbSlot label="Source" url={model.images.source} eager={model.eagerImages} />
        <ThumbSlot label="Generated" url={model.images.generated} eager={model.eagerImages} />
        <ThumbSlot label="Diff" url={model.images.diff} eager={model.eagerImages} />
      </div>

      {model.scored ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          {model.metrics.map((metric) => (
            <div key={metric.key} className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{metric.label}</span>
              <span className="font-medium tabular-nums">{pct(metric.score)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded border border-dashed bg-muted/20 px-2 py-1.5 text-[11px] text-muted-foreground">
          This page was not scored by visual QA — review it manually before relying on the reconstruction.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {rec && <Badge variant={rec.variant}>Rec: {rec.label}</Badge>}
        {model.warnings.length > 0 && (
          <Badge variant="warning" className="gap-1"><AlertTriangle className="h-3 w-3" />{model.warnings.length} warning{model.warnings.length === 1 ? '' : 's'}</Badge>
        )}
        {model.repairDiary.length > 0 && (
          <Badge variant="secondary">{model.repairDiary.length} repair pass{model.repairDiary.length === 1 ? '' : 'es'}</Badge>
        )}
      </div>

      {model.warnings.length > 0 && (
        <ul className="space-y-0.5 text-[11px] text-muted-foreground">
          {model.warnings.slice(0, 3).map((warning, index) => (
            <li key={`${warning.code}-${index}`} className="truncate">· {warning.message}</li>
          ))}
          {model.warnings.length > 3 && <li className="italic">+{model.warnings.length - 3} more…</li>}
        </ul>
      )}

      {model.repairDiary.length > 0 && (
        <div className="rounded border bg-muted/20 p-2 text-[10px] text-muted-foreground">
          {model.repairDiary.slice(0, 3).map((entry, index) => (
            <div key={index} className="flex items-center justify-between gap-2">
              <span>Pass {entry.pass}: {entry.action}</span>
              <span className="tabular-nums">{pct(entry.scoreBefore)} → {pct(entry.scoreAfter)} {entry.accepted ? '✓' : '✕'}</span>
            </div>
          ))}
        </div>
      )}

      {onAction && (
        <div className="mt-auto flex flex-wrap gap-1 border-t pt-2">
          {descriptors.map((descriptor) => (
            <Button
              key={descriptor.action}
              type="button"
              size="sm"
              variant={descriptor.variant}
              className="h-7 px-2 text-[11px]"
              disabled={!descriptor.available || !!busy}
              title={descriptor.disabledReason}
              onClick={() => (descriptor.action === 'open_editor' ? onAction(model.pageId, 'open_editor') : runAction(descriptor))}
            >
              {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {descriptor.action === 'open_editor' && <ExternalLink className="mr-1 h-3 w-3" />}
              {descriptor.label}
            </Button>
          ))}
        </div>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Confirm “{confirm?.label}” on {model.label}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This applies to <span className="font-medium">page {model.pageNumber} only</span> and saves a new, auditable template version. Other pages are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) onAction?.(model.pageId, confirm.action);
                setConfirm(null);
              }}
            >
              {confirm?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
