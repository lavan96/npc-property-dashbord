import { useMemo, useState } from 'react';
import RichTextBody from './RichTextBody';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface EmailBodyViewProps {
  content: string;
  className?: string;
  /** Soft character threshold above which the body is collapsed by default. */
  collapseThreshold?: number;
  /** Hard cap to avoid catastrophic renders. Above this we render the collapsed slice only until expanded. */
  hardCap?: number;
}

/**
 * Safe wrapper around RichTextBody for very long emails.
 *
 * - Collapses by default beyond `collapseThreshold` chars.
 * - For exceptionally large bodies (above `hardCap`) we only render the leading slice
 *   until the user explicitly expands, keeping the UI responsive.
 */
export default function EmailBodyView({
  content,
  className = 'prose prose-sm max-w-none dark:prose-invert',
  collapseThreshold = 8000,
  hardCap = 80000,
}: EmailBodyViewProps) {
  const safeContent = content || '';
  const length = safeContent.length;
  const isLong = length > collapseThreshold;
  const isHuge = length > hardCap;
  const [expanded, setExpanded] = useState(!isLong);

  // Find a clean cut point near the threshold (prefer end of paragraph).
  const collapsedSlice = useMemo(() => {
    if (!isLong) return safeContent;
    const window = safeContent.slice(0, collapseThreshold);
    const lastBreak = Math.max(
      window.lastIndexOf('\n\n'),
      window.lastIndexOf('. '),
    );
    return window.slice(0, lastBreak > collapseThreshold * 0.6 ? lastBreak : collapseThreshold);
  }, [safeContent, collapseThreshold, isLong]);

  const visible = expanded ? safeContent : collapsedSlice;
  const hiddenChars = length - visible.length;

  return (
    <div>
      <RichTextBody content={visible} className={className} />

      {isLong && (
        <div className="mt-4 flex flex-col items-start gap-2 border-t border-border/50 pt-3">
          {!expanded && (
            <p className="text-xs text-muted-foreground">
              {hiddenChars.toLocaleString()} more characters hidden
              {isHuge ? ' (large email — expand to load the rest)' : ''}.
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Collapse email
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                Show full email
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
