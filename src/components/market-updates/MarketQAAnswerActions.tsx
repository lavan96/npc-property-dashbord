/**
 * Copy-to-clipboard + "Explain this answer" transparency panel for a Market Q&A turn.
 * Renders inline under an assistant message. Shows every retrieved source with
 * a used/considered badge so the user can audit the grounding.
 */
import { useState } from 'react';
import { Check, ChevronDown, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { MarketQARetrievedItem } from '@/types/marketUpdates';

interface Props {
  content: string;
  retrieved?: MarketQARetrievedItem[];
  questionId?: string | null;
  compact?: boolean;
}

export function MarketQAAnswerActions({ content, retrieved = [], questionId, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success('Answer copied to clipboard');
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Copy failed');
    }
  };

  const handleCopyLink = async () => {
    if (!questionId) return;
    const url = `${window.location.origin}/qa/market/${questionId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Reference id copied');
    } catch {
      toast.error('Copy failed');
    }
  };


  const used = retrieved.filter(r => r.used).length;
  const total = retrieved.length;

  return (
    <div className={cn('mt-1.5 space-y-1.5', compact ? 'text-[10px]' : 'text-xs')}>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-muted-foreground hover:border-primary/40 hover:text-primary"
          title="Copy answer"
        >
          {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
          Copy
        </button>
        {questionId && (
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-muted-foreground hover:border-primary/40 hover:text-primary"
            title="Copy reference id"
          >
            <Copy className="h-2.5 w-2.5" />Ref
          </button>
        )}
        {total > 0 && (
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-muted-foreground hover:border-primary/40 hover:text-primary"
          >
            <ChevronDown className={cn('h-2.5 w-2.5 transition-transform', open && 'rotate-180')} />
            Explain ({used}/{total})
          </button>
        )}
      </div>
      {open && total > 0 && (
        <div className="space-y-1 rounded-lg border border-border/60 bg-background/60 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Retrieved context · used vs considered</p>
          {retrieved.map(r => (
            <div key={r.id} className="flex items-start gap-2 rounded border border-border/40 bg-background/70 p-1.5">
              <span className={cn('mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full',
                r.used ? 'bg-primary' : 'bg-muted-foreground/30')}
                title={r.used ? 'Used in answer' : 'Considered but not used'}
              />
              <div className="min-w-0 flex-1">
                <a href={r.source_url} target="_blank" rel="noreferrer" className="block truncate text-[11px] font-medium text-foreground hover:text-primary">
                  {r.title}
                  <ExternalLink className="ml-1 inline h-2.5 w-2.5" />
                </a>
                <p className="truncate text-[10px] text-muted-foreground">
                  {r.source_name}
                  {r.impact_level ? ` · ${r.impact_level} impact` : ''}
                  {r.used ? ' · used' : ' · considered'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
