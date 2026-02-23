import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSecureCallLogs } from '@/hooks/useSecureCallLogs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { format, startOfDay, endOfDay, subDays, isWithinInterval } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { DateRange } from 'react-day-picker';
import { CallAnalyticsDashboard } from '@/components/call-logs/CallAnalyticsDashboard';
import { SquadAnalyticsDashboard } from '@/components/call-logs/SquadAnalyticsDashboard';
import { CallRecordingPlayer, CallRecordingPlayerHandle } from '@/components/call-logs/CallRecordingPlayer';
import { CallLogsExport } from '@/components/call-logs/CallLogsExport';
import { LiveCallsMonitor } from '@/components/call-logs/LiveCallsMonitor';
import { CallAnalyticsTrends } from '@/components/call-logs/CallAnalyticsTrends';
import { CallTagging, CallTagFilter } from '@/components/call-logs/CallTagging';
import { CallAlerts } from '@/components/call-logs/CallAlerts';
import { CallQualityScore, CallQualityBadge } from '@/components/call-logs/CallQualityScore';
import { WeeklyReportConfig } from '@/components/call-logs/WeeklyReportConfig';
import { CleanupContactNames } from '@/components/call-logs/CleanupContactNames';
import { CleanupTestCalls } from '@/components/call-logs/CleanupTestCalls';
import { NegativeCallAnalysis } from '@/components/call-logs/NegativeCallAnalysis';
import { CallToolCalls } from '@/components/call-logs/CallToolCalls';
import { CallTranscriptChat } from '@/components/call-logs/CallTranscriptChat';
import { 
  Phone, 
  PhoneIncoming, 
  PhoneOutgoing, 
  Clock, 
  DollarSign, 
  Search, 
  Filter,
  TrendingUp,
  Users,
  CheckCircle,
  XCircle,
  Voicemail,
  RefreshCw,
  Play,
  FileText,
  MessageSquare,
  Target,
  BarChart3,
  PieChart,
  GitBranch,
  Zap,
  ArrowRight,
  Radio,
  LineChart,
  Tag,
  SlidersHorizontal,
  AlertTriangle,
  CalendarIcon
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

interface SquadAssistant {
  id: string;
  name?: string;
  role?: string;
  handoffTimestamp?: string;
}

interface HandoffEvent {
  fromAssistant: string;
  toAssistant: string;
  timestamp: string;
  reason?: string;
}

interface StructuredDataMultiItem {
  assistant: string;
  data: Record<string, unknown>;
}

interface NegativeSentimentMoment {
  timestamp: number | null;
  transcriptSegment: string;
  triggerPhrase: string;
}

interface CallLog {
  id: string;
  vapi_call_id: string;
  agent_id: string | null;
  agent_name: string | null;
  phone_number: string | null;
  customer_name: string | null;
  call_direction: string | null;
  call_status: string | null;
  call_outcome: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  cost: number | null;
  transcript: string | null;
  summary: string | null;
  sentiment: string | null;
  key_topics: string[] | null;
  action_items: string[] | null;
  recording_url: string | null;
  metadata: unknown;
  created_at: string;
  tags: string[] | null;
  artifact_messages: unknown[] | null;
  // Squad-specific fields
  is_squad_call: boolean | null;
  squad_id: string | null;
  squad_name: string | null;
  call_intent: string | null;
  assistants_involved: SquadAssistant[] | null;
  handoff_sequence: HandoffEvent[] | null;
  structured_data_multi: StructuredDataMultiItem[] | null;
  // Negative call analysis fields
  root_cause_category: string | null;
  escalation_severity: number | null;
  resolution_status: string | null;
  resolution_notes: string | null;
  ai_recommendations: string[] | null;
  negative_sentiment_moment: NegativeSentimentMoment | null;
  recovery_priority: number | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

interface CallStats {
  totalCalls: number;
  completedCalls: number;
  successRate: number;
  avgDuration: number;
  totalCost: number;
  inboundCalls: number;
  outboundCalls: number;
  voicemails: number;
  squadCalls: number;
}

const CallLogs = () => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { fetchCallLogs } = useSecureCallLogs();
  const recordingPlayerRef = useRef<CallRecordingPlayerHandle>(null);
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [filteredCalls, setFilteredCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [selectedOutcome, setSelectedOutcome] = useState<string>('all');
  const [selectedSquadType, setSelectedSquadType] = useState<string>('all');
  const [selectedSquad, setSelectedSquad] = useState<string>('all');
  const [selectedIntent, setSelectedIntent] = useState<string>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedCall, setSelectedCall] = useState<CallLog | null>(null);
  const [showCallDetail, setShowCallDetail] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [agents, setAgents] = useState<{ name: string; count: number }[]>([]);
  const [squads, setSquads] = useState<{ id: string; name: string }[]>([]);
  const [stats, setStats] = useState<CallStats>({
    totalCalls: 0,
    completedCalls: 0,
    successRate: 0,
    avgDuration: 0,
    totalCost: 0,
    inboundCalls: 0,
    outboundCalls: 0,
    voicemails: 0,
    squadCalls: 0,
  });

  // Handle modal close - stop recording playback
  const handleModalOpenChange = useCallback((open: boolean) => {
    if (!open && recordingPlayerRef.current) {
      recordingPlayerRef.current.stop();
    }
    setShowCallDetail(open);
  }, []);

  useEffect(() => {
    fetchCalls();
    
    // Set up realtime subscription
    const channel = supabase
      .channel('vapi-call-logs-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vapi_call_logs' },
        (payload) => {
          console.log('Call log change:', payload);
          fetchCalls();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    filterCalls();
  }, [calls, searchQuery, selectedAgent, selectedOutcome, selectedSquadType, selectedSquad, selectedIntent, selectedTags, dateRange]);

  useEffect(() => {
    calculateStats();
  }, [filteredCalls]);

  const fetchCalls = async () => {
    setLoading(true);
    try {
      const { data, error } = await fetchCallLogs();

      if (error) throw error;

      // Transform data to match our interface types
      const transformedData: CallLog[] = (data || []).map(call => ({
        ...call,
        assistants_involved: (call.assistants_involved as unknown as SquadAssistant[]) || null,
        handoff_sequence: (call.handoff_sequence as unknown as HandoffEvent[]) || null,
        structured_data_multi: (call.structured_data_multi as unknown as StructuredDataMultiItem[]) || null,
      }));

      setCalls(transformedData);

      // Extract unique agents by name (not ID) to avoid duplicates
      const agentCounts = new Map<string, number>();
      transformedData?.forEach(call => {
        const name = call.agent_name;
        if (name) {
          agentCounts.set(name, (agentCounts.get(name) || 0) + 1);
        }
      });
      setAgents(Array.from(agentCounts, ([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)));

      // Extract unique squads
      const uniqueSquads = new Map<string, string>();
      transformedData?.forEach(call => {
        if (call.squad_id) {
          uniqueSquads.set(call.squad_id, call.squad_name || call.squad_id);
        }
      });
      setSquads(Array.from(uniqueSquads, ([id, name]) => ({ id, name })));

      toast({
        title: 'Refreshed',
        description: `${transformedData?.length || 0} call logs loaded`,
      });

    } catch (error) {
      console.error('Error fetching calls:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch call logs',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filterCalls = () => {
    let filtered = [...calls];
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(call =>
        call.phone_number?.toLowerCase().includes(query) ||
        call.customer_name?.toLowerCase().includes(query) ||
        call.summary?.toLowerCase().includes(query) ||
        call.agent_name?.toLowerCase().includes(query) ||
        call.squad_name?.toLowerCase().includes(query)
      );
    }

    if (selectedAgent !== 'all') {
      filtered = filtered.filter(call => call.agent_name === selectedAgent);
    }

    if (selectedOutcome !== 'all') {
      filtered = filtered.filter(call => call.call_outcome === selectedOutcome);
    }

    if (selectedSquadType !== 'all') {
      if (selectedSquadType === 'squad') {
        filtered = filtered.filter(call => call.is_squad_call === true);
      } else if (selectedSquadType === 'non-squad') {
        filtered = filtered.filter(call => !call.is_squad_call);
      }
    }

    if (selectedSquad !== 'all') {
      filtered = filtered.filter(call => call.squad_id === selectedSquad);
    }

    if (selectedIntent !== 'all') {
      filtered = filtered.filter(call => call.call_intent === selectedIntent);
    }

    if (selectedTags.length > 0) {
      filtered = filtered.filter(call => 
        selectedTags.some(tag => call.tags?.includes(tag))
      );
    }

    // Date range filter - use started_at if available, otherwise fall back to created_at
    if (dateRange?.from) {
      const fromDate = startOfDay(dateRange.from);
      const toDate = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
      
      filtered = filtered.filter(call => {
        // Use started_at if available, otherwise use created_at (for failed/unanswered calls)
        const callDate = call.started_at ? new Date(call.started_at) : (call.created_at ? new Date(call.created_at) : null);
        if (!callDate) return false;
        return isWithinInterval(callDate, { start: fromDate, end: toDate });
      });
    }

    setFilteredCalls(filtered);
  };

  const updateCallTags = (callId: string, newTags: string[]) => {
    setCalls(prev => prev.map(c => c.id === callId ? { ...c, tags: newTags } : c));
    if (selectedCall?.id === callId) {
      setSelectedCall(prev => prev ? { ...prev, tags: newTags } : null);
    }
  };

  const calculateStats = () => {
    const totalCalls = filteredCalls.length;
    const completedCalls = filteredCalls.filter(c => getOutcomeCategory(c.call_outcome) === 'success').length;
    const successRate = totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0;
    
    const callsWithDuration = filteredCalls.filter(c => c.duration_seconds);
    const avgDuration = callsWithDuration.length > 0
      ? Math.round(callsWithDuration.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / callsWithDuration.length)
      : 0;
    
    const totalCost = filteredCalls.reduce((sum, c) => sum + (c.cost || 0), 0);
    const inboundCalls = filteredCalls.filter(c => c.call_direction === 'inbound').length;
    const outboundCalls = filteredCalls.filter(c => c.call_direction === 'outbound').length;
    const voicemails = filteredCalls.filter(c => getOutcomeCategory(c.call_outcome) === 'voicemail').length;
    const squadCalls = filteredCalls.filter(c => c.is_squad_call).length;

    setStats({
      totalCalls,
      completedCalls,
      successRate,
      avgDuration,
      totalCost,
      inboundCalls,
      outboundCalls,
      voicemails,
      squadCalls,
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // VAPI outcome category helpers
  const getOutcomeCategory = (outcome: string | null): string => {
    if (!outcome) return 'unknown';
    const o = outcome.toLowerCase();
    if (o === 'customer-ended-call' || o === 'assistant-ended-call' || o === 'assistant-forwarded-call' || o === 'completed') return 'success';
    if (o === 'voicemail') return 'voicemail';
    if (o === 'customer-did-not-answer' || o === 'no-answer') return 'no-answer';
    if (o === 'customer-busy' || o.includes('operator-busy') || o === 'busy') return 'busy';
    if (o === 'silence-timed-out' || o === 'exceeded-max-duration' || o === 'timeout') return 'timeout';
    if (o === 'manually-canceled' || o === 'cancelled') return 'cancelled';
    if (o.includes('error') || o.includes('failed')) return 'error';
    return 'other';
  };

  const OUTCOME_DISPLAY: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
    'customer-ended-call': { label: 'Customer Ended', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: CheckCircle },
    'assistant-ended-call': { label: 'Assistant Ended', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: CheckCircle },
    'assistant-forwarded-call': { label: 'Forwarded', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: Phone },
    'voicemail': { label: 'Voicemail', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: Voicemail },
    'customer-did-not-answer': { label: 'No Answer', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: Phone },
    'customer-busy': { label: 'Busy', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: Phone },
    'silence-timed-out': { label: 'Silence Timeout', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: Clock },
    'exceeded-max-duration': { label: 'Max Duration', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: Clock },
    'manually-canceled': { label: 'Cancelled', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: XCircle },
    // Legacy values
    'completed': { label: 'Completed', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: CheckCircle },
    'no-answer': { label: 'No Answer', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: Phone },
    'busy': { label: 'Busy', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: Phone },
    'failed': { label: 'Failed', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: XCircle },
    'cancelled': { label: 'Cancelled', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: XCircle },
    'timeout': { label: 'Timeout', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: Clock },
  };

  const getOutcomeBadge = (outcome: string | null) => {
    if (!outcome) return <Badge variant="outline">Unknown</Badge>;
    const display = OUTCOME_DISPLAY[outcome];
    if (display) {
      const Icon = display.icon;
      return <Badge className={display.color}><Icon className="w-3 h-3 mr-1" /> {display.label}</Badge>;
    }
    // Fallback for any VAPI reason not explicitly mapped - format nicely
    const category = getOutcomeCategory(outcome);
    const fallbackColors: Record<string, string> = {
      'error': 'bg-red-500/20 text-red-400 border-red-500/30',
      'other': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    };
    const color = fallbackColors[category] || fallbackColors['other'];
    const label = outcome.replace(/[-._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return <Badge className={color}><XCircle className="w-3 h-3 mr-1" /> {label}</Badge>;
  };

  const getSentimentBadge = (sentiment: string | null) => {
    switch (sentiment) {
      case 'positive':
        return <Badge className="bg-emerald-500/20 text-emerald-400">Positive</Badge>;
      case 'negative':
        return <Badge className="bg-red-500/20 text-red-400">Negative</Badge>;
      case 'neutral':
        return <Badge className="bg-gray-500/20 text-gray-400">Neutral</Badge>;
      case 'mixed':
        return <Badge className="bg-amber-500/20 text-amber-400">Mixed</Badge>;
      default:
        return null;
    }
  };

  const openCallDetail = (call: CallLog) => {
    setSelectedCall(call);
    setShowCallDetail(true);
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
            Call Logs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Track and analyze voice agent call outcomes</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isMobile && <WeeklyReportConfig />}
          {!isMobile && <CleanupTestCalls onComplete={fetchCalls} />}
          {!isMobile && <CleanupContactNames onComplete={fetchCalls} />}
          {!isMobile && <CallAlerts calls={filteredCalls} />}
          <CallLogsExport calls={filteredCalls} stats={stats} />
          <Button onClick={fetchCalls} variant="outline" size="sm" className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="logs" className="w-full">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className={isMobile ? "inline-flex w-auto" : ""}>
            <TabsTrigger value="logs" className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm">
              <Phone className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Call</span> Logs
            </TabsTrigger>
            <TabsTrigger value="issues" className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm">
              <AlertTriangle className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Issues</span>
            </TabsTrigger>
            <TabsTrigger value="live" className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm">
              <Radio className="w-3.5 h-3.5 md:w-4 md:h-4" />
              Live
            </TabsTrigger>
            <TabsTrigger value="trends" className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm">
              <LineChart className="w-3.5 h-3.5 md:w-4 md:h-4" />
              Trends
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm">
              <PieChart className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Analytics</span>
            </TabsTrigger>
            {!isMobile && (
              <TabsTrigger value="squad-analytics" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Squad Analytics
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="issues" className="mt-4 md:mt-6">
          <NegativeCallAnalysis calls={filteredCalls as any} onRefresh={fetchCalls} />
        </TabsContent>

        <TabsContent value="live" className="mt-4 md:mt-6">
          <LiveCallsMonitor />
        </TabsContent>

        <TabsContent value="trends" className="mt-4 md:mt-6">
          <CallAnalyticsTrends calls={filteredCalls} />
        </TabsContent>

        <TabsContent value="analytics" className="mt-4 md:mt-6">
          <CallAnalyticsDashboard calls={filteredCalls} />
        </TabsContent>

        <TabsContent value="squad-analytics" className="mt-4 md:mt-6">
          <SquadAnalyticsDashboard calls={filteredCalls} />
        </TabsContent>

        <TabsContent value="logs" className="mt-4 md:mt-6 space-y-0">

      {/* Sticky header: Stats + Filters */}
      <div className="sticky top-0 z-20 bg-background pb-4 space-y-4 md:space-y-6">

      {/* Stats Cards - Responsive grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2 md:gap-3">
        <Card className="bg-gradient-to-br from-card to-card/50">
          <CardContent className="p-2 md:p-3">
            <div className="flex items-center gap-1.5 md:gap-2 mb-1">
              <div className="p-1 md:p-1.5 rounded-lg bg-muted">
                <Phone className="w-3 h-3 md:w-3.5 md:h-3.5 text-muted-foreground" />
              </div>
              <span className="text-[10px] md:text-xs text-muted-foreground">Total</span>
            </div>
            <p className="text-lg md:text-xl font-bold">{stats.totalCalls}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500/5 to-card">
          <CardContent className="p-2 md:p-3">
            <div className="flex items-center gap-1.5 md:gap-2 mb-1">
              <div className="p-1 md:p-1.5 rounded-lg bg-emerald-500/10">
                <CheckCircle className="w-3 h-3 md:w-3.5 md:h-3.5 text-emerald-500" />
              </div>
              <span className="text-[10px] md:text-xs text-muted-foreground">Done</span>
            </div>
            <p className="text-lg md:text-xl font-bold text-emerald-500">{stats.completedCalls}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/5 to-card">
          <CardContent className="p-2 md:p-3">
            <div className="flex items-center gap-1.5 md:gap-2 mb-1">
              <div className="p-1 md:p-1.5 rounded-lg bg-blue-500/10">
                <TrendingUp className="w-3 h-3 md:w-3.5 md:h-3.5 text-blue-500" />
              </div>
              <span className="text-[10px] md:text-xs text-muted-foreground">Rate</span>
            </div>
            <p className="text-lg md:text-xl font-bold text-blue-500">{stats.successRate}%</p>
          </CardContent>
        </Card>
        <Card className="hidden sm:block">
          <CardContent className="p-2 md:p-3">
            <div className="flex items-center gap-1.5 md:gap-2 mb-1">
              <div className="p-1 md:p-1.5 rounded-lg bg-muted">
                <Clock className="w-3 h-3 md:w-3.5 md:h-3.5 text-muted-foreground" />
              </div>
              <span className="text-[10px] md:text-xs text-muted-foreground">Avg</span>
            </div>
            <p className="text-lg md:text-xl font-bold">{formatDuration(stats.avgDuration)}</p>
          </CardContent>
        </Card>
        <Card className="hidden md:block bg-gradient-to-br from-amber-500/5 to-card">
          <CardContent className="p-2 md:p-3">
            <div className="flex items-center gap-1.5 md:gap-2 mb-1">
              <div className="p-1 md:p-1.5 rounded-lg bg-amber-500/10">
                <DollarSign className="w-3 h-3 md:w-3.5 md:h-3.5 text-amber-500" />
              </div>
              <span className="text-[10px] md:text-xs text-muted-foreground">Cost</span>
            </div>
            <p className="text-lg md:text-xl font-bold text-amber-500">${stats.totalCost.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="hidden lg:block bg-gradient-to-br from-green-500/5 to-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-green-500/10">
                <PhoneIncoming className="w-3.5 h-3.5 text-green-500" />
              </div>
              <span className="text-xs text-muted-foreground">Inbound</span>
            </div>
            <p className="text-xl font-bold text-green-500">{stats.inboundCalls}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-sky-500/5 to-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-sky-500/10">
                <PhoneOutgoing className="w-3.5 h-3.5 text-sky-500" />
              </div>
              <span className="text-xs text-muted-foreground">Outbound</span>
            </div>
            <p className="text-xl font-bold text-sky-500">{stats.outboundCalls}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-orange-500/5 to-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-orange-500/10">
                <Voicemail className="w-3.5 h-3.5 text-orange-500" />
              </div>
              <span className="text-xs text-muted-foreground">Voicemail</span>
            </div>
            <p className="text-xl font-bold text-orange-500">{stats.voicemails}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/5 to-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-purple-500/10">
                <Users className="w-3.5 h-3.5 text-purple-500" />
              </div>
              <span className="text-xs text-muted-foreground">Squad</span>
            </div>
            <p className="text-xl font-bold text-purple-500">{stats.squadCalls}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters - Mobile: Sheet, Desktop: Inline */}
      {isMobile ? (
        <>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search calls..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="shrink-0">
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[70vh] flex flex-col p-0">
                <SheetHeader className="p-4 border-b">
                  <SheetTitle className="flex items-center gap-2">
                    <Filter className="h-5 w-5" />
                    Call Filters
                  </SheetTitle>
                </SheetHeader>
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Agent</label>
                      <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="All Agents" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Agents</SelectItem>
                          {agents.map(agent => (
                            <SelectItem key={agent.name} value={agent.name}>{agent.name} ({agent.count})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Outcome</label>
                      <Select value={selectedOutcome} onValueChange={setSelectedOutcome}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="All Outcomes" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Outcomes</SelectItem>
                          {(() => {
                            const outcomeCounts = new Map<string, number>();
                            calls.forEach(c => {
                              const o = c.call_outcome || 'unknown';
                              outcomeCounts.set(o, (outcomeCounts.get(o) || 0) + 1);
                            });
                            return Array.from(outcomeCounts.entries())
                              .sort((a, b) => b[1] - a[1])
                              .map(([outcome, count]) => {
                                const display = OUTCOME_DISPLAY[outcome];
                                const label = display?.label || outcome.replace(/[-._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                                return <SelectItem key={outcome} value={outcome}>{label} ({count})</SelectItem>;
                              });
                          })()}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Call Type</label>
                      <Select value={selectedSquadType} onValueChange={setSelectedSquadType}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Call Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Call Types</SelectItem>
                          <SelectItem value="squad">Squad Calls</SelectItem>
                          <SelectItem value="non-squad">Non-Squad Calls</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Intent</label>
                      <Select value={selectedIntent} onValueChange={setSelectedIntent}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Intent" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Intents</SelectItem>
                          <SelectItem value="discovery_booking">Discovery</SelectItem>
                          <SelectItem value="strategy_booking">Strategy</SelectItem>
                          <SelectItem value="finance_consult">Finance</SelectItem>
                          <SelectItem value="general_inquiry">General Inquiry</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Tags</label>
                      <CallTagFilter selectedTags={selectedTags} onTagsChange={setSelectedTags} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Date Range</label>
                      <div className="flex flex-wrap gap-2">
                        <Button variant={!dateRange ? "default" : "outline"} size="sm" onClick={() => setDateRange(undefined)}>All Time</Button>
                        <Button variant="outline" size="sm" onClick={() => setDateRange({ from: new Date(), to: new Date() })}>Today</Button>
                        <Button variant="outline" size="sm" onClick={() => setDateRange({ from: subDays(new Date(), 7), to: new Date() })}>7 days</Button>
                        <Button variant="outline" size="sm" onClick={() => setDateRange({ from: subDays(new Date(), 30), to: new Date() })}>30 days</Button>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedAgent('all');
                        setSelectedOutcome('all');
                        setSelectedSquadType('all');
                        setSelectedSquad('all');
                        setSelectedIntent('all');
                        setSelectedTags([]);
                        setDateRange(undefined);
                      }}
                    >
                      Clear All Filters
                    </Button>
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>
          {/* Active filter count badge */}
          {(selectedAgent !== 'all' || selectedOutcome !== 'all' || selectedSquadType !== 'all' || selectedIntent !== 'all' || selectedTags.length > 0 || dateRange) && (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">
                {[selectedAgent !== 'all', selectedOutcome !== 'all', selectedSquadType !== 'all', selectedIntent !== 'all', selectedTags.length > 0, !!dateRange].filter(Boolean).length} filter(s) active
              </Badge>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 px-2 text-xs"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedAgent('all');
                  setSelectedOutcome('all');
                  setSelectedSquadType('all');
                  setSelectedSquad('all');
                  setSelectedIntent('all');
                  setSelectedTags([]);
                  setDateRange(undefined);
                }}
              >
                Clear all
              </Button>
            </div>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by phone, name, or summary..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="All Agents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agents</SelectItem>
                  {agents.map(agent => (
                    <SelectItem key={agent.name} value={agent.name}>{agent.name} ({agent.count})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedOutcome} onValueChange={setSelectedOutcome}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="All Outcomes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Outcomes</SelectItem>
                  {(() => {
                    const outcomeCounts = new Map<string, number>();
                    calls.forEach(c => {
                      const o = c.call_outcome || 'unknown';
                      outcomeCounts.set(o, (outcomeCounts.get(o) || 0) + 1);
                    });
                    return Array.from(outcomeCounts.entries())
                      .sort((a, b) => b[1] - a[1])
                      .map(([outcome, count]) => {
                        const display = OUTCOME_DISPLAY[outcome];
                        const label = display?.label || outcome.replace(/[-._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                        return <SelectItem key={outcome} value={outcome}>{label} ({count})</SelectItem>;
                      });
                  })()}
                </SelectContent>
              </Select>
              <Select value={selectedSquadType} onValueChange={setSelectedSquadType}>
                <SelectTrigger className="w-[160px]">
                  <Users className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Call Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Call Types</SelectItem>
                  <SelectItem value="squad">Squad Calls</SelectItem>
                  <SelectItem value="non-squad">Non-Squad Calls</SelectItem>
                </SelectContent>
              </Select>
              {squads.length > 0 && (
                <Select value={selectedSquad} onValueChange={setSelectedSquad}>
                  <SelectTrigger className="w-[200px]">
                    <GitBranch className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="All Squads" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Squads</SelectItem>
                    {squads.map(squad => (
                      <SelectItem key={squad.id} value={squad.id}>{squad.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={selectedIntent} onValueChange={setSelectedIntent}>
                <SelectTrigger className="w-[160px]">
                  <Target className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Intent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Intents</SelectItem>
                  <SelectItem value="discovery_booking">Discovery</SelectItem>
                  <SelectItem value="strategy_booking">Strategy</SelectItem>
                  <SelectItem value="finance_consult">Finance</SelectItem>
                  <SelectItem value="general_inquiry">General Inquiry</SelectItem>
                </SelectContent>
              </Select>
              <CallTagFilter selectedTags={selectedTags} onTagsChange={setSelectedTags} />
              
              {/* Date Range Picker */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[240px] justify-start text-left font-normal",
                      !dateRange && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d, yyyy")}
                        </>
                      ) : (
                        format(dateRange.from, "MMM d, yyyy")
                      )
                    ) : (
                      <span>Filter by date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="p-3 border-b space-y-2">
                    <p className="text-sm font-medium">Quick Select</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDateRange({ from: new Date(), to: new Date() })}
                      >
                        Today
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDateRange({ from: subDays(new Date(), 7), to: new Date() })}
                      >
                        Last 7 days
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDateRange({ from: subDays(new Date(), 30), to: new Date() })}
                      >
                        Last 30 days
                      </Button>
                      {dateRange && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDateRange(undefined)}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </CardContent>
        </Card>
      )}

      </div>
      {/* End sticky header */}

      <div className="mt-4 md:mt-6">
      {/* Call List */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Call History
              </CardTitle>
              <CardDescription className="mt-1">
                {filteredCalls.length} {filteredCalls.length === 1 ? 'call' : 'calls'} found
                {calls.length !== filteredCalls.length && (
                  <span className="text-muted-foreground"> (filtered from {calls.length})</span>
                )}
              </CardDescription>
            </div>
            {/* Active filters summary */}
            {(selectedAgent !== 'all' || selectedOutcome !== 'all' || selectedSquadType !== 'all' || selectedSquad !== 'all' || selectedIntent !== 'all' || searchQuery || dateRange) && (
              <div className="flex items-center gap-2 flex-wrap">
                {searchQuery && (
                  <Badge variant="secondary" className="text-xs">
                    Search: "{searchQuery}"
                  </Badge>
                )}
                {dateRange?.from && (
                  <Badge variant="secondary" className="text-xs">
                    <CalendarIcon className="w-3 h-3 mr-1" />
                    {dateRange.to 
                      ? `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d")}`
                      : format(dateRange.from, "MMM d, yyyy")
                    }
                  </Badge>
                )}
                {selectedSquad !== 'all' && (
                  <Badge className="bg-purple-500/20 text-purple-400 border border-purple-500/40 text-xs">
                    Squad: {squads.find(s => s.id === selectedSquad)?.name}
                  </Badge>
                )}
                {selectedIntent !== 'all' && (
                  <Badge className="bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 text-xs">
                    Intent: {selectedIntent.replace(/_/g, ' ')}
                  </Badge>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedAgent('all');
                    setSelectedOutcome('all');
                    setSelectedSquadType('all');
                    setSelectedSquad('all');
                    setSelectedIntent('all');
                    setDateRange(undefined);
                  }}
                >
                  Clear filters
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading call logs...</p>
            </div>
          ) : filteredCalls.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
                <Phone className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="font-medium text-foreground mb-1">No call logs found</p>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                {calls.length > 0 
                  ? 'Try adjusting your filters to see more results'
                  : 'Calls will appear here once your Vapi agents start making calls'}
              </p>
              {calls.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-4"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedAgent('all');
                    setSelectedOutcome('all');
                    setSelectedSquadType('all');
                    setSelectedSquad('all');
                    setSelectedIntent('all');
                    setDateRange(undefined);
                  }}
                >
                  Clear all filters
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCalls.map(call => (
                <div
                  key={call.id}
                  className={`group relative p-4 rounded-xl border bg-card hover:bg-muted/30 cursor-pointer transition-all duration-200 hover:shadow-md ${
                    call.is_squad_call ? 'border-l-4 border-l-purple-500' : ''
                  }`}
                  onClick={() => openCallDetail(call)}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left section */}
                    <div className="flex items-start gap-4 flex-1">
                      {/* Direction icon */}
                      <div className={`p-2.5 rounded-xl ${
                        call.call_direction === 'inbound' 
                          ? 'bg-emerald-500/10 text-emerald-500' 
                          : 'bg-blue-500/10 text-blue-500'
                      }`}>
                        {call.call_direction === 'inbound' ? (
                          <PhoneIncoming className="w-5 h-5" />
                        ) : (
                          <PhoneOutgoing className="w-5 h-5" />
                        )}
                      </div>
                      
                      {/* Main content */}
                      <div className="flex-1 min-w-0">
                        {/* Header row */}
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-foreground">
                            {call.customer_name || call.phone_number || 'Unknown Caller'}
                          </span>
                          
                          {/* Squad badge with name */}
                          {call.is_squad_call && (
                            <Badge className="bg-purple-500/20 text-purple-400 border border-purple-500/40 text-xs font-medium">
                              <Users className="w-3 h-3 mr-1" />
                              {call.squad_name || 'Squad Call'}
                            </Badge>
                          )}
                          
                          {/* Intent badge */}
                          {call.call_intent && (
                            <Badge className="bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 text-xs">
                              <Target className="w-3 h-3 mr-1" />
                              {call.call_intent.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </Badge>
                          )}
                          
                          {/* Agent badge for non-squad calls */}
                          {call.agent_name && !call.is_squad_call && (
                            <Badge className="bg-muted text-foreground border border-border text-xs">{call.agent_name}</Badge>
                          )}
                        </div>
                        
                        {/* Handoff flow visualization for squad calls */}
                        {call.is_squad_call && call.assistants_involved && call.assistants_involved.length > 0 && (
                          <div className="flex items-center gap-1 mb-2 flex-wrap">
                            {call.assistants_involved.map((assistant, i) => (
                              <div key={assistant.id} className="flex items-center">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-xs font-medium border border-border">
                                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                  {assistant.name || `Agent ${i + 1}`}
                                </span>
                                {i < call.assistants_involved!.length - 1 && (
                                  <ArrowRight className="w-3 h-3 text-muted-foreground mx-1" />
                                )}
                              </div>
                            ))}
                            {call.handoff_sequence && call.handoff_sequence.length > 0 && (
                              <Badge variant="secondary" className="text-xs ml-2">
                                <GitBranch className="w-3 h-3 mr-1" />
                                {call.handoff_sequence.length} handoff{call.handoff_sequence.length > 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                        )}
                        
                        {/* Meta info row */}
                        <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                          {call.phone_number && call.customer_name && (
                            <span className="font-mono text-xs">{call.phone_number}</span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {call.started_at 
                              ? format(new Date(call.started_at), 'MMM d, h:mm a')
                              : call.created_at 
                                ? <span className="text-muted-foreground/70">{format(new Date(call.created_at), 'MMM d, h:mm a')} (initiated)</span>
                                : '-'
                            }
                          </span>
                          <span className="flex items-center gap-1 font-medium">
                            {formatDuration(call.duration_seconds)}
                          </span>
                          {call.cost !== null && call.cost > 0 && (
                            <span className="flex items-center gap-1 text-amber-500">
                              <DollarSign className="w-3 h-3" />
                              ${call.cost.toFixed(3)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Right section - badges */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <CallQualityBadge
                        sentiment={call.sentiment}
                        durationSeconds={call.duration_seconds}
                        outcome={call.call_outcome}
                        cost={call.cost}
                        hasTranscript={!!call.transcript}
                      />
                      {getSentimentBadge(call.sentiment)}
                      {getOutcomeBadge(call.call_outcome)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
        </TabsContent>
      </Tabs>

      {/* Call Detail Modal */}
      <Dialog open={showCallDetail} onOpenChange={handleModalOpenChange}>
        <DialogContent className={cn(
          "flex flex-col",
          isMobile ? "w-[calc(100vw-24px)] max-w-[calc(100vw-24px)] h-[95vh] max-h-[95vh] p-3 rounded-xl" : "max-w-4xl h-[85vh] max-h-[85vh]"
        )}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" />
              Call Details
            </DialogTitle>
          </DialogHeader>
          {selectedCall && (
            <Tabs defaultValue="overview" className="w-full flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className={isMobile ? "overflow-x-auto -mx-1 px-1 scrollbar-hide" : ""}>
                <TabsList className={isMobile 
                  ? "inline-flex w-auto min-w-max h-auto gap-0.5 p-0.5"
                  : `grid w-full ${selectedCall.is_squad_call ? 'grid-cols-7' : 'grid-cols-6'}`
                }>
                  <TabsTrigger value="overview" className={isMobile ? "text-xs" : ""}>Overview</TabsTrigger>
                  {selectedCall.is_squad_call && (
                    <TabsTrigger value="squad" className={cn("flex items-center gap-1", isMobile && "text-xs")}>
                      <Users className="w-3 h-3" />
                      Squad
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="transcript" className={isMobile ? "text-xs" : ""}>Transcript</TabsTrigger>
                  <TabsTrigger value="tool-calls" className={isMobile ? "text-xs" : ""}>{isMobile ? "Tools" : "Tool Calls"}</TabsTrigger>
                  <TabsTrigger value="analysis" className={isMobile ? "text-xs" : ""}>Analysis</TabsTrigger>
                  <TabsTrigger value="metadata" className={isMobile ? "text-xs" : ""}>{isMobile ? "Meta" : "Metadata"}</TabsTrigger>
                </TabsList>
              </div>
              
              <ScrollArea className={cn("mt-2", isMobile ? "h-[60vh]" : "flex-1")}>
                <TabsContent value="overview" className={cn("space-y-3 sm:space-y-4 overflow-hidden min-w-0 max-w-full", isMobile ? "px-0" : "pr-4")}>
                  {/* Squad badge if applicable */}
                  {selectedCall.is_squad_call && (
                    <div className="flex items-center gap-2 mb-4">
                      <Badge className="bg-purple-500/20 text-purple-400 border border-purple-500/40">
                        <Users className="w-3 h-3 mr-1" />
                        Squad Call
                      </Badge>
                      {selectedCall.squad_name && (
                        <Badge className="bg-secondary text-secondary-foreground border border-border">{selectedCall.squad_name}</Badge>
                      )}
                      {selectedCall.call_intent && (
                        <Badge className="bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                          <Target className="w-3 h-3 mr-1" />
                          {selectedCall.call_intent.replace(/_/g, ' ')}
                        </Badge>
                      )}
                    </div>
                  )}
                  
                  {isMobile ? (
                    /* Mobile: single-column stack */
                    <div className="space-y-2 max-w-full overflow-hidden">
                      <div className="rounded-lg border bg-card p-3 max-w-full overflow-hidden">
                        <p className="text-xs text-muted-foreground">Customer</p>
                        <p className="font-medium text-sm break-words overflow-hidden">{selectedCall.customer_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground break-all overflow-hidden">{selectedCall.phone_number || '-'}</p>
                      </div>
                      <div className="rounded-lg border bg-card p-3 max-w-full overflow-hidden">
                        <p className="text-xs text-muted-foreground">{selectedCall.is_squad_call ? 'Primary Agent' : 'Agent'}</p>
                        <p className="font-medium text-sm break-words overflow-hidden">{selectedCall.agent_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground break-all overflow-hidden">{selectedCall.agent_id || '-'}</p>
                      </div>
                      <div className="rounded-lg border bg-card p-3 max-w-full overflow-hidden">
                        <p className="text-xs text-muted-foreground">Direction</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {selectedCall.call_direction === 'inbound' ? (
                            <>
                              <PhoneIncoming className="w-4 h-4 flex-shrink-0 text-emerald-500" />
                              <span className="text-sm font-medium">Inbound</span>
                            </>
                          ) : (
                            <>
                              <PhoneOutgoing className="w-4 h-4 flex-shrink-0 text-blue-500" />
                              <span className="text-sm font-medium">Outbound</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="rounded-lg border bg-card p-3 max-w-full overflow-hidden">
                        <p className="text-xs text-muted-foreground">Outcome</p>
                        <div className="mt-0.5">{getOutcomeBadge(selectedCall.call_outcome)}</div>
                      </div>
                      <div className="rounded-lg border bg-card p-3 max-w-full overflow-hidden">
                        <p className="text-xs text-muted-foreground">Duration</p>
                        <p className="font-medium text-sm">{formatDuration(selectedCall.duration_seconds)}</p>
                      </div>
                      <div className="rounded-lg border bg-card p-3 max-w-full overflow-hidden">
                        <p className="text-xs text-muted-foreground">Cost</p>
                        <p className="font-medium text-sm">${selectedCall.cost?.toFixed(4) || '0.00'}</p>
                      </div>
                      <div className="rounded-lg border bg-card p-3 max-w-full overflow-hidden">
                        <p className="text-xs text-muted-foreground">Started</p>
                        <p className="font-medium text-sm break-words">
                          {selectedCall.started_at ? format(new Date(selectedCall.started_at), 'PPpp') : '-'}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-card p-3 max-w-full overflow-hidden">
                        <p className="text-xs text-muted-foreground">Ended</p>
                        <p className="font-medium text-sm break-words">
                          {selectedCall.ended_at ? format(new Date(selectedCall.ended_at), 'PPpp') : '-'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* Desktop: original 3-column grid */
                    <div className="grid grid-cols-3 gap-4">
                      <Card>
                        <CardContent className="p-4">
                          <p className="text-sm text-muted-foreground">Customer</p>
                          <p className="font-medium">{selectedCall.customer_name || 'Unknown'}</p>
                          <p className="text-sm text-muted-foreground">{selectedCall.phone_number || '-'}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <p className="text-sm text-muted-foreground">
                            {selectedCall.is_squad_call ? 'Primary Agent' : 'Agent'}
                          </p>
                          <p className="font-medium">{selectedCall.agent_name || 'Unknown'}</p>
                          <p className="text-sm text-muted-foreground">{selectedCall.agent_id || '-'}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <p className="text-sm text-muted-foreground">Direction</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            {selectedCall.call_direction === 'inbound' ? (
                              <>
                                <PhoneIncoming className="w-4 h-4 text-emerald-500" />
                                <span className="text-sm">Inbound</span>
                              </>
                            ) : (
                              <>
                                <PhoneOutgoing className="w-4 h-4 text-blue-500" />
                                <span className="text-sm">Outbound</span>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <p className="text-sm text-muted-foreground">Outcome</p>
                          <div className="mt-1">{getOutcomeBadge(selectedCall.call_outcome)}</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <p className="text-sm text-muted-foreground">Duration</p>
                          <p className="font-medium">{formatDuration(selectedCall.duration_seconds)}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <p className="text-sm text-muted-foreground">Cost</p>
                          <p className="font-medium">${selectedCall.cost?.toFixed(4) || '0.00'}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <p className="text-sm text-muted-foreground">Started</p>
                          <p className="font-medium">
                            {selectedCall.started_at ? format(new Date(selectedCall.started_at), 'PPpp') : '-'}
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <p className="text-sm text-muted-foreground">Ended</p>
                          <p className="font-medium">
                            {selectedCall.ended_at ? format(new Date(selectedCall.ended_at), 'PPpp') : '-'}
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {selectedCall.summary && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          Summary
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm">{selectedCall.summary}</p>
                      </CardContent>
                    </Card>
                  )}

                  {selectedCall.recording_url && (
                    <CallRecordingPlayer 
                      ref={recordingPlayerRef}
                      key={selectedCall.id}
                      recordingUrl={selectedCall.recording_url} 
                      duration={selectedCall.duration_seconds}
                    />
                  )}
                </TabsContent>

                {/* Squad Tab - Only shown for squad calls */}
                {selectedCall.is_squad_call && (
                  <TabsContent value="squad" className="space-y-4 p-1 sm:p-2 overflow-hidden">
                    {/* Call Intent */}
                    {selectedCall.call_intent && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Target className="w-4 h-4" />
                            Call Intent
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Badge variant="secondary" className="text-sm capitalize">
                            {selectedCall.call_intent.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                          </Badge>
                        </CardContent>
                      </Card>
                    )}

                    {/* Assistants Involved */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          Assistants Involved ({selectedCall.assistants_involved?.length || 0})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {selectedCall.assistants_involved && selectedCall.assistants_involved.length > 0 ? (
                          <div className="space-y-2">
                            {selectedCall.assistants_involved.map((assistant, i) => (
                              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                                    <span className="text-purple-400 font-medium text-sm">{i + 1}</span>
                                  </div>
                                  <div>
                                    <p className="font-medium">{assistant.name || 'Unknown Assistant'}</p>
                                    <p className="text-xs text-muted-foreground font-mono">{assistant.id}</p>
                                  </div>
                                </div>
                                {assistant.handoffTimestamp && (
                                  <span className="text-xs text-muted-foreground">
                                    {format(new Date(assistant.handoffTimestamp), 'h:mm:ss a')}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-muted-foreground">No assistant data available</p>
                        )}
                      </CardContent>
                    </Card>

                    {/* Handoff Sequence */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <GitBranch className="w-4 h-4" />
                          Handoff Sequence
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {selectedCall.handoff_sequence && selectedCall.handoff_sequence.length > 0 ? (
                          <div className="space-y-3">
                            {selectedCall.handoff_sequence.map((handoff, i) => {
                              const fromAssistant = selectedCall.assistants_involved?.find(a => a.id === handoff.fromAssistant);
                              const toAssistant = selectedCall.assistants_involved?.find(a => a.id === handoff.toAssistant);
                              return (
                                <div key={i} className="flex items-center gap-2 text-sm">
                                  <Badge variant="outline" className="font-normal">
                                    {fromAssistant?.name || handoff.fromAssistant.slice(0, 8)}
                                  </Badge>
                                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                                  <Badge variant="outline" className="font-normal">
                                    {toAssistant?.name || handoff.toAssistant.slice(0, 8)}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground ml-auto">
                                    {format(new Date(handoff.timestamp), 'h:mm:ss a')}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-muted-foreground">No handoffs recorded</p>
                        )}
                      </CardContent>
                    </Card>

                    {/* Structured Data from Each Assistant */}
                    {selectedCall.structured_data_multi && selectedCall.structured_data_multi.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Zap className="w-4 h-4" />
                            Collected Data
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {selectedCall.structured_data_multi.map((item, i) => {
                              const assistant = selectedCall.assistants_involved?.find(a => a.id === item.assistant);
                              return (
                                <div key={i} className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">
                                      {assistant?.name || item.assistant.slice(0, 8)}
                                    </Badge>
                                  </div>
                                  <pre className="whitespace-pre-wrap text-xs font-mono bg-muted p-3 rounded-lg overflow-auto">
                                    {JSON.stringify(item.data, null, 2)}
                                  </pre>
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>
                )}

                <TabsContent value="transcript" className="p-1 sm:p-2 overflow-hidden">
                  <CallTranscriptChat 
                    artifactMessages={selectedCall.artifact_messages as any[]}
                    plainTranscript={selectedCall.transcript}
                  />
                </TabsContent>

                <TabsContent value="tool-calls" className="p-1 sm:p-2 overflow-hidden">
                  <CallToolCalls artifactMessages={selectedCall.artifact_messages as any[]} />
                </TabsContent>

                <TabsContent value="analysis" className="space-y-4 p-1 sm:p-2 overflow-hidden">
                  {/* Call Quality Score */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Call Quality Score</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CallQualityScore
                        sentiment={selectedCall.sentiment}
                        durationSeconds={selectedCall.duration_seconds}
                        outcome={selectedCall.call_outcome}
                        cost={selectedCall.cost}
                        hasTranscript={!!selectedCall.transcript}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Sentiment</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {getSentimentBadge(selectedCall.sentiment) || <span className="text-muted-foreground">Not analyzed</span>}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Target className="w-4 h-4" />
                        Key Topics
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedCall.key_topics?.length ? (
                        <div className="flex flex-wrap gap-2">
                          {selectedCall.key_topics.map((topic, i) => (
                            <Badge key={i} variant="secondary">{topic}</Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground">No topics identified</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        Action Items
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedCall.action_items?.length ? (
                        <ul className="list-disc list-inside space-y-1">
                          {selectedCall.action_items.map((item, i) => (
                            <li key={i} className="text-sm">{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-muted-foreground">No action items identified</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="metadata" className="p-1 sm:p-2 overflow-hidden">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Raw Metadata</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="whitespace-pre-wrap text-xs font-mono bg-muted p-4 rounded-lg overflow-auto">
                        {JSON.stringify(selectedCall.metadata, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                </TabsContent>
              </ScrollArea>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CallLogs;
