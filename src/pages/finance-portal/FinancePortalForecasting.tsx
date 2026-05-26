import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';
import {
  TrendingUp, AlertTriangle, Target, Calendar, ArrowRight, Save, DollarSign, Loader2,
} from 'lucide-react';
import { format } from 'date-fns';

const fmtMoney = (n: number) =>
  `$${Math.round(Number(n) || 0).toLocaleString('en-AU')}`;

const monthLabel = (ms: string) => {
  try { return format(new Date(`${ms}T00:00:00`), 'MMM yyyy'); } catch { return ms; }
};

const currentMonthStart = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
};

export default function FinancePortalForecasting() {
  const { invokeFinanceFunction } = useFinancePortalAuth();
  const [horizon, setHorizon] = useState<90 | 180 | 365>(180);
  const [forecast, setForecast] = useState<any>(null);
  const [clawback, setClawback] = useState<any>(null);
  const [goalProgress, setGoalProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [editingTarget, setEditingTarget] = useState(false);
  const [targetCount, setTargetCount] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [commissionTarget, setCommissionTarget] = useState('');
  const [goalNotes, setGoalNotes] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: f }, { data: c }, { data: g }] = await Promise.all([
      invokeFinanceFunction('finance-portal-forecasting', { operation: 'forecast', horizon_days: horizon }),
      invokeFinanceFunction('finance-portal-forecasting', { operation: 'clawback_radar' }),
      invokeFinanceFunction('finance-portal-forecasting', {
        operation: 'goal_progress',
        month_start: currentMonthStart(),
      }),
    ]);
    setForecast(f || null);
    setClawback(c || null);
    setGoalProgress(g || null);
    if (g?.goal) {
      setTargetCount(g.goal.settlement_target_count?.toString() || '');
      setTargetAmount(g.goal.settlement_target_amount?.toString() || '');
      setCommissionTarget(g.goal.commission_target_net?.toString() || '');
      setGoalNotes(g.goal.notes || '');
    }
    setLoading(false);
  }, [horizon, invokeFinanceFunction]);

  useEffect(() => { void load(); }, [load]);

  const chartData = useMemo(() => {
    return (forecast?.series || []).map((s: any) => ({
      month: monthLabel(s.month_start),
      Committed: s.committed_net,
      Projected: s.projected_net,
    }));
  }, [forecast]);

  const saveGoal = async () => {
    setSavingGoal(true);
    const { data, error } = await invokeFinanceFunction('finance-portal-forecasting', {
      operation: 'set_goal',
      month_start: currentMonthStart(),
      settlement_target_count: targetCount ? Number(targetCount) : null,
      settlement_target_amount: targetAmount ? Number(targetAmount) : null,
      commission_target_net: commissionTarget ? Number(commissionTarget) : null,
      notes: goalNotes || null,
    });
    setSavingGoal(false);
    if (error || data?.error) {
      toast.error(data?.error || 'Failed to save goal');
    } else {
      toast.success('Goal updated');
      setEditingTarget(false);
      void load();
    }
  };

  const urgencyTone = (u: string) =>
    u === 'critical' ? 'bg-destructive/10 text-destructive border-destructive/20'
    : u === 'high' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
    : u === 'medium' ? 'bg-primary/10 text-primary border-primary/20'
    : 'bg-muted text-muted-foreground border-border';

  // Goal progress numbers
  const goal = goalProgress?.goal;
  const actualCount = goalProgress?.actuals?.settlement_count ?? 0;
  const targetCnt = goal?.settlement_target_count ?? 0;
  const ringPct = targetCnt > 0 ? Math.min(100, Math.round((actualCount / targetCnt) * 100)) : 0;

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" /> Forecasting & Earnings
          </h1>
          <p className="text-sm text-muted-foreground">
            Projected pipeline, clawback exposure, and goal tracking — partner-scoped.
          </p>
        </div>
        <div className="flex gap-1 bg-muted/40 p-1 rounded-lg">
          {[90, 180, 365].map((h) => (
            <Button
              key={h}
              size="sm"
              variant={horizon === h ? 'default' : 'ghost'}
              onClick={() => setHorizon(h as any)}
            >
              {h}d
            </Button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="forecast" className="space-y-4">
        <TabsList>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
          <TabsTrigger value="clawback">
            Clawback radar
            {clawback?.totals?.count > 0 && (
              <Badge variant="outline" className="ml-2 bg-destructive/10 text-destructive border-destructive/20 text-[10px]">
                {clawback.totals.count}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="goal">Goal tracker</TabsTrigger>
        </TabsList>

        {/* FORECAST ─────────────────────────────────────────── */}
        <TabsContent value="forecast" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Committed (net)</p>
                <p className="text-2xl font-bold mt-1 tabular-nums">{fmtMoney(forecast?.summary?.total_committed_net || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Projected (net)</p>
                <p className="text-2xl font-bold mt-1 tabular-nums text-primary">{fmtMoney(forecast?.summary?.total_projected_net || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total horizon</p>
                <p className="text-2xl font-bold mt-1 tabular-nums">
                  {fmtMoney((forecast?.summary?.total_committed_net || 0) + (forecast?.summary?.total_projected_net || 0))}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Months in view</p>
                <p className="text-2xl font-bold mt-1 tabular-nums">{forecast?.series?.length || 0}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" /> Monthly inflow
              </CardTitle>
              <CardDescription className="text-xs">
                Committed = ledger entries already invoiced/pending. Projected = settlement-date estimates at {(forecast?.assumptions?.default_upfront_rate || 0) * 100}% upfront × {(forecast?.assumptions?.default_net_ratio || 0) * 100}% net.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              {loading ? (
                <Skeleton className="h-full w-full" />
              ) : chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  No forecastable commission inside this horizon.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v: any) => fmtMoney(v)}
                      contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Committed" stackId="a" fill="hsl(var(--success))" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Projected" stackId="a" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Drill-through</CardTitle>
              <CardDescription className="text-xs">Purchase files feeding each projected bar</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64">
                <div className="space-y-2">
                  {(forecast?.series || []).map((s: any) => (
                    <div key={s.month_start} className="border border-border/60 rounded-md p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">{monthLabel(s.month_start)}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {fmtMoney(s.committed_net + s.projected_net)} net
                        </span>
                      </div>
                      <div className="flex gap-2 flex-wrap text-[11px] text-muted-foreground">
                        <span>{s.ledger_ids.length} committed line(s)</span>
                        <span>·</span>
                        <span>{s.purchase_file_ids.length} projected file(s)</span>
                        {s.purchase_file_ids.length > 0 && (
                          <Link
                            to="/finance/purchase-files"
                            className="text-primary hover:underline ml-auto inline-flex items-center gap-1"
                          >
                            View files <ArrowRight className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CLAWBACK ─────────────────────────────────────────── */}
        <TabsContent value="clawback" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wide text-destructive">Amount at risk</p>
                <p className="text-2xl font-bold mt-1 tabular-nums">{fmtMoney(clawback?.totals?.amount_at_risk || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Active clawback deals</p>
                <p className="text-2xl font-bold mt-1 tabular-nums">{clawback?.totals?.count || 0}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" /> Deals approaching clawback expiry
              </CardTitle>
              <CardDescription className="text-xs">
                Sorted by days remaining. Trigger a retention play before the window closes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-32 w-full" />
              ) : (clawback?.deals || []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No active clawback risk.</p>
              ) : (
                <ScrollArea className="max-h-96">
                  <div className="space-y-2">
                    {(clawback.deals || []).map((d: any) => (
                      <div key={d.deal_id} className="border border-border/60 rounded-md p-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              to={`/finance/clients/${d.client_id}`}
                              className="font-medium text-sm hover:text-primary"
                            >
                              {d.client_name}
                            </Link>
                            {d.lender && <Badge variant="outline" className="text-[10px]">{d.lender}</Badge>}
                            <Badge variant="outline" className={`text-[10px] ${urgencyTone(d.urgency)}`}>
                              {d.days_to_expiry != null ? `${d.days_to_expiry}d left` : 'no expiry set'}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            Loan {fmtMoney(d.loan_amount || 0)} · At risk <span className="text-destructive font-semibold">{fmtMoney(d.amount_at_risk)}</span>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {(d.retention_plays || []).slice(0, 2).map((p: any) => (
                            <Button
                              key={p.id}
                              size="sm"
                              variant="outline"
                              className="text-[10px] h-7"
                              onClick={() => toast.info(`Retention play: ${p.label} — open the client to draft.`)}
                            >
                              {p.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* GOAL ─────────────────────────────────────────── */}
        <TabsContent value="goal" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" /> Settlements this month
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <div className="relative w-40 h-40">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle cx="50" cy="50" r="42" stroke="hsl(var(--muted))" strokeWidth="10" fill="none" />
                    <circle
                      cx="50" cy="50" r="42"
                      stroke="hsl(var(--primary))" strokeWidth="10" fill="none"
                      strokeDasharray={`${(ringPct / 100) * 2 * Math.PI * 42} ${2 * Math.PI * 42}`}
                      strokeLinecap="round"
                      className="transition-all duration-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold tabular-nums">{actualCount}</span>
                    <span className="text-xs text-muted-foreground">/ {targetCnt || '—'} target</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  3-mo avg: <span className="font-semibold text-foreground">{goalProgress?.last_3_months_avg_settlements ?? 0}</span> per month
                </p>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" /> {monthLabel(currentMonthStart())} target
                  </CardTitle>
                  <CardDescription className="text-xs">Set monthly goals to track variance.</CardDescription>
                </div>
                {!editingTarget && (
                  <Button size="sm" variant="outline" onClick={() => setEditingTarget(true)}>
                    {goal ? 'Edit target' : 'Set target'}
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {editingTarget ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Settlement count</Label>
                        <Input type="number" value={targetCount} onChange={(e) => setTargetCount(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Settlement $ amount</Label>
                        <Input type="number" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Net commission $</Label>
                        <Input type="number" value={commissionTarget} onChange={(e) => setCommissionTarget(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Notes</Label>
                      <Textarea value={goalNotes} onChange={(e) => setGoalNotes(e.target.value)} rows={2} />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveGoal} disabled={savingGoal}>
                        {savingGoal ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                        Save target
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingTarget(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <StatTile label="Settlement count" actual={actualCount} target={goal?.settlement_target_count} />
                    <StatTile
                      label="Settlement amount"
                      actual={goalProgress?.actuals?.settlement_amount ?? 0}
                      target={goal?.settlement_target_amount}
                      format="money"
                    />
                    <StatTile
                      label="Net commission"
                      actual={goalProgress?.actuals?.commission_net ?? 0}
                      target={goal?.commission_target_net}
                      format="money"
                    />
                    {goal?.notes && (
                      <div className="md:col-span-3 text-xs text-muted-foreground border-t border-border/40 pt-2">
                        {goal.notes}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatTile({
  label, actual, target, format = 'count',
}: { label: string; actual: number; target?: number | null; format?: 'count' | 'money' }) {
  const fmt = (n: number) => format === 'money' ? fmtMoney(n) : String(n);
  const pct = target && target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : null;
  return (
    <div className="rounded-md border border-border/60 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums">{fmt(actual)}</p>
      <p className="text-xs text-muted-foreground">
        of {target ? fmt(target) : '—'}
        {pct != null && <span className="ml-1 text-primary">({pct}%)</span>}
      </p>
    </div>
  );
}
