import { Sparkles } from 'lucide-react';
import type { CashFlowContainerProps } from './types';

interface CashFlowAiPanelProps extends CashFlowContainerProps {
  active?: boolean;
}

export function CashFlowAiPanel({ children, active = true }: CashFlowAiPanelProps) {
  if (!active) return null;

  return (
    <section className="space-y-4 rounded-[1.75rem] border border-blue-200/70 bg-gradient-to-br from-blue-50/50 via-background to-background p-3 shadow-sm md:p-4 dark:border-blue-900/40 dark:from-blue-950/20">
      <div className="flex items-center gap-3 px-1">
        <span className="rounded-2xl bg-blue-500/10 p-2 text-blue-600 shadow-sm ring-1 ring-blue-500/10">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold md:text-base">AI Decision Support</p>
          <p className="text-xs text-muted-foreground">Generate, save, and export comparison analysis without changing report payloads.</p>
        </div>
      </div>
      {children}
    </section>
  );
}
