import { cn } from '@/lib/utils';

interface RecordingIndicatorProps {
  isRecording: boolean;
  className?: string;
}

export function RecordingIndicator({ isRecording, className }: RecordingIndicatorProps) {
  if (!isRecording) return null;

  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30",
      className
    )}>
      {/* Recording pulse indicator */}
      <div className="relative">
        <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
        <div className="absolute inset-0 w-3 h-3 rounded-full bg-red-500 animate-ping opacity-50" />
      </div>
      
      {/* Animated waveform bars */}
      <div className="flex items-center gap-0.5 h-6">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="w-1 bg-red-500/70 rounded-full"
            style={{
              height: '100%',
              animation: `waveform 1s ease-in-out infinite`,
              animationDelay: `${i * 0.05}s`,
              transform: `scaleY(${0.3 + Math.random() * 0.7})`,
            }}
          />
        ))}
      </div>
      
      <span className="text-xs text-red-500 font-medium animate-pulse">Recording...</span>
      
      <style>{`
        @keyframes waveform {
          0%, 100% { transform: scaleY(0.3); }
          50% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}
