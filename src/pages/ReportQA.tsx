import { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Upload, 
  FileText, 
  Send, 
  Copy, 
  FileDown, 
  Loader2, 
  MessageSquare,
  X,
  CheckCircle2,
  User,
  Bot
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

export default function ReportQA() {
  const { toast } = useToast();
  const [uploadedReport, setUploadedReport] = useState<UploadedReport | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.type.includes('pdf')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a PDF file',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      toast({
        title: 'File too large',
        description: 'Please upload a file smaller than 10MB',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        
        // Send to edge function for text extraction
        const { data, error } = await supabase.functions.invoke('report-qa', {
          body: {
            action: 'extract',
            fileData: base64,
            fileName: file.name,
          },
        });

        if (error) throw error;

        if (data.success) {
          setUploadedReport({
            name: file.name,
            content: data.extractedText,
            uploadedAt: new Date(),
          });
          setMessages([]);
          toast({
            title: 'Report uploaded',
            description: `${file.name} is ready for Q&A`,
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
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !uploadedReport || isProcessing) return;

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
          reportContent: uploadedReport.content,
          question: userMessage.content,
          chatHistory: messages.map(m => ({ role: m.role, content: m.content })),
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

  const handleExportToPDF = async (content: string) => {
    try {
      toast({
        title: 'Generating PDF',
        description: 'Creating PDF document...',
      });

      const { data, error } = await supabase.functions.invoke('report-qa', {
        body: {
          action: 'export-pdf',
          content: content,
          reportName: uploadedReport?.name || 'Report Summary',
        },
      });

      if (error) throw error;

      // Download the PDF
      const link = document.createElement('a');
      link.href = data.pdfDataUrl;
      link.download = `Summary - ${uploadedReport?.name || 'Report'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'PDF Downloaded',
        description: 'Your summary has been exported',
      });
    } catch (error) {
      console.error('PDF export error:', error);
      toast({
        title: 'Export failed',
        description: 'Failed to generate PDF',
        variant: 'destructive',
      });
    }
  };

  const clearReport = () => {
    setUploadedReport(null);
    setMessages([]);
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
        {uploadedReport && (
          <Button variant="outline" onClick={clearReport} className="gap-2">
            <X className="h-4 w-4" />
            Clear Report
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100%-5rem)]">
        {/* Upload Section */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Report Upload
            </CardTitle>
            <CardDescription>
              Upload a PDF investment report to use as context
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!uploadedReport ? (
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
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
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                />
                {isUploading ? (
                  <div className="space-y-2">
                    <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Processing report...</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Drag & drop a PDF here, or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground">Max 10MB</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{uploadedReport.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Uploaded {uploadedReport.uploadedAt.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium mb-1">Report loaded successfully</p>
                  <p className="text-xs">
                    {uploadedReport.content.length.toLocaleString()} characters extracted
                  </p>
                </div>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">Quick Questions</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Give me a TLDR',
                      'Key investment highlights?',
                      'What are the risks?',
                      'Financial summary',
                    ].map((q) => (
                      <Badge
                        key={q}
                        variant="secondary"
                        className="cursor-pointer hover:bg-secondary/80"
                        onClick={() => {
                          setInputMessage(q);
                        }}
                      >
                        {q}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chat Section */}
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Chat
            </CardTitle>
            <CardDescription>
              Ask questions about the uploaded report
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
                      {uploadedReport
                        ? 'Ask a question about the report'
                        : 'Upload a report to start asking questions'}
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
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
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
                              onClick={() => handleExportToPDF(message.content)}
                            >
                              <FileDown className="h-3 w-3 mr-1" />
                              PDF
                            </Button>
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
                          <span className="text-sm text-muted-foreground">Thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Input */}
            <div className="flex gap-2 pt-2 border-t">
              <Input
                placeholder={uploadedReport ? 'Ask a question...' : 'Upload a report first'}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={!uploadedReport || isProcessing}
                className="flex-1"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!uploadedReport || !inputMessage.trim() || isProcessing}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
