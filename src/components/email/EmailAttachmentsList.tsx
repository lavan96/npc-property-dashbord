import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Paperclip,
  Eye,
  Download,
  FileIcon,
  Image as ImageIcon,
  FileText,
  X,
  Loader2,
} from 'lucide-react';

export interface EmailAttachment {
  name: string;
  contentType: string;
  size: number;
  storageUrl: string;
}

interface EmailAttachmentsListProps {
  attachments: EmailAttachment[];
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadFile(url: string, name: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function AttachmentIcon({ contentType }: { contentType: string }) {
  if (contentType?.startsWith('image/')) return <ImageIcon className="h-4 w-4 text-primary" />;
  if (contentType === 'application/pdf') return <FileText className="h-4 w-4 text-primary" />;
  return <FileIcon className="h-4 w-4 text-primary" />;
}

function ImageThumb({
  attachment,
  onOpen,
}: {
  attachment: EmailAttachment;
  onOpen: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative h-32 w-32 overflow-hidden rounded-2xl border border-border/70 bg-muted/30 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
      title={`Preview ${attachment.name}`}
    >
      {!loaded && !errored && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      {!errored ? (
        <img
          src={attachment.storageUrl}
          alt={attachment.name}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          className={`h-full w-full object-cover transition-opacity ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ImageIcon className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 truncate bg-background/85 px-2 py-1 text-[10px] font-medium text-foreground backdrop-blur-sm">
        {attachment.name}
      </div>
    </button>
  );
}

export default function EmailAttachmentsList({ attachments }: EmailAttachmentsListProps) {
  const [preview, setPreview] = useState<EmailAttachment | null>(null);

  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter((a) => a.contentType?.startsWith('image/'));
  const others = attachments.filter((a) => !a.contentType?.startsWith('image/'));

  const isPreviewable = (a: EmailAttachment) =>
    a.contentType?.startsWith('image/') || a.contentType === 'application/pdf';

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-[linear-gradient(135deg,hsl(var(--card)/0.96),hsl(var(--background)/0.88))] shadow-[0_18px_48px_hsl(var(--background)/0.16)]">
      <div className="flex items-center gap-2 border-b border-border/55 bg-muted/20 px-5 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
          <Paperclip className="h-4 w-4 text-primary" />
        </span>
        <span className="text-sm font-semibold text-foreground">Attachments ({attachments.length})</span>
      </div>

      <div className="space-y-5 p-5">
        {images.length > 0 && (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Images
            </p>
            <div className="flex flex-wrap gap-3">
              {images.map((att, i) => (
                <ImageThumb
                  key={`img-${i}`}
                  attachment={att}
                  onOpen={() => setPreview(att)}
                />
              ))}
            </div>
          </div>
        )}

        {others.length > 0 && (
          <div className="space-y-2">
            {others.map((attachment, index) => (
              <div
                key={`file-${index}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border/65 bg-muted/20 p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-muted/35 hover:shadow-md"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="rounded-xl border border-primary/15 bg-primary/10 p-2.5 shadow-inner">
                    <AttachmentIcon contentType={attachment.contentType} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground" title={attachment.name}>{attachment.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatSize(attachment.size)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {isPreviewable(attachment) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary"
                      onClick={() => setPreview(attachment)}
                      title="Preview"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary"
                    onClick={() => downloadFile(attachment.storageUrl, attachment.name)}
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-5xl p-0">
          <DialogHeader className="border-b px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="truncate text-sm">{preview?.name}</DialogTitle>
              <div className="flex items-center gap-1">
                {preview && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => downloadFile(preview.storageUrl, preview.name)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPreview(null)}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="h-[80vh] w-full bg-muted/30">
            {preview?.contentType?.startsWith('image/') ? (
              <div className="flex h-full w-full items-center justify-center overflow-auto p-4">
                <img
                  src={preview.storageUrl}
                  alt={preview.name}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : preview?.contentType === 'application/pdf' ? (
              <iframe
                key={preview.storageUrl}
                src={preview.storageUrl}
                title={preview.name}
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Preview not available for this file type.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
