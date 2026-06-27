import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageComposer, renderFormattedMessage } from '@/components/conversations/MessageComposer';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useBrand } from '@/branding/useBrand';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  MessageSquare,
  Search,
  Loader2,
  ArrowLeft,
  Phone,
  Mail,
  MessageCircle,
  Instagram,
  Facebook,
  Globe,
  RefreshCw,
  ChevronDown,
  ExternalLink,
  CheckCircle2,
  XCircle,
  ShieldCheck,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GHLExportDialog } from '@/components/shared/GHLExportDialog';
import { format, isToday, isYesterday } from 'date-fns';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';


// ── Channel helpers ──────────────────────────────────────────
function normalizeChannel(ch: string | undefined): string {
  if (!ch) return 'sms';
  const lower = ch.toLowerCase();
  const map: Record<string, string> = {
    type_phone: 'sms', phone: 'sms', sms: 'sms', type_sms: 'sms', type_sms_reaction: 'sms',
    type_email: 'email', email: 'email',
    type_whatsapp: 'whatsapp', whatsapp: 'whatsapp',
    type_instagram: 'instagram', instagram: 'instagram',
    type_facebook: 'facebook', facebook: 'facebook',
    type_live_chat: 'live_chat', live_chat: 'live_chat', livechat: 'live_chat',
    type_call: 'sms', type_activity_contact: 'activity', type_activity_opportunity: 'activity',
    type_activity_appointment: 'activity',
  };
  return map[lower] || lower;
}

const channelIcons: Record<string, any> = {
  sms: Phone, email: Mail, whatsapp: MessageCircle,
  instagram: Instagram, facebook: Facebook, live_chat: Globe,
};

const channelColors: Record<string, string> = {
  sms: 'bg-blue-500/10 text-blue-300 border-blue-400/30 shadow-[0_0_22px_rgba(59,130,246,0.12)]',
  email: 'bg-amber-500/10 text-amber-200 border-amber-400/30 shadow-[0_0_22px_rgba(245,158,11,0.12)]',
  whatsapp: 'bg-emerald-500/10 text-emerald-200 border-emerald-400/30 shadow-[0_0_22px_rgba(16,185,129,0.12)]',
  instagram: 'bg-pink-500/10 text-pink-200 border-pink-400/30 shadow-[0_0_22px_rgba(236,72,153,0.12)]',
  facebook: 'bg-indigo-500/10 text-indigo-200 border-indigo-400/30 shadow-[0_0_22px_rgba(99,102,241,0.12)]',
  live_chat: 'bg-purple-500/10 text-purple-200 border-purple-400/30 shadow-[0_0_22px_rgba(168,85,247,0.12)]',
};

const channelToGhlType = (ch: string): string => {
  switch (ch) {
    case 'email': return 'Email';
    case 'whatsapp': return 'WhatsApp';
    default: return 'SMS';
  }
};

// ── Types ────────────────────────────────────────────────────
interface ConversationRow {
  id: string;
  ghl_conversation_id: string;
  channel_type: string;
  last_message_body: string | null;
  last_message_date: string | null;
  last_message_direction: string | null;
  unread_count: number;
  client_id: string | null;
  ghl_contact_id: string | null;
  // joined
  client_name?: string;
  client_email?: string | null;
}

interface Message {
  id: string;
  ghl_message_id: string;
  direction: string;
  body: string | null;
  message_type?: string | null;
  content_type?: string | null;
  channel_type?: string | null;
  message_status: string | null;
  ghl_date_added: string | null;
  attachment_urls: string[] | null;
  sender_name: string | null;
}

interface ExportJobStatus {
  jobId: string;
  status: 'starting' | 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  fileFormat: 'csv' | 'xlsx';
  totalItems: number;
  processedItems: number;
  totalMessages: number;
  signedUrl?: string | null;
  fileSizeBytes?: number | null;
  errorSummary?: string | null;
}

// ── Sync helper ──────────────────────────────────────────────
async function triggerGhlSync() {
  const { data, error } = await invokeSecureFunction('sync-ghl-conversations', { mode: 'incremental' });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

// ── Page Component ───────────────────────────────────────────
export default function Conversations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { settings: brandSettings } = useBrand();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchTerm, setSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'));
  const [replyText, setReplyText] = useState('');
  const [replyChannel, setReplyChannel] = useState<string>('sms');
  const [emailSubject, setEmailSubject] = useState('');
  const [selectedMailbox, setSelectedMailbox] = useState<string>('admin');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isExportingHistory, setIsExportingHistory] = useState(false);
  const [exportJobStatus, setExportJobStatus] = useState<ExportJobStatus | null>(null);
  
  // Resizable panel state
  const [convPanelWidth, setConvPanelWidth] = useState(360);
  const isDraggingConvRef = useRef(false);
  const dragStartXConvRef = useRef(0);
  const dragStartWidthConvRef = useRef(360);

  // ── Sync from GHL API then refetch local data ──
  const handleSyncAndRefresh = async () => {
    setIsSyncing(true);
    try {
      await triggerGhlSync();
      await refetchConversations();
      if (selectedId) {
        queryClient.invalidateQueries({ queryKey: ['conversation-messages', selectedId] });
      }
      toast.success('Conversations synced from GHL');
    } catch (err: any) {
      console.error('GHL sync failed:', err);
      toast.error('Sync failed: ' + err.message);
      // Still refetch local data
      await refetchConversations();
    } finally {
      setIsSyncing(false);
    }
  };

  // ── Fetch ALL conversations via edge function ──
  const { data: conversations = [], isLoading: loadingConversations, refetch: refetchConversations } = useQuery({
    queryKey: ['all-conversations'],
    queryFn: async () => {
      // Fetch all conversations through the secure edge function
      const { data, error } = await invokeSecureFunction('get-client-data', {
        listMode: true,
        listOptions: {
          table: 'ghl_conversations',
          orderBy: 'last_message_date',
          order_asc: false,
        },
      });
      if (error) throw new Error(error.message);
      const convos = (data?.records || []) as any[];

      // Fetch client names for all unique client_ids
      const clientIds = [...new Set(convos.map(c => c.client_id).filter(Boolean))] as string[];
      let clientMap: Record<string, { name: string; email: string | null }> = {};
      if (clientIds.length > 0) {
        const { data: clientData, error: clientErr } = await invokeSecureFunction('get-client-data', {
          clientIds,
        });
        if (!clientErr && clientData?.clients) {
          clientData.clients.forEach((c: any) => {
            const cl = c.client || c;
            clientMap[c.id] = {
              name: [cl.primary_first_name, cl.primary_surname].filter(Boolean).join(' ') || 'Unknown',
              email: cl.primary_email,
            };
          });
        }
      }

      return convos.map(c => ({
        ...c,
        client_name: c.client_id ? clientMap[c.client_id]?.name || 'Unknown' : 'Unlinked Contact',
        client_email: c.client_id ? clientMap[c.client_id]?.email : null,
      })) as ConversationRow[];
    },
  });

  const selectedConversation = useMemo(
    () => conversations.find(c => c.id === selectedId) || null,
    [conversations, selectedId]
  );

  // ── Fetch messages for selected conversation ──
  const { data: messages = [], isLoading: loadingMessages } = useQuery({
    queryKey: ['conversation-messages', selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data, error } = await invokeSecureFunction('get-client-data', {
        listMode: true,
        listOptions: {
          table: 'ghl_conversation_messages',
          filters: { conversation_id: selectedId },
          orderBy: 'ghl_date_added',
          order_asc: true,
        },
      });
      if (error) throw new Error(error.message);
      return (data?.records || []) as Message[];
    },
    enabled: !!selectedId,
  });

  // ── Mailboxes ──
  const { data: mailboxes = [] } = useQuery({
    queryKey: ['mailboxes-conversations-page'],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('get-client-data', {
        listMode: true,
        listOptions: {
          table: 'custom_users',
          select: 'id, email, personal_mailbox',
        },
      });
      if (error) throw new Error(error.message);
      return (data?.records || []).filter((u: any) => u.personal_mailbox) || [];
    },
    enabled: replyChannel === 'email',
  });

  // ── Send reply ──
  const sendMutation = useMutation({
    mutationFn: async ({ conversationId, message, type, subject }: { conversationId: string; message: string; type: string; subject?: string }) => {
      if (type === 'Email') {
        const email = selectedConversation?.client_email;
        if (!email) throw new Error('Client does not have an email address');
        const { data, error } = await invokeSecureFunction('send-email-reply', {
          to: email,
          subject: subject || `Message from ${brandSettings.companyName || 'Dashboard'}`,
          body: message,
          mailboxSource: selectedMailbox,
        });
        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);
        return data;
      }
      const { data, error } = await invokeSecureFunction('send-ghl-message', {
        conversationId,
        message,
        type,
        ...(subject ? { subject } : {}),
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data, variables) => {
      setReplyText('');
      setEmailSubject('');
      toast.success('Message sent');
      // Optimistically add the sent message to the cache so it appears immediately
      queryClient.setQueryData(['conversation-messages', selectedId], (old: Message[] | undefined) => {
        if (!old) return old;
        const optimisticMsg: Message = {
          id: `optimistic-${Date.now()}`,
          ghl_message_id: `opt-${Date.now()}`,
          body: variables.message,
          direction: 'outbound',
          message_type: variables.type,
          channel_type: replyChannel,
          content_type: null,
          ghl_date_added: new Date().toISOString(),
          message_status: 'sent',
          attachment_urls: null,
          sender_name: null,
        };
        return [...old, optimisticMsg];
      });
      // Also refetch to get the real server data
      queryClient.invalidateQueries({ queryKey: ['conversation-messages', selectedId] });
      refetchConversations();
    },
    onError: (err: any) => toast.error('Failed to send: ' + err.message),
  });

  // ── Realtime subscription ──
  useEffect(() => {
    const channel = supabase
      .channel('conversations-page-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ghl_conversations' }, () => {
        refetchConversations();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ghl_conversation_messages' }, (payload) => {
        if (selectedId && (payload.new as any).conversation_id === selectedId) {
          queryClient.invalidateQueries({ queryKey: ['conversation-messages', selectedId] });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedId]);

  // ── When conversation changes ──
  useEffect(() => {
    if (selectedConversation) {
      const ch = normalizeChannel(selectedConversation.channel_type);
      setReplyChannel(['sms', 'email', 'whatsapp'].includes(ch) ? ch : 'sms');
      setEmailSubject('');
      setReplyText('');
    }
  }, [selectedId]);

  // ── Auto-scroll messages ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Deep-link from notification ──
  useEffect(() => {
    const id = searchParams.get('id');
    if (id && id !== selectedId) setSelectedId(id);
  }, [searchParams]);

  // ── Filter conversations ──
  const filteredConversations = useMemo(() => {
    let list = conversations;
    if (channelFilter !== 'all') {
      list = list.filter(c => normalizeChannel(c.channel_type) === channelFilter);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(c =>
        c.client_name?.toLowerCase().includes(term) ||
        c.last_message_body?.toLowerCase().includes(term)
      );
    }
    return list;
  }, [conversations, channelFilter, searchTerm]);

  // ── Group messages by date ──
  const groupedMessages = useMemo(() => {
    const groups: { label: string; messages: Message[] }[] = [];
    let currentLabel = '';
    messages.forEach((msg) => {
      const d = msg.ghl_date_added ? new Date(msg.ghl_date_added) : new Date();
      let label: string;
      if (isToday(d)) label = 'Today';
      else if (isYesterday(d)) label = 'Yesterday';
      else label = format(d, 'EEEE, dd MMMM yyyy');
      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    });
    return groups;
  }, [messages]);

  const formatConversationDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isToday(d)) return format(d, 'h:mm a');
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'dd/MM/yy');
  };

  // ── Full message history export (server-side, async) ──
  // Spawns a background edge worker that paginates everything (no 1000-row
  // cap), builds the file, uploads to storage, returns a signed URL.
  // The browser only polls a small status row.
  const exportFullMessageHistory = async (fileFormat: 'csv' | 'xlsx') => {
    if (filteredConversations.length === 0) {
      toast.error('No conversations in current view to export');
      return;
    }
    setIsExportingHistory(true);
    setExportJobStatus({
      jobId: 'starting',
      status: 'starting',
      fileFormat,
      totalItems: filteredConversations.length,
      processedItems: 0,
      totalMessages: 0,
    });
    const toastId = toast.loading(
      `Starting export of ${filteredConversations.length} conversations...`
    );
    try {
      // 1. Kick off the job
      const conversationIds = filteredConversations.map((c) => c.id);
      const { data: startData, error: startErr } = await invokeSecureFunction<any>(
        'start-conversations-export',
        { conversation_ids: conversationIds, file_format: fileFormat },
        { timeoutMs: 30000 },
      );
      if (startErr) throw new Error(startErr.message || 'Failed to start export');
      const jobId = (startData as any)?.job_id;
      if (!jobId) throw new Error('No job_id returned from server');
      setExportJobStatus((prev) => prev ? { ...prev, jobId, status: 'pending' } : null);

      // 2. Poll status (up to 10 minutes)
      const pollIntervalMs = 2500;
      const maxAttempts = Math.ceil((10 * 60 * 1000) / pollIntervalMs);
      let lastProcessed = -1;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));

        let job: any = null;
        try {
          const { data, error } = await invokeSecureFunction<any>(
            'get-client-data',
            {
              listMode: true,
              listOptions: { table: 'export_jobs', filters: { id: jobId }, limit: 1 },
            },
            { timeoutMs: 15000 },
          );
          if (error) throw new Error(error.message);
          job = ((data as any)?.records || [])[0];
        } catch (e: any) {
          console.warn('[exportFullMessageHistory] poll error:', e?.message);
          continue;
        }

        if (!job) continue;

        const lastServerUpdate = job.updated_at || job.started_at || job.created_at;
        const staleMs = lastServerUpdate ? Date.now() - new Date(lastServerUpdate).getTime() : 0;
        if ((job.status === 'pending' || job.status === 'processing') && staleMs > 3 * 60 * 1000) {
          throw new Error('Export worker stopped responding. Please retry the export.');
        }

        setExportJobStatus({
          jobId,
          status: job.status,
          fileFormat,
          totalItems: job.total_items || filteredConversations.length,
          processedItems: job.processed_items || 0,
          totalMessages: job.total_messages || 0,
          signedUrl: job.signed_url,
          fileSizeBytes: job.file_size_bytes,
          errorSummary: job.error_summary,
        });

        if (job.processed_items !== lastProcessed) {
          lastProcessed = job.processed_items;
          toast.loading(
            `Processed ${job.processed_items}/${job.total_items} conversations` +
              (job.total_messages ? ` · ${job.total_messages} messages` : ''),
            { id: toastId },
          );
        }

        if (job.status === 'completed') {
          if (!job.signed_url) throw new Error('Export completed but no download URL was provided');
          const a = document.createElement('a');
          a.href = job.signed_url;
          a.download = '';
          a.target = '_blank';
          a.rel = 'noopener';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          const sizeMB = job.file_size_bytes
            ? (job.file_size_bytes / (1024 * 1024)).toFixed(2)
            : null;
          toast.success(
            `Export ready · ${job.total_messages} messages from ${job.processed_items} conversations` +
              (sizeMB ? ` (${sizeMB} MB)` : ''),
            { id: toastId, duration: 8000 },
          );
          setExportJobStatus((prev) => prev ? { ...prev, status: 'completed' } : null);
          return;
        }

        if (job.status === 'failed') throw new Error(job.error_summary || 'Export worker failed');
        if (job.status === 'cancelled') throw new Error('Export was cancelled');
      }

      throw new Error('Export timed out after 10 minutes. Check the export jobs table for status.');
    } catch (err: any) {
      console.error('Full history export failed:', err);
      setExportJobStatus((prev) => prev ? {
        ...prev,
        status: 'failed',
        errorSummary: err?.message || 'Unknown error',
      } : null);
      toast.error(`Export failed: ${err?.message || 'Unknown error'}`, { id: toastId });
    } finally {
      setIsExportingHistory(false);
    }
  };

  const ghlExportFields = [
    { key: 'first_name', label: 'First Name' },
    { key: 'last_name', label: 'Last Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'tags', label: 'Tags' },
    { key: 'source', label: 'Source' },
    { key: 'contact_id', label: 'Contact ID' },
    { key: 'conversation_id', label: 'Conversation ID' },
    { key: 'channel', label: 'Channel' },
    { key: 'last_message', label: 'Last Message' },
    { key: 'last_message_date', label: 'Last Message Date' },
    { key: 'unread_count', label: 'Unread Count' },
  ];
  const ghlExportRecords = filteredConversations.map((conversation) => {
    const [firstName = '', ...rest] = (conversation.client_name || '').split(' ');
    return {
      first_name: firstName,
      last_name: rest.join(' '),
      email: conversation.client_email || '',
      phone: '',
      tags: 'Conversation Export',
      source: 'GHL Conversations',
      contact_id: conversation.ghl_contact_id || '',
      conversation_id: conversation.ghl_conversation_id || '',
      channel: normalizeChannel(conversation.channel_type),
      last_message: conversation.last_message_body || '',
      last_message_date: conversation.last_message_date ? format(new Date(conversation.last_message_date), 'yyyy-MM-dd HH:mm:ss') : '',
      unread_count: String(conversation.unread_count || 0),
    };
  });

  const handleSelectConversation = async (conv: ConversationRow) => {
    setSelectedId(conv.id);
    setSearchParams({ id: conv.id });

    // Mark as read: reset unread_count to 0
    if (conv.unread_count > 0) {
      try {
        await invokeSecureFunction('manage-client-data', {
          table: 'ghl_conversations',
          operation: 'update',
          id: conv.id,
          data: { unread_count: 0 },
        });
        // Optimistically update the local cache
        queryClient.setQueryData(['all-conversations'], (old: ConversationRow[] | undefined) =>
          (old || []).map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c)
        );
      } catch (err) {
        console.error('Failed to mark conversation as read:', err);
      }
    }
  };

  const handleBack = () => {
    setSelectedId(null);
    setSearchParams({});
  };

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedConversation) return;
    if (replyChannel === 'email' && !emailSubject.trim()) {
      toast.error('Please enter an email subject');
      return;
    }
    sendMutation.mutate({
      conversationId: selectedConversation.ghl_conversation_id,
      message: replyText.trim(),
      type: channelToGhlType(replyChannel),
      ...(replyChannel === 'email' && emailSubject.trim() ? { subject: emailSubject.trim() } : {}),
    });
  };

  const exportProgressPercent = exportJobStatus?.totalItems
    ? Math.min(100, Math.round((exportJobStatus.processedItems / exportJobStatus.totalItems) * 100))
    : 0;
  const exportSizeMB = exportJobStatus?.fileSizeBytes
    ? (exportJobStatus.fileSizeBytes / (1024 * 1024)).toFixed(2)
    : null;

  // ── Show thread on mobile (hide list) ──
  const showThread = !!selectedId && isMobile;
  const showList = !selectedId || !isMobile;

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(234,179,8,0.12),transparent_30%),linear-gradient(135deg,hsl(220_20%_5%),hsl(222_18%_8%)_45%,hsl(220_16%_6%))] p-3 text-foreground md:p-5">
      {/* Page header */}
      <div className="relative z-10 flex shrink-0 flex-col gap-4 overflow-hidden rounded-[1.75rem] border border-amber-300/20 bg-[linear-gradient(135deg,rgba(10,10,10,0.88),rgba(24,24,27,0.78)_48%,rgba(120,53,15,0.18))] px-4 py-4 shadow-2xl shadow-black/35 backdrop-blur-xl md:flex-row md:items-center md:justify-between md:px-5">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/70 to-transparent" />
        <div className="pointer-events-none absolute -right-16 -top-20 h-40 w-40 rounded-full bg-amber-300/10 blur-3xl" />
        <div className="relative flex min-w-0 flex-1 items-center gap-3">
          {isMobile && selectedId && (
            <Button variant="ghost" size="sm" className="h-9 w-9 shrink-0 rounded-full p-0 text-zinc-200 hover:bg-white/10 hover:text-white" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-200/30 bg-[radial-gradient(circle_at_30%_20%,rgba(251,191,36,0.32),rgba(245,158,11,0.10)_55%,rgba(0,0,0,0.25))] shadow-[0_0_36px_rgba(234,179,8,0.18)]">
            <MessageSquare className="h-5 w-5 text-amber-200" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-[-0.03em] text-white md:text-3xl">Conversations</h1>
              {!loadingConversations && (
                <Badge variant="secondary" className="rounded-full border border-amber-200/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_22px_rgba(234,179,8,0.12)]">
                  <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.8)]" />
                  {conversations.length} total
                </Badge>
              )}
            </div>
            <p className="hidden text-sm text-zinc-400 sm:block">Premium CRM communications centre</p>
          </div>
        </div>
        <div className="relative flex flex-wrap items-center gap-2.5 md:justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={isExportingHistory} className="h-10 rounded-full border-amber-200/25 bg-zinc-950/75 px-4 font-semibold text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:-translate-y-0.5 hover:border-amber-200/55 hover:bg-amber-300/10 hover:text-amber-50 disabled:translate-y-0 disabled:opacity-60">
                {isExportingHistory ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                {isExportingHistory ? 'Exporting...' : 'Export'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onClick={() => setShowExportDialog(true)}>
                Conversation summary (GHL contacts)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => exportFullMessageHistory('xlsx')}
                disabled={isExportingHistory}
              >
                Full message history (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => exportFullMessageHistory('csv')}
                disabled={isExportingHistory}
              >
                Full message history (.csv)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            className="group h-10 rounded-full border-emerald-300/25 bg-emerald-950/30 px-4 font-semibold text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_24px_rgba(16,185,129,0.08)] transition-all hover:-translate-y-0.5 hover:border-emerald-200/55 hover:bg-emerald-400/10 hover:text-emerald-50 disabled:translate-y-0 disabled:opacity-65"
            onClick={handleSyncAndRefresh}
            disabled={isSyncing || loadingConversations}
          >
            <span className="mr-2 flex h-5 w-5 items-center justify-center rounded-full border border-emerald-200/25 bg-emerald-300/10">
              {isSyncing || loadingConversations ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-200" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-200 transition-transform group-hover:scale-110" />
              )}
            </span>
            {isSyncing ? 'Syncing...' : 'Sync'}
          </Button>
        </div>
      </div>

      {exportJobStatus && (
        <div className="mt-3 shrink-0 rounded-2xl border border-amber-400/20 bg-zinc-950/75 px-4 py-3 shadow-xl shadow-black/25 backdrop-blur-xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                {exportJobStatus.status === 'completed' ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : exportJobStatus.status === 'failed' ? (
                  <XCircle className="h-4 w-4 text-destructive" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
                <span>
                  {exportJobStatus.status === 'completed'
                    ? 'Conversation export ready'
                    : exportJobStatus.status === 'failed'
                      ? 'Conversation export failed'
                      : `Exporting full message history (${exportJobStatus.fileFormat.toUpperCase()})`}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {exportJobStatus.status === 'failed'
                  ? exportJobStatus.errorSummary
                  : `${exportJobStatus.processedItems}/${exportJobStatus.totalItems} conversations · ${exportJobStatus.totalMessages} messages`}
                {exportSizeMB ? ` · ${exportSizeMB} MB` : ''}
              </p>
              {exportJobStatus.status !== 'completed' && exportJobStatus.status !== 'failed' && (
                <div className="h-1.5 w-full max-w-xl overflow-hidden rounded-full bg-background">
                  <div className="h-full bg-primary transition-all" style={{ width: `${exportProgressPercent}%` }} />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {exportJobStatus.status === 'completed' && exportJobStatus.signedUrl && (
                <Button size="sm" asChild>
                  <a href={exportJobStatus.signedUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Download
                  </a>
                </Button>
              )}
              {(exportJobStatus.status === 'completed' || exportJobStatus.status === 'failed') && (
                <Button size="sm" variant="ghost" onClick={() => setExportJobStatus(null)}>
                  Dismiss
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <GHLExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        title="Export conversations for GHL"
        description="Map the conversation list into GHL-compatible headers and export as CSV or XLSX."
        fields={ghlExportFields}
        records={ghlExportRecords}
        fileBaseName={`ghl-conversations-export-${format(new Date(), 'yyyy-MM-dd')}`}
        sheetName="Conversations"
        onExported={(exportFormat, count) => toast.success(`Exported ${count} conversations to ${exportFormat.toUpperCase()}`)}
      />

      {/* Main content area */}
      <div className="mt-3 flex min-h-0 flex-1 overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/55 shadow-2xl shadow-black/35 backdrop-blur-xl"
        onMouseMove={(e) => {
          if (!isDraggingConvRef.current) return;
          const delta = e.clientX - dragStartXConvRef.current;
          const newWidth = Math.min(550, Math.max(260, dragStartWidthConvRef.current + delta));
          setConvPanelWidth(newWidth);
        }}
        onMouseUp={() => { isDraggingConvRef.current = false; }}
        onMouseLeave={() => { isDraggingConvRef.current = false; }}
      >
        {/* ─── LEFT PANEL: Conversation List ─── */}
        {showList && (
          <div 
            className={cn('flex flex-col border-r border-white/10 bg-black/35', isMobile && 'w-full')}
            style={!isMobile ? { width: convPanelWidth, minWidth: 260, maxWidth: 550, flexShrink: 0 } : undefined}
          >
            {/* Search & filter */}
            <div className="shrink-0 space-y-3 border-b border-white/10 bg-zinc-950/70 p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search conversations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-9 border-white/10 bg-black/45 pl-9 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:border-amber-300/50 focus-visible:ring-amber-300/25"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {['all', 'sms', 'email', 'whatsapp'].map(ch => (
                  <Button
                    key={ch}
                    variant={channelFilter === ch ? 'default' : 'outline'}
                    size="sm"
                    className={cn("h-7 rounded-full px-3 text-xs transition-all", channelFilter === ch ? "bg-amber-400 text-black shadow-[0_0_20px_rgba(234,179,8,0.25)] hover:bg-amber-300" : "border-white/10 bg-zinc-900/70 text-zinc-300 hover:border-amber-300/40 hover:bg-amber-400/10 hover:text-amber-100")}
                    onClick={() => setChannelFilter(ch)}
                  >
                    {ch === 'all' ? 'All' : ch === 'sms' ? 'SMS' : ch === 'whatsapp' ? 'WhatsApp' : 'Email'}
                  </Button>
                ))}
              </div>
            </div>

            {/* Conversation list */}
            <ScrollArea className="flex-1 min-h-0">
              {loadingConversations ? (
                <div className="p-3 space-y-3">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex gap-3 items-center">
                      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-32" />
                        <Skeleton className="h-3 w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <MessageSquare className="h-8 w-8 mb-3 opacity-40" />
                  <p className="text-sm font-medium">No conversations found</p>
                  <p className="text-xs mt-1">
                    {searchTerm || channelFilter !== 'all' ? 'Try adjusting your filters' : 'Conversations will appear when messages are synced'}
                  </p>
                </div>
              ) : (
                <div>
                  {filteredConversations.map((conv) => {
                    const normalized = normalizeChannel(conv.channel_type);
                    const Icon = channelIcons[normalized] || MessageSquare;
                    const isActive = conv.id === selectedId;

                    return (
                      <div
                        key={conv.id}
                        className={cn(
                          'group relative flex cursor-pointer items-center gap-3 border-b border-white/[0.07] px-3 py-3 transition-all duration-200 focus-within:bg-amber-400/10 hover:bg-white/[0.055]',
                          isActive ? 'bg-amber-400/10 shadow-[inset_3px_0_0_rgba(234,179,8,0.9)]' : '',
                          conv.unread_count > 0 && !isActive && 'bg-amber-400/[0.045]'
                        )}
                        onClick={() => handleSelectConversation(conv)}
                      >
                        <div className={cn('h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 border transition-transform duration-200 group-hover:scale-105', channelColors[normalized] || 'bg-muted')}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn('truncate text-sm text-zinc-100', conv.unread_count > 0 ? 'font-semibold' : 'font-medium')}>
                              {conv.client_name}
                            </span>
                            <span className="shrink-0 text-[11px] text-zinc-500">
                              {formatConversationDate(conv.last_message_date)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <p className={cn('truncate text-xs', conv.unread_count > 0 ? 'text-zinc-100' : 'text-zinc-500')}>
                              {conv.last_message_direction === 'outbound' && (
                                <span className="text-muted-foreground">You: </span>
                              )}
                              {conv.last_message_body || 'No messages'}
                            </p>
                            {conv.unread_count > 0 && (
                              <Badge className="h-5 min-w-[20px] rounded-full text-[10px] px-1.5 bg-primary shrink-0">
                                {conv.unread_count}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        )}

        {/* Resizable Drag Handle */}
        {!isMobile && showList && (
          <div
            className="group relative w-1.5 flex-shrink-0 cursor-col-resize bg-transparent transition-all hover:w-2 hover:bg-amber-400/15"
            onMouseDown={(e) => {
              e.preventDefault();
              isDraggingConvRef.current = true;
              dragStartXConvRef.current = e.clientX;
              dragStartWidthConvRef.current = convPanelWidth;
            }}
          >
            <div className="absolute inset-y-4 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-white/10 transition-colors group-hover:bg-amber-300/50" />
          </div>
        )}

        {/* ─── RIGHT PANEL: Thread View ─── */}
        {(selectedId || !isMobile) && (
          <div className={cn('flex min-w-0 flex-1 flex-col bg-[radial-gradient(circle_at_top_right,rgba(234,179,8,0.08),transparent_28%)]', !selectedId && 'items-center justify-center')}>
            {!selectedId ? (
              <div className="rounded-3xl border border-amber-300/15 bg-black/35 p-10 text-center text-zinc-400 shadow-2xl shadow-black/25">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">Select a conversation</p>
                <p className="text-xs mt-1">Choose from the list to view messages</p>
              </div>
            ) : selectedConversation ? (
              <>
                {/* Thread header with client context */}
                <div className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-zinc-950/70 px-4 py-3">
                  {!isMobile && (
                    <div className={cn('h-10 w-10 rounded-2xl flex items-center justify-center border shrink-0',
                      channelColors[normalizeChannel(selectedConversation.channel_type)] || 'bg-muted'
                    )}>
                      {(() => { const I = channelIcons[normalizeChannel(selectedConversation.channel_type)] || MessageSquare; return <I className="h-4 w-4" />; })()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{selectedConversation.client_name}</p>
                    <p className="text-[11px] text-muted-foreground capitalize">
                      {normalizeChannel(selectedConversation.channel_type).replace('_', ' ')}
                      {selectedConversation.client_id && (
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 ml-2 text-[11px] text-primary"
                          onClick={() => window.open(`/clients?clientId=${selectedConversation.client_id}`, '_blank')}
                        >
                          View Client <ExternalLink className="h-2.5 w-2.5 ml-0.5" />
                        </Button>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 shrink-0"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['conversation-messages', selectedId] })}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 min-h-0">
                  <div className="px-4 py-4">
                    {loadingMessages ? (
                      <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center py-16 text-muted-foreground">
                        <MessageSquare className="h-6 w-6 mx-auto mb-2 opacity-40" />
                        <p className="text-xs">No messages in this conversation</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {groupedMessages.map((group) => (
                          <div key={group.label}>
                            <div className="my-4 flex items-center gap-2">
                              <Separator className="flex-1" />
                              <span className="text-[10px] text-muted-foreground font-medium px-2 whitespace-nowrap">{group.label}</span>
                              <Separator className="flex-1" />
                            </div>
                            <div className="space-y-2">
                              {group.messages.map((msg) => {
                                const isOutbound = msg.direction === 'outbound';
                                const msgChannel = normalizeChannel(msg.channel_type || selectedConversation?.channel_type || '');
                                
                                // Channel-specific outbound colors (light shades for readability)
                                const getOutboundBubbleClass = () => {
                                  switch (msgChannel) {
                                    case 'sms': return 'bg-blue-100 dark:bg-blue-900/40 text-foreground rounded-br-md';
                                    case 'whatsapp': return 'bg-green-100 dark:bg-green-900/40 text-foreground rounded-br-md';
                                    case 'email': return 'bg-amber-100 dark:bg-amber-900/40 text-foreground rounded-br-md';
                                    default: return 'bg-blue-100 dark:bg-blue-900/40 text-foreground rounded-br-md';
                                  }
                                };
                                
                                const getTimestampClass = () => {
                                  if (!isOutbound) return 'text-muted-foreground';
                                  switch (msgChannel) {
                                    case 'sms': return 'text-blue-500 dark:text-blue-400';
                                    case 'whatsapp': return 'text-green-600 dark:text-green-400';
                                    case 'email': return 'text-amber-600 dark:text-amber-400';
                                    default: return 'text-blue-500 dark:text-blue-400';
                                  }
                                };

                                return (
                                  <div key={msg.id} className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}>
                                    <div className={cn(
                                      'max-w-[75%] rounded-2xl border px-3.5 py-2 text-sm shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl',
                                      isOutbound
                                        ? `${getOutboundBubbleClass()} border-white/10`
                                        : 'rounded-bl-md border-white/10 bg-zinc-900/90 text-zinc-100'
                                    )}>
                                      {!isOutbound && msg.sender_name && (
                                        <p className="text-[10px] font-medium mb-0.5 opacity-70">{msg.sender_name}</p>
                                      )}
                                      {msg.body && (
                                        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
                                          {renderFormattedMessage(msg.body, msg.channel_type || selectedConversation?.channel_type || 'sms')}
                                        </p>
                                      )}
                                      {msg.attachment_urls && msg.attachment_urls.length > 0 && (
                                        <div className="mt-1.5 space-y-1">
                                          {msg.attachment_urls.map((url, i) => (
                                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-xs underline block truncate">
                                              Attachment {i + 1}
                                            </a>
                                          ))}
                                        </div>
                                      )}
                                      <p className={cn('text-[10px] mt-1', getTimestampClass())}>
                                        {msg.ghl_date_added && format(new Date(msg.ghl_date_added), 'h:mm a')}
                                        {msg.message_status && msg.message_status !== 'delivered' && (
                                          <span className="ml-1.5">· {msg.message_status}</span>
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {/* Reply composer */}
                <div className="shrink-0 space-y-2 border-t border-white/10 bg-zinc-950/75 px-4 py-3 shadow-[0_-18px_40px_rgba(0,0,0,0.25)]">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">Send via:</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 gap-1.5 border-amber-300/20 bg-black/35 px-2.5 text-xs text-amber-100 hover:bg-amber-400/10">
                          {(() => { const I = channelIcons[replyChannel] || MessageSquare; return <I className="h-3 w-3" />; })()}
                          <span className="capitalize">{replyChannel === 'sms' ? 'SMS' : replyChannel === 'whatsapp' ? 'WhatsApp' : 'Email'}</span>
                          <ChevronDown className="h-3 w-3 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="min-w-[140px]">
                        <DropdownMenuItem onClick={() => setReplyChannel('sms')} className="gap-2 text-xs">
                          <Phone className="h-3.5 w-3.5" /> SMS
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setReplyChannel('email')} className="gap-2 text-xs">
                          <Mail className="h-3.5 w-3.5" /> Email
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setReplyChannel('whatsapp')} className="gap-2 text-xs">
                          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {replyChannel === 'email' && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">Mailbox:</span>
                        <Select value={selectedMailbox} onValueChange={setSelectedMailbox}>
                          <SelectTrigger className="h-7 text-xs flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin" className="text-xs">Admin Mailbox</SelectItem>
                            {mailboxes.map((mb) => (
                              <SelectItem key={mb.id} value="personal" className="text-xs">
                                Personal — {mb.personal_mailbox}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Input
                        placeholder="Email subject..."
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        className="h-8 border-white/10 bg-black/35 text-sm focus-visible:border-amber-300/50 focus-visible:ring-amber-300/25"
                      />
                    </>
                  )}

                  <MessageComposer
                    value={replyText}
                    onChange={setReplyText}
                    onSend={handleSendReply}
                    isSending={sendMutation.isPending}
                    disabled={!replyText.trim() || (replyChannel === 'email' && !emailSubject.trim())}
                    channel={replyChannel as 'sms' | 'email' | 'whatsapp'}
                    placeholder={`Type your ${replyChannel === 'sms' ? 'SMS' : replyChannel === 'whatsapp' ? 'WhatsApp' : 'email'} message...`}
                    rows={replyChannel === 'email' ? 4 : 2}
                  />
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
