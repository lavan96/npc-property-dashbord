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

  const timeRef = useRef(0);
  const staticAnimationRef = useRef<number>();

  // Draw sonic-style waveform visualization
  const drawSonicWaveform = useCallback((isAnimating: boolean = false) => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      // Clear with fade effect for trail
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw dark gradient base
      const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGradient.addColorStop(0, 'rgba(15, 23, 42, 0.9)');
      bgGradient.addColorStop(1, 'rgba(15, 23, 42, 0.95)');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const lineCount = 8;
      const segmentCount = 60;
      const centerY = canvas.height / 2;
      const progress = audioDuration > 0 ? currentTime / audioDuration : 0;

      for (let i = 0; i < lineCount; i++) {
        ctx.beginPath();
        const lineProgress = i / lineCount;
        const colorIntensity = Math.sin(lineProgress * Math.PI);
        
        // Teal/cyan color scheme
        ctx.strokeStyle = `rgba(0, 200, 150, ${colorIntensity * 0.4})`;
        ctx.lineWidth = 1.5;

        for (let j = 0; j <= segmentCount; j++) {
          const x = (j / segmentCount) * canvas.width;
          const segmentProgress = j / segmentCount;
          
          // Check if this segment is played
          const isPlayed = segmentProgress <= progress;

          // Wave calculation with time-based animation
          const noise = Math.sin(j * 0.15 + timeRef.current + i * 0.3) * 15;
          const spike = Math.cos(j * 0.25 + timeRef.current + i * 0.15) * Math.sin(j * 0.08 + timeRef.current) * 25;
          
          // Amplify if playing
          const amplitudeMultiplier = isAnimating ? 1.5 : 0.8;
          const y = centerY + (noise + spike) * amplitudeMultiplier;

          if (j === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      // Draw progress overlay with glow
      if (progress > 0) {
        const progressX = progress * canvas.width;
        
        // Played section overlay
        ctx.fillStyle = 'rgba(0, 200, 150, 0.1)';
        ctx.fillRect(0, 0, progressX, canvas.height);
        
        // Playhead line with glow
        ctx.shadowColor = 'rgba(0, 255, 192, 0.8)';
        ctx.shadowBlur = 12;
        ctx.strokeStyle = 'rgba(0, 255, 192, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(progressX, 0);
        ctx.lineTo(progressX, canvas.height);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Update time for animation
      timeRef.current += isAnimating ? 0.04 : 0.015;

      if (isAnimating && isPlaying) {
        animationRef.current = requestAnimationFrame(draw);
      } else if (!isAnimating) {
        staticAnimationRef.current = requestAnimationFrame(draw);
      }
    };

    draw();
  }, [currentTime, audioDuration, isPlaying]);

  // Draw dynamic waveform during playback with frequency data
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
        drawSonicWaveform(false);
        return;
      }
      
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      // Clear with fade for trail effect
      ctx.fillStyle = 'rgba(15, 23, 42, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const centerY = canvas.height / 2;
      const progress = audioDuration > 0 ? currentTime / audioDuration : 0;

      // Draw multiple wave lines based on frequency data
      const lineCount = 6;
      for (let line = 0; line < lineCount; line++) {
        ctx.beginPath();
        const lineProgress = line / lineCount;
        const colorIntensity = Math.sin(lineProgress * Math.PI);
        
        // Dynamic opacity based on audio levels
        const avgLevel = dataArray.reduce((a, b) => a + b, 0) / bufferLength / 255;
        const opacity = (colorIntensity * 0.5) + (avgLevel * 0.3);
        
        ctx.strokeStyle = `rgba(0, 255, 192, ${opacity})`;
        ctx.lineWidth = 1.5 + avgLevel;

        const segmentCount = Math.min(bufferLength, 80);
        for (let i = 0; i <= segmentCount; i++) {
          const x = (i / segmentCount) * canvas.width;
          const dataIndex = Math.floor((i / segmentCount) * bufferLength);
          
          // Combine frequency data with wave animation
          const freqAmplitude = (dataArray[dataIndex] / 255) * canvas.height * 0.35;
          const waveOffset = Math.sin(i * 0.15 + timeRef.current + line * 0.4) * 10;
          const y = centerY + waveOffset + (freqAmplitude * Math.sin(line * 0.5 + timeRef.current));

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      // Draw frequency bars at bottom
      const barCount = 40;
      const barWidth = canvas.width / barCount;
      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor((i / barCount) * bufferLength);
        const barHeight = (dataArray[dataIndex] / 255) * canvas.height * 0.3;
        
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
        gradient.addColorStop(0, 'rgba(0, 255, 192, 0.6)');
        gradient.addColorStop(1, 'rgba(0, 200, 150, 0.1)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(i * barWidth + 1, canvas.height - barHeight, barWidth - 2, barHeight);
      }

      // Progress indicator
      if (progress > 0) {
        const progressX = progress * canvas.width;
        ctx.shadowColor = 'rgba(0, 255, 192, 0.9)';
        ctx.shadowBlur = 15;
        ctx.strokeStyle = 'rgba(0, 255, 192, 1)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(progressX, 0);
        ctx.lineTo(progressX, canvas.height);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      timeRef.current += 0.05;
    };

    draw();
  }, [isPlaying, currentTime, audioDuration, drawSonicWaveform]);

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

  // Draw sonic waveform on mount and when time updates
  useEffect(() => {
    if (!isPlaying) {
      drawSonicWaveform(false);
    }
    return () => {
      if (staticAnimationRef.current) {
        cancelAnimationFrame(staticAnimationRef.current);
      }
    };
  }, [isPlaying, currentTime, audioDuration, drawSonicWaveform]);

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
      // Draw initial sonic waveform
      drawSonicWaveform(false);
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
        // Redraw sonic waveform after pause
        setTimeout(() => drawSonicWaveform(false), 50);
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
    // Redraw sonic waveform when ended
    setTimeout(() => drawSonicWaveform(false), 50);
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
