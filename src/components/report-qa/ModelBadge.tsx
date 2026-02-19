import { cn } from '@/lib/utils';
import { OpenAILogo, PerplexityLogo, GeminiLogo, type ModelProvider } from './ModelSelector';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

interface ModelBadgeProps {
  provider: ModelProvider | null;
  className?: string;
  showLabel?: boolean;
}

export function ModelBadge({ provider, className, showLabel = false }: ModelBadgeProps) {
  if (!provider) return null;

  const configs: Record<string, { Icon: typeof OpenAILogo; label: string; color: string; bgColor: string; borderColor: string }> = {
    openai: {
      Icon: OpenAILogo,
      label: 'GPT-5.2',
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
      borderColor: 'border-emerald-200 dark:border-emerald-800',
    },
    'openai-direct': {
      Icon: OpenAILogo,
      label: 'GPT-4.1',
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
      borderColor: 'border-emerald-200 dark:border-emerald-800',
    },
    perplexity: {
      Icon: PerplexityLogo,
      label: 'Perplexity',
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30',
      borderColor: 'border-blue-200 dark:border-blue-800',
    },
    gemini: {
      Icon: GeminiLogo,
      label: 'Gemini Pro',
      color: 'text-violet-600 dark:text-violet-400',
      bgColor: 'bg-violet-50 dark:bg-violet-950/30',
      borderColor: 'border-violet-200 dark:border-violet-800',
    },
  };

  const config = configs[provider] || configs.openai;

  const badge = (
    <div 
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border',
        config.bgColor,
        config.borderColor,
        config.color,
        className
      )}
    >
      <config.Icon className="h-3 w-3" />
      {showLabel && <span>{config.label}</span>}
    </div>
  );

  if (!showLabel) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            {badge}
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Powered by {config.label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
}
