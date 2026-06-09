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
  command_finance: 'Command ↔ Finance',
  finance_client: 'Finance ↔ Client (CC visible)',
  command_client_allocated: 'Command ↔ Client (Finance allocated)',
  internal_command: 'Internal',
};

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
    const list = (data?.threads || []) as ThreadRow[];
    setThreads(list);

    if (list.length === 0) {
      // Auto-create the default command↔finance thread so staff can start one.
      const { data: created, error: createErr } = await invokeSecureFunction('finance-portal-messages', {
        operation: 'get_or_create_thread',
        client_id: clientId,
      });
      if (createErr || !created?.thread) {
        setError(createErr?.message || 'No finance partner assigned to this client yet.');
      } else {
        setThreads([created.thread as ThreadRow]);
        setSelectedThreadId(created.thread.id);
      }
    } else if (!preserveSelection || !selectedThreadId || !list.some(t => t.id === selectedThreadId)) {
      // Pick the thread with the most recent activity by default.
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
      const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return tb - ta;
    }),
    [threads],
  );

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
      <div className="min-h-[480px]">
        {selectedThreadId ? (
          <FinanceMessagesThread
            threadId={selectedThreadId}
            viewerSide="staff"
            invoke={(fn, body) => invokeSecureFunction(fn, body)}
            onMessageSent={() => loadThreads(true)}
          />
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
