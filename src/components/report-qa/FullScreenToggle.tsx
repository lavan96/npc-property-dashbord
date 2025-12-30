import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Maximize2, Minimize2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface FullScreenToggleProps {
  isFullScreen: boolean;
  onToggle: () => void;
  className?: string;
}

export function FullScreenToggle({ isFullScreen, onToggle, className }: FullScreenToggleProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={className}
            onClick={onToggle}
            aria-label={isFullScreen ? 'Exit full screen' : 'Enter full screen'}
          >
            {isFullScreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{isFullScreen ? 'Exit full screen (Esc)' : 'Full screen mode'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Hook for managing full screen state
export function useFullScreen() {
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      }
      // F11 or Cmd+Enter for full screen
      if (e.key === 'F11' || ((e.metaKey || e.ctrlKey) && e.key === 'Enter')) {
        e.preventDefault();
        setIsFullScreen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen]);

  return { isFullScreen, setIsFullScreen, toggleFullScreen: () => setIsFullScreen(prev => !prev) };
}
