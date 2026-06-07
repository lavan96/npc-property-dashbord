/**
 * Staff-side panel for reading and replying to CLIENT PORTAL messages
 * for a specific client. Mounts inside the client profile modal.
 *
 * Uses the `staff-client-portal-messages` edge function and subscribes to
 * `client_portal_messages` realtime channel for live updates.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, Headphones, User as UserIcon, MessageCircle, Lock, Users, Building2 } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ClientPortalMessage {
  id: string;
  client_id: string;
  sender_type: 'client' | 'advisor';
  sender_name: string | null;
  message: string;
  is_read: boolean;
  is_internal?: boolean;
  created_at: string;
}

type MessageTarget = 'client' | 'internal' | 'finance';

const TARGETS: { value: MessageTarget; label: string; icon: typeof Users; hint: string }[] = [
  { value: 'client', label: 'Client', icon: Users, hint: 'Sends to the client portal — the client will see this.' },
  { value: 'internal', label: 'Internal', icon: Lock, hint: 'Staff-only note. Not shown to the client or finance partner.' },
  { value: 'finance', label: 'Finance', icon: Building2, hint: 'Sends to the assigned finance partner (see the Finance Messages tab).' },
];

const formatStamp = (iso: string) => {
  const d = new Date(iso);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`;
  return format(d, 'd MMM, h:mm a');
};

const getInitials = (name?: string | null) => {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
};

interface Props {
  clientId: string;
  clientName?: string | null;
}

export function ClientPortalMessagesPanel({ clientId, clientName }: Props) {
  const [messages, setMessages] = useState<ClientPortalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [targets, setTargets] = useState<Set<MessageTarget>>(new Set(['client']));
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  const load = useCallback(async (markRead = false) => {
    const { data, error } = await invokeSecureFunction('staff-client-portal-messages', {
      operation: 'list_messages',
      client_id: clientId,
    });
    if (error) {
      console.error('[ClientPortalMessagesPanel] load error', error);
      setLoading(false);
      return;
    }
    setMessages((data?.messages || []) as ClientPortalMessage[]);
    setLoading(false);
    if (markRead) {
      invokeSecureFunction('staff-client-portal-messages', {
        operation: 'mark_thread_read',
        client_id: clientId,
      }).catch(() => {});
    }
  }, [clientId]);

  useEffect(() => {
    setLoading(true);
    load(true);

    // Realtime subscription (drops 30s polling pattern in favor of push)
    const channel = supabase
      .channel(`client-portal-messages-${clientId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'client_portal_messages', filter: `client_id=eq.${clientId}` },
        () => load(true),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, load]);

  useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length;
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 50);
    }
  }, [messages.length]);

  const send = async () => {
    const trimmed = draft.trim();
    if (!trimmed || sending || targets.size === 0) return;
    setSending(true);
    const sent: string[] = [];
    const failed: string[] = [];
    try {
      for (const t of targets) {
        try {
          if (t === 'finance') {
            const { data: thread, error: tErr } = await invokeSecureFunction('finance-portal-messages', {
              operation: 'get_or_create_thread',
              client_id: clientId,
            });
            if (tErr || !thread?.thread) throw new Error(tErr?.message || 'No finance partner assigned');
            const { error } = await invokeSecureFunction('finance-portal-messages', {
              operation: 'send_message',
              thread_id: thread.thread.id,
              body: trimmed,
            });
            if (error) throw new Error(error.message || 'Send failed');
          } else {
            const { error } = await invokeSecureFunction('staff-client-portal-messages', {
              operation: 'send_reply',
              client_id: clientId,
              message: trimmed,
              is_internal: t === 'internal',
            });
            if (error) throw new Error(error.message || 'Send failed');
          }
          sent.push(t);
        } catch (e: any) {
          console.error(`[Composer] ${t} send failed`, e);
          failed.push(`${t}: ${e.message}`);
        }
      }
      if (sent.length) {
        toast.success(`Sent to ${sent.join(', ')}`);
        setDraft('');
        await load(false);
      }
      if (failed.length) toast.error(`Failed → ${failed.join(' · ')}`);
    } finally {
      setSending(false);
    }
  };

  const toggleTarget = (v: MessageTarget) => {
    setTargets(prev => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      if (next.size === 0) next.add(v); // never allow empty
      return next;
    });
  };


  return (
    <div className="flex flex-col h-[600px] min-h-0 border border-border rounded-lg bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Messages</span>
        </div>
        <span className="text-xs text-muted-foreground">{messages.length} message{messages.length === 1 ? '' : 's'}</span>
      </div>

      <ScrollArea className="flex-1 p-4" ref={scrollRef as any}>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-12">
            No messages yet. Send a message to start the conversation.
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map(m => {
              const mine = m.sender_type === 'advisor';
              return (
                <div key={m.id} className={cn('flex items-end gap-2', mine ? 'flex-row-reverse' : 'flex-row')}>
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className={cn(
                      'text-[10px] font-semibold',
                      mine ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground',
                    )}>
                      {mine ? <Headphones className="h-3.5 w-3.5" /> : getInitials(m.sender_name || clientName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className={cn('max-w-[78%] flex flex-col', mine ? 'items-end' : 'items-start')}>
                    <div className={cn(
                      'rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words',
                      m.is_internal
                        ? 'bg-amber-500/10 text-foreground border border-dashed border-amber-500/40 rounded-br-md'
                        : mine
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-muted text-foreground rounded-bl-md',
                    )}>
                      {!mine && (
                        <div className="text-[10px] uppercase opacity-70 mb-1 flex items-center gap-1">
                          <UserIcon className="h-2.5 w-2.5" />
                          {m.sender_name || clientName || 'Client'}
                        </div>
                      )}
                      {m.message}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1 px-1 flex items-center gap-1">
                      {m.is_internal && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 gap-0.5 border-amber-500/40 text-amber-600">
                          <Lock className="h-2 w-2" /> Internal
                        </Badge>
                      )}
                      {formatStamp(m.created_at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <div className="border-t border-border p-3 bg-card">
        <div className="flex items-center gap-1 mb-2">
          {TARGETS.map(t => {
            const Icon = t.icon;
            const active = t.value === target;
            return (
              <Button
                key={t.value}
                type="button"
                size="sm"
                variant={active ? 'default' : 'outline'}
                className="h-7 px-2.5 text-xs"
                onClick={() => setTarget(t.value)}
              >
                <Icon className="h-3 w-3 mr-1" /> {t.label}
              </Button>
            );
          })}
        </div>
        <div className="flex gap-2 items-end">
          <Textarea
            placeholder={
              target === 'internal' ? 'Add an internal staff-only note...'
              : target === 'finance' ? 'Message the finance partner...'
              : 'Reply to the client...'
            }
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                send();
              }
            }}
            disabled={sending}
            className="min-h-[60px] resize-none flex-1"
            maxLength={5000}
          />
          <Button type="button" size="icon" onClick={send} disabled={sending || !draft.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">Press ⌘/Ctrl+Enter to send · {activeTarget.hint}</p>
      </div>
    </div>
  );
}
