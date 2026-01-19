import { useState } from 'react';
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
import { format } from 'date-fns';
import { 
  Search, 
  Filter, 
  Calendar as CalendarIcon, 
  Phone, 
  Mail, 
  Edit2, 
  Save,
  X,
  ChevronRight,
  Users,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  RefreshCw,
  Loader2,
  Download
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Pipeline status definitions matching the spreadsheet
const PIPELINE_STAGES = [
  { value: 'New Lead', label: 'New Lead', color: 'bg-gray-500' },
  { value: 'Quiz Submitted', label: 'Quiz Submitted', color: 'bg-blue-400' },
  { value: 'Call 1', label: 'Call 1', color: 'bg-blue-500' },
  { value: 'Discovery Call', label: 'Discovery Call', color: 'bg-indigo-500' },
  { value: 'Discovery Call - No Show', label: 'DC - No Show', color: 'bg-red-400' },
  { value: 'Strategy Session', label: 'Strategy Session', color: 'bg-purple-500' },
  { value: 'Strategy Session - No Show', label: 'SS - No Show', color: 'bg-red-400' },
  { value: 'Initial Financial Consultation', label: 'IFC', color: 'bg-cyan-500' },
  { value: 'Initial Financial Consultation - No Show', label: 'IFC - No Show', color: 'bg-red-400' },
  { value: 'Initial Finance Assessment', label: 'IFA', color: 'bg-teal-500' },
  { value: 'Finance Assessment Completed', label: 'FA Completed', color: 'bg-teal-600' },
  { value: 'Finance Link Issued', label: 'Finance Link', color: 'bg-emerald-500' },
  { value: 'Finance Link - No Response', label: 'FL - No Response', color: 'bg-orange-400' },
  { value: 'FA - PRE-LODGED', label: 'FA Pre-Lodged', color: 'bg-amber-500' },
  { value: 'FA - LODGED', label: 'FA Lodged', color: 'bg-yellow-500' },
  { value: 'FA - CONDITIONAL', label: 'FA Conditional', color: 'bg-lime-500' },
  { value: 'FA - UNCONDITIONAL', label: 'FA Unconditional', color: 'bg-green-500' },
  { value: 'FA - Documents Issued', label: 'FA Docs Issued', color: 'bg-green-600' },
  { value: 'FA - Settled', label: 'FA Settled', color: 'bg-green-700' },
  { value: 'POP Stage', label: 'POP Stage', color: 'bg-violet-500' },
];

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
}

export default function ClientTracker() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editingClient, setEditingClient] = useState<TrackedClient | null>(null);
  const [activeTab, setActiveTab] = useState('pipeline');
  const [isSyncingPipelines, setIsSyncingPipelines] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Fetch clients with pipeline data
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['client-tracker'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, primary_first_name, primary_surname, primary_email, primary_mobile, pipeline_status, follow_up_date, borrowing_capacity, proposed_rental_income, equity_release, pipeline_notes, pipeline_updated_at, ghl_contact_id')
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

  // Filter clients
  const filteredClients = clients.filter(client => {
    const matchesSearch = searchQuery === '' || 
      `${client.primary_first_name} ${client.primary_surname}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.primary_email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || client.pipeline_status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Calculate stats
  const stats = {
    total: clients.length,
    withFollowUp: clients.filter(c => c.follow_up_date).length,
    overdue: clients.filter(c => c.follow_up_date && new Date(c.follow_up_date) < new Date()).length,
    financeStage: clients.filter(c => c.pipeline_status?.includes('FA -') || c.pipeline_status?.includes('Finance')).length,
  };

  // Group by stage for Kanban-style view
  const groupedByStage = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage.value] = filteredClients.filter(c => c.pipeline_status === stage.value);
    return acc;
  }, {} as Record<string, TrackedClient[]>);

  const formatCurrency = (value: number | null) => {
    if (!value) return '-';
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getStageInfo = (status: string | null) => {
    return PIPELINE_STAGES.find(s => s.value === status) || { value: 'New Lead', label: 'New Lead', color: 'bg-gray-500' };
  };

  // Sync pipelines from GHL
  const handleSyncPipelines = async () => {
    setIsSyncingPipelines(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-ghl-pipelines');

      if (error) throw error;

      if (data?.success) {
        setLastSyncTime(new Date());
        queryClient.invalidateQueries({ queryKey: ['client-tracker'] });
        queryClient.invalidateQueries({ queryKey: ['clients'] });
        toast.success(`Synced ${data.stats?.clientsUpdated || 0} clients from ${data.stats?.opportunitiesFound || 0} GHL opportunities`);
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Client Tracker</h1>
          <p className="text-muted-foreground">Track clients through your sales pipeline</p>
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
            onClick={() => queryClient.invalidateQueries({ queryKey: ['client-tracker'] })} 
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-[250px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {PIPELINE_STAGES.map(stage => (
              <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs for different views */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline View</TabsTrigger>
          <TabsTrigger value="table">Table View</TabsTrigger>
          <TabsTrigger value="kanban">Kanban Board</TabsTrigger>
        </TabsList>

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
                    const stageInfo = getStageInfo(client.pipeline_status);
                    const isOverdue = client.follow_up_date && new Date(client.follow_up_date) < new Date();
                    
                    return (
                      <div key={client.id} className="p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-medium text-foreground">
                                {client.primary_first_name} {client.primary_surname}
                              </h3>
                              <Badge className={cn(stageInfo.color, 'text-white text-xs')}>
                                {stageInfo.label}
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
                    <TableHead>Status</TableHead>
                    <TableHead>Follow-up Date</TableHead>
                    <TableHead>Borrowing Capacity</TableHead>
                    <TableHead>Rental Income</TableHead>
                    <TableHead>Equity Release</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.map(client => {
                    const stageInfo = getStageInfo(client.pipeline_status);
                    return (
                      <TableRow key={client.id}>
                        <TableCell className="font-medium">
                          {client.primary_first_name} {client.primary_surname}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn(stageInfo.color, 'text-white text-xs')}>
                            {stageInfo.label}
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

        {/* Kanban Board View */}
        <TabsContent value="kanban" className="mt-4">
          <div className="flex gap-4 overflow-x-auto pb-4">
            {PIPELINE_STAGES.filter(stage => groupedByStage[stage.value]?.length > 0).map(stage => (
              <div key={stage.value} className="flex-shrink-0 w-72">
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <span className={cn('w-2 h-2 rounded-full', stage.color)} />
                        {stage.label}
                      </CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {groupedByStage[stage.value]?.length || 0}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 max-h-96 overflow-y-auto">
                    {groupedByStage[stage.value]?.map(client => (
                      <Card key={client.id} className="p-3 cursor-pointer hover:shadow-md transition-shadow">
                        <h4 className="font-medium text-sm">
                          {client.primary_first_name} {client.primary_surname}
                        </h4>
                        {client.follow_up_date && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(client.follow_up_date), 'MMM d')}
                          </p>
                        )}
                        {client.borrowing_capacity && (
                          <p className="text-xs text-green-600 mt-1">
                            {formatCurrency(client.borrowing_capacity)}
                          </p>
                        )}
                      </Card>
                    ))}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Client Edit Form Component
interface ClientEditFormProps {
  client: TrackedClient;
  onSave: (data: Partial<TrackedClient>) => void;
  isLoading: boolean;
}

function ClientEditForm({ client, onSave, isLoading }: ClientEditFormProps) {
  const [formData, setFormData] = useState({
    pipeline_status: client.pipeline_status || 'New Lead',
    follow_up_date: client.follow_up_date || '',
    borrowing_capacity: client.borrowing_capacity?.toString() || '',
    proposed_rental_income: client.proposed_rental_income?.toString() || '',
    equity_release: client.equity_release?.toString() || '',
    pipeline_notes: client.pipeline_notes || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
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
        <label className="text-sm font-medium">Pipeline Status</label>
        <Select 
          value={formData.pipeline_status} 
          onValueChange={(v) => setFormData(prev => ({ ...prev, pipeline_status: v }))}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PIPELINE_STAGES.map(stage => (
              <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>
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
