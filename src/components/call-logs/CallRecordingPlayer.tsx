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

  // Get color based on position - creates a gradient effect across bars
  const getBarColor = (index: number, total: number, intensity: number = 1) => {
    const position = index / total;
    
    // Create a vibrant gradient: cyan -> purple -> pink -> orange
    if (position < 0.25) {
      // Cyan to blue
      const t = position / 0.25;
      return `hsla(${185 - t * 40}, ${85 + t * 10}%, ${55 + intensity * 15}%, ${0.85 + intensity * 0.15})`;
    } else if (position < 0.5) {
      // Blue to purple
      const t = (position - 0.25) / 0.25;
      return `hsla(${145 + t * 135}, ${90}%, ${50 + intensity * 20}%, ${0.85 + intensity * 0.15})`;
    } else if (position < 0.75) {
      // Purple to pink/magenta
      const t = (position - 0.5) / 0.25;
      return `hsla(${280 + t * 40}, ${85}%, ${55 + intensity * 15}%, ${0.85 + intensity * 0.15})`;
    } else {
      // Pink to orange/coral
      const t = (position - 0.75) / 0.25;
      return `hsla(${320 + t * 30}, ${80 + t * 10}%, ${55 + intensity * 15}%, ${0.85 + intensity * 0.15})`;
    }
  };

  // Draw beautiful static waveform visualization when idle
  const drawStaticWaveform = useCallback(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create a beautiful dark gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    bgGradient.addColorStop(0, 'hsl(240, 20%, 8%)');
    bgGradient.addColorStop(0.5, 'hsl(260, 25%, 6%)');
    bgGradient.addColorStop(1, 'hsl(220, 20%, 8%)');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add subtle grid pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.height; i += 8) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(canvas.width, i);
      ctx.stroke();
    }

    const barCount = 80;
    const gap = 3;
    const barWidth = (canvas.width - gap * barCount) / barCount;
    const centerY = canvas.height / 2;
    const progress = currentTime / (audioDuration || 1);
    const playedBars = Math.floor(progress * barCount);

    // Draw bars
    for (let i = 0; i < barCount; i++) {
      const x = i * (barWidth + gap) + gap / 2;
      
      // Generate organic waveform heights using multiple sine waves
      const wave1 = Math.sin(i * 0.15) * 0.4;
      const wave2 = Math.sin(i * 0.08 + 2) * 0.3;
      const wave3 = Math.sin(i * 0.25 + 1) * 0.2;
      const wave4 = Math.cos(i * 0.12) * 0.1;
      const combinedWave = (wave1 + wave2 + wave3 + wave4 + 1) / 2;
      
      const maxHeight = canvas.height * 0.7;
      const barHeight = Math.max(6, combinedWave * maxHeight);
      const halfHeight = barHeight / 2;
      
      const isPlayed = i < playedBars;
      const isNearPlayhead = Math.abs(i - playedBars) < 3;
      
      // Main bar
      if (isPlayed) {
        // Played bars - vibrant gradient
        const gradient = ctx.createLinearGradient(x, centerY - halfHeight, x, centerY + halfHeight);
        const baseColor = getBarColor(i, barCount, 1);
        gradient.addColorStop(0, baseColor);
        gradient.addColorStop(0.5, getBarColor(i, barCount, 1.2));
        gradient.addColorStop(1, baseColor);
        ctx.fillStyle = gradient;
        
        // Add glow for played bars
        ctx.shadowColor = getBarColor(i, barCount, 1);
        ctx.shadowBlur = 8;
      } else {
        // Unplayed bars - subtle gray with hint of color
        const gradient = ctx.createLinearGradient(x, centerY - halfHeight, x, centerY + halfHeight);
        gradient.addColorStop(0, 'rgba(100, 100, 120, 0.4)');
        gradient.addColorStop(0.5, 'rgba(120, 120, 140, 0.5)');
        gradient.addColorStop(1, 'rgba(100, 100, 120, 0.4)');
        ctx.fillStyle = gradient;
        ctx.shadowBlur = 0;
      }

      // Draw rounded bar
      const radius = Math.min(barWidth / 2, 3);
      ctx.beginPath();
      ctx.roundRect(x, centerY - halfHeight, barWidth, barHeight, radius);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw reflection (mirrored, faded)
      if (isPlayed) {
        const reflectionGradient = ctx.createLinearGradient(x, centerY + halfHeight, x, centerY + halfHeight + barHeight * 0.3);
        reflectionGradient.addColorStop(0, getBarColor(i, barCount, 0.3));
        reflectionGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = reflectionGradient;
      } else {
        ctx.fillStyle = 'rgba(80, 80, 100, 0.15)';
      }
      ctx.beginPath();
      ctx.roundRect(x, centerY + halfHeight + 2, barWidth, barHeight * 0.25, radius);
      ctx.fill();

      // Playhead glow effect
      if (isNearPlayhead && audioDuration > 0) {
        const glowIntensity = 1 - Math.abs(i - playedBars) / 3;
        ctx.fillStyle = `rgba(255, 255, 255, ${0.15 * glowIntensity})`;
        ctx.beginPath();
        ctx.roundRect(x - 1, centerY - halfHeight - 2, barWidth + 2, barHeight + 4, radius + 1);
        ctx.fill();
      }
    }

    // Draw playhead line
    if (audioDuration > 0 && progress > 0) {
      const playheadX = progress * canvas.width;
      
      // Glow behind playhead
      const glowGradient = ctx.createRadialGradient(playheadX, centerY, 0, playheadX, centerY, 30);
      glowGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
      glowGradient.addColorStop(1, 'transparent');
      ctx.fillStyle = glowGradient;
      ctx.fillRect(playheadX - 30, 0, 60, canvas.height);
      
      // Playhead line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'white';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, canvas.height);
      ctx.stroke();
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

      // Beautiful dark gradient background
      const bgGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      bgGradient.addColorStop(0, 'hsl(240, 20%, 8%)');
      bgGradient.addColorStop(0.5, 'hsl(260, 25%, 6%)');
      bgGradient.addColorStop(1, 'hsl(220, 20%, 8%)');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Subtle ambient glow in center
      const ambientGlow = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, canvas.width / 2);
      ambientGlow.addColorStop(0, 'rgba(139, 92, 246, 0.08)');
      ambientGlow.addColorStop(0.5, 'rgba(59, 130, 246, 0.04)');
      ambientGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = ambientGlow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barCount = 64;
      const gap = 4;
      const barWidth = (canvas.width - gap * barCount) / barCount;
      const centerY = canvas.height / 2;

      // Sample the frequency data
      const step = Math.floor(bufferLength / barCount);

      for (let i = 0; i < barCount; i++) {
        const dataIndex = i * step;
        const value = dataArray[dataIndex] || 0;
        const normalizedValue = value / 255;
        
        const x = i * (barWidth + gap) + gap / 2;
        const maxHeight = canvas.height * 0.85;
        const barHeight = Math.max(4, normalizedValue * maxHeight);
        const halfHeight = barHeight / 2;
        
        // Get vibrant color based on position and intensity
        const intensity = normalizedValue;
        const color = getBarColor(i, barCount, intensity);
        
        // Main bar with gradient
        const gradient = ctx.createLinearGradient(x, centerY - halfHeight, x, centerY + halfHeight);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.3, getBarColor(i, barCount, intensity * 1.3));
        gradient.addColorStop(0.5, getBarColor(i, barCount, intensity * 1.5));
        gradient.addColorStop(0.7, getBarColor(i, barCount, intensity * 1.3));
        gradient.addColorStop(1, color);
        
        ctx.fillStyle = gradient;
        
        // Add glow effect for active bars
        if (normalizedValue > 0.3) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 12 * normalizedValue;
        }
        
        // Draw rounded bar from center (mirrored effect)
        const radius = Math.min(barWidth / 2, 3);
        ctx.beginPath();
        ctx.roundRect(x, centerY - halfHeight, barWidth, barHeight, radius);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Draw reflection below
        const reflectionHeight = barHeight * 0.3;
        const reflectionGradient = ctx.createLinearGradient(x, centerY + halfHeight + 2, x, centerY + halfHeight + 2 + reflectionHeight);
        reflectionGradient.addColorStop(0, `${color.slice(0, -1)}, 0.4)`);
        reflectionGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = reflectionGradient;
        ctx.beginPath();
        ctx.roundRect(x, centerY + halfHeight + 2, barWidth, reflectionHeight, radius);
        ctx.fill();
        
        // Top highlight for peaks
        if (normalizedValue > 0.7) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.beginPath();
          ctx.arc(x + barWidth / 2, centerY - halfHeight, barWidth / 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Add floating particles for extra visual interest
      const time = Date.now() * 0.001;
      for (let i = 0; i < 8; i++) {
        const particleX = (Math.sin(time + i * 0.8) * 0.5 + 0.5) * canvas.width;
        const particleY = (Math.cos(time * 0.7 + i) * 0.3 + 0.5) * canvas.height;
        const particleSize = 2 + Math.sin(time + i) * 1;
        
        const particleGradient = ctx.createRadialGradient(particleX, particleY, 0, particleX, particleY, particleSize * 3);
        particleGradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
        particleGradient.addColorStop(0.5, getBarColor(i * 8, 64, 0.5));
        particleGradient.addColorStop(1, 'transparent');
        
        ctx.fillStyle = particleGradient;
        ctx.beginPath();
        ctx.arc(particleX, particleY, particleSize * 3, 0, Math.PI * 2);
        ctx.fill();
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
    analyser.smoothingTimeConstant = 0.75;
    
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
        audioRef.current.pause();
        setIsPlaying(false);
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
        setTimeout(() => drawStaticWaveform(), 50);
      } else {
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
    setTimeout(() => drawStaticWaveform(), 50);
  };

  return (
    <Card className="overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-slate-100">
          <div className="p-1.5 rounded-md bg-gradient-to-br from-violet-500/20 to-cyan-500/20">
            <Volume2 className="w-4 h-4 text-violet-400" />
          </div>
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
        <div className="relative h-28 rounded-xl overflow-hidden border border-slate-700/50 shadow-xl shadow-violet-500/5">
          <canvas
            ref={canvasRef}
            width={800}
            height={112}
            className="w-full h-full"
          />
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/95 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="w-1 bg-gradient-to-t from-violet-500 to-cyan-400 rounded-full animate-pulse"
                      style={{
                        height: `${12 + Math.sin(i) * 8}px`,
                        animationDelay: `${i * 0.15}s`
                      }}
                    />
                  ))}
                </div>
                <span className="text-sm text-slate-400">Loading audio...</span>
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
          <div className="flex justify-between text-xs text-slate-400 font-medium">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(audioDuration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => skipTime(-10)}
              className="h-9 w-9 text-slate-300 hover:text-white hover:bg-slate-700/50"
            >
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              onClick={handlePlayPause}
              disabled={isLoading}
              className="h-12 w-12 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 hover:from-violet-400 hover:to-cyan-400 shadow-lg shadow-violet-500/25 transition-all hover:scale-105 hover:shadow-violet-500/40"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 text-white" />
              ) : (
                <Play className="w-5 h-5 ml-0.5 text-white" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => skipTime(10)}
              className="h-9 w-9 text-slate-300 hover:text-white hover:bg-slate-700/50"
            >
              <SkipForward className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              className="h-8 w-8 text-slate-300 hover:text-white hover:bg-slate-700/50"
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
              className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/50 hover:border-slate-500"
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
