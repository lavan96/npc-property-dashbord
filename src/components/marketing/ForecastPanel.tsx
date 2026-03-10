import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, TrendingUp, TrendingDown, Minus, Brain, AlertTriangle, DollarSign, Target, BarChart3 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';

interface ForecastPoint {
  date: string;
  spend: number;
  leads: number;
  cpl: number;
  impressions: number;
  confidence: number;
}

interface ForecastPanelProps {
  forecast: ForecastPoint[];
  trends: {
    spend_trend: string;
    lead_trend: string;
    cpl_trend: string;
    efficiency_trend: string;
  } | null;
  projections: {
    projected_spend: number;
    projected_leads: number;
    projected_cpl: number;
    spend_range: [number, number];
    leads_range: [number, number];
  } | null;
  aiAnalysis: string;
  aiError?: string;
  loading: boolean;
  horizonDays: number;
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'increasing' || trend === 'improving') return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
  if (trend === 'decreasing' || trend === 'worsening') return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function TrendBadge({ label, trend }: { label: string; trend: string }) {
  const colorClass = (trend === 'improving' || (trend === 'increasing' && (label === 'Leads')))
    ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'
    : (trend === 'worsening' || (trend === 'decreasing' && label === 'Leads') || (trend === 'increasing' && label === 'Spend'))
      ? 'border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5'
      : 'border-muted-foreground/30 text-muted-foreground bg-muted/30';

  return (
    <Badge variant="outline" className={`text-[10px] px-2 py-0.5 gap-1 ${colorClass}`}>
      <TrendIcon trend={trend} />
      {label}: {trend}
    </Badge>
  );
}

function formatCurrency(val: number) {
  return `$${val.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
}

export function ForecastPanel({ forecast, trends, projections, aiAnalysis, aiError, loading, horizonDays }: ForecastPanelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Performance Forecast
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Building forecast model...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!forecast || forecast.length === 0) return null;

  // Prepare chart data
  const chartData = forecast.map(f => ({
    date: formatShortDate(f.date),
    rawDate: f.date,
    spend: f.spend,
    leads: f.leads,
    cpl: f.cpl,
    confidence: Math.round(f.confidence * 100),
    spendUpper: Math.round(f.spend * 1.2 * 100) / 100,
    spendLower: Math.round(f.spend * 0.8 * 100) / 100,
    leadsUpper: Math.round(f.leads * 1.25 * 10) / 10,
    leadsLower: Math.round(f.leads * 0.75 * 10) / 10,
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Performance Forecast
              <Badge variant="secondary" className="text-[10px] font-mono">
                {horizonDays}d horizon
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              Time-series projections based on historical trends
            </CardDescription>
          </div>
          {trends && (
            <div className="flex flex-wrap gap-1.5">
              <TrendBadge label="Spend" trend={trends.spend_trend} />
              <TrendBadge label="Leads" trend={trends.lead_trend} />
              <TrendBadge label="CPL" trend={trends.cpl_trend} />
              <TrendBadge label="Efficiency" trend={trends.efficiency_trend} />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Projection Cards */}
        {projections && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                <DollarSign className="h-3.5 w-3.5" />
                <span className="text-[10px] font-medium uppercase tracking-wider">Projected Spend</span>
              </div>
              <p className="text-lg font-bold text-foreground font-mono">{formatCurrency(projections.projected_spend)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {formatCurrency(projections.spend_range[0])} – {formatCurrency(projections.spend_range[1])}
              </p>
            </div>
            <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                <Target className="h-3.5 w-3.5" />
                <span className="text-[10px] font-medium uppercase tracking-wider">Projected Leads</span>
              </div>
              <p className="text-lg font-bold text-primary font-mono">{projections.projected_leads.toFixed(1)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {projections.leads_range[0].toFixed(1)} – {projections.leads_range[1].toFixed(1)}
              </p>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                <BarChart3 className="h-3.5 w-3.5" />
                <span className="text-[10px] font-medium uppercase tracking-wider">Projected CPL</span>
              </div>
              <p className="text-lg font-bold text-foreground font-mono">{formatCurrency(projections.projected_cpl)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                over {horizonDays} days
              </p>
            </div>
          </div>
        )}

        {/* Charts */}
        <Tabs defaultValue="spend" className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="spend" className="text-xs">Spend Forecast</TabsTrigger>
            <TabsTrigger value="leads" className="text-xs">Leads Forecast</TabsTrigger>
            <TabsTrigger value="cpl" className="text-xs">CPL Forecast</TabsTrigger>
          </TabsList>

          <TabsContent value="spend" className="mt-3">
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" tickFormatter={(v) => `$${v}`} />
                  <RechartsTooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(value: number, name: string) => {
                      if (name === 'spend') return [`$${value.toFixed(2)}`, 'Projected Spend'];
                      if (name === 'spendUpper') return [`$${value.toFixed(2)}`, 'Upper Range'];
                      if (name === 'spendLower') return [`$${value.toFixed(2)}`, 'Lower Range'];
                      return [value, name];
                    }}
                  />
                  <Area type="monotone" dataKey="spendUpper" stroke="none" fill="hsl(var(--primary) / 0.08)" />
                  <Area type="monotone" dataKey="spendLower" stroke="none" fill="hsl(var(--background))" />
                  <Area type="monotone" dataKey="spend" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="leads" className="mt-3">
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <RechartsTooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(value: number, name: string) => {
                      if (name === 'leads') return [value.toFixed(1), 'Projected Leads'];
                      if (name === 'leadsUpper') return [value.toFixed(1), 'Upper Range'];
                      if (name === 'leadsLower') return [value.toFixed(1), 'Lower Range'];
                      return [value, name];
                    }}
                  />
                  <Area type="monotone" dataKey="leadsUpper" stroke="none" fill="hsl(142 76% 36% / 0.08)" />
                  <Area type="monotone" dataKey="leadsLower" stroke="none" fill="hsl(var(--background))" />
                  <Area type="monotone" dataKey="leads" stroke="hsl(142 76% 36%)" fill="hsl(142 76% 36% / 0.15)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="cpl" className="mt-3">
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" tickFormatter={(v) => `$${v}`} />
                  <RechartsTooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Projected CPL']}
                  />
                  <Area type="monotone" dataKey="cpl" stroke="hsl(38 92% 50%)" fill="hsl(38 92% 50% / 0.15)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>

        {/* AI Analysis */}
        {aiAnalysis && (
          <div className="rounded-lg border border-primary/20 bg-primary/[0.02] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">AI Forecast Analysis</span>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{aiAnalysis}</p>
          </div>
        )}

        {aiError && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-600 dark:text-amber-400">{aiError}</p>
          </div>
        )}

        {/* Confidence indicator */}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <div className="h-1.5 w-1.5 rounded-full bg-primary/60" />
          Forecast confidence decays with projection distance. Ranges show ±20-25% interval.
        </div>
      </CardContent>
    </Card>
  );
}
