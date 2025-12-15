import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Users, GitBranch, Target, TrendingUp, CheckCircle, Clock } from 'lucide-react';

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
  strategy: '#8b5cf6',
  finance: '#10b981',
  unknown: '#6b7280',
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
      .map(([name, value]) => ({
        name: name.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        value,
        color: INTENT_COLORS[name.toLowerCase()] || INTENT_COLORS.unknown,
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
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Users className="w-16 h-16 mb-4 opacity-50" />
        <h3 className="text-lg font-medium mb-2">No Squad Calls Yet</h3>
        <p className="text-sm text-center max-w-md">
          Squad analytics will appear here once your Vapi Squads start handling calls.
          Squad calls involve multiple assistants working together.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-purple-500/20">
                <Users className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Squad Calls</p>
                <p className="text-2xl font-bold">{summaryStats.totalSquadCalls}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-emerald-500/20">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold">{summaryStats.successRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20">
                <GitBranch className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Handoffs</p>
                <p className="text-2xl font-bold">{handoffStats.avgHandoffs}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-amber-500/20">
                <Users className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Agents/Call</p>
                <p className="text-2xl font-bold">{avgAgentsPerCall}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-cyan-500/20">
                <Clock className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Duration</p>
                <p className="text-2xl font-bold">{formatDuration(summaryStats.avgDuration)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Intent Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Call Intent Distribution
            </CardTitle>
            <CardDescription>Breakdown of caller intents (discovery, strategy, finance)</CardDescription>
          </CardHeader>
          <CardContent>
            {intentData.length > 0 ? (
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
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                <p>No intent data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Success Rate by Intent */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Success Rate by Intent
            </CardTitle>
            <CardDescription>Completion rates for each call intent type</CardDescription>
          </CardHeader>
          <CardContent>
            {successByIntent.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={successByIntent} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend />
                  <Bar dataKey="Total Calls" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Completed" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                <p>No success data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Assistant Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Squad Assistant Performance
          </CardTitle>
          <CardDescription>Individual assistant involvement and completion rates in squad calls</CardDescription>
        </CardHeader>
        <CardContent>
          {assistantStats.length > 0 ? (
            <div className="space-y-3">
              {assistantStats.map((assistant, index) => {
                const successRate = assistant.count > 0 
                  ? Math.round((assistant.completed / assistant.count) * 100) 
                  : 0;
                return (
                  <div key={assistant.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                        <span className="text-purple-400 font-medium text-sm">{index + 1}</span>
                      </div>
                      <div>
                        <p className="font-medium">{assistant.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{assistant.id.slice(0, 12)}...</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium">{assistant.count} calls</p>
                        <p className="text-xs text-muted-foreground">{assistant.completed} completed</p>
                      </div>
                      <Badge 
                        className={
                          successRate >= 70 
                            ? 'bg-emerald-500/20 text-emerald-400' 
                            : successRate >= 40 
                              ? 'bg-amber-500/20 text-amber-400' 
                              : 'bg-red-500/20 text-red-400'
                        }
                      >
                        {successRate}%
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <p>No assistant data available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Handoff Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <GitBranch className="w-8 h-8 mx-auto mb-2 text-blue-400" />
              <p className="text-3xl font-bold">{handoffStats.totalHandoffs}</p>
              <p className="text-sm text-muted-foreground">Total Handoffs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
              <p className="text-3xl font-bold">{handoffStats.maxHandoffs}</p>
              <p className="text-sm text-muted-foreground">Max Handoffs (Single Call)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <Users className="w-8 h-8 mx-auto mb-2 text-purple-400" />
              <p className="text-3xl font-bold">{handoffStats.callsWithHandoffs}</p>
              <p className="text-sm text-muted-foreground">Calls With Handoffs</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
