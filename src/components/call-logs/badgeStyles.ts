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
  success: 'border-emerald-300/30 bg-emerald-500/15 text-emerald-300 shadow-emerald-500/10',
  danger: 'border-red-400/35 bg-red-500/15 text-red-300 shadow-red-500/10',
  warning: 'border-amber-300/30 bg-amber-500/15 text-amber-300 shadow-amber-500/10',
  attention: 'border-orange-300/30 bg-orange-500/15 text-orange-300 shadow-orange-500/10',
  info: 'border-sky-300/25 bg-sky-400/10 text-sky-200 shadow-sky-500/10',
  squad: 'border-purple-300/35 bg-purple-500/15 text-purple-200 shadow-purple-500/10',
  neutral: 'border-zinc-500/30 bg-zinc-500/15 text-zinc-300',
  tag: 'border-amber-300/20 bg-amber-300/10 text-amber-100 shadow-amber-500/10',
};

export const callLogBadgeTone = (tone: CallLogBadgeTone, className?: string) =>
  cn(callLogBadgeBase, callLogBadgeTones[tone], className);

