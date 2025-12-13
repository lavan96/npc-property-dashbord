import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { CallAnalyticsDashboard } from '@/components/call-logs/CallAnalyticsDashboard';
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
  PieChart
} from 'lucide-react';

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
}

const CallLogs = () => {
  const { toast } = useToast();
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [filteredCalls, setFilteredCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [selectedOutcome, setSelectedOutcome] = useState<string>('all');
  const [selectedCall, setSelectedCall] = useState<CallLog | null>(null);
  const [showCallDetail, setShowCallDetail] = useState(false);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [stats, setStats] = useState<CallStats>({
    totalCalls: 0,
    completedCalls: 0,
    successRate: 0,
    avgDuration: 0,
    totalCost: 0,
    inboundCalls: 0,
    outboundCalls: 0,
    voicemails: 0,
  });

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
  }, [calls, searchQuery, selectedAgent, selectedOutcome]);

  useEffect(() => {
    calculateStats();
  }, [filteredCalls]);

  const fetchCalls = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vapi_call_logs')
        .select('*')
        .order('started_at', { ascending: false });

      if (error) throw error;

      setCalls(data || []);

      // Extract unique agents
      const uniqueAgents = new Map<string, string>();
      data?.forEach(call => {
        if (call.agent_id) {
          uniqueAgents.set(call.agent_id, call.agent_name || call.agent_id);
        }
      });
      setAgents(Array.from(uniqueAgents, ([id, name]) => ({ id, name })));

      toast({
        title: 'Refreshed',
        description: `${data?.length || 0} call logs loaded`,
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
        call.agent_name?.toLowerCase().includes(query)
      );
    }

    if (selectedAgent !== 'all') {
      filtered = filtered.filter(call => call.agent_id === selectedAgent);
    }

    if (selectedOutcome !== 'all') {
      filtered = filtered.filter(call => call.call_outcome === selectedOutcome);
    }

    setFilteredCalls(filtered);
  };

  const calculateStats = () => {
    const totalCalls = filteredCalls.length;
    const completedCalls = filteredCalls.filter(c => c.call_outcome === 'completed').length;
    const successRate = totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0;
    
    const callsWithDuration = filteredCalls.filter(c => c.duration_seconds);
    const avgDuration = callsWithDuration.length > 0
      ? Math.round(callsWithDuration.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / callsWithDuration.length)
      : 0;
    
    const totalCost = filteredCalls.reduce((sum, c) => sum + (c.cost || 0), 0);
    const inboundCalls = filteredCalls.filter(c => c.call_direction === 'inbound').length;
    const outboundCalls = filteredCalls.filter(c => c.call_direction === 'outbound').length;
    const voicemails = filteredCalls.filter(c => c.call_outcome === 'voicemail').length;

    setStats({
      totalCalls,
      completedCalls,
      successRate,
      avgDuration,
      totalCost,
      inboundCalls,
      outboundCalls,
      voicemails,
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getOutcomeBadge = (outcome: string | null) => {
    switch (outcome) {
      case 'completed':
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><CheckCircle className="w-3 h-3 mr-1" /> Completed</Badge>;
      case 'voicemail':
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30"><Voicemail className="w-3 h-3 mr-1" /> Voicemail</Badge>;
      case 'no-answer':
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30"><Phone className="w-3 h-3 mr-1" /> No Answer</Badge>;
      case 'busy':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Phone className="w-3 h-3 mr-1" /> Busy</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
      case 'cancelled':
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30"><XCircle className="w-3 h-3 mr-1" /> Cancelled</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Call Logs</h1>
          <p className="text-muted-foreground">Track and analyze voice agent call outcomes</p>
        </div>
        <Button onClick={fetchCalls} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="logs" className="w-full">
        <TabsList>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <Phone className="w-4 h-4" />
            Call Logs
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <PieChart className="w-4 h-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="mt-6">
          <CallAnalyticsDashboard calls={filteredCalls} />
        </TabsContent>

        <TabsContent value="logs" className="mt-6 space-y-6">

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Calls</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.totalCalls}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-muted-foreground">Completed</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.completedCalls}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-muted-foreground">Success Rate</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.successRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Avg Duration</span>
            </div>
            <p className="text-2xl font-bold mt-1">{formatDuration(stats.avgDuration)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-400" />
              <span className="text-sm text-muted-foreground">Total Cost</span>
            </div>
            <p className="text-2xl font-bold mt-1">${stats.totalCost.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <PhoneIncoming className="w-4 h-4 text-green-400" />
              <span className="text-sm text-muted-foreground">Inbound</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.inboundCalls}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <PhoneOutgoing className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-muted-foreground">Outbound</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.outboundCalls}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Voicemail className="w-4 h-4 text-amber-400" />
              <span className="text-sm text-muted-foreground">Voicemails</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.voicemails}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
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
                  <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
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
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="voicemail">Voicemail</SelectItem>
                <SelectItem value="no-answer">No Answer</SelectItem>
                <SelectItem value="busy">Busy</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Call List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Call History
          </CardTitle>
          <CardDescription>
            {filteredCalls.length} calls found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCalls.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Phone className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No call logs found</p>
              <p className="text-sm mt-2">Calls will appear here once your Vapi agents start making calls</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCalls.map(call => (
                <div
                  key={call.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => openCallDetail(call)}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-full bg-muted">
                      {call.call_direction === 'inbound' ? (
                        <PhoneIncoming className="w-4 h-4 text-green-400" />
                      ) : (
                        <PhoneOutgoing className="w-4 h-4 text-blue-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{call.customer_name || call.phone_number || 'Unknown'}</span>
                        {call.agent_name && (
                          <Badge variant="outline" className="text-xs">{call.agent_name}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                        {call.phone_number && call.customer_name && (
                          <span>{call.phone_number}</span>
                        )}
                        <span>{call.started_at ? format(new Date(call.started_at), 'MMM d, yyyy h:mm a') : '-'}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDuration(call.duration_seconds)}
                        </span>
                        {call.cost !== null && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            ${call.cost.toFixed(3)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getSentimentBadge(call.sentiment)}
                    {getOutcomeBadge(call.call_outcome)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>

      {/* Call Detail Modal */}
      <Dialog open={showCallDetail} onOpenChange={setShowCallDetail}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" />
              Call Details
            </DialogTitle>
          </DialogHeader>
          {selectedCall && (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="transcript">Transcript</TabsTrigger>
                <TabsTrigger value="analysis">Analysis</TabsTrigger>
                <TabsTrigger value="metadata">Metadata</TabsTrigger>
              </TabsList>
              
              <ScrollArea className="h-[60vh] mt-4">
                <TabsContent value="overview" className="space-y-4 p-1">
                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground">Customer</p>
                        <p className="font-medium">{selectedCall.customer_name || 'Unknown'}</p>
                        <p className="text-sm text-muted-foreground">{selectedCall.phone_number || '-'}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground">Agent</p>
                        <p className="font-medium">{selectedCall.agent_name || 'Unknown'}</p>
                        <p className="text-sm text-muted-foreground">{selectedCall.agent_id || '-'}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground">Direction</p>
                        <div className="flex items-center gap-2 mt-1">
                          {selectedCall.call_direction === 'inbound' ? (
                            <>
                              <PhoneIncoming className="w-4 h-4 text-green-400" />
                              <span>Inbound</span>
                            </>
                          ) : (
                            <>
                              <PhoneOutgoing className="w-4 h-4 text-blue-400" />
                              <span>Outbound</span>
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
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Recording</span>
                          <Button size="sm" variant="outline" asChild>
                            <a href={selectedCall.recording_url} target="_blank" rel="noopener noreferrer">
                              <Play className="w-4 h-4 mr-2" />
                              Play Recording
                            </a>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="transcript" className="p-1">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" />
                        Conversation Transcript
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedCall.transcript ? (
                        <pre className="whitespace-pre-wrap text-sm font-mono bg-muted p-4 rounded-lg">
                          {selectedCall.transcript}
                        </pre>
                      ) : (
                        <p className="text-muted-foreground text-center py-8">No transcript available</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="analysis" className="space-y-4 p-1">
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

                <TabsContent value="metadata" className="p-1">
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
