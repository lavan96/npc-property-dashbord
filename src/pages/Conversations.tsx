import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
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
  ChevronDown,
  User,
  ExternalLink,
  Filter,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, isToday, isYesterday } from 'date-fns';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';

// ── Channel helpers ──────────────────────────────────────────
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

const channelIcons: Record<string, any> = {
  sms: Phone, email: Mail, whatsapp: MessageCircle,
  instagram: Instagram, facebook: Facebook, live_chat: Globe,
};

const channelColors: Record<string, string> = {
  sms: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  email: 'bg-blue-100 text-blue-700 border-blue-200',
  whatsapp: 'bg-green-100 text-green-700 border-green-200',
  instagram: 'bg-pink-100 text-pink-700 border-pink-200',
  facebook: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  live_chat: 'bg-purple-100 text-purple-700 border-purple-200',
};

const channelToGhlType = (ch: string): string => {
  switch (ch) {
    case 'email': return 'Email';
    case 'whatsapp': return 'WhatsApp';
    default: return 'SMS';
  }
};

// ── Types ────────────────────────────────────────────────────
interface ConversationRow {
  id: string;
  ghl_conversation_id: string;
  channel_type: string;
  last_message_body: string | null;
  last_message_date: string | null;
  last_message_direction: string | null;
  unread_count: number;
  client_id: string | null;
  ghl_contact_id: string | null;
  // joined
  client_name?: string;
  client_email?: string | null;
}

interface Message {
  id: string;
  ghl_message_id: string;
  direction: string;
  body: string | null;
  message_type?: string | null;
  content_type?: string | null;
  channel_type?: string | null;
  message_status: string | null;
  ghl_date_added: string | null;
  attachment_urls: string[] | null;
  sender_name: string | null;
}

// ── Page Component ───────────────────────────────────────────
export default function Conversations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchTerm, setSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'));
  const [replyText, setReplyText] = useState('');
  const [replyChannel, setReplyChannel] = useState<string>('sms');
  const [emailSubject, setEmailSubject] = useState('');
  const [selectedMailbox, setSelectedMailbox] = useState<string>('admin');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Fetch ALL conversations (direct Supabase query) ──
  const { data: conversations = [], isLoading: loadingConversations, refetch: refetchConversations } = useQuery({
    queryKey: ['all-conversations'],
    queryFn: async () => {
      // Fetch conversations with client info
      const { data: convos, error } = await supabase
        .from('ghl_conversations')
        .select('*')
        .order('last_message_date', { ascending: false });
      if (error) throw error;

      // Fetch client names for all unique client_ids
      const clientIds = [...new Set((convos || []).map(c => c.client_id).filter(Boolean))] as string[];
      let clientMap: Record<string, { name: string; email: string | null }> = {};
      if (clientIds.length > 0) {
        const { data: clients } = await supabase
          .from('clients')
          .select('id, primary_first_name, primary_surname, primary_email')
          .in('id', clientIds);
        if (clients) {
          clients.forEach(c => {
            clientMap[c.id] = {
              name: [c.primary_first_name, c.primary_surname].filter(Boolean).join(' ') || 'Unknown',
              email: c.primary_email,
            };
          });
        }
      }

      return (convos || []).map(c => ({
        ...c,
        client_name: c.client_id ? clientMap[c.client_id]?.name || 'Unknown' : 'Unlinked Contact',
        client_email: c.client_id ? clientMap[c.client_id]?.email : null,
      })) as ConversationRow[];
    },
  });

  const selectedConversation = useMemo(
    () => conversations.find(c => c.id === selectedId) || null,
    [conversations, selectedId]
  );

  // ── Fetch messages for selected conversation ──
  const { data: messages = [], isLoading: loadingMessages } = useQuery({
    queryKey: ['conversation-messages', selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data, error } = await supabase
        .from('ghl_conversation_messages')
        .select('*')
        .eq('conversation_id', selectedId)
        .order('ghl_date_added', { ascending: true });
      if (error) throw error;
      return (data || []) as Message[];
    },
    enabled: !!selectedId,
  });

  // ── Mailboxes ──
  const { data: mailboxes = [] } = useQuery({
    queryKey: ['mailboxes-conversations-page'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_users')
        .select('id, email, personal_mailbox')
        .not('personal_mailbox', 'is', null);
      if (error) throw error;
      return data.filter(u => u.personal_mailbox) || [];
    },
    enabled: replyChannel === 'email',
  });

  // ── Send reply ──
  const sendMutation = useMutation({
    mutationFn: async ({ conversationId, message, type, subject }: { conversationId: string; message: string; type: string; subject?: string }) => {
      if (type === 'Email') {
        const email = selectedConversation?.client_email;
        if (!email) throw new Error('Client does not have an email address');
        const { data, error } = await invokeSecureFunction('send-email-reply', {
          to: email,
          subject: subject || 'Message from NPC Services',
          body: message,
          mailboxSource: selectedMailbox,
        });
        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);
        return data;
      }
      const { data, error } = await invokeSecureFunction('send-ghl-message', {
        conversationId,
        message,
        type,
        ...(subject ? { subject } : {}),
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      setReplyText('');
      setEmailSubject('');
      toast.success('Message sent');
      queryClient.invalidateQueries({ queryKey: ['conversation-messages', selectedId] });
      refetchConversations();
    },
    onError: (err: any) => toast.error('Failed to send: ' + err.message),
  });

  // ── Realtime subscription ──
  useEffect(() => {
    const channel = supabase
      .channel('conversations-page-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ghl_conversations' }, () => {
        refetchConversations();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ghl_conversation_messages' }, (payload) => {
        if (selectedId && (payload.new as any).conversation_id === selectedId) {
          queryClient.invalidateQueries({ queryKey: ['conversation-messages', selectedId] });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedId]);

  // ── When conversation changes ──
  useEffect(() => {
    if (selectedConversation) {
      const ch = normalizeChannel(selectedConversation.channel_type);
      setReplyChannel(['sms', 'email', 'whatsapp'].includes(ch) ? ch : 'sms');
      setEmailSubject('');
      setReplyText('');
    }
  }, [selectedId]);

  // ── Auto-scroll messages ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Deep-link from notification ──
  useEffect(() => {
    const id = searchParams.get('id');
    if (id && id !== selectedId) setSelectedId(id);
  }, [searchParams]);

  // ── Filter conversations ──
  const filteredConversations = useMemo(() => {
    let list = conversations;
    if (channelFilter !== 'all') {
      list = list.filter(c => normalizeChannel(c.channel_type) === channelFilter);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(c =>
        c.client_name?.toLowerCase().includes(term) ||
        c.last_message_body?.toLowerCase().includes(term)
      );
    }
    return list;
  }, [conversations, channelFilter, searchTerm]);

  // ── Group messages by date ──
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

  const formatConversationDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isToday(d)) return format(d, 'h:mm a');
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'dd/MM/yy');
  };

  const handleSelectConversation = async (conv: ConversationRow) => {
    setSelectedId(conv.id);
    setSearchParams({ id: conv.id });

    // Mark as read: reset unread_count to 0
    if (conv.unread_count > 0) {
      try {
        await supabase
          .from('ghl_conversations')
          .update({ unread_count: 0 })
          .eq('id', conv.id);
        // Optimistically update the local cache
        queryClient.setQueryData(['all-conversations'], (old: ConversationRow[] | undefined) =>
          (old || []).map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c)
        );
      } catch (err) {
        console.error('Failed to mark conversation as read:', err);
      }
    }
  };

  const handleBack = () => {
    setSelectedId(null);
    setSearchParams({});
  };

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedConversation) return;
    if (replyChannel === 'email' && !emailSubject.trim()) {
      toast.error('Please enter an email subject');
      return;
    }
    sendMutation.mutate({
      conversationId: selectedConversation.ghl_conversation_id,
      message: replyText.trim(),
      type: channelToGhlType(replyChannel),
      ...(replyChannel === 'email' && emailSubject.trim() ? { subject: emailSubject.trim() } : {}),
    });
  };

  // ── Show thread on mobile (hide list) ──
  const showThread = !!selectedId && isMobile;
  const showList = !selectedId || !isMobile;

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Page header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          {isMobile && selectedId && (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <MessageSquare className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Conversations</h1>
          {!loadingConversations && (
            <Badge variant="secondary" className="text-xs">{conversations.length}</Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchConversations()}
          disabled={loadingConversations}
        >
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', loadingConversations && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* ─── LEFT PANEL: Conversation List ─── */}
        {showList && (
          <div className={cn(
            'flex flex-col border-r',
            isMobile ? 'w-full' : 'w-[360px] shrink-0'
          )}>
            {/* Search & filter */}
            <div className="p-3 space-y-2 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search conversations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-8 text-sm"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {['all', 'sms', 'email', 'whatsapp'].map(ch => (
                  <Button
                    key={ch}
                    variant={channelFilter === ch ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setChannelFilter(ch)}
                  >
                    {ch === 'all' ? 'All' : ch === 'sms' ? 'SMS' : ch === 'whatsapp' ? 'WhatsApp' : 'Email'}
                  </Button>
                ))}
              </div>
            </div>

            {/* Conversation list */}
            <ScrollArea className="flex-1 min-h-0">
              {loadingConversations ? (
                <div className="p-3 space-y-3">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex gap-3 items-center">
                      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-32" />
                        <Skeleton className="h-3 w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <MessageSquare className="h-8 w-8 mb-3 opacity-40" />
                  <p className="text-sm font-medium">No conversations found</p>
                  <p className="text-xs mt-1">
                    {searchTerm || channelFilter !== 'all' ? 'Try adjusting your filters' : 'Conversations will appear when messages are synced'}
                  </p>
                </div>
              ) : (
                <div>
                  {filteredConversations.map((conv) => {
                    const normalized = normalizeChannel(conv.channel_type);
                    const Icon = channelIcons[normalized] || MessageSquare;
                    const isActive = conv.id === selectedId;

                    return (
                      <div
                        key={conv.id}
                        className={cn(
                          'flex items-center gap-3 px-3 py-3 cursor-pointer transition-colors border-b border-border/50',
                          isActive ? 'bg-accent' : 'hover:bg-muted/50',
                          conv.unread_count > 0 && !isActive && 'bg-primary/[0.03]'
                        )}
                        onClick={() => handleSelectConversation(conv)}
                      >
                        <div className={cn('h-10 w-10 rounded-full flex items-center justify-center shrink-0 border', channelColors[normalized] || 'bg-muted')}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn('text-sm truncate', conv.unread_count > 0 ? 'font-semibold' : 'font-medium')}>
                              {conv.client_name}
                            </span>
                            <span className="text-[11px] text-muted-foreground shrink-0">
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
                            {conv.unread_count > 0 && (
                              <Badge className="h-5 min-w-[20px] rounded-full text-[10px] px-1.5 bg-primary shrink-0">
                                {conv.unread_count}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        )}

        {/* ─── RIGHT PANEL: Thread View ─── */}
        {(selectedId || !isMobile) && (
          <div className={cn('flex flex-col flex-1 min-w-0', !selectedId && 'items-center justify-center')}>
            {!selectedId ? (
              <div className="text-center text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">Select a conversation</p>
                <p className="text-xs mt-1">Choose from the list to view messages</p>
              </div>
            ) : selectedConversation ? (
              <>
                {/* Thread header with client context */}
                <div className="flex items-center gap-3 px-4 py-2.5 border-b shrink-0">
                  {!isMobile && (
                    <div className={cn('h-9 w-9 rounded-full flex items-center justify-center border shrink-0',
                      channelColors[normalizeChannel(selectedConversation.channel_type)] || 'bg-muted'
                    )}>
                      {(() => { const I = channelIcons[normalizeChannel(selectedConversation.channel_type)] || MessageSquare; return <I className="h-4 w-4" />; })()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{selectedConversation.client_name}</p>
                    <p className="text-[11px] text-muted-foreground capitalize">
                      {normalizeChannel(selectedConversation.channel_type).replace('_', ' ')}
                      {selectedConversation.client_id && (
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 ml-2 text-[11px] text-primary"
                          onClick={() => window.open(`/clients?highlight=${selectedConversation.client_id}`, '_blank')}
                        >
                          View Client <ExternalLink className="h-2.5 w-2.5 ml-0.5" />
                        </Button>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 shrink-0"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['conversation-messages', selectedId] })}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 min-h-0">
                  <div className="px-4 py-2">
                    {loadingMessages ? (
                      <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center py-16 text-muted-foreground">
                        <MessageSquare className="h-6 w-6 mx-auto mb-2 opacity-40" />
                        <p className="text-xs">No messages in this conversation</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {groupedMessages.map((group) => (
                          <div key={group.label}>
                            <div className="flex items-center gap-2 my-3">
                              <Separator className="flex-1" />
                              <span className="text-[10px] text-muted-foreground font-medium px-2 whitespace-nowrap">{group.label}</span>
                              <Separator className="flex-1" />
                            </div>
                            <div className="space-y-2">
                              {group.messages.map((msg) => {
                                const isOutbound = msg.direction === 'outbound';
                                return (
                                  <div key={msg.id} className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}>
                                    <div className={cn(
                                      'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm',
                                      isOutbound
                                        ? 'bg-primary text-primary-foreground rounded-br-md'
                                        : 'bg-muted rounded-bl-md'
                                    )}>
                                      {!isOutbound && msg.sender_name && (
                                        <p className="text-[10px] font-medium mb-0.5 opacity-70">{msg.sender_name}</p>
                                      )}
                                      {msg.body && (
                                        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{msg.body}</p>
                                      )}
                                      {msg.attachment_urls && msg.attachment_urls.length > 0 && (
                                        <div className="mt-1.5 space-y-1">
                                          {msg.attachment_urls.map((url, i) => (
                                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-xs underline block truncate">
                                              Attachment {i + 1}
                                            </a>
                                          ))}
                                        </div>
                                      )}
                                      <p className={cn('text-[10px] mt-1', isOutbound ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
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
                  </div>
                </ScrollArea>

                {/* Reply composer */}
                <div className="border-t px-4 py-3 shrink-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">Send via:</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs px-2.5">
                          {(() => { const I = channelIcons[replyChannel] || MessageSquare; return <I className="h-3 w-3" />; })()}
                          <span className="capitalize">{replyChannel === 'sms' ? 'SMS' : replyChannel === 'whatsapp' ? 'WhatsApp' : 'Email'}</span>
                          <ChevronDown className="h-3 w-3 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="min-w-[140px]">
                        <DropdownMenuItem onClick={() => setReplyChannel('sms')} className="gap-2 text-xs">
                          <Phone className="h-3.5 w-3.5" /> SMS
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setReplyChannel('email')} className="gap-2 text-xs">
                          <Mail className="h-3.5 w-3.5" /> Email
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setReplyChannel('whatsapp')} className="gap-2 text-xs">
                          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {replyChannel === 'email' && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">Mailbox:</span>
                        <Select value={selectedMailbox} onValueChange={setSelectedMailbox}>
                          <SelectTrigger className="h-7 text-xs flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin" className="text-xs">Admin Mailbox</SelectItem>
                            {mailboxes.map((mb) => (
                              <SelectItem key={mb.id} value="personal" className="text-xs">
                                Personal — {mb.personal_mailbox}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Input
                        placeholder="Email subject..."
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </>
                  )}

                  <div className="flex items-end gap-2">
                    <Textarea
                      placeholder={`Type your ${replyChannel === 'sms' ? 'SMS' : replyChannel === 'whatsapp' ? 'WhatsApp' : 'email'} message...`}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="min-h-[40px] max-h-[120px] resize-none text-sm"
                      rows={replyChannel === 'email' ? 3 : 1}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && replyChannel !== 'email') {
                          e.preventDefault();
                          handleSendReply();
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      className="h-9 w-9 p-0 shrink-0"
                      onClick={handleSendReply}
                      disabled={!replyText.trim() || sendMutation.isPending || (replyChannel === 'email' && !emailSubject.trim())}
                    >
                      {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
