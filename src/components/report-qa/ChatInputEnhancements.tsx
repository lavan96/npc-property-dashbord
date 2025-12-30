import { cn } from '@/lib/utils';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CharacterCountProps {
  current: number;
  max: number;
  className?: string;
}

export function CharacterCount({ current, max, className }: CharacterCountProps) {
  const remaining = max - current;
  const isWarning = remaining <= 200 && remaining > 0;
  const isError = remaining <= 0;

  if (current === 0) return null;

  return (
    <div 
      className={cn(
        "text-xs transition-colors",
        isError ? "text-destructive font-medium" : 
        isWarning ? "text-amber-500" : 
        "text-muted-foreground",
        className
      )}
    >
      {remaining >= 0 ? (
        <span>{remaining.toLocaleString()} characters remaining</span>
      ) : (
        <span className="flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {Math.abs(remaining).toLocaleString()} over limit
        </span>
      )}
    </div>
  );
}

interface RetryButtonProps {
  onRetry: () => void;
  isRetrying?: boolean;
  className?: string;
}

export function RetryButton({ onRetry, isRetrying, className }: RetryButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onRetry}
      disabled={isRetrying}
      className={cn("h-7 px-2 text-xs gap-1.5 text-destructive hover:text-destructive", className)}
    >
      <RotateCcw className={cn("h-3 w-3", isRetrying && "animate-spin")} />
      {isRetrying ? "Retrying..." : "Retry"}
    </Button>
  );
}

interface FailedMessageProps {
  content: string;
  onRetry: () => void;
  isRetrying?: boolean;
}

export function FailedMessageIndicator({ content, onRetry, isRetrying }: FailedMessageProps) {
  return (
    <div className="flex items-start gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded-lg mt-1">
      <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-destructive font-medium">Failed to send message</p>
        <p className="text-xs text-muted-foreground truncate">{content}</p>
      </div>
      <RetryButton onRetry={onRetry} isRetrying={isRetrying} />
    </div>
  );
}
