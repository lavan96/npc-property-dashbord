import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  MessageSquare,
  Search,
  Loader2,
  Send,
  ArrowLeft,
  Phone,
  Mail,
  MessageCircle,
  Instagram,
  Facebook,
  Globe,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  User,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { toast } from 'sonner';

// Normalize GHL channel types
function normalizeChannel(ch: string | undefined): string {
  if (!ch) return 'sms';
  const lower = ch.toLowerCase();
  const map: Record<string, string> = {
    type_phone: 'sms', phone: 'sms', sms: 'sms',
    type_email: 'email', email: 'email',
    type_whatsapp: 'whatsapp', whatsapp: 'whatsapp',
    type_instagram: 'instagram', instagram: 'instagram',
    type_facebook: 'facebook', facebook: 'facebook',
    type_live_chat: 'live_chat', live_chat: 'live_chat', livechat: 'live_chat',
  };
  return map[lower] || lower;
}

// Channel icon mapping
const channelIcons: Record<string, any> = {
  sms: Phone,
  email: Mail,
  whatsapp: MessageCircle,
  instagram: Instagram,
  facebook: Facebook,
  live_chat: Globe,
};

const channelColors: Record<string, string> = {
  sms: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  email: 'bg-blue-100 text-blue-700 border-blue-200',
  whatsapp: 'bg-green-100 text-green-700 border-green-200',
  instagram: 'bg-pink-100 text-pink-700 border-pink-200',
  facebook: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  live_chat: 'bg-purple-100 text-purple-700 border-purple-200',
};

interface Conversation {
  id: string;
  ghl_conversation_id: string;
  channel_type: string;
  contact_name: string | null;
  last_message_body: string | null;
  last_message_date: string | null;
  last_message_direction: string | null;
  unread_count: number;
}

interface Message {
  id: string;
  ghl_message_id: string;
  direction: string;
  body: string | null;
  message_type: string | null;
  message_status: string | null;
  ghl_date_added: string | null;
  attachment_urls: string[] | null;
}

interface ClientConversationsTabProps {
  clientId: string;
  clientName: string;
  ghlContactId?: string | null;
}

export function ClientConversationsTab({ clientId, clientName, ghlContactId }: ClientConversationsTabProps) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyChannel, setReplyChannel] = useState<string>('sms');
  const [emailSubject, setEmailSubject] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch conversations for this client
  const { data: conversations = [], isLoading: loadingConversations, refetch: refetchConversations } = useQuery({
    queryKey: ['ghl-conversations', clientId],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('get-client-data', {
        clientId,
        listMode: true,
        listOptions: {
          table: 'ghl_conversations',
          filters: { client_id: clientId },
          orderBy: 'last_message_date',
          order_asc: false,
        },
      });
      if (error) throw new Error(error.message);
      return (data?.records || []) as Conversation[];
    },
    enabled: !!clientId,
  });

  // Fetch messages for selected conversation
  const { data: messages = [], isLoading: loadingMessages } = useQuery({
    queryKey: ['ghl-messages', selectedConversation?.id],
    queryFn: async () => {
      if (!selectedConversation) return [];
      const { data, error } = await invokeSecureFunction('get-client-data', {
        clientId,
        listMode: true,
        listOptions: {
          table: 'ghl_conversation_messages',
          filters: { conversation_id: selectedConversation.id },
          orderBy: 'ghl_date_added',
          order_asc: true,
        },
      });
      if (error) throw new Error(error.message);
      return (data?.records || []) as Message[];
    },
    enabled: !!selectedConversation?.id,
  });

  // Trigger sync
  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!ghlContactId) throw new Error('No GHL contact linked');
      const { data, error } = await invokeSecureFunction('sync-ghl-conversations', {
        mode: 'contact',
        ghlContactId,
        clientId,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      toast.success('Conversations synced');
      refetchConversations();
      if (selectedConversation) {
        queryClient.invalidateQueries({ queryKey: ['ghl-messages', selectedConversation.id] });
      }
    },
    onError: (err: any) => toast.error('Sync failed: ' + err.message),
  });

  // Send reply
  const sendMutation = useMutation({
    mutationFn: async ({ conversationId, message, type }: { conversationId: string; message: string; type: string }) => {
      const { data, error } = await invokeSecureFunction('send-ghl-message', {
        conversationId,
        message,
        type,
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      setReplyText('');
      toast.success('Message sent');
      if (selectedConversation) {
        queryClient.invalidateQueries({ queryKey: ['ghl-messages', selectedConversation.id] });
      }
      refetchConversations();
    },
    onError: (err: any) => toast.error('Failed to send: ' + err.message),
  });

  // Scroll to bottom when messages load
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Filter conversations
  const filteredConversations = useMemo(() => {
    if (!searchTerm) return conversations;
    const term = searchTerm.toLowerCase();
    return conversations.filter(
      (c) =>
        c.contact_name?.toLowerCase().includes(term) ||
        c.last_message_body?.toLowerCase().includes(term) ||
        c.channel_type?.toLowerCase().includes(term)
    );
  }, [conversations, searchTerm]);

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedConversation) return;
    const type = normalizeChannel(selectedConversation.channel_type) === 'email' ? 'Email' : 'SMS';
    sendMutation.mutate({
      conversationId: selectedConversation.ghl_conversation_id,
      message: replyText.trim(),
      type,
    });
  };

  const formatMessageDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isToday(d)) return format(d, 'h:mm a');
    if (isYesterday(d)) return 'Yesterday ' + format(d, 'h:mm a');
    return format(d, 'dd MMM yyyy, h:mm a');
  };

  const formatConversationDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isToday(d)) return format(d, 'h:mm a');
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'dd/MM/yy');
  };

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { label: string; messages: Message[] }[] = [];
    let currentLabel = '';
    messages.forEach((msg) => {
      const d = msg.ghl_date_added ? new Date(msg.ghl_date_added) : new Date();
      let label: string;
      if (isToday(d)) label = 'Today';
      else if (isYesterday(d)) label = 'Yesterday';
      else label = format(d, 'EEEE, dd MMMM yyyy');
      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    });
    return groups;
  }, [messages]);

  // ===== CONVERSATION LIST VIEW =====
  if (!selectedConversation) {
    return (
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Conversations
            {conversations.length > 0 && (
              <Badge variant="secondary" className="text-xs">{conversations.length}</Badge>
            )}
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || !ghlContactId}
            title={!ghlContactId ? 'Client not linked to GHL' : 'Sync conversations from GHL'}
          >
            {syncMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
            )}
            Sync
          </Button>
        </div>

        {/* Search */}
        {conversations.length > 3 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>
        )}

        {/* Loading */}
        {loadingConversations && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty state */}
        {!loadingConversations && conversations.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">No conversations yet</p>
              <p className="text-xs mt-1">
                {ghlContactId
                  ? 'Click Sync to pull conversations from GoHighLevel'
                  : 'This client is not linked to a GHL contact'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Conversation list */}
        {filteredConversations.map((conv) => {
          const normalized = normalizeChannel(conv.channel_type);
          const ChannelIcon = channelIcons[normalized] || MessageSquare;
          const colorClass = channelColors[normalized] || 'bg-muted text-muted-foreground';

          return (
            <Card
              key={conv.id}
              className={cn(
                'cursor-pointer transition-all hover:shadow-md hover:border-primary/30',
                conv.unread_count > 0 && 'border-primary/50 bg-primary/[0.02]'
              )}
              onClick={() => setSelectedConversation(conv)}
            >
              <CardContent className="p-3 flex items-center gap-3">
                {/* Channel icon */}
                <div className={cn('h-9 w-9 rounded-full flex items-center justify-center shrink-0 border', colorClass)}>
                  <ChannelIcon className="h-4 w-4" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('text-sm truncate', conv.unread_count > 0 ? 'font-semibold' : 'font-medium')}>
                      {conv.contact_name || clientName}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatConversationDate(conv.last_message_date)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className={cn('text-xs truncate', conv.unread_count > 0 ? 'text-foreground' : 'text-muted-foreground')}>
                      {conv.last_message_direction === 'outbound' && (
                        <span className="text-muted-foreground">You: </span>
                      )}
                      {conv.last_message_body || 'No messages'}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {conv.unread_count > 0 && (
                        <Badge className="h-5 min-w-[20px] rounded-full text-[10px] px-1.5 bg-primary">
                          {conv.unread_count}
                        </Badge>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  // ===== MESSAGE THREAD VIEW =====
  const normalizedSelectedChannel = normalizeChannel(selectedConversation.channel_type);
  const ChannelIcon = channelIcons[normalizedSelectedChannel] || MessageSquare;

  return (
    <div className="flex flex-col" style={{ height: '60vh' }}>
      {/* Thread header */}
      <div className="flex items-center gap-2 pb-2 border-b shrink-0">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSelectedConversation(null)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className={cn('h-7 w-7 rounded-full flex items-center justify-center border', channelColors[normalizedSelectedChannel] || 'bg-muted')}>
          <ChannelIcon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{selectedConversation.contact_name || clientName}</p>
          <p className="text-[10px] text-muted-foreground capitalize">{normalizedSelectedChannel.replace('_', ' ')}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => {
            syncMutation.mutate();
            queryClient.invalidateQueries({ queryKey: ['ghl-messages', selectedConversation.id] });
          }}
          disabled={syncMutation.isPending}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', syncMutation.isPending && 'animate-spin')} />
        </Button>
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1 min-h-0 py-2" style={{ overflow: 'auto' }}>
        {loadingMessages ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="h-6 w-6 mx-auto mb-2 opacity-40" />
            <p className="text-xs">No messages in this conversation</p>
          </div>
        ) : (
          <div className="space-y-4 px-1">
            {groupedMessages.map((group) => (
              <div key={group.label}>
                {/* Date separator */}
                <div className="flex items-center gap-2 my-3">
                  <Separator className="flex-1" />
                  <span className="text-[10px] text-muted-foreground font-medium px-2">{group.label}</span>
                  <Separator className="flex-1" />
                </div>

                {/* Messages */}
                <div className="space-y-2">
                  {group.messages.map((msg) => {
                    const isOutbound = msg.direction === 'outbound';
                    return (
                      <div key={msg.id} className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}>
                        <div className={cn(
                          'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm',
                          isOutbound
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : 'bg-muted rounded-bl-md'
                        )}>
                          {msg.body && (
                            <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{msg.body}</p>
                          )}
                          {msg.attachment_urls && msg.attachment_urls.length > 0 && (
                            <div className="mt-1.5 space-y-1">
                              {msg.attachment_urls.map((url, i) => (
                                <a
                                  key={i}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs underline block truncate"
                                >
                                  Attachment {i + 1}
                                </a>
                              ))}
                            </div>
                          )}
                          <p className={cn(
                            'text-[10px] mt-1',
                            isOutbound ? 'text-primary-foreground/70' : 'text-muted-foreground'
                          )}>
                            {msg.ghl_date_added && format(new Date(msg.ghl_date_added), 'h:mm a')}
                            {msg.message_status && msg.message_status !== 'delivered' && (
                              <span className="ml-1.5">· {msg.message_status}</span>
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Reply composer */}
      <div className="border-t pt-2 shrink-0">
        <div className="flex items-end gap-2">
          <Textarea
            placeholder={`Reply via ${normalizedSelectedChannel.replace('_', ' ')}...`}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            className="min-h-[40px] max-h-[120px] resize-none text-sm"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendReply();
              }
            }}
          />
          <Button
            size="sm"
            className="h-9 w-9 p-0 shrink-0"
            onClick={handleSendReply}
            disabled={!replyText.trim() || sendMutation.isPending}
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
