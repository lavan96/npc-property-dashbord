import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Download } from 'lucide-react';

interface CallRecordingPlayerProps {
  recordingUrl: string;
  duration?: number | null;
}

export const CallRecordingPlayer = ({ recordingUrl, duration }: CallRecordingPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Draw static waveform visualization when idle
  const drawStaticWaveform = useCallback(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas with gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGradient.addColorStop(0, 'hsl(222, 47%, 11%)');
    bgGradient.addColorStop(1, 'hsl(222, 47%, 8%)');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw decorative static waveform bars
    const barCount = 60;
    const barWidth = canvas.width / barCount;
    const centerY = canvas.height / 2;

    for (let i = 0; i < barCount; i++) {
      // Create a natural-looking waveform pattern
      const progress = currentTime / (audioDuration || 1);
      const playedBars = Math.floor(progress * barCount);
      
      // Generate pseudo-random heights for visual interest
      const seed = i * 7 + 13;
      const baseHeight = (Math.sin(seed * 0.3) * 0.3 + 0.5) * canvas.height * 0.6;
      const variation = Math.sin(seed * 0.7) * 10;
      const barHeight = Math.max(4, baseHeight + variation);

      // Color based on playback progress
      if (i < playedBars) {
        const gradient = ctx.createLinearGradient(0, centerY - barHeight / 2, 0, centerY + barHeight / 2);
        gradient.addColorStop(0, 'hsl(217, 91%, 60%)');
        gradient.addColorStop(0.5, 'hsl(217, 91%, 50%)');
        gradient.addColorStop(1, 'hsl(217, 91%, 40%)');
        ctx.fillStyle = gradient;
      } else {
        const gradient = ctx.createLinearGradient(0, centerY - barHeight / 2, 0, centerY + barHeight / 2);
        gradient.addColorStop(0, 'hsl(215, 20%, 45%)');
        gradient.addColorStop(0.5, 'hsl(215, 20%, 35%)');
        gradient.addColorStop(1, 'hsl(215, 20%, 25%)');
        ctx.fillStyle = gradient;
      }

      // Draw rounded bars
      const x = i * barWidth + barWidth * 0.15;
      const y = centerY - barHeight / 2;
      const width = barWidth * 0.7;
      const radius = Math.min(width / 2, 3);

      ctx.beginPath();
      ctx.roundRect(x, y, width, barHeight, radius);
      ctx.fill();
    }

    // Draw playhead indicator
    if (audioDuration > 0) {
      const playheadX = (currentTime / audioDuration) * canvas.width;
      ctx.fillStyle = 'hsl(217, 91%, 60%)';
      ctx.fillRect(playheadX - 1, 0, 2, canvas.height);
      
      // Glow effect
      ctx.shadowColor = 'hsl(217, 91%, 60%)';
      ctx.shadowBlur = 8;
      ctx.fillRect(playheadX - 1, 0, 2, canvas.height);
      ctx.shadowBlur = 0;
    }
  }, [currentTime, audioDuration]);

  // Draw dynamic waveform during playback
  const drawDynamicWaveform = useCallback(() => {
    if (!canvasRef.current || !analyserRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isPlaying) {
        drawStaticWaveform();
        return;
      }
      
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      // Dark gradient background
      const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGradient.addColorStop(0, 'hsl(222, 47%, 11%)');
      bgGradient.addColorStop(1, 'hsl(222, 47%, 8%)');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      const centerY = canvas.height / 2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = Math.max(4, (dataArray[i] / 255) * canvas.height * 0.85);
        
        // Create gradient for each bar
        const gradient = ctx.createLinearGradient(0, centerY - barHeight / 2, 0, centerY + barHeight / 2);
        gradient.addColorStop(0, 'hsl(217, 91%, 70%)');
        gradient.addColorStop(0.5, 'hsl(217, 91%, 55%)');
        gradient.addColorStop(1, 'hsl(217, 91%, 40%)');
        
        ctx.fillStyle = gradient;
        
        // Draw mirrored bars from center
        const radius = Math.min(barWidth / 2, 2);
        const barX = x;
        const barY = centerY - barHeight / 2;
        
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth - 2, barHeight, radius);
        ctx.fill();
        
        // Add subtle glow effect for active bars
        if (dataArray[i] > 128) {
          ctx.shadowColor = 'hsl(217, 91%, 60%)';
          ctx.shadowBlur = 4;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        
        x += barWidth;
      }
    };

    draw();
  }, [isPlaying, drawStaticWaveform]);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Draw static waveform on mount and when time updates
  useEffect(() => {
    if (!isPlaying) {
      drawStaticWaveform();
    }
  }, [isPlaying, currentTime, audioDuration, drawStaticWaveform]);

  const initAudioContext = () => {
    if (!audioRef.current || audioContextRef.current) return;

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    
    const source = audioContext.createMediaElementSource(audioRef.current);
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    sourceRef.current = source;
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setAudioDuration(audioRef.current.duration);
      setIsLoading(false);
      // Draw initial static waveform
      drawStaticWaveform();
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handlePlayPause = async () => {
    if (!audioRef.current) return;

    try {
      if (!audioContextRef.current) {
        initAudioContext();
      }

      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      if (isPlaying) {
        // Pause the audio
        audioRef.current.pause();
        setIsPlaying(false);
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
        // Redraw static waveform after pause
        setTimeout(() => drawStaticWaveform(), 50);
      } else {
        // Play the audio
        await audioRef.current.play();
        setIsPlaying(true);
        drawDynamicWaveform();
      }
    } catch (error) {
      console.error('Error playing/pausing audio:', error);
    }
  };

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.volume = value[0];
      setVolume(value[0]);
      setIsMuted(value[0] === 0);
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.volume = volume || 1;
        setIsMuted(false);
      } else {
        audioRef.current.volume = 0;
        setIsMuted(true);
      }
    }
  };

  const skipTime = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(audioRef.current.currentTime + seconds, audioDuration));
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEnded = () => {
    setIsPlaying(false);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    // Redraw static waveform when ended
    setTimeout(() => drawStaticWaveform(), 50);
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
        <audio
          ref={audioRef}
          src={recordingUrl}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          crossOrigin="anonymous"
        />

        {/* Waveform Visualization */}
        <div className="relative h-24 rounded-lg overflow-hidden border border-border/50 shadow-inner">
          <canvas
            ref={canvasRef}
            width={600}
            height={96}
            className="w-full h-full"
          />
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm">
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
};
