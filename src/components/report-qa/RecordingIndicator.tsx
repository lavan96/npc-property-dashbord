import { cn } from '@/lib/utils';

interface RecordingIndicatorProps {
  isRecording: boolean;
  className?: string;
  liveTranscript?: string;
  duration?: number;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function RecordingIndicator({ 
  isRecording, 
  className,
  liveTranscript,
  duration = 0
}: RecordingIndicatorProps) {
  if (!isRecording) return null;

  return (
    <div 
      className={cn(
        "flex flex-col gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30",
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={liveTranscript ? `Recording: ${liveTranscript}` : 'Recording in progress'}
    >
      <div className="flex items-center gap-3">
        {/* Recording pulse indicator */}
        <div className="relative" aria-hidden="true">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse motion-reduce:animate-none" />
          <div className="absolute inset-0 w-3 h-3 rounded-full bg-red-500 animate-ping opacity-50 motion-reduce:animate-none" />
        </div>
        
        {/* Animated waveform bars */}
        <div className="flex items-center gap-0.5 h-6" aria-hidden="true">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="w-1 bg-red-500/70 rounded-full motion-reduce:!transform-none"
              style={{
                height: '100%',
                animation: 'waveform 1s ease-in-out infinite',
                animationDelay: `${i * 0.05}s`,
                transform: `scaleY(${0.3 + Math.random() * 0.7})`,
              }}
            />
          ))}
        </div>
        
        <span className="text-xs text-red-500 font-medium animate-pulse motion-reduce:animate-none">
          Recording...
        </span>
        
        {duration > 0 && (
          <span className="text-xs text-red-500/70 font-mono ml-auto">
            {formatDuration(duration)}
          </span>
        )}
      </div>
      
      {/* Live transcription preview */}
      {liveTranscript && (
        <div className="text-sm text-muted-foreground italic border-t border-red-500/20 pt-2 mt-1">
          <span className="text-red-500/60 text-xs mr-1">Live:</span>
          {liveTranscript}
          <span className="inline-block w-1 h-4 bg-red-500/50 ml-0.5 animate-pulse motion-reduce:animate-none" />
        </div>
      )}
      
      <style>{`
        @keyframes waveform {
          0%, 100% { transform: scaleY(0.3); }
          50% { transform: scaleY(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes waveform {
            0%, 100% { transform: scaleY(0.5); }
          }
        }
      `}</style>
    </div>
  );
}
