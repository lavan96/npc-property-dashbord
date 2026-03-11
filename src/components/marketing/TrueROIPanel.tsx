import { useQuery } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, CircleDollarSign, TrendingUp, Target, Award, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, Cell } from 'recharts';

interface TrueROIPanelProps {
  insights: any[];
  datePreset: string;
}

function formatCurrency(val: number) {
  return `$${val.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCurrencyShort(val: number) {
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
  return `$${val.toFixed(0)}`;
}

function formatNum(val: number) {
  return val.toLocaleString('en-AU');
}

export function TrueROIPanel({ insights, datePreset }: TrueROIPanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['meta-ads-true-roi', datePreset, insights?.length],
    queryFn: async () => {
      if (!insights || insights.length === 0) return null;
      const { data, error } = await invokeSecureFunction('analyze-meta-ads-phase5', {
        action: 'true_roi',
        insights,
        datePreset,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!insights && insights.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const campaigns = data?.campaigns || [];
  const totals = data?.totals;

  // Chart data — top 6 campaigns by spend
  const chartData = campaigns.slice(0, 6).map((c: any) => ({
    name: c.campaign_name?.length > 18 ? c.campaign_name.slice(0, 18) + '…' : c.campaign_name,
    'Meta CPL': c.meta_cpl,
    'True CPL': c.true_cpl,
    'Cost/Deal': c.cost_per_deal,
  }));

  return (
    <Card className="border-primary/20 bg-primary/[0.01]">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <CircleDollarSign className="h-5 w-5 text-primary" />
          True ROI — Cost Per Acquisition
        </CardTitle>
        <CardDescription>Meta Ads spend cross-referenced with CRM pipeline outcomes</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Calculating true ROI...</span>
          </div>
        ) : !totals ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <CircleDollarSign className="h-10 w-10 mx-auto mb-2 opacity-30" />
            No data available to calculate ROI
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <ROIKPICard label="Total Spend" value={formatCurrency(totals.meta_spend)} icon={<CircleDollarSign className="h-3.5 w-3.5" />} />
              <ROIKPICard label="Meta CPL" value={totals.meta_cpl > 0 ? formatCurrency(totals.meta_cpl) : '—'} icon={<Target className="h-3.5 w-3.5" />} subtitle="Meta-reported" />
              <ROIKPICard label="True CPL" value={totals.true_cpl > 0 ? formatCurrency(totals.true_cpl) : '—'} icon={<Target className="h-3.5 w-3.5" />} subtitle="CRM-verified" accent />
              <ROIKPICard label="Cost/Deal" value={totals.cost_per_deal > 0 ? formatCurrency(totals.cost_per_deal) : '—'} icon={<TrendingUp className="h-3.5 w-3.5" />} accent />
              <ROIKPICard label="Deals Won" value={formatNum(totals.deals_settled)} icon={<Award className="h-3.5 w-3.5" />} />
              <ROIKPICard
                label="ROAS"
                value={totals.roas > 0 ? `${totals.roas.toFixed(1)}x` : '—'}
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                accent
                subtitle="Commission / Spend"
              />
            </div>

            {/* CPL Gap Alert */}
            {totals.meta_cpl > 0 && totals.true_cpl > 0 && totals.true_cpl > totals.meta_cpl * 1.3 && (
              <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">CPL Gap Detected</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Your True CPL ({formatCurrency(totals.true_cpl)}) is {((totals.true_cpl / totals.meta_cpl - 1) * 100).toFixed(0)}% higher than Meta's reported CPL ({formatCurrency(totals.meta_cpl)}). This suggests lead quality or attribution discrepancies worth investigating.
                  </p>
                </div>
              </div>
            )}

            {/* Chart */}
            {chartData.length > 0 && (
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ left: 10, right: 10, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrencyShort(v)} className="text-muted-foreground" />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Meta CPL" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="True CPL" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Cost/Deal" fill="hsl(160, 60%, 45%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Campaign Breakdown Table */}
            {campaigns.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Campaign</TableHead>
                      <TableHead className="text-right">Meta Spend</TableHead>
                      <TableHead className="text-right">Meta Leads</TableHead>
                      <TableHead className="text-right">Meta CPL</TableHead>
                      <TableHead className="text-right">CRM Leads</TableHead>
                      <TableHead className="text-right">True CPL</TableHead>
                      <TableHead className="text-right">Deals</TableHead>
                      <TableHead className="text-right">Cost/Deal</TableHead>
                      <TableHead className="text-right">Settled</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                      <TableHead className="text-right">ROAS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((c: any) => (
                      <TableRow key={c.campaign_id}>
                        <TableCell className="font-medium text-sm truncate max-w-[200px]">{c.campaign_name}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(c.meta_spend)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatNum(c.meta_leads)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{c.meta_cpl > 0 ? formatCurrency(c.meta_cpl) : '—'}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">{formatNum(c.attributed_leads)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-primary font-semibold">{c.true_cpl > 0 ? formatCurrency(c.true_cpl) : '—'}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatNum(c.deals_created)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{c.cost_per_deal > 0 ? formatCurrency(c.cost_per_deal) : '—'}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">{formatNum(c.deals_settled)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{c.total_commission > 0 ? formatCurrency(c.total_commission) : '—'}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {c.roas > 0 ? (
                            <Badge variant="outline" className={`text-[10px] font-mono ${c.roas >= 1 ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'border-red-500/30 text-red-600 dark:text-red-400'}`}>
                              {c.roas.toFixed(1)}x
                            </Badge>
                          ) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ROIKPICard({ label, value, icon, subtitle, accent }: { label: string; value: string; icon: React.ReactNode; subtitle?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 space-y-1 ${accent ? 'border-primary/20 bg-primary/[0.03]' : 'border-border'}`}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-lg font-bold font-mono ${accent ? 'text-primary' : 'text-foreground'}`}>{value}</p>
      {subtitle && <p className="text-[9px] text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
