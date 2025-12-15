import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, AreaChart, Area, BarChart, Bar } from 'recharts';
import { format, subDays, startOfDay, eachDayOfInterval, parseISO, isWithinInterval } from 'date-fns';
import { TrendingUp, TrendingDown, Clock, Phone, CheckCircle, Activity } from 'lucide-react';

interface CallLog {
  id: string;
  started_at: string | null;
  duration_seconds: number | null;
  call_outcome: string | null;
  sentiment: string | null;
  cost: number | null;
}

interface CallAnalyticsTrendsProps {
  calls: CallLog[];
}

const chartConfig = {
  callVolume: { label: 'Call Volume', color: 'hsl(var(--primary))' },
  avgDuration: { label: 'Avg Duration (min)', color: 'hsl(142.1 76.2% 36.3%)' },
  successRate: { label: 'Success Rate (%)', color: 'hsl(221.2 83.2% 53.3%)' },
  cost: { label: 'Cost ($)', color: 'hsl(45 93.4% 47.5%)' },
};

export const CallAnalyticsTrends = ({ calls }: CallAnalyticsTrendsProps) => {
  const [timeRange, setTimeRange] = useState<string>('7');

  const trendData = useMemo(() => {
    const days = parseInt(timeRange);
    const endDate = new Date();
    const startDate = subDays(endDate, days - 1);
    
    const interval = eachDayOfInterval({ start: startOfDay(startDate), end: startOfDay(endDate) });
    
    return interval.map(date => {
      const dayStart = startOfDay(date);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      
      const dayCalls = calls.filter(call => {
        if (!call.started_at) return false;
        const callDate = parseISO(call.started_at);
        return isWithinInterval(callDate, { start: dayStart, end: dayEnd });
      });
      
      const completedCalls = dayCalls.filter(c => c.call_outcome === 'completed').length;
      const totalDuration = dayCalls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0);
      const totalCost = dayCalls.reduce((sum, c) => sum + (c.cost || 0), 0);
      
      return {
        date: format(date, 'MMM dd'),
        fullDate: format(date, 'yyyy-MM-dd'),
        callVolume: dayCalls.length,
        avgDuration: dayCalls.length > 0 ? Math.round(totalDuration / dayCalls.length / 60 * 10) / 10 : 0,
        successRate: dayCalls.length > 0 ? Math.round((completedCalls / dayCalls.length) * 100) : 0,
        cost: Math.round(totalCost * 100) / 100,
        completed: completedCalls,
        failed: dayCalls.filter(c => c.call_outcome === 'failed').length,
        voicemail: dayCalls.filter(c => c.call_outcome === 'voicemail').length,
      };
    });
  }, [calls, timeRange]);

  const trends = useMemo(() => {
    if (trendData.length < 2) return { volume: 0, duration: 0, success: 0, cost: 0 };
    
    const midpoint = Math.floor(trendData.length / 2);
    const firstHalf = trendData.slice(0, midpoint);
    const secondHalf = trendData.slice(midpoint);
    
    const avgFirst = (arr: typeof trendData, key: keyof typeof trendData[0]) =>
      arr.reduce((sum, d) => sum + (d[key] as number), 0) / (arr.length || 1);
    const avgSecond = (arr: typeof trendData, key: keyof typeof trendData[0]) =>
      arr.reduce((sum, d) => sum + (d[key] as number), 0) / (arr.length || 1);
    
    const calcTrend = (first: number, second: number) => {
      if (first === 0) return second > 0 ? 100 : 0;
      return Math.round(((second - first) / first) * 100);
    };
    
    return {
      volume: calcTrend(avgFirst(firstHalf, 'callVolume'), avgSecond(secondHalf, 'callVolume')),
      duration: calcTrend(avgFirst(firstHalf, 'avgDuration'), avgSecond(secondHalf, 'avgDuration')),
      success: calcTrend(avgFirst(firstHalf, 'successRate'), avgSecond(secondHalf, 'successRate')),
      cost: calcTrend(avgFirst(firstHalf, 'cost'), avgSecond(secondHalf, 'cost')),
    };
  }, [trendData]);

  const TrendBadge = ({ value, inverse = false }: { value: number; inverse?: boolean }) => {
    const isPositive = inverse ? value < 0 : value > 0;
    const Icon = isPositive ? TrendingUp : TrendingDown;
    return (
      <Badge className={`${isPositive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'} gap-1`}>
        <Icon className="w-3 h-3" />
        {Math.abs(value)}%
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with time range selector */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Call Analytics Trends</h3>
          <p className="text-sm text-muted-foreground">Track call metrics over time</p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Time Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="60">Last 60 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Trend Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/5 to-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Phone className="w-4 h-4 text-primary" />
              </div>
              <TrendBadge value={trends.volume} />
            </div>
            <p className="text-2xl font-bold">{trendData.reduce((sum, d) => sum + d.callVolume, 0)}</p>
            <p className="text-xs text-muted-foreground">Total Calls</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/5 to-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Clock className="w-4 h-4 text-emerald-500" />
              </div>
              <TrendBadge value={trends.duration} />
            </div>
            <p className="text-2xl font-bold">
              {(trendData.reduce((sum, d) => sum + d.avgDuration, 0) / (trendData.length || 1)).toFixed(1)}m
            </p>
            <p className="text-xs text-muted-foreground">Avg Duration</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/5 to-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <CheckCircle className="w-4 h-4 text-blue-500" />
              </div>
              <TrendBadge value={trends.success} />
            </div>
            <p className="text-2xl font-bold">
              {Math.round(trendData.reduce((sum, d) => sum + d.successRate, 0) / (trendData.length || 1))}%
            </p>
            <p className="text-xs text-muted-foreground">Success Rate</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500/5 to-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Activity className="w-4 h-4 text-amber-500" />
              </div>
              <TrendBadge value={trends.cost} inverse />
            </div>
            <p className="text-2xl font-bold">
              ${trendData.reduce((sum, d) => sum + d.cost, 0).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">Total Cost</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Call Volume Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Call Volume</CardTitle>
            <CardDescription>Daily call count over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="callVolume"
                  stroke="hsl(var(--primary))"
                  fill="url(#volumeGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Success Rate Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Success Rate</CardTitle>
            <CardDescription>Daily completion percentage</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis domain={[0, 100]} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="successRate"
                  stroke="hsl(142.1 76.2% 36.3%)"
                  strokeWidth={2}
                  dot={{ fill: 'hsl(142.1 76.2% 36.3%)', strokeWidth: 0, r: 3 }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Average Duration Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Average Duration</CardTitle>
            <CardDescription>Call duration in minutes</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="avgDuration" fill="hsl(221.2 83.2% 53.3%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Call Outcomes Stacked */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Call Outcomes</CardTitle>
            <CardDescription>Daily breakdown by outcome type</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="completed" stackId="outcome" fill="hsl(142.1 76.2% 36.3%)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="voicemail" stackId="outcome" fill="hsl(45 93.4% 47.5%)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="failed" stackId="outcome" fill="hsl(0 84.2% 60.2%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
