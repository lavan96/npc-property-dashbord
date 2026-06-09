/**
 * Global Messages hub — consolidates every cross-portal thread
 * (Client Portal ↔ Command Centre and Finance Portal ↔ Command Centre/Client)
 * into a single workspace, independent of any client profile context.
 *
 * Distinct from the CRM Conversations tab, which surfaces external CRM
 * correspondence (GHL/SMS/email). This page is for portal-native messaging.
 */
import { useEffect, useMemo, useState } from 'react';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, MessageSquare, RefreshCcw, Search, ShieldCheck, Inbox, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { ClientPortalMessagesPanel } from '@/components/clients/ClientPortalMessagesPanel';
import { StaffFinancePortalMessagesPanel } from '@/components/clients/StaffFinancePortalMessagesPanel';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type NewMessageScope =
  | 'cp_client_only'
  | 'cp_internal'
  | 'cp_client_with_finance'
  | 'fp_command_finance'
  | 'fp_finance_client'
  | 'fp_command_client_allocated';

const SCOPE_OPTIONS: { value: NewMessageScope; label: string; group: 'client' | 'finance'; hint: string }[] = [
  { value: 'cp_client_only', label: 'Client Portal — Client visible', group: 'client', hint: 'Reply visible to client in their portal' },
  { value: 'cp_client_with_finance', label: 'Client Portal — Client + Finance allocated', group: 'client', hint: 'Visible to client and finance partner' },
  { value: 'cp_internal', label: 'Client Portal — Internal note', group: 'client', hint: 'Command Centre staff only' },
  { value: 'fp_command_finance', label: 'Finance Portal — Command ↔ Finance', group: 'finance', hint: 'Private between Command Centre and finance partner' },
  { value: 'fp_finance_client', label: 'Finance Portal — Finance ↔ Client (CC visible)', group: 'finance', hint: 'Finance partner ↔ client; Command Centre can observe' },
  { value: 'fp_command_client_allocated', label: 'Finance Portal — Command ↔ Client (finance allocated)', group: 'finance', hint: 'Command Centre ↔ client with finance allocation' },
];

interface ClientPortalThread {
  client_id: string;
  client_name: string;
  client_email: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_sender_type: string | null;
  unread_count: number;
}

interface FinanceThreadRow {
  id: string;
  client_id: string;
  finance_user_id: string;
  subject: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count_staff: number;
  thread_type?: string | null;
  visibility_scope?: string | null;
  clients?: { primary_contact_name?: string | null } | null;
  finance_portal_users?: { email?: string | null } | null;
}

interface FinanceClientGroup {
  client_id: string;
  client_name: string;
  partner_emails: string[];
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_total: number;
  thread_count: number;
}

export default function Messages() {
  const [tab, setTab] = useState<'client' | 'finance'>('client');
  const [search, setSearch] = useState('');

  // Client portal threads
  const [clientThreads, setClientThreads] = useState<ClientPortalThread[]>([]);
  const [loadingClient, setLoadingClient] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // Finance portal threads
  const [financeThreads, setFinanceThreads] = useState<FinanceThreadRow[]>([]);
  const [loadingFinance, setLoadingFinance] = useState(true);
  const [selectedFinanceClientId, setSelectedFinanceClientId] = useState<string | null>(null);

  // New Message dialog
  const [newOpen, setNewOpen] = useState(false);
  const [newScope, setNewScope] = useState<NewMessageScope>('cp_client_only');
  const [newClientId, setNewClientId] = useState<string>('');
  const [newClientSearch, setNewClientSearch] = useState('');
  const [allClients, setAllClients] = useState<{ id: string; primary_contact_name: string | null; primary_contact_email: string | null }[]>([]);
  const [loadingAllClients, setLoadingAllClients] = useState(false);

  const loadAllClients = async () => {
    setLoadingAllClients(true);
    const { data, error } = await invokeSecureFunction('finance-portal-admin', { operation: 'list_clients' });
    if (!error) setAllClients((data?.records || []) as any);
    setLoadingAllClients(false);
  };

  const loadClientThreads = async () => {
    setLoadingClient(true);
    const { data, error } = await invokeSecureFunction('staff-client-portal-messages', {
      operation: 'list_clients_with_messages',
    });
    if (!error) setClientThreads((data?.threads || []) as ClientPortalThread[]);
    setLoadingClient(false);
  };

  const loadFinanceThreads = async () => {
    setLoadingFinance(true);
    const { data, error } = await invokeSecureFunction('finance-portal-messages', {
      operation: 'list_threads',
    });
    if (!error) setFinanceThreads((data?.threads || []) as FinanceThreadRow[]);
    setLoadingFinance(false);
  };

  useEffect(() => {
    loadClientThreads();
    loadFinanceThreads();
  }, []);

  // Real-time refresh on any portal message activity
  useEffect(() => {
    const cpm = supabase
      .channel('global-messages-client-portal')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_portal_messages' }, () => loadClientThreads())
      .subscribe();
    const fpm = supabase
      .channel('global-messages-finance-portal')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_portal_messages' }, () => loadFinanceThreads())
      .subscribe();
    return () => {
      supabase.removeChannel(cpm);
      supabase.removeChannel(fpm);
    };
  }, []);

  const financeGrouped: FinanceClientGroup[] = useMemo(() => {
    const map = new Map<string, FinanceClientGroup>();
    for (const t of financeThreads) {
      const name = t.clients?.primary_contact_name || 'Client';
      const existing = map.get(t.client_id);
      const partnerEmail = t.finance_portal_users?.email || null;
      if (!existing) {
        map.set(t.client_id, {
          client_id: t.client_id,
          client_name: name,
          partner_emails: partnerEmail ? [partnerEmail] : [],
          last_message_at: t.last_message_at,
          last_message_preview: t.last_message_preview,
          unread_total: t.unread_count_staff || 0,
          thread_count: 1,
        });
      } else {
        existing.thread_count += 1;
        existing.unread_total += t.unread_count_staff || 0;
        if (partnerEmail && !existing.partner_emails.includes(partnerEmail)) {
          existing.partner_emails.push(partnerEmail);
        }
        if (
          t.last_message_at &&
          (!existing.last_message_at || new Date(t.last_message_at) > new Date(existing.last_message_at))
        ) {
          existing.last_message_at = t.last_message_at;
          existing.last_message_preview = t.last_message_preview;
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if ((b.unread_total > 0 ? 1 : 0) !== (a.unread_total > 0 ? 1 : 0)) {
        return (b.unread_total > 0 ? 1 : 0) - (a.unread_total > 0 ? 1 : 0);
      }
      return new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime();
    });
  }, [financeThreads]);

  const filteredClientThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clientThreads;
    return clientThreads.filter(
      (t) =>
        t.client_name?.toLowerCase().includes(q) ||
        t.client_email?.toLowerCase().includes(q) ||
        t.last_message_preview?.toLowerCase().includes(q),
    );
  }, [clientThreads, search]);

  const filteredFinanceGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return financeGrouped;
    return financeGrouped.filter(
      (g) =>
        g.client_name.toLowerCase().includes(q) ||
        g.partner_emails.some((e) => e.toLowerCase().includes(q)) ||
        g.last_message_preview?.toLowerCase().includes(q),
    );
  }, [financeGrouped, search]);

  const totalClientUnread = clientThreads.reduce((s, t) => s + (t.unread_count || 0), 0);
  const totalFinanceUnread = financeGrouped.reduce((s, t) => s + (t.unread_total || 0), 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Inbox className="h-6 w-6" />
            Portal Messages
          </h1>
          <p className="text-sm text-muted-foreground">
            All Client Portal and Finance Portal threads, consolidated for Command Centre oversight.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setNewOpen(true);
              if (allClients.length === 0) loadAllClients();
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            New message
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadClientThreads();
              loadFinanceThreads();
            }}
          >
            <RefreshCcw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by client, partner, or message…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'client' | 'finance')}>
        <TabsList>
          <TabsTrigger value="client" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Client Portal
            {totalClientUnread > 0 && (
              <Badge variant="destructive" className="ml-1">{totalClientUnread}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="finance" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            Finance Portal
            {totalFinanceUnread > 0 && (
              <Badge variant="destructive" className="ml-1">{totalFinanceUnread}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="client" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
            <Card className="lg:h-[75vh] flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Clients</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 p-0">
                {loadingClient ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredClientThreads.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-10">
                    No client portal messages yet.
                  </div>
                ) : (
                  <ScrollArea className="h-[70vh]">
                    <div className="divide-y">
                      {filteredClientThreads.map((t) => (
                        <button
                          key={t.client_id}
                          onClick={() => setSelectedClientId(t.client_id)}
                          className={cn(
                            'w-full text-left p-3 hover:bg-muted/50 transition-colors',
                            selectedClientId === t.client_id && 'bg-muted',
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium text-sm truncate">{t.client_name}</div>
                            {t.unread_count > 0 && (
                              <Badge variant="destructive" className="shrink-0">{t.unread_count}</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate mt-0.5">
                            {t.last_message_preview || '—'}
                          </div>
                          {t.last_message_at && (
                            <div className="text-[10px] text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(t.last_message_at), { addSuffix: true })}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            <Card className="lg:h-[75vh] flex flex-col">
              <CardContent className="flex-1 p-0 overflow-hidden">
                {selectedClientId ? (
                  <div className="h-full overflow-auto">
                    <ClientPortalMessagesPanel clientId={selectedClientId} />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
                    <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
                    Select a client to view portal messages.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="finance" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
            <Card className="lg:h-[75vh] flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Clients with Finance threads</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 p-0">
                {loadingFinance ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredFinanceGroups.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-10">
                    No finance portal threads yet.
                  </div>
                ) : (
                  <ScrollArea className="h-[70vh]">
                    <div className="divide-y">
                      {filteredFinanceGroups.map((g) => (
                        <button
                          key={g.client_id}
                          onClick={() => setSelectedFinanceClientId(g.client_id)}
                          className={cn(
                            'w-full text-left p-3 hover:bg-muted/50 transition-colors',
                            selectedFinanceClientId === g.client_id && 'bg-muted',
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium text-sm truncate">{g.client_name}</div>
                            {g.unread_total > 0 && (
                              <Badge variant="destructive" className="shrink-0">{g.unread_total}</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate mt-0.5">
                            {g.last_message_preview || '—'}
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <div className="text-[10px] text-muted-foreground truncate">
                              {g.partner_emails.join(', ') || 'Unassigned'}
                            </div>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {g.thread_count} {g.thread_count === 1 ? 'thread' : 'threads'}
                            </Badge>
                          </div>
                          {g.last_message_at && (
                            <div className="text-[10px] text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(g.last_message_at), { addSuffix: true })}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            <Card className="lg:h-[75vh] flex flex-col">
              <CardContent className="flex-1 p-0 overflow-hidden">
                {selectedFinanceClientId ? (
                  <div className="h-full overflow-auto p-4">
                    <StaffFinancePortalMessagesPanel clientId={selectedFinanceClientId} />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
                    <ShieldCheck className="h-8 w-8 mb-2 opacity-50" />
                    Select a client to view finance portal threads.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
