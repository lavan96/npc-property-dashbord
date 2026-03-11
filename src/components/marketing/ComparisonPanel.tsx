import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { GitCompareArrows, X, Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';

interface ComparisonPanelProps {
  items: any[];
  level: 'campaign' | 'adset' | 'ad';
  onRemoveItem: (id: string) => void;
  onClear: () => void;
  formatCurrency: (val: string | number | undefined) => string;
  formatNumber: (val: string | number | undefined) => string;
  formatPercent: (val: string | number | undefined) => string;
  extractAction: (actions: any[] | undefined, type: string) => number;
}

const COMPARISON_COLORS = [
  'hsl(var(--primary))',
  'hsl(220, 70%, 55%)',
  'hsl(160, 60%, 45%)',
  'hsl(30, 80%, 55%)',
];

export function ComparisonPanel({
  items,
  level,
  onRemoveItem,
  onClear,
  formatCurrency,
  formatNumber,
  formatPercent,
  extractAction,
}: ComparisonPanelProps) {
  if (items.length < 2) return null;

  const getName = (item: any) => {
    if (level === 'campaign') return item.campaign_name || 'Unknown';
    if (level === 'adset') return item.adset_name || 'Unknown';
    return item.ad_name || 'Unknown';
  };

  const getId = (item: any) => {
    if (level === 'campaign') return item.campaign_id;
    if (level === 'adset') return item.adset_id;
    return item.ad_id;
  };

  const enriched = items.map(item => {
    const leads = extractAction(item.actions, 'lead');
    const spend = Number(item.spend || 0);
    return {
      ...item,
      _name: getName(item),
      _id: getId(item),
      _spend: spend,
      _impressions: Number(item.impressions || 0),
      _clicks: Number(item.clicks || 0),
      _ctr: Number(item.ctr || 0),
      _cpc: Number(item.cpc || 0),
      _reach: Number(item.reach || 0),
      _frequency: Number(item.frequency || 0),
      _leads: leads,
      _cpl: leads > 0 ? spend / leads : 0,
    };
  });

  const metrics = [
    { key: '_spend', label: 'Spend', format: formatCurrency, lowerIsBetter: true },
    { key: '_impressions', label: 'Impressions', format: formatNumber, lowerIsBetter: false },
    { key: '_clicks', label: 'Clicks', format: formatNumber, lowerIsBetter: false },
    { key: '_ctr', label: 'CTR', format: formatPercent, lowerIsBetter: false },
    { key: '_cpc', label: 'CPC', format: formatCurrency, lowerIsBetter: true },
    { key: '_reach', label: 'Reach', format: formatNumber, lowerIsBetter: false },
    { key: '_leads', label: 'Leads', format: formatNumber, lowerIsBetter: false },
    { key: '_cpl', label: 'Cost/Lead', format: formatCurrency, lowerIsBetter: true },
  ];

  // Find winner for each metric
  const getWinner = (key: string, lowerIsBetter: boolean) => {
    const vals = enriched.map(e => ({ id: e._id, val: (e as any)[key] })).filter(v => v.val > 0);
    if (vals.length === 0) return null;
    vals.sort((a, b) => lowerIsBetter ? a.val - b.val : b.val - a.val);
    return vals[0].id;
  };

  // Chart data for spend, clicks, leads
  const chartMetrics = ['_spend', '_clicks', '_leads', '_ctr'];
  const chartLabels: Record<string, string> = { _spend: 'Spend ($)', _clicks: 'Clicks', _leads: 'Leads', _ctr: 'CTR (%)' };
  
  const barChartData = chartMetrics.map(metric => {
    const obj: any = { metric: chartLabels[metric] };
    enriched.forEach((item, idx) => {
      obj[item._name] = (item as any)[metric];
    });
    return obj;
  });

  return (
    <Card className="border-primary/20 bg-primary/[0.01]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <GitCompareArrows className="h-5 w-5 text-primary" />
              Side-by-Side Comparison
            </CardTitle>
            <CardDescription className="mt-1">
              Comparing {enriched.length} {level === 'campaign' ? 'campaigns' : level === 'adset' ? 'ad sets' : 'ads'}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClear} className="text-xs text-muted-foreground">
            <X className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {enriched.map((item, idx) => (
            <Badge
              key={item._id}
              variant="outline"
              className="gap-1.5 pl-2 pr-1 py-1"
              style={{ borderColor: COMPARISON_COLORS[idx % COMPARISON_COLORS.length] }}
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: COMPARISON_COLORS[idx % COMPARISON_COLORS.length] }}
              />
              <span className="text-xs font-medium truncate max-w-[150px]">{item._name}</span>
              <button
                onClick={() => onRemoveItem(item._id)}
                className="ml-1 p-0.5 rounded hover:bg-muted transition-colors"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Bar Chart Comparison */}
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barChartData} layout="vertical" margin={{ left: 80, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis type="number" tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis dataKey="metric" type="category" tick={{ fontSize: 11 }} className="text-muted-foreground" width={75} />
              <RechartsTooltip
                contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {enriched.map((item, idx) => (
                <Bar
                  key={item._id}
                  dataKey={item._name}
                  fill={COMPARISON_COLORS[idx % COMPARISON_COLORS.length]}
                  radius={[0, 4, 4, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Metrics Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px]">Metric</TableHead>
                {enriched.map((item, idx) => (
                  <TableHead key={item._id} className="text-right min-w-[120px]">
                    <div className="flex items-center justify-end gap-1.5">
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: COMPARISON_COLORS[idx % COMPARISON_COLORS.length] }}
                      />
                      <span className="truncate max-w-[100px]">{item._name}</span>
                    </div>
                  </TableHead>
                ))}
                <TableHead className="text-center w-[80px]">Winner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.map(m => {
                const winnerId = getWinner(m.key, m.lowerIsBetter);
                return (
                  <TableRow key={m.key}>
                    <TableCell className="font-medium text-sm">{m.label}</TableCell>
                    {enriched.map(item => {
                      const val = (item as any)[m.key];
                      const isWinner = item._id === winnerId;
                      return (
                        <TableCell key={item._id} className={`text-right font-mono text-sm ${isWinner ? 'text-primary font-semibold' : ''}`}>
                          {val > 0 ? m.format(val) : '—'}
                          {isWinner && <Trophy className="h-3 w-3 inline ml-1 text-primary" />}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center">
                      {winnerId ? (
                        <span className="text-xs text-primary font-medium truncate max-w-[60px] inline-block">
                          {enriched.find(e => e._id === winnerId)?._name?.slice(0, 12)}
                        </span>
                      ) : (
                        <Minus className="h-3.5 w-3.5 text-muted-foreground mx-auto" />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
