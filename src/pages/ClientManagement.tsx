import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { invokeSecureFunction } from '@/lib/secureInvoke';
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
  Trash2,
  Clock,
  Zap,
  Star,
  ExternalLink,
  Target,
  UserPlus,
  MoreHorizontal
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ExcelDropzone } from '@/components/clients/ExcelDropzone';
import { ClientCard } from '@/components/clients/ClientCard';
import { ClientDetailsModal } from '@/components/clients/ClientDetailsModal';
import { ClientFilters, ClientFiltersState, defaultFilters } from '@/components/clients/ClientFilters';
import { ClientBulkActions } from '@/components/clients/ClientBulkActions';
import { ClientAnalyticsDashboard } from '@/components/clients/ClientAnalyticsDashboard';
import { ClientComparison } from '@/components/clients/ClientComparison';
import { PortfolioAnalysisReportsList } from '@/components/clients/PortfolioAnalysisReportsList';
import { AddClientModal } from '@/components/clients/AddClientModal';
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
  is_favorite?: boolean;
  client_properties?: { id: string }[];
  pipeline_status?: string | null;
  follow_up_date?: string | null;
}

const AUTO_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Smart capitalization for names from GHL (often lowercase)
function smartCapitalize(name: string | null | undefined): string {
  if (!name) return '';
  
  // Handle already properly capitalized names
  if (name !== name.toLowerCase() && name !== name.toUpperCase()) {
    return name;
  }
  
  return name
    .toLowerCase()
    .split(/(\s+|-|')/)
    .map((part, index, arr) => {
      // Keep separators as-is
      if (/^(\s+|-|')$/.test(part)) return part;
      
      // Handle special prefixes like Mc, Mac, O'
      if (part.startsWith('mc') && part.length > 2) {
        return 'Mc' + part.charAt(2).toUpperCase() + part.slice(3);
      }
      if (part.startsWith('mac') && part.length > 3) {
        return 'Mac' + part.charAt(3).toUpperCase() + part.slice(4);
      }
      
      // Standard capitalization
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('');
}

export default function ClientManagement() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [deepLinkTab, setDeepLinkTab] = useState<string | undefined>(undefined);
  const [deepLinkDealId, setDeepLinkDealId] = useState<string | undefined>(undefined);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [filters, setFilters] = useState<ClientFiltersState>(defaultFilters);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [isImportingFromGHL, setIsImportingFromGHL] = useState(false);
  const [importProgress, setImportProgress] = useState<{ imported: number; hasMore: boolean; totalFromApi?: number } | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [hasAutoSynced, setHasAutoSynced] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const queryClient = useQueryClient();

  // Fetch clients with property count via secure Edge Function (HttpOnly cookies)
  const { data: clients = [], isLoading, refetch } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction<{ success: boolean; clients: Client[] }>('get-client-data', {
        listMode: true,
        listOptions: {
          select: '*',
          orderBy: 'created_at',
          orderAsc: false,
          includePropertyCount: true,
        },
      });
      
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error('Failed to fetch clients');
      return data.clients as Client[];
    }
  });

  // Deep-link: auto-open client modal from ?clientId= query param
  useEffect(() => {
    const clientId = searchParams.get('clientId');
    const tab = searchParams.get('tab');
    const dealId = searchParams.get('dealId');
    if (!clientId || isLoading || clients.length === 0) return;

    const target = clients.find(c => c.id === clientId);
    if (target) {
      setSelectedClient(target);
      setDeepLinkTab(tab || undefined);
      setDeepLinkDealId(dealId || undefined);
      setShowDetailsModal(true);
    }
    // Clean URL
    setSearchParams({}, { replace: true });
  }, [clients, isLoading, searchParams]);

  // Fetch GHL Location ID via edge function
  const { data: ghlLocationId } = useQuery({
    queryKey: ['ghl-location-id'],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('check-integration-secrets', {
        integrationId: 'gohighlevel'
      });
      
      if (error || !data?.configured) {
        console.error('GHL not configured:', error);
        return null;
      }
      // The location ID is stored as GOHIGHLEVEL_LOCATION_ID env var
      // We need to get it from a different source - check if it was returned
      return data?.locationId || null;
    },
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
  });

  // Auto-sync from GHL on first load if no clients exist
  useEffect(() => {
    if (!isLoading && clients.length === 0 && !hasAutoSynced && !isImportingFromGHL) {
      setHasAutoSynced(true);
      handleImportFromGHL();
    }
  }, [isLoading, clients.length, hasAutoSynced, isImportingFromGHL]);

  // Periodic auto-sync from GHL
  useEffect(() => {
    if (!autoSyncEnabled) return;

    const performAutoSync = async () => {
      if (isImportingFromGHL || isAutoSyncing) return;
      
      setIsAutoSyncing(true);
      try {
        const { data, error } = await invokeSecureFunction('import-clients-from-ghl', {
          clearExisting: false,
          maxPages: 5, // Lighter sync for background updates
        });

        if (!error && data?.success) {
          setLastSyncTime(new Date());
          refetch();
          if (data.stats?.imported > 0) {
            toast.success(`Auto-sync: ${data.stats.imported} clients updated`, { duration: 3000 });
          }
        }
      } catch (err) {
        console.error('Auto-sync error:', err);
      } finally {
        setIsAutoSyncing(false);
      }
    };

    // Initial sync on mount
    performAutoSync();

    // Set up interval
    const intervalId = setInterval(performAutoSync, AUTO_SYNC_INTERVAL);

    return () => clearInterval(intervalId);
  }, [autoSyncEnabled, isImportingFromGHL]);

  // Import clients from GHL with auto-resume for large datasets
  const handleImportFromGHL = async (
    clearExisting = false,
    resumeFromId: string | null = null,
    resumeFrom: number | null = null,
  ) => {
    setIsImportingFromGHL(true);

    if (!resumeFromId && resumeFrom === null) {
      setImportProgress({ imported: 0, hasMore: true });
    }

    try {
      let totalImported = importProgress?.imported || 0;
      let nextResumeId: string | null = resumeFromId;
      let nextResume: number | null = resumeFrom;
      let isFirstBatch = !resumeFromId && resumeFrom === null;

      // Loop to fetch all batches automatically
      do {
        const { data, error } = await invokeSecureFunction('import-clients-from-ghl', {
          clearExisting: isFirstBatch ? clearExisting : false,
          resumeFromId: nextResumeId,
          resumeFrom: nextResume,
          maxPages: 10, // Process 10 pages (1000 contacts) per batch to avoid timeouts
        });

        if (error) throw error;

        if (data?.success) {
          const importedThisBatch = data.stats?.imported || 0;
          totalImported += importedThisBatch;

          setImportProgress((prev) => ({
            imported: totalImported,
            hasMore: !!data.hasMore,
            totalFromApi: prev?.totalFromApi ?? data.stats?.totalFromApi,
          }));

          if (data.hasMore) {
            nextResumeId = data.nextResumeId ?? null;
            nextResume = typeof data.nextResume === 'number' ? data.nextResume : null;
            isFirstBatch = false;

            // If the API isn't providing a cursor, stop (prevents UI from looping forever)
            if (!nextResumeId && nextResume === null) {
              console.warn('Import indicated hasMore=true but no resume cursor was provided; stopping.');
              break;
            }
          } else {
            nextResumeId = null;
            nextResume = null;
            toast.success(`Import complete! ${totalImported} clients imported from GHL.`);
          }

          // Refresh the client list after each batch
          refetch();
        } else {
          throw new Error(data?.error || 'Import failed');
        }
      } while (nextResumeId || nextResume !== null);
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

  // Delete client mutation via secure Edge Function (HttpOnly cookies)
  const deleteClientMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const { data, error } = await invokeSecureFunction('manage-client-data', {
        operation: 'delete',
        table: 'clients',
        clientId,
      });
      
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Failed to delete client');
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
    // Active clients filter - use is_favorite (star icon) as active status
    if (showActiveOnly && !client.is_favorite) return false;

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

    // Follow-up status filter
    if (filters.followUpStatus !== 'all') {
      const now = new Date();
      const followUp = client.follow_up_date ? new Date(client.follow_up_date) : null;
      if (filters.followUpStatus === 'flagged' && !followUp) return false;
      if (filters.followUpStatus === 'overdue' && (!followUp || followUp >= now)) return false;
      if (filters.followUpStatus === 'upcoming') {
        if (!followUp) return false;
        const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        if (followUp < now || followUp > weekFromNow) return false;
      }
      if (filters.followUpStatus === 'none' && followUp) return false;
    }

    return true;
  });

  // Apply smart capitalization to client names for display
  const displayClients = filteredClients.map(client => ({
    ...client,
    primary_first_name: smartCapitalize(client.primary_first_name),
    primary_surname: smartCapitalize(client.primary_surname),
    secondary_first_name: smartCapitalize(client.secondary_first_name),
    secondary_surname: smartCapitalize(client.secondary_surname),
  }));

  // Count active clients for the button badge - use is_favorite (star icon)
  const activeClientCount = clients.filter(c => c.is_favorite).length;

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
        const { data, error } = await invokeSecureFunction('sync-client-to-ghl', {
          clientId: client.id
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

  const formatLastSync = (date: Date | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ago`;
  };

  const allSelected = filteredClients.length > 0 && selectedClients.length === filteredClients.length;
  const someSelected = selectedClients.length > 0 && selectedClients.length < filteredClients.length;

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Client Management</h1>
          <p className="text-sm text-muted-foreground">
            Manage clients, properties, and sync with GoHighLevel
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Auto-sync toggle - compact on mobile */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/50 border">
            {isAutoSyncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              <Zap className={`h-3.5 w-3.5 ${autoSyncEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
            )}
            <span className="text-xs font-medium hidden sm:inline">Auto-sync</span>
            <Switch
              checked={autoSyncEnabled}
              onCheckedChange={setAutoSyncEnabled}
              className="scale-75 sm:scale-90"
            />
          </div>

          <Button 
            onClick={() => handleImportFromGHL(false)} 
            variant="default" 
            size="sm"
            disabled={isImportingFromGHL}
            className="h-8 text-xs sm:text-sm"
          >
            {isImportingFromGHL ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5 mr-1.5" />
            )}
            <span className="hidden sm:inline">
              {isImportingFromGHL && importProgress
                ? `Importing... (${importProgress.imported.toLocaleString()})`
                : 'Import from GHL'}
            </span>
            <span className="sm:hidden">Import</span>
          </Button>
          <Button 
            onClick={() => setShowAddClientModal(true)} 
            variant="default" 
            size="sm"
            className="h-8 text-xs sm:text-sm"
          >
            <UserPlus className="h-3.5 w-3.5 mr-1.5" />
            <span className="hidden sm:inline">Add Client</span>
            <span className="sm:hidden">Add</span>
          </Button>
          
          {/* More actions in dropdown on mobile */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleClearAndReimport} disabled={isImportingFromGHL}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear & Reimport
              </DropdownMenuItem>
              {pendingSyncCount > 0 && (
                <DropdownMenuItem onClick={handleSyncAllPending} disabled={isSyncingAll}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync All ({pendingSyncCount})
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.location.href = '/client-tracker'}>
                <Target className="h-4 w-4 mr-2" />
                Client Tracker
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
        <div className="overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0">
          <TabsList className="inline-flex w-auto min-w-max">
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="portfolio-reports">Portfolio</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="compare">Compare</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
          </TabsList>
        </div>

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
            <Button
              variant={showActiveOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowActiveOnly(!showActiveOnly)}
              className="gap-2"
            >
              <Star className={`h-4 w-4 ${showActiveOnly ? 'fill-current' : ''}`} />
              Active Clients
              {activeClientCount > 0 && (
                <Badge variant={showActiveOnly ? "secondary" : "default"} className="ml-1">
                  {activeClientCount}
                </Badge>
              )}
            </Button>
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
          ) : displayClients.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No clients found</h3>
                <p className="text-muted-foreground text-center mt-1">
                  {searchQuery || filters !== defaultFilters || showActiveOnly ? 'Try adjusting your filters' : 'Import clients using the Import tab'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {displayClients.map((client) => (
              <ClientCard
                    key={client.id}
                    client={client}
                    ghlLocationId={ghlLocationId}
                    onView={() => handleViewClient(client)}
                    onDelete={() => handleDeleteClient(client)}
                    onSyncComplete={() => refetch()}
                    isSelected={selectedClients.includes(client.id)}
                    onSelect={(checked) => handleSelectClient(client.id, !!checked)}
                  />
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

        <TabsContent value="portfolio-reports" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Portfolio Performance Reports</h2>
              <p className="text-sm text-muted-foreground">View generated portfolio analysis reports across all clients</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.href = '/portfolio-reports'}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Full Page View
            </Button>
          </div>
          <PortfolioAnalysisReportsList showHeader={true} />
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
          onOpenChange={(open) => {
            setShowDetailsModal(open);
            if (!open) {
              setDeepLinkTab(undefined);
              setDeepLinkDealId(undefined);
            }
          }}
          initialTab={deepLinkTab}
          initialDealId={deepLinkDealId}
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

      {/* Add Client Modal */}
      <AddClientModal
        open={showAddClientModal}
        onOpenChange={setShowAddClientModal}
      />
    </div>
  );
}
