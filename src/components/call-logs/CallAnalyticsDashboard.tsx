import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, Users, Smile, Frown, Meh, MessageSquare } from 'lucide-react';

interface CallLog {
  id: string;
  agent_id: string | null;
  agent_name: string | null;
  call_outcome: string | null;
  sentiment: string | null;
  duration_seconds: number | null;
  cost: number | null;
}

interface CallAnalyticsDashboardProps {
  calls: CallLog[];
}

const SENTIMENT_COLORS = {
  positive: '#10b981',
  neutral: '#6b7280',
  negative: '#ef4444',
  mixed: '#f59e0b',
};

const OUTCOME_COLORS = {
  completed: '#10b981',
  voicemail: '#f59e0b',
  'no-answer': '#f97316',
  busy: '#eab308',
  failed: '#ef4444',
  cancelled: '#6b7280',
};

export const CallAnalyticsDashboard = ({ calls }: CallAnalyticsDashboardProps) => {
  // Calculate sentiment distribution
  const sentimentData = useMemo(() => {
    const counts: Record<string, number> = { positive: 0, neutral: 0, negative: 0, mixed: 0 };
    calls.forEach(call => {
      if (call.sentiment && counts[call.sentiment] !== undefined) {
        counts[call.sentiment]++;
      }
    });
    return Object.entries(counts)
      .filter(([_, count]) => count > 0)
      .map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
        color: SENTIMENT_COLORS[name as keyof typeof SENTIMENT_COLORS],
      }));
  }, [calls]);

  // Calculate outcome distribution
  const outcomeData = useMemo(() => {
    const counts: Record<string, number> = {};
    calls.forEach(call => {
      const outcome = call.call_outcome || 'unknown';
      counts[outcome] = (counts[outcome] || 0) + 1;
    });
    return Object.entries(counts)
      .filter(([_, count]) => count > 0)
      .map(([name, value]) => ({
        name: name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        value,
        color: OUTCOME_COLORS[name as keyof typeof OUTCOME_COLORS] || '#6b7280',
      }));
  }, [calls]);

  // Calculate agent performance
  const agentPerformance = useMemo(() => {
    const agentStats: Record<string, { 
      name: string; 
      totalCalls: number; 
      completed: number; 
      avgDuration: number;
      totalDuration: number;
      totalCost: number;
      positive: number;
    }> = {};

    calls.forEach(call => {
      const agentId = call.agent_id || 'unknown';
      const agentName = call.agent_name || 'Unknown Agent';
      
      if (!agentStats[agentId]) {
        agentStats[agentId] = {
          name: agentName,
          totalCalls: 0,
          completed: 0,
          avgDuration: 0,
          totalDuration: 0,
          totalCost: 0,
          positive: 0,
        };
      }
      
      agentStats[agentId].totalCalls++;
      if (call.call_outcome === 'completed') agentStats[agentId].completed++;
      if (call.duration_seconds) agentStats[agentId].totalDuration += call.duration_seconds;
      if (call.cost) agentStats[agentId].totalCost += call.cost;
      if (call.sentiment === 'positive') agentStats[agentId].positive++;
    });

    return Object.entries(agentStats)
      .filter(([id]) => id !== 'unknown')
      .map(([_, stats]) => ({
        name: stats.name.length > 15 ? stats.name.substring(0, 15) + '...' : stats.name,
        fullName: stats.name,
        'Total Calls': stats.totalCalls,
        'Completed': stats.completed,
        'Success Rate': stats.totalCalls > 0 ? Math.round((stats.completed / stats.totalCalls) * 100) : 0,
        'Avg Duration': stats.totalCalls > 0 ? Math.round(stats.totalDuration / stats.totalCalls) : 0,
        'Positive Sentiment': stats.positive,
      }))
      .sort((a, b) => b['Total Calls'] - a['Total Calls']);
  }, [calls]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const callsWithSentiment = calls.filter(c => c.sentiment);
    const positiveCount = calls.filter(c => c.sentiment === 'positive').length;
    const completedCount = calls.filter(c => c.call_outcome === 'completed').length;
    
    return {
      sentimentScore: callsWithSentiment.length > 0 
        ? Math.round((positiveCount / callsWithSentiment.length) * 100) 
        : 0,
      successRate: calls.length > 0 
        ? Math.round((completedCount / calls.length) * 100) 
        : 0,
      uniqueAgents: new Set(calls.filter(c => c.agent_id).map(c => c.agent_id)).size,
      analyzedCalls: callsWithSentiment.length,
    };
  }, [calls]);

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

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-emerald-500/20">
                <Smile className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Positive Sentiment</p>
                <p className="text-2xl font-bold">{summaryStats.sentimentScore}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20">
                <TrendingUp className="w-5 h-5 text-blue-400" />
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
              <div className="p-2 rounded-full bg-purple-500/20">
                <Users className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Agents</p>
                <p className="text-2xl font-bold">{summaryStats.uniqueAgents}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-amber-500/20">
                <MessageSquare className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">AI Analyzed</p>
                <p className="text-2xl font-bold">{summaryStats.analyzedCalls}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sentiment Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smile className="w-5 h-5" />
              Sentiment Distribution
            </CardTitle>
            <CardDescription>Customer sentiment analysis across all calls</CardDescription>
          </CardHeader>
          <CardContent>
            {sentimentData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={sentimentData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderCustomizedLabel}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {sentimentData.map((entry, index) => (
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
                <div className="text-center">
                  <Meh className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No sentiment data available</p>
                  <p className="text-sm">AI analysis runs on completed calls</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Call Outcomes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Call Outcomes
            </CardTitle>
            <CardDescription>Distribution of call results</CardDescription>
          </CardHeader>
          <CardContent>
            {outcomeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={outcomeData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderCustomizedLabel}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {outcomeData.map((entry, index) => (
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
                <p>No call outcome data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Agent Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Agent Performance
          </CardTitle>
          <CardDescription>Comparison of agent metrics and success rates</CardDescription>
        </CardHeader>
        <CardContent>
          {agentPerformance.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={agentPerformance} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
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
                <Bar dataKey="Positive Sentiment" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[350px] text-muted-foreground">
              <div className="text-center">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No agent data available</p>
                <p className="text-sm">Calls need agent information to display here</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
