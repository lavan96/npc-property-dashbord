import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Users, FileText, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AssignedClient {
  id: string;
  full_name: string;
  email: string | null;
  status: string | null;
  permissions: any;
  auto_linked: boolean;
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

export default function FinancePortalDashboard() {
  const { user, invokeFinanceFunction } = useFinancePortalAuth();
  const [clients, setClients] = useState<AssignedClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await invokeFinanceFunction('finance-portal-client-data', {
        operation: 'list_clients',
      });
      if (error) {
        setError(error.message || 'Failed to load clients');
      } else {
        setClients(data?.clients || []);
      }
      setLoading(false);
    })();
  }, [invokeFinanceFunction]);

  const totalClients = clients.length;
  const totalEditable = clients.filter(c => {
    const s = summarizePermissions(c.permissions);
    return s.edit > 0;
  }).length;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Welcome back, {user?.name?.split(' ')[0] || 'Partner'}
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your assigned clients and their financial profiles
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Assigned Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{loading ? '—' : totalClients}</div>
            <p className="text-xs text-muted-foreground mt-1">Active assignments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">With Edit Access</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{loading ? '—' : totalEditable}</div>
            <p className="text-xs text-muted-foreground mt-1">Profiles you can update</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Account</CardTitle>
            <Badge variant="outline">{user?.contact_type || 'Partner'}</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium truncate">{user?.email}</div>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {user?.company || 'Independent'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent clients */}
      <Card>
        <CardHeader>
          <CardTitle>Your Clients</CardTitle>
          <CardDescription>
            Quickly jump into any assigned client's financial profile
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full rounded-md" />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="text-sm text-destructive py-4">{error}</div>
          )}

          {!loading && !error && clients.length === 0 && (
            <div className="text-center py-12">
              <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No clients have been assigned to your account yet.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Contact your administrator to request client access.
              </p>
            </div>
          )}

          {!loading && !error && clients.length > 0 && (
            <div className="space-y-2">
              {clients.slice(0, 8).map(c => {
                const s = summarizePermissions(c.permissions);
                return (
                  <Link
                    key={c.id}
                    to={`/finance/clients/${c.id}`}
                    className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50 transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{c.full_name || 'Unnamed Client'}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {c.email || 'No email on file'}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="hidden sm:flex items-center gap-2 text-xs">
                        <Badge variant="secondary" className="font-normal">
                          {s.view}/8 view
                        </Badge>
                        {s.edit > 0 && (
                          <Badge variant="outline" className="font-normal">
                            {s.edit} edit
                          </Badge>
                        )}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                  </Link>
                );
              })}
              {clients.length > 8 && (
                <div className="pt-2 text-center">
                  <Button asChild variant="link">
                    <Link to="/finance/clients">View all {clients.length} clients →</Link>
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
