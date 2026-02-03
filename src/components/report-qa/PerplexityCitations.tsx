import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PerplexityCitationsProps {
  citations: string[];
  className?: string;
}

export function PerplexityCitations({ citations, className }: PerplexityCitationsProps) {
  if (!citations || citations.length === 0) return null;

  // Extract domain from URL for display
  const getDomain = (url: string) => {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return domain.length > 25 ? domain.substring(0, 22) + '...' : domain;
    } catch {
      return url.substring(0, 25);
    }
  };

  return (
    <div className={cn('mt-3 pt-3 border-t border-border/50', className)}>
      <div className="text-xs font-medium text-muted-foreground mb-2">Sources</div>
      <div className="flex flex-wrap gap-2">
        {citations.slice(0, 5).map((citation, index) => (
          <a
            key={index}
            href={citation}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors border border-blue-200 dark:border-blue-800"
          >
            <span className="font-medium">[{index + 1}]</span>
            <span className="truncate max-w-[120px]">{getDomain(citation)}</span>
            <ExternalLink className="h-3 w-3 flex-shrink-0" />
          </a>
        ))}
        {citations.length > 5 && (
          <span className="text-xs text-muted-foreground self-center">
            +{citations.length - 5} more
          </span>
        )}
      </div>
    </div>
  );
}
