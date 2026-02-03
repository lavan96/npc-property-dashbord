import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Download } from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';

interface CallRecordingPlayerProps {
  recordingUrl: string;
  duration?: number | null;
}

export interface CallRecordingPlayerHandle {
  stop: () => void;
}

export const CallRecordingPlayer = forwardRef<CallRecordingPlayerHandle, CallRecordingPlayerProps>(
  ({ recordingUrl, duration }, ref) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const isInitializedRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);

  // Expose stop method to parent
  useImperativeHandle(ref, () => ({
    stop: () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.stop();
        setIsPlaying(false);
        setCurrentTime(0);
      }
    }
  }), []);

  // Initialize WaveSurfer
  useEffect(() => {
    // Prevent double initialization
    if (!waveformRef.current || isInitializedRef.current) return;
    
    // Clear any existing content in the container
    waveformRef.current.innerHTML = '';
    
    isInitializedRef.current = true;

    // Check if dark mode is active
    const isDarkMode = document.documentElement.classList.contains('dark');
    
    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: isDarkMode ? '#6b7280' : '#000000',
      progressColor: isDarkMode ? '#a1a1aa' : '#6b7280',
      cursorColor: isDarkMode ? '#f87171' : '#ef4444',
      cursorWidth: 1,
      height: 80,
      barWidth: 1,
      barHeight: 1,
      barGap: 1,
      barRadius: 0,
      normalize: true,
      fillParent: true,
      interact: true,
      dragToSeek: true,
      hideScrollbar: true,
      autoScroll: false,
      backend: 'WebAudio',
    });

    wavesurferRef.current = wavesurfer;

    // Load audio
    wavesurfer.load(recordingUrl);

    // Event handlers
    wavesurfer.on('ready', () => {
      setAudioDuration(wavesurfer.getDuration());
      setIsLoading(false);
      setIsReady(true);
    });

    wavesurfer.on('audioprocess', () => {
      setCurrentTime(wavesurfer.getCurrentTime());
    });

    wavesurfer.on('seeking', () => {
      setCurrentTime(wavesurfer.getCurrentTime());
    });

    wavesurfer.on('play', () => {
      setIsPlaying(true);
    });

    wavesurfer.on('pause', () => {
      setIsPlaying(false);
    });

    wavesurfer.on('finish', () => {
      setIsPlaying(false);
    });

    wavesurfer.on('error', (error) => {
      console.error('WaveSurfer error:', error);
      setIsLoading(false);
    });

    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
      isInitializedRef.current = false;
    };
  }, [recordingUrl]);

  const handlePlayPause = useCallback(() => {
    if (!wavesurferRef.current || !isReady) return;
    wavesurferRef.current.playPause();
  }, [isReady]);

  const handleSeek = useCallback((value: number[]) => {
    if (!wavesurferRef.current || !isReady || audioDuration === 0) return;
    const newTime = value[0];
    wavesurferRef.current.seekTo(newTime / audioDuration);
    setCurrentTime(newTime);
  }, [isReady, audioDuration]);

  const handleVolumeChange = useCallback((value: number[]) => {
    if (!wavesurferRef.current) return;
    const newVolume = value[0];
    wavesurferRef.current.setVolume(newVolume);
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  }, []);

  const toggleMute = useCallback(() => {
    if (!wavesurferRef.current) return;
    if (isMuted) {
      wavesurferRef.current.setVolume(volume || 1);
      setIsMuted(false);
    } else {
      wavesurferRef.current.setVolume(0);
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const skipTime = useCallback((seconds: number) => {
    if (!wavesurferRef.current || !isReady || audioDuration === 0) return;
    const newTime = Math.max(0, Math.min(currentTime + seconds, audioDuration));
    wavesurferRef.current.seekTo(newTime / audioDuration);
    setCurrentTime(newTime);
  }, [isReady, currentTime, audioDuration]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Volume2 className="w-4 h-4" />
          Call Recording
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* WaveSurfer Waveform */}
        <div className="relative rounded-lg overflow-hidden border border-border shadow-sm bg-white dark:bg-zinc-900 p-2">
          <div 
            ref={waveformRef} 
            className="w-full min-h-[80px]"
          />
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                <span className="text-sm text-muted-foreground">Loading audio...</span>
              </div>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <Slider
            value={[currentTime]}
            min={0}
            max={audioDuration || 100}
            step={0.1}
            onValueChange={handleSeek}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(audioDuration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => skipTime(-10)}
              className="h-8 w-8"
            >
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button
              variant="default"
              size="icon"
              onClick={handlePlayPause}
              disabled={isLoading}
              className="h-10 w-10 rounded-full"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 ml-0.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => skipTime(10)}
              className="h-8 w-8"
            >
              <SkipForward className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              className="h-8 w-8"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </Button>
            <Slider
              value={[isMuted ? 0 : volume]}
              min={0}
              max={1}
              step={0.1}
              onValueChange={handleVolumeChange}
              className="w-20"
            />
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <a href={recordingUrl} download target="_blank" rel="noopener noreferrer">
                <Download className="w-4 h-4 mr-1" />
                Download
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

CallRecordingPlayer.displayName = 'CallRecordingPlayer';
