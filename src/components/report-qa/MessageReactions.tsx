import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageReactionsProps {
  messageId: string;
  onReact?: (messageId: string, reaction: 'up' | 'down') => void;
}

export function MessageReactions({ messageId, onReact }: MessageReactionsProps) {
  const [reaction, setReaction] = useState<'up' | 'down' | null>(null);

  const handleReact = (type: 'up' | 'down') => {
    const newReaction = reaction === type ? null : type;
    setReaction(newReaction);
    if (newReaction && onReact) {
      onReact(messageId, newReaction);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 w-7 p-0 rounded-full",
          reaction === 'up' && "bg-green-500/20 text-green-600 hover:bg-green-500/30"
        )}
        onClick={() => handleReact('up')}
        title="Helpful"
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 w-7 p-0 rounded-full",
          reaction === 'down' && "bg-red-500/20 text-red-600 hover:bg-red-500/30"
        )}
        onClick={() => handleReact('down')}
        title="Not helpful"
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
