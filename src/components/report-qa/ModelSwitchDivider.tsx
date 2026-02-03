import { cn } from '@/lib/utils';
import { OpenAILogo, PerplexityLogo, type ModelProvider } from './ModelSelector';
import { ArrowRight } from 'lucide-react';

interface ModelSwitchDividerProps {
  fromModel: ModelProvider;
  toModel: ModelProvider;
  className?: string;
}

export function ModelSwitchDivider({ fromModel, toModel, className }: ModelSwitchDividerProps) {
  const FromIcon = fromModel === 'openai' ? OpenAILogo : PerplexityLogo;
  const ToIcon = toModel === 'openai' ? OpenAILogo : PerplexityLogo;
  const toLabel = toModel === 'openai' ? 'GPT-5.2' : 'Perplexity';

  return (
    <div className={cn('flex items-center gap-3 py-3', className)}>
      <div className="flex-1 h-px bg-border" />
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
        <FromIcon className="h-3.5 w-3.5 opacity-50" />
        <ArrowRight className="h-3 w-3" />
        <ToIcon className="h-3.5 w-3.5" />
        <span className="font-medium">Switched to {toLabel}</span>
      </div>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
