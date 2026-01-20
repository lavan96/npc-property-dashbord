import { useState, useMemo, useCallback, useEffect } from 'react';
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
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
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
  ChevronDown,
  GripVertical,
  FileText,
  UserCheck,
  ChevronLeft,
  Zap,
  Video,
  User
} from 'lucide-react';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useGHLCalendar, GHLEvent } from '@/hooks/useGHLCalendar';
import { EventDetailsModal } from '@/components/calendar/EventDetailsModal';
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
  is_favorite?: boolean;
}

interface ClientNote {
  id: string;
  client_id: string;
  content: string;
  note_type: string;
  created_at: string;
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
  const [activeNotesPage, setActiveNotesPage] = useState(1);
  const NOTES_PER_PAGE = 9;
  
  // Event details modal state
  const [selectedEvent, setSelectedEvent] = useState<GHLEvent | null>(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  
  // Auto-sync state
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const AUTO_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
  
  // GHL Calendar integration
  const { 
    events: ghlEvents, 
    isLoading: calendarLoading, 
    fetchEvents: fetchCalendarEvents,
    updateEvent,
    deleteEvent,
    rescheduleEvent,
    fetchContact
  } = useGHLCalendar();

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
        .select('id, primary_first_name, primary_surname, primary_email, primary_mobile, pipeline_status, follow_up_date, borrowing_capacity, proposed_rental_income, equity_release, pipeline_notes, pipeline_updated_at, ghl_contact_id, ghl_opportunity_id, current_pipeline_id, current_stage_id, opportunity_status, is_favorite')
        .order('follow_up_date', { ascending: true, nullsFirst: false });
      
      if (error) throw error;
      return data as TrackedClient[];
    },
  });

  // Fetch active clients (marked as favorite) and their notes
  const activeClients = useMemo(() => clients.filter(c => c.is_favorite), [clients]);
  // Filter active clients by search query
  const filteredActiveClients = useMemo(() => {
    if (activeTab !== 'active' || searchQuery === '') return activeClients;
    return activeClients.filter(client => {
      const matchesSearch = 
        `${client.primary_first_name} ${client.primary_surname}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.primary_email?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [activeClients, searchQuery, activeTab]);

  // Reset pagination when search changes
  useEffect(() => {
    setActiveNotesPage(1);
  }, [searchQuery]);

  // Auto-sync from GHL periodically
  useEffect(() => {
    if (!autoSyncEnabled) return;

    const performAutoSync = async () => {
      if (isSyncingPipelines || isAutoSyncing) return;
      
      setIsAutoSyncing(true);
      try {
        const { data, error } = await supabase.functions.invoke('sync-ghl-pipelines');

        if (!error && data?.success) {
          setLastSyncTime(new Date());
          queryClient.invalidateQueries({ queryKey: ['ghl-pipelines'] });
          queryClient.invalidateQueries({ queryKey: ['ghl-pipeline-stages'] });
          queryClient.invalidateQueries({ queryKey: ['client-tracker'] });
          queryClient.invalidateQueries({ queryKey: ['clients'] });
          
          // Also refresh calendar events
          const now = new Date();
          const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          fetchCalendarEvents(now.toISOString(), weekFromNow.toISOString());
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
  }, [autoSyncEnabled, isSyncingPipelines, queryClient, fetchCalendarEvents]);

  // Initial calendar events fetch
  useEffect(() => {
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    fetchCalendarEvents(now.toISOString(), weekFromNow.toISOString());
  }, []);

  // Filter upcoming appointments (next 7 days)
  const upcomingAppointments = useMemo(() => {
    const now = new Date();
    return ghlEvents
      .filter(event => new Date(event.startTime) >= now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .slice(0, 10); // Show top 10
  }, [ghlEvents]);

  const { data: activeClientNotes = [], isLoading: notesLoading } = useQuery({
    queryKey: ['active-client-notes', activeClients.map(c => c.id)],
    queryFn: async () => {
      if (activeClients.length === 0) return [];
      const { data, error } = await supabase
        .from('client_notes')
        .select('*')
        .in('client_id', activeClients.map(c => c.id))
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ClientNote[];
    },
    enabled: activeClients.length > 0,
  });

  // State for drag and drop
  const [draggedClient, setDraggedClient] = useState<TrackedClient | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

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

  // Move client to different stage mutation with two-way GHL sync
  const moveClientMutation = useMutation({
    mutationFn: async ({ clientId, stageId, stageName }: { clientId: string; stageId: string | null; stageName: string }) => {
      // First update locally for instant UI feedback
      const { error: localError } = await supabase
        .from('clients')
        .update({
          current_stage_id: stageId,
          pipeline_status: stageName,
        })
        .eq('id', clientId);
      
      if (localError) throw localError;

      // Then sync to GHL (non-blocking, but show toast on result)
      if (stageId) {
        const { data, error } = await supabase.functions.invoke('update-ghl-opportunity-stage', {
          body: { clientId, newStageId: stageId }
        });

        if (error) {
          console.error('GHL sync failed:', error);
          throw new Error(`GHL sync failed: ${error.message}`);
        }

        if (!data?.success) {
          // If GHL sync fails but has a specific error (like no opportunity linked), don't throw
          if (data?.error?.includes('No GHL opportunity linked')) {
            console.log('Client has no GHL opportunity, local update only');
            return { localOnly: true };
          }
          throw new Error(data?.error || 'GHL sync failed');
        }

        return { ghlSynced: true, stage: data.newStage };
      }

      return { localOnly: true };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['client-tracker'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      if (result?.ghlSynced) {
        toast.success(`Moved to ${result.stage} (synced to GHL)`);
      }
    },
    onError: (error) => {
      // Refetch to restore correct state
      queryClient.invalidateQueries({ queryKey: ['client-tracker'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.error(`Failed to move client: ${error.message}`);
    },
  });

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, client: TrackedClient) => {
    setDraggedClient(client);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', client.id);
    // Add a slight delay to show the dragging state
    setTimeout(() => {
      const element = e.target as HTMLElement;
      element.style.opacity = '0.5';
    }, 0);
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDraggedClient(null);
    setDragOverStageId(null);
    const element = e.target as HTMLElement;
    element.style.opacity = '1';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStageId(stageId);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if leaving the drop zone entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverStageId(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, stageId: string | null, stageName: string) => {
    e.preventDefault();
    setDragOverStageId(null);
    
    if (!draggedClient) return;
    
    // Don't do anything if dropping on same stage
    if (draggedClient.current_stage_id === stageId) {
      setDraggedClient(null);
      return;
    }
    
    moveClientMutation.mutate({
      clientId: draggedClient.id,
      stageId,
      stageName,
    });
    
    setDraggedClient(null);
  }, [draggedClient, moveClientMutation]);

  // Check if drag and drop should be enabled (only for specific pipeline, not "All Pipelines")
  const isDragDropEnabled = selectedPipelineId !== 'all';

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

  // Helper for event status colors
  const getEventStatusColor = (status: string, appointmentStatus?: string) => {
    const effectiveStatus = appointmentStatus || status;
    switch (effectiveStatus?.toLowerCase()) {
      case 'confirmed':
        return 'bg-green-500/10 text-green-600 border-green-500/20';
      case 'showed':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'noshow':
        return 'bg-red-500/10 text-red-600 border-red-500/20';
      case 'cancelled':
        return 'bg-muted text-muted-foreground border-muted';
      case 'pending':
        return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
      default:
        return 'bg-secondary text-secondary-foreground border-secondary';
    }
  };

  // Handle appointment card click
  const handleEventClick = (event: GHLEvent) => {
    setSelectedEvent(event);
    setEventModalOpen(true);
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
          {/* Auto-sync toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border">
                  {isAutoSyncing ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Zap className={`h-4 w-4 ${autoSyncEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                  )}
                  <span className="text-sm font-medium">Auto-sync</span>
                  <Switch
                    checked={autoSyncEnabled}
                    onCheckedChange={setAutoSyncEnabled}
                    className="scale-90"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Auto-sync every 5 minutes from GHL</p>
                {lastSyncTime && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Clock className="h-3 w-3" />
                    Last sync: {formatLastSync(lastSyncTime)}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
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

      {/* Upcoming Appointments from GHL Calendar */}
      {upcomingAppointments.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Video className="h-4 w-4 text-primary" />
                Upcoming Appointments
                <Badge variant="secondary" className="text-xs">
                  {upcomingAppointments.length}
                </Badge>
              </CardTitle>
              {calendarLoading && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="w-full">
              <div className="flex gap-3 pb-2">
                {upcomingAppointments.map(event => (
                  <Card 
                    key={event.id} 
                    className="flex-shrink-0 w-72 bg-muted/30 cursor-pointer hover:bg-muted/50 hover:shadow-md transition-all"
                    onClick={() => handleEventClick(event)}
                  >
                    <CardContent className="p-4">
                      {/* Client Name - Full display with icon */}
                      <div className="flex items-start gap-2 mb-2">
                        <User className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-foreground leading-tight">
                            {event.title || 'Untitled Appointment'}
                          </p>
                        </div>
                      </div>
                      
                      {/* Date and Time */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                        <CalendarIcon className="h-3.5 w-3.5" />
                        <span>{format(new Date(event.startTime), 'EEE, MMM d')}</span>
                        <span className="text-muted-foreground/50">•</span>
                        <Clock className="h-3.5 w-3.5" />
                        <span>{format(new Date(event.startTime), 'h:mm a')}</span>
                      </div>
                      
                      {/* Badges row */}
                      <div className="flex flex-wrap gap-1.5">
                        {event.calendarName && (
                          <Badge 
                            variant="outline" 
                            className="text-[10px]"
                            style={{ 
                              borderColor: event.calendarColor || 'hsl(var(--border))',
                              color: event.calendarColor || 'hsl(var(--muted-foreground))'
                            }}
                          >
                            {event.calendarName}
                          </Badge>
                        )}
                        {(event.appointmentStatus || event.status) && (
                          <Badge 
                            variant="outline"
                            className={cn("text-[10px]", getEventStatusColor(event.status, event.appointmentStatus))}
                          >
                            {event.appointmentStatus || event.status}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Event Details Modal */}
      <EventDetailsModal
        event={selectedEvent}
        open={eventModalOpen}
        onOpenChange={setEventModalOpen}
        getStatusColor={getEventStatusColor}
        fetchContact={fetchContact}
        onUpdateEvent={updateEvent}
        onDeleteEvent={deleteEvent}
        onRescheduleEvent={rescheduleEvent}
      />

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
            <TabsTrigger value="active" className="flex items-center gap-1">
              <UserCheck className="h-3.5 w-3.5" />
              Active Clients ({activeClients.length})
            </TabsTrigger>
          </TabsList>

          {/* Kanban Board View */}
          <TabsContent value="kanban" className="mt-4">
            {/* Drag and drop hint */}
            {isDragDropEnabled && (
              <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                <GripVertical className="h-3 w-3" />
                Drag cards to move opportunities between stages
              </p>
            )}
            {!isDragDropEnabled && stagesForPipeline.length > 0 && (
              <p className="text-xs text-muted-foreground mb-3">
                Select a specific pipeline to enable drag-and-drop between stages
              </p>
            )}
            
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-4 pb-4">
                {/* Render stages in order */}
                {stagesForPipeline.map(stage => {
                  const stageClients = groupedByStage[stage.id] || [];
                  const isDragOver = dragOverStageId === stage.id;
                  
                  return (
                    <div 
                      key={stage.id} 
                      className="flex-shrink-0 w-80"
                      onDragOver={isDragDropEnabled ? (e) => handleDragOver(e, stage.id) : undefined}
                      onDragLeave={isDragDropEnabled ? handleDragLeave : undefined}
                      onDrop={isDragDropEnabled ? (e) => handleDrop(e, stage.id, stage.name) : undefined}
                    >
                      <Card className={cn(
                        "h-full transition-all duration-200",
                        isDragOver && isDragDropEnabled && "ring-2 ring-primary/50 bg-primary/5"
                      )}>
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
                          <div className={cn(
                            "space-y-2 max-h-[500px] overflow-y-auto min-h-[100px]",
                            isDragOver && isDragDropEnabled && "bg-primary/5 rounded-md"
                          )}>
                            {stageClients.length === 0 ? (
                              <div className={cn(
                                "text-center py-8 text-muted-foreground text-sm",
                                isDragOver && isDragDropEnabled && "text-primary font-medium"
                              )}>
                                {isDragOver && isDragDropEnabled ? 'Drop here' : 'No clients'}
                              </div>
                            ) : (
                              stageClients.map(client => (
                                <KanbanCard 
                                  key={client.id} 
                                  client={client} 
                                  formatCurrency={formatCurrency}
                                  onEdit={() => setEditingClient(client)}
                                  isDraggable={isDragDropEnabled}
                                  onDragStart={(e) => handleDragStart(e, client)}
                                  onDragEnd={handleDragEnd}
                                  isDragging={draggedClient?.id === client.id}
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
                {(groupedByStage['unassigned']?.length > 0 || isDragDropEnabled) && (
                  <div 
                    className="flex-shrink-0 w-80"
                    onDragOver={isDragDropEnabled ? (e) => handleDragOver(e, 'unassigned') : undefined}
                    onDragLeave={isDragDropEnabled ? handleDragLeave : undefined}
                    onDrop={isDragDropEnabled ? (e) => handleDrop(e, null, 'Unassigned') : undefined}
                  >
                    <Card className={cn(
                      "h-full border-dashed transition-all duration-200",
                      dragOverStageId === 'unassigned' && isDragDropEnabled && "ring-2 ring-primary/50 bg-primary/5"
                    )}>
                      <CardHeader className="py-3 px-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                            <span className="w-3 h-3 rounded-full bg-gray-400" />
                            Unassigned
                          </CardTitle>
                          <Badge variant="secondary" className="text-xs">
                            {groupedByStage['unassigned']?.length || 0}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="px-3 pb-3">
                        <div className={cn(
                          "space-y-2 max-h-[500px] overflow-y-auto min-h-[100px]",
                          dragOverStageId === 'unassigned' && isDragDropEnabled && "bg-primary/5 rounded-md"
                        )}>
                          {!groupedByStage['unassigned']?.length ? (
                            <div className={cn(
                              "text-center py-8 text-muted-foreground text-sm",
                              dragOverStageId === 'unassigned' && isDragDropEnabled && "text-primary font-medium"
                            )}>
                              {dragOverStageId === 'unassigned' && isDragDropEnabled ? 'Drop here' : 'No clients'}
                            </div>
                          ) : (
                            groupedByStage['unassigned'].map(client => (
                              <KanbanCard 
                                key={client.id} 
                                client={client} 
                                formatCurrency={formatCurrency}
                                onEdit={() => setEditingClient(client)}
                                isDraggable={isDragDropEnabled}
                                onDragStart={(e) => handleDragStart(e, client)}
                                onDragEnd={handleDragEnd}
                                isDragging={draggedClient?.id === client.id}
                              />
                            ))
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
              <ScrollBar orientation="horizontal" />
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

          {/* Active Clients View */}
          <TabsContent value="active" className="mt-4">
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-primary" />
                    Active Clients Notes
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {searchQuery 
                      ? `Showing ${filteredActiveClients.length} of ${activeClients.length} active clients`
                      : `View notes for ${activeClients.length} active clients`
                    }
                  </p>
                </CardHeader>
                <CardContent>
                  {notesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredActiveClients.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {searchQuery ? 'No matching active clients found' : 'No active clients found'}
                    </div>
                  ) : (
                    <>
                      {/* Grid of client cards */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredActiveClients
                          .slice((activeNotesPage - 1) * NOTES_PER_PAGE, activeNotesPage * NOTES_PER_PAGE)
                          .map(client => {
                            const clientNotes = activeClientNotes.filter(n => n.client_id === client.id);
                            const stageInfo = getStageInfo(client.current_stage_id, client.pipeline_status);
                            
                            return (
                              <Card key={client.id} className="flex flex-col">
                                <CardHeader className="pb-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <CardTitle className="text-base truncate">
                                        {client.primary_first_name} {client.primary_surname}
                                      </CardTitle>
                                      <div className="flex flex-col gap-1 text-xs text-muted-foreground mt-1">
                                        {client.primary_email && (
                                          <span className="flex items-center gap-1 truncate">
                                            <Mail className="h-3 w-3 flex-shrink-0" />
                                            <span className="truncate">{client.primary_email}</span>
                                          </span>
                                        )}
                                        {client.primary_mobile && (
                                          <span className="flex items-center gap-1">
                                            <Phone className="h-3 w-3 flex-shrink-0" />
                                            {client.primary_mobile}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <Badge 
                                      className="text-xs flex-shrink-0"
                                      style={{ 
                                        backgroundColor: stageInfo.color + '20',
                                        color: stageInfo.color,
                                        borderColor: stageInfo.color 
                                      }}
                                      variant="outline"
                                    >
                                      {stageInfo.name}
                                    </Badge>
                                  </div>
                                </CardHeader>
                                <CardContent className="flex-1 pt-0">
                                  {clientNotes.length > 0 ? (
                                    <div className="space-y-2">
                                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                                        <FileText className="h-3 w-3" />
                                        Notes ({clientNotes.length})
                                      </p>
                                      <ScrollArea className="h-40">
                                        <div className="space-y-2 pr-3">
                                          {clientNotes.map(note => (
                                            <div 
                                              key={note.id} 
                                              className="bg-muted/50 rounded-md p-2.5 text-xs"
                                            >
                                              <p className="whitespace-pre-wrap line-clamp-4">{note.content}</p>
                                              <p className="text-[10px] text-muted-foreground mt-1">
                                                {format(new Date(note.created_at), 'dd MMM yyyy, h:mm a')}
                                              </p>
                                            </div>
                                          ))}
                                        </div>
                                      </ScrollArea>
                                    </div>
                                  ) : (
                                    <p className="text-sm text-muted-foreground italic">
                                      No notes for this client
                                    </p>
                                  )}
                                </CardContent>
                              </Card>
                            );
                          })}
                      </div>

                      {/* Pagination */}
                      {filteredActiveClients.length > NOTES_PER_PAGE && (
                        <div className="mt-6">
                          <Pagination>
                            <PaginationContent>
                              <PaginationItem>
                                <PaginationPrevious 
                                  onClick={() => setActiveNotesPage(p => Math.max(1, p - 1))}
                                  className={cn(
                                    "cursor-pointer",
                                    activeNotesPage === 1 && "pointer-events-none opacity-50"
                                  )}
                                />
                              </PaginationItem>
                              {Array.from({ length: Math.ceil(filteredActiveClients.length / NOTES_PER_PAGE) }).map((_, i) => (
                                <PaginationItem key={i}>
                                  <PaginationLink
                                    onClick={() => setActiveNotesPage(i + 1)}
                                    isActive={activeNotesPage === i + 1}
                                    className="cursor-pointer"
                                  >
                                    {i + 1}
                                  </PaginationLink>
                                </PaginationItem>
                              ))}
                              <PaginationItem>
                                <PaginationNext 
                                  onClick={() => setActiveNotesPage(p => Math.min(Math.ceil(filteredActiveClients.length / NOTES_PER_PAGE), p + 1))}
                                  className={cn(
                                    "cursor-pointer",
                                    activeNotesPage >= Math.ceil(filteredActiveClients.length / NOTES_PER_PAGE) && "pointer-events-none opacity-50"
                                  )}
                                />
                              </PaginationItem>
                            </PaginationContent>
                          </Pagination>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
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
  isDraggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  isDragging?: boolean;
}

function KanbanCard({ 
  client, 
  formatCurrency, 
  onEdit, 
  isDraggable = false,
  onDragStart,
  onDragEnd,
  isDragging = false
}: KanbanCardProps) {
  const isOverdue = client.follow_up_date && new Date(client.follow_up_date) < new Date();
  
  return (
    <Card 
      className={cn(
        "p-3 cursor-pointer hover:shadow-md transition-all duration-200 bg-card",
        isDraggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50 scale-95 ring-2 ring-primary/50"
      )}
      onClick={onEdit}
      draggable={isDraggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isDraggable && (
            <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}
          <h4 className="font-medium text-sm line-clamp-1">
            {client.primary_first_name} {client.primary_surname}
          </h4>
        </div>
        {isOverdue && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 flex-shrink-0">
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
