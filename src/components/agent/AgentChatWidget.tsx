import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, Plus, Trash2, Send, Check, XCircle, Loader2, ChevronLeft, Search, Pencil, RotateCcw, Sparkles, Diamond } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: any[];
  requires_confirmation?: boolean;
  confirmation_status?: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export function AgentChatWidget() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingConvos, setLoadingConvos] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingConvoId, setEditingConvoId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Load conversations
  const loadConversations = useCallback(async () => {
    if (!user) return;
    setLoadingConvos(true);
    try {
      const { data } = await invokeSecureFunction('ai-dashboard-agent', { action: 'list-conversations' });
      if (data?.conversations) setConversations(data.conversations);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
    setLoadingConvos(false);
  }, [user]);

  useEffect(() => {
    if (isOpen && user) loadConversations();
  }, [isOpen, user, loadConversations]);

  // Load messages for active conversation
  useEffect(() => {
    if (!activeConversation) return;
    (async () => {
      try {
        const { data } = await invokeSecureFunction('ai-dashboard-agent', {
          action: 'get-messages',
          conversation_id: activeConversation,
        });
        if (data?.messages) setMessages(data.messages);
      } catch (err) {
        console.error('Failed to load messages:', err);
      }
    })();
  }, [activeConversation]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus edit input
  useEffect(() => {
    if (editingConvoId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingConvoId]);

  const filteredConversations = conversations.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const createConversation = async () => {
    try {
      const { data } = await invokeSecureFunction('ai-dashboard-agent', { action: 'create-conversation' });
      if (data?.conversation) {
        setConversations(prev => [data.conversation, ...prev]);
        setActiveConversation(data.conversation.id);
        setMessages([]);
        setShowSidebar(false);
      }
    } catch (err) {
      toast.error('Failed to create conversation');
    }
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invokeSecureFunction('ai-dashboard-agent', { action: 'delete-conversation', conversation_id: id });
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeConversation === id) {
        setActiveConversation(null);
        setMessages([]);
        setShowSidebar(true);
      }
    } catch (err) {
      toast.error('Failed to delete conversation');
    }
  };

  const renameConversation = async (id: string) => {
    if (!editTitle.trim()) {
      setEditingConvoId(null);
      return;
    }
    try {
      await invokeSecureFunction('ai-dashboard-agent', {
        action: 'rename-conversation',
        conversation_id: id,
        title: editTitle.trim(),
      });
      setConversations(prev => prev.map(c =>
        c.id === id ? { ...c, title: editTitle.trim() } : c
      ));
    } catch (err) {
      toast.error('Failed to rename conversation');
    }
    setEditingConvoId(null);
  };

  const sendMessage = async (overrideMessage?: string) => {
    const msg = (overrideMessage || input).trim();
    if (!msg || loading) return;
    if (!overrideMessage) setInput('');
    setRetryMessage(null);
    setLoading(true);

    // Create conversation if none active
    let convId = activeConversation;
    if (!convId) {
      try {
        const { data } = await invokeSecureFunction('ai-dashboard-agent', { action: 'create-conversation' });
        if (!data?.conversation) { setLoading(false); return; }
        convId = data.conversation.id;
        setConversations(prev => [data.conversation, ...prev]);
        setActiveConversation(convId);
        setShowSidebar(false);
      } catch (err) {
        toast.error('Failed to create conversation');
        setLoading(false);
        return;
      }
    }

    // Optimistic user message
    const tempUserMsg: Message = { id: `temp-${Date.now()}`, role: 'user', content: msg, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const { data, error } = await invokeSecureFunction('ai-dashboard-agent', {
        action: 'chat',
        conversation_id: convId,
        message: msg,
      });

      if (error || !data?.success) {
        const errorMsg = error?.message || data?.error || 'Something went wrong';
        setRetryMessage(msg);
        setMessages(prev => [
          ...prev.filter(m => m.id !== tempUserMsg.id),
          tempUserMsg,
          { id: `error-${Date.now()}`, role: 'assistant', content: `⚠️ ${errorMsg}`, created_at: new Date().toISOString() },
        ]);
        toast.error(errorMsg);
      } else {
        // Reload messages to get proper IDs
        const { data: refreshed } = await invokeSecureFunction('ai-dashboard-agent', {
          action: 'get-messages', conversation_id: convId,
        });
        if (refreshed?.messages) setMessages(refreshed.messages);
        loadConversations();
      }
    } catch (err: any) {
      setRetryMessage(msg);
      setMessages(prev => [
        ...prev.filter(m => m.id !== tempUserMsg.id),
        tempUserMsg,
        { id: `error-${Date.now()}`, role: 'assistant', content: `⚠️ ${err.message || 'Network error'}`, created_at: new Date().toISOString() },
      ]);
      toast.error(err.message || 'Failed to send message');
    }
    setLoading(false);
  };

  const handleConfirmAction = async (messageId: string, approved: boolean) => {
    setLoading(true);
    try {
      await invokeSecureFunction('ai-dashboard-agent', {
        action: 'confirm-action',
        conversation_id: activeConversation,
        message_id: messageId,
        approved,
      });
      const { data } = await invokeSecureFunction('ai-dashboard-agent', {
        action: 'get-messages', conversation_id: activeConversation,
      });
      if (data?.messages) setMessages(data.messages);
      toast.success(approved ? 'Action approved and executed' : 'Action cancelled');
    } catch (err) {
      toast.error('Failed to process action');
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!user) return null;

  // Floating button when closed
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:scale-105 group"
        aria-label="Open AI Assistant"
      >
        <Diamond className="h-6 w-6 text-black group-hover:animate-pulse" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col rounded-2xl border border-border/50 bg-background shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300
      w-[calc(100vw-2rem)] max-w-[440px] h-[min(85vh,640px)]
      sm:bottom-6 sm:right-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-primary/5 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          {!showSidebar && activeConversation && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSidebar(true)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <Diamond className="h-5 w-5 text-black" />
          <span className="font-semibold text-sm">Aurixa Agent</span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Gemini</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={createConversation} title="New conversation">
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Conversation sidebar */}
        {showSidebar && (
          <div className="w-full flex flex-col bg-muted/20">
            {/* Search */}
            <div className="px-3 py-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search conversations..."
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>
            <ScrollArea className="flex-1">
              {loadingConvos ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="p-6 text-center">
                  <Diamond className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">
                    {searchQuery ? 'No matching conversations' : 'No conversations yet'}
                  </p>
                  {!searchQuery && (
                    <Button size="sm" onClick={createConversation} variant="outline">
                      <Plus className="h-4 w-4 mr-1" /> New Chat
                    </Button>
                  )}
                </div>
              ) : (
                <div className="p-1.5 space-y-0.5">
                  {filteredConversations.map((conv) => (
                    <div key={conv.id} className="group">
                      {editingConvoId === conv.id ? (
                        <div className="px-2 py-1.5">
                          <Input
                            ref={editInputRef}
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onBlur={() => renameConversation(conv.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') renameConversation(conv.id);
                              if (e.key === 'Escape') setEditingConvoId(null);
                            }}
                            className="h-7 text-xs"
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => { setActiveConversation(conv.id); setShowSidebar(false); }}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-accent/50 transition-colors flex items-center justify-between gap-1",
                            activeConversation === conv.id && "bg-accent"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <span className="truncate block text-xs font-medium">{conv.title}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(conv.updated_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingConvoId(conv.id);
                                setEditTitle(conv.title);
                              }}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                              title="Rename"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={(e) => deleteConversation(conv.id, e)}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}

        {/* Chat area */}
        {!showSidebar && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <Diamond className="h-10 w-10 text-black/20 mb-3" />
                  <p className="text-sm font-medium text-foreground/80 mb-1">How can I help?</p>
                  <p className="text-xs text-muted-foreground max-w-[280px]">
                    Ask about clients, deals, emails, reminders, pipeline status, calendar, or borrowing capacity.
                  </p>
                  {/* Quick actions */}
                  <div className="flex flex-wrap gap-1.5 mt-4 justify-center">
                    {[
                      '☀️ Morning briefing',
                      '📊 Pipeline overview',
                      '⏰ Overdue reminders',
                      '📅 Upcoming appointments',
                      '🔍 Search a client',
                      '💰 Commission forecast',
                      '🧮 Calculate stamp duty',
                      '✅ Active checklists',
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => sendMessage(prompt)}
                        className="text-[11px] px-2.5 py-1.5 rounded-full border border-border/50 hover:bg-accent/50 hover:border-primary/30 transition-colors text-muted-foreground hover:text-foreground"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm",
                    msg.role === 'user'
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted/60 border border-border/30 rounded-bl-md"
                  )}>
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_table]:text-xs [&_th]:py-1 [&_td]:py-1">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                    {/* Confirmation buttons */}
                    {msg.requires_confirmation && msg.confirmation_status === 'pending' && (
                      <div className="flex gap-2 mt-3 pt-2.5 border-t border-border/50">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs flex-1"
                          onClick={() => handleConfirmAction(msg.id, true)}
                          disabled={loading}
                        >
                          <Check className="h-3 w-3 mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs flex-1"
                          onClick={() => handleConfirmAction(msg.id, false)}
                          disabled={loading}
                        >
                          <XCircle className="h-3 w-3 mr-1" /> Cancel
                        </Button>
                      </div>
                    )}
                    {msg.confirmation_status === 'approved' && (
                      <p className="text-xs text-primary mt-1.5 flex items-center gap-1">
                        <Check className="h-3 w-3" /> Approved & executed
                      </p>
                    )}
                    {msg.confirmation_status === 'rejected' && (
                      <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
                        <XCircle className="h-3 w-3" /> Cancelled
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted/60 border border-border/30 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      <span className="text-xs text-muted-foreground">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              {retryMessage && !loading && (
                <div className="flex justify-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => sendMessage(retryMessage)}
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" /> Retry
                  </Button>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t p-3 shrink-0 bg-background">
              <div className="flex gap-2 items-end">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Aurixa..."
                  className="min-h-[40px] max-h-[100px] resize-none text-sm rounded-xl"
                  rows={1}
                  disabled={loading}
                />
                <Button
                  size="icon"
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading}
                  className="h-10 w-10 shrink-0 rounded-xl"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                Powered by Gemini • Aurixa may make mistakes
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
