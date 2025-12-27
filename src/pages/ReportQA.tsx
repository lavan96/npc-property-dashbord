import { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { logActivityDirect } from '@/hooks/useActivityLogger';
import { QAPDFGenerator } from '@/components/reports/QAPDFGenerator';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Upload, 
  FileText, 
  Send, 
  Copy, 
  MessageSquare,
  X,
  CheckCircle2,
  User,
  Bot,
  Mail,
  History,
  Plus,
  Trash2,
  GitCompare,
  Mic,
  MicOff,
  Pencil,
  Check,
  Search,
  Clock,
  Calendar,
  MoreVertical,
  Archive,
  Loader2,
  Pin
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// Feature components
import { useReportQAKeyboardShortcuts } from '@/hooks/useReportQAKeyboardShortcuts';
import { TypingIndicator } from '@/components/report-qa/TypingIndicator';
import { MessageReactions } from '@/components/report-qa/MessageReactions';
import { SmartSuggestions } from '@/components/report-qa/SmartSuggestions';
import { ConversationTags } from '@/components/report-qa/ConversationTags';
import { ChatThemeSelector, useCurrentTheme, type Theme } from '@/components/report-qa/ChatThemeSelector';
import { ConversationExport } from '@/components/report-qa/ConversationExport';
import { MessageThreading, useMessageThreads } from '@/components/report-qa/MessageThreading';
import { AutoSummarize } from '@/components/report-qa/AutoSummarize';
import { PinConversation, usePinnedConversations } from '@/components/report-qa/PinConversation';
import { KeyboardShortcutsHelp } from '@/components/report-qa/KeyboardShortcutsHelp';
import { VoiceMessagePlayer } from '@/components/report-qa/VoiceMessagePlayer';
import { RecordingIndicator } from '@/components/report-qa/RecordingIndicator';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  audioUrl?: string; // For voice messages
}

interface UploadedReport {
  name: string;
  content: string;
  uploadedAt: Date;
}

interface SavedConversation {
  id: string;
  title: string;
  report_names: string[];
  created_at: string;
  updated_at: string;
}

export default function ReportQA() {
  const { toast } = useToast();
  const [uploadedReports, setUploadedReports] = useState<UploadedReport[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [savedConversations, setSavedConversations] = useState<SavedConversation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('Investment Report Summary');
  const [emailContent, setEmailContent] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [isEditingMainTitle, setIsEditingMainTitle] = useState(false);
  const [mainTitleEdit, setMainTitleEdit] = useState('');
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  
  // New feature states
  const [chatTheme, setChatTheme] = useState<Theme | null>(null);
  const [conversationTags, setConversationTags] = useState<Map<string, string[]>>(new Map());
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [pendingAudioUrl, setPendingAudioUrl] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // Custom hooks
  const { addReply, getReplies } = useMessageThreads();
  const { getPinnedIds, togglePin, isPinned } = usePinnedConversations();

  // Keyboard shortcuts
  useReportQAKeyboardShortcuts({
    onNewChat: handleNewChat,
    onOpenHistory: () => setShowHistory(true),
    onCloseDialogs: () => {
      setShowHistory(false);
      setShowEmailModal(false);
    },
    onFocusInput: () => inputRef.current?.focus(),
  });

  // Load saved conversations and pinned IDs on mount
  useEffect(() => {
    loadSavedConversations();
    setPinnedIds(getPinnedIds());
    // Load tags from localStorage
    try {
      const stored = localStorage.getItem('qa-conversation-tags');
      if (stored) setConversationTags(new Map(JSON.parse(stored)));
    } catch {}
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadSavedConversations = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('report-qa', {
        body: { action: 'get-conversations' },
      });
      if (error) throw error;
      setSavedConversations(data.conversations || []);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const handleSaveTitle = async (targetConversationId: string, newTitle: string) => {
    if (!newTitle.trim()) {
      setEditingConversationId(null);
      setIsEditingMainTitle(false);
      return;
    }
    
    try {
      const { error } = await supabase
        .from('report_qa_conversations')
        .update({ title: newTitle.trim() })
        .eq('id', targetConversationId);
      
      if (error) throw error;
      
      setSavedConversations(prev => 
        prev.map(c => c.id === targetConversationId ? { ...c, title: newTitle.trim() } : c)
      );
      setEditingConversationId(null);
      setIsEditingMainTitle(false);
      
      toast({
        title: 'Title updated',
        description: 'Conversation title has been saved',
      });
    } catch (error) {
      console.error('Failed to update title:', error);
      toast({
        title: 'Failed to update title',
        description: 'Please try again',
        variant: 'destructive',
      });
    }
  };

  // Get current conversation title
  const getCurrentTitle = () => {
    if (!conversationId) return 'New Chat';
    const conv = savedConversations.find(c => c.id === conversationId);
    return conv?.title || 'New Chat';
  };

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.type.includes('pdf')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a PDF file',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload a file smaller than 10MB',
        variant: 'destructive',
      });
      return;
    }

    if (uploadedReports.some(r => r.name === file.name)) {
      toast({
        title: 'Already uploaded',
        description: 'This report has already been added',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        
        const { data, error } = await supabase.functions.invoke('report-qa', {
          body: {
            action: 'extract',
            fileData: base64,
            fileName: file.name,
          },
        });

        if (error) throw error;

        if (data.success) {
          const newReport: UploadedReport = {
            name: file.name,
            content: data.extractedText,
            uploadedAt: new Date(),
          };
          
          setUploadedReports(prev => [...prev, newReport]);
          toast({
            title: 'Report uploaded',
            description: `${file.name} added. ${uploadedReports.length + 1} report(s) loaded.`,
          });
        } else {
          throw new Error(data.error || 'Failed to extract text');
        }
        
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to process the report',
        variant: 'destructive',
      });
      setIsUploading(false);
    }
  }, [toast, uploadedReports]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => handleFileUpload(file));
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const removeReport = (name: string) => {
    setUploadedReports(prev => prev.filter(r => r.name !== name));
  };

  const startNewConversation = async (): Promise<string | null> => {
    try {
      const title = uploadedReports.length > 1 
        ? `Comparison: ${uploadedReports.map(r => r.name.replace('.pdf', '')).join(' vs ')}`
        : uploadedReports.length === 1
          ? `Q&A: ${uploadedReports[0].name}`
          : `Open Chat: ${new Date().toLocaleDateString()}`;

      const { data, error } = await supabase.functions.invoke('report-qa', {
        body: {
          action: 'create-conversation',
          reportNames: uploadedReports.map(r => r.name),
          reportContents: uploadedReports.map(r => r.content),
          title,
        },
      });

      if (error) throw error;

      const newConversationId = data.conversation.id;
      setConversationId(newConversationId);
      setMessages([]);
      loadSavedConversations();
      
      // Log conversation created
      logActivityDirect({
        actionType: 'qa_conversation_created',
        entityType: 'qa_conversation',
        entityId: newConversationId,
        entityName: title,
        metadata: { report_count: uploadedReports.length }
      });
      
      toast({
        title: 'Conversation started',
        description: 'Your chat will be saved automatically',
      });

      return newConversationId;
    } catch (error) {
      console.error('Failed to create conversation:', error);
      return null;
    }
  };

  const loadConversation = async (conv: SavedConversation) => {
    try {
      const { data, error } = await supabase.functions.invoke('report-qa', {
        body: { action: 'load-conversation', conversationId: conv.id },
      });

      if (error) throw error;

      setConversationId(conv.id);
      setUploadedReports(
        conv.report_names.map((name, idx) => ({
          name,
          content: data.conversation.report_contents[idx],
          uploadedAt: new Date(data.conversation.created_at),
        }))
      );
      setMessages(
        data.messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.created_at),
        }))
      );
      setShowHistory(false);
      
      toast({
        title: 'Conversation loaded',
        description: conv.title,
      });
    } catch (error) {
      console.error('Failed to load conversation:', error);
      toast({
        title: 'Failed to load',
        description: 'Could not load the conversation',
        variant: 'destructive',
      });
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isProcessing) return;

    let activeConversationId = conversationId;
    if (!activeConversationId) {
      activeConversationId = await startNewConversation();
      if (!activeConversationId) {
        toast({
          title: 'Error',
          description: 'Failed to start conversation. Please try again.',
          variant: 'destructive',
        });
        return;
      }
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputMessage.trim(),
      timestamp: new Date(),
      audioUrl: pendingAudioUrl || undefined,
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setPendingAudioUrl(null); // Clear pending audio after adding to message
    setIsProcessing(true);

    try {
      const { data, error } = await supabase.functions.invoke('report-qa', {
        body: {
          action: 'chat',
          reportContents: uploadedReports.map(r => r.content),
          reportNames: uploadedReports.map(r => r.name),
          question: userMessage.content,
          chatHistory: messages.map(m => ({ role: m.role, content: m.content })),
          conversationId: activeConversationId,
        },
      });

      if (error) throw error;

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Log question asked
      logActivityDirect({
        actionType: 'qa_question_asked',
        entityType: 'qa_conversation',
        entityId: activeConversationId,
        metadata: { question_length: userMessage.content.length }
      });

      if (messages.length === 0) {
        setTimeout(() => loadSavedConversations(), 1000);
      }
    } catch (error) {
      console.error('Chat error:', error);
      toast({
        title: 'Error',
        description: 'Failed to get a response. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyResponse = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({
      title: 'Copied',
      description: 'Response copied to clipboard',
    });
  };

  const handleOpenEmailModal = (content: string) => {
    setEmailContent(content);
    setEmailSubject(`Investment Report Summary - ${uploadedReports.map(r => r.name.replace('.pdf', '')).join(', ')}`);
    setShowEmailModal(true);
  };

  const handleSendEmail = async () => {
    if (!emailTo || !emailContent) return;

    setIsSendingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke('report-qa', {
        body: {
          action: 'send-email',
          to: emailTo,
          subject: emailSubject,
          content: emailContent,
          reportNames: uploadedReports.map(r => r.name),
        },
      });

      if (error) throw error;

      toast({
        title: 'Email sent',
        description: `Summary sent to ${emailTo}`,
      });
      setShowEmailModal(false);
      setEmailTo('');
    } catch (error) {
      console.error('Email error:', error);
      toast({
        title: 'Failed to send',
        description: error instanceof Error ? error.message : 'Could not send email',
        variant: 'destructive',
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          await transcribeAudio(audioBlob);
        }
      };
      
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Microphone error:', error);
      toast({
        title: 'Microphone access denied',
        description: 'Please allow microphone access to use voice input',
        variant: 'destructive',
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    
    // Create audio URL for playback
    const audioUrl = URL.createObjectURL(audioBlob);
    setPendingAudioUrl(audioUrl);
    
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(audioBlob);
      const base64Audio = await base64Promise;
      
      const { data, error } = await supabase.functions.invoke('report-qa', {
        body: {
          action: 'transcribe',
          audio: base64Audio,
        },
      });

      if (error) throw error;

      if (data.success && data.text) {
        setInputMessage(data.text);
      } else {
        throw new Error('No transcription result');
      }
    } catch (error) {
      console.error('Transcription error:', error);
      // Clear pending audio on error
      setPendingAudioUrl(null);
      toast({
        title: 'Transcription failed',
        description: 'Could not convert voice to text',
        variant: 'destructive',
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  const clearAll = () => {
    setUploadedReports([]);
    setMessages([]);
    setConversationId(null);
  };

  function handleNewChat() {
    setUploadedReports([]);
    setMessages([]);
    setConversationId(null);
    toast({
      title: 'New chat started',
      description: 'Upload reports or start chatting',
    });
  }

  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from('report_qa_conversations')
        .delete()
        .eq('id', convId);
      
      if (error) throw error;
      
      // Log conversation deleted
      const deletedConv = savedConversations.find(c => c.id === convId);
      logActivityDirect({
        actionType: 'qa_conversation_deleted',
        entityType: 'qa_conversation',
        entityId: convId,
        entityName: deletedConv?.title
      });
      
      setSavedConversations(prev => prev.filter(c => c.id !== convId));
      if (conversationId === convId) {
        handleNewChat();
      }
      
      toast({
        title: 'Conversation deleted',
        description: 'The conversation has been removed',
      });
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      toast({
        title: 'Failed to delete',
        description: 'Could not delete the conversation',
        variant: 'destructive',
      });
    }
  };

  // Handle pin toggle
  const handleTogglePin = (convId: string) => {
    const newPinned = togglePin(convId);
    setPinnedIds(newPinned);
    toast({
      title: isPinned(convId) ? 'Unpinned' : 'Pinned',
      description: isPinned(convId) ? 'Conversation unpinned' : 'Conversation pinned to top',
    });
  };

  // Handle conversation tags
  const handleAddTag = (tag: string) => {
    if (!conversationId) return;
    setConversationTags(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(conversationId) || [];
      if (!existing.includes(tag)) {
        newMap.set(conversationId, [...existing, tag]);
        localStorage.setItem('qa-conversation-tags', JSON.stringify([...newMap]));
      }
      return newMap;
    });
  };

  const handleRemoveTag = (tag: string) => {
    if (!conversationId) return;
    setConversationTags(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(conversationId) || [];
      newMap.set(conversationId, existing.filter(t => t !== tag));
      localStorage.setItem('qa-conversation-tags', JSON.stringify([...newMap]));
      return newMap;
    });
  };

  // Handle message threading
  const handleReply = async (messageId: string, reply: string) => {
    addReply(messageId, reply, 'user');
    // Send the reply as a new message with context
    const originalMessage = messages.find(m => m.id === messageId);
    if (originalMessage) {
      setInputMessage(`Regarding "${originalMessage.content.substring(0, 50)}...": ${reply}`);
    }
  };

  // Filter conversations based on search query
  const filteredConversations = savedConversations.filter(conv => {
    if (!historySearchQuery.trim()) return true;
    const query = historySearchQuery.toLowerCase();
    return (
      conv.title.toLowerCase().includes(query) ||
      conv.report_names.some(name => name.toLowerCase().includes(query))
    );
  });

  // Sort conversations with pinned first
  const sortedConversations = [...filteredConversations].sort((a, b) => {
    const aPinned = pinnedIds.includes(a.id);
    const bPinned = pinnedIds.includes(b.id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  // Group conversations by date
  const groupConversationsByDate = (conversations: SavedConversation[]) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    
    const groups: { [key: string]: SavedConversation[] } = {
      'Pinned': [],
      'Today': [],
      'Yesterday': [],
      'This Week': [],
      'Older': [],
    };
    
    conversations.forEach(conv => {
      if (pinnedIds.includes(conv.id)) {
        groups['Pinned'].push(conv);
        return;
      }
      const convDate = new Date(conv.updated_at);
      if (convDate.toDateString() === today.toDateString()) {
        groups['Today'].push(conv);
      } else if (convDate.toDateString() === yesterday.toDateString()) {
        groups['Yesterday'].push(conv);
      } else if (convDate > lastWeek) {
        groups['This Week'].push(conv);
      } else {
        groups['Older'].push(conv);
      }
    });
    
    return groups;
  };

  // Get current theme styles
  const getMessageBgClass = (role: 'user' | 'assistant') => {
    if (!chatTheme || chatTheme.id === 'default') {
      return role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted';
    }
    return role === 'user' ? chatTheme.userBg : chatTheme.assistantBg;
  };

  const getAccentClass = () => {
    if (!chatTheme || chatTheme.id === 'default') {
      return 'bg-primary/10';
    }
    return chatTheme.accent;
  };

  return (
    <div className="p-6 space-y-6 h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Report Q&A</h1>
          <p className="text-muted-foreground">
            Upload investment reports and ask questions to generate summaries
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleNewChat} className="gap-2">
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
          <Button variant="outline" onClick={() => setShowHistory(true)} className="gap-2">
            <History className="h-4 w-4" />
            History
            {savedConversations.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {savedConversations.length}
              </Badge>
            )}
          </Button>
          {uploadedReports.length > 0 && (
            <Button variant="outline" onClick={clearAll} className="gap-2">
              <X className="h-4 w-4" />
              Clear All
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100%-5rem)]">
        {/* Upload Section */}
        <Card className="lg:col-span-1 flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Reports ({uploadedReports.length})
            </CardTitle>
            <CardDescription>
              Upload PDF reports to use as context. Add multiple for comparison.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col space-y-4">
            {/* Upload Zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer
                ${isDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}
                ${isUploading ? 'pointer-events-none opacity-50' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  files.forEach(file => handleFileUpload(file));
                }}
              />
              {isUploading ? (
                <div className="space-y-2">
                  <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Processing...</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drop PDFs here or click to browse
                  </p>
                </div>
              )}
            </div>

            {/* Uploaded Reports List */}
            {uploadedReports.length > 0 && (
              <ScrollArea className="flex-1">
                <div className="space-y-2">
                  {uploadedReports.map((report) => (
                    <div key={report.name} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-sm truncate flex-1" title={report.name}>
                        {report.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeReport(report.name)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            {/* Comparison Badge */}
            {uploadedReports.length > 1 && (
              <div className="flex items-center gap-2 p-2 bg-blue-500/10 rounded-lg">
                <GitCompare className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-blue-600">Comparison mode active</span>
              </div>
            )}

            <Separator />

            {/* Smart Suggestions */}
            <SmartSuggestions
              hasReports={uploadedReports.length > 0}
              isComparison={uploadedReports.length > 1}
              messageCount={messages.length}
              onSelect={setInputMessage}
            />
          </CardContent>
        </Card>

        {/* Chat Section */}
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                {isEditingMainTitle && conversationId ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={mainTitleEdit}
                      onChange={(e) => setMainTitleEdit(e.target.value)}
                      className="h-7 w-48 text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveTitle(conversationId, mainTitleEdit);
                        if (e.key === 'Escape') setIsEditingMainTitle(false);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleSaveTitle(conversationId, mainTitleEdit)}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setIsEditingMainTitle(false)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{getCurrentTitle()}</CardTitle>
                    {conversationId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          setMainTitleEdit(getCurrentTitle());
                          setIsEditingMainTitle(true);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
              
              {/* Action bar */}
              <div className="flex items-center gap-1">
                {conversationId && (
                  <>
                    <PinConversation
                      conversationId={conversationId}
                      isPinned={pinnedIds.includes(conversationId)}
                      onTogglePin={handleTogglePin}
                    />
                    <ConversationTags
                      tags={conversationTags.get(conversationId) || []}
                      onAddTag={handleAddTag}
                      onRemoveTag={handleRemoveTag}
                    />
                  </>
                )}
                <ChatThemeSelector onThemeChange={setChatTheme} />
                <ConversationExport
                  messages={messages}
                  title={getCurrentTitle()}
                  reportNames={uploadedReports.map(r => r.name)}
                />
                <AutoSummarize
                  messages={messages.map(m => ({ role: m.role, content: m.content }))}
                  reportNames={uploadedReports.map(r => r.name)}
                  disabled={messages.length < 2}
                />
                <KeyboardShortcutsHelp />
                {conversationId && (
                  <Badge variant="outline" className="text-xs ml-2">Auto-saving</Badge>
                )}
              </div>
            </div>
            <CardDescription>
              {uploadedReports.length > 1 
                ? `Comparing ${uploadedReports.length} reports` 
                : 'Ask questions about the uploaded report'}
            </CardDescription>
            
            {/* Show current conversation tags */}
            {conversationId && (conversationTags.get(conversationId) || []).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                <ConversationTags
                  tags={conversationTags.get(conversationId) || []}
                  onAddTag={handleAddTag}
                  onRemoveTag={handleRemoveTag}
                  compact
                />
              </div>
            )}
          </CardHeader>
          <CardContent className="flex-1 flex flex-col min-h-0">
            {/* Messages */}
            <ScrollArea className="flex-1 pr-4 mb-4">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center p-8">
                  <div className="space-y-2">
                    <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/50" />
                    <p className="text-muted-foreground">
                      {uploadedReports.length > 0
                        ? uploadedReports.length > 1 
                          ? 'Ask a question to compare the reports'
                          : 'Ask a question about the report'
                        : 'Upload reports to start asking questions'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {message.role === 'assistant' && (
                        <div className={cn("h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0", getAccentClass())}>
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <div className={cn("max-w-[80%] rounded-lg p-3", getMessageBgClass(message.role))}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs opacity-60">
                            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-xs opacity-40">
                            {message.timestamp.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        {message.role === 'assistant' ? (
                          <div className="qa-markdown">
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]}
                              components={{
                                strong: ({ children, ...props }) => {
                                  const text = String(children);
                                  const stepMatch = text.match(/^(Step\s*\d+):?(.*)$/i);
                                  if (stepMatch) {
                                    const stepNumber = stepMatch[1];
                                    const remainder = stepMatch[2];
                                    return (
                                      <>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/20 mr-1.5">
                                          {stepNumber}
                                        </span>
                                        {remainder && <strong {...props}>{remainder}</strong>}
                                      </>
                                    );
                                  }
                                  return <strong {...props}>{children}</strong>;
                                },
                              }}
                            >
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {message.audioUrl && (
                              <VoiceMessagePlayer 
                                audioUrl={message.audioUrl} 
                                compact 
                                waveColor="rgba(255, 255, 255, 0.4)"
                                progressColor="rgba(255, 255, 255, 0.8)"
                              />
                            )}
                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          </div>
                        )}
                        {message.role === 'assistant' && (
                          <div className="space-y-2 mt-2 pt-2 border-t border-border/50">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => handleCopyResponse(message.content)}
                              >
                                <Copy className="h-3 w-3 mr-1" />
                                Copy
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => handleOpenEmailModal(message.content)}
                              >
                                <Mail className="h-3 w-3 mr-1" />
                                Email
                              </Button>
                              <QAPDFGenerator
                                content={message.content}
                                title={uploadedReports.length > 1 
                                  ? 'Property Comparison Summary'
                                  : uploadedReports.length === 1 
                                    ? 'Investment Report Summary'
                                    : 'Property Investment Analysis'}
                                reportNames={uploadedReports.map(r => r.name.replace('.pdf', ''))}
                              />
                              <MessageReactions messageId={message.id} />
                            </div>
                            <MessageThreading
                              messageId={message.id}
                              messageContent={message.content}
                              onReply={handleReply}
                              replies={getReplies(message.id)}
                            />
                          </div>
                        )}
                      </div>
                      {message.role === 'user' && (
                        <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                          <User className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                  ))}
                  {isProcessing && (
                    <TypingIndicator isMultiReport={uploadedReports.length > 1} />
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Recording indicator */}
            {isRecording && (
              <RecordingIndicator isRecording={isRecording} className="mb-2" />
            )}

            {/* Pending audio preview */}
            {pendingAudioUrl && !isRecording && (
              <div className="mb-2 p-2 rounded-lg bg-muted/50 border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Voice message ready</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setPendingAudioUrl(null)}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Remove
                  </Button>
                </div>
                <VoiceMessagePlayer audioUrl={pendingAudioUrl} compact />
              </div>
            )}

            {/* Input */}
            <div className="flex gap-2 pt-2 border-t items-end">
              <Textarea
                ref={inputRef}
                placeholder={
                  uploadedReports.length === 0 
                    ? 'Ask anything or upload a report for context...' 
                    : uploadedReports.length > 1 
                      ? 'Ask a comparison question...'
                      : 'Ask a question about the report...'
                }
                value={inputMessage}
                onChange={(e) => {
                  setInputMessage(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 300) + 'px';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={isProcessing || isRecording || isTranscribing}
                className="flex-1 min-h-[40px] max-h-[300px] resize-none overflow-y-auto"
                rows={1}
              />
              <Button
                variant={isRecording ? "destructive" : "outline"}
                size="icon"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing || isTranscribing}
                title={isRecording ? 'Stop recording' : 'Voice input'}
                className="h-10 w-10 flex-shrink-0"
              >
                {isTranscribing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isRecording ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
              <Button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || isProcessing || isRecording}
                className="h-10 flex-shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* History Dialog - Enhanced */}
      <Dialog open={showHistory} onOpenChange={(open) => {
        setShowHistory(open);
        if (!open) setHistorySearchQuery('');
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Conversation History
            </DialogTitle>
            <DialogDescription>
              Search and load previous Q&A conversations (⌘K)
            </DialogDescription>
          </DialogHeader>
          
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations by title or report name..."
              value={historySearchQuery}
              onChange={(e) => setHistorySearchQuery(e.target.value)}
              className="pl-9 pr-9"
              autoFocus
            />
            {historySearchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                onClick={() => setHistorySearchQuery('')}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          
          <ScrollArea className="max-h-[450px]">
            {savedConversations.length === 0 ? (
              <div className="text-center py-12">
                <Archive className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground font-medium">No conversations yet</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Start a new chat to create your first conversation
                </p>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="text-center py-12">
                <Search className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground font-medium">No results found</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Try a different search term
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupConversationsByDate(sortedConversations)).map(([group, convs]) => 
                  convs.length > 0 && (
                    <div key={group} className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        {group === 'Pinned' ? (
                          <Pin className="h-3 w-3 text-primary" />
                        ) : (
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                        )}
                        <span className={cn(
                          "text-xs font-medium uppercase tracking-wide",
                          group === 'Pinned' ? 'text-primary' : 'text-muted-foreground'
                        )}>
                          {group}
                        </span>
                        <Separator className="flex-1" />
                      </div>
                      {convs.map((conv) => (
                        <div
                          key={conv.id}
                          className={cn(
                            "p-3 border rounded-lg hover:bg-muted/50 transition-all group cursor-pointer",
                            conversationId === conv.id && "border-primary/50 bg-primary/5",
                            pinnedIds.includes(conv.id) && "border-primary/30"
                          )}
                        >
                          {editingConversationId === conv.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveTitle(conv.id, editingTitle);
                                  if (e.key === 'Escape') setEditingConversationId(null);
                                }}
                                className="h-7 text-sm"
                                autoFocus
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => handleSaveTitle(conv.id, editingTitle)}
                              >
                                <Check className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => setEditingConversationId(null)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div onClick={() => loadConversation(conv)}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    {pinnedIds.includes(conv.id) && (
                                      <Pin className="h-3 w-3 text-primary fill-current flex-shrink-0" />
                                    )}
                                    <p className="font-medium text-sm truncate">{conv.title}</p>
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                      {conv.report_names.length} report{conv.report_names.length !== 1 ? 's' : ''}
                                    </Badge>
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                      <Clock className="h-2.5 w-2.5" />
                                      {new Date(conv.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                  {/* Show tags in history */}
                                  {(conversationTags.get(conv.id) || []).length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                      <ConversationTags
                                        tags={conversationTags.get(conv.id) || []}
                                        onAddTag={() => {}}
                                        onRemoveTag={() => {}}
                                        compact
                                      />
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <PinConversation
                                    conversationId={conv.id}
                                    isPinned={pinnedIds.includes(conv.id)}
                                    onTogglePin={handleTogglePin}
                                    compact
                                  />
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingConversationId(conv.id);
                                        setEditingTitle(conv.title);
                                      }}>
                                        <Pencil className="h-3.5 w-3.5 mr-2" />
                                        Rename
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={(e) => {
                                        e.stopPropagation();
                                        handleTogglePin(conv.id);
                                      }}>
                                        <Pin className="h-3.5 w-3.5 mr-2" />
                                        {pinnedIds.includes(conv.id) ? 'Unpin' : 'Pin'}
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem 
                                        className="text-destructive focus:text-destructive"
                                        onClick={(e) => handleDeleteConversation(conv.id, e)}
                                      >
                                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                                        Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>
                              {/* Report names preview */}
                              <div className="mt-2 flex flex-wrap gap-1">
                                {conv.report_names.slice(0, 2).map((name, idx) => (
                                  <span key={idx} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded truncate max-w-[120px]">
                                    {name.replace('.pdf', '')}
                                  </span>
                                ))}
                                {conv.report_names.length > 2 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    +{conv.report_names.length - 2} more
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}
          </ScrollArea>
          
          {/* Footer with count */}
          {savedConversations.length > 0 && (
            <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
              <span>
                {filteredConversations.length} of {savedConversations.length} conversation{savedConversations.length !== 1 ? 's' : ''}
                {pinnedIds.length > 0 && ` • ${pinnedIds.length} pinned`}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={handleNewChat}
              >
                <Plus className="h-3 w-3 mr-1" />
                New Chat
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Email Dialog */}
      <Dialog open={showEmailModal} onOpenChange={setShowEmailModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Summary via Email</DialogTitle>
            <DialogDescription>
              Send this summary directly to a prospect
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email-to">Recipient Email</Label>
              <Input
                id="email-to"
                type="email"
                placeholder="prospect@example.com"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-subject">Subject</Label>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-content">Content</Label>
              <Textarea
                id="email-content"
                rows={8}
                value={emailContent}
                onChange={(e) => setEmailContent(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendEmail} disabled={!emailTo || isSendingEmail}>
              {isSendingEmail ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
