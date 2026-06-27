/**
 * Shared Messages thread UI component used in both partner-side (Finance Portal)
 * and internal staff-side (admin) contexts.
 *
 * The parent supplies the invoke function so this component is auth-agnostic:
 *  - Partner side: useFinancePortalAuth().invokeFinanceFunction
 *  - Staff side:   invokeSecureFunction wrapper
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Send, Paperclip, Download, X } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface ThreadMessage {
  id: string;
  thread_id: string;
  sender_type: 'partner' | 'staff' | 'client';
  sender_name: string | null;
  body: string;
  attachment_path: string | null;
  attachment_filename: string | null;
  attachment_mime: string | null;
  attachment_size_bytes: number | null;
  created_at: string;
}

export type InvokeFn = (fn: string, body: any) => Promise<{ data: any; error: any }>;

interface Props {
  threadId: string;
  /** 'partner' = current user is a finance partner; 'staff' = current user is internal staff */
  viewerSide: 'partner' | 'staff';
  invoke: InvokeFn;
  onMessageSent?: () => void;
  /** Polling interval in ms, default 8s */
  pollMs?: number;
  className?: string;
}

const formatStamp = (iso: string) => {
  const d = new Date(iso);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`;
  return format(d, 'd MMM, h:mm a');
};

const formatBytes = (n: number | null) => {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export function FinanceMessagesThread({ threadId, viewerSide, invoke, onMessageSent, pollMs = 8000, className }: Props) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  const load = async (markRead = false) => {
    const { data, error } = await invoke('finance-portal-messages', {
      operation: 'list_messages',
      thread_id: threadId,
    });
    if (error) {
      console.error('[FinanceMessagesThread] load error', error);
      setLoading(false);
      return;
    }
    const list = (data?.messages || []) as ThreadMessage[];
    setMessages(list);
    setLoading(false);
    if (markRead) {
      invoke('finance-portal-messages', { operation: 'mark_thread_read', thread_id: threadId }).catch(() => {});
    }
  };

  useEffect(() => {
    setLoading(true);
    load(true);
    const id = setInterval(() => load(true), pollMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length;
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 50);
    }
  }, [messages.length]);

  const handleAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) {
      toast.error('File too large (max 25 MB)');
      return;
    }
    setAttachment(f);
  };

  const send = async () => {
    const trimmed = draft.trim();
    if (!trimmed && !attachment) return;
    setSending(true);
    try {
      let attachmentMeta: any = null;
      if (attachment) {
        setUploading(true);
        const { data: signed, error: sErr } = await invoke('finance-portal-messages', {
          operation: 'upload_attachment_url',
          thread_id: threadId,
          filename: attachment.name,
          mime: attachment.type,
          size: attachment.size,
        });
        if (sErr || !signed?.signedUrl) throw new Error(sErr?.message || 'Upload URL failed');

        const putRes = await fetch(signed.signedUrl, {
          method: 'PUT',
          body: attachment,
          headers: { 'content-type': attachment.type || 'application/octet-stream' },
        });
        if (!putRes.ok) throw new Error('Upload failed');
        attachmentMeta = {
          path: signed.path,
          filename: attachment.name,
          mime: attachment.type,
          size: attachment.size,
        };
        setUploading(false);
      }

      const { error } = await invoke('finance-portal-messages', {
        operation: 'send_message',
        thread_id: threadId,
        body: trimmed,
        attachment: attachmentMeta,
      });
      if (error) throw new Error(error.message);

      setDraft('');
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onMessageSent?.();
      await load(false);
    } catch (e: any) {
      toast.error(e.message || 'Failed to send');
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  const downloadAttachment = async (messageId: string, filename: string) => {
    try {
      const { data, error } = await invoke('finance-portal-messages', {
        operation: 'get_attachment_url',
        message_id: messageId,
      });
      if (error || !data?.url) throw new Error(error?.message || 'Could not get download URL');
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      toast.error(e.message || 'Download failed');
    }
  };

  return (
    <div className={cn('flex flex-col h-[600px] min-h-0 border border-border rounded-lg bg-card overflow-hidden', className)}>
      <ScrollArea className="flex-1 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.05),transparent_34%)] p-4 [scrollbar-color:rgba(16,185,129,0.32)_rgba(24,24,27,0.9)]" ref={scrollRef as any}>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-emerald-200/80" /></div>
        ) : messages.length === 0 ? (
          <div className="mx-auto my-12 max-w-sm rounded-3xl border border-white/10 bg-black/25 px-6 py-8 text-center text-sm text-muted-foreground shadow-xl shadow-black/20">
            No messages yet. Start the conversation below.
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map(m => {
              const mine = m.sender_type === viewerSide;
              return (
                <div key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
                  <div className={cn(
                    'max-w-[82%] rounded-2xl border px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap break-words shadow-lg shadow-black/15',
                    mine ? 'border-emerald-300/30 bg-gradient-to-br from-emerald-300 to-teal-600 text-black' : 'border-white/10 bg-zinc-900/95 text-foreground'
                  )}>
                    {!mine && (
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
                        {m.sender_name || (m.sender_type === 'staff' ? 'Staff' : m.sender_type === 'client' ? 'Client' : 'Finance Partner')}
                      </div>
                    )}
                    <div>{m.body}</div>
                    {m.attachment_path && m.attachment_filename && (
                      <button
                        onClick={() => downloadAttachment(m.id, m.attachment_filename!)}
                        className={cn(
                          'mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/15 px-2.5 py-2 text-xs underline-offset-2 hover:underline',
                          mine ? 'text-primary-foreground/90' : 'text-foreground/80'
                        )}
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>{m.attachment_filename}</span>
                        <span className="opacity-70">{formatBytes(m.attachment_size_bytes)}</span>
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 px-1 text-[10px] text-muted-foreground/85">{formatStamp(m.created_at)}</div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <div className="border-t border-border p-3 space-y-2 bg-card">
        {attachment && (
          <div className="flex items-center gap-2 text-xs bg-muted rounded px-2 py-1.5">
            <Paperclip className="h-3.5 w-3.5" />
            <span className="truncate flex-1">{attachment.name}</span>
            <span className="text-muted-foreground">{formatBytes(attachment.size)}</span>
            <button onClick={() => { setAttachment(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
              className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <Textarea
            placeholder="Write a message..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
            }}
            disabled={sending}
            className="min-h-[60px] resize-none flex-1"
            maxLength={5000}
          />
          <div className="flex flex-col gap-1.5">
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleAttach} />
            <Button type="button" variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} disabled={sending}>
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" onClick={send} disabled={sending || (!draft.trim() && !attachment)}>
              {sending || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">Press ⌘/Ctrl+Enter to send · Max 25 MB attachments</p>
      </div>
    </div>
  );
}
