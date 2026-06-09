/**
 * Finance Portal — Cross-client Unified Inbox.
 * Lists every assigned client with their latest activity across SMS / WhatsApp / Email / Portal,
 * unread counts, and a one-click open to the per-client inbox tab.
 */
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  MessageSquare, Inbox, ChevronRight, Search, Phone, Mail, Globe,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useMemo, useState } from 'react';
import { smartCapitalize } from '@/lib/nameUtils';
import { cn } from '@/lib/utils';

const FN = 'finance-portal-client-comms';

const CHANNEL_ICON: Record<string, any> = {
  sms: Phone, whatsapp: MessageSquare, email: Mail, portal: Globe,
};

export default function FinancePortalClientInbox() {
  const { invokeFinanceFunction } = useFinancePortalAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['client-inbox-list'],
    queryFn: async () => {
      const { data, error } = await invokeFinanceFunction(FN, { action: 'inbox_list' });
      if (error) throw new Error(error.message);
      return (data?.clients || []) as any[];
    },
    refetchInterval: 60_000,
  });

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return data || [];
    return (data || []).filter(r =>
      (r.name || '').toLowerCase().includes(s) ||
      (r.email || '').toLowerCase().includes(s) ||
      (r.phone || '').toLowerCase().includes(s)
    );
  }, [data, search]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Inbox className="h-6 w-6 text-primary" /> Client Inbox
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All SMS, WhatsApp, Email and Portal messages across every client in one place.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 border-0 shadow-none focus-visible:ring-0 px-0"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-10">
              No client conversations yet.
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const Icon = CHANNEL_ICON[r.last_channel] || MessageSquare;
                return (
                  <button
                    key={r.client_id}
                    onClick={() => navigate(`/finance/clients/${r.client_id}?tab=messages`)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 border border-border/60 rounded-xl text-left',
                      'hover:bg-card/80 transition-colors',
                    )}
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold shrink-0">
                      {(r.name || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{smartCapitalize(r.name || 'Unknown')}</span>
                        {(Number(r.unread_portal || 0) + Number(r.unread_finance || 0)) > 0 && (
                          <Badge className="bg-primary text-primary-foreground h-5">
                            {Number(r.unread_portal || 0) + Number(r.unread_finance || 0)} new
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                        <Icon className="h-3 w-3" />
                        {r.last_message_preview || 'No messages yet'}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      {r.last_message_at
                        ? formatDistanceToNow(new Date(r.last_message_at), { addSuffix: true })
                        : '—'}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
