import { cn } from '@/lib/utils';

export const pipelineBadgeBase =
  'inline-flex min-w-0 max-w-full items-center justify-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold leading-4 tracking-[0.01em] shadow-sm [&>svg]:h-3 [&>svg]:w-3 [&>svg]:shrink-0 [&>span]:min-w-0 [&>span]:truncate';

export const pipelineBadgeCompact =
  'inline-flex min-w-0 max-w-full items-center justify-center gap-1 rounded-full border px-1.5 py-0 text-[9px] font-bold leading-3 shadow-sm [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:shrink-0 [&>span]:min-w-0 [&>span]:truncate';

export const badgeTones = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-300/30 dark:bg-emerald-400/15 dark:text-emerald-200',
  warning: 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:border-amber-300/35 dark:bg-amber-400/15 dark:text-amber-200',
  danger: 'border-red-500/35 bg-red-500/10 text-red-700 dark:border-red-300/35 dark:bg-red-400/15 dark:text-red-200',
  gold: 'border-yellow-500/35 bg-yellow-500/10 text-yellow-700 dark:border-yellow-300/35 dark:bg-yellow-400/15 dark:text-yellow-100',
  neutral: 'border-slate-500/25 bg-slate-500/10 text-slate-600 dark:border-slate-300/20 dark:bg-slate-400/10 dark:text-slate-300',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:border-sky-300/30 dark:bg-sky-400/15 dark:text-sky-200',
} as const;

export function pipelineBadgeClass(tone: keyof typeof badgeTones, compact = false, extra?: string) {
  return cn(compact ? pipelineBadgeCompact : pipelineBadgeBase, badgeTones[tone], extra);
}
