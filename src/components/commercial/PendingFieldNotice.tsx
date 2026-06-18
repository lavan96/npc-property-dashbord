/**
 * PendingFieldNotice
 * ---------------------------------------------------------------------------
 * Drop-in inline component for surfaces that need to render the canned
 * "Pending" or "Insufficient information" messaging instead of raw zeros or
 * placeholders. Never renders `$0`, `N/A`, `NaN`, or `undefined`.
 *
 * Usage:
 *   <PendingFieldNotice state="insufficient" />
 *   <PendingFieldNotice state="pending" label="Market rent" />
 */
import { AlertCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  INSUFFICIENT_INFORMATION_COPY,
  PENDING_COPY,
} from '@/utils/commercial/pendingFieldDisplay';

export interface PendingFieldNoticeProps {
  state: 'pending' | 'insufficient';
  /** Optional field label rendered as a small caption. */
  label?: string;
  /** Optional override message (rarely needed — keep the canned copy). */
  message?: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function PendingFieldNotice({
  state,
  label,
  message,
  className,
  size = 'sm',
}: PendingFieldNoticeProps) {
  const Icon = state === 'insufficient' ? AlertCircle : Clock;
  const tone =
    state === 'insufficient'
      ? 'border-destructive/30 bg-destructive/5 text-destructive'
      : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300';
  const text =
    message ?? (state === 'insufficient' ? INSUFFICIENT_INFORMATION_COPY : PENDING_COPY);
  const padding = size === 'md' ? 'p-3' : 'p-2';

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex items-start gap-2 rounded-md border', padding, tone, className)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-0.5">
        {label && (
          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
            {label}
          </div>
        )}
        <div className={cn(size === 'md' ? 'text-sm' : 'text-xs', 'leading-snug')}>{text}</div>
      </div>
    </div>
  );
}
