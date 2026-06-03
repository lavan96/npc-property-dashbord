/**
 * Batch 9 — Scan to Upload.
 * Opens the device camera (capture="environment") to capture one or more
 * pages, then uploads each as an attachment against a document requirement
 * instance via the existing finance-portal-document-requirements edge fn.
 * Falls back gracefully on desktop (file picker, multi-select).
 */
import { useRef, useState } from 'react';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Button } from '@/components/ui/button';
import { Camera, Loader2, Upload, X, FileImage } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  purchaseFileId: string;
  instanceId?: string | null;
  label?: string;
  onUploaded?: () => void;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function ScanToUploadButton({
  purchaseFileId,
  instanceId = null,
  label = 'Scan / upload',
  onUploaded,
}: Props) {
  const { invokeFinanceFunction } = useFinancePortalAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    if (list.length) setFiles((prev) => [...prev, ...list]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const upload = async () => {
    if (!files.length) {
      inputRef.current?.click();
      return;
    }
    setBusy(true);
    try {
      for (const f of files) {
        const dataUrl = await fileToBase64(f);
        const { error } = await invokeFinanceFunction(
          'finance-portal-document-requirements',
          {
            operation: 'upload_for_instance',
            purchase_file_id: purchaseFileId,
            instance_id: instanceId,
            filename: f.name,
            mime_type: f.type || 'image/jpeg',
            size_bytes: f.size,
            data_base64: dataUrl,
          },
        );
        if (error) throw error;
      }
      toast.success(`Uploaded ${files.length} page${files.length > 1 ? 's' : ''}`);
      setFiles([]);
      onUploaded?.();
    } catch (e: any) {
      toast.error(e?.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        capture="environment"
        onChange={onPick}
        className="hidden"
      />
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          className="flex-1"
        >
          <Camera className="h-4 w-4 mr-1.5" /> {label}
        </Button>
        {files.length > 0 && (
          <Button size="sm" onClick={upload} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
            Send {files.length}
          </Button>
        )}
      </div>
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1 text-xs"
            >
              <span className="flex items-center gap-1 truncate">
                <FileImage className="h-3 w-3 text-muted-foreground" />
                <span className="truncate">{f.name}</span>
              </span>
              <button
                onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
