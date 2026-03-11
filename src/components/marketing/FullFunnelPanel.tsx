import { useQuery } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Funnel, ArrowDown } from 'lucide-react';

function formatNum(val: number) {
  return val.toLocaleString('en-AU');
}

function formatPct(val: number, total: number) {
  if (total === 0) return '0%';
  return `${((val / total) * 100).toFixed(1)}%`;
}

export function FullFunnelPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['meta-ads-funnel'],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('analyze-meta-ads-phase5', {
        action: 'funnel',
      });
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const funnel = data?.funnel;
  const stages = funnel?.stages || [];
  const byCampaign = funnel?.byCampaign || [];
  const maxValue = stages.length > 0 ? stages[0].value : 1;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Funnel className="h-5 w-5 text-primary" />
          Full-Funnel Visualization
        </CardTitle>
        <CardDescription>Meta Ads → CRM Pipeline conversion funnel</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Building funnel...</span>
          </div>
        ) : stages.length === 0 || maxValue === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <Funnel className="h-10 w-10 mx-auto mb-2 opacity-30" />
            No attributed leads found. Ensure lead attribution is configured.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Funnel chart */}
            <div className="space-y-1">
              {stages.map((stage: any, idx: number) => {
                const widthPct = maxValue > 0 ? Math.max((stage.value / maxValue) * 100, 8) : 8;
                const conversionFromPrev = idx > 0 && stages[idx - 1].value > 0
                  ? ((stage.value / stages[idx - 1].value) * 100).toFixed(1)
                  : null;

                return (
                  <div key={stage.name} className="flex flex-col items-center">
                    {idx > 0 && (
                      <div className="flex items-center gap-2 py-1">
                        <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                        {conversionFromPrev && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {conversionFromPrev}% conversion
                          </span>
                        )}
                      </div>
                    )}
                    <div
                      className="relative rounded-md overflow-hidden transition-all duration-500 mx-auto"
                      style={{
                        width: `${widthPct}%`,
                        minWidth: '120px',
                        backgroundColor: stage.color,
                      }}
                    >
                      <div className="px-4 py-3 flex items-center justify-between">
                        <span className="text-sm font-medium text-white truncate">{stage.name}</span>
                        <span className="text-lg font-bold text-white font-mono">{formatNum(stage.value)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Overall conversion rate */}
            {stages.length >= 2 && stages[0].value > 0 && (
              <div className="flex items-center justify-center gap-3">
                <Badge variant="outline" className="text-xs gap-1">
                  Lead → Deal: <span className="font-mono font-semibold">{formatPct(stages[1].value, stages[0].value)}</span>
                </Badge>
                {stages[4]?.value > 0 && (
                  <Badge variant="outline" className="text-xs gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                    Lead → Settled: <span className="font-mono font-semibold">{formatPct(stages[4].value, stages[0].value)}</span>
                  </Badge>
                )}
              </div>
            )}

            {/* By Campaign Breakdown */}
            {byCampaign.length > 0 && (
              <div>
                <p className="text-sm font-medium text-foreground mb-2">By Campaign</p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[180px]">Campaign</TableHead>
                        <TableHead className="text-right">Leads</TableHead>
                        <TableHead className="text-right">Deals</TableHead>
                        <TableHead className="text-right">Qualified</TableHead>
                        <TableHead className="text-right">Approved</TableHead>
                        <TableHead className="text-right">Settled</TableHead>
                        <TableHead className="text-right">Conv. Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byCampaign.map((row: any) => (
                        <TableRow key={row.campaign_id}>
                          <TableCell className="font-medium text-sm truncate max-w-[200px]">{row.campaign_name}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatNum(row.leads)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatNum(row.deals)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatNum(row.qualified)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatNum(row.approved)}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">{formatNum(row.settled)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {row.leads > 0 ? formatPct(row.deals, row.leads) : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
