import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Search, Users, ArrowRight, Mail, Phone } from 'lucide-react';

interface AssignedClient {
  id: string;
  full_name: string;
  email: string | null;
  mobile: string | null;
  status: string | null;
  permissions: any;
}

const PERMISSION_TABLES = [
  'properties', 'income', 'expenses', 'assets',
  'liabilities', 'employment', 'notes', 'contacts',
] as const;

function summarizePermissions(perms: any) {
  let view = 0, edit = 0, del = 0;
  for (const t of PERMISSION_TABLES) {
    const p = perms?.[t];
    if (p?.view) view++;
    if (p?.edit) edit++;
    if (p?.delete) del++;
  }
  return { view, edit, del };
}

export default function FinancePortalClients() {
  const { invokeFinanceFunction } = useFinancePortalAuth();
  const [clients, setClients] = useState<AssignedClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await invokeFinanceFunction('finance-portal-client-data', {
        operation: 'list_clients',
      });
      if (error) setError(error.message || 'Failed to load clients');
      else setClients(data?.clients || []);
      setLoading(false);
    })();
  }, [invokeFinanceFunction]);

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const s = search.toLowerCase();
    return clients.filter(c =>
      c.full_name.toLowerCase().includes(s) ||
      (c.email || '').toLowerCase().includes(s) ||
      (c.mobile || '').toLowerCase().includes(s)
    );
  }, [clients, search]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">My Clients</h1>
          <p className="text-muted-foreground mt-1">
            {loading ? 'Loading...' : `${clients.length} client${clients.length === 1 ? '' : 's'} assigned to you`}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email or phone..."
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 w-full rounded-md" />)}
            </div>
          )}

          {!loading && error && (
            <div className="text-sm text-destructive py-4">{error}</div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="text-center py-12">
              <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {clients.length === 0
                  ? 'No clients have been assigned to you yet.'
                  : 'No clients match your search.'}
              </p>
            </div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <div className="space-y-2">
              {filtered.map(c => {
                const s = summarizePermissions(c.permissions);
                return (
                  <Link
                    key={c.id}
                    to={`/finance/clients/${c.id}`}
                    className="flex items-center justify-between p-4 rounded-md border hover:bg-muted/50 transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-medium truncate">{c.full_name || 'Unnamed Client'}</div>
                        {c.status && (
                          <Badge variant="secondary" className="font-normal text-xs capitalize">
                            {c.status}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                        {c.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />{c.email}
                          </span>
                        )}
                        {c.mobile && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />{c.mobile}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="hidden sm:flex flex-col items-end gap-1 text-xs">
                        <Badge variant="secondary" className="font-normal">{s.view}/8 view</Badge>
                        {s.edit > 0 && <Badge variant="outline" className="font-normal">{s.edit} edit</Badge>}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
