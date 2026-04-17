import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

export default function FinancePortalDashboard() {
  const { user, invokeFinanceFunction } = useFinancePortalAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['finance-portal-clients', user?.id],
    queryFn: async () => {
      const { data, error } = await invokeFinanceFunction('finance-portal-client-data', {
        operation: 'list_assigned_clients',
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!user,
  });

  const records = data?.records || [];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Welcome, {user?.name?.split(' ')[0]}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {user?.company || 'Independent Finance Partner'} · {user?.email}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Assigned Clients</CardDescription>
            <CardTitle className="text-3xl">{isLoading ? '—' : records.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Account Status</CardDescription>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-success" />
              Active
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Onboarding</CardDescription>
            <CardTitle className="text-base">
              {user?.has_completed_onboarding ? (
                <Badge variant="secondary">Complete</Badge>
              ) : (
                <Badge variant="outline">In progress</Badge>
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Recent Clients
            </CardTitle>
            <CardDescription>Quick access to your assigned clients.</CardDescription>
          </div>
          <Button variant="outline" asChild>
            <Link to="/finance/clients">View all <ArrowRight className="h-4 w-4 ml-1" /></Link>
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 border rounded-lg text-sm text-muted-foreground">
              No clients have been assigned to you yet. NPC will assign clients when ready.
            </div>
          ) : (
            <div className="space-y-2">
              {records.slice(0, 5).map((r: any) => (
                <Link
                  key={r.assignment_id}
                  to={`/finance/clients/${r.client_id}`}
                  className="flex items-center justify-between border rounded-lg p-3 hover:bg-muted/40 transition-colors"
                >
                  <div>
                    <div className="font-medium text-sm">
                      {r.client?.primary_contact_name || '—'}
                      {r.client?.secondary_contact_name && (
                        <span className="text-muted-foreground font-normal text-xs ml-2">
                          & {r.client.secondary_contact_name}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.client?.primary_contact_email || ''}
                      {r.assigned_at && (
                        <span className="ml-2">· assigned {format(new Date(r.assigned_at), 'MMM d, yyyy')}</span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
