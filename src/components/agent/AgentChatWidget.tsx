import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, Plus, Trash2, Send, Check, XCircle, Loader2, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { useAuth } from '@/hooks/useAuth';
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load conversations
  const loadConversations = useCallback(async () => {
    if (!user) return;
    setLoadingConvos(true);
    const { data } = await invokeSecureFunction('ai-dashboard-agent', { action: 'list-conversations' });
    if (data?.conversations) setConversations(data.conversations);
    setLoadingConvos(false);
  }, [user]);

  useEffect(() => {
    if (isOpen && user) loadConversations();
  }, [isOpen, user, loadConversations]);

  // Load messages for active conversation
  useEffect(() => {
    if (!activeConversation) return;
    (async () => {
      const { data } = await invokeSecureFunction('ai-dashboard-agent', {
        action: 'get-messages',
        conversation_id: activeConversation,
      });
      if (data?.messages) setMessages(data.messages);
    })();
  }, [activeConversation]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const createConversation = async () => {
    const { data } = await invokeSecureFunction('ai-dashboard-agent', { action: 'create-conversation' });
    if (data?.conversation) {
      setConversations(prev => [data.conversation, ...prev]);
      setActiveConversation(data.conversation.id);
      setMessages([]);
      setShowSidebar(false);
    }
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await invokeSecureFunction('ai-dashboard-agent', { action: 'delete-conversation', conversation_id: id });
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConversation === id) {
      setActiveConversation(null);
      setMessages([]);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput('');
    setLoading(true);

    // Create conversation if none active
    let convId = activeConversation;
    if (!convId) {
      const { data } = await invokeSecureFunction('ai-dashboard-agent', { action: 'create-conversation' });
      if (!data?.conversation) { setLoading(false); return; }
      convId = data.conversation.id;
      setConversations(prev => [data.conversation, ...prev]);
      setActiveConversation(convId);
      setShowSidebar(false);
    }

    // Optimistic user message
    const tempUserMsg: Message = { id: 'temp-user', role: 'user', content: msg, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, tempUserMsg]);

    const { data, error } = await invokeSecureFunction('ai-dashboard-agent', {
      action: 'chat',
      conversation_id: convId,
      message: msg,
    });

    if (error || !data?.success) {
      setMessages(prev => [...prev.filter(m => m.id !== 'temp-user'), tempUserMsg, {
        id: 'error', role: 'assistant', content: `⚠️ ${error?.message || 'Something went wrong'}`, created_at: new Date().toISOString(),
      }]);
    } else {
      // Reload messages to get proper IDs
      const { data: refreshed } = await invokeSecureFunction('ai-dashboard-agent', {
        action: 'get-messages', conversation_id: convId,
      });
      if (refreshed?.messages) setMessages(refreshed.messages);
      // Update conversation title in list
      loadConversations();
    }
    setLoading(false);
  };

  const handleConfirmAction = async (messageId: string, approved: boolean) => {
    setLoading(true);
    await invokeSecureFunction('ai-dashboard-agent', {
      action: 'confirm-action',
      conversation_id: activeConversation,
      message_id: messageId,
      approved,
    });
    // Reload messages
    const { data } = await invokeSecureFunction('ai-dashboard-agent', {
      action: 'get-messages', conversation_id: activeConversation,
    });
    if (data?.messages) setMessages(data.messages);
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
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:scale-105"
        aria-label="Open AI Assistant"
      >
        <MessageSquare className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[600px] w-[420px] flex-col rounded-2xl border bg-background shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-primary/5 px-4 py-3">
        <div className="flex items-center gap-2">
          {!showSidebar && activeConversation && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSidebar(true)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <MessageSquare className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">Aurixa Agent</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={createConversation}>
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
          <div className="w-full flex flex-col border-r bg-muted/30">
            <div className="px-3 py-2 border-b">
              <p className="text-xs text-muted-foreground font-medium">Conversations</p>
            </div>
            <ScrollArea className="flex-1">
              {loadingConvos ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-muted-foreground mb-3">No conversations yet</p>
                  <Button size="sm" onClick={createConversation}>
                    <Plus className="h-4 w-4 mr-1" /> New Chat
                  </Button>
                </div>
              ) : (
                <div className="p-1">
                  {conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => { setActiveConversation(conv.id); setShowSidebar(false); }}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-lg text-sm group hover:bg-accent transition-colors flex items-center justify-between",
                        activeConversation === conv.id && "bg-accent"
                      )}
                    >
                      <span className="truncate flex-1">{conv.title}</span>
                      <button
                        onClick={(e) => deleteConversation(conv.id, e)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </button>
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
                  <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">Ask me about clients, deals, emails, reminders, or pipeline status.</p>
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                    msg.role === 'user'
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}>
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                    {/* Confirmation buttons */}
                    {msg.requires_confirmation && msg.confirmation_status === 'pending' && (
                      <div className="flex gap-2 mt-2 pt-2 border-t border-border/50">
                        <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => handleConfirmAction(msg.id, true)} disabled={loading}>
                          <Check className="h-3 w-3 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleConfirmAction(msg.id, false)} disabled={loading}>
                          <XCircle className="h-3 w-3 mr-1" /> Cancel
                        </Button>
                      </div>
                    )}
                    {msg.confirmation_status === 'approved' && (
                      <p className="text-xs text-primary mt-1">✓ Approved</p>
                    )}
                    {msg.confirmation_status === 'rejected' && (
                      <p className="text-xs text-destructive mt-1">✕ Cancelled</p>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-xl px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t p-3">
              <div className="flex gap-2">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Aurixa..."
                  className="min-h-[40px] max-h-[100px] resize-none text-sm"
                  rows={1}
                  disabled={loading}
                />
                <Button
                  size="icon"
                  onClick={sendMessage}
                  disabled={!input.trim() || loading}
                  className="h-10 w-10 shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
