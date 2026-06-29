import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Users, GitBranch, Target, TrendingUp, CheckCircle, Clock } from 'lucide-react';
import { callLogBadgeTone } from './badgeStyles';
import { cn } from '@/lib/utils';
import { CallStatePanel } from './CallStatePanel';

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

interface CallLog {
  id: string;
  is_squad_call: boolean | null;
  squad_id: string | null;
  squad_name: string | null;
  call_intent: string | null;
  call_outcome: string | null;
  duration_seconds: number | null;
  assistants_involved: SquadAssistant[] | null;
  handoff_sequence: HandoffEvent[] | null;
}

interface SquadAnalyticsDashboardProps {
  calls: CallLog[];
}

const INTENT_COLORS: Record<string, string> = {
  discovery: '#3b82f6',
  discovery_booking: '#3b82f6',
  strategy: '#8b5cf6',
  strategy_session: '#8b5cf6',
  finance: '#10b981',
  finance_consult: '#10b981',
  unknown: '#6b7280',
};

// Fallback colors for any intents not in the map
const FALLBACK_COLORS = ['#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16', '#f97316'];


const squadPanel =
  'relative overflow-hidden rounded-3xl border border-border dark:border-white/10 bg-gradient-to-br from-card dark:from-zinc-950/95 via-card dark:via-zinc-900/80 to-background dark:to-black/90 shadow-2xl shadow-sm dark:shadow-black/30';
const squadKpiCard =
  'group relative overflow-hidden rounded-3xl border border-border dark:border-white/10 bg-gradient-to-br shadow-lg shadow-sm dark:shadow-black/25 transition-all duration-300 before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-amber-200/40 before:to-transparent hover:-translate-y-0.5 hover:border-amber-300/35 hover:shadow-amber-500/10';
const squadChartCard =
  'relative overflow-hidden rounded-3xl border border-border dark:border-white/10 bg-gradient-to-br from-card dark:from-zinc-950/95 via-card dark:via-zinc-900/80 to-background dark:to-black/90 shadow-xl shadow-sm dark:shadow-black/25 transition-all duration-300 before:pointer-events-none before:absolute before:inset-x-8 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-amber-200/45 before:to-transparent hover:border-amber-300/30 hover:shadow-amber-500/10';
const squadChartShell = 'rounded-2xl border border-border dark:border-white/10 bg-background dark:bg-black/20 p-3';
const squadTooltipContentStyle = {
  backgroundColor: 'rgba(9, 9, 11, 0.96)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '16px',
  boxShadow: '0 24px 70px rgba(0,0,0,0.42)',
  color: '#f4f4f5',
};
const squadTooltipLabelStyle = { color: '#f4f4f5' };

const getIntentColor = (intent: string, index: number): string => {
  const normalizedIntent = intent.toLowerCase().replace(/\s+/g, '_');
  if (INTENT_COLORS[normalizedIntent]) {
    return INTENT_COLORS[normalizedIntent];
  }
  // Check for partial matches
  if (normalizedIntent.includes('discovery')) return '#3b82f6';
  if (normalizedIntent.includes('strategy')) return '#8b5cf6';
  if (normalizedIntent.includes('finance')) return '#10b981';
  // Use fallback color based on index
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
};

export const SquadAnalyticsDashboard = ({ calls }: SquadAnalyticsDashboardProps) => {
  // Filter to squad calls only
  const squadCalls = useMemo(() => calls.filter(c => c.is_squad_call), [calls]);

  // Calculate average handoff count
  const handoffStats = useMemo(() => {
    const callsWithHandoffs = squadCalls.filter(c => c.handoff_sequence && c.handoff_sequence.length > 0);
    const totalHandoffs = callsWithHandoffs.reduce((sum, c) => sum + (c.handoff_sequence?.length || 0), 0);
    const avgHandoffs = callsWithHandoffs.length > 0 ? (totalHandoffs / callsWithHandoffs.length).toFixed(1) : '0';
    const maxHandoffs = Math.max(...squadCalls.map(c => c.handoff_sequence?.length || 0), 0);
    
    return {
      avgHandoffs,
      totalHandoffs,
      maxHandoffs,
      callsWithHandoffs: callsWithHandoffs.length,
    };
  }, [squadCalls]);

  // Calculate intent distribution
  const intentData = useMemo(() => {
    const counts: Record<string, number> = {};
    squadCalls.forEach(call => {
      const intent = call.call_intent || 'unknown';
      counts[intent] = (counts[intent] || 0) + 1;
    });
    return Object.entries(counts)
      .filter(([_, count]) => count > 0)
      .map(([name, value], index) => ({
        name: name.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        value,
        color: getIntentColor(name, index),
      }))
      .sort((a, b) => b.value - a.value);
  }, [squadCalls]);

  // Calculate success rates by intent
  const successByIntent = useMemo(() => {
    const intentStats: Record<string, { total: number; completed: number }> = {};
    
    squadCalls.forEach(call => {
      const intent = call.call_intent || 'unknown';
      if (!intentStats[intent]) {
        intentStats[intent] = { total: 0, completed: 0 };
      }
      intentStats[intent].total++;
      if (call.call_outcome === 'completed') {
        intentStats[intent].completed++;
      }
    });

    return Object.entries(intentStats)
      .map(([intent, stats]) => ({
        name: intent.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        'Total Calls': stats.total,
        'Completed': stats.completed,
        'Success Rate': stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
      }))
      .sort((a, b) => b['Total Calls'] - a['Total Calls']);
  }, [squadCalls]);

  // Calculate assistant involvement stats
  const assistantStats = useMemo(() => {
    const assistantCounts: Record<string, { id: string; name: string; count: number; completed: number }> = {};
    
    squadCalls.forEach(call => {
      if (call.assistants_involved) {
        call.assistants_involved.forEach(assistant => {
          const id = assistant.id;
          if (!assistantCounts[id]) {
            assistantCounts[id] = { 
              id, 
              name: assistant.name || id.slice(0, 8), 
              count: 0, 
              completed: 0 
            };
          }
          assistantCounts[id].count++;
          if (call.call_outcome === 'completed') {
            assistantCounts[id].completed++;
          }
        });
      }
    });

    return Object.values(assistantCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [squadCalls]);

  // Calculate average agents per call
  const avgAgentsPerCall = useMemo(() => {
    const callsWithAgents = squadCalls.filter(c => c.assistants_involved && c.assistants_involved.length > 0);
    const totalAgents = callsWithAgents.reduce((sum, c) => sum + (c.assistants_involved?.length || 0), 0);
    return callsWithAgents.length > 0 ? (totalAgents / callsWithAgents.length).toFixed(1) : '0';
  }, [squadCalls]);

  // Squad summary stats
  const summaryStats = useMemo(() => {
    const completedCalls = squadCalls.filter(c => c.call_outcome === 'completed').length;
    const avgDuration = squadCalls.length > 0 
      ? Math.round(squadCalls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / squadCalls.length)
      : 0;
    
    return {
      totalSquadCalls: squadCalls.length,
      completedCalls,
      successRate: squadCalls.length > 0 ? Math.round((completedCalls / squadCalls.length) * 100) : 0,
      avgDuration,
    };
  }, [squadCalls]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return percent > 0.05 ? (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    ) : null;
  };

  if (squadCalls.length === 0) {
    return (
      <Card className={squadPanel}>
        <CardContent className="p-0">
          <CallStatePanel
            tone="purple"
            icon={<Users className="h-10 w-10" />}
            title="No Squad Calls Yet"
            description="Squad analytics will appear here once your Vapi Squads start handling calls. Squad calls involve multiple assistants working together."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className={squadPanel}>
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/60 to-transparent" />
        <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-purple-500/10 blur-3xl" />
        <CardHeader className="relative border-b border-border dark:border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.14),transparent_34%),linear-gradient(90deg,rgba(24,24,27,0.92),rgba(0,0,0,0.72),rgba(126,34,206,0.16))]">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100">
            <GitBranch className="h-3 w-3" />
            Squad Intelligence
          </div>
          <CardTitle className="mt-3 flex items-center gap-3 text-2xl text-foreground dark:text-zinc-50">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-purple-300/25 bg-purple-500/10 text-purple-200 shadow-inner shadow-purple-950/40">
              <Users className="h-5 w-5" />
            </span>
            Squad Performance Analytics
          </CardTitle>
          <CardDescription className="text-muted-foreground dark:text-zinc-400">
            Team-performance intelligence across squad calls, handoffs, intents, and assistant involvement
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className={cn(squadKpiCard, 'from-purple-500/15 via-card dark:via-zinc-950/85 to-background dark:to-black/95 hover:border-purple-300/35 hover:shadow-purple-500/10')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-purple-300/25 bg-purple-500/10 p-3 shadow-inner shadow-purple-950/40">
                <Users className="h-5 w-5 text-purple-300" />
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground dark:text-zinc-500">Squad Calls</p>
                <p className="text-3xl font-bold text-foreground dark:text-zinc-50">{summaryStats.totalSquadCalls}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={cn(squadKpiCard, 'from-emerald-500/15 via-card dark:via-zinc-950/85 to-background dark:to-black/95 hover:border-emerald-300/35 hover:shadow-emerald-500/10')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 p-3 shadow-inner shadow-emerald-950/40">
                <CheckCircle className="h-5 w-5 text-emerald-300" />
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground dark:text-zinc-500">Success Rate</p>
                <p className="text-3xl font-bold text-foreground dark:text-zinc-50">{summaryStats.successRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={cn(squadKpiCard, 'from-blue-500/15 via-card dark:via-zinc-950/85 to-background dark:to-black/95 hover:border-blue-300/35 hover:shadow-blue-500/10')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-blue-300/25 bg-blue-500/10 p-3 shadow-inner shadow-blue-950/40">
                <GitBranch className="h-5 w-5 text-blue-300" />
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground dark:text-zinc-500">Avg Handoffs</p>
                <p className="text-3xl font-bold text-foreground dark:text-zinc-50">{handoffStats.avgHandoffs}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={cn(squadKpiCard, 'from-amber-500/15 via-card dark:via-zinc-950/85 to-background dark:to-black/95')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-amber-300/25 bg-amber-500/10 p-3 shadow-inner shadow-amber-950/40">
                <Users className="h-5 w-5 text-amber-300" />
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground dark:text-zinc-500">Avg Agents/Call</p>
                <p className="text-3xl font-bold text-amber-200">{avgAgentsPerCall}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={cn(squadKpiCard, 'from-cyan-500/15 via-card dark:via-zinc-950/85 to-background dark:to-black/95 hover:border-cyan-300/35 hover:shadow-cyan-500/10')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-cyan-300/25 bg-cyan-500/10 p-3 shadow-inner shadow-cyan-950/40">
                <Clock className="h-5 w-5 text-cyan-300" />
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground dark:text-zinc-500">Avg Duration</p>
                <p className="text-3xl font-bold text-foreground dark:text-zinc-50">{formatDuration(summaryStats.avgDuration)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Intent Distribution */}
        <Card className={squadChartCard}>
          <CardHeader className="relative border-b border-border dark:border-white/10 bg-gradient-to-r from-purple-500/10 via-transparent to-amber-500/10">
            <CardTitle className="flex items-center gap-2 text-base text-foreground dark:text-zinc-50">
              <Target className="h-5 w-5 text-purple-300" />
              Call Intent Distribution
            </CardTitle>
            <CardDescription className="text-muted-foreground dark:text-zinc-400">Breakdown of caller intents (discovery, strategy, finance)</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            {intentData.length > 0 ? (
              <div className={squadChartShell}>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={intentData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={renderCustomizedLabel}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {intentData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={squadTooltipContentStyle} labelStyle={squadTooltipLabelStyle} />
                    <Legend wrapperStyle={{ color: '#d4d4d8', fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <CallStatePanel
                className="h-[300px] py-8"
                tone="purple"
                icon={<Target className="h-8 w-8" />}
                title="No intent data available"
                description="Intent charts populate once squad calls include intent labels."
              />
            )}
          </CardContent>
        </Card>

        {/* Success Rate by Intent */}
        <Card className={squadChartCard}>
          <CardHeader className="relative border-b border-border dark:border-white/10 bg-gradient-to-r from-emerald-500/10 via-transparent to-blue-500/10">
            <CardTitle className="flex items-center gap-2 text-base text-foreground dark:text-zinc-50">
              <TrendingUp className="h-5 w-5 text-emerald-300" />
              Success Rate by Intent
            </CardTitle>
            <CardDescription className="text-muted-foreground dark:text-zinc-400">Completion rates for each call intent type</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            {successByIntent.length > 0 ? (
              <div className={squadChartShell}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={successByIntent} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fill: 'rgba(161,161,170,0.78)', fontSize: 12 }}
                      tickLine={{ stroke: 'rgba(255,255,255,0.12)' }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
                    />
                    <YAxis
                      tick={{ fill: 'rgba(161,161,170,0.78)', fontSize: 12 }}
                      tickLine={{ stroke: 'rgba(255,255,255,0.12)' }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
                    />
                    <Tooltip contentStyle={squadTooltipContentStyle} labelStyle={squadTooltipLabelStyle} />
                    <Legend wrapperStyle={{ color: '#d4d4d8', fontSize: 12 }} />
                    <Bar dataKey="Total Calls" fill="#60a5fa" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="Completed" fill="#34d399" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <CallStatePanel
                className="h-[300px] py-8"
                tone="emerald"
                icon={<TrendingUp className="h-8 w-8" />}
                title="No success data available"
                description="Success-rate comparisons appear when squad calls include outcome values."
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Assistant Performance */}
      <Card className={squadChartCard}>
        <CardHeader className="relative border-b border-border dark:border-white/10 bg-gradient-to-r from-purple-500/10 via-transparent to-blue-500/10">
          <CardTitle className="flex items-center gap-2 text-base text-foreground dark:text-zinc-50">
            <Users className="h-5 w-5 text-purple-300" />
            Squad Assistant Performance
          </CardTitle>
          <CardDescription className="text-muted-foreground dark:text-zinc-400">Individual assistant involvement and completion rates in squad calls</CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          {assistantStats.length > 0 ? (
            <div className="space-y-3">
              {assistantStats.map((assistant, index) => {
                const successRate = assistant.count > 0 
                  ? Math.round((assistant.completed / assistant.count) * 100) 
                  : 0;
                return (
                  <div key={assistant.id} className="group flex items-center justify-between rounded-2xl border border-border dark:border-white/10 bg-white/[0.03] p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-amber-300/30 hover:bg-amber-300/[0.06] hover:shadow-lg hover:shadow-amber-500/10">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-purple-300/25 bg-purple-500/10 shadow-inner shadow-purple-950/40">
                        <span className="text-sm font-semibold text-purple-200">{index + 1}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground dark:text-zinc-100">{assistant.name}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground dark:text-zinc-500">{assistant.id.slice(0, 12)}...</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground dark:text-zinc-100">{assistant.count} calls</p>
                        <p className="text-xs text-muted-foreground dark:text-zinc-500">{assistant.completed} completed</p>
                      </div>
                      <Badge 
                        className={callLogBadgeTone(successRate >= 70 ? 'success' : successRate >= 40 ? 'warning' : 'danger')}
                      >
                        {successRate}%
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <CallStatePanel
              className="py-10"
              tone="neutral"
              icon={<Users className="h-8 w-8" />}
              title="No assistant data available"
              description="Assistant involvement appears here once squad call handoff metadata is available."
            />
          )}
        </CardContent>
      </Card>

      {/* Handoff Metrics */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className={cn(squadKpiCard, 'from-blue-500/15 via-card dark:via-zinc-950/85 to-background dark:to-black/95 hover:border-blue-300/35 hover:shadow-blue-500/10')}>
          <CardContent className="p-6">
            <div className="text-center">
              <GitBranch className="mx-auto mb-3 h-8 w-8 text-blue-300" />
              <p className="text-3xl font-bold text-foreground dark:text-zinc-50">{handoffStats.totalHandoffs}</p>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground dark:text-zinc-500">Total Handoffs</p>
            </div>
          </CardContent>
        </Card>
        <Card className={cn(squadKpiCard, 'from-emerald-500/15 via-card dark:via-zinc-950/85 to-background dark:to-black/95 hover:border-emerald-300/35 hover:shadow-emerald-500/10')}>
          <CardContent className="p-6">
            <div className="text-center">
              <TrendingUp className="mx-auto mb-3 h-8 w-8 text-emerald-300" />
              <p className="text-3xl font-bold text-foreground dark:text-zinc-50">{handoffStats.maxHandoffs}</p>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground dark:text-zinc-500">Max Handoffs (Single Call)</p>
            </div>
          </CardContent>
        </Card>
        <Card className={cn(squadKpiCard, 'from-purple-500/15 via-card dark:via-zinc-950/85 to-background dark:to-black/95 hover:border-purple-300/35 hover:shadow-purple-500/10')}>
          <CardContent className="p-6">
            <div className="text-center">
              <Users className="mx-auto mb-3 h-8 w-8 text-purple-300" />
              <p className="text-3xl font-bold text-foreground dark:text-zinc-50">{handoffStats.callsWithHandoffs}</p>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground dark:text-zinc-500">Calls With Handoffs</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
