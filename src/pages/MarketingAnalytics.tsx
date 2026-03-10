import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, TrendingUp, TrendingDown, DollarSign, Eye, MousePointerClick, Target, RefreshCw, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';

const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7d', label: 'Last 7 Days' },
  { value: 'last_14d', label: 'Last 14 Days' },
  { value: 'last_30d', label: 'Last 30 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_90d', label: 'Last 90 Days' },
];

function formatCurrency(val: string | number | undefined) {
  if (!val) return '$0.00';
  return `$${Number(val).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(val: string | number | undefined) {
  if (!val) return '0';
  return Number(val).toLocaleString('en-AU');
}

function formatPercent(val: string | number | undefined) {
  if (!val) return '0.00%';
  return `${Number(val).toFixed(2)}%`;
}

function extractAction(actions: any[] | undefined, type: string): number {
  if (!actions) return 0;
  const action = actions.find((a: any) => a.action_type === type);
  return action ? Number(action.value) : 0;
}

function extractCostPerAction(costPerActions: any[] | undefined, type: string): number {
  if (!costPerActions) return 0;
  const cpa = costPerActions.find((a: any) => a.action_type === type);
  return cpa ? Number(cpa.value) : 0;
}

export default function MarketingAnalytics() {
  const [datePreset, setDatePreset] = useState('last_30d');
  const [level, setLevel] = useState<'account' | 'campaign' | 'adset'>('campaign');

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['meta-ads', level, datePreset],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('fetch-meta-ads', {
        level,
        datePreset,
        limit: 50,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const insights = data?.insights || [];
  const campaigns = data?.campaigns || [];

  // Calculate account-level totals from insights
  const totals = insights.reduce((acc: any, row: any) => {
    acc.spend += Number(row.spend || 0);
    acc.impressions += Number(row.impressions || 0);
    acc.clicks += Number(row.clicks || 0);
    acc.reach += Number(row.reach || 0);
    acc.leads += extractAction(row.actions, 'lead');
    acc.purchases += extractAction(row.actions, 'purchase');
    return acc;
  }, { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, purchases: 0 });

  totals.ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  totals.cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  totals.cpl = totals.leads > 0 ? totals.spend / totals.leads : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Marketing Analytics</h1>
          <p className="text-muted-foreground text-sm">Meta Ads performance insights</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={datePreset} onValueChange={setDatePreset}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard icon={<DollarSign className="h-4 w-4" />} label="Total Spend" value={formatCurrency(totals.spend)} loading={isLoading} />
        <KPICard icon={<Eye className="h-4 w-4" />} label="Impressions" value={formatNumber(totals.impressions)} loading={isLoading} />
        <KPICard icon={<MousePointerClick className="h-4 w-4" />} label="Clicks" value={formatNumber(totals.clicks)} loading={isLoading} />
        <KPICard icon={<TrendingUp className="h-4 w-4" />} label="CTR" value={formatPercent(totals.ctr)} loading={isLoading} />
        <KPICard icon={<DollarSign className="h-4 w-4" />} label="Avg CPC" value={formatCurrency(totals.cpc)} loading={isLoading} />
        <KPICard icon={<Target className="h-4 w-4" />} label="Leads" value={formatNumber(totals.leads)} loading={isLoading} />
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Performance Breakdown
              </CardTitle>
              <CardDescription>
                {insights.length} {level === 'campaign' ? 'campaigns' : level === 'adset' ? 'ad sets' : 'results'}
              </CardDescription>
            </div>
            <Tabs value={level} onValueChange={(v) => setLevel(v as any)}>
              <TabsList>
                <TabsTrigger value="account">Account</TabsTrigger>
                <TabsTrigger value="campaign">Campaigns</TabsTrigger>
                <TabsTrigger value="adset">Ad Sets</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-12 text-destructive">
              <p className="font-medium">Failed to load Meta Ads data</p>
              <p className="text-sm mt-1">{(error as Error).message}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
                Try Again
              </Button>
            </div>
          ) : insights.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No data found for this period</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {level === 'campaign' && <TableHead>Campaign</TableHead>}
                    {level === 'adset' && <TableHead>Ad Set</TableHead>}
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">CPC</TableHead>
                    <TableHead className="text-right">Reach</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">CPL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insights.map((row: any, i: number) => {
                    const leads = extractAction(row.actions, 'lead');
                    const cpl = leads > 0 ? Number(row.spend || 0) / leads : 0;
                    const campaign = campaigns?.find((c: any) => c.id === row.campaign_id);
                    return (
                      <TableRow key={row.campaign_id || row.adset_id || i}>
                        {level === 'campaign' && (
                          <TableCell className="font-medium max-w-[250px] truncate">
                            <div className="flex items-center gap-2">
                              <span>{row.campaign_name || 'Unknown'}</span>
                              {campaign?.status && (
                                <Badge variant={campaign.status === 'ACTIVE' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                                  {campaign.status}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                        )}
                        {level === 'adset' && (
                          <TableCell className="font-medium max-w-[250px] truncate">
                            {row.adset_name || 'Unknown'}
                          </TableCell>
                        )}
                        <TableCell className="text-right font-mono">{formatCurrency(row.spend)}</TableCell>
                        <TableCell className="text-right font-mono">{formatNumber(row.impressions)}</TableCell>
                        <TableCell className="text-right font-mono">{formatNumber(row.clicks)}</TableCell>
                        <TableCell className="text-right font-mono">{formatPercent(row.ctr)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(row.cpc)}</TableCell>
                        <TableCell className="text-right font-mono">{formatNumber(row.reach)}</TableCell>
                        <TableCell className="text-right font-mono">{formatNumber(leads)}</TableCell>
                        <TableCell className="text-right font-mono">{cpl > 0 ? formatCurrency(cpl) : '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KPICard({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: string; loading: boolean }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs font-medium">{label}</span>
        </div>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-1" />
        ) : (
          <p className="text-lg font-bold text-foreground">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}
