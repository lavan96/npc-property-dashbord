import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { 
  Search, 
  Filter, 
  Calendar as CalendarIcon, 
  Phone, 
  Mail, 
  Edit2, 
  Save,
  ChevronRight,
  Users,
  TrendingUp,
  Clock,
  AlertCircle,
  DollarSign,
  RefreshCw,
  Loader2,
  Download,
  Layers,
  ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Types for GHL pipeline data
interface GHLPipeline {
  id: string;
  ghl_id: string;
  name: string;
  position: number;
  is_active: boolean;
  synced_at: string;
}

interface GHLPipelineStage {
  id: string;
  ghl_id: string;
  pipeline_id: string;
  name: string;
  position: number;
  color: string;
  synced_at: string;
}

interface TrackedClient {
  id: string;
  primary_first_name: string;
  primary_surname: string;
  primary_email: string | null;
  primary_mobile: string | null;
  pipeline_status: string | null;
  follow_up_date: string | null;
  borrowing_capacity: number | null;
  proposed_rental_income: number | null;
  equity_release: number | null;
  pipeline_notes: string | null;
  pipeline_updated_at: string | null;
  ghl_contact_id: string | null;
  ghl_opportunity_id: string | null;
  current_pipeline_id: string | null;
  current_stage_id: string | null;
  opportunity_status: string | null;
}

// Fallback stages for when no pipelines are synced
const FALLBACK_STAGES = [
  { value: 'New Lead', label: 'New Lead', color: '#6B7280' },
  { value: 'In Progress', label: 'In Progress', color: '#3B82F6' },
  { value: 'Qualified', label: 'Qualified', color: '#8B5CF6' },
  { value: 'Won', label: 'Won', color: '#22C55E' },
  { value: 'Lost', label: 'Lost', color: '#EF4444' },
];

export default function ClientTracker() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('all');
  const [editingClient, setEditingClient] = useState<TrackedClient | null>(null);
  const [activeTab, setActiveTab] = useState('kanban');
  const [isSyncingPipelines, setIsSyncingPipelines] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Fetch pipelines from database
  const { data: pipelines = [], isLoading: pipelinesLoading } = useQuery({
    queryKey: ['ghl-pipelines'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ghl_pipelines')
        .select('*')
        .eq('is_active', true)
        .order('position', { ascending: true });
      
      if (error) throw error;
      return data as GHLPipeline[];
    },
  });

  // Fetch pipeline stages from database
  const { data: allStages = [], isLoading: stagesLoading } = useQuery({
    queryKey: ['ghl-pipeline-stages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ghl_pipeline_stages')
        .select('*')
        .order('position', { ascending: true });
      
      if (error) throw error;
      return data as GHLPipelineStage[];
    },
  });

  // Fetch clients with pipeline data
  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ['client-tracker'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, primary_first_name, primary_surname, primary_email, primary_mobile, pipeline_status, follow_up_date, borrowing_capacity, proposed_rental_income, equity_release, pipeline_notes, pipeline_updated_at, ghl_contact_id, ghl_opportunity_id, current_pipeline_id, current_stage_id, opportunity_status')
        .order('follow_up_date', { ascending: true, nullsFirst: false });
      
      if (error) throw error;
      return data as TrackedClient[];
    },
  });

  // Update client mutation
  const updateClientMutation = useMutation({
    mutationFn: async (client: Partial<TrackedClient> & { id: string }) => {
      const { error } = await supabase
        .from('clients')
        .update({
          pipeline_status: client.pipeline_status,
          follow_up_date: client.follow_up_date,
          borrowing_capacity: client.borrowing_capacity,
          proposed_rental_income: client.proposed_rental_income,
          equity_release: client.equity_release,
          pipeline_notes: client.pipeline_notes,
          current_stage_id: client.current_stage_id,
        })
        .eq('id', client.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-tracker'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setEditingClient(null);
      toast.success('Pipeline data saved successfully');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Get stages for selected pipeline
  const stagesForPipeline = useMemo(() => {
    if (selectedPipelineId === 'all') {
      // Return all unique stages across all pipelines
      return allStages;
    }
    return allStages.filter(s => s.pipeline_id === selectedPipelineId);
  }, [allStages, selectedPipelineId]);

  // Filter clients
  const filteredClients = useMemo(() => {
    return clients.filter(client => {
      const matchesSearch = searchQuery === '' || 
        `${client.primary_first_name} ${client.primary_surname}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.primary_email?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || client.pipeline_status === statusFilter;
      
      const matchesPipeline = selectedPipelineId === 'all' || 
        client.current_pipeline_id === selectedPipelineId;
      
      return matchesSearch && matchesStatus && matchesPipeline;
    });
  }, [clients, searchQuery, statusFilter, selectedPipelineId]);

  // Calculate stats
  const stats = useMemo(() => ({
    total: clients.length,
    withFollowUp: clients.filter(c => c.follow_up_date).length,
    overdue: clients.filter(c => c.follow_up_date && new Date(c.follow_up_date) < new Date()).length,
    financeStage: clients.filter(c => c.pipeline_status?.includes('FA -') || c.pipeline_status?.includes('Finance')).length,
  }), [clients]);

  // Group clients by stage for Kanban view
  const groupedByStage = useMemo(() => {
    const grouped: Record<string, TrackedClient[]> = {};
    
    for (const stage of stagesForPipeline) {
      grouped[stage.id] = filteredClients.filter(c => c.current_stage_id === stage.id);
    }
    
    // Add "Unassigned" group for clients without a stage
    const unassigned = filteredClients.filter(c => !c.current_stage_id || !stagesForPipeline.find(s => s.id === c.current_stage_id));
    if (unassigned.length > 0) {
      grouped['unassigned'] = unassigned;
    }
    
    return grouped;
  }, [filteredClients, stagesForPipeline]);

  const formatCurrency = (value: number | null) => {
    if (!value) return '-';
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getStageInfo = (stageId: string | null, status: string | null) => {
    const stage = allStages.find(s => s.id === stageId);
    if (stage) {
      return { name: stage.name, color: stage.color };
    }
    // Fallback to status string
    return { name: status || 'Unassigned', color: '#6B7280' };
  };

  // Sync pipelines from GHL
  const handleSyncPipelines = async () => {
    setIsSyncingPipelines(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-ghl-pipelines');

      if (error) throw error;

      if (data?.success) {
        setLastSyncTime(new Date());
        queryClient.invalidateQueries({ queryKey: ['ghl-pipelines'] });
        queryClient.invalidateQueries({ queryKey: ['ghl-pipeline-stages'] });
        queryClient.invalidateQueries({ queryKey: ['client-tracker'] });
        queryClient.invalidateQueries({ queryKey: ['clients'] });
        toast.success(`Synced ${data.stats?.pipelinesFound || 0} pipelines, ${data.stats?.stagesSynced || 0} stages, ${data.stats?.clientsUpdated || 0} clients`);
      } else {
        throw new Error(data?.error || 'Sync failed');
      }
    } catch (err: any) {
      console.error('Pipeline sync error:', err);
      toast.error(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncingPipelines(false);
    }
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

  const isLoading = pipelinesLoading || stagesLoading || clientsLoading;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Client Tracker</h1>
          <p className="text-muted-foreground">
            Track clients through your GHL pipelines
            {pipelines.length > 0 && (
              <span className="ml-2 text-sm">
                • {pipelines.length} pipeline{pipelines.length !== 1 ? 's' : ''} synced
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {lastSyncTime && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last sync: {formatLastSync(lastSyncTime)}
            </span>
          )}
          <Button
            onClick={handleSyncPipelines}
            disabled={isSyncingPipelines}
            variant="default"
            size="sm"
          >
            {isSyncingPipelines ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {isSyncingPipelines ? 'Syncing...' : 'Sync from GHL'}
          </Button>
          <Button 
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['client-tracker'] });
              queryClient.invalidateQueries({ queryKey: ['ghl-pipelines'] });
              queryClient.invalidateQueries({ queryKey: ['ghl-pipeline-stages'] });
            }} 
            variant="outline" 
            size="sm"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total Clients</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Clock className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.withFollowUp}</p>
                <p className="text-sm text-muted-foreground">With Follow-ups</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <AlertCircle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.overdue}</p>
                <p className="text-sm text-muted-foreground">Overdue</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.financeStage}</p>
                <p className="text-sm text-muted-foreground">In Finance</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        {/* Pipeline selector */}
        <Select value={selectedPipelineId} onValueChange={setSelectedPipelineId}>
          <SelectTrigger className="w-full md:w-[220px]">
            <Layers className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Select Pipeline" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Pipelines</SelectItem>
            {pipelines.map(pipeline => (
              <SelectItem key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Stage filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-[200px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {stagesForPipeline.map(stage => (
              <SelectItem key={stage.id} value={stage.name}>
                <div className="flex items-center gap-2">
                  <span 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: stage.color }}
                  />
                  {stage.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* No pipelines synced message */}
      {!isLoading && pipelines.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Pipelines Synced</h3>
            <p className="text-muted-foreground mb-4">
              Click "Sync from GHL" to fetch your GoHighLevel pipelines and opportunities.
            </p>
            <Button onClick={handleSyncPipelines} disabled={isSyncingPipelines}>
              {isSyncingPipelines ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Sync from GHL
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabs for different views */}
      {(pipelines.length > 0 || clients.length > 0) && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="kanban">Kanban Board</TabsTrigger>
            <TabsTrigger value="pipeline">Pipeline View</TabsTrigger>
            <TabsTrigger value="table">Table View</TabsTrigger>
          </TabsList>

          {/* Kanban Board View */}
          <TabsContent value="kanban" className="mt-4">
            <ScrollArea className="w-full">
              <div className="flex gap-4 pb-4 min-w-max">
                {/* Render stages in order */}
                {stagesForPipeline.map(stage => {
                  const stageClients = groupedByStage[stage.id] || [];
                  return (
                    <div key={stage.id} className="flex-shrink-0 w-80">
                      <Card className="h-full">
                        <CardHeader className="py-3 px-4">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                              <span 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: stage.color }}
                              />
                              {stage.name}
                            </CardTitle>
                            <Badge variant="secondary" className="text-xs">
                              {stageClients.length}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="px-3 pb-3">
                          <div className="space-y-2 max-h-[500px] overflow-y-auto">
                            {stageClients.length === 0 ? (
                              <div className="text-center py-8 text-muted-foreground text-sm">
                                No clients
                              </div>
                            ) : (
                              stageClients.map(client => (
                                <KanbanCard 
                                  key={client.id} 
                                  client={client} 
                                  formatCurrency={formatCurrency}
                                  onEdit={() => setEditingClient(client)}
                                />
                              ))
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}

                {/* Unassigned column */}
                {groupedByStage['unassigned']?.length > 0 && (
                  <div className="flex-shrink-0 w-80">
                    <Card className="h-full border-dashed">
                      <CardHeader className="py-3 px-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                            <span className="w-3 h-3 rounded-full bg-gray-400" />
                            Unassigned
                          </CardTitle>
                          <Badge variant="secondary" className="text-xs">
                            {groupedByStage['unassigned'].length}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="px-3 pb-3">
                        <div className="space-y-2 max-h-[500px] overflow-y-auto">
                          {groupedByStage['unassigned'].map(client => (
                            <KanbanCard 
                              key={client.id} 
                              client={client} 
                              formatCurrency={formatCurrency}
                              onEdit={() => setEditingClient(client)}
                            />
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Pipeline List View */}
          <TabsContent value="pipeline" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Loading clients...</div>
                ) : filteredClients.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">No clients found</div>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredClients.map(client => {
                      const stageInfo = getStageInfo(client.current_stage_id, client.pipeline_status);
                      const isOverdue = client.follow_up_date && new Date(client.follow_up_date) < new Date();
                      const pipeline = pipelines.find(p => p.id === client.current_pipeline_id);
                      
                      return (
                        <div key={client.id} className="p-4 hover:bg-muted/50 transition-colors">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-medium text-foreground">
                                  {client.primary_first_name} {client.primary_surname}
                                </h3>
                                {pipeline && (
                                  <Badge variant="outline" className="text-xs">
                                    {pipeline.name}
                                  </Badge>
                                )}
                                <Badge 
                                  className="text-xs text-white"
                                  style={{ backgroundColor: stageInfo.color }}
                                >
                                  {stageInfo.name}
                                </Badge>
                                {isOverdue && (
                                  <Badge variant="destructive" className="text-xs">Overdue</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                                {client.primary_email && (
                                  <span className="flex items-center gap-1">
                                    <Mail className="h-3 w-3" />
                                    {client.primary_email}
                                  </span>
                                )}
                                {client.primary_mobile && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="h-3 w-3" />
                                    {client.primary_mobile}
                                  </span>
                                )}
                              </div>
                              {client.follow_up_date && (
                                <div className="flex items-center gap-1 mt-1 text-sm">
                                  <CalendarIcon className="h-3 w-3" />
                                  <span className={isOverdue ? 'text-red-500' : 'text-muted-foreground'}>
                                    Follow-up: {format(new Date(client.follow_up_date), 'MMM d, yyyy')}
                                  </span>
                                </div>
                              )}
                              {(client.borrowing_capacity || client.equity_release) && (
                                <div className="flex items-center gap-4 mt-2 text-sm">
                                  {client.borrowing_capacity && (
                                    <span className="flex items-center gap-1 text-green-600">
                                      <DollarSign className="h-3 w-3" />
                                      BC: {formatCurrency(client.borrowing_capacity)}
                                    </span>
                                  )}
                                  {client.equity_release && (
                                    <span className="text-blue-600">
                                      Equity: {formatCurrency(client.equity_release)}
                                    </span>
                                  )}
                                </div>
                              )}
                              {client.pipeline_notes && (
                                <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                                  {client.pipeline_notes}
                                </p>
                              )}
                            </div>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => setEditingClient(client)}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-lg">
                                <DialogHeader>
                                  <DialogTitle>
                                    Edit Pipeline: {client.primary_first_name} {client.primary_surname}
                                  </DialogTitle>
                                </DialogHeader>
                                <ClientEditForm 
                                  client={client}
                                  stages={allStages}
                                  pipelines={pipelines}
                                  onSave={(data) => updateClientMutation.mutate({ id: client.id, ...data })}
                                  isLoading={updateClientMutation.isPending}
                                />
                              </DialogContent>
                            </Dialog>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Table View */}
          <TabsContent value="table" className="mt-4">
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client Name</TableHead>
                      <TableHead>Pipeline</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Follow-up Date</TableHead>
                      <TableHead>Borrowing Capacity</TableHead>
                      <TableHead>Rental Income</TableHead>
                      <TableHead>Equity Release</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClients.map(client => {
                      const stageInfo = getStageInfo(client.current_stage_id, client.pipeline_status);
                      const pipeline = pipelines.find(p => p.id === client.current_pipeline_id);
                      return (
                        <TableRow key={client.id}>
                          <TableCell className="font-medium">
                            {client.primary_first_name} {client.primary_surname}
                          </TableCell>
                          <TableCell>
                            {pipeline ? (
                              <Badge variant="outline" className="text-xs">
                                {pipeline.name}
                              </Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              className="text-xs text-white"
                              style={{ backgroundColor: stageInfo.color }}
                            >
                              {stageInfo.name}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {client.follow_up_date 
                              ? format(new Date(client.follow_up_date), 'MMM d, yyyy')
                              : '-'
                            }
                          </TableCell>
                          <TableCell>{formatCurrency(client.borrowing_capacity)}</TableCell>
                          <TableCell>
                            {client.proposed_rental_income 
                              ? `$${client.proposed_rental_income}/wk`
                              : '-'
                            }
                          </TableCell>
                          <TableCell>{formatCurrency(client.equity_release)}</TableCell>
                          <TableCell className="text-right">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-lg">
                                <DialogHeader>
                                  <DialogTitle>
                                    Edit: {client.primary_first_name} {client.primary_surname}
                                  </DialogTitle>
                                </DialogHeader>
                                <ClientEditForm 
                                  client={client}
                                  stages={allStages}
                                  pipelines={pipelines}
                                  onSave={(data) => updateClientMutation.mutate({ id: client.id, ...data })}
                                  isLoading={updateClientMutation.isPending}
                                />
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Edit Dialog (for Kanban cards) */}
      {editingClient && (
        <Dialog open={!!editingClient} onOpenChange={() => setEditingClient(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                Edit: {editingClient.primary_first_name} {editingClient.primary_surname}
              </DialogTitle>
            </DialogHeader>
            <ClientEditForm 
              client={editingClient}
              stages={allStages}
              pipelines={pipelines}
              onSave={(data) => updateClientMutation.mutate({ id: editingClient.id, ...data })}
              isLoading={updateClientMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// Kanban Card Component
interface KanbanCardProps {
  client: TrackedClient;
  formatCurrency: (value: number | null) => string;
  onEdit: () => void;
}

function KanbanCard({ client, formatCurrency, onEdit }: KanbanCardProps) {
  const isOverdue = client.follow_up_date && new Date(client.follow_up_date) < new Date();
  
  return (
    <Card 
      className="p-3 cursor-pointer hover:shadow-md transition-shadow bg-card"
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-medium text-sm line-clamp-1">
          {client.primary_first_name} {client.primary_surname}
        </h4>
        {isOverdue && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            Overdue
          </Badge>
        )}
      </div>
      
      {client.primary_email && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-1 flex items-center gap-1">
          <Mail className="h-3 w-3" />
          {client.primary_email}
        </p>
      )}
      
      <div className="flex items-center justify-between mt-2">
        {client.follow_up_date && (
          <p className={cn(
            "text-xs flex items-center gap-1",
            isOverdue ? 'text-red-500' : 'text-muted-foreground'
          )}>
            <CalendarIcon className="h-3 w-3" />
            {format(new Date(client.follow_up_date), 'MMM d')}
          </p>
        )}
        {client.borrowing_capacity && (
          <p className="text-xs text-green-600 font-medium">
            {formatCurrency(client.borrowing_capacity)}
          </p>
        )}
      </div>
      
      {client.pipeline_notes && (
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2 border-t pt-2">
          {client.pipeline_notes}
        </p>
      )}
    </Card>
  );
}

// Client Edit Form Component
interface ClientEditFormProps {
  client: TrackedClient;
  stages: GHLPipelineStage[];
  pipelines: GHLPipeline[];
  onSave: (data: Partial<TrackedClient>) => void;
  isLoading: boolean;
}

function ClientEditForm({ client, stages, pipelines, onSave, isLoading }: ClientEditFormProps) {
  const [formData, setFormData] = useState({
    current_stage_id: client.current_stage_id || '',
    pipeline_status: client.pipeline_status || '',
    follow_up_date: client.follow_up_date || '',
    borrowing_capacity: client.borrowing_capacity?.toString() || '',
    proposed_rental_income: client.proposed_rental_income?.toString() || '',
    equity_release: client.equity_release?.toString() || '',
    pipeline_notes: client.pipeline_notes || '',
  });

  // Get stages for the client's current pipeline
  const pipelineStages = client.current_pipeline_id 
    ? stages.filter(s => s.pipeline_id === client.current_pipeline_id)
    : stages;

  const handleStageChange = (stageId: string) => {
    const stage = stages.find(s => s.id === stageId);
    setFormData(prev => ({ 
      ...prev, 
      current_stage_id: stageId,
      pipeline_status: stage?.name || prev.pipeline_status
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      current_stage_id: formData.current_stage_id || null,
      pipeline_status: formData.pipeline_status,
      follow_up_date: formData.follow_up_date || null,
      borrowing_capacity: formData.borrowing_capacity ? parseFloat(formData.borrowing_capacity) : null,
      proposed_rental_income: formData.proposed_rental_income ? parseFloat(formData.proposed_rental_income) : null,
      equity_release: formData.equity_release ? parseFloat(formData.equity_release) : null,
      pipeline_notes: formData.pipeline_notes || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium">Pipeline Stage</label>
        <Select 
          value={formData.current_stage_id} 
          onValueChange={handleStageChange}
        >
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select a stage" />
          </SelectTrigger>
          <SelectContent>
            {pipelineStages.map(stage => (
              <SelectItem key={stage.id} value={stage.id}>
                <div className="flex items-center gap-2">
                  <span 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: stage.color }}
                  />
                  {stage.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-sm font-medium">Follow-up Date</label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start text-left font-normal mt-1">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {formData.follow_up_date 
                ? format(new Date(formData.follow_up_date), 'PPP')
                : 'Pick a date'
              }
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={formData.follow_up_date ? new Date(formData.follow_up_date) : undefined}
              onSelect={(date) => setFormData(prev => ({ 
                ...prev, 
                follow_up_date: date ? format(date, 'yyyy-MM-dd') : '' 
              }))}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-sm font-medium">Borrowing Capacity</label>
          <Input
            type="number"
            placeholder="$0"
            value={formData.borrowing_capacity}
            onChange={(e) => setFormData(prev => ({ ...prev, borrowing_capacity: e.target.value }))}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Rental (weekly)</label>
          <Input
            type="number"
            placeholder="$0"
            value={formData.proposed_rental_income}
            onChange={(e) => setFormData(prev => ({ ...prev, proposed_rental_income: e.target.value }))}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Equity Release</label>
          <Input
            type="number"
            placeholder="$0"
            value={formData.equity_release}
            onChange={(e) => setFormData(prev => ({ ...prev, equity_release: e.target.value }))}
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Notes</label>
        <Textarea
          placeholder="Add pipeline notes..."
          value={formData.pipeline_notes}
          onChange={(e) => setFormData(prev => ({ ...prev, pipeline_notes: e.target.value }))}
          className="mt-1 min-h-[100px]"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isLoading}>
          <Save className="h-4 w-4 mr-2" />
          {isLoading ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}
