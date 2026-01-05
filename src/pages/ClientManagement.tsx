import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Users, 
  Upload, 
  Search, 
  Building2, 
  DollarSign, 
  TrendingUp,
  RefreshCw,
  Loader2,
  Download,
  Trash2
} from 'lucide-react';
import { ExcelDropzone } from '@/components/clients/ExcelDropzone';
import { ClientCard } from '@/components/clients/ClientCard';
import { ClientDetailsModal } from '@/components/clients/ClientDetailsModal';
import { ClientFilters, ClientFiltersState, defaultFilters } from '@/components/clients/ClientFilters';
import { ClientBulkActions } from '@/components/clients/ClientBulkActions';
import { ClientAnalyticsDashboard } from '@/components/clients/ClientAnalyticsDashboard';
import { ClientComparison } from '@/components/clients/ClientComparison';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Client {
  id: string;
  primary_first_name: string;
  primary_surname: string;
  primary_email: string | null;
  primary_mobile: string | null;
  secondary_first_name: string | null;
  secondary_surname: string | null;
  ghl_contact_id: string | null;
  ghl_sync_status: string | null;
  total_portfolio_value: number;
  total_debt: number;
  net_monthly_cash_flow: number;
  created_at: string;
  client_properties?: { id: string }[];
}

export default function ClientManagement() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [filters, setFilters] = useState<ClientFiltersState>(defaultFilters);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [isImportingFromGHL, setIsImportingFromGHL] = useState(false);
  const [importProgress, setImportProgress] = useState<{ imported: number; hasMore: boolean } | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [hasAutoSynced, setHasAutoSynced] = useState(false);
  const queryClient = useQueryClient();

  // Fetch clients with property count
  const { data: clients = [], isLoading, refetch } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select(`
          *,
          client_properties(id)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Client[];
    }
  });

  // Auto-sync from GHL on first load if no clients exist
  useEffect(() => {
    if (!isLoading && clients.length === 0 && !hasAutoSynced && !isImportingFromGHL) {
      setHasAutoSynced(true);
      handleImportFromGHL();
    }
  }, [isLoading, clients.length, hasAutoSynced, isImportingFromGHL]);

  // Import clients from GHL with auto-resume for large datasets
  const handleImportFromGHL = async (clearExisting = false, resumeFromId: string | null = null) => {
    setIsImportingFromGHL(true);
    if (!resumeFromId) {
      setImportProgress({ imported: 0, hasMore: true });
    }
    
    try {
      let totalImported = importProgress?.imported || 0;
      let nextResumeId = resumeFromId;
      let isFirstBatch = !resumeFromId;

      // Loop to fetch all batches automatically
      do {
        const { data, error } = await supabase.functions.invoke('import-clients-from-ghl', {
          body: { 
            clearExisting: isFirstBatch ? clearExisting : false, 
            resumeFromId: nextResumeId,
            maxPages: 10 // Process 10 pages (1000 contacts) per batch to avoid timeouts
          }
        });

        if (error) throw error;

        if (data?.success) {
          totalImported += data.stats?.imported || 0;
          setImportProgress({ imported: totalImported, hasMore: data.hasMore });
          
          if (data.hasMore && data.nextResumeId) {
            nextResumeId = data.nextResumeId;
            isFirstBatch = false;
            console.log(`Batch complete. Total imported: ${totalImported}. Continuing...`);
          } else {
            nextResumeId = null;
            toast.success(`Import complete! ${totalImported} clients imported from GHL.`);
          }
          
          // Refresh the client list after each batch
          refetch();
        } else {
          throw new Error(data?.error || 'Import failed');
        }
      } while (nextResumeId);

    } catch (err: any) {
      console.error('GHL import error:', err);
      toast.error('Failed to import from GHL: ' + (err.message || 'Unknown error'));
    } finally {
      setIsImportingFromGHL(false);
      setImportProgress(null);
      setShowClearConfirm(false);
    }
  };

  // Clear all clients and reimport
  const handleClearAndReimport = () => {
    setShowClearConfirm(true);
  };

  const confirmClearAndReimport = () => {
    handleImportFromGHL(true);
  };

  // Delete client mutation
  const deleteClientMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Client deleted successfully');
      setClientToDelete(null);
    },
    onError: (error) => {
      toast.error('Failed to delete client: ' + error.message);
    }
  });

  // Apply filters
  const filteredClients = clients.filter(client => {
    // Search filter
    const searchLower = searchQuery.toLowerCase();
    const fullName = `${client.primary_first_name} ${client.primary_surname}`.toLowerCase();
    const email = client.primary_email?.toLowerCase() || '';
    const matchesSearch = fullName.includes(searchLower) || email.includes(searchLower);
    if (!matchesSearch) return false;

    // Portfolio value filter
    const portfolioValue = Number(client.total_portfolio_value) || 0;
    if (filters.portfolioMin !== null && portfolioValue < filters.portfolioMin) return false;
    if (filters.portfolioMax !== null && portfolioValue > filters.portfolioMax) return false;

    // Cash flow status filter
    const cashFlow = Number(client.net_monthly_cash_flow) || 0;
    if (filters.cashFlowStatus === 'positive' && cashFlow < 0) return false;
    if (filters.cashFlowStatus === 'negative' && cashFlow >= 0) return false;

    // Sync status filter
    const syncStatus = client.ghl_sync_status || 'not_synced';
    if (filters.syncStatus !== 'all' && syncStatus !== filters.syncStatus) return false;

    return true;
  });

  // Calculate summary stats
  const totalClients = clients.length;
  const totalProperties = clients.reduce((acc, c) => acc + (c.client_properties?.length || 0), 0);
  const totalPortfolioValue = clients.reduce((acc, c) => acc + (Number(c.total_portfolio_value) || 0), 0);
  const pendingSyncCount = clients.filter(c => c.ghl_sync_status === 'pending').length;

  const handleViewClient = (client: Client) => {
    setSelectedClient(client);
    setShowDetailsModal(true);
  };

  const handleDeleteClient = (client: Client) => {
    setClientToDelete(client);
  };

  const handleSelectClient = (clientId: string, selected: boolean) => {
    if (selected) {
      setSelectedClients(prev => [...prev, clientId]);
    } else {
      setSelectedClients(prev => prev.filter(id => id !== clientId));
    }
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedClients(filteredClients.map(c => c.id));
    } else {
      setSelectedClients([]);
    }
  };

  const handleSyncAllPending = async () => {
    const pendingClients = clients.filter(c => c.ghl_sync_status === 'pending' || !c.ghl_sync_status);
    if (pendingClients.length === 0) {
      toast.info('No clients to sync');
      return;
    }

    setIsSyncingAll(true);
    let successCount = 0;
    let errorCount = 0;

    for (const client of pendingClients) {
      try {
        const { data, error } = await supabase.functions.invoke('sync-client-to-ghl', {
          body: { clientId: client.id }
        });
        if (error || !data?.success) {
          errorCount++;
        } else {
          successCount++;
        }
      } catch {
        errorCount++;
      }
    }

    setIsSyncingAll(false);
    toast.success(`Synced ${successCount} clients${errorCount > 0 ? `, ${errorCount} failed` : ''}`);
    refetch();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const allSelected = filteredClients.length > 0 && selectedClients.length === filteredClients.length;
  const someSelected = selectedClients.length > 0 && selectedClients.length < filteredClients.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Client Management</h1>
          <p className="text-muted-foreground">
            Manage clients, properties, and sync with GoHighLevel
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button 
            onClick={() => handleImportFromGHL(false)} 
            variant="default" 
            size="sm"
            disabled={isImportingFromGHL}
          >
            {isImportingFromGHL ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {isImportingFromGHL && importProgress 
              ? `Importing... (${importProgress.imported.toLocaleString()} clients)`
              : 'Import from GHL'}
          </Button>
          <Button 
            onClick={handleClearAndReimport} 
            variant="outline" 
            size="sm"
            disabled={isImportingFromGHL}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear & Reimport
          </Button>
          {pendingSyncCount > 0 && (
            <Button 
              onClick={handleSyncAllPending} 
              variant="secondary" 
              size="sm"
              disabled={isSyncingAll}
            >
              {isSyncingAll ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync All ({pendingSyncCount})
            </Button>
          )}
          <Button onClick={() => refetch()} variant="ghost" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalClients}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Properties</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProperties}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalPortfolioValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending GHL Sync</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingSyncCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="clients" className="space-y-4">
        <TabsList>
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="space-y-4">
          {/* Bulk Actions Bar */}
          <ClientBulkActions
            selectedClients={selectedClients}
            clients={filteredClients}
            onClearSelection={() => setSelectedClients([])}
            onActionComplete={() => refetch()}
          />

          {/* Search & Filters */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <ClientFilters filters={filters} onFiltersChange={setFilters} />
            {filteredClients.length > 0 && (
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allSelected}
                  ref={(ref) => {
                    if (ref) {
                      (ref as any).indeterminate = someSelected;
                    }
                  }}
                  onCheckedChange={handleSelectAll}
                />
                <span className="text-sm text-muted-foreground">
                  Select all ({filteredClients.length})
                </span>
              </div>
            )}
          </div>

          {/* Client List */}
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="h-48" />
                </Card>
              ))}
            </div>
          ) : filteredClients.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No clients found</h3>
                <p className="text-muted-foreground text-center mt-1">
                  {searchQuery || filters !== defaultFilters ? 'Try adjusting your filters' : 'Import clients using the Import tab'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredClients.map((client) => (
                <div key={client.id} className="relative">
                  <div className="absolute top-3 left-3 z-10">
                    <Checkbox
                      checked={selectedClients.includes(client.id)}
                      onCheckedChange={(checked) => handleSelectClient(client.id, !!checked)}
                    />
                  </div>
                  <ClientCard
                    client={client}
                    onView={() => handleViewClient(client)}
                    onDelete={() => handleDeleteClient(client)}
                    onSyncComplete={() => refetch()}
                  />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <ClientAnalyticsDashboard clients={clients} />
        </TabsContent>

        <TabsContent value="compare" className="space-y-4">
          <ClientComparison clients={clients} />
        </TabsContent>

        <TabsContent value="import" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Import Clients from Excel
              </CardTitle>
              <CardDescription>
                Drag and drop your client intake form Excel file to import clients and their properties
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ExcelDropzone onImportComplete={() => refetch()} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Client Details Modal */}
      {selectedClient && (
        <ClientDetailsModal
          client={selectedClient}
          open={showDetailsModal}
          onOpenChange={setShowDetailsModal}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!clientToDelete} onOpenChange={() => setClientToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Client</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {clientToDelete?.primary_first_name} {clientToDelete?.primary_surname}? 
              This will also delete all their properties, income, assets, and liabilities. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clientToDelete && deleteClientMutation.mutate(clientToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Clear & Reimport Confirmation Dialog */}
      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Clients & Reimport</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete ALL existing client data and reimport fresh from GoHighLevel. 
              This action cannot be undone. Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmClearAndReimport}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isImportingFromGHL ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                'Clear & Reimport'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
