import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ArrowLeft, Lock, Eye, Edit, Trash2, AlertCircle, Mail, Phone, MapPin,
  Home, DollarSign, CreditCard, Wallet, Receipt, Briefcase, StickyNote, UserPlus,
} from 'lucide-react';
import { FinanceRecordList } from '@/components/finance-portal/FinanceRecordList';
import { TableKey, TABLE_FIELD_CONFIG } from '@/components/finance-portal/financeTableConfig';

interface ClientPermissions {
  [key: string]: { view: boolean; edit: boolean; delete: boolean };
}

const TAB_META: { key: TableKey; label: string; icon: any }[] = [
  { key: 'properties', label: 'Properties', icon: Home },
  { key: 'income', label: 'Income', icon: DollarSign },
  { key: 'expenses', label: 'Expenses', icon: Receipt },
  { key: 'assets', label: 'Assets', icon: Wallet },
  { key: 'liabilities', label: 'Liabilities', icon: CreditCard },
  { key: 'employment', label: 'Employment', icon: Briefcase },
  { key: 'notes', label: 'Notes', icon: StickyNote },
  { key: 'contacts', label: 'Contacts', icon: UserPlus },
];

export default function FinancePortalClientProfile() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { invokeFinanceFunction } = useFinancePortalAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [client, setClient] = useState<any>(null);
  const [data, setData] = useState<Record<string, any[]>>({});
  const [permissions, setPermissions] = useState<ClientPermissions | null>(null);
  const [activeTab, setActiveTab] = useState<TableKey>('properties');

  const loadAll = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError('');

    const [clientRes, dataRes] = await Promise.all([
      invokeFinanceFunction('finance-portal-client-data', {
        operation: 'get_client', client_id: clientId,
      }),
      invokeFinanceFunction('finance-portal-client-data', {
        operation: 'get_client_data', client_id: clientId,
      }),
    ]);

    if (clientRes.error) {
      setError(clientRes.error.message || 'Failed to load client');
      setLoading(false);
      return;
    }
    if (dataRes.error) {
      setError(dataRes.error.message || 'Failed to load client data');
      setLoading(false);
      return;
    }
    setClient(clientRes.data?.client || null);
    setPermissions(dataRes.data?.permissions || null);
    setData(dataRes.data?.data || {});

    // Auto-select the first viewable tab
    const firstViewable = TAB_META.find(t => dataRes.data?.permissions?.[t.key]?.view);
    if (firstViewable) setActiveTab(firstViewable.key);

    setLoading(false);
  }, [clientId, invokeFinanceFunction]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRefresh = () => loadAll();

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => navigate('/finance/clients')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />Back to clients
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const fullName = client ? `${client.first_name || ''} ${client.surname || ''}`.trim() : 'Client';

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild className="mb-2">
        <Link to="/finance/clients"><ArrowLeft className="h-4 w-4 mr-2" />Back to clients</Link>
      </Button>

      {/* Client header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-2xl">{fullName || 'Unnamed Client'}</CardTitle>
              <CardDescription className="mt-2 space-y-1">
                {client?.email && (
                  <div className="flex items-center gap-2"><Mail className="h-3 w-3" />{client.email}</div>
                )}
                {client?.mobile && (
                  <div className="flex items-center gap-2"><Phone className="h-3 w-3" />{client.mobile}</div>
                )}
                {client?.current_address && (
                  <div className="flex items-center gap-2"><MapPin className="h-3 w-3" />{client.current_address}</div>
                )}
              </CardDescription>
            </div>
            {client?.status && (
              <Badge variant="secondary" className="capitalize">{client.status}</Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Tabbed editor */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TableKey)}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex w-auto md:grid md:grid-cols-8 md:w-full">
            {TAB_META.map(t => {
              const perm = permissions?.[t.key];
              const Icon = t.icon;
              const canView = !!perm?.view;
              return (
                <TabsTrigger
                  key={t.key}
                  value={t.key}
                  disabled={!canView}
                  className="gap-2 whitespace-nowrap"
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t.label}</span>
                  {!canView && <Lock className="h-3 w-3 ml-1 opacity-50" />}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {TAB_META.map(t => {
          const perm = permissions?.[t.key];
          const records = data[t.key] || [];
          return (
            <TabsContent key={t.key} value={t.key} className="mt-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <t.icon className="h-5 w-5 text-primary" />
                        {t.label}
                      </CardTitle>
                      <CardDescription>
                        {records.length} record{records.length === 1 ? '' : 's'}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {perm?.view && <Badge variant="outline" className="gap-1"><Eye className="h-3 w-3" />View</Badge>}
                      {perm?.edit && <Badge variant="outline" className="gap-1"><Edit className="h-3 w-3" />Edit</Badge>}
                      {perm?.delete && <Badge variant="outline" className="gap-1"><Trash2 className="h-3 w-3" />Delete</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {!perm?.view ? (
                    <Alert>
                      <Lock className="h-4 w-4" />
                      <AlertDescription>
                        You don't have permission to view this section. Contact your administrator if you need access.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <FinanceRecordList
                      tableKey={t.key}
                      clientId={clientId!}
                      records={records}
                      canEdit={!!perm?.edit}
                      canDelete={!!perm?.delete}
                      onMutated={handleRefresh}
                      fields={TABLE_FIELD_CONFIG[t.key]}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
