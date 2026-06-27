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
import { Loader2, Send, Paperclip, Download, X, UserCircle2, ShieldCheck } from 'lucide-react';
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
  }, [threadId]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [draft]);

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
    <div className={cn('flex h-[600px] min-h-0 flex-col overflow-hidden rounded-2xl border border-amber-300/15 bg-zinc-950/95 shadow-xl shadow-black/25', className)}>
      <ScrollArea className="min-h-0 flex-1 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.07),transparent_32%),linear-gradient(180deg,rgba(24,24,27,0.96),rgba(9,9,11,0.98))] p-5 [scrollbar-color:rgba(245,158,11,0.38)_rgba(24,24,27,0.9)]" ref={scrollRef as any}>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-violet-200/80" /></div>
        ) : messages.length === 0 ? (
          <div className="mx-auto my-12 max-w-sm rounded-3xl border border-amber-300/15 bg-black/30 px-6 py-8 text-center text-sm text-muted-foreground shadow-xl shadow-black/20">
            <MessageSquare className="mx-auto mb-3 h-9 w-9 text-amber-200/60" />
            <p className="font-medium text-foreground">No messages yet</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground/80">Start the conversation below.</p>
          </div>
        ) : (
          <div className="space-y-4 pb-1">
            {messages.map(m => {
              const mine = m.sender_type === viewerSide;
              return (
                <div key={m.id} className={cn('flex w-full gap-3', mine ? 'justify-end' : 'justify-start')}>
                  {!mine && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-300/15 bg-amber-300/10 text-amber-100 shadow-sm shadow-black/20">
                      {m.sender_type === 'staff' ? <ShieldCheck className="h-3.5 w-3.5" /> : <UserCircle2 className="h-3.5 w-3.5" />}
                    </div>
                  )}
                  <div className={cn('flex min-w-0 max-w-[min(82%,42rem)] flex-col', mine ? 'items-end' : 'items-start')}>
                  <div className={cn(
                    'w-fit max-w-full rounded-2xl border px-4 py-3 text-sm leading-6 shadow-lg shadow-black/20 [overflow-wrap:anywhere] whitespace-pre-wrap break-words',
                    mine ? 'rounded-br-md border-amber-200/50 bg-gradient-to-br from-amber-200 via-amber-300 to-yellow-600 text-zinc-950' : 'rounded-bl-md border-white/10 bg-zinc-900/95 text-zinc-100'
                  )}>
                    {!mine && (
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
                        {m.sender_name || (m.sender_type === 'staff' ? 'Staff' : m.sender_type === 'client' ? 'Client' : 'Finance Partner')}
                      </div>
                    )}
                    <div className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.body}</div>
                    {m.attachment_path && m.attachment_filename && (
                      <button
                        onClick={() => downloadAttachment(m.id, m.attachment_filename!)}
                        className={cn(
                          'mt-3 flex max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-xs underline-offset-2 transition-all hover:-translate-y-0.5 hover:underline',
                          mine ? 'border-black/10 bg-black/10 text-zinc-950' : 'border-amber-300/15 bg-black/25 text-amber-100/90'
                        )}
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span className="min-w-0 truncate">{m.attachment_filename}</span>
                        <span className="opacity-70">{formatBytes(m.attachment_size_bytes)}</span>
                      </button>
                    )}
                  </div>
                  <div className={cn('mt-1.5 px-1 text-[10px] font-medium text-muted-foreground/90', mine ? 'text-right' : 'text-left')}>{formatStamp(m.created_at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <div className="shrink-0 space-y-2 border-t border-violet-300/15 bg-[linear-gradient(180deg,rgba(39,39,42,0.98),rgba(9,9,11,0.99))] p-3 shadow-[0_-22px_55px_rgba(0,0,0,0.35)]">
        {attachment && (
          <div className="flex items-center gap-2 rounded-2xl border border-violet-300/20 bg-violet-300/8 px-3 py-2 text-xs text-zinc-300 shadow-inner shadow-black/20">
            <Paperclip className="h-3.5 w-3.5" />
            <span className="truncate flex-1">{attachment.name}</span>
            <span className="text-muted-foreground">{formatBytes(attachment.size)}</span>
            <button onClick={() => { setAttachment(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
              className="rounded-full text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        <div className="relative flex items-end gap-2 overflow-hidden rounded-3xl border border-violet-300/20 bg-gradient-to-br from-zinc-900/95 via-black/60 to-zinc-950/95 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_45px_rgba(0,0,0,0.28)] transition-colors focus-within:border-amber-300/55 focus-within:ring-2 focus-within:ring-amber-300/25">
          <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/55 to-transparent" />
          <Textarea
            ref={textareaRef}
            placeholder="Write a message..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
            }}
            disabled={sending}
            className="max-h-40 min-h-[76px] flex-1 resize-none overflow-y-auto rounded-2xl border border-white/5 bg-black/20 px-3.5 py-3 text-sm leading-6 text-foreground shadow-inner shadow-black/20 placeholder:text-zinc-400 focus-visible:border-amber-300/30 focus-visible:ring-0 disabled:cursor-not-allowed disabled:bg-zinc-900/70 disabled:text-zinc-400 disabled:placeholder:text-zinc-500"
            maxLength={5000}
          />
          <div className="flex flex-col gap-1.5">
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleAttach} />
            <Button type="button" variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} disabled={sending} className="h-10 w-10 rounded-2xl border-violet-300/20 bg-violet-300/10 text-violet-100 shadow-sm shadow-black/20 transition-all hover:-translate-y-0.5 hover:border-amber-300/35 hover:bg-amber-300/10 hover:text-amber-100 focus-visible:ring-amber-300/40 disabled:translate-y-0 disabled:border-white/10 disabled:bg-zinc-900 disabled:text-zinc-500">
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" onClick={send} disabled={sending || (!draft.trim() && !attachment)} className="h-10 w-10 rounded-2xl bg-gradient-to-br from-amber-200 via-amber-300 to-yellow-500 text-zinc-950 shadow-[0_14px_32px_rgba(245,158,11,0.28)] transition-all hover:-translate-y-0.5 hover:from-amber-100 hover:to-yellow-400 focus-visible:ring-2 focus-visible:ring-amber-200 disabled:translate-y-0 disabled:bg-none disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none">
              {sending || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/80">Press ⌘/Ctrl+Enter to send · Max 25 MB attachments</p>
      </div>
    </div>
  );
}
