import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Users, Loader2, ArrowRight, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function FinancePortalClients() {
  const { invokeFinanceFunction } = useFinancePortalAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [handoffBusyId, setHandoffBusyId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['finance-portal-clients-list'],
    queryFn: async () => {
      const { data, error } = await invokeFinanceFunction('finance-portal-client-data', {
        operation: 'list_assigned_clients',
      });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const records = data?.records || [];

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return records;
    return records.filter((r: any) =>
      (r.client?.primary_contact_name || '').toLowerCase().includes(s) ||
      (r.client?.secondary_contact_name || '').toLowerCase().includes(s) ||
      (r.client?.primary_contact_email || '').toLowerCase().includes(s)
    );
  }, [records, search]);

  const openClientPortal = async (clientId: string, readonly = true) => {
    setHandoffBusyId(clientId);
    try {
      const { data, error } = await invokeFinanceFunction('finance-portal-handoff-create', {
        client_id: clientId,
        readonly,
      });
      if (error || !data?.success || !data?.token) {
        throw new Error(data?.error || error?.message || 'Failed to create handoff link');
      }
      // Open in a new tab so the partner doesn't lose their own session
      const url = `${window.location.origin}/client/handoff?token=${encodeURIComponent(data.token)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      toast.error(e?.message || 'Could not open client portal view');
    } finally {
      setHandoffBusyId(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          My Clients
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Clients NPC has assigned to you. Click any client to view and manage their financial profile.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle>{records.length} assigned</CardTitle>
            <CardDescription>{filtered.length === records.length ? 'Showing all' : `Showing ${filtered.length} of ${records.length}`}</CardDescription>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 w-72"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 border rounded-lg text-sm text-muted-foreground">
              {records.length === 0 ? 'No clients have been assigned to you yet.' : 'No matches.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((r: any) => {
                const perms = r.permissions || {};
                const grantedTables = Object.entries(perms).filter(([_, p]: any) => p?.view).length;
                const isBusy = handoffBusyId === r.client_id;
                return (
                  <div
                    key={r.assignment_id}
                    className="flex items-center justify-between border rounded-lg p-4 hover:bg-muted/40 transition-colors gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/finance/clients/${r.client_id}`)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="font-medium">
                        {r.client?.primary_contact_name || '—'}
                        {r.client?.secondary_contact_name && (
                          <span className="text-muted-foreground font-normal text-sm ml-2">
                            & {r.client.secondary_contact_name}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {r.client?.primary_contact_email || ''}
                        {r.client?.primary_contact_phone && ` · ${r.client.primary_contact_phone}`}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        <Badge variant="outline" className="text-xs">{grantedTables} of 8 sections</Badge>
                        {r.client?.status && <Badge variant="secondary" className="text-xs">{r.client.status}</Badge>}
                      </div>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openClientPortal(r.client_id, true)}
                        disabled={isBusy}
                        title="Open this client's portal in a new tab (read-only)"
                      >
                        {isBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ExternalLink className="h-3.5 w-3.5" />
                        )}
                        <span className="ml-1.5">View as client</span>
                      </Button>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
