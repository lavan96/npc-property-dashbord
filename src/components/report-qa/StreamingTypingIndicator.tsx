import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StreamingTypingIndicatorProps {
  isMultiReport?: boolean;
  streamingContent?: string;
  className?: string;
}

export function StreamingTypingIndicator({ 
  isMultiReport, 
  streamingContent,
  className 
}: StreamingTypingIndicatorProps) {
  const hasContent = streamingContent && streamingContent.length > 0;
  
  return (
    <div className={cn("flex gap-3 justify-start", className)}>
      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Bot className="h-4 w-4 text-primary" />
      </div>
      <div className="bg-muted rounded-lg p-3 max-w-[80%]">
        {hasContent ? (
          <div className="space-y-2">
            <p className="text-sm whitespace-pre-wrap">{streamingContent}</p>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs text-muted-foreground">Generating...</span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Skeleton loader for thinking state */}
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <span 
                  className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" 
                  style={{ animationDelay: '0ms', animationDuration: '0.8s' }} 
                />
                <span 
                  className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" 
                  style={{ animationDelay: '150ms', animationDuration: '0.8s' }} 
                />
                <span 
                  className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" 
                  style={{ animationDelay: '300ms', animationDuration: '0.8s' }} 
                />
              </div>
              <span className="text-sm text-muted-foreground">
                {isMultiReport ? 'Analyzing reports...' : 'Thinking...'}
              </span>
            </div>
            
            {/* Skeleton content preview */}
            <div className="space-y-2 animate-pulse">
              <div className="h-3 bg-muted-foreground/10 rounded w-full" />
              <div className="h-3 bg-muted-foreground/10 rounded w-4/5" />
              <div className="h-3 bg-muted-foreground/10 rounded w-3/5" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
