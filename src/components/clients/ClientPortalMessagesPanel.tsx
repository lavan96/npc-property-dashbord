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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Send, Headphones, User as UserIcon, MessageCircle, Lock, ShieldCheck } from 'lucide-react';
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
  visibility_scope?: string | null;
  thread_type?: string | null;
  allocation_status?: string | null;
  finance_allocated?: boolean | null;
  notification_status?: Record<string, string> | null;
  created_at: string;
}

type MessageRoute = 'client_only' | 'finance_only' | 'client_finance' | 'internal';
type FinanceAllocationStatus = 'finance_action_required' | 'finance_review_required' | 'finance_input_required' | 'allocate_to_finance';

const ROUTING_PRESETS: { value: MessageRoute; label: string; description: string }[] = [
  { value: 'client_only', label: 'Send to Client only', description: 'Client Portal + Command Centre only. Finance is blocked.' },
  { value: 'finance_only', label: 'Send to Finance only', description: 'Private Command Centre ↔ Finance thread. Client is blocked.' },
  { value: 'client_finance', label: 'Send to Client + allocate Finance', description: 'Client sees the advisory message; Finance gets access only to the allocated thread.' },
  { value: 'internal', label: 'Internal note', description: 'Command Centre staff-only note. Client and Finance are blocked.' },
];

const FINANCE_ALLOCATION_LABELS: Record<FinanceAllocationStatus, string> = {
  finance_action_required: 'Finance Action Required',
  finance_review_required: 'Finance Review Required',
  finance_input_required: 'Finance Input Required',
  allocate_to_finance: 'Allocate to Finance',
};

const formatStamp = (iso: string) => {
  const d = new Date(iso);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`;
  return format(d, 'd MMM, h:mm a');
};


const MESSAGE_SCOPE_LABELS: Record<string, string> = {
  command_client_private: 'Client only',
  command_client_with_finance_allocated: 'Finance allocated',
  internal_command_only: 'Internal',
};

const notificationSummary = (status?: Record<string, string> | null) => {
  if (!status) return null;
  if (Object.values(status).includes('failed')) return 'Notification failed';
  if (status.finance_portal === 'no_assigned_finance_user') return 'No finance assignment';
  return null;
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
  const [route, setRoute] = useState<MessageRoute>('client_only');
  const [financeAllocationStatus, setFinanceAllocationStatus] = useState<FinanceAllocationStatus>('finance_action_required');
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
    if (!trimmed || sending) return;
    setSending(true);
    try {
      if (route === 'finance_only') {
        const { data: thread, error: tErr } = await invokeSecureFunction('finance-portal-messages', {
          operation: 'get_or_create_thread',
          client_id: clientId,
          visibility_scope: 'command_finance_private',
          thread_type: 'command_finance',
          allocation_status: 'none',
          finance_allocated: false,
        });
        if (tErr || !thread?.thread) throw new Error(tErr?.message || 'No finance partner assigned');
        const { error } = await invokeSecureFunction('finance-portal-messages', {
          operation: 'send_message',
          thread_id: thread.thread.id,
          body: trimmed,
          visibility_scope: 'command_finance_private',
          thread_type: 'command_finance',
          allocation_status: 'none',
        });
        if (error) throw new Error(error.message || 'Send failed');
        toast.success('Sent to Finance Portal only');
      } else {
        const financeAllocated = route === 'client_finance';
        const { error } = await invokeSecureFunction('staff-client-portal-messages', {
          operation: 'send_reply',
          client_id: clientId,
          message: trimmed,
          is_internal: route === 'internal',
          visibility_scope: financeAllocated ? 'command_client_with_finance_allocated' : undefined,
          allocation_status: financeAllocated ? financeAllocationStatus : undefined,
        });
        if (error) throw new Error(error.message || 'Send failed');
        toast.success(
          route === 'client_finance'
            ? 'Sent to Client Portal and allocated to Finance'
            : route === 'internal'
              ? 'Internal note saved'
              : 'Sent to Client Portal only',
        );
      }
      setDraft('');
      await load(false);
    } catch (e: any) {
      console.error('[ClientPortalMessagesPanel] send failed', e);
      toast.error(e.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const selectedPreset = ROUTING_PRESETS.find((preset) => preset.value === route) || ROUTING_PRESETS[0];
  const financeAllocatedToClient = route === 'client_finance';
  const displayName = clientName || 'Client Portal';


  return (
    <div className="flex h-[600px] min-h-0 flex-col overflow-hidden rounded-2xl border border-amber-300/15 bg-zinc-950/90 shadow-xl shadow-black/25">
      <div className="border-b border-amber-300/10 bg-gradient-to-r from-amber-300/10 via-white/[0.03] to-transparent px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="h-10 w-10 shrink-0 border border-amber-300/25 bg-amber-300/10">
              <AvatarFallback className="bg-amber-300/10 text-xs font-semibold text-amber-100">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
                <Badge variant="outline" className="shrink-0 rounded-full border-amber-300/25 bg-amber-300/10 px-2 text-[10px] text-amber-100">
                  Client Portal
                </Badge>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                <MessageCircle className="h-3.5 w-3.5 text-amber-200/80" />
                <span>{messages.length} message{messages.length === 1 ? '' : 's'}</span>
              </div>
            </div>
          </div>
          <Badge variant="outline" className="rounded-full border-white/10 bg-black/25 px-2.5 text-[10px] text-muted-foreground">
            Command Centre visible
          </Badge>
        </div>
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
                      {(m.is_internal || m.visibility_scope) && (
                        <Badge variant="outline" className={cn(
                          'text-[9px] px-1 py-0 h-3.5 gap-0.5',
                          m.is_internal || m.visibility_scope === 'internal_command_only'
                            ? 'border-amber-500/40 text-amber-600'
                            : m.visibility_scope === 'command_client_with_finance_allocated'
                              ? 'border-primary/30 text-primary'
                              : 'border-border text-muted-foreground',
                        )}>
                          {(m.is_internal || m.visibility_scope === 'internal_command_only') && <Lock className="h-2 w-2" />}
                          {MESSAGE_SCOPE_LABELS[m.visibility_scope || ''] || 'Governed'}
                        </Badge>
                      )}
                      {notificationSummary(m.notification_status) && (
                        <Badge variant="outline" className="h-3.5 border-destructive/40 px-1 py-0 text-[9px] text-destructive">
                          {notificationSummary(m.notification_status)}
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
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">Route:</span>
          {ROUTING_PRESETS.map(preset => {
            const active = preset.value === route;
            return (
              <Button
                key={preset.value}
                type="button"
                size="sm"
                variant={active ? 'default' : 'outline'}
                className="h-auto min-h-7 px-2.5 py-1 text-xs"
                onClick={() => setRoute(preset.value)}
                title={preset.description}
              >
                {preset.label}
              </Button>
            );
          })}
        </div>
        <div className="mb-2 flex items-start gap-2 rounded-md border border-border bg-muted/30 p-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{selectedPreset.description}</span>
        </div>

        {financeAllocatedToClient && (
          <div className="mb-2 rounded-md border border-primary/20 bg-primary/5 p-2">
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Finance action allocation</label>
            <Select value={financeAllocationStatus} onValueChange={(value) => setFinanceAllocationStatus(value as FinanceAllocationStatus)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Choose finance action" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FINANCE_ALLOCATION_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[10px] text-muted-foreground">Finance receives access only to this allocated client-facing thread.</p>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <Textarea
            placeholder={
              route === 'client_finance' ? 'Message the client and allocate this thread to Finance...'
              : route === 'internal' ? 'Add an internal staff-only note...'
              : route === 'finance_only' ? 'Message the finance partner privately...'
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
        <p className="text-[10px] text-muted-foreground mt-1.5">
          Press ⌘/Ctrl+Enter to send · Command Centre controls route, visibility, allocation and governance logging.
        </p>
      </div>
    </div>
  );
}
