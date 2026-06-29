import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type CallStateTone = 'amber' | 'emerald' | 'blue' | 'purple' | 'neutral' | 'danger';

const toneStyles: Record<CallStateTone, string> = {
  amber: 'border-amber-300/20 bg-amber-300/10 text-amber-200 shadow-amber-500/10',
  emerald: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200 shadow-emerald-500/10',
  blue: 'border-blue-300/20 bg-blue-500/10 text-blue-200 shadow-blue-500/10',
  purple: 'border-purple-300/20 bg-purple-500/10 text-purple-200 shadow-purple-500/10',
  neutral: 'border-zinc-400/20 bg-zinc-400/10 text-zinc-300 shadow-black/20',
  danger: 'border-red-300/20 bg-red-500/10 text-red-200 shadow-red-500/10',
};

interface CallStatePanelProps {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: CallStateTone;
  className?: string;
}

export const CallStatePanel = ({
  icon,
  title,
  description,
  action,
  tone = 'amber',
  className,
}: CallStatePanelProps) => (
  <div
    className={cn(
      'relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-950/90 via-black/65 to-zinc-950/90 px-6 py-12 text-center shadow-inner shadow-black/30',
      className
    )}
  >
    <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/40 to-transparent" />
    <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-amber-500/10 blur-3xl" />
    <div className="relative z-10 mx-auto flex max-w-md flex-col items-center">
      <div className={cn('mb-4 rounded-3xl border p-4 shadow-lg', toneStyles[tone])}>
        {icon}
      </div>
      <p className="font-semibold text-zinc-100">{title}</p>
      {description && <div className="mt-2 text-sm leading-6 text-zinc-500">{description}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  </div>
);
