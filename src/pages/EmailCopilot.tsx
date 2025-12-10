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
  Sparkles
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
import { format } from 'date-fns';

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

  useEffect(() => {
    fetchEmails();
  }, []);

  const handleSyncOutlook = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('outlook-email-sync', {
        body: { action: 'sync', limit: 50 }
      });

      if (error) throw error;

      toast.success(`Synced ${data.inserted} new emails from Outlook`);
      fetchEmails();
    } catch (error) {
      console.error('Error syncing Outlook:', error);
      toast.error('Failed to sync emails from Outlook');
    } finally {
      setIsSyncing(false);
    }
  };

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
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      high: { variant: 'destructive', label: 'High Urgency' },
      medium: { variant: 'default', label: 'Medium Urgency' },
      low: { variant: 'secondary', label: 'Low Urgency' }
    };
    const config = variants[level || 'low'] || variants.low;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'unread': return <Mail className="h-4 w-4 text-muted-foreground" />;
      case 'read': return <CheckCircle className="h-4 w-4 text-blue-500" />;
      case 'summarized': return <FileText className="h-4 w-4 text-green-500" />;
      case 'drafted': return <MessageSquare className="h-4 w-4 text-purple-500" />;
      case 'archived': return <Archive className="h-4 w-4 text-muted-foreground" />;
      default: return <Mail className="h-4 w-4" />;
    }
  };

  return (
    <div className="p-6 h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Email Copilot
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Draft & Summary Tool — AI-assisted email handling
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSyncOutlook} disabled={isSyncing}>
            <Mail className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-pulse' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync Outlook'}
          </Button>
          <Button variant="outline" onClick={fetchEmails} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Email
          </Button>
        </div>
      </div>

      {/* Disclaimer Banner */}
      <div className="bg-muted/50 border border-border rounded-lg p-3 mb-6 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <strong>Human-in-the-loop:</strong> All AI-generated summaries and replies are drafts only. 
          Always review, edit, and manually send responses. No emails are sent automatically.
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-12 gap-6 h-[calc(100%-160px)]">
        {/* Email List */}
        <div className="col-span-4">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Emails</CardTitle>
              <CardDescription>
                {emails.filter(e => e.status !== 'archived').length} active emails
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-380px)]">
                {isLoading ? (
                  <div className="p-4 text-center text-muted-foreground">Loading...</div>
                ) : emails.filter(e => e.status !== 'archived').length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No emails yet</p>
                    <p className="text-sm mt-1">Add an email to get started</p>
                  </div>
                ) : (
                  emails
                    .filter(e => e.status !== 'archived')
                    .map((email) => (
                      <div
                        key={email.id}
                        onClick={() => setSelectedEmail(email)}
                        className={`p-4 border-b border-border cursor-pointer hover:bg-muted/50 transition-colors ${
                          selectedEmail?.id === email.id ? 'bg-muted' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {getStatusIcon(email.status)}
                              <span className="font-medium text-sm truncate">
                                {email.sender}
                              </span>
                            </div>
                            <p className="text-sm font-medium truncate">{email.subject}</p>
                            <p className="text-xs text-muted-foreground truncate mt-1">
                              {email.body.slice(0, 60)}...
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(email.received_at), 'MMM d')}
                            </span>
                            {email.urgency_level && (
                              <div className="scale-75 origin-right">
                                {getUrgencyBadge(email.urgency_level)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Email Detail & Actions */}
        <div className="col-span-8">
          {selectedEmail ? (
            <Card className="h-full flex flex-col">
              <CardHeader className="pb-3 flex-shrink-0">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{selectedEmail.subject}</CardTitle>
                    <CardDescription className="mt-1">
                      From: {selectedEmail.sender} • {format(new Date(selectedEmail.received_at), 'PPP')}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {getUrgencyBadge(selectedEmail.urgency_level)}
                    <Badge variant="outline">{selectedEmail.status}</Badge>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="flex-1 overflow-hidden flex flex-col gap-4">
                {/* Email Body */}
                <div className="flex-1 min-h-0">
                  <Label className="text-sm font-medium mb-2 block">Email Content</Label>
                  <ScrollArea className="h-[200px] border rounded-md p-3 bg-muted/30">
                    <pre className="whitespace-pre-wrap text-sm font-sans">
                      {selectedEmail.body}
                    </pre>
                  </ScrollArea>
                </div>

                {/* AI Summary Section */}
                {selectedEmail.summary && (
                  <div className="flex-shrink-0">
                    <Label className="text-sm font-medium mb-2 block flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      AI Summary
                    </Label>
                    <div className="border rounded-md p-4 bg-primary/5 space-y-3">
                      <div>
                        <span className="text-xs font-semibold text-muted-foreground uppercase">TL;DR</span>
                        <p className="text-sm mt-1">{selectedEmail.summary.tldr}</p>
                      </div>
                      {selectedEmail.summary.keyPoints.length > 0 && (
                        <div>
                          <span className="text-xs font-semibold text-muted-foreground uppercase">Key Points</span>
                          <ul className="list-disc list-inside text-sm mt-1 space-y-1">
                            {selectedEmail.summary.keyPoints.map((point, i) => (
                              <li key={i}>{point}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {selectedEmail.summary.requiredActions.length > 0 && (
                        <div>
                          <span className="text-xs font-semibold text-muted-foreground uppercase">Required Actions</span>
                          <ul className="list-disc list-inside text-sm mt-1 space-y-1">
                            {selectedEmail.summary.requiredActions.map((action, i) => (
                              <li key={i}>{action}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <Separator />
                <div className="flex items-center justify-between flex-shrink-0">
                  <div className="flex gap-2">
                    <Button 
                      onClick={handleSummarize} 
                      disabled={isSummarizing}
                      variant="outline"
                    >
                      {isSummarizing ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <FileText className="h-4 w-4 mr-2" />
                      )}
                      Summarize
                    </Button>
                    <Button 
                      onClick={handleDraftReply} 
                      disabled={isDrafting}
                    >
                      {isDrafting ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <MessageSquare className="h-4 w-4 mr-2" />
                      )}
                      Draft Reply
                    </Button>
                    {selectedEmail.draft_reply && (
                      <Button 
                        variant="secondary"
                        onClick={() => {
                          setCurrentDraft(selectedEmail.draft_reply || '');
                          setShowDraftModal(true);
                        }}
                      >
                        View Draft
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={handleArchiveEmail}>
                      <Archive className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={handleDeleteEmail}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Mail className="h-16 w-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">Select an email</p>
                <p className="text-sm mt-1">Choose an email from the list to view details and use AI tools</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Add Email Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Email</DialogTitle>
            <DialogDescription>
              Paste or enter email details manually
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>From (Sender)</Label>
                <Input
                  placeholder="sender@example.com"
                  value={newEmail.sender}
                  onChange={(e) => setNewEmail({ ...newEmail, sender: e.target.value })}
                />
              </div>
              <div>
                <Label>Received Date</Label>
                <Input
                  type="date"
                  value={newEmail.received_at}
                  onChange={(e) => setNewEmail({ ...newEmail, received_at: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Subject</Label>
              <Input
                placeholder="Email subject"
                value={newEmail.subject}
                onChange={(e) => setNewEmail({ ...newEmail, subject: e.target.value })}
              />
            </div>
            <div>
              <Label>Email Body</Label>
              <Textarea
                placeholder="Paste the full email content here..."
                className="min-h-[200px]"
                value={newEmail.body}
                onChange={(e) => setNewEmail({ ...newEmail, body: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddEmail}>
              Add Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Draft Reply Modal */}
      <Dialog open={showDraftModal} onOpenChange={setShowDraftModal}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI-Generated Draft Reply
            </DialogTitle>
            <DialogDescription>
              Review and edit this draft before copying. This will NOT be sent automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 mb-4 text-sm text-amber-800 dark:text-amber-200">
              <strong>⚠️ AI-generated.</strong> Please review carefully before use. 
              Copy and paste into your email client to send manually.
            </div>
            <Textarea
              value={currentDraft}
              onChange={(e) => setCurrentDraft(e.target.value)}
              className="min-h-[300px] font-mono text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDraftModal(false)}>
              Close
            </Button>
            <Button onClick={handleCopyDraft}>
              <Copy className="h-4 w-4 mr-2" />
              Copy to Clipboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
