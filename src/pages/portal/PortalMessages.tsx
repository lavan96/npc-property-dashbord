import { useState, useRef, useEffect, useMemo } from 'react';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { usePortalUnifiedInbox, usePortalUpdateData } from '@/hooks/usePortalData';
import { smartCapitalize } from '@/lib/nameUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageSquare, Send, Loader2, Headphones,
  MessageCircle, Phone, Mail
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { toast } from 'sonner';

function formatMessageDate(date: Date): string {
  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return 'Yesterday ' + format(date, 'h:mm a');
  return format(date, 'dd MMM yyyy, h:mm a');
}

function getInitials(name?: string): string {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

const CHANNEL_LABELS: Record<string, string> = {
  portal: 'Portal', sms: 'SMS', whatsapp: 'WhatsApp', email: 'Email',
};

function channelBadge(channel: string) {
  const label = CHANNEL_LABELS[channel] || channel;
  if (channel === 'portal') return null;
  const Icon = channel === 'email' ? Mail : channel === 'whatsapp' ? MessageCircle : Phone;
  return (
    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 gap-1">
      <Icon className="h-2.5 w-2.5" /> {label}
    </Badge>
  );
}

export default function PortalMessages() {
  const { user } = usePortalAuth();
  const { data, isLoading } = usePortalUnifiedInbox();
  const updateMutation = usePortalUpdateData();
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [localMessages, setLocalMessages] = useState<any[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayName = smartCapitalize(user?.name);
  const serverMessages = data?.messages || [];

  useEffect(() => {
    if (localMessages.length === 0) return;
    const serverIds = new Set(serverMessages.map((msg: any) => msg.id));
    setLocalMessages((current) => {
      const next = current.filter((msg) => !serverIds.has(msg.id));
      return next.length === current.length ? current : next;
    });
  }, [serverMessages, localMessages.length]);

  // Unified inbox returns newest-first; render oldest-first as a chat timeline.
  const messages = useMemo(() => {
    const byId = new Map<string, any>();
    for (const msg of [...serverMessages, ...localMessages]) byId.set(msg.id, msg);
    return Array.from(byId.values())
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [serverMessages, localMessages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text || sending) return;

    setSending(true);
    try {
      const response = await updateMutation.mutateAsync({
        operation: 'insert',
        table: 'client_portal_messages',
        data: {
          sender_type: 'client',
          sender_name: displayName || user?.email || 'Client',
          message: text,
        },
      });
      const saved = response?.data;
      if (saved?.id) {
        setLocalMessages((current) => [
          ...current,
          {
            id: `portal:${saved.id}`,
            kind: 'portal',
            channel: 'portal',
            direction: 'outbound',
            sender_name: saved.sender_name,
            body: saved.message || text,
            subject: null,
            created_at: saved.created_at || new Date().toISOString(),
            is_read: false,
          },
        ]);
      }
      setNewMessage('');
      inputRef.current?.focus();
    } catch (err: any) {
      toast.error('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading messages...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="client-portal-page-header">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <MessageSquare className="h-6 w-6 text-primary" />
          Messages
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All your messages — portal, SMS, WhatsApp and email — in one place
        </p>
      </div>

      <Card className="client-portal-soft-panel flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}>
        {/* Messages Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="mb-4 rounded-full border border-primary/10 bg-primary/5 p-4 shadow-lg shadow-primary/5">
                <MessageCircle className="h-10 w-10 text-primary/40" />
              </div>
              <p className="text-muted-foreground font-medium">Start a conversation</p>
              <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
                Send a message to your advisor. They'll respond as soon as possible.
              </p>
            </div>
          ) : (
            messages.map((msg: any) => {
              const isClient = msg.direction === 'outbound';
              return (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2 ${isClient ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className={`text-xs font-semibold ${
                      isClient ? 'bg-primary/10 text-primary' : 'bg-card text-primary border border-primary/10'
                    }`}>
                      {isClient ? getInitials(displayName) : (
                        <Headphones className="h-3.5 w-3.5" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className={`max-w-[75%] flex flex-col ${isClient ? 'items-end' : 'items-start'}`}>
                    <div className={`px-4 py-2.5 rounded-2xl text-sm ${
                      isClient
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'border border-border/60 bg-card/90 text-foreground rounded-bl-md shadow-sm shadow-primary/5'
                    }`}>
                      {msg.subject && <p className="font-semibold mb-1">{msg.subject}</p>}
                      <p className="whitespace-pre-wrap">{msg.body}</p>
                    </div>
                    <div className={`flex items-center gap-1.5 mt-1 ${isClient ? 'flex-row-reverse' : 'flex-row'}`}>
                      <p className="text-[10px] text-muted-foreground/50">
                        {formatMessageDate(new Date(msg.created_at))}
                      </p>
                      {channelBadge(msg.channel)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-border/60 bg-card/90 p-4 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="flex-1 border-border/60"
              disabled={sending}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!newMessage.trim() || sending}
              className="shrink-0 h-10 w-10 rounded-xl"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/50 mt-2 text-center">
            Messages are encrypted and only visible to you and your advisor
          </p>
        </div>
      </Card>
    </div>
  );
}
