/**
 * Finance Portal — Inbox page (partner side). Lists all threads across all clients.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageSquare, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ThreadRow {
  id: string;
  client_id: string;
  subject: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count_partner: number;
  is_archived: boolean;
  clients?: { id: string; primary_contact_name: string; secondary_contact_name: string | null };
}

export default function FinancePortalMessages() {
  const { invokeFinanceFunction } = useFinancePortalAuth();
  const navigate = useNavigate();
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await invokeFinanceFunction('finance-portal-messages', { operation: 'list_threads' });
    setThreads(data?.threads || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" /> Messages
        </h1>
        <p className="text-sm text-muted-foreground">Conversations with the NPC team for each of your clients.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : threads.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No conversations yet. Open a client and use the Messages tab to start chatting with the NPC team.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {threads.map(t => (
            <button
              key={t.id}
              onClick={() => navigate(`/finance/clients/${t.client_id}?tab=messages`)}
              className="w-full text-left"
            >
              <Card className="hover:border-primary/40 transition-colors">
                <CardContent className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">
                        {t.clients?.primary_contact_name || 'Client'}
                        {t.clients?.secondary_contact_name && (
                          <span className="text-muted-foreground font-normal"> & {t.clients.secondary_contact_name}</span>
                        )}
                      </p>
                      {t.unread_count_partner > 0 && (
                        <Badge variant="default" className="text-[10px] h-5">{t.unread_count_partner} new</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {t.last_message_preview || 'No messages yet'}
                    </p>
                  </div>
                  <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {t.last_message_at ? formatDistanceToNow(new Date(t.last_message_at), { addSuffix: true }) : '—'}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
