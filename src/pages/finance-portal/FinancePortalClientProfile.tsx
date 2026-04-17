import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ArrowLeft, Mail, Phone, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FINANCE_TABLE_CONFIGS, FINANCE_TABLE_KEYS, FinanceTableKey } from '@/components/finance-portal/financeTableConfig';
import { FinanceRecordList } from '@/components/finance-portal/FinanceRecordList';
import { DocumentVaultPanel } from '@/components/finance-portal/DocumentVaultPanel';
import { BorrowingCapacityPanel } from '@/components/finance-portal/BorrowingCapacityPanel';
import { FinancePortalMessagesPanel } from '@/components/finance-portal/FinancePortalMessagesPanel';

export default function FinancePortalClientProfile() {
  const { clientId } = useParams<{ clientId: string }>();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const { invokeFinanceFunction } = useFinancePortalAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ['finance-portal-client-summary', clientId],
    queryFn: async () => {
      const { data, error } = await invokeFinanceFunction('finance-portal-client-data', {
        operation: 'get_client_summary',
        client_id: clientId,
      });
      if (error) throw new Error(error.message);
      return data as { client: any; permissions: Record<string, { view: boolean; edit: boolean; delete: boolean }> };
    },
    enabled: !!clientId,
  });

  const permissions = data?.permissions || {};
  const visibleTabs = useMemo(
    () => FINANCE_TABLE_KEYS.filter(k => permissions[k]?.view),
    [permissions]
  );
  // Documents permission defaults to true (view+edit) when assignment exists but key is missing,
  // matching the edge function default. Hide only if explicitly { view: false }.
  const docsVisible = permissions.documents ? !!permissions.documents.view : true;
  const bcVisible = permissions.borrowing_capacity ? !!permissions.borrowing_capacity.view : true;
  const defaultTab = initialTab || visibleTabs[0] || (docsVisible ? 'documents' : (bcVisible ? 'borrowing_capacity' : 'messages'));

  if (isLoading) {
    return (
      <div className="p-6"><div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></div>
    );
  }

  if (error || !data?.client) {
    const msg = (error as Error)?.message || 'Client not accessible';
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <Lock className="h-10 w-10 mx-auto text-muted-foreground opacity-50 mb-3" />
            <p className="text-sm text-destructive">{msg}</p>
            <Button asChild variant="outline" className="mt-4 gap-2">
              <Link to="/finance/clients"><ArrowLeft className="h-4 w-4" /> Back to clients</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const client = data.client;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <Button variant="ghost" asChild size="sm" className="gap-1 mb-3 -ml-2">
          <Link to="/finance/clients"><ArrowLeft className="h-4 w-4" /> Back to clients</Link>
        </Button>
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <CardTitle className="text-2xl">
                  {client.primary_contact_name}
                  {client.secondary_contact_name && (
                    <span className="text-base text-muted-foreground font-normal ml-2">
                      & {client.secondary_contact_name}
                    </span>
                  )}
                </CardTitle>
                <CardDescription className="mt-2 space-y-1">
                  {client.primary_contact_email && (
                    <div className="flex items-center gap-2 text-sm"><Mail className="h-3.5 w-3.5" /> {client.primary_contact_email}</div>
                  )}
                  {client.primary_contact_phone && (
                    <div className="flex items-center gap-2 text-sm"><Phone className="h-3.5 w-3.5" /> {client.primary_contact_phone}</div>
                  )}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {client.status && <Badge variant="secondary">{client.status}</Badge>}
                <Badge variant="outline">{visibleTabs.length + (docsVisible ? 1 : 0) + (bcVisible ? 1 : 0)} of 10 sections accessible</Badge>
              </div>
            </div>
          </CardHeader>
        </Card>
      </div>

      {visibleTabs.length === 0 && !docsVisible && !bcVisible ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Lock className="h-10 w-10 mx-auto text-muted-foreground opacity-50 mb-3" />
            <p className="text-sm text-muted-foreground">
              You have been assigned to this client but have no view permissions on any section. Contact your NPC manager.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue={defaultTab}>
          <TabsList className="flex-wrap h-auto">
            {visibleTabs.map(k => (
              <TabsTrigger key={k} value={k} className="text-xs">
                {FINANCE_TABLE_CONFIGS[k].label}
              </TabsTrigger>
            ))}
            {docsVisible && (
              <TabsTrigger value="documents" className="text-xs">Documents</TabsTrigger>
            )}
            {bcVisible && (
              <TabsTrigger value="borrowing_capacity" className="text-xs">Borrowing Capacity</TabsTrigger>
            )}
            <TabsTrigger value="messages" className="text-xs">Messages</TabsTrigger>
          </TabsList>
          {visibleTabs.map(k => (
            <TabsContent key={k} value={k} className="mt-4">
              <FinanceRecordList clientId={clientId!} config={FINANCE_TABLE_CONFIGS[k]} />
            </TabsContent>
          ))}
          {docsVisible && (
            <TabsContent value="documents" className="mt-4">
              <DocumentVaultPanel clientId={clientId!} />
            </TabsContent>
          )}
          {bcVisible && (
            <TabsContent value="borrowing_capacity" className="mt-4">
              <BorrowingCapacityPanel clientId={clientId!} />
            </TabsContent>
          )}
          <TabsContent value="messages" className="mt-4">
            <FinancePortalMessagesPanel clientId={clientId!} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
