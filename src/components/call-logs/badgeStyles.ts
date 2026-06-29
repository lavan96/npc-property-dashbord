import { cn } from '@/lib/utils';

export type CallLogBadgeTone =
  | 'success'
  | 'danger'
  | 'warning'
  | 'attention'
  | 'info'
  | 'squad'
  | 'neutral'
  | 'tag';

export const callLogBadgeBase =
  'inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium leading-none shadow-sm transition-colors';

const callLogBadgeTones: Record<CallLogBadgeTone, string> = {
  success:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 shadow-emerald-500/10 dark:border-emerald-300/30 dark:bg-emerald-500/15 dark:text-emerald-300',
  danger:
    'border-red-500/35 bg-red-500/10 text-red-700 shadow-red-500/10 dark:border-red-400/35 dark:bg-red-500/15 dark:text-red-300',
  warning:
    'border-amber-500/35 bg-amber-500/10 text-amber-700 shadow-amber-500/10 dark:border-amber-300/30 dark:bg-amber-500/15 dark:text-amber-300',
  attention:
    'border-orange-500/35 bg-orange-500/10 text-orange-700 shadow-orange-500/10 dark:border-orange-300/30 dark:bg-orange-500/15 dark:text-orange-300',
  info:
    'border-sky-500/30 bg-sky-500/10 text-sky-700 shadow-sky-500/10 dark:border-sky-300/25 dark:bg-sky-400/10 dark:text-sky-200',
  squad:
    'border-purple-500/35 bg-purple-500/10 text-purple-700 shadow-purple-500/10 dark:border-purple-300/35 dark:bg-purple-500/15 dark:text-purple-200',
  neutral:
    'border-border bg-muted/60 text-muted-foreground dark:border-zinc-500/30 dark:bg-zinc-500/15 dark:text-zinc-300',
  tag:
    'border-amber-500/30 bg-amber-500/10 text-amber-700 shadow-amber-500/10 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100',
};

export const callLogBadgeTone = (tone: CallLogBadgeTone, className?: string) =>
  cn(callLogBadgeBase, callLogBadgeTones[tone], className);

