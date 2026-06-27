/**
 * Staff-side panel for the FINANCE PORTAL messaging threads.
 *
 * Lists every thread the assigned finance partner has with this client
 * (command↔finance private, finance↔client+CC, command↔client allocated)
 * and renders the selected one. Falls back to auto-creating the standard
 * command↔finance thread if none exist yet.
 */
import { useEffect, useMemo, useState } from 'react';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, MessageSquare, RefreshCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { FinanceMessagesThread } from '@/components/finance-portal/FinanceMessagesThread';

interface Props {
  clientId: string;
}

interface ThreadRow {
  id: string;
  client_id: string;
  finance_user_id: string;
  subject: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count_staff: number;
  unread_count_partner: number;
  visibility_scope?: string | null;
  thread_type?: string | null;
  allocation_status?: string | null;
}

const THREAD_TYPE_LABEL: Record<string, string> = {
  command_finance: 'Command ↔ Finance (private)',
  finance_client: 'Finance ↔ Client (CC visible)',
  command_client_allocated: 'Command ↔ Client (Finance allocated)',
  internal_command: 'Internal',
};

// Mirror the finance portal: every assigned client should expose all three
// governed channels so Command Centre staff keep full oversight. Order here
// also dictates the sidebar rendering order.
const GOVERNED_THREAD_TYPES: { thread_type: string; visibility_scope: string }[] = [
  { thread_type: 'command_finance', visibility_scope: 'command_finance_private' },
  { thread_type: 'finance_client', visibility_scope: 'finance_client_with_command_visibility' },
  { thread_type: 'command_client_allocated', visibility_scope: 'command_client_with_finance_allocated' },
];

const THREAD_TYPE_ORDER: Record<string, number> = GOVERNED_THREAD_TYPES.reduce(
  (acc, g, idx) => ({ ...acc, [g.thread_type]: idx }),
  {} as Record<string, number>,
);

export function StaffFinancePortalMessagesPanel({ clientId }: Props) {
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadThreads = async (preserveSelection = false) => {
    setError(null);
    const { data, error } = await invokeSecureFunction('finance-portal-messages', {
      operation: 'list_threads',
      client_id: clientId,
    });
    if (error) {
      setError(error.message || 'Failed to load finance threads');
      setLoading(false);
      return;
    }
    let list = (data?.threads || []) as ThreadRow[];

    // Auto-seed any missing governed thread so all three channels are always
    // present on Command Centre, mirroring the finance portal.
    const missing = GOVERNED_THREAD_TYPES.filter(
      (g) => !list.some((t) => t.thread_type === g.thread_type),
    );
    if (missing.length > 0) {
      let seedError: string | null = null;
      for (const g of missing) {
        const { data: createdData, error: createErr } = await invokeSecureFunction(
          'finance-portal-messages',
          {
            operation: 'get_or_create_thread',
            client_id: clientId,
            visibility_scope: g.visibility_scope,
            thread_type: g.thread_type,
          },
        );
        if (createErr || !createdData?.thread) {
          seedError = createErr?.message || 'Unable to provision finance thread';
          continue;
        }
        list = [...list, createdData.thread as ThreadRow];
      }
      if (list.length === 0 && seedError) {
        setError(seedError);
        setLoading(false);
        return;
      }
    }

    setThreads(list);

    if (
      list.length > 0 &&
      (!preserveSelection || !selectedThreadId || !list.some((t) => t.id === selectedThreadId))
    ) {
      // Default to the most recently active thread.
      const sorted = [...list].sort((a, b) => {
        const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return tb - ta;
      });
      setSelectedThreadId(sorted[0].id);
    }
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    loadThreads(false);
    const id = setInterval(() => loadThreads(true), 20000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const sortedThreads = useMemo(
    () => [...threads].sort((a, b) => {
      // Keep the three governed channels in a stable order so staff always see
      // the same layout (Command↔Finance, Finance↔Client, Command↔Client).
      const oa = THREAD_TYPE_ORDER[a.thread_type || ''] ?? 99;
      const ob = THREAD_TYPE_ORDER[b.thread_type || ''] ?? 99;
      if (oa !== ob) return oa - ob;
      const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return tb - ta;
    }),
    [threads],
  );

  const selectedThread = sortedThreads.find((thread) => thread.id === selectedThreadId) || null;
  const selectedThreadLabel = selectedThread
    ? THREAD_TYPE_LABEL[selectedThread.thread_type || ''] || (selectedThread.thread_type || 'Thread')
    : 'Finance Portal thread';

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (error && threads.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground opacity-50 mb-3" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      {/* Thread list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Threads ({sortedThreads.length})
          </span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => loadThreads(true)}>
            <RefreshCcw className="h-3 w-3" />
          </Button>
        </div>
        <ScrollArea className="h-[480px] pr-2">
          <div className="space-y-1.5">
            {sortedThreads.map((t) => {
              const isActive = t.id === selectedThreadId;
              const label = THREAD_TYPE_LABEL[t.thread_type || ''] || (t.thread_type || 'Thread');
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedThreadId(t.id)}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                    isActive
                      ? 'border-primary/40 bg-primary/10'
                      : 'border-border/60 bg-card hover:border-primary/20 hover:bg-primary/5',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-foreground">{label}</span>
                    {t.unread_count_staff > 0 && (
                      <Badge className="h-4 bg-primary px-1.5 text-[9px] text-primary-foreground">
                        {t.unread_count_staff}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                    {t.last_message_preview || 'No messages yet'}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                    {t.last_message_at
                      ? formatDistanceToNow(new Date(t.last_message_at), { addSuffix: true })
                      : '—'}
                  </p>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Selected thread */}
      <div className="min-h-[480px] overflow-hidden rounded-2xl border border-emerald-300/15 bg-zinc-950/90 shadow-xl shadow-black/20">
        {selectedThreadId ? (
          <div className="flex h-full min-h-[480px] flex-col">
            <div className="border-b border-emerald-300/10 bg-gradient-to-r from-emerald-300/10 via-white/[0.03] to-transparent px-4 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{selectedThreadLabel}</p>
                    <Badge variant="outline" className="shrink-0 rounded-full border-emerald-300/25 bg-emerald-300/10 px-2 text-[10px] text-emerald-100">
                      Finance Portal
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{selectedThread?.last_message_at ? formatDistanceToNow(new Date(selectedThread.last_message_at), { addSuffix: true }) : 'No activity yet'}</span>
                    {selectedThread?.unread_count_staff ? (
                      <Badge className="rounded-full border border-amber-200/50 bg-amber-300 px-2 text-[10px] font-bold text-black">
                        {selectedThread.unread_count_staff} unread
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            <FinanceMessagesThread
              threadId={selectedThreadId}
              viewerSide="staff"
              invoke={(fn, body) => invokeSecureFunction(fn, body)}
              onMessageSent={() => loadThreads(true)}
              className="h-full flex-1 rounded-none border-0 bg-transparent shadow-none"
            />
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground opacity-50 mb-3" />
              <p className="text-sm text-muted-foreground">Select a thread to view messages</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
