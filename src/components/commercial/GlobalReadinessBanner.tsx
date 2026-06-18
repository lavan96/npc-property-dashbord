/**
 * GlobalReadinessBanner + AssumptionStatusDialog
 * ---------------------------------------------------------------------------
 * Default overview surface for the Commercial & Industrial calculator suite.
 *
 *   - Shows current global readiness status as a single badge.
 *   - Shows up to 5 top-priority warnings inline (no UI overwhelm).
 *   - "View all" opens the full Assumption Status dialog grouped by category.
 *
 * Tab deep-links dispatch a `calculator-tab-open` window event that
 * `PropertyCalculators.tsx` already listens for.
 */
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowRight, AlertTriangle, AlertCircle, Info, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useGlobalReadiness,
  READINESS_BADGE_CLASS,
  SEVERITY_BADGE_CLASS,
  type GlobalWarning,
  type WarningCategory,
  type WarningSeverity,
} from '@/utils/commercial/globalReadiness';

const SEVERITY_ICON: Record<WarningSeverity, typeof AlertTriangle> = {
  critical: AlertCircle,
  caution: AlertTriangle,
  info: Info,
};

function jumpToTab(tab: GlobalWarning['tab']) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('calculator-tab-open', { detail: { tab } }));
}

export function GlobalReadinessBanner() {
  const { status, topWarnings, counts } = useGlobalReadiness();
  const [open, setOpen] = useState(false);

  return (
    <Card className="border-primary/20 bg-card/80">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Readiness
            </span>
            <Badge variant="outline" className={cn('border', READINESS_BADGE_CLASS[status])}>
              {status}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span><span className="font-semibold text-destructive">{counts.critical}</span> critical</span>
            <span><span className="font-semibold text-amber-500">{counts.caution}</span> caution</span>
            <span><span className="font-semibold text-sky-500">{counts.info}</span> info</span>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={counts.total === 0}>
              <ListChecks className="mr-1 h-3 w-3" /> Assumption Status
            </Button>
          </div>
        </div>

        {topWarnings.length === 0 ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-emerald-700 dark:text-emerald-300">
            No active warnings. Calculators are ready to use.
          </div>
        ) : (
          <ul className="space-y-1">
            {topWarnings.map(w => {
              const Icon = SEVERITY_ICON[w.severity];
              return (
                <li
                  key={w.id}
                  className={cn(
                    'flex flex-wrap items-start justify-between gap-2 rounded-md border px-2 py-1.5 text-xs',
                    SEVERITY_BADGE_CLASS[w.severity],
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div>
                      <div className="font-medium">{w.title}</div>
                      <div className="opacity-80">{w.nextAction}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-current/40 bg-background/30 text-[10px]">
                      {w.category}
                    </Badge>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => jumpToTab(w.tab)}>
                      {w.tab === 'report' ? 'Report' : 'Open tab'} <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {counts.total > topWarnings.length && (
          <div className="text-right text-[11px] text-muted-foreground">
            Showing top {topWarnings.length} of {counts.total} warnings — open Assumption Status for the full list.
          </div>
        )}
      </CardContent>

      <AssumptionStatusDialog open={open} onOpenChange={setOpen} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Full assumption status (grouped, scrollable)
// ---------------------------------------------------------------------------
export function AssumptionStatusDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { groupedWarnings, counts, status } = useGlobalReadiness();
  const categories = Object.keys(groupedWarnings) as WarningCategory[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            Assumption Status
            <Badge variant="outline" className={cn('ml-2 border', READINESS_BADGE_CLASS[status])}>
              {status}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Full list of warnings grouped by category. Each entry includes the next action and a deep-link to the source tab.
            <span className="ml-2 text-xs">
              {counts.critical} critical · {counts.caution} caution · {counts.info} info
            </span>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-4">
            {counts.total === 0 && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-300">
                No active warnings. All calculators are ready.
              </div>
            )}

            {categories.map(cat => {
              const items = groupedWarnings[cat];
              if (items.length === 0) return null;
              return (
                <div key={cat} className="rounded-lg border border-border/70 bg-card/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">{cat}</h3>
                    <Badge variant="outline">{items.length}</Badge>
                  </div>
                  <ul className="space-y-1.5">
                    {items.map(w => {
                      const Icon = SEVERITY_ICON[w.severity];
                      return (
                        <li
                          key={w.id}
                          className={cn(
                            'flex flex-wrap items-start justify-between gap-2 rounded-md border px-2 py-1.5 text-xs',
                            SEVERITY_BADGE_CLASS[w.severity],
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <div>
                              <div className="font-medium">{w.title}</div>
                              <div className="opacity-80">{w.nextAction}</div>
                              {w.assumptionKey && (
                                <div className="mt-0.5 font-mono text-[10px] opacity-60">{w.assumptionKey}</div>
                              )}
                            </div>
                          </div>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => jumpToTab(w.tab)}>
                            Open <ArrowRight className="ml-1 h-3 w-3" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
