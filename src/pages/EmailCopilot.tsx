import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useEmailNotifications } from '@/hooks/useEmailNotifications';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePermissions } from '@/hooks/usePermissions';
import RichTextBody from '@/components/email/RichTextBody';
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
  BellOff,
  Mic,
  MicOff,
  Loader2,
  ArrowLeft,
  Paperclip,
  Download,
  Eye,
  FileIcon,
  Image as ImageIcon,
  Forward,
  Upload,
  Settings
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';

interface EmailSummary {
  tldr: string;
  keyPoints: string[];
  requiredActions: string[];
  urgencyLevel: 'low' | 'medium' | 'high';
}

interface EmailAttachment {
  name: string;
  contentType: string;
  size: number;
  storageUrl: string;
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
  status: 'unread' | 'read' | 'summarized' | 'drafted' | 'replied' | 'archived';
  created_at: string;
  cc_recipients: string[];
  bcc_recipients: string[];
  attachments: EmailAttachment[];
  mailbox_source: 'admin' | 'personal';
}

interface SentAttachment {
  name: string;
  contentType: string;
  size: number;
}

interface SentReply {
  id: string;
  original_email_id: string | null;
  recipient: string;
  subject: string;
  body: string;
  cc_recipients: string[];
  bcc_recipients: string[];
  attachments: SentAttachment[];
  sent_at: string;
  mailbox_source: 'admin' | 'personal';
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
  const isMobile = useIsMobile();
  const { hasModuleAccess, loading: permissionsLoading } = usePermissions();
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showSendConfirmModal, setShowSendConfirmModal] = useState(false);
  const [showEditDraftModal, setShowEditDraftModal] = useState(false);
  const [editableDraft, setEditableDraft] = useState('');
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [currentDraft, setCurrentDraft] = useState('');
  const [replyContext, setReplyContext] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  
  // Email compose state
  const [replyTo, setReplyTo] = useState('');
  const [replySubject, setReplySubject] = useState('');
  const [replyCc, setReplyCc] = useState('');
  const [replyBcc, setReplyBcc] = useState('');
  
  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
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
  
  // View mode state (inbox vs sent)
  const [viewMode, setViewMode] = useState<'inbox' | 'sent'>('inbox');
  const [sentReplies, setSentReplies] = useState<SentReply[]>([]);
  const [selectedSentReply, setSelectedSentReply] = useState<SentReply | null>(null);
  
  // Threading state
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  
  // New email form state
  const [newEmail, setNewEmail] = useState({
    sender: '',
    subject: '',
    body: '',
    received_at: new Date().toISOString().split('T')[0]
  });
  
  // Compose new email modal state
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [composeEmail, setComposeEmail] = useState({
    to: '',
    subject: '',
    body: '',
    cc: '',
    bcc: ''
  });
  const [isComposing, setIsComposing] = useState(false);
  
  // Attachment state for compose and reply
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [composeAttachments, setComposeAttachments] = useState<File[]>([]);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const composeFileInputRef = useRef<HTMLInputElement>(null);
  
  // Drag and drop state
  const [replyDragActive, setReplyDragActive] = useState(false);
  const [composeDragActive, setComposeDragActive] = useState(false);
  
  // Forward modal state
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardTo, setForwardTo] = useState('');
  const [forwardCc, setForwardCc] = useState('');
  const [forwardBcc, setForwardBcc] = useState('');
  const [forwardBody, setForwardBody] = useState('');
  const [forwardAttachments, setForwardAttachments] = useState<File[]>([]);
  const [isForwarding, setIsForwarding] = useState(false);
  const forwardFileInputRef = useRef<HTMLInputElement>(null);
  const [forwardDragActive, setForwardDragActive] = useState(false);

  // QA PDF attachment state (when coming from Report QA)
  const [qaPDFAttachment, setQaPDFAttachment] = useState<{
    url: string;
    fileName: string;
    fileSize: number;
  } | null>(null);

  // Mailbox selection state
  const [personalMailbox, setPersonalMailbox] = useState<string | null>(null);
  const [isUserProfileLoaded, setIsUserProfileLoaded] = useState(false);
  const [selectedMailbox, setSelectedMailbox] = useState<'admin' | 'personal'>(() => {
    const saved = localStorage.getItem('emailCopilotMailbox');
    return (saved === 'personal') ? 'personal' : 'admin';
  });
  const [showMailboxSettings, setShowMailboxSettings] = useState(false);
  const hasAdminEmailAccess = hasModuleAccess('admin_email_access');

  // Check for QA PDF attachment on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const attachmentParam = urlParams.get('attachment');
    
    if (attachmentParam === 'qa_pdf') {
      const storedAttachment = localStorage.getItem('qa_pdf_attachment');
      if (storedAttachment) {
        try {
          const attachment = JSON.parse(storedAttachment);
          setQaPDFAttachment(attachment);
          // Open compose modal with the attachment info
          setShowComposeModal(true);
          setComposeEmail(prev => ({
            ...prev,
            subject: `Q&A Conversation Export - ${attachment.fileName}`,
            body: `Please find attached the Q&A conversation export.\n\nBest regards`
          }));
          // Clear from localStorage
          localStorage.removeItem('qa_pdf_attachment');
          // Clean URL
          window.history.replaceState({}, '', '/email-copilot');
          toast.success('PDF attached from Report Q&A', {
            description: attachment.fileName
          });
        } catch (e) {
          console.error('Failed to parse QA attachment:', e);
        }
      }
    }
  }, []);

  // Fetch user profile to get personal mailbox
  useEffect(() => {
    const fetchUserProfile = async () => {
      const sessionToken = localStorage.getItem('session_token');
      if (!sessionToken) {
        setIsUserProfileLoaded(true);
        return;
      }

      try {
        const { data } = await supabase.functions.invoke('admin-user-management', {
          body: { action: 'get_own_profile', session_token: sessionToken }
        });

        if (data?.success && data.user?.personal_mailbox) {
          setPersonalMailbox(data.user.personal_mailbox);
        }
      } catch (err) {
        console.error('Failed to fetch user profile:', err);
      } finally {
        setIsUserProfileLoaded(true);
      }
    };

    fetchUserProfile();
  }, []);

  // Prevent being stuck on "personal" when it isn't configured
  useEffect(() => {
    if (isUserProfileLoaded && selectedMailbox === 'personal' && !personalMailbox) {
      setSelectedMailbox('admin');
      toast.info('Personal mailbox is not configured. Switched to admin inbox.');
    }
  }, [isUserProfileLoaded, selectedMailbox, personalMailbox]);

  // Save mailbox preference
  useEffect(() => {
    localStorage.setItem('emailCopilotMailbox', selectedMailbox);
  }, [selectedMailbox]);

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
    if (isMobile) {
      setShowMobileDetail(true);
    }
  };

  // Handle back button on mobile
  const handleMobileBack = () => {
    setShowMobileDetail(false);
    setSelectedEmail(null);
    setSelectedSentReply(null);
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
    // Determine which mailbox to sync from
    if (selectedMailbox === 'personal' && !personalMailbox) {
      toast.error('Personal mailbox is not configured');
      setShowMailboxSettings(true);
      return;
    }

    const mailboxToSync = selectedMailbox === 'personal' && personalMailbox 
      ? personalMailbox 
      : null; // null means use default admin mailbox

    // Check permission if trying to sync admin mailbox
    if (selectedMailbox === 'admin' && !hasAdminEmailAccess) {
      toast.error('You do not have permission to access the admin email inbox');
      return;
    }

    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('outlook-email-sync', {
        body: { action: 'sync', limit: 50, mailbox: mailboxToSync }
      });

      if (error) throw error;

      const mailboxLabel = selectedMailbox === 'personal' ? 'personal mailbox' : 'admin inbox';
      if (data.inserted > 0) {
        toast.success(`Synced ${data.inserted} new emails from ${mailboxLabel}`);
      } else {
        toast.info(`No new emails to sync from ${mailboxLabel}`);
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

  // Re-fetch emails when mailbox changes
  useEffect(() => {
    fetchEmails();
    fetchSentReplies();
    // Reset selection when switching mailboxes
    setSelectedEmail(null);
    setSelectedSentReply(null);
  }, [selectedMailbox]);

  useEffect(() => {
    // Auto-sync from Outlook on page load
    handleSyncOutlook();
  }, []);

  const fetchSentReplies = async () => {
    try {
      const mailboxFilter = selectedMailbox;
      
      const { data, error } = await supabase
        .from('email_copilot_sent_replies')
        .select('*')
        .eq('mailbox_source', mailboxFilter)
        .order('sent_at', { ascending: false });

      if (error) throw error;
      
      const typedReplies: SentReply[] = (data || []).map(reply => ({
        id: reply.id,
        original_email_id: reply.original_email_id,
        recipient: reply.recipient,
        subject: reply.subject,
        body: reply.body,
        cc_recipients: (reply.cc_recipients as string[]) || [],
        bcc_recipients: (reply.bcc_recipients as string[]) || [],
        attachments: (reply.attachments as unknown as SentAttachment[]) || [],
        sent_at: reply.sent_at,
        mailbox_source: (reply.mailbox_source as 'admin' | 'personal') || 'admin',
      }));
      
      setSentReplies(typedReplies);
    } catch (error) {
      console.error('Error fetching sent replies:', error);
    }
  };

  const fetchEmails = async () => {
    setIsLoading(true);
    try {
      // Filter by mailbox source based on selection
      const mailboxFilter = selectedMailbox;
      
      const { data, error } = await supabase
        .from('email_copilot_emails')
        .select('*')
        .eq('mailbox_source', mailboxFilter)
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
        attachments: (email.attachments as unknown as EmailAttachment[]) || [],
        mailbox_source: (email.mailbox_source as 'admin' | 'personal') || 'admin',
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

  const handleDraftReply = async (contextOverride?: string) => {
    if (!selectedEmail) return;
    
    setIsDrafting(true);
    try {
      const contextToUse = contextOverride ?? replyContext;
      
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
          linkedPropertyAddress: selectedEmail.linked_property_address,
          replyContext: contextToUse || undefined
        }
      });

      if (error) throw error;

      setCurrentDraft(data.draftReply);
      initializeReplyFields();
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

  // Voice recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast.info('Recording started - speak your reply context');
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Could not access microphone');
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
      reader.readAsDataURL(audioBlob);
      
      const base64Audio = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });

      // Call OpenAI Whisper via edge function
      const { data, error } = await supabase.functions.invoke('voice-to-text', {
        body: { audio: base64Audio }
      });

      if (error) throw error;

      if (data?.text) {
        setReplyContext(prev => prev ? `${prev} ${data.text}` : data.text);
        toast.success('Voice transcribed successfully');
      }
    } catch (error) {
      console.error('Error transcribing audio:', error);
      toast.error('Failed to transcribe voice');
    } finally {
      setIsTranscribing(false);
    }
  };

  // Extract recipient email from sender string
  const extractEmailAddress = (sender: string): string => {
    const match = sender.match(/<([^>]+)>/);
    if (match) return match[1];
    if (sender.includes('@')) return sender.trim();
    return sender;
  };

  // Parse comma-separated emails
  const parseEmailList = (emails: string): string[] => {
    if (!emails.trim()) return [];
    return emails.split(',').map(e => e.trim()).filter(e => e.includes('@'));
  };

  // Initialize reply fields when opening draft modal
  const initializeReplyFields = (isNewEmail: boolean = false) => {
    if (isNewEmail) {
      // For new compose (not a reply)
      setReplyTo('');
      setReplySubject('');
      setReplyCc('');
      setReplyBcc('');
      return;
    }
    
    if (!selectedEmail) return;
    setReplyTo(extractEmailAddress(selectedEmail.sender));
    const subject = selectedEmail.subject.toLowerCase().startsWith('re:') 
      ? selectedEmail.subject 
      : `Re: ${selectedEmail.subject}`;
    setReplySubject(subject);
    
    // Carry forward CC/BCC from original email
    const ccFromOriginal = selectedEmail.cc_recipients?.length 
      ? selectedEmail.cc_recipients.join(', ') 
      : '';
    const bccFromOriginal = selectedEmail.bcc_recipients?.length 
      ? selectedEmail.bcc_recipients.join(', ') 
      : '';
    setReplyCc(ccFromOriginal);
    setReplyBcc(bccFromOriginal);
  };

  // Show send confirmation
  const handleSendClick = () => {
    if (!currentDraft.trim()) {
      toast.error('Cannot send empty email');
      return;
    }
    if (!replyTo.trim() || !replyTo.includes('@')) {
      toast.error('Please enter a valid recipient email');
      return;
    }
    setShowSendConfirmModal(true);
  };

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix (e.g., "data:application/pdf;base64,")
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
    });
  };

  // Handle file selection for reply
  const handleReplyFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const maxSize = 10 * 1024 * 1024; // 10MB limit per file
    
    const validFiles = files.filter(file => {
      if (file.size > maxSize) {
        toast.error(`${file.name} exceeds 10MB limit`);
        return false;
      }
      return true;
    });
    
    setReplyAttachments(prev => [...prev, ...validFiles]);
    if (replyFileInputRef.current) {
      replyFileInputRef.current.value = '';
    }
  };

  // Handle file selection for compose
  const handleComposeFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const maxSize = 10 * 1024 * 1024; // 10MB limit per file
    
    const validFiles = files.filter(file => {
      if (file.size > maxSize) {
        toast.error(`${file.name} exceeds 10MB limit`);
        return false;
      }
      return true;
    });
    
    setComposeAttachments(prev => [...prev, ...validFiles]);
    if (composeFileInputRef.current) {
      composeFileInputRef.current.value = '';
    }
  };

  // Remove attachment from reply
  const removeReplyAttachment = (index: number) => {
    setReplyAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Remove attachment from compose
  const removeComposeAttachment = (index: number) => {
    setComposeAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Remove attachment from forward
  const removeForwardAttachment = (index: number) => {
    setForwardAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Handle drag and drop for any attachment area
  const handleDragOver = (e: React.DragEvent, setDragActive: (active: boolean) => void) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent, setDragActive: (active: boolean) => void) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent, addFiles: (files: File[]) => void, setDragActive: (active: boolean) => void) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files);
    const maxSize = 10 * 1024 * 1024; // 10MB limit per file
    
    const validFiles = files.filter(file => {
      if (file.size > maxSize) {
        toast.error(`${file.name} exceeds 10MB limit`);
        return false;
      }
      return true;
    });
    
    if (validFiles.length > 0) {
      addFiles(validFiles);
    }
  };

  // Handle file selection for forward
  const handleForwardFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const maxSize = 10 * 1024 * 1024;
    
    const validFiles = files.filter(file => {
      if (file.size > maxSize) {
        toast.error(`${file.name} exceeds 10MB limit`);
        return false;
      }
      return true;
    });
    
    setForwardAttachments(prev => [...prev, ...validFiles]);
    if (forwardFileInputRef.current) {
      forwardFileInputRef.current.value = '';
    }
  };

  // Open forward modal
  const handleOpenForward = async () => {
    if (!selectedEmail) return;
    
    // Build forward body with original message
    const forwardHeader = `\n\n---------- Forwarded message ----------\nFrom: ${selectedEmail.sender}\nDate: ${formatFullDate(selectedEmail.received_at)}\nSubject: ${selectedEmail.subject}\nTo: (original recipient)\n\n`;
    setForwardBody(forwardHeader + selectedEmail.body);
    setForwardTo('');
    setForwardCc('');
    setForwardBcc('');
    
    // If original email has attachments, we need to download and add them
    if (selectedEmail.attachments && selectedEmail.attachments.length > 0) {
      toast.info(`Loading ${selectedEmail.attachments.length} attachment(s)...`);
      const files: File[] = [];
      
      for (const att of selectedEmail.attachments) {
        try {
          const response = await fetch(att.storageUrl);
          const blob = await response.blob();
          const file = new File([blob], att.name, { type: att.contentType });
          files.push(file);
        } catch (error) {
          console.error('Error loading attachment:', error);
          toast.error(`Failed to load attachment: ${att.name}`);
        }
      }
      
      setForwardAttachments(files);
    } else {
      setForwardAttachments([]);
    }
    
    setShowForwardModal(true);
  };

  // Send forwarded email
  const handleSendForward = async () => {
    if (!selectedEmail || !forwardTo || !forwardBody) return;
    
    setIsForwarding(true);
    
    try {
      const ccList = parseEmailList(forwardCc);
      const bccList = parseEmailList(forwardBcc);

      // Convert attachments to base64
      const attachmentsData = await Promise.all(
        forwardAttachments.map(async (file) => ({
          name: file.name,
          contentType: file.type || 'application/octet-stream',
          contentBytes: await fileToBase64(file)
        }))
      );

      const { data, error } = await supabase.functions.invoke('send-email-reply', {
        body: {
          to: forwardTo,
          subject: `Fwd: ${selectedEmail.subject}`,
          body: forwardBody,
          cc: ccList.length > 0 ? ccList : undefined,
          bcc: bccList.length > 0 ? bccList : undefined,
          attachments: attachmentsData.length > 0 ? attachmentsData : undefined,
          mailboxSource: selectedMailbox
        }
      });

      if (error) throw error;

      toast.success('Email forwarded successfully!');
      setShowForwardModal(false);
      setForwardAttachments([]);
      fetchSentReplies();
    } catch (error) {
      console.error('Error forwarding email:', error);
      toast.error('Failed to forward email');
    } finally {
      setIsForwarding(false);
    }
  };

  // Send email directly (for reply)
  const handleSendEmail = async () => {
    if (!selectedEmail || !currentDraft) return;
    
    setIsSendingEmail(true);
    setShowSendConfirmModal(false);
    
    try {
      const ccList = parseEmailList(replyCc);
      const bccList = parseEmailList(replyBcc);

      // Convert attachments to base64
      const attachmentsData = await Promise.all(
        replyAttachments.map(async (file) => ({
          name: file.name,
          contentType: file.type || 'application/octet-stream',
          contentBytes: await fileToBase64(file)
        }))
      );

      const { data, error } = await supabase.functions.invoke('send-email-reply', {
        body: {
          to: replyTo,
          subject: replySubject,
          body: currentDraft,
          cc: ccList.length > 0 ? ccList : undefined,
          bcc: bccList.length > 0 ? bccList : undefined,
          originalEmailId: selectedEmail.id,
          attachments: attachmentsData.length > 0 ? attachmentsData : undefined,
          mailboxSource: selectedMailbox
        }
      });

      if (error) throw error;

      toast.success('Email sent successfully!');
      setShowDraftModal(false);
      setReplyContext('');
      setReplyCc('');
      setReplyBcc('');
      setReplyAttachments([]);
      
      // Update email status to 'replied' so it shows badge and remains visible in thread
      await supabase
        .from('email_copilot_emails')
        .update({ status: 'replied' })
        .eq('id', selectedEmail.id);
      
      fetchEmails();
      fetchSentReplies();
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error('Failed to send email');
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Send new composed email (not a reply)
  const handleSendComposedEmail = async () => {
    if (!composeEmail.to || !composeEmail.body) {
      toast.error('Please fill in recipient and message body');
      return;
    }
    
    setIsComposing(true);
    
    try {
      const ccList = parseEmailList(composeEmail.cc);
      const bccList = parseEmailList(composeEmail.bcc);

      // Convert regular attachments to base64
      const attachmentsData = await Promise.all(
        composeAttachments.map(async (file) => ({
          name: file.name,
          contentType: file.type || 'application/octet-stream',
          contentBytes: await fileToBase64(file)
        }))
      );

      // Handle QA PDF attachment from Report Q&A (fetch from URL and convert to base64)
      if (qaPDFAttachment) {
        try {
          const pdfResponse = await fetch(qaPDFAttachment.url);
          if (pdfResponse.ok) {
            const pdfBlob = await pdfResponse.blob();
            const pdfBase64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64 = (reader.result as string).split(',')[1];
                resolve(base64);
              };
              reader.onerror = reject;
              reader.readAsDataURL(pdfBlob);
            });
            
            attachmentsData.push({
              name: qaPDFAttachment.fileName,
              contentType: 'application/pdf',
              contentBytes: pdfBase64
            });
          }
        } catch (pdfError) {
          console.error('Failed to fetch QA PDF attachment:', pdfError);
          toast.error('Failed to attach Q&A PDF. Sending email without it.');
        }
      }

      const { data, error } = await supabase.functions.invoke('send-email-reply', {
        body: {
          to: composeEmail.to,
          subject: composeEmail.subject || '(No Subject)',
          body: composeEmail.body,
          cc: ccList.length > 0 ? ccList : undefined,
          bcc: bccList.length > 0 ? bccList : undefined,
          attachments: attachmentsData.length > 0 ? attachmentsData : undefined,
          mailboxSource: selectedMailbox
        }
      });

      if (error) throw error;

      toast.success('Email sent successfully!');
      setShowComposeModal(false);
      setComposeEmail({ to: '', subject: '', body: '', cc: '', bcc: '' });
      setComposeAttachments([]);
      setQaPDFAttachment(null); // Clear the QA PDF attachment after sending
      fetchSentReplies();
    } catch (error) {
      console.error('Error sending composed email:', error);
      toast.error('Failed to send email');
    } finally {
      setIsComposing(false);
    }
  };

  const handleCopyDraft = () => {
    navigator.clipboard.writeText(currentDraft);
    toast.success('Draft copied to clipboard');
  };

  // Open edit draft modal
  const handleOpenEditDraft = () => {
    if (!selectedEmail?.draft_reply) return;
    setEditableDraft(selectedEmail.draft_reply);
    setShowEditDraftModal(true);
  };

  // Save edited draft
  const handleSaveEditedDraft = async () => {
    if (!selectedEmail) return;
    
    setIsSavingDraft(true);
    try {
      const { error } = await supabase
        .from('email_copilot_emails')
        .update({ draft_reply: editableDraft })
        .eq('id', selectedEmail.id);

      if (error) throw error;

      // Update local state
      setSelectedEmail({
        ...selectedEmail,
        draft_reply: editableDraft
      });
      
      toast.success('Draft saved successfully');
      setShowEditDraftModal(false);
      fetchEmails();
    } catch (error) {
      console.error('Error saving draft:', error);
      toast.error('Failed to save draft');
    } finally {
      setIsSavingDraft(false);
    }
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
      <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b bg-background">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="p-1.5 md:p-2 bg-primary/10 rounded-lg">
            <Mail className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-semibold text-foreground flex items-center gap-2">
              Email Copilot
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-xs">{unreadCount}</Badge>
              )}
            </h1>
            <p className="text-xs text-muted-foreground hidden sm:block">AI-powered email summaries & draft replies</p>
          </div>
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          {/* Notification toggles */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleSoundNotifications}
            title={soundEnabled ? 'Disable sound notifications' : 'Enable sound notifications'}
            className="h-8 w-8 md:h-9 md:w-9"
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
            className="h-8 w-8 md:h-9 md:w-9"
          >
            {browserNotificationsEnabled ? (
              <Bell className="h-4 w-4 text-green-500" />
            ) : (
              <BellOff className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
          
          {/* Mailbox Selector */}
          {(hasAdminEmailAccess || personalMailbox) && (
            <Select
              value={selectedMailbox}
              onValueChange={(value: 'admin' | 'personal') => setSelectedMailbox(value)}
            >
              <SelectTrigger className="h-8 md:h-9 w-auto min-w-[120px] text-xs md:text-sm">
                <Inbox className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                <SelectValue placeholder="Select mailbox" />
              </SelectTrigger>
              <SelectContent>
                {hasAdminEmailAccess && (
                  <SelectItem value="admin">Admin Inbox</SelectItem>
                )}
                {personalMailbox ? (
                  <SelectItem value="personal">Personal Mailbox</SelectItem>
                ) : (
                  <SelectItem value="personal" disabled>
                    Personal (Not configured)
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          )}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8 md:h-9 md:w-auto md:px-3">
                <MoreVertical className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!personalMailbox && (
                <>
                  <DropdownMenuItem onClick={() => setShowMailboxSettings(true)}>
                    <Settings className="h-4 w-4 mr-2" />
                    Configure Personal Mailbox
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {personalMailbox && (
                <>
                  <DropdownMenuItem onClick={() => setShowMailboxSettings(true)}>
                    <Settings className="h-4 w-4 mr-2" />
                    Edit Personal Mailbox
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={handleClearAllEmails} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All Emails
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="icon" className="h-8 w-8 md:h-9 md:w-auto md:px-3" onClick={handleSyncOutlook} disabled={isSyncing}>
            <RefreshCw className={`h-4 w-4 md:mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">{isSyncing ? 'Syncing...' : 'Sync'}</span>
          </Button>
          <Button size="icon" className="h-8 w-8 md:h-9 md:w-auto md:px-3" onClick={() => setShowComposeModal(true)}>
            <Plus className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">Compose</span>
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
      <div className="flex-1 flex overflow-hidden relative">
        {/* Email List Panel - full width on mobile, hidden when detail shown */}
        <div className={`${isMobile ? 'w-full' : 'w-[380px]'} border-r flex flex-col bg-background ${isMobile && showMobileDetail ? 'hidden' : ''}`}>
          {/* Inbox/Sent Tabs */}
          <div className="px-3 pt-3 border-b">
            <div className="flex gap-1 bg-muted rounded-lg p-1 mb-3">
              <button
                onClick={() => { setViewMode('inbox'); setSelectedSentReply(null); }}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'inbox' 
                    ? 'bg-background text-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Inbox className="h-4 w-4" />
                Inbox
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="text-xs h-5 px-1.5">{unreadCount}</Badge>
                )}
              </button>
              <button
                onClick={() => { setViewMode('sent'); setSelectedEmail(null); }}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'sent' 
                    ? 'bg-background text-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Send className="h-4 w-4" />
                Sent
                <Badge variant="outline" className="text-xs h-5 px-1.5">{sentReplies.length}</Badge>
              </button>
            </div>
          </div>

          {viewMode === 'inbox' ? (
            <>
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
                      <SelectItem value="replied">Replied</SelectItem>
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
            </>
          ) : (
            /* Sent Replies Header */
            <div className="px-4 py-2 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {sentReplies.length} sent {sentReplies.length === 1 ? 'reply' : 'replies'}
                </span>
              </div>
            </div>
          )}
          
          <ScrollArea className="flex-1">
            {viewMode === 'inbox' ? (
              // Inbox view
              <>
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
                                  {latestEmail.status === 'replied' && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-blue-600 border-blue-500/30">
                                      <Reply className="h-2.5 w-2.5 mr-0.5" /> Replied
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
              </>
            ) : (
              // Sent replies view
              <>
                {sentReplies.length === 0 ? (
                  <div className="p-8 text-center">
                    <Send className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                    <p className="text-sm font-medium text-muted-foreground">No sent replies</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Replies you send will appear here
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {sentReplies.map((reply) => (
                      <div
                        key={reply.id}
                        onClick={() => {
                          setSelectedSentReply(reply);
                          if (isMobile) setShowMobileDetail(true);
                        }}
                        className={`px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50 ${
                          selectedSentReply?.id === reply.id ? 'bg-muted border-l-2 border-l-green-500' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                            <Send className="h-4 w-4 text-green-600" />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <span className="text-sm font-medium truncate">
                                To: {reply.recipient}
                              </span>
                              <span className="text-xs text-muted-foreground flex-shrink-0">
                                {formatEmailDate(reply.sent_at)}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground truncate">
                              {reply.subject || '(No Subject)'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {reply.body.slice(0, 80).replace(/\n/g, ' ')}...
                            </p>
                            <div className="flex items-center gap-1.5 mt-2">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-600 border-green-500/30">
                                <CheckCircle className="h-2.5 w-2.5 mr-0.5" /> Sent
                              </Badge>
                              {reply.attachments && reply.attachments.length > 0 && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  <Paperclip className="h-2.5 w-2.5 mr-0.5" /> {reply.attachments.length}
                                </Badge>
                              )}
                              {reply.cc_recipients.length > 0 && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  CC: {reply.cc_recipients.length}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </ScrollArea>
        </div>

        {/* Email Detail Panel - Full screen overlay on mobile */}
        <div className={`${isMobile ? 'absolute inset-0 z-50' : 'flex-1'} flex flex-col bg-muted/20 overflow-hidden ${isMobile && !showMobileDetail ? 'hidden' : ''}`}>
          {viewMode === 'sent' && selectedSentReply ? (
            // Sent Reply Detail View
            <>
              <div className="px-6 py-4 bg-background border-b">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    {isMobile && (
                      <Button variant="ghost" size="icon" onClick={handleMobileBack} className="mr-2 -ml-2">
                        <ArrowLeft className="h-5 w-5" />
                      </Button>
                    )}
                    <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                      <Send className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">{selectedSentReply.subject || '(No Subject)'}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm font-medium">To:</span>
                        <span className="text-sm text-muted-foreground">{selectedSentReply.recipient}</span>
                      </div>
                      {selectedSentReply.cc_recipients && selectedSentReply.cc_recipients.length > 0 && (
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/70">CC:</span>
                          <span>{selectedSentReply.cc_recipients.join(', ')}</span>
                        </div>
                      )}
                      {selectedSentReply.bcc_recipients && selectedSentReply.bcc_recipients.length > 0 && (
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/70">BCC:</span>
                          <span>{selectedSentReply.bcc_recipients.join(', ')}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{formatFullDate(selectedSentReply.sent_at)}</span>
                        <span className="text-muted-foreground/50">•</span>
                        <span>{formatDistanceToNow(new Date(selectedSentReply.sent_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-green-600 border-green-500/30 bg-green-500/10">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Sent
                  </Badge>
                </div>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-6 space-y-4">
                  {/* Attachments Section */}
                  {selectedSentReply.attachments && selectedSentReply.attachments.length > 0 && (
                    <div className="bg-muted/30 rounded-lg p-4">
                      <Label className="text-xs uppercase text-muted-foreground font-semibold mb-3 block">
                        Attachments ({selectedSentReply.attachments.length})
                      </Label>
                      <div className="space-y-2">
                        {selectedSentReply.attachments.map((attachment, index) => (
                          <div 
                            key={index}
                            className="flex items-center gap-3 p-2 bg-background rounded-lg border"
                          >
                            <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                              {attachment.contentType?.startsWith('image/') ? (
                                <ImageIcon className="h-4 w-4 text-primary" />
                              ) : (
                                <FileIcon className="h-4 w-4 text-primary" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{attachment.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {attachment.size < 1024 
                                  ? `${attachment.size} B`
                                  : attachment.size < 1024 * 1024
                                    ? `${(attachment.size / 1024).toFixed(1)} KB`
                                    : `${(attachment.size / (1024 * 1024)).toFixed(1)} MB`
                                }
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="bg-background rounded-lg border p-6">
                    <RichTextBody 
                      content={selectedSentReply.body}
                      className="prose prose-sm max-w-none dark:prose-invert"
                    />
                  </div>
                </div>
              </ScrollArea>
            </>
          ) : selectedEmail ? (
            <>
              {/* Email Header */}
              <div className="px-6 py-4 bg-background border-b">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    {isMobile && (
                      <Button variant="ghost" size="icon" onClick={handleMobileBack} className="mr-2 -ml-2">
                        <ArrowLeft className="h-5 w-5" />
                      </Button>
                    )}
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
                    <RichTextBody 
                      content={selectedEmail.body}
                      className="prose prose-sm max-w-none dark:prose-invert"
                    />
                  </div>

                  {/* Attachments Section */}
                  {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                    <div className="bg-background rounded-lg border overflow-hidden">
                      <div className="px-4 py-3 bg-muted/30 border-b flex items-center gap-2">
                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          Attachments ({selectedEmail.attachments.length})
                        </span>
                      </div>
                      <div className="p-4 space-y-2">
                        {selectedEmail.attachments.map((attachment, index) => {
                          const isImage = attachment.contentType?.startsWith('image/');
                          const isPdf = attachment.contentType === 'application/pdf';
                          const fileSize = attachment.size < 1024 
                            ? `${attachment.size} B` 
                            : attachment.size < 1024 * 1024 
                              ? `${(attachment.size / 1024).toFixed(1)} KB`
                              : `${(attachment.size / (1024 * 1024)).toFixed(1)} MB`;
                          
                          return (
                            <div 
                              key={index}
                              className="flex items-center justify-between p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className="p-2 rounded-md bg-primary/10">
                                  {isImage ? (
                                    <ImageIcon className="h-4 w-4 text-primary" />
                                  ) : (
                                    <FileIcon className="h-4 w-4 text-primary" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium truncate">{attachment.name}</p>
                                  <p className="text-xs text-muted-foreground">{fileSize}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                {(isImage || isPdf) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => window.open(attachment.storageUrl, '_blank')}
                                    title="Preview"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    const link = document.createElement('a');
                                    link.href = attachment.storageUrl;
                                    link.download = attachment.name;
                                    link.target = '_blank';
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                  }}
                                  title="Download"
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

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
                          initializeReplyFields();
                          setShowDraftModal(true);
                        }}>
                          View & Edit Draft
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
              <div className="px-4 md:px-6 py-3 md:py-4 bg-background border-t flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
                <div className="flex items-center gap-2 md:gap-3">
                  <Button 
                    onClick={handleSummarize} 
                    disabled={isSummarizing}
                    variant={selectedEmail.summary ? "outline" : "default"}
                    size={isMobile ? "sm" : "default"}
                    className="flex-1 md:flex-none"
                  >
                    <Sparkles className={`h-4 w-4 mr-2 ${isSummarizing ? 'animate-pulse' : ''}`} />
                    {isSummarizing ? 'Summarizing...' : selectedEmail.summary ? 'Re-summarize' : 'Summarize'}
                  </Button>
                  <Button 
                    onClick={() => {
                      setCurrentDraft('');
                      setReplyContext('');
                      initializeReplyFields();
                      setShowDraftModal(true);
                    }} 
                    variant="outline"
                    size={isMobile ? "sm" : "default"}
                    className="flex-1 md:flex-none"
                  >
                    <Reply className="h-4 w-4 mr-2" />
                    {isMobile ? 'Reply' : (selectedEmail.draft_reply ? 'Compose New Reply' : 'Compose Reply')}
                  </Button>
                  <Button 
                    onClick={handleOpenForward}
                    variant="outline"
                    size={isMobile ? "sm" : "default"}
                    className="flex-1 md:flex-none"
                  >
                    <Forward className="h-4 w-4 mr-2" />
                    Forward
                  </Button>
                </div>
                
                {/* Quick access buttons for existing summaries/drafts */}
                <div className="flex items-center gap-2">
                  {selectedEmail.summary && (
                    <Button 
                      variant="secondary" 
                      size="sm"
                      onClick={() => setShowSummaryModal(true)}
                      className="flex-1 md:flex-none"
                    >
                      <Sparkles className="h-4 w-4 mr-2 text-primary" />
                      {isMobile ? 'Summary' : 'View Summary'}
                    </Button>
                  )}
                  {selectedEmail.draft_reply && (
                    <Button 
                      variant="secondary" 
                      size="sm"
                      onClick={handleOpenEditDraft}
                      className="flex-1 md:flex-none"
                    >
                      <MessageSquare className="h-4 w-4 mr-2 text-purple-600" />
                      {isMobile ? 'Edit Draft' : 'View & Edit Draft'}
                    </Button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Mail className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
                <p className="text-lg font-medium text-muted-foreground">
                  {viewMode === 'sent' ? 'Select a sent email' : 'Select an email'}
                </p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  {viewMode === 'sent' ? 'Choose a sent email from the list to view details' : 'Choose an email from the list to view details'}
                </p>
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
      <Dialog open={showDraftModal} onOpenChange={(open) => {
        setShowDraftModal(open);
        if (!open) {
          setReplyContext('');
          setReplyCc('');
          setReplyBcc('');
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-purple-600" />
              Compose Reply
            </DialogTitle>
            <DialogDescription>
              Review recipients, edit your message, then send or copy
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              {/* Email Recipients Section */}
              <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                {/* From Field - Non-editable */}
                <div className="grid grid-cols-[60px_1fr] gap-2 items-center">
                  <Label className="text-sm text-muted-foreground">From:</Label>
                  <div className="h-8 px-3 flex items-center bg-muted/50 border rounded-md text-sm text-muted-foreground">
                    {selectedMailbox === 'personal' && personalMailbox 
                      ? personalMailbox 
                      : 'Admin Mailbox'}
                  </div>
                </div>
                <div className="grid grid-cols-[60px_1fr] gap-2 items-center">
                  <Label className="text-sm text-muted-foreground">To:</Label>
                  <Input
                    value={replyTo}
                    onChange={(e) => setReplyTo(e.target.value)}
                    placeholder="recipient@example.com"
                    className="h-8"
                  />
                </div>
                <div className="grid grid-cols-[60px_1fr] gap-2 items-center">
                  <Label className="text-sm text-muted-foreground">Subject:</Label>
                  <Input
                    value={replySubject}
                    onChange={(e) => setReplySubject(e.target.value)}
                    placeholder="Email subject"
                    className="h-8"
                  />
                </div>
                <div className="grid grid-cols-[60px_1fr] gap-2 items-center">
                  <Label className="text-sm text-muted-foreground">CC:</Label>
                  <Input
                    value={replyCc}
                    onChange={(e) => setReplyCc(e.target.value)}
                    placeholder="cc@example.com, another@example.com"
                    className="h-8"
                  />
                </div>
                <div className="grid grid-cols-[60px_1fr] gap-2 items-center">
                  <Label className="text-sm text-muted-foreground">BCC:</Label>
                  <Input
                    value={replyBcc}
                    onChange={(e) => setReplyBcc(e.target.value)}
                    placeholder="bcc@example.com"
                    className="h-8"
                  />
                </div>
              </div>
              
              {/* Reply Context Input */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Reply Context</Label>
                <p className="text-xs text-muted-foreground">
                  Describe what you want to say - the AI will generate a professional reply based on your input
                </p>
                <div className="flex gap-2">
                  <Textarea
                    value={replyContext}
                    onChange={(e) => setReplyContext(e.target.value)}
                    placeholder="e.g., 'Thank them for their inquiry and let them know I'll send through the property report by end of day'"
                    className="h-20 resize-none flex-1 text-sm"
                  />
                  <Button
                    variant={isRecording ? "destructive" : "outline"}
                    size="icon"
                    className="h-20 w-12"
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isTranscribing}
                    title={isRecording ? "Stop recording" : "Speak your reply context"}
                  >
                    {isTranscribing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isRecording ? (
                      <MicOff className="h-4 w-4" />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {isRecording && (
                  <p className="text-xs text-destructive flex items-center gap-1 animate-pulse">
                    <Mic className="h-3 w-3" />
                    Recording... Click mic to stop
                  </p>
                )}
                <Button
                  onClick={() => handleDraftReply(replyContext)}
                  disabled={isDrafting}
                  className="w-full"
                >
                  {isDrafting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating Draft...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      {currentDraft ? 'Regenerate Draft' : 'Generate Draft'}
                    </>
                  )}
                </Button>
              </div>
              
              <Separator />
              
              {/* Attachments Section with Drag & Drop */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Attachments</Label>
                <input
                  type="file"
                  ref={replyFileInputRef}
                  onChange={handleReplyFileSelect}
                  multiple
                  className="hidden"
                />
                <div
                  onDragOver={(e) => handleDragOver(e, setReplyDragActive)}
                  onDragLeave={(e) => handleDragLeave(e, setReplyDragActive)}
                  onDrop={(e) => handleDrop(e, (files) => setReplyAttachments(prev => [...prev, ...files]), setReplyDragActive)}
                  onClick={() => replyFileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                    replyDragActive 
                      ? 'border-primary bg-primary/5' 
                      : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                  }`}
                >
                  <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drag & drop files here or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Max 10MB per file
                  </p>
                </div>
                {replyAttachments.length > 0 && (
                  <div className="space-y-2 p-2 bg-muted/30 rounded-lg">
                    {replyAttachments.map((file, index) => (
                      <div key={index} className="flex items-center justify-between text-sm p-2 bg-background rounded">
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="truncate">{file.name}</span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            ({formatFileSize(file.size)})
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); removeReplyAttachment(index); }}
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <Separator />
              
              {/* Draft Content */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Message Body</Label>
                <Textarea
                  value={currentDraft}
                  onChange={(e) => setCurrentDraft(e.target.value)}
                  className="h-[250px] resize-none font-sans text-sm"
                  placeholder="Draft reply will appear here..."
                />
              </div>
            </div>
          </ScrollArea>
          
          <DialogFooter className="flex-col gap-3 sm:flex-row sm:justify-between border-t pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Review carefully before sending
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowDraftModal(false)}>
                Cancel
              </Button>
              <Button variant="outline" onClick={handleCopyDraft}>
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
              <Button 
                onClick={handleSendClick} 
                disabled={isSendingEmail || !currentDraft || !replyTo}
                className="bg-green-600 hover:bg-green-700"
              >
                <Send className="h-4 w-4 mr-2" />
                Send Reply
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Confirmation Dialog */}
      <Dialog open={showSendConfirmModal} onOpenChange={setShowSendConfirmModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-green-600" />
              Confirm Send
            </DialogTitle>
            <DialogDescription>
              Please review the email details before sending
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 py-4">
            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <div className="flex gap-2">
                <span className="text-sm font-medium w-16">From:</span>
                <span className="text-sm text-muted-foreground flex-1">
                  {selectedMailbox === 'personal' && personalMailbox 
                    ? personalMailbox 
                    : 'Admin Mailbox'}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-sm font-medium w-16">To:</span>
                <span className="text-sm text-muted-foreground flex-1">{replyTo}</span>
              </div>
              {replyCc && (
                <div className="flex gap-2">
                  <span className="text-sm font-medium w-16">CC:</span>
                  <span className="text-sm text-muted-foreground flex-1">{replyCc}</span>
                </div>
              )}
              {replyBcc && (
                <div className="flex gap-2">
                  <span className="text-sm font-medium w-16">BCC:</span>
                  <span className="text-sm text-muted-foreground flex-1">{replyBcc}</span>
                </div>
              )}
              <div className="flex gap-2">
                <span className="text-sm font-medium w-16">Subject:</span>
                <span className="text-sm text-muted-foreground flex-1 truncate">{replySubject}</span>
              </div>
            </div>
            
            {replyAttachments.length > 0 && (
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Attachments ({replyAttachments.length}):</p>
                <div className="flex flex-wrap gap-1">
                  {replyAttachments.map((file, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      <Paperclip className="h-3 w-3 mr-1" />
                      {file.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            <div className="p-3 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Message preview:</p>
              <p className="text-sm line-clamp-4">{currentDraft}</p>
            </div>
            
            <div className="flex items-center gap-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0" />
              <p className="text-xs text-yellow-700">
                This action cannot be undone. The email will be sent from your connected Outlook account.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendConfirmModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSendEmail}
              disabled={isSendingEmail}
              className="bg-green-600 hover:bg-green-700"
            >
              {isSendingEmail ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {isSendingEmail ? 'Sending...' : 'Confirm & Send'}
            </Button>
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

      {/* Compose New Email Modal */}
      <Dialog open={showComposeModal} onOpenChange={(open) => {
        setShowComposeModal(open);
        if (!open) {
          setComposeEmail({ to: '', subject: '', body: '', cc: '', bcc: '' });
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Compose New Email
            </DialogTitle>
            <DialogDescription>
              Create and send a new email from scratch
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              {/* Email Recipients Section */}
              <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                <div className="grid grid-cols-[60px_1fr] gap-2 items-center">
                  <Label className="text-sm text-muted-foreground">To: *</Label>
                  <Input
                    value={composeEmail.to}
                    onChange={(e) => setComposeEmail({ ...composeEmail, to: e.target.value })}
                    placeholder="recipient@example.com"
                    className="h-8"
                  />
                </div>
                <div className="grid grid-cols-[60px_1fr] gap-2 items-center">
                  <Label className="text-sm text-muted-foreground">Subject:</Label>
                  <Input
                    value={composeEmail.subject}
                    onChange={(e) => setComposeEmail({ ...composeEmail, subject: e.target.value })}
                    placeholder="Email subject"
                    className="h-8"
                  />
                </div>
                <div className="grid grid-cols-[60px_1fr] gap-2 items-center">
                  <Label className="text-sm text-muted-foreground">CC:</Label>
                  <Input
                    value={composeEmail.cc}
                    onChange={(e) => setComposeEmail({ ...composeEmail, cc: e.target.value })}
                    placeholder="cc@example.com, another@example.com"
                    className="h-8"
                  />
                </div>
                <div className="grid grid-cols-[60px_1fr] gap-2 items-center">
                  <Label className="text-sm text-muted-foreground">BCC:</Label>
                  <Input
                    value={composeEmail.bcc}
                    onChange={(e) => setComposeEmail({ ...composeEmail, bcc: e.target.value })}
                    placeholder="bcc@example.com"
                    className="h-8"
                  />
                </div>
              </div>
              
              {/* Attachments Section with Drag & Drop */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Attachments</Label>
                <input
                  type="file"
                  ref={composeFileInputRef}
                  onChange={handleComposeFileSelect}
                  multiple
                  className="hidden"
                />
                <div
                  onDragOver={(e) => handleDragOver(e, setComposeDragActive)}
                  onDragLeave={(e) => handleDragLeave(e, setComposeDragActive)}
                  onDrop={(e) => handleDrop(e, (files) => setComposeAttachments(prev => [...prev, ...files]), setComposeDragActive)}
                  onClick={() => composeFileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                    composeDragActive 
                      ? 'border-primary bg-primary/5' 
                      : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                  }`}
                >
                  <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drag & drop files here or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Max 10MB per file
                  </p>
                </div>
                {/* QA PDF Attachment (from Report Q&A) */}
                {qaPDFAttachment && (
                  <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileIcon className="h-8 w-8 text-primary" />
                        <div>
                          <p className="font-medium text-sm">{qaPDFAttachment.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            {(qaPDFAttachment.fileSize / 1024).toFixed(1)} KB • From Report Q&A
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setQaPDFAttachment(null)}
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
                {composeAttachments.length > 0 && (
                  <div className="space-y-2 p-2 bg-muted/30 rounded-lg">
                    {composeAttachments.map((file, index) => (
                      <div key={index} className="flex items-center justify-between text-sm p-2 bg-background rounded">
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="truncate">{file.name}</span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            ({formatFileSize(file.size)})
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); removeComposeAttachment(index); }}
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Email Body */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Message Body *</Label>
                <Textarea
                  value={composeEmail.body}
                  onChange={(e) => setComposeEmail({ ...composeEmail, body: e.target.value })}
                  className="h-[300px] resize-none font-sans text-sm"
                  placeholder="Type your email message here..."
                />
              </div>
            </div>
          </ScrollArea>
          
          <DialogFooter className="flex-col gap-3 sm:flex-row sm:justify-between border-t pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Review carefully before sending
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowComposeModal(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSendComposedEmail} 
                disabled={isComposing || !composeEmail.to || !composeEmail.body}
                className="bg-green-600 hover:bg-green-700"
              >
                {isComposing ? (
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
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Draft Modal */}
      <Dialog open={showEditDraftModal} onOpenChange={setShowEditDraftModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-purple-600" />
              Edit Draft Reply
            </DialogTitle>
            <DialogDescription>
              Make changes to your draft reply below
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 min-h-0">
            <Textarea
              value={editableDraft}
              onChange={(e) => setEditableDraft(e.target.value)}
              className="h-[400px] resize-none font-sans text-sm"
              placeholder="Edit your draft reply..."
            />
          </div>
          
          <DialogFooter className="flex-col gap-3 sm:flex-row sm:justify-between border-t pt-4">
            <p className="text-xs text-muted-foreground">
              {editableDraft.length} characters
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowEditDraftModal(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSaveEditedDraft} 
                disabled={isSavingDraft || !editableDraft.trim()}
              >
                {isSavingDraft ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Save Draft
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Forward Email Modal */}
      <Dialog open={showForwardModal} onOpenChange={(open) => {
        setShowForwardModal(open);
        if (!open) {
          setForwardAttachments([]);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Forward className="h-5 w-5 text-blue-600" />
              Forward Email
            </DialogTitle>
            <DialogDescription>
              Forward this email to another recipient
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              {/* Recipients Section */}
              <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                <div className="grid grid-cols-[60px_1fr] gap-2 items-center">
                  <Label className="text-sm text-muted-foreground">To: *</Label>
                  <Input
                    value={forwardTo}
                    onChange={(e) => setForwardTo(e.target.value)}
                    placeholder="recipient@example.com"
                    className="h-8"
                  />
                </div>
                <div className="grid grid-cols-[60px_1fr] gap-2 items-center">
                  <Label className="text-sm text-muted-foreground">CC:</Label>
                  <Input
                    value={forwardCc}
                    onChange={(e) => setForwardCc(e.target.value)}
                    placeholder="cc@example.com"
                    className="h-8"
                  />
                </div>
                <div className="grid grid-cols-[60px_1fr] gap-2 items-center">
                  <Label className="text-sm text-muted-foreground">BCC:</Label>
                  <Input
                    value={forwardBcc}
                    onChange={(e) => setForwardBcc(e.target.value)}
                    placeholder="bcc@example.com"
                    className="h-8"
                  />
                </div>
              </div>
              
              {/* Attachments Section with Drag & Drop */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Attachments {forwardAttachments.length > 0 && `(${forwardAttachments.length})`}
                </Label>
                <input
                  type="file"
                  ref={forwardFileInputRef}
                  onChange={handleForwardFileSelect}
                  multiple
                  className="hidden"
                />
                <div
                  onDragOver={(e) => handleDragOver(e, setForwardDragActive)}
                  onDragLeave={(e) => handleDragLeave(e, setForwardDragActive)}
                  onDrop={(e) => handleDrop(e, (files) => setForwardAttachments(prev => [...prev, ...files]), setForwardDragActive)}
                  onClick={() => forwardFileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                    forwardDragActive 
                      ? 'border-primary bg-primary/5' 
                      : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                  }`}
                >
                  <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drag & drop files here or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Original attachments are included. Max 10MB per file.
                  </p>
                </div>
                {forwardAttachments.length > 0 && (
                  <div className="space-y-2 p-2 bg-muted/30 rounded-lg max-h-32 overflow-y-auto">
                    {forwardAttachments.map((file, index) => (
                      <div key={index} className="flex items-center justify-between text-sm p-2 bg-background rounded">
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="truncate">{file.name}</span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            ({formatFileSize(file.size)})
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); removeForwardAttachment(index); }}
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Email Body */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Message</Label>
                <Textarea
                  value={forwardBody}
                  onChange={(e) => setForwardBody(e.target.value)}
                  className="h-[250px] resize-none font-sans text-sm"
                  placeholder="Add a message before the forwarded content..."
                />
              </div>
            </div>
          </ScrollArea>
          
          <DialogFooter className="flex-col gap-3 sm:flex-row sm:justify-between border-t pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Forwarding with {forwardAttachments.length} attachment(s)
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowForwardModal(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSendForward} 
                disabled={isForwarding || !forwardTo || !forwardBody}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isForwarding ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Forwarding...
                  </>
                ) : (
                  <>
                    <Forward className="h-4 w-4 mr-2" />
                    Forward Email
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Personal Mailbox Settings Modal */}
      <MailboxSettingsModal 
        open={showMailboxSettings}
        onOpenChange={setShowMailboxSettings}
        currentMailbox={personalMailbox}
        onMailboxUpdated={(newMailbox) => {
          setPersonalMailbox(newMailbox);
          if (newMailbox) {
            toast.success('Personal mailbox configured successfully');
          }
        }}
      />
    </div>
  );
}

// Mailbox Settings Modal Component
function MailboxSettingsModal({ 
  open, 
  onOpenChange, 
  currentMailbox,
  onMailboxUpdated 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  currentMailbox: string | null;
  onMailboxUpdated: (mailbox: string | null) => void;
}) {
  const [mailboxValue, setMailboxValue] = useState(currentMailbox || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setMailboxValue(currentMailbox || '');
  }, [currentMailbox, open]);

  const handleSave = async () => {
    const sessionToken = localStorage.getItem('session_token');
    if (!sessionToken) {
      toast.error('Session expired. Please log in again.');
      return;
    }

    setIsSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-user-management', {
        body: { 
          action: 'update_own_mailbox', 
          session_token: sessionToken,
          personal_mailbox: mailboxValue || null
        }
      });

      if (error) throw error;

      if (data?.success) {
        onMailboxUpdated(mailboxValue || null);
        onOpenChange(false);
      } else {
        toast.error(data?.error || 'Failed to update mailbox');
      }
    } catch (err) {
      console.error('Failed to update mailbox:', err);
      toast.error('Failed to update mailbox');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configure Personal Mailbox
          </DialogTitle>
          <DialogDescription>
            Enter your personal Microsoft 365 email address to sync emails from your own mailbox.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="personal-mailbox">Personal Email Address</Label>
            <Input
              id="personal-mailbox"
              type="email"
              placeholder="your.email@company.com"
              value={mailboxValue}
              onChange={(e) => setMailboxValue(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              This email must be part of the same Microsoft 365 organization.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Mailbox'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}