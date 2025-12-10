import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Mail, 
  FileText, 
  MessageSquare, 
  Clock, 
  AlertCircle, 
  CheckCircle,
  Plus,
  Trash2,
  Copy,
  RefreshCw,
  Archive,
  Link as LinkIcon,
  Sparkles,
  User,
  Calendar,
  Inbox,
  Send,
  MoreVertical,
  Reply,
  Star,
  ChevronRight
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';

interface EmailSummary {
  tldr: string;
  keyPoints: string[];
  requiredActions: string[];
  urgencyLevel: 'low' | 'medium' | 'high';
}

interface Email {
  id: string;
  sender: string;
  subject: string;
  body: string;
  received_at: string;
  summary: EmailSummary | null;
  draft_reply: string | null;
  urgency_level: 'low' | 'medium' | 'high' | null;
  linked_property_address: string | null;
  linked_report_id: string | null;
  status: 'unread' | 'read' | 'summarized' | 'drafted' | 'archived';
  created_at: string;
}

// Helper to extract sender name from email
function extractSenderName(sender: string): string {
  // If it looks like "Name <email@domain.com>", extract the name
  const match = sender.match(/^([^<]+)</);
  if (match) return match[1].trim();
  
  // If it's just an email, extract the part before @
  const emailMatch = sender.match(/^([^@]+)@/);
  if (emailMatch) {
    // Convert to title case
    return emailMatch[1]
      .split(/[._-]/)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }
  
  return sender;
}

// Helper to get initials from sender
function getSenderInitials(sender: string): string {
  const name = extractSenderName(sender);
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// Helper to format date intelligently
function formatEmailDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) {
    return format(date, 'h:mm a');
  }
  if (isYesterday(date)) {
    return 'Yesterday';
  }
  return format(date, 'MMM d');
}

// Helper to format full date
function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr);
  return format(date, "EEEE, MMMM d, yyyy 'at' h:mm a");
}

// Helper to format email body with proper paragraphs
function formatEmailBody(body: string): string {
  if (!body) return '';
  
  // Clean up excessive whitespace but preserve paragraph breaks
  return body
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function EmailCopilot() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [currentDraft, setCurrentDraft] = useState('');
  
  // New email form state
  const [newEmail, setNewEmail] = useState({
    sender: '',
    subject: '',
    body: '',
    received_at: new Date().toISOString().split('T')[0]
  });

  const handleSyncOutlook = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('outlook-email-sync', {
        body: { action: 'sync', limit: 50 }
      });

      if (error) throw error;

      if (data.inserted > 0) {
        toast.success(`Synced ${data.inserted} new emails from Outlook`);
      } else {
        toast.info('No new emails to sync');
      }
      fetchEmails();
    } catch (error) {
      console.error('Error syncing Outlook:', error);
      toast.error('Failed to sync emails from Outlook');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    // Auto-sync from Outlook on page load
    handleSyncOutlook();
  }, []);

  const fetchEmails = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_copilot_emails')
        .select('*')
        .order('received_at', { ascending: false });

      if (error) throw error;
      
      // Type assertion with proper handling
      const typedEmails: Email[] = (data || []).map(email => ({
        id: email.id,
        sender: email.sender,
        subject: email.subject,
        body: email.body,
        received_at: email.received_at,
        summary: email.summary as unknown as EmailSummary | null,
        draft_reply: email.draft_reply,
        urgency_level: email.urgency_level as 'low' | 'medium' | 'high' | null,
        linked_property_address: email.linked_property_address,
        linked_report_id: email.linked_report_id,
        status: email.status as Email['status'],
        created_at: email.created_at
      }));
      
      setEmails(typedEmails);
    } catch (error) {
      console.error('Error fetching emails:', error);
      toast.error('Failed to fetch emails');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddEmail = async () => {
    if (!newEmail.sender || !newEmail.subject || !newEmail.body) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('email-copilot', {
        body: {
          action: 'save_email',
          email: {
            sender: newEmail.sender,
            subject: newEmail.subject,
            body: newEmail.body,
            received_at: new Date(newEmail.received_at).toISOString()
          }
        }
      });

      if (error) throw error;

      toast.success('Email added successfully');
      setShowAddModal(false);
      setNewEmail({ sender: '', subject: '', body: '', received_at: new Date().toISOString().split('T')[0] });
      fetchEmails();
    } catch (error) {
      console.error('Error adding email:', error);
      toast.error('Failed to add email');
    }
  };

  const handleSummarize = async () => {
    if (!selectedEmail) return;
    
    setIsSummarizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('email-copilot', {
        body: {
          action: 'summarize',
          email: {
            sender: selectedEmail.sender,
            subject: selectedEmail.subject,
            body: selectedEmail.body,
            received_at: selectedEmail.received_at
          },
          emailId: selectedEmail.id
        }
      });

      if (error) throw error;

      toast.success('Email summarized');
      
      // Update local state
      setSelectedEmail({
        ...selectedEmail,
        summary: data.summary,
        urgency_level: data.summary.urgencyLevel,
        status: 'summarized'
      });
      
      fetchEmails();
    } catch (error) {
      console.error('Error summarizing:', error);
      toast.error('Failed to summarize email');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleDraftReply = async () => {
    if (!selectedEmail) return;
    
    setIsDrafting(true);
    try {
      const { data, error } = await supabase.functions.invoke('email-copilot', {
        body: {
          action: 'draft_reply',
          email: {
            sender: selectedEmail.sender,
            subject: selectedEmail.subject,
            body: selectedEmail.body,
            received_at: selectedEmail.received_at
          },
          emailId: selectedEmail.id,
          linkedPropertyAddress: selectedEmail.linked_property_address
        }
      });

      if (error) throw error;

      setCurrentDraft(data.draftReply);
      setShowDraftModal(true);
      
      // Update local state
      setSelectedEmail({
        ...selectedEmail,
        draft_reply: data.draftReply,
        status: 'drafted'
      });
      
      fetchEmails();
    } catch (error) {
      console.error('Error drafting reply:', error);
      toast.error('Failed to draft reply');
    } finally {
      setIsDrafting(false);
    }
  };

  const handleCopyDraft = () => {
    navigator.clipboard.writeText(currentDraft);
    toast.success('Draft copied to clipboard');
  };

  const handleArchiveEmail = async () => {
    if (!selectedEmail) return;
    
    try {
      const { error } = await supabase
        .from('email_copilot_emails')
        .update({ status: 'archived' })
        .eq('id', selectedEmail.id);

      if (error) throw error;

      toast.success('Email archived');
      setSelectedEmail(null);
      fetchEmails();
    } catch (error) {
      console.error('Error archiving:', error);
      toast.error('Failed to archive email');
    }
  };

  const handleDeleteEmail = async () => {
    if (!selectedEmail) return;
    
    try {
      const { error } = await supabase
        .from('email_copilot_emails')
        .delete()
        .eq('id', selectedEmail.id);

      if (error) throw error;

      toast.success('Email deleted');
      setSelectedEmail(null);
      fetchEmails();
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Failed to delete email');
    }
  };

  const getUrgencyBadge = (level: string | null) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string; className: string }> = {
      high: { variant: 'destructive', label: 'High', className: 'bg-destructive/10 text-destructive border-destructive/20' },
      medium: { variant: 'default', label: 'Medium', className: 'bg-warning/10 text-warning border-warning/20' },
      low: { variant: 'secondary', label: 'Low', className: 'bg-muted text-muted-foreground' }
    };
    const config = variants[level || 'low'] || variants.low;
    return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; className: string }> = {
      unread: { label: 'Unread', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
      read: { label: 'Read', className: 'bg-muted text-muted-foreground' },
      summarized: { label: 'Summarized', className: 'bg-green-500/10 text-green-600 border-green-500/20' },
      drafted: { label: 'Draft Ready', className: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
      archived: { label: 'Archived', className: 'bg-muted text-muted-foreground' }
    };
    const { label, className } = config[status] || config.read;
    return <Badge variant="outline" className={className}>{label}</Badge>;
  };

  const activeEmails = emails.filter(e => e.status !== 'archived');
  const unreadCount = activeEmails.filter(e => e.status === 'unread').length;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              Email Copilot
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-xs">{unreadCount} new</Badge>
              )}
            </h1>
            <p className="text-xs text-muted-foreground">AI-powered email summaries & draft replies</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSyncOutlook} disabled={isSyncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync Inbox'}
          </Button>
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Email
          </Button>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="px-6 py-2 bg-muted/30 border-b">
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <AlertCircle className="h-3 w-3" />
          <span><strong>Human-in-the-loop:</strong> All AI outputs are drafts. Review before sending.</span>
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Email List Panel */}
        <div className="w-[380px] border-r flex flex-col bg-background">
          <div className="px-4 py-3 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Inbox className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Inbox</span>
                <span className="text-xs text-muted-foreground">({activeEmails.length})</span>
              </div>
            </div>
          </div>
          
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="p-8 text-center">
                <RefreshCw className="h-6 w-6 mx-auto mb-2 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading emails...</p>
              </div>
            ) : activeEmails.length === 0 ? (
              <div className="p-8 text-center">
                <Inbox className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-sm font-medium text-muted-foreground">No emails</p>
                <p className="text-xs text-muted-foreground mt-1">Sync your inbox or add an email</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {activeEmails.map((email) => (
                  <div
                    key={email.id}
                    onClick={() => setSelectedEmail(email)}
                    className={`px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50 ${
                      selectedEmail?.id === email.id ? 'bg-muted border-l-2 border-l-primary' : ''
                    } ${email.status === 'unread' ? 'bg-primary/5' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-primary">
                          {getSenderInitials(email.sender)}
                        </span>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className={`text-sm truncate ${email.status === 'unread' ? 'font-semibold' : 'font-medium'}`}>
                            {extractSenderName(email.sender)}
                          </span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {formatEmailDate(email.received_at)}
                          </span>
                        </div>
                        <p className={`text-sm truncate ${email.status === 'unread' ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                          {email.subject || '(No Subject)'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {email.body.slice(0, 80).replace(/\n/g, ' ')}...
                        </p>
                        
                        {/* Status indicators */}
                        <div className="flex items-center gap-1.5 mt-2">
                          {email.urgency_level && email.urgency_level !== 'low' && (
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                              email.urgency_level === 'high' ? 'text-destructive border-destructive/30' : 'text-warning border-warning/30'
                            }`}>
                              {email.urgency_level === 'high' ? '🔴' : '🟡'} {email.urgency_level}
                            </Badge>
                          )}
                          {email.summary && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-600 border-green-500/30">
                              <Sparkles className="h-2.5 w-2.5 mr-0.5" /> AI Summary
                            </Badge>
                          )}
                          {email.draft_reply && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-purple-600 border-purple-500/30">
                              <MessageSquare className="h-2.5 w-2.5 mr-0.5" /> Draft
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Email Detail Panel */}
        <div className="flex-1 flex flex-col bg-muted/20 overflow-hidden">
          {selectedEmail ? (
            <>
              {/* Email Header */}
              <div className="px-6 py-4 bg-background border-b">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-base font-semibold text-primary">
                        {getSenderInitials(selectedEmail.sender)}
                      </span>
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">{selectedEmail.subject || '(No Subject)'}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm font-medium">{extractSenderName(selectedEmail.sender)}</span>
                        <span className="text-sm text-muted-foreground">&lt;{selectedEmail.sender}&gt;</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{formatFullDate(selectedEmail.received_at)}</span>
                        <span className="text-muted-foreground/50">•</span>
                        <span>{formatDistanceToNow(new Date(selectedEmail.received_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(selectedEmail.status)}
                    {selectedEmail.urgency_level && getUrgencyBadge(selectedEmail.urgency_level)}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={handleArchiveEmail}>
                          <Archive className="h-4 w-4 mr-2" />
                          Archive
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleDeleteEmail} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>

              {/* Email Content */}
              <ScrollArea className="flex-1">
                <div className="p-6 space-y-6">
                  {/* Email Body */}
                  <div className="bg-background rounded-lg border p-6">
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      {formatEmailBody(selectedEmail.body).split('\n\n').map((paragraph, i) => (
                        <p key={i} className="text-sm text-foreground leading-relaxed mb-3 last:mb-0">
                          {paragraph.split('\n').map((line, j) => (
                            <span key={j}>
                              {line}
                              {j < paragraph.split('\n').length - 1 && <br />}
                            </span>
                          ))}
                        </p>
                      ))}
                    </div>
                  </div>

                  {/* AI Summary */}
                  {selectedEmail.summary && (
                    <div className="bg-background rounded-lg border overflow-hidden">
                      <div className="px-4 py-3 bg-primary/5 border-b flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">AI Summary</span>
                      </div>
                      <div className="p-4 space-y-4">
                        <div>
                          <Label className="text-xs uppercase text-muted-foreground font-semibold">TL;DR</Label>
                          <p className="text-sm mt-1">{selectedEmail.summary.tldr}</p>
                        </div>
                        {selectedEmail.summary.keyPoints.length > 0 && (
                          <div>
                            <Label className="text-xs uppercase text-muted-foreground font-semibold">Key Points</Label>
                            <ul className="mt-1 space-y-1">
                              {selectedEmail.summary.keyPoints.map((point, i) => (
                                <li key={i} className="text-sm flex items-start gap-2">
                                  <ChevronRight className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                                  <span>{point}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {selectedEmail.summary.requiredActions.length > 0 && (
                          <div>
                            <Label className="text-xs uppercase text-muted-foreground font-semibold">Required Actions</Label>
                            <ul className="mt-1 space-y-1">
                              {selectedEmail.summary.requiredActions.map((action, i) => (
                                <li key={i} className="text-sm flex items-start gap-2">
                                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                                  <span>{action}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Draft Reply Preview */}
                  {selectedEmail.draft_reply && (
                    <div className="bg-background rounded-lg border overflow-hidden">
                      <div className="px-4 py-3 bg-purple-500/5 border-b flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-purple-600" />
                          <span className="text-sm font-medium">Draft Reply</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => {
                          setCurrentDraft(selectedEmail.draft_reply || '');
                          setShowDraftModal(true);
                        }}>
                          View Full Draft
                        </Button>
                      </div>
                      <div className="p-4">
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {selectedEmail.draft_reply}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Action Bar */}
              <div className="px-6 py-4 bg-background border-t flex items-center gap-3">
                <Button 
                  onClick={handleSummarize} 
                  disabled={isSummarizing}
                  variant={selectedEmail.summary ? "outline" : "default"}
                >
                  <Sparkles className={`h-4 w-4 mr-2 ${isSummarizing ? 'animate-pulse' : ''}`} />
                  {isSummarizing ? 'Summarizing...' : selectedEmail.summary ? 'Re-summarize' : 'Summarize'}
                </Button>
                <Button 
                  onClick={handleDraftReply} 
                  disabled={isDrafting}
                  variant="outline"
                >
                  <Reply className={`h-4 w-4 mr-2 ${isDrafting ? 'animate-pulse' : ''}`} />
                  {isDrafting ? 'Drafting...' : 'Draft Reply'}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Mail className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
                <p className="text-lg font-medium text-muted-foreground">Select an email</p>
                <p className="text-sm text-muted-foreground/70 mt-1">Choose an email from the list to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Email Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Email Manually</DialogTitle>
            <DialogDescription>
              Paste email content to process with AI
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="sender">From (Email Address) *</Label>
              <Input
                id="sender"
                placeholder="sender@example.com"
                value={newEmail.sender}
                onChange={(e) => setNewEmail({ ...newEmail, sender: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="subject">Subject *</Label>
              <Input
                id="subject"
                placeholder="Email subject"
                value={newEmail.subject}
                onChange={(e) => setNewEmail({ ...newEmail, subject: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="received">Received Date</Label>
              <Input
                id="received"
                type="date"
                value={newEmail.received_at}
                onChange={(e) => setNewEmail({ ...newEmail, received_at: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="body">Email Body *</Label>
              <Textarea
                id="body"
                placeholder="Paste the email content here..."
                className="h-40"
                value={newEmail.body}
                onChange={(e) => setNewEmail({ ...newEmail, body: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button onClick={handleAddEmail}>Add Email</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Draft Reply Modal */}
      <Dialog open={showDraftModal} onOpenChange={setShowDraftModal}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-purple-600" />
              Draft Reply
            </DialogTitle>
            <DialogDescription>
              Review and edit before copying to your email client
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            <Textarea
              value={currentDraft}
              onChange={(e) => setCurrentDraft(e.target.value)}
              className="h-[400px] resize-none font-sans text-sm"
              placeholder="Draft reply will appear here..."
            />
          </div>
          <DialogFooter className="flex justify-between">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Remember to review before sending
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowDraftModal(false)}>Close</Button>
              <Button onClick={handleCopyDraft}>
                <Copy className="h-4 w-4 mr-2" />
                Copy to Clipboard
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}