import { useState, useRef, useEffect } from 'react';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { usePortalMessagesData, usePortalUpdateData } from '@/hooks/usePortalData';
import { smartCapitalize } from '@/lib/nameUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageSquare, Send, Loader2, User, Headphones,
  MessageCircle
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

export default function PortalMessages() {
  const { user } = usePortalAuth();
  const { data, isLoading } = usePortalMessagesData();
  const updateMutation = usePortalUpdateData();
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const messages = data?.messages || [];
  const displayName = smartCapitalize(user?.name);

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
      await updateMutation.mutateAsync({
        operation: 'insert',
        table: 'client_portal_messages',
        data: {
          sender_type: 'client',
          sender_name: displayName || user?.email || 'Client',
          message: text,
        },
      });
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
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" />
          Messages
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Communicate directly with your advisor
        </p>
      </div>

      <Card className="shadow-sm overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}>
        {/* Messages Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="p-4 rounded-full bg-primary/5 mb-4">
                <MessageCircle className="h-10 w-10 text-primary/40" />
              </div>
              <p className="text-muted-foreground font-medium">Start a conversation</p>
              <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
                Send a message to your advisor. They'll respond as soon as possible.
              </p>
            </div>
          ) : (
            messages.map((msg: any) => {
              const isClient = msg.sender_type === 'client';
              return (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2 ${isClient ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className={`text-xs font-semibold ${
                      isClient ? 'bg-primary/10 text-primary' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {isClient ? getInitials(displayName) : (
                        <Headphones className="h-3.5 w-3.5" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className={`max-w-[75%] ${isClient ? 'items-end' : 'items-start'}`}>
                    <div className={`px-4 py-2.5 rounded-2xl text-sm ${
                      isClient
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-muted text-foreground rounded-bl-md'
                    }`}>
                      {msg.message}
                    </div>
                    <p className={`text-[10px] text-muted-foreground/50 mt-1 ${isClient ? 'text-right' : 'text-left'}`}>
                      {formatMessageDate(new Date(msg.created_at))}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-border bg-card p-4">
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
