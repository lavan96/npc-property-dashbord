import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square, Loader2, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { cn } from '@/lib/utils';

interface VoiceNoteRecorderProps {
  onTranscriptReady: (cleanedText: string) => void;
  noteType: string;
  disabled?: boolean;
}

const MAX_RECORDING_DURATION = 300; // 5 minutes max for notes

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function VoiceNoteRecorder({ onTranscriptReady, noteType, disabled }: VoiceNoteRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const liveTranscriptTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });
      
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
          ? 'audio/webm;codecs=opus' 
          : 'audio/webm'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      
      // Don't reset chunks if resuming from paused state
      if (!isPaused) {
        chunksRef.current = [];
        setLiveTranscript('');
        setRecordingDuration(0);
      }
      setIsPaused(false);
      
      // Start duration timer with auto-stop at max
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          const newDuration = prev + 1;
          if (newDuration >= MAX_RECORDING_DURATION) {
            finalizeRecording();
            toast.info('Maximum recording reached (5 min). Transcribing...');
          }
          return newDuration;
        });
      }, 1000);
      
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          
          // Live transcription preview every 10 seconds (20 chunks × 500ms)
          if (chunksRef.current.length % 20 === 0 && chunksRef.current.length <= 120) {
            if (liveTranscriptTimeoutRef.current) {
              clearTimeout(liveTranscriptTimeoutRef.current);
            }
            liveTranscriptTimeoutRef.current = setTimeout(async () => {
              try {
                const recentChunks = chunksRef.current.slice(-40);
                const partialBlob = new Blob(recentChunks, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.onloadend = async () => {
                  const base64 = (reader.result as string).split(',')[1];
                  const { data } = await invokeSecureFunction('voice-to-text', { audio: base64 });
                  if (data?.text) {
                    setLiveTranscript(data.text);
                  }
                };
                reader.readAsDataURL(partialBlob);
              } catch {
                // Silent fail for live preview
              }
            }, 500);
          }
        }
      };
      
      mediaRecorder.onstop = async () => {
        // Clean up timers
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
        if (liveTranscriptTimeoutRef.current) {
          clearTimeout(liveTranscriptTimeoutRef.current);
          liveTranscriptTimeoutRef.current = null;
        }
        
        // Only stop tracks if finalizing (not pausing)
        if (!isPaused && streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        // Only transcribe if finalizing
        if (!isPaused && chunksRef.current.length > 0) {
          const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
          await processAudio(audioBlob);
          setLiveTranscript('');
          setRecordingDuration(0);
        }
      };
      
      // Request data every 500ms for chunking
      mediaRecorder.start(500);
      setIsRecording(true);
      toast.info('Recording started...', { duration: 2000 });
    } catch (error: any) {
      console.error('Failed to start recording:', error);
      toast.error('Failed to access microphone. Please check permissions.');
    }
  }, [isPaused]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.stop();
      
      // Stop stream tracks while paused
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      // Clear timer but keep duration
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      
      setIsPaused(true);
      setIsRecording(false);
      toast.info('Recording paused');
    }
  }, [isRecording, isPaused]);

  const resumeRecording = useCallback(async () => {
    if (isPaused) {
      await startRecording();
    }
  }, [isPaused, startRecording]);

  const finalizeRecording = useCallback(() => {
    if (mediaRecorderRef.current && (isRecording || isPaused)) {
      setIsPaused(false);
      
      if (isRecording) {
        mediaRecorderRef.current.stop();
      } else if (isPaused && chunksRef.current.length > 0) {
        // If paused, manually process since recorder already stopped
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        processAudio(audioBlob);
        setLiveTranscript('');
        setRecordingDuration(0);
      }
      
      setIsRecording(false);
    }
  }, [isRecording, isPaused]);

  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    
    try {
      // Convert blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(audioBlob);
      const base64Audio = await base64Promise;

      // Step 1: Transcribe audio
      const { data: transcribeData, error: transcribeError } = await invokeSecureFunction('voice-to-text', {
        audio: base64Audio
      });

      if (transcribeError || !transcribeData?.text) {
        throw new Error(transcribeError?.message || 'Transcription failed');
      }

      const rawTranscript = transcribeData.text;
      toast.info('Processing your note...', { duration: 2000 });

      // Step 2: Clean up with AI
      const { data: cleanData, error: cleanError } = await invokeSecureFunction('clean-note-transcript', {
        transcript: rawTranscript, noteType
      });

      if (cleanError) {
        console.error('Clean transcript error:', cleanError);
        onTranscriptReady(rawTranscript);
        toast.warning('Used raw transcript (AI cleanup failed)');
      } else {
        onTranscriptReady(cleanData.cleanedNote || rawTranscript);
        toast.success('Voice note ready!');
      }
      
      // Clear chunks after successful processing
      chunksRef.current = [];

    } catch (error: any) {
      console.error('Audio processing error:', error);
      toast.error('Failed to process voice note: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const progressPercent = Math.min((recordingDuration / MAX_RECORDING_DURATION) * 100, 100);
  const isNearLimit = recordingDuration >= MAX_RECORDING_DURATION - 30;

  // Processing state
  if (isProcessing) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Processing...
      </Button>
    );
  }

  // Active recording or paused state - show full controls
  if (isRecording || isPaused) {
    return (
      <div className="space-y-2">
        {/* Recording indicator */}
        <div 
          className={cn(
            "flex flex-col gap-2 p-3 rounded-lg border",
            isPaused ? "bg-orange-500/10 border-orange-500/30" : "bg-red-500/10 border-red-500/30"
          )}
        >
          <div className="flex items-center gap-3">
            {/* Recording/Paused indicator */}
            <div className="relative">
              {isPaused ? (
                <div className="w-5 h-5 rounded-full bg-orange-500/20 flex items-center justify-center">
                  <Pause className="w-3 h-3 text-orange-500" />
                </div>
              ) : (
                <>
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  <div className="absolute inset-0 w-3 h-3 rounded-full bg-red-500 animate-ping opacity-50" />
                </>
              )}
            </div>
            
            {/* Waveform animation - only when recording */}
            {!isPaused && (
              <div className="flex items-center gap-0.5 h-5">
                {[...Array(12)].map((_, i) => (
                  <div
                    key={i}
                    className="w-0.5 bg-red-500/70 rounded-full"
                    style={{
                      height: '100%',
                      animation: 'waveform 1s ease-in-out infinite',
                      animationDelay: `${i * 0.05}s`,
                      transform: `scaleY(${0.3 + Math.random() * 0.7})`,
                    }}
                  />
                ))}
              </div>
            )}
            
            <span className={cn(
              "text-xs font-medium",
              isPaused ? "text-orange-500" : "text-red-500 animate-pulse"
            )}>
              {isPaused ? 'Paused' : 'Recording...'}
            </span>
            
            <span className={cn(
              "text-xs font-mono ml-auto",
              isNearLimit ? "text-orange-500 font-semibold" : (isPaused ? "text-orange-500/70" : "text-red-500/70")
            )}>
              {formatDuration(recordingDuration)} / {formatDuration(MAX_RECORDING_DURATION)}
            </span>
          </div>
          
          {/* Progress bar */}
          <div className={cn(
            "h-1 w-full rounded-full overflow-hidden",
            isPaused ? "bg-orange-500/20" : "bg-red-500/20"
          )}>
            <div 
              className={cn(
                "h-full rounded-full transition-all duration-1000",
                isNearLimit ? "bg-orange-500" : (isPaused ? "bg-orange-500/60" : "bg-red-500/60")
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          
          {/* Near limit warning */}
          {isNearLimit && (
            <p className="text-xs text-orange-500 font-medium">
              ⚠️ Recording will stop in {formatDuration(MAX_RECORDING_DURATION - recordingDuration)}
            </p>
          )}
          
          {/* Live transcript preview */}
          {liveTranscript && !isPaused && (
            <div className="text-sm text-muted-foreground italic border-t border-red-500/20 pt-2 mt-1">
              <span className="text-red-500/60 text-xs mr-1">Live:</span>
              {liveTranscript.length > 100 ? `${liveTranscript.slice(0, 100)}...` : liveTranscript}
              <span className="inline-block w-1 h-3 bg-red-500/50 ml-0.5 animate-pulse" />
            </div>
          )}
          
          {/* Paused instructions */}
          {isPaused && (
            <p className="text-xs text-muted-foreground mt-1">
              Click <span className="text-orange-500 font-medium">Resume</span> to continue or <span className="text-destructive font-medium">Stop</span> to transcribe
            </p>
          )}
        </div>
        
        {/* Control buttons */}
        <div className="flex gap-2">
          {isRecording ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={pauseRecording}
                className="gap-1.5"
              >
                <Pause className="h-3.5 w-3.5" />
                Pause
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={finalizeRecording}
                className="gap-1.5"
              >
                <Square className="h-3.5 w-3.5" />
                Stop
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={resumeRecording}
                className="gap-1.5 border-orange-500 text-orange-500 hover:bg-orange-500/10"
              >
                <Play className="h-3.5 w-3.5" />
                Resume
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={finalizeRecording}
                className="gap-1.5"
              >
                <Square className="h-3.5 w-3.5" />
                Stop & Transcribe
              </Button>
            </>
          )}
        </div>
        
        <style>{`
          @keyframes waveform {
            0%, 100% { transform: scaleY(0.3); }
            50% { transform: scaleY(1); }
          }
        `}</style>
      </div>
    );
  }

  // Default idle state
  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={startRecording}
      disabled={disabled}
      className="gap-2"
      title="Record voice note"
    >
      <Mic className="h-4 w-4" />
      Voice Note
    </Button>
  );
}
