/**
 * Live badge showing which model currently powers a given agent slot.
 * Reads from `useAgentModel(agentKey)` — updates in realtime whenever the
 * Model Hub changes the assignment.
 *
 * Purely presentational. Wrap in a link/button at the call site if you
 * want it to be interactive (e.g. open ModelUpgradeButton).
 */

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentModel } from '@/hooks/useAgentModels';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type LiveModelBadgeProps = {
  agentKey: string;
  /** Show slot label (e.g. "Primary") ahead of the model name. */
  showSlot?: boolean;
  /** Compact chip vs. default pill. */
  size?: 'sm' | 'md';
  /** Optional override for wrapper classes. */
  className?: string;
};

export function LiveModelBadge({
  agentKey,
  showSlot = false,
  size = 'md',
  className,
}: LiveModelBadgeProps) {
  const { assignment, display, slotLabel } = useAgentModel(agentKey);
  const loading = !assignment && display.raw === '';

  const dot = (
    <span
      aria-hidden
      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: display.accent }}
    />
  );

  const content = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 backdrop-blur-sm font-medium text-foreground/90 transition-colors',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        className,
      )}
      style={{ borderColor: `${display.accent}55` }}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      ) : (
        dot
      )}
      {showSlot && (
        <span className="text-muted-foreground uppercase tracking-wide text-[10px]">
          {slotLabel}
        </span>
      )}
      <span className="truncate max-w-[180px]">
        {loading ? 'Loading…' : display.shortLabel}
      </span>
    </span>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          <div className="space-y-1">
            <div className="font-semibold">{display.longLabel}</div>
            <div className="text-muted-foreground">
              Slot: <span className="text-foreground">{slotLabel}</span>
            </div>
            {assignment && (
              <>
                <div className="text-muted-foreground">
                  Route: <span className="text-foreground">{assignment.route}</span>
                </div>
                {assignment.fallback_chain?.length > 0 && (
                  <div className="text-muted-foreground">
                    Fallbacks:{' '}
                    <span className="text-foreground">
                      {assignment.fallback_chain.map((f) => f.model_id).join(' → ')}
                    </span>
                  </div>
                )}
              </>
            )}
            <div className="pt-1 text-[10px] text-muted-foreground">
              Change in Model Hub → auto-syncs everywhere.
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
