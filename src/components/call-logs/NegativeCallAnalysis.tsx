import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useSecureCallLogs } from '@/hooks/useSecureCallLogs';
import { format } from 'date-fns';
import { 
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Clock,
  Phone,
  User,
  MessageSquare,
  Lightbulb,
  TrendingDown,
  ArrowUpRight,
  Filter,
  RefreshCw,
  FileText,
  Target,
  Zap,
  Users,
  ChevronRight,
  X,
  PhoneCall
} from 'lucide-react';
import { CriticalMomentDetection } from './CriticalMomentDetection';
import { AgentPerformanceFlags } from './AgentPerformanceFlags';
import { TrendAlerts } from './TrendAlerts';
import { ComparativeCoaching } from './ComparativeCoaching';

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
  call_outcome: string | null;
  started_at: string | null;
  duration_seconds: number | null;
  sentiment: string | null;
  summary: string | null;
  transcript: string | null;
  key_topics: string[] | null;
  action_items: string[] | null;
  root_cause_category: string | null;
  escalation_severity: number | null;
  resolution_status: string | null;
  resolution_notes: string | null;
  ai_recommendations: string[] | null;
  negative_sentiment_moment: NegativeSentimentMoment | null;
  recovery_priority: number | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  recording_url: string | null;
}

interface NegativeCallAnalysisProps {
  calls: CallLog[];
  onRefresh: () => void;
}

const ROOT_CAUSE_LABELS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  pricing_objection: { label: 'Pricing Objection', icon: TrendingDown, color: 'text-amber-500' },
  service_complaint: { label: 'Service Complaint', icon: AlertCircle, color: 'text-red-500' },
  agent_confusion: { label: 'Agent Confusion', icon: Users, color: 'text-orange-500' },
  long_hold_time: { label: 'Long Hold Time', icon: Clock, color: 'text-yellow-500' },
  unresolved_query: { label: 'Unresolved Query', icon: MessageSquare, color: 'text-purple-500' },
  technical_issue: { label: 'Technical Issue', icon: Zap, color: 'text-blue-500' },
  miscommunication: { label: 'Miscommunication', icon: Phone, color: 'text-pink-500' },
  customer_frustration: { label: 'Customer Frustration', icon: AlertTriangle, color: 'text-red-600' },
  wrong_transfer: { label: 'Wrong Transfer', icon: ArrowUpRight, color: 'text-indigo-500' },
  information_gap: { label: 'Information Gap', icon: FileText, color: 'text-cyan-500' },
};

const RESOLUTION_STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  needs_review: { label: 'Needs Review', color: 'text-amber-400', bgColor: 'bg-amber-500/20' },
  reviewed: { label: 'Reviewed', color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  resolved: { label: 'Resolved', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' },
  escalated: { label: 'Escalated', color: 'text-red-400', bgColor: 'bg-red-500/20' },
};

const getSeverityColor = (severity: number | null) => {
  if (!severity) return 'bg-gray-500';
  if (severity <= 2) return 'bg-yellow-500';
  if (severity <= 3) return 'bg-orange-500';
  if (severity <= 4) return 'bg-red-500';
  return 'bg-red-600';
};

const getSeverityLabel = (severity: number | null) => {
  if (!severity) return 'Unknown';
  if (severity === 1) return 'Minor';
  if (severity === 2) return 'Moderate';
  if (severity === 3) return 'Significant';
  if (severity === 4) return 'Serious';
  return 'Critical';
};

export const NegativeCallAnalysis = ({ calls, onRefresh }: NegativeCallAnalysisProps) => {
  const { toast } = useToast();
  const { updateCall } = useSecureCallLogs();
  const [selectedCall, setSelectedCall] = useState<CallLog | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [newStatus, setNewStatus] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterRootCause, setFilterRootCause] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');

  // Filter to negative/mixed sentiment calls
  const negativeCalls = useMemo(() => {
    return calls.filter(c => c.sentiment === 'negative' || c.sentiment === 'mixed');
  }, [calls]);

  // Apply filters
  const filteredCalls = useMemo(() => {
    let filtered = [...negativeCalls];
    
    if (filterStatus !== 'all') {
      filtered = filtered.filter(c => c.resolution_status === filterStatus);
    }
    if (filterRootCause !== 'all') {
      filtered = filtered.filter(c => c.root_cause_category === filterRootCause);
    }
    if (filterSeverity !== 'all') {
      const severityNum = parseInt(filterSeverity);
      filtered = filtered.filter(c => c.escalation_severity === severityNum);
    }
    
    // Sort by recovery priority (highest first), then by date
    return filtered.sort((a, b) => {
      if ((b.recovery_priority || 0) !== (a.recovery_priority || 0)) {
        return (b.recovery_priority || 0) - (a.recovery_priority || 0);
      }
      return new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime();
    });
  }, [negativeCalls, filterStatus, filterRootCause, filterSeverity]);

  // Calculate stats
  const stats = useMemo(() => {
    const needsReview = negativeCalls.filter(c => c.resolution_status === 'needs_review').length;
    const resolved = negativeCalls.filter(c => c.resolution_status === 'resolved').length;
    const escalated = negativeCalls.filter(c => c.resolution_status === 'escalated').length;
    const highPriority = negativeCalls.filter(c => (c.recovery_priority || 0) >= 4).length;
    
    // Root cause breakdown
    const rootCauseBreakdown: Record<string, number> = {};
    negativeCalls.forEach(c => {
      if (c.root_cause_category) {
        rootCauseBreakdown[c.root_cause_category] = (rootCauseBreakdown[c.root_cause_category] || 0) + 1;
      }
    });
    
    return { needsReview, resolved, escalated, highPriority, rootCauseBreakdown, total: negativeCalls.length };
  }, [negativeCalls]);

  const handleUpdateResolution = async () => {
    if (!selectedCall || !newStatus) return;
    
    setSaving(true);
    try {
      const updateData: Record<string, unknown> = {
        resolution_status: newStatus,
        resolution_notes: resolutionNotes || null,
        reviewed_at: new Date().toISOString(),
      };
      
      const { error } = await updateCall(selectedCall.id, updateData);
      
      if (error) throw error;
      
      toast({
        title: 'Resolution Updated',
        description: `Call marked as ${RESOLUTION_STATUS_CONFIG[newStatus]?.label || newStatus}`,
      });
      
      setSelectedCall(null);
      setResolutionNotes('');
      setNewStatus('');
      onRefresh();
    } catch (error) {
      console.error('Error updating resolution:', error);
      toast({
        title: 'Error',
        description: 'Failed to update resolution status',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const openCallDetail = (call: CallLog) => {
    setSelectedCall(call);
    setResolutionNotes(call.resolution_notes || '');
    setNewStatus(call.resolution_status || 'needs_review');
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Recovery Queue - high priority calls needing follow-up
  const recoveryQueue = useMemo(() => {
    return negativeCalls
      .filter(c => c.resolution_status !== 'resolved' && (c.recovery_priority || 0) >= 3)
      .sort((a, b) => (b.recovery_priority || 0) - (a.recovery_priority || 0))
      .slice(0, 10);
  }, [negativeCalls]);

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-gradient-to-br from-card to-card/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-muted">
                <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground">Total Issues</span>
            </div>
            <p className="text-xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/5 to-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-amber-500/10">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <span className="text-xs text-muted-foreground">Needs Review</span>
            </div>
            <p className="text-xl font-bold text-amber-500">{stats.needsReview}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/5 to-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-red-500/10">
                <ArrowUpRight className="w-3.5 h-3.5 text-red-500" />
              </div>
              <span className="text-xs text-muted-foreground">Escalated</span>
            </div>
            <p className="text-xl font-bold text-red-500">{stats.escalated}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500/5 to-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-emerald-500/10">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <span className="text-xs text-muted-foreground">Resolved</span>
            </div>
            <p className="text-xl font-bold text-emerald-500">{stats.resolved}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/5 to-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-purple-500/10">
                <Target className="w-3.5 h-3.5 text-purple-500" />
              </div>
              <span className="text-xs text-muted-foreground">High Priority</span>
            </div>
            <p className="text-xl font-bold text-purple-500">{stats.highPriority}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="issues" className="w-full">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex w-auto min-w-max">
            <TabsTrigger value="issues" className="flex items-center gap-2 text-xs md:text-sm">
              <AlertCircle className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden sm:inline">All</span> Issues
            </TabsTrigger>
            <TabsTrigger value="critical-moments" className="flex items-center gap-2 text-xs md:text-sm">
              <Zap className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Critical</span> Moments
            </TabsTrigger>
            <TabsTrigger value="recovery" className="flex items-center gap-2 text-xs md:text-sm">
              <PhoneCall className="w-3.5 h-3.5 md:w-4 md:h-4" />
              Recovery
              {recoveryQueue.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {recoveryQueue.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="agents" className="flex items-center gap-2 text-xs md:text-sm">
              <Users className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Agent</span> Flags
            </TabsTrigger>
            <TabsTrigger value="trends" className="flex items-center gap-2 text-xs md:text-sm">
              <TrendingDown className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Trend</span> Alerts
            </TabsTrigger>
            <TabsTrigger value="coaching" className="flex items-center gap-2 text-xs md:text-sm">
              <Lightbulb className="w-3.5 h-3.5 md:w-4 md:h-4" />
              Coaching
            </TabsTrigger>
            <TabsTrigger value="breakdown" className="flex items-center gap-2 text-xs md:text-sm">
              <Target className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Root Cause</span> Breakdown
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="issues" className="mt-4">
          {/* Filters */}
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3 items-center">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[160px]">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="needs_review">Needs Review</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="escalated">Escalated</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterRootCause} onValueChange={setFilterRootCause}>
                  <SelectTrigger className="w-[180px]">
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Root Cause" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Root Causes</SelectItem>
                    {Object.entries(ROOT_CAUSE_LABELS).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                  <SelectTrigger className="w-[150px]">
                    <Target className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Severity</SelectItem>
                    <SelectItem value="5">5 - Critical</SelectItem>
                    <SelectItem value="4">4 - Serious</SelectItem>
                    <SelectItem value="3">3 - Significant</SelectItem>
                    <SelectItem value="2">2 - Moderate</SelectItem>
                    <SelectItem value="1">1 - Minor</SelectItem>
                  </SelectContent>
                </Select>
                {(filterStatus !== 'all' || filterRootCause !== 'all' || filterSeverity !== 'all') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFilterStatus('all');
                      setFilterRootCause('all');
                      setFilterSeverity('all');
                    }}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Clear
                  </Button>
                )}
                <div className="ml-auto text-sm text-muted-foreground">
                  {filteredCalls.length} {filteredCalls.length === 1 ? 'call' : 'calls'}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Call List */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Negative Sentiment Calls
              </CardTitle>
              <CardDescription>
                Calls requiring attention based on AI analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-3">
                  {filteredCalls.length === 0 ? (
                    <div className="text-center py-12">
                      <CheckCircle className="w-12 h-12 mx-auto text-emerald-500 mb-3" />
                      <p className="font-medium">No negative calls found</p>
                      <p className="text-sm text-muted-foreground">All calls are looking positive!</p>
                    </div>
                  ) : (
                    filteredCalls.map(call => (
                      <div
                        key={call.id}
                        className="p-4 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                        onClick={() => openCallDetail(call)}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-medium truncate">
                                {call.customer_name || call.phone_number || 'Unknown Caller'}
                              </span>
                              {call.escalation_severity && (
                                <Badge className={`${getSeverityColor(call.escalation_severity)} text-white text-xs`}>
                                  {getSeverityLabel(call.escalation_severity)}
                                </Badge>
                              )}
                              {call.recovery_priority && call.recovery_priority >= 4 && (
                                <Badge variant="outline" className="text-red-500 border-red-500/50 text-xs">
                                  High Priority
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-2">
                              <span>{call.agent_name || 'Unknown Agent'}</span>
                              <span>•</span>
                              <span>{call.started_at ? format(new Date(call.started_at), 'MMM d, h:mm a') : '-'}</span>
                              <span>•</span>
                              <span>{formatDuration(call.duration_seconds)}</span>
                            </div>
                            {call.root_cause_category && ROOT_CAUSE_LABELS[call.root_cause_category] && (
                              <div className="flex items-center gap-1.5 mb-2">
                                {(() => {
                                  const config = ROOT_CAUSE_LABELS[call.root_cause_category];
                                  const Icon = config.icon;
                                  return (
                                    <>
                                      <Icon className={`w-4 h-4 ${config.color}`} />
                                      <span className={`text-sm ${config.color}`}>{config.label}</span>
                                    </>
                                  );
                                })()}
                              </div>
                            )}
                            {call.summary && (
                              <p className="text-sm text-muted-foreground line-clamp-2">{call.summary}</p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            {call.resolution_status && RESOLUTION_STATUS_CONFIG[call.resolution_status] && (
                              <Badge className={`${RESOLUTION_STATUS_CONFIG[call.resolution_status].bgColor} ${RESOLUTION_STATUS_CONFIG[call.resolution_status].color} border-0`}>
                                {RESOLUTION_STATUS_CONFIG[call.resolution_status].label}
                              </Badge>
                            )}
                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recovery" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PhoneCall className="w-5 h-5" />
                Customer Recovery Queue
              </CardTitle>
              <CardDescription>
                Prioritized list of customers needing follow-up based on urgency and issue severity
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recoveryQueue.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="w-12 h-12 mx-auto text-emerald-500 mb-3" />
                  <p className="font-medium">Recovery queue is empty</p>
                  <p className="text-sm text-muted-foreground">No high-priority customers need immediate follow-up</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recoveryQueue.map((call, index) => (
                    <div
                      key={call.id}
                      className="p-4 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                      onClick={() => openCallDetail(call)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">
                              {call.customer_name || call.phone_number || 'Unknown'}
                            </span>
                            <Badge className={`${getSeverityColor(call.escalation_severity)} text-white text-xs`}>
                              Priority {call.recovery_priority}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {call.root_cause_category && ROOT_CAUSE_LABELS[call.root_cause_category]?.label}
                            {' • '}
                            {call.started_at ? format(new Date(call.started_at), 'MMM d, h:mm a') : '-'}
                          </div>
                        </div>
                        {call.ai_recommendations && call.ai_recommendations.length > 0 && (
                          <div className="hidden md:block max-w-xs">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                              <Lightbulb className="w-3 h-3" />
                              Recommendation
                            </div>
                            <p className="text-sm line-clamp-1">{call.ai_recommendations[0]}</p>
                          </div>
                        )}
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Critical Moment Detection Tab */}
        <TabsContent value="critical-moments" className="mt-4">
          <CriticalMomentDetection calls={calls} />
        </TabsContent>

        {/* Agent Performance Flags Tab */}
        <TabsContent value="agents" className="mt-4">
          <AgentPerformanceFlags calls={calls} />
        </TabsContent>

        {/* Trend Alerts Tab */}
        <TabsContent value="trends" className="mt-4">
          <TrendAlerts calls={calls} />
        </TabsContent>

        {/* Comparative Coaching Tab */}
        <TabsContent value="coaching" className="mt-4">
          <ComparativeCoaching calls={calls} />
        </TabsContent>

        <TabsContent value="breakdown" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5" />
                Root Cause Breakdown
              </CardTitle>
              <CardDescription>
                Distribution of issues by root cause category
              </CardDescription>
            </CardHeader>
            <CardContent>
              {Object.keys(stats.rootCauseBreakdown).length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium">No root causes identified</p>
                  <p className="text-sm text-muted-foreground">Root causes will appear as calls are analyzed</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(stats.rootCauseBreakdown)
                    .sort(([, a], [, b]) => b - a)
                    .map(([cause, count]) => {
                      const config = ROOT_CAUSE_LABELS[cause];
                      const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
                      const Icon = config?.icon || AlertCircle;
                      
                      return (
                        <div key={cause} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Icon className={`w-4 h-4 ${config?.color || 'text-muted-foreground'}`} />
                              <span className="font-medium">{config?.label || cause}</span>
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {count} ({percentage.toFixed(0)}%)
                            </span>
                          </div>
                          <Progress value={percentage} className="h-2" />
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Call Detail Dialog */}
      <Dialog open={!!selectedCall} onOpenChange={(open) => !open && setSelectedCall(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Call Analysis
            </DialogTitle>
          </DialogHeader>
          
          {selectedCall && (
            <div className="space-y-6">
              {/* Call Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground">Customer</label>
                  <p className="font-medium">{selectedCall.customer_name || selectedCall.phone_number || 'Unknown'}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Agent</label>
                  <p className="font-medium">{selectedCall.agent_name || 'Unknown'}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Date & Time</label>
                  <p className="font-medium">
                    {selectedCall.started_at ? format(new Date(selectedCall.started_at), 'MMM d, yyyy h:mm a') : '-'}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Duration</label>
                  <p className="font-medium">{formatDuration(selectedCall.duration_seconds)}</p>
                </div>
              </div>

              {/* Severity & Root Cause */}
              <div className="flex flex-wrap gap-3">
                {selectedCall.escalation_severity && (
                  <Badge className={`${getSeverityColor(selectedCall.escalation_severity)} text-white`}>
                    Severity: {selectedCall.escalation_severity}/5 - {getSeverityLabel(selectedCall.escalation_severity)}
                  </Badge>
                )}
                {selectedCall.recovery_priority && (
                  <Badge variant="outline">
                    Recovery Priority: {selectedCall.recovery_priority}/5
                  </Badge>
                )}
                {selectedCall.root_cause_category && ROOT_CAUSE_LABELS[selectedCall.root_cause_category] && (
                  <Badge variant="secondary" className="gap-1">
                    {(() => {
                      const config = ROOT_CAUSE_LABELS[selectedCall.root_cause_category!];
                      const Icon = config.icon;
                      return (
                        <>
                          <Icon className="w-3 h-3" />
                          {config.label}
                        </>
                      );
                    })()}
                  </Badge>
                )}
              </div>

              {/* Negative Moment */}
              {selectedCall.negative_sentiment_moment && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="font-medium text-red-500">Critical Moment</span>
                  </div>
                  {selectedCall.negative_sentiment_moment.triggerPhrase && (
                    <p className="text-sm mb-2">
                      <span className="text-muted-foreground">Trigger: </span>
                      <span className="italic">"{selectedCall.negative_sentiment_moment.triggerPhrase}"</span>
                    </p>
                  )}
                  {selectedCall.negative_sentiment_moment.transcriptSegment && (
                    <p className="text-sm text-muted-foreground">
                      "{selectedCall.negative_sentiment_moment.transcriptSegment}"
                    </p>
                  )}
                </div>
              )}

              {/* AI Recommendations */}
              {selectedCall.ai_recommendations && selectedCall.ai_recommendations.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    <span className="font-medium">AI Recommendations</span>
                  </div>
                  <div className="space-y-2">
                    {selectedCall.ai_recommendations.map((rec, idx) => (
                      <div key={idx} className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
                        <span className="text-primary font-medium">{idx + 1}.</span>
                        <span className="text-sm">{rec}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary */}
              {selectedCall.summary && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Summary</label>
                  <p className="text-sm p-3 rounded-lg bg-muted/50">{selectedCall.summary}</p>
                </div>
              )}

              {/* Resolution Status */}
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span className="font-medium">Resolution Status</span>
                </div>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="needs_review">Needs Review</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="escalated">Escalated</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea
                  placeholder="Add resolution notes..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedCall(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateResolution} disabled={saving || !newStatus}>
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Resolution'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
