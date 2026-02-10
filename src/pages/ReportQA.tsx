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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { logActivityDirect } from '@/hooks/useActivityLogger';
import { QAPDFGenerator } from '@/components/reports/QAPDFGenerator';
import { convertPdfToImages } from '@/utils/pdfToImages';
import { extractPdfTextClientSide } from '@/lib/pdfClientExtractor';
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
  Pin,
  Pause,
  Play,
  Square
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
import { StreamingTypingIndicator } from '@/components/report-qa/StreamingTypingIndicator';
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
import { PDFAttachmentMessage } from '@/components/report-qa/PDFAttachmentMessage';
import { MessageDateSeparator, shouldShowDateSeparator } from '@/components/report-qa/MessageDateSeparator';
import { CharacterCount, FailedMessageIndicator } from '@/components/report-qa/ChatInputEnhancements';
import { PDFThumbnail, UploadProgressItem } from '@/components/report-qa/PDFThumbnail';
import { ReportSwitcher, ReportSearch } from '@/components/report-qa/ReportContextSearch';
import { FollowUpSuggestions } from '@/components/report-qa/FollowUpSuggestions';
import { TextToSpeech } from '@/components/report-qa/TextToSpeech';
import { CopyWithFeedback } from '@/components/report-qa/CopyWithFeedback';
import { FullScreenToggle, useFullScreen } from '@/components/report-qa/FullScreenToggle';
import { LiveRegion, SkipToContent, useReducedMotion } from '@/components/report-qa/AccessibilityWrapper';
import { AccessibilitySettings } from '@/components/report-qa/AccessibilitySettings';
import { MobileReportsPanel, useSwipeGesture } from '@/components/report-qa/MobileReportsPanel';
import { InPlaceEmailCompose } from '@/components/report-qa/InPlaceEmailCompose';
import { ModelSelector, type ModelProvider } from '@/components/report-qa/ModelSelector';
import { ModelBadge } from '@/components/report-qa/ModelBadge';
import { ModelSwitchDivider } from '@/components/report-qa/ModelSwitchDivider';
import { PerplexityCitations } from '@/components/report-qa/PerplexityCitations';

interface UploadProgress {
  fileName: string;
  progress: number;
  status: 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
}

interface PDFAttachment {
  url: string;
  fileName: string;
  fileSize: number;
  createdAt: string;
  conversationId?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  audioUrl?: string; // For voice messages
  attachments?: PDFAttachment[]; // For PDF attachments
  modelProvider?: ModelProvider | null; // Which AI model generated this message
  citations?: string[]; // Perplexity citations
}

interface UploadedReport {
  name: string;
  content: string;
  uploadedAt: Date;
  fileSizeBytes?: number;
  totalPages?: number;
  imagesProcessed?: number;
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
  const [emailCc, setEmailCc] = useState('');
  const [emailBcc, setEmailBcc] = useState('');
  const [emailSubject, setEmailSubject] = useState('Investment Report Summary');
  const [emailContent, setEmailContent] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [selectedSenderMailbox, setSelectedSenderMailbox] = useState('');
  const [availableMailboxes, setAvailableMailboxes] = useState<{id: string; username: string; personal_mailbox: string | null}[]>([]);
  const [isLoadingMailboxes, setIsLoadingMailboxes] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [accumulatedTranscript, setAccumulatedTranscript] = useState('');
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
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [showEmailCopilotModal, setShowEmailCopilotModal] = useState(false);
  const [pendingPDFAttachment, setPendingPDFAttachment] = useState<PDFAttachment | null>(null);
  const [isValidatingPDF, setIsValidatingPDF] = useState(false);
  const [pdfValidationError, setPdfValidationError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelProvider>('openai');
  const [showInPlaceEmailCompose, setShowInPlaceEmailCompose] = useState(false);
  const [emailContext, setEmailContext] = useState<{
    title: string;
    reportNames: string;
    messageCount: number;
    sampleQuestions: string[];
    generatedAt: string;
  } | null>(null);
  
  // Phase 1 UX improvements
  const [streamingContent, setStreamingContent] = useState('');
  const [failedMessage, setFailedMessage] = useState<{ content: string; audioUrl?: string } | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const MAX_MESSAGE_LENGTH = 4000;
  
  // Phase 2 UX improvements
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [activeReportIndex, setActiveReportIndex] = useState<number | null>(null);
  
  // Phase 5 UX improvements
  const [liveTranscript, setLiveTranscript] = useState('');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [showReportsPanel, setShowReportsPanel] = useState(true);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // Custom hooks
  const { addReply, getReplies } = useMessageThreads();
  const { getPinnedIds, togglePin, isPinned } = usePinnedConversations();
  const { isFullScreen, toggleFullScreen } = useFullScreen();
  const reducedMotion = useReducedMotion();
  
  // Accessibility - live region announcements
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  // Get last assistant message for follow-up suggestions
  const lastAssistantMessage = messages.filter(m => m.role === 'assistant').pop()?.content || '';
  
  // Copy last response handler
  const handleCopyLastResponse = useCallback(() => {
    if (lastAssistantMessage) {
      navigator.clipboard.writeText(lastAssistantMessage);
      toast({
        title: 'Copied',
        description: 'Last response copied to clipboard',
      });
    }
  }, [lastAssistantMessage, toast]);

  // Scroll to bottom handler
  const handleScrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Toggle reports panel
  const handleToggleReportsPanel = useCallback(() => {
    setShowReportsPanel(prev => !prev);
  }, []);

  // Keyboard shortcuts
  useReportQAKeyboardShortcuts({
    onNewChat: handleNewChat,
    onOpenHistory: () => setShowHistory(true),
    onCloseDialogs: () => {
      setShowHistory(false);
      setShowEmailModal(false);
    },
    onFocusInput: () => inputRef.current?.focus(),
    onCopyLastResponse: handleCopyLastResponse,
    onScrollToBottom: handleScrollToBottom,
    onToggleReportsPanel: handleToggleReportsPanel,
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

  // Auto-resize textarea when inputMessage changes (e.g., from transcription)
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 300) + 'px';
    }
  }, [inputMessage]);

  const loadSavedConversations = async () => {
    try {
      console.log('[ReportQA] Loading saved conversations...');
      const { data, error } = await invokeSecureFunction('report-qa', {
        action: 'get-conversations',
      });
      
      if (error) {
        console.error('[ReportQA] Error loading conversations:', error);
        throw error;
      }
      
      const conversations = data?.conversations || [];
      console.log('[ReportQA] Loaded conversations:', conversations.length);
      setSavedConversations(conversations);
    } catch (error) {
      console.error('[ReportQA] Failed to load conversations:', error);
    }
  };

  const handleSaveTitle = async (targetConversationId: string, newTitle: string) => {
    if (!newTitle.trim()) {
      setEditingConversationId(null);
      setIsEditingMainTitle(false);
      return;
    }
    
    try {
      // Use secure edge function for update (service_role required due to RLS)
      const { data, error } = await invokeSecureFunction('report-qa', {
        action: 'update-conversation',
        conversationId: targetConversationId,
        title: newTitle.trim(),
      });
      
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to update');
      
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

    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload a file smaller than 50MB',
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

    // Add progress item
    const progressItem: UploadProgress = {
      fileName: file.name,
      progress: 0,
      status: 'uploading'
    };
    setUploadProgress(prev => [...prev, progressItem]);

    try {
      const updateProgress = (progress: number, status: UploadProgress['status']) => {
        setUploadProgress(prev => 
          prev.map(p => p.fileName === file.name ? { ...p, progress, status } : p)
        );
      };

      updateProgress(10, 'processing');

      // --- Client-side text extraction using pdfjs-dist ---
      // This runs entirely in the browser, no edge function timeouts
      const result = await extractPdfTextClientSide(file, (current, total) => {
        const pct = 10 + Math.round((current / Math.max(total, 1)) * 80);
        updateProgress(Math.min(pct, 90), 'processing');
      });

      let extractedText = result.text;

      // If client-side extraction yielded very little text (scanned PDF), fall back to server OCR
      if (extractedText.length < 500) {
        console.log(`[ReportQA] Low text from client extraction (${extractedText.length} chars), trying server-side OCR...`);
        updateProgress(85, 'processing');

        let pageImages: Array<{ pageNumber: number; base64: string; width: number; height: number; mimeType: string }> = [];
        try {
          const conv = await convertPdfToImages(file, (current, total) => {
            const pct = 85 + Math.round((current / Math.max(total, 1)) * 10);
            updateProgress(Math.min(pct, 95), 'processing');
          });

          if (conv.success) {
            pageImages = conv.images
              .slice(0, 8)
              .map((img) => ({
                pageNumber: img.pageNumber,
                base64: img.base64,
                width: img.width,
                height: img.height,
                mimeType: 'image/png',
              }));
          }
        } catch (err) {
          console.warn('PDF page image pre-render failed:', err);
        }

        if (pageImages.length > 0) {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const { data, error } = await invokeSecureFunction('report-qa', {
            action: 'extract',
            fileData: base64,
            fileName: file.name,
            pageImages,
          });

          if (!error && data?.success && data.extractedText?.length > extractedText.length) {
            extractedText = data.extractedText;
          }
        }
      }

      if (!extractedText || extractedText.length < 50) {
        throw new Error('Could not extract meaningful text from this PDF. It may be a scanned document or image-only PDF.');
      }

      updateProgress(100, 'complete');
      
      const newReport: UploadedReport = {
        name: file.name,
        content: extractedText,
        uploadedAt: new Date(),
        fileSizeBytes: file.size,
        totalPages: result.totalPages,
        imagesProcessed: 0,
      };
      
      setUploadedReports(prev => [...prev, newReport]);
      
      setTimeout(() => {
        setUploadProgress(prev => prev.filter(p => p.fileName !== file.name));
      }, 1500);
      
      toast({
        title: 'Report uploaded',
        description: `${file.name} added (${result.extractedPages}/${result.totalPages} pages). ${uploadedReports.length + 1} report(s) loaded.`,
      });

      setIsUploading(false);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadProgress(prev => 
        prev.map(p => p.fileName === file.name 
          ? { ...p, status: 'error', error: error instanceof Error ? error.message : 'Upload failed' } 
          : p
        )
      );
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

      const { data, error } = await invokeSecureFunction('report-qa', {
        action: 'create-conversation',
        reportNames: uploadedReports.map(r => r.name),
        reportContents: uploadedReports.map(r => r.content),
        title,
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
      const { data, error } = await invokeSecureFunction('report-qa', {
        action: 'load-conversation', conversationId: conv.id,
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

  const handleSendMessage = async (retryContent?: string, retryAudioUrl?: string) => {
    const messageContent = retryContent || inputMessage.trim();
    const audioUrl = retryAudioUrl || pendingAudioUrl;
    
    if (!messageContent || isProcessing) return;
    if (messageContent.length > MAX_MESSAGE_LENGTH) {
      toast({
        title: 'Message too long',
        description: `Please shorten your message to ${MAX_MESSAGE_LENGTH} characters or less.`,
        variant: 'destructive',
      });
      return;
    }

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
      content: messageContent,
      timestamp: new Date(),
      audioUrl: audioUrl || undefined,
    };

    if (!retryContent) {
      setMessages(prev => [...prev, userMessage]);
      setInputMessage('');
      // Clear accumulated transcript after sending
      setAccumulatedTranscript('');
    }
    setPendingAudioUrl(null);
    setFailedMessage(null);
    setIsProcessing(true);
    setStreamingContent('');

    try {
      // Use streaming for better UX
      const SUPABASE_URL = 'https://dduzbchuswwbefdunfct.supabase.co';
      const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdXpiY2h1c3d3YmVmZHVuZmN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0NDM4NzksImV4cCI6MjA3MTAxOTg3OX0.eSYU6fxIc3tBQuGLsdBRff0alBMkNfvv7OpW0efNjxk';
      
      // Filter reports based on active selection
      const reportsToUse = activeReportIndex !== null 
        ? [uploadedReports[activeReportIndex]]
        : uploadedReports;
      
      // Get session token from sessionStorage for authentication
      const sessionToken = sessionStorage.getItem('session_token');
      
      const response = await fetch(`${SUPABASE_URL}/functions/v1/report-qa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
        },
        credentials: 'include', // Required for HttpOnly cookies
        body: JSON.stringify({
          action: 'chat',
          reportContents: reportsToUse.map(r => r.content),
          reportNames: reportsToUse.map(r => r.name),
          question: messageContent,
          chatHistory: messages.map(m => ({ role: m.role, content: m.content })),
          conversationId: activeConversationId,
          stream: true,
          session_token: sessionToken, // Add session token to body as fallback
          modelProvider: selectedModel,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      // Stream the response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Process line by line
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              setStreamingContent(fullContent);
            }
          } catch {
            // Re-buffer partial JSON
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }

      // Create the final assistant message
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: fullContent || 'I couldn\'t generate a response. Please try again.',
        timestamp: new Date(),
        modelProvider: selectedModel,
      };

      setMessages(prev => [...prev, assistantMessage]);
      setStreamingContent('');

      // Save to database in background via secure function
      if (activeConversationId && fullContent) {
        invokeSecureFunction('manage-client-data', {
          operation: 'create',
          table: 'report_qa_messages',
          data: [
            { conversation_id: activeConversationId, role: 'user', content: messageContent },
            { conversation_id: activeConversationId, role: 'assistant', content: fullContent, model_provider: selectedModel },
          ]
        }).then(() => {
          console.log('[ReportQA] Messages saved to database');
        });
      }

      // Log question asked
      logActivityDirect({
        actionType: 'qa_question_asked',
        entityType: 'qa_conversation',
        entityId: activeConversationId,
        metadata: { question_length: messageContent.length }
      });

      if (messages.length === 0) {
        setTimeout(() => loadSavedConversations(), 1000);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setStreamingContent('');
      setFailedMessage({ content: messageContent, audioUrl: audioUrl || undefined });
      toast({
        title: 'Failed to send message',
        description: 'Click retry to try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Retry failed message
  const handleRetryMessage = () => {
    if (failedMessage) {
      setIsRetrying(true);
      handleSendMessage(failedMessage.content, failedMessage.audioUrl).finally(() => {
        setIsRetrying(false);
      });
    }
  };

  const handleCopyResponse = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({
      title: 'Copied',
      description: 'Response copied to clipboard',
    });
  };

  const fetchMailboxesForEmail = async () => {
    setIsLoadingMailboxes(true);
    try {
      // Use secure edge function for fetching mailboxes (service_role required due to RLS)
      const { data, error } = await invokeSecureFunction('report-qa', {
        action: 'get-mailboxes',
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to fetch mailboxes');

      const mailboxes = data.mailboxes || [];
      setAvailableMailboxes(mailboxes);
      
      if (mailboxes.length > 0 && !selectedSenderMailbox) {
        setSelectedSenderMailbox(mailboxes[0].personal_mailbox || '');
      }
    } catch (error) {
      console.error('Error fetching mailboxes:', error);
    } finally {
      setIsLoadingMailboxes(false);
    }
  };

  const handleOpenEmailModal = (content: string) => {
    setEmailContent(content);
    setEmailSubject(`Investment Report Summary - ${uploadedReports.map(r => r.name.replace('.pdf', '')).join(', ')}`);
    setShowEmailModal(true);
    fetchMailboxesForEmail();
  };

  const handleSendEmail = async () => {
    if (!emailTo || !emailContent) {
      toast({
        title: 'Missing Information',
        description: 'Please enter recipient email and message content.',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedSenderMailbox) {
      toast({
        title: 'Missing Sender',
        description: 'Please select a sender mailbox.',
        variant: 'destructive',
      });
      return;
    }

    setIsSendingEmail(true);
    try {
      // Parse CC emails
      const ccEmails = emailCc
        .split(',')
        .map(e => e.trim())
        .filter(e => e.length > 0);

      // Parse BCC emails
      const bccEmails = emailBcc
        .split(',')
        .map(e => e.trim())
        .filter(e => e.length > 0);

      const { data, error } = await invokeSecureFunction('send-email-reply', {
        to: emailTo.trim(),
        subject: emailSubject,
        body: emailContent,
        cc: ccEmails.length > 0 ? ccEmails : undefined,
        bcc: bccEmails.length > 0 ? bccEmails : undefined,
        senderMailbox: selectedSenderMailbox,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: 'Email sent',
        description: `Summary sent to ${emailTo}`,
      });
      setShowEmailModal(false);
      // Reset form
      setEmailTo('');
      setEmailCc('');
      setEmailBcc('');
      setSelectedSenderMailbox('');
      setShowCcBcc(false);
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

  // Maximum recording duration: 8 minutes (480 seconds)
  const MAX_RECORDING_DURATION = 480;
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const liveTranscriptTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      // Don't reset audio chunks if we're resuming from a paused state
      if (!isPaused) {
        audioChunksRef.current = [];
        setLiveTranscript('');
        setRecordingDuration(0);
      }
      setIsPaused(false);
      
      // Start duration timer with auto-stop at max duration
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          const newDuration = prev + 1;
          // Auto-stop at max duration
          if (newDuration >= MAX_RECORDING_DURATION) {
            finalizeRecording();
            toast({
              title: 'Maximum recording reached',
              description: 'Recording stopped after 8 minutes. Transcribing...',
            });
          }
          return newDuration;
        });
      }, 1000);
      
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          
          // Live transcription preview every 10 seconds (20 chunks × 500ms) to reduce API spam
          // Only do live preview for recordings under 2 minutes to save resources
          if (audioChunksRef.current.length % 20 === 0 && audioChunksRef.current.length <= 240) {
            // Debounce live transcription to prevent overlapping calls
            if (liveTranscriptTimeoutRef.current) {
              clearTimeout(liveTranscriptTimeoutRef.current);
            }
            liveTranscriptTimeoutRef.current = setTimeout(async () => {
              try {
                // Only transcribe last 30 seconds for preview (60 chunks)
                const recentChunks = audioChunksRef.current.slice(-60);
                const partialBlob = new Blob(recentChunks, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.onloadend = async () => {
                  const base64 = (reader.result as string).split(',')[1];
                  const { data } = await invokeSecureFunction('report-qa', {
                    action: 'transcribe', audio: base64,
                  });
                  if (data?.success && data?.text) {
                    setLiveTranscript(data.text);
                  }
                };
                reader.readAsDataURL(partialBlob);
              } catch {
                // Silent fail for live preview
              }
            }, 500);
          }
        }
      };
      
      mediaRecorder.onstop = async () => {
        // Clean up timers
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
        if (liveTranscriptTimeoutRef.current) {
          clearTimeout(liveTranscriptTimeoutRef.current);
          liveTranscriptTimeoutRef.current = null;
        }
        
        // Only stop tracks if we're finalizing (not pausing)
        if (!isPaused && streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        // Only transcribe if finalizing (not pausing)
        if (!isPaused && audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          console.log(`[Recording] Final audio size: ${(audioBlob.size / 1024 / 1024).toFixed(2)} MB, chunks: ${audioChunksRef.current.length}`);
          await transcribeAudio(audioBlob);
          setLiveTranscript('');
          setRecordingDuration(0);
        }
      };
      
      // Request data every 500ms for chunking
      mediaRecorder.start(500);
      setIsRecording(true);
      setLiveAnnouncement('Recording started - up to 8 minutes');
    } catch (error) {
      console.error('Microphone error:', error);
      toast({
        title: 'Microphone access denied',
        description: 'Please allow microphone access to use voice input',
        variant: 'destructive',
      });
    }
  };

  // Pause recording - keeps audio chunks and duration intact
  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.stop();
      
      // Stop the stream tracks while paused
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      // Clear the duration timer but keep the duration value
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      
      setIsPaused(true);
      setIsRecording(false);
      setLiveAnnouncement('Recording paused');
      toast({
        title: 'Recording paused',
        description: 'Click resume to continue recording',
      });
    }
  };

  // Resume recording - continues from where it left off
  const resumeRecording = async () => {
    if (isPaused) {
      // Start a new recording session but keep existing chunks
      await startRecording();
    }
  };

  // Finalize and transcribe - this is the actual "stop"
  const finalizeRecording = () => {
    if (mediaRecorderRef.current && (isRecording || isPaused)) {
      setIsPaused(false);
      
      if (isRecording) {
        // If currently recording, stop the recorder (triggers onstop)
        mediaRecorderRef.current.stop();
      } else if (isPaused && audioChunksRef.current.length > 0) {
        // If paused, manually transcribe since recorder is already stopped
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        console.log(`[Recording] Final audio size: ${(audioBlob.size / 1024 / 1024).toFixed(2)} MB, chunks: ${audioChunksRef.current.length}`);
        transcribeAudio(audioBlob);
        setLiveTranscript('');
        setRecordingDuration(0);
      }
      
      setIsRecording(false);
      setLiveAnnouncement('Recording stopped, transcribing...');
    }
  };

  // Legacy stopRecording for backward compatibility - now calls finalizeRecording
  const stopRecording = () => {
    finalizeRecording();
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
      
      const { data, error } = await invokeSecureFunction('report-qa', {
        action: 'transcribe',
        audio: base64Audio,
      });

      if (error) throw error;

      if (data.success && data.text) {
        // Append to accumulated transcript instead of replacing
        const newTranscript = accumulatedTranscript 
          ? `${accumulatedTranscript} ${data.text}`.trim()
          : data.text;
        setAccumulatedTranscript(newTranscript);
        setInputMessage(newTranscript);
        
        // Clear accumulated transcript and chunks after successful transcription
        audioChunksRef.current = [];
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

  // Clear accumulated transcript when starting fresh or sending message
  const clearAccumulatedTranscript = () => {
    setAccumulatedTranscript('');
    audioChunksRef.current = [];
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
      // Use secure edge function for delete (service_role required due to RLS)
      const { data, error } = await invokeSecureFunction('report-qa', {
        action: 'delete-conversation',
        conversationId: convId,
      });
      
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to delete');
      
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

  // Generate PDF and add to chat as attachment
  const handleGeneratePDFAttachment = async () => {
    if (!conversationId || messages.length === 0) {
      toast({
        title: 'Cannot generate PDF',
        description: 'Start a conversation first',
        variant: 'destructive',
      });
      return;
    }

    setIsGeneratingPDF(true);
    try {
      const { data, error } = await invokeSecureFunction('report-qa', {
        action: 'generate-qa-pdf',
        conversationId,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp.toISOString(),
        })),
        reportNames: uploadedReports.map(r => r.name.replace('.pdf', '')),
        title: getCurrentTitle(),
      });

      if (error) throw error;

      if (data.success && data.attachment) {
        // Add the message with attachment to the chat
        const attachmentMessage: ChatMessage = {
          id: data.messageId || `attachment-${Date.now()}`,
          role: 'assistant',
          content: `📄 I've generated a PDF summary of our conversation. You can download it or send it via email using the options below.`,
          timestamp: new Date(),
          attachments: [data.attachment],
        };
        
        setMessages(prev => [...prev, attachmentMessage]);
        
        toast({
          title: 'PDF Generated',
          description: 'Your conversation has been exported to PDF',
        });
      }
    } catch (error) {
      console.error('PDF generation error:', error);
      toast({
        title: 'PDF Generation Failed',
        description: error instanceof Error ? error.message : 'Could not generate PDF',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Handle sending PDF via Email Copilot
  const handleSendPDFViaEmail = async (attachment: PDFAttachment) => {
    setPendingPDFAttachment(attachment);
    setPdfValidationError(null);
    setShowEmailCopilotModal(true);
    
    // Validate that the PDF URL is still accessible
    setIsValidatingPDF(true);
    try {
      const response = await fetch(attachment.url, { method: 'HEAD' });
      if (!response.ok) {
        setPdfValidationError('PDF file may have expired or is no longer accessible. Try generating a new PDF.');
      }
    } catch (error) {
      console.error('PDF validation error:', error);
      setPdfValidationError('Unable to verify PDF accessibility. The file may still work.');
    } finally {
      setIsValidatingPDF(false);
    }
  };

  // Navigate to Email Copilot with the attachment pre-filled and dynamic draft
  const handleConfirmEmailCopilot = () => {
    if (pendingPDFAttachment) {
      // Build conversation summary for email draft
      const reportNames = uploadedReports.map(r => r.name.replace('.pdf', '')).join(', ');
      const messageCount = messages.length;
      const userQuestions = messages.filter(m => m.role === 'user').slice(0, 3).map(m => m.content.substring(0, 100));
      
      // Create a dynamic email context object
      const emailContext = {
        attachment: pendingPDFAttachment,
        conversationContext: {
          title: getCurrentTitle(),
          reportNames,
          messageCount,
          sampleQuestions: userQuestions,
          generatedAt: new Date().toISOString(),
        }
      };
      
      // Store the enhanced context in localStorage for Email Copilot
      localStorage.setItem('qa_pdf_attachment', JSON.stringify(emailContext));
      // Navigate to Email Copilot
      window.location.href = '/email-copilot?attachment=qa_pdf';
    }
    setShowEmailCopilotModal(false);
    setPendingPDFAttachment(null);
    setPdfValidationError(null);
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
    <>
      <SkipToContent targetId="chat-main" />
      <LiveRegion message={liveAnnouncement} />
      <div 
        className={cn(
          "p-6 space-y-6 h-[calc(100vh-4rem)]",
          isFullScreen && "report-qa-fullscreen"
        )}
        role="main"
        aria-label="Report Q&A Chat"
      >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Report Q&A</h1>
          <p className="text-sm text-muted-foreground hidden sm:block">
            Upload investment reports and ask questions to generate summaries
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FullScreenToggle isFullScreen={isFullScreen} onToggle={toggleFullScreen} />
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
          {messages.length > 0 && conversationId && (
            <Button 
              variant="outline" 
              onClick={handleGeneratePDFAttachment} 
              className="gap-2"
              disabled={isGeneratingPDF}
            >
              {isGeneratingPDF ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              Export PDF
            </Button>
          )}
          {uploadedReports.length > 0 && (
            <Button variant="outline" onClick={clearAll} className="gap-2">
              <X className="h-4 w-4" />
              Clear All
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100%-5rem)]">
        {/* Upload Section - Collapsible */}
        {showReportsPanel && (
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

            {/* Upload Progress */}
            {uploadProgress.length > 0 && (
              <div className="space-y-2">
                {uploadProgress.map((item) => (
                  <UploadProgressItem
                    key={item.fileName}
                    fileName={item.fileName}
                    progress={item.progress}
                    status={item.status}
                    error={item.error}
                  />
                ))}
              </div>
            )}

            {/* Reports Toolbar */}
            {uploadedReports.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <ReportSwitcher
                  reports={uploadedReports}
                  activeReportIndex={activeReportIndex}
                  onSelectReport={setActiveReportIndex}
                />
                <ReportSearch
                  reports={uploadedReports}
                  onResultClick={(reportIndex, _snippet) => {
                    setActiveReportIndex(reportIndex);
                    toast({
                      title: 'Report selected',
                      description: `Focused on ${uploadedReports[reportIndex].name}`,
                    });
                  }}
                />
              </div>
            )}

            {/* Uploaded Reports Grid */}
            {uploadedReports.length > 0 && (
              <ScrollArea className="flex-1">
                <div className="grid grid-cols-2 gap-2">
                  {uploadedReports.map((report, index) => (
                    <PDFThumbnail
                      key={report.name}
                      fileName={report.name}
                      content={report.content}
                      uploadedAt={report.uploadedAt}
                      fileSizeBytes={report.fileSizeBytes}
                      totalPages={report.totalPages}
                      isActive={activeReportIndex === index}
                      onClick={() => setActiveReportIndex(
                        activeReportIndex === index ? null : index
                      )}
                      onRemove={() => {
                        removeReport(report.name);
                        if (activeReportIndex === index) {
                          setActiveReportIndex(null);
                        }
                      }}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}

            {/* Comparison Badge */}
            {uploadedReports.length > 1 && activeReportIndex === null && (
              <div className="flex items-center gap-2 p-2 bg-blue-500/10 rounded-lg">
                <GitCompare className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-blue-600 dark:text-blue-400">Comparison mode active</span>
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
        )}

        {/* Chat Section */}
        <Card className={cn("flex flex-col", showReportsPanel ? "lg:col-span-2" : "lg:col-span-3")}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {!showReportsPanel && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleToggleReportsPanel}
                    title="Show reports panel (⌘B)"
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                )}
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
                {/* Model Selector */}
                <ModelSelector
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                  disabled={isProcessing}
                />
                <Separator orientation="vertical" className="h-6 mx-1" />
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
                <AccessibilitySettings />
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
          <CardContent id="chat-main" className="flex-1 flex flex-col min-h-0">
            {/* Messages */}
            <ScrollArea className="flex-1 pr-4 mb-4" aria-label="Chat messages" role="log" aria-live="polite">
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
                  {messages.map((message, index) => {
                    const previousMessage = index > 0 ? messages[index - 1] : null;
                    const showDateSep = shouldShowDateSeparator(
                      message.timestamp,
                      previousMessage?.timestamp || null
                    );
                    
                    return (
                      <div key={message.id}>
                        {showDateSep && <MessageDateSeparator date={message.timestamp} />}
                        <div className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          {message.role === 'assistant' && (
                        <div className={cn("h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0", getAccentClass())}>
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <div 
                        className={cn(
                          "max-w-[80%] rounded-lg p-3",
                          message.role === 'user' ? 'qa-chat-bubble-user' : 'qa-chat-bubble-assistant',
                          getMessageBgClass(message.role)
                        )}
                        role="article"
                        aria-label={`${message.role === 'user' ? 'You' : 'Assistant'} said`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs opacity-60">
                            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-xs opacity-40">
                            {message.timestamp.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </span>
                          {message.role === 'assistant' && message.modelProvider && (
                            <ModelBadge provider={message.modelProvider} />
                          )}
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
                        {/* PDF Attachments */}
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {message.attachments.map((attachment, idx) => (
                              <PDFAttachmentMessage
                                key={idx}
                                attachment={attachment}
                                onSendViaEmail={handleSendPDFViaEmail}
                              />
                            ))}
                          </div>
                        )}
                        {message.role === 'assistant' && !message.attachments?.length && (
                          <div className="space-y-2 mt-2 pt-2 border-t border-border/50">
                            <div className="flex flex-wrap gap-2">
                              <CopyWithFeedback content={message.content} />
                              <TextToSpeech text={message.content} />
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
                            {/* Follow-up suggestions for the last message */}
                            {index === messages.length - 1 && (
                              <FollowUpSuggestions
                                lastAssistantMessage={message.content}
                                reportContext={
                                  uploadedReports.length > 1 ? 'comparison' : 
                                  uploadedReports.length === 1 ? 'single' : 'none'
                                }
                                onSelect={(suggestion) => setInputMessage(suggestion)}
                              />
                            )}
                          </div>
                        )}
                      </div>
                      {message.role === 'user' && (
                        <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                          <User className="h-4 w-4" />
                        </div>
                      )}
                        </div>
                      </div>
                    );
                  })}
                  {isProcessing && (
                    <StreamingTypingIndicator 
                      isMultiReport={uploadedReports.length > 1} 
                      streamingContent={streamingContent}
                    />
                  )}
                  {failedMessage && !isProcessing && (
                    <FailedMessageIndicator
                      content={failedMessage.content}
                      onRetry={handleRetryMessage}
                      isRetrying={isRetrying}
                    />
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Recording indicator with live transcription - show when recording or paused */}
            {(isRecording || isPaused) && (
              <RecordingIndicator 
                isRecording={isRecording}
                isPaused={isPaused}
                liveTranscript={liveTranscript}
                duration={recordingDuration}
                maxDuration={MAX_RECORDING_DURATION}
                accumulatedText={accumulatedTranscript}
                className="mb-2" 
              />
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
            <div className="space-y-1 pt-2 border-t">
              <div className="flex gap-2 items-end">
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
              {/* Recording controls */}
              {isRecording ? (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={pauseRecording}
                    disabled={isProcessing || isTranscribing}
                    title="Pause recording"
                    className="h-10 w-10 flex-shrink-0"
                  >
                    <Pause className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={finalizeRecording}
                    disabled={isProcessing || isTranscribing}
                    title="Stop and transcribe"
                    className="h-10 w-10 flex-shrink-0"
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                </>
              ) : isPaused ? (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={resumeRecording}
                    disabled={isProcessing || isTranscribing}
                    title="Resume recording"
                    className="h-10 w-10 flex-shrink-0 border-orange-500 text-orange-500 hover:bg-orange-500/10"
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={finalizeRecording}
                    disabled={isProcessing || isTranscribing}
                    title="Stop and transcribe"
                    className="h-10 w-10 flex-shrink-0"
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button
                  variant={isTranscribing ? "outline" : "outline"}
                  size="icon"
                  onClick={startRecording}
                  disabled={isProcessing || isTranscribing}
                  title="Start voice input"
                  className="h-10 w-10 flex-shrink-0"
                >
                  {isTranscribing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>
              )}
                <Button
                  onClick={() => handleSendMessage()}
                  disabled={!inputMessage.trim() || isProcessing || isRecording || inputMessage.length > MAX_MESSAGE_LENGTH}
                  className="h-10 flex-shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <CharacterCount current={inputMessage.length} max={MAX_MESSAGE_LENGTH} />
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
      <Dialog open={showEmailModal} onOpenChange={(open) => {
        setShowEmailModal(open);
        if (!open) {
          setShowCcBcc(false);
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Send Summary via Email
            </DialogTitle>
            <DialogDescription>
              Send this summary directly to a prospect
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Sender Mailbox */}
            <div className="space-y-2">
              <Label>From *</Label>
              <Select value={selectedSenderMailbox} onValueChange={setSelectedSenderMailbox} disabled={isLoadingMailboxes}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingMailboxes ? "Loading mailboxes..." : "Select sender mailbox"} />
                </SelectTrigger>
                <SelectContent>
                  {availableMailboxes.map((mailbox) => (
                    <SelectItem key={mailbox.id} value={mailbox.personal_mailbox || ''}>
                      {mailbox.personal_mailbox} ({mailbox.username})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Recipient */}
            <div className="space-y-2">
              <Label htmlFor="email-to">To *</Label>
              <Input
                id="email-to"
                type="email"
                placeholder="recipient@example.com"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
              />
            </div>
            
            {/* CC/BCC Toggle */}
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowCcBcc(!showCcBcc)}
            >
              {showCcBcc ? '− Hide CC/BCC' : '+ Add CC/BCC'}
            </button>
            
            {/* CC/BCC Fields */}
            {showCcBcc && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email-cc">CC</Label>
                  <Input
                    id="email-cc"
                    type="text"
                    placeholder="cc@example.com (comma-separated)"
                    value={emailCc}
                    onChange={(e) => setEmailCc(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email-bcc">BCC</Label>
                  <Input
                    id="email-bcc"
                    type="text"
                    placeholder="bcc@example.com (comma-separated)"
                    value={emailBcc}
                    onChange={(e) => setEmailBcc(e.target.value)}
                  />
                </div>
              </>
            )}
            
            {/* Subject */}
            <div className="space-y-2">
              <Label htmlFor="email-subject">Subject</Label>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
              />
            </div>
            
            {/* Content */}
            <div className="space-y-2">
              <Label htmlFor="email-content">Message *</Label>
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
            <Button 
              onClick={handleSendEmail} 
              disabled={!emailTo || !emailContent || !selectedSenderMailbox || isSendingEmail}
            >
              {isSendingEmail ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Copilot Confirmation Modal */}
      <Dialog open={showEmailCopilotModal} onOpenChange={(open) => {
        setShowEmailCopilotModal(open);
        if (!open) {
          setPendingPDFAttachment(null);
          setPdfValidationError(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Send PDF via Email Copilot
            </DialogTitle>
            <DialogDescription>
              You'll be redirected to Email Copilot with this PDF ready to send.
            </DialogDescription>
          </DialogHeader>
          
          {pendingPDFAttachment && (
            <div className="space-y-4">
              {/* PDF File Preview */}
              <div className="p-4 bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary/10 rounded-lg">
                    <FileText className="h-8 w-8 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{pendingPDFAttachment.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {(pendingPDFAttachment.fileSize / 1024).toFixed(1)} KB • Generated {new Date(pendingPDFAttachment.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                  {isValidatingPDF ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : pdfValidationError ? (
                    <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                      Warning
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Ready
                    </Badge>
                  )}
                </div>
              </div>
              
              {/* Email Preview */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Email Subject Preview</Label>
                <div className="p-3 bg-muted/50 rounded-md text-sm">
                  {uploadedReports.length > 0 
                    ? `Property Analysis: ${uploadedReports.map(r => r.name.replace('.pdf', '')).join(', ').substring(0, 50)}${uploadedReports.map(r => r.name.replace('.pdf', '')).join(', ').length > 50 ? '...' : ''}`
                    : `Q&A Conversation Export - ${pendingPDFAttachment.fileName}`
                  }
                </div>
              </div>
              
              {/* Context info */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" />
                  {messages.length} messages
                </div>
                <div className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  {uploadedReports.length} report{uploadedReports.length !== 1 ? 's' : ''}
                </div>
              </div>
              
              {/* Validation warning */}
              {pdfValidationError && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
                  <p className="text-xs text-amber-700 dark:text-amber-400">{pdfValidationError}</p>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowEmailCopilotModal(false);
                setPendingPDFAttachment(null);
                setPdfValidationError(null);
              }}
              className="sm:mr-auto"
            >
              Cancel
            </Button>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button 
                variant="secondary"
                onClick={handleConfirmEmailCopilot}
                disabled={isValidatingPDF}
                className="flex-1 sm:flex-none"
              >
                {isValidatingPDF ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Open Email Copilot
                  </>
                )}
              </Button>
              <Button 
                onClick={() => {
                  // Build context for in-place compose
                  const reportNames = uploadedReports.map(r => r.name.replace('.pdf', '')).join(', ');
                  const messageCount = messages.length;
                  const userQuestions = messages.filter(m => m.role === 'user').slice(0, 3).map(m => m.content.substring(0, 100));
                  
                  setEmailContext({
                    title: getCurrentTitle(),
                    reportNames,
                    messageCount,
                    sampleQuestions: userQuestions,
                    generatedAt: new Date().toISOString(),
                  });
                  
                  setShowEmailCopilotModal(false);
                  setShowInPlaceEmailCompose(true);
                }}
                disabled={isValidatingPDF || !!pdfValidationError}
                className="flex-1 sm:flex-none"
              >
                <Send className="h-4 w-4 mr-2" />
                Send Now
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* In-Place Email Compose Modal */}
      <InPlaceEmailCompose
        open={showInPlaceEmailCompose}
        onOpenChange={(open) => {
          setShowInPlaceEmailCompose(open);
          if (!open) {
            setPendingPDFAttachment(null);
            setEmailContext(null);
          }
        }}
        attachment={pendingPDFAttachment}
        context={emailContext || undefined}
        onSuccess={() => {
          toast({
            title: 'Email Sent Successfully',
            description: 'Your Q&A conversation PDF has been delivered.',
          });
        }}
      />
      </div>
    </>
  );
}
