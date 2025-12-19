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
import { QAPDFGenerator } from '@/components/reports/QAPDFGenerator';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Upload, 
  FileText, 
  Send, 
  Copy, 
  Loader2, 
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
  Check
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
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

// Format timestamp with full date and time (hh:mm:ss AM/PM)
const formatFullTimestamp = (dateString: string) => {
  const date = new Date(dateString);
  const time = date.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: true 
  });
  const dateStr = date.toLocaleDateString([], { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
  return `${dateStr} at ${time}`;
};

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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load saved conversations on mount
  useEffect(() => {
    loadSavedConversations();
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

    // Check if already uploaded
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

    // Get or create conversation ID
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
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
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

      // Refresh conversation list to pick up dynamic title (after first exchange)
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
      console.log('Voice recording started');
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
    
    try {
      // Convert blob to base64
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
        console.log('Voice transcribed successfully');
      } else {
        throw new Error('No transcription result');
      }
    } catch (error) {
      console.error('Transcription error:', error);
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
          <Button variant="outline" onClick={() => setShowHistory(true)} className="gap-2">
            <History className="h-4 w-4" />
            History
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
                  {uploadedReports.map((report, idx) => (
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

            {/* Quick Questions */}
            {uploadedReports.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Quick Questions</p>
                <div className="flex flex-wrap gap-2">
                  {(uploadedReports.length > 1
                    ? ['Compare all properties', 'Which is the best investment?', 'Key differences?', 'Risk comparison']
                    : ['Give me a TLDR', 'Key highlights?', 'What are the risks?', 'Financial summary']
                  ).map((q) => (
                    <Badge
                      key={q}
                      variant="secondary"
                      className="cursor-pointer hover:bg-secondary/80"
                      onClick={() => setInputMessage(q)}
                    >
                      {q}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
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
              {conversationId && (
                <Badge variant="outline" className="text-xs">Auto-saving</Badge>
              )}
            </div>
            <CardDescription>
              {uploadedReports.length > 1 
                ? `Comparing ${uploadedReports.length} reports` 
                : 'Ask questions about the uploaded report'}
            </CardDescription>
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
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <div
                        className={`max-w-[80%] rounded-lg p-3 ${
                          message.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs opacity-60">
                            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-xs opacity-40">
                            {message.timestamp.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        {message.role === 'assistant' ? (
                          <div className="text-sm prose prose-sm dark:prose-invert max-w-none prose-p:mb-4 prose-p:leading-relaxed prose-headings:mt-6 prose-headings:mb-3 prose-h2:mt-8 prose-h3:mt-6 prose-ul:my-4 prose-ol:my-4 prose-li:my-2 prose-strong:font-semibold prose-blockquote:my-4 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        )}
                        {message.role === 'assistant' && (
                          <div className="flex gap-2 mt-2 pt-2 border-t border-border/50">
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
                    <div className="flex gap-3 justify-start">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                      <div className="bg-muted rounded-lg p-3">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm text-muted-foreground">
                            {uploadedReports.length > 1 ? 'Analyzing reports...' : 'Thinking...'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Input */}
            <div className="flex gap-2 pt-2 border-t items-end">
              <Textarea
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
                  // Auto-resize textarea
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

      {/* History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Conversation History</DialogTitle>
            <DialogDescription>
              Load a previous Q&A conversation
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            {savedConversations.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No saved conversations</p>
            ) : (
              <div className="space-y-2">
                {savedConversations.map((conv) => (
                  <div
                    key={conv.id}
                    className="p-3 border rounded-lg hover:bg-muted/50 transition-colors group"
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
                      <div 
                        className="cursor-pointer"
                        onClick={() => loadConversation(conv)}
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm truncate flex-1">{conv.title}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingConversationId(conv.id);
                              setEditingTitle(conv.title);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <p>{conv.report_names.length} report(s)</p>
                          <p>Created: {formatFullTimestamp(conv.created_at)}</p>
                          {conv.updated_at !== conv.created_at && (
                            <p>Updated: {formatFullTimestamp(conv.updated_at)}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
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
