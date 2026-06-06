/**
 * Batch 9 — Quick voice memo recorder (mobile-friendly).
 * Uses MediaRecorder → POSTs base64 to voice-to-text → persists as ai_voice_memos.
 */
import { useRef, useState } from 'react';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Button } from '@/components/ui/button';
import { Mic, Square, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  purchaseFileId?: string | null;
  clientId?: string | null;
  onSaved?: () => void;
}

export function VoiceMemoButton({ purchaseFileId = null, clientId = null, onSaved }: Props) {
  const { invokeFinanceFunction } = useFinancePortalAuth();
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTime = useRef<number>(0);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const duration = Math.round((Date.now() - startTime.current) / 1000);
        await transcribeAndSave(blob, duration);
      };
      mr.start();
      mediaRef.current = mr;
      startTime.current = Date.now();
      setRecording(true);
    } catch {
      toast.error('Microphone access denied');
    }
  };

  const stop = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  const transcribeAndSave = async (blob: Blob, duration: number) => {
    setBusy(true);
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
      // Transcribe via the finance-portal-authenticated path (voice-to-text is
      // stateless transcription; the finance session is forwarded by the hook).
      const { data: transcribeData, error: transcribeError } = await invokeFinanceFunction('voice-to-text', {
        audio: b64.split(',')[1], mimeType: 'audio/webm', fileName: 'memo.webm',
      });
      if (transcribeError) throw new Error(transcribeError.message);
      const transcript = (transcribeData?.text || transcribeData?.transcript || '').trim();
      if (!transcript) throw new Error('Could not transcribe audio — please try again');

      // Persist through the service-role finance function (ai_voice_memos RLS
      // blocks direct browser inserts).
      const { error: saveError } = await invokeFinanceFunction('finance-portal-batch9-10', {
        operation: 'voice_memo_save',
        purchase_file_id: purchaseFileId,
        client_id: clientId,
        transcript,
        duration_seconds: duration,
        model: 'whisper-1',
      });
      if (saveError) throw new Error(saveError.message);
      toast.success('Voice memo saved');
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || 'Voice memo failed');
    } finally {
      setBusy(false);
    }
  };

  if (busy) {
    return (
      <Button size="sm" variant="outline" disabled className="w-full">
        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Transcribing…
      </Button>
    );
  }
  return recording ? (
    <Button size="sm" variant="destructive" onClick={stop} className="w-full">
      <Square className="h-4 w-4 mr-1.5" /> Stop & save
    </Button>
  ) : (
    <Button size="sm" variant="outline" onClick={start} className="w-full">
      <Mic className="h-4 w-4 mr-1.5" /> Voice memo
    </Button>
  );
}
