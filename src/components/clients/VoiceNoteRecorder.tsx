import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface VoiceNoteRecorderProps {
  onTranscriptReady: (cleanedText: string) => void;
  noteType: string;
  disabled?: boolean;
}

export function VoiceNoteRecorder({ onTranscriptReady, noteType, disabled }: VoiceNoteRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        stream.getTracks().forEach(track => track.stop());
        await processAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast.info('Recording started...', { duration: 2000 });
    } catch (error: any) {
      console.error('Failed to start recording:', error);
      toast.error('Failed to access microphone. Please check permissions.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

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
      const { data: transcribeData, error: transcribeError } = await supabase.functions.invoke('voice-to-text', {
        body: { audio: base64Audio }
      });

      if (transcribeError || !transcribeData?.text) {
        throw new Error(transcribeError?.message || 'Transcription failed');
      }

      const rawTranscript = transcribeData.text;
      toast.info('Processing your note...', { duration: 2000 });

      // Step 2: Clean up with AI
      const { data: cleanData, error: cleanError } = await supabase.functions.invoke('clean-note-transcript', {
        body: { transcript: rawTranscript, noteType }
      });

      if (cleanError) {
        console.error('Clean transcript error:', cleanError);
        // Fall back to raw transcript if cleanup fails
        onTranscriptReady(rawTranscript);
        toast.warning('Used raw transcript (AI cleanup failed)');
      } else {
        onTranscriptReady(cleanData.cleanedNote || rawTranscript);
        toast.success('Voice note ready!');
      }

    } catch (error: any) {
      console.error('Audio processing error:', error);
      toast.error('Failed to process voice note: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isProcessing) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Processing...
      </Button>
    );
  }

  if (isRecording) {
    return (
      <Button 
        variant="destructive" 
        size="sm" 
        onClick={stopRecording}
        className="gap-2 animate-pulse"
      >
        <Square className="h-4 w-4" />
        Stop Recording
      </Button>
    );
  }

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
