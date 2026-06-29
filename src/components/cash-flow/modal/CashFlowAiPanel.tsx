import { Sparkles } from 'lucide-react';
import type { CashFlowContainerProps } from './types';

interface CashFlowAiPanelProps extends CashFlowContainerProps {
  active?: boolean;
}

export function CashFlowAiPanel({ children, active = true }: CashFlowAiPanelProps) {
  if (!active) return null;

  return (
    <section className="min-w-0 space-y-4 rounded-[1.75rem] border border-amber-300/30 bg-gradient-to-br from-card dark:from-slate-950 via-card dark:via-slate-900 to-card dark:to-slate-950 p-3 shadow-2xl shadow-sm dark:shadow-black/20 ring-1 ring-amber-400/15 md:p-4">
      <div className="flex min-w-0 items-center gap-3 px-1">
        <span className="shrink-0 rounded-2xl bg-amber-400/10 p-2 text-amber-300 shadow-sm ring-1 ring-amber-300/20">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-100 md:text-base">AI Decision Support</p>
          <p className="text-xs leading-5 text-muted-foreground dark:text-slate-300 [overflow-wrap:anywhere]">Generate, save, and export comparison analysis without changing report payloads.</p>
        </div>
      </div>
      {children}
    </section>
  );
}
