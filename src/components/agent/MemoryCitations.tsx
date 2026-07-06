import { useState } from 'react';
import { Brain, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { toast } from 'sonner';

export interface RecalledMemory {
  id: string;
  content: string;
  tags?: string[] | null;
  importance?: number | null;
  similarity?: number | null;
  feedback_score?: number | null;
  kind?: string | null;
}

interface Props {
  messageId?: string;
  memories: RecalledMemory[];
  defaultOpen?: boolean;
}

type RatingState = 1 | -1 | null;

export function MemoryCitations({ messageId, memories, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [ratings, setRatings] = useState<Record<string, RatingState>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});

  if (!memories?.length) return null;

  const submitFeedback = async (memoryId: string, rating: 1 | -1) => {
    if (pending[memoryId] || ratings[memoryId] === rating) return;
    const previous = ratings[memoryId] ?? null;
    setRatings(prev => ({ ...prev, [memoryId]: rating }));
    setPending(prev => ({ ...prev, [memoryId]: true }));
    try {
      const res = await invokeSecureFunction('ai-dashboard-agent', {
        action: 'memory-feedback',
        memory_id: memoryId,
        message_id: messageId,
        rating,
      });
      if (!res.data?.success) throw new Error(res.data?.error || 'Feedback failed');
      if (rating === 1) toast.success('Thanks — I\'ll surface this more often.');
      else toast.success('Noted — I\'ll rely on this less.');
    } catch (err: any) {
      setRatings(prev => ({ ...prev, [memoryId]: previous }));
      toast.error(err?.message || 'Could not save feedback');
    } finally {
      setPending(prev => ({ ...prev, [memoryId]: false }));
    }
  };

  return (
    <div className="mt-2 pt-2 border-t border-border/40">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Brain className="h-3 w-3" />
        <span>{memories.length} long-term {memories.length === 1 ? 'memory' : 'memories'} used</span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {open && (
        <ul className="mt-2 space-y-1.5">
          {memories.map((m, i) => {
            const rating = ratings[m.id] ?? null;
            const sim = typeof m.similarity === 'number' ? Math.round(m.similarity * 100) : null;
            return (
              <li
                key={m.id}
                className="rounded-md border border-border/40 bg-background/40 px-2.5 py-1.5 text-[11px] leading-snug"
              >
                <div className="flex items-start gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0 mt-0.5">[{i + 1}]</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground/90 whitespace-pre-wrap break-words">{m.content}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      {sim !== null && <span>match {sim}%</span>}
                      {typeof m.importance === 'number' && <span>· imp {m.importance}/5</span>}
                      {m.kind && <span>· {m.kind}</span>}
                      {m.tags?.length ? <span>· {m.tags.slice(0, 4).join(', ')}</span> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn(
                        'h-6 w-6 rounded-full',
                        rating === 1 && 'bg-success/15 text-success hover:bg-success/25',
                      )}
                      disabled={pending[m.id]}
                      onClick={() => submitFeedback(m.id, 1)}
                      aria-label="Helpful"
                    >
                      {pending[m.id] && rating === 1 ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn(
                        'h-6 w-6 rounded-full',
                        rating === -1 && 'bg-destructive/15 text-destructive hover:bg-destructive/25',
                      )}
                      disabled={pending[m.id]}
                      onClick={() => submitFeedback(m.id, -1)}
                      aria-label="Not helpful"
                    >
                      {pending[m.id] && rating === -1 ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsDown className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
