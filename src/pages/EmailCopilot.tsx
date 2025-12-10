import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useEmailNotifications } from '@/hooks/useEmailNotifications';
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
  ChevronRight,
  Search,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Bell,
  BellOff
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
  cc_recipients: string[];
  bcc_recipients: string[];
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
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [currentDraft, setCurrentDraft] = useState('');
  
  // Notification settings
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('emailNotificationSound');
    return saved !== 'false';
  });
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(() => {
    const saved = localStorage.getItem('emailBrowserNotifications');
    return saved !== 'false';
  });
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);
  
  // Threading state
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  
  // New email form state
  const [newEmail, setNewEmail] = useState({
    sender: '',
    subject: '',
    body: '',
    received_at: new Date().toISOString().split('T')[0]
  });

  // Email notifications hook - refetch emails when new ones arrive
  const { requestNotificationPermission } = useEmailNotifications({
    onNewEmail: () => {
      fetchEmails();
    },
    soundEnabled,
    browserNotificationsEnabled
  });

  // Save notification preferences
  useEffect(() => {
    localStorage.setItem('emailNotificationSound', String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem('emailBrowserNotifications', String(browserNotificationsEnabled));
  }, [browserNotificationsEnabled]);

  const toggleSoundNotifications = () => {
    setSoundEnabled(!soundEnabled);
    toast.success(soundEnabled ? 'Sound notifications disabled' : 'Sound notifications enabled');
  };

  const toggleBrowserNotifications = async () => {
    if (!browserNotificationsEnabled) {
      const granted = await requestNotificationPermission();
      if (granted) {
        setBrowserNotificationsEnabled(true);
        toast.success('Browser notifications enabled');
      } else {
        toast.error('Browser notification permission denied');
      }
    } else {
      setBrowserNotificationsEnabled(false);
      toast.success('Browser notifications disabled');
    }
  };

  // When selecting an email, ensure we have the latest data from state
  const handleSelectEmail = (email: Email) => {
    // Find the email in the current emails array to get latest summary/draft
    const latestEmail = emails.find(e => e.id === email.id);
    setSelectedEmail(latestEmail || email);
  };
  
  // Group emails by thread (based on subject similarity)
  const getThreadKey = (subject: string): string => {
    // Remove common reply/forward prefixes and normalize
    return subject
      .replace(/^(re:|fwd?:|fw:)\s*/gi, '')
      .toLowerCase()
      .trim();
  };
  
  const groupEmailsByThread = (emailList: Email[]): Map<string, Email[]> => {
    const threads = new Map<string, Email[]>();
    
    emailList.forEach(email => {
      const threadKey = getThreadKey(email.subject);
      if (!threads.has(threadKey)) {
        threads.set(threadKey, []);
      }
      threads.get(threadKey)!.push(email);
    });
    
    // Sort emails within each thread by date (newest first)
    threads.forEach((emails, key) => {
      emails.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
    });
    
    return threads;
  };
  
  const toggleThread = (threadKey: string) => {
    const newExpanded = new Set(expandedThreads);
    if (newExpanded.has(threadKey)) {
      newExpanded.delete(threadKey);
    } else {
      newExpanded.add(threadKey);
    }
    setExpandedThreads(newExpanded);
  };

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

  const handleClearAllEmails = async () => {
    if (!confirm('Are you sure you want to clear all emails? This cannot be undone.')) {
      return;
    }
    
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('outlook-email-sync', {
        body: { action: 'clear' }
      });

      if (error) throw error;

      toast.success('All emails cleared');
      setSelectedEmail(null);
      fetchEmails();
    } catch (error) {
      console.error('Error clearing emails:', error);
      toast.error('Failed to clear emails');
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
        created_at: email.created_at,
        cc_recipients: (email.cc_recipients as string[]) || [],
        bcc_recipients: (email.bcc_recipients as string[]) || [],
      }));
      
      setEmails(typedEmails);
      
      // If we have a selected email, update it with the latest data
      if (selectedEmail) {
        const updatedSelected = typedEmails.find(e => e.id === selectedEmail.id);
        if (updatedSelected) {
          setSelectedEmail(updatedSelected);
        }
      }
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

  // Filter and search emails
  const filteredEmails = emails.filter(email => {
    // Status filter
    if (statusFilter === 'all') {
      if (!showArchived && email.status === 'archived') return false;
    } else if (statusFilter === 'archived') {
      if (email.status !== 'archived') return false;
    } else {
      if (email.status !== statusFilter) return false;
    }
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSender = email.sender.toLowerCase().includes(query);
      const matchesSubject = email.subject.toLowerCase().includes(query);
      const matchesBody = email.body.toLowerCase().includes(query);
      if (!matchesSender && !matchesSubject && !matchesBody) return false;
    }
    
    return true;
  });
  
  // Group filtered emails by thread
  const emailThreads = groupEmailsByThread(filteredEmails);
  const sortedThreadKeys = Array.from(emailThreads.keys()).sort((a, b) => {
    const aEmails = emailThreads.get(a)!;
    const bEmails = emailThreads.get(b)!;
    return new Date(bEmails[0].received_at).getTime() - new Date(aEmails[0].received_at).getTime();
  });
  
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
          {/* Notification toggles */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleSoundNotifications}
            title={soundEnabled ? 'Disable sound notifications' : 'Enable sound notifications'}
            className="h-9 w-9"
          >
            {soundEnabled ? (
              <Bell className="h-4 w-4 text-primary" />
            ) : (
              <BellOff className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleBrowserNotifications}
            title={browserNotificationsEnabled ? 'Disable browser notifications' : 'Enable browser notifications'}
            className="h-9 w-9"
          >
            {browserNotificationsEnabled ? (
              <Bell className="h-4 w-4 text-green-500" />
            ) : (
              <BellOff className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreVertical className="h-4 w-4 mr-2" />
                Options
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleClearAllEmails} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All Emails
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
          {/* Search and Filter Bar */}
          <div className="px-3 py-3 border-b space-y-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search emails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-8 h-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            
            {/* Filters */}
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <Filter className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Emails</SelectItem>
                  <SelectItem value="unread">Unread</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                  <SelectItem value="summarized">Summarized</SelectItem>
                  <SelectItem value="drafted">Draft Ready</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
              
              <Badge 
                variant={showArchived ? "default" : "outline"} 
                className="cursor-pointer text-xs h-8 px-3"
                onClick={() => setShowArchived(!showArchived)}
              >
                <Archive className="h-3 w-3 mr-1" />
                {showArchived ? 'Hiding' : 'Show'} Archived
              </Badge>
            </div>
          </div>
          
          {/* Email List Header */}
          <div className="px-4 py-2 border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Inbox className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {filteredEmails.length} {filteredEmails.length === 1 ? 'email' : 'emails'}
                </span>
                {sortedThreadKeys.length !== filteredEmails.length && (
                  <span className="text-xs text-muted-foreground">
                    ({sortedThreadKeys.length} {sortedThreadKeys.length === 1 ? 'thread' : 'threads'})
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="p-8 text-center">
                <RefreshCw className="h-6 w-6 mx-auto mb-2 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading emails...</p>
              </div>
            ) : filteredEmails.length === 0 ? (
              <div className="p-8 text-center">
                <Inbox className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-sm font-medium text-muted-foreground">
                  {searchQuery || statusFilter !== 'all' ? 'No matching emails' : 'No emails'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {searchQuery || statusFilter !== 'all' ? 'Try adjusting your filters' : 'Sync your inbox or add an email'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {sortedThreadKeys.map((threadKey) => {
                  const threadEmails = emailThreads.get(threadKey)!;
                  const isThreaded = threadEmails.length > 1;
                  const isExpanded = expandedThreads.has(threadKey);
                  const latestEmail = threadEmails[0];
                  const hasUnread = threadEmails.some(e => e.status === 'unread');
                  const hasSummary = threadEmails.some(e => e.summary);
                  const hasDraft = threadEmails.some(e => e.draft_reply);
                  
                  return (
                    <div key={threadKey}>
                      {/* Thread Header / Single Email */}
                      <div
                        onClick={() => {
                          if (isThreaded && !isExpanded) {
                            toggleThread(threadKey);
                          } else {
                            handleSelectEmail(latestEmail);
                          }
                        }}
                        className={`px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50 ${
                          selectedEmail?.id === latestEmail.id ? 'bg-muted border-l-2 border-l-primary' : ''
                        } ${hasUnread ? 'bg-primary/5' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Avatar */}
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-semibold text-primary">
                              {getSenderInitials(latestEmail.sender)}
                            </span>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`text-sm truncate ${hasUnread ? 'font-semibold' : 'font-medium'}`}>
                                  {extractSenderName(latestEmail.sender)}
                                </span>
                                {isThreaded && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                                    <MessageCircle className="h-2.5 w-2.5 mr-0.5" />
                                    {threadEmails.length}
                                  </Badge>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground flex-shrink-0">
                                {formatEmailDate(latestEmail.received_at)}
                              </span>
                            </div>
                            <p className={`text-sm truncate ${hasUnread ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                              {latestEmail.subject || '(No Subject)'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {latestEmail.body.slice(0, 80).replace(/\n/g, ' ')}...
                            </p>
                            
                            {/* Status indicators */}
                            <div className="flex items-center gap-1.5 mt-2">
                              {latestEmail.urgency_level && latestEmail.urgency_level !== 'low' && (
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                  latestEmail.urgency_level === 'high' ? 'text-destructive border-destructive/30' : 'text-warning border-warning/30'
                                }`}>
                                  {latestEmail.urgency_level === 'high' ? '🔴' : '🟡'} {latestEmail.urgency_level}
                                </Badge>
                              )}
                              {hasSummary && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-600 border-green-500/30">
                                  <Sparkles className="h-2.5 w-2.5 mr-0.5" /> AI Summary
                                </Badge>
                              )}
                              {hasDraft && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-purple-600 border-purple-500/30">
                                  <MessageSquare className="h-2.5 w-2.5 mr-0.5" /> Draft
                                </Badge>
                              )}
                              {isThreaded && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleThread(threadKey);
                                  }}
                                  className="ml-auto text-muted-foreground hover:text-foreground"
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Expanded Thread Emails */}
                      {isThreaded && isExpanded && (
                        <div className="bg-muted/20 border-l-2 border-l-muted">
                          {threadEmails.map((email, index) => (
                            <div
                              key={email.id}
                              onClick={() => handleSelectEmail(email)}
                              className={`pl-8 pr-4 py-2 cursor-pointer transition-colors hover:bg-muted/50 border-t border-border/50 ${
                                selectedEmail?.id === email.id ? 'bg-muted border-l-2 border-l-primary' : ''
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <span className="text-[10px] font-semibold text-primary">
                                      {getSenderInitials(email.sender)}
                                    </span>
                                  </div>
                                  <span className={`text-xs truncate ${email.status === 'unread' ? 'font-semibold' : ''}`}>
                                    {extractSenderName(email.sender)}
                                  </span>
                                  {email.summary && (
                                    <Sparkles className="h-3 w-3 text-green-500 flex-shrink-0" />
                                  )}
                                  {email.draft_reply && (
                                    <MessageSquare className="h-3 w-3 text-purple-500 flex-shrink-0" />
                                  )}
                                </div>
                                <span className="text-[10px] text-muted-foreground">
                                  {formatEmailDate(email.received_at)}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground truncate mt-1 pl-8">
                                {email.body.slice(0, 60).replace(/\n/g, ' ')}...
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
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
                      {/* CC Recipients */}
                      {selectedEmail.cc_recipients && selectedEmail.cc_recipients.length > 0 && (
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/70">CC:</span>
                          <span>{selectedEmail.cc_recipients.join(', ')}</span>
                        </div>
                      )}
                      {/* BCC Recipients */}
                      {selectedEmail.bcc_recipients && selectedEmail.bcc_recipients.length > 0 && (
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/70">BCC:</span>
                          <span>{selectedEmail.bcc_recipients.join(', ')}</span>
                        </div>
                      )}
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
                      <div className="px-4 py-3 bg-primary/5 border-b flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">AI Summary</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setShowSummaryModal(true)}>
                          View Full Summary
                        </Button>
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
              <div className="px-6 py-4 bg-background border-t flex items-center justify-between">
                <div className="flex items-center gap-3">
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
                    {isDrafting ? 'Drafting...' : selectedEmail.draft_reply ? 'Re-draft Reply' : 'Draft Reply'}
                  </Button>
                </div>
                
                {/* Quick access buttons for existing summaries/drafts */}
                <div className="flex items-center gap-2">
                  {selectedEmail.summary && (
                    <Button 
                      variant="secondary" 
                      size="sm"
                      onClick={() => setShowSummaryModal(true)}
                    >
                      <Sparkles className="h-4 w-4 mr-2 text-primary" />
                      View Summary
                    </Button>
                  )}
                  {selectedEmail.draft_reply && (
                    <Button 
                      variant="secondary" 
                      size="sm"
                      onClick={() => {
                        setCurrentDraft(selectedEmail.draft_reply || '');
                        setShowDraftModal(true);
                      }}
                    >
                      <MessageSquare className="h-4 w-4 mr-2 text-purple-600" />
                      View Draft
                    </Button>
                  )}
                </div>
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

      {/* Summary Preview Modal */}
      <Dialog open={showSummaryModal} onOpenChange={setShowSummaryModal}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Summary
            </DialogTitle>
            <DialogDescription>
              AI-generated summary of the email
            </DialogDescription>
          </DialogHeader>
          {selectedEmail?.summary && (
            <ScrollArea className="max-h-[50vh]">
              <div className="space-y-6 pr-4">
                <div>
                  <Label className="text-xs uppercase text-muted-foreground font-semibold">TL;DR</Label>
                  <p className="text-sm mt-2 p-3 bg-muted/50 rounded-lg">{selectedEmail.summary.tldr}</p>
                </div>
                
                {selectedEmail.summary.keyPoints.length > 0 && (
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground font-semibold">Key Points</Label>
                    <ul className="mt-2 space-y-2">
                      {selectedEmail.summary.keyPoints.map((point, i) => (
                        <li key={i} className="text-sm flex items-start gap-2 p-2 bg-muted/30 rounded-lg">
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
                    <ul className="mt-2 space-y-2">
                      {selectedEmail.summary.requiredActions.map((action, i) => (
                        <li key={i} className="text-sm flex items-start gap-2 p-2 bg-green-500/10 rounded-lg">
                          <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <div>
                  <Label className="text-xs uppercase text-muted-foreground font-semibold">Urgency Level</Label>
                  <div className="mt-2">
                    {getUrgencyBadge(selectedEmail.summary.urgencyLevel)}
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSummaryModal(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}