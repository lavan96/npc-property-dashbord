import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Gauge, AlertTriangle, TrendingUp, Calendar } from 'lucide-react';
import { differenceInDays, parseISO, addDays, format } from 'date-fns';

interface SpendPacingPanelProps {
  campaigns: any[];
  insights: any[];
  datePreset: string;
  loading: boolean;
}

function formatCurrency(val: number) {
  return `$${val.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function getDateRangeDays(datePreset: string): number {
  switch (datePreset) {
    case 'today': return 1;
    case 'yesterday': return 1;
    case 'last_7d': return 7;
    case 'last_14d': return 14;
    case 'last_30d': return 30;
    case 'this_month': return new Date().getDate();
    case 'last_month': return 30;
    case 'last_90d': return 90;
    default: return 30;
  }
}

function getDaysLeftInMonth(): number {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return differenceInDays(lastDay, now);
}

export function SpendPacingPanel({ campaigns, insights, datePreset, loading }: SpendPacingPanelProps) {
  if (loading || !campaigns || campaigns.length === 0) return null;

  const rangeDays = getDateRangeDays(datePreset);
  const daysLeft = getDaysLeftInMonth();

  // Calculate pacing for each campaign with a budget
  const pacingData = campaigns
    .filter((c: any) => c.daily_budget || c.lifetime_budget)
    .map((campaign: any) => {
      const insight = insights.find((i: any) => i.campaign_id === campaign.id);
      const spent = insight ? Number(insight.spend || 0) : 0;

      const dailyBudget = campaign.daily_budget ? Number(campaign.daily_budget) / 100 : 0; // Meta returns cents
      const lifetimeBudget = campaign.lifetime_budget ? Number(campaign.lifetime_budget) / 100 : 0;

      let budget = 0;
      let budgetType = '';
      let expectedSpend = 0;

      if (dailyBudget > 0) {
        budget = dailyBudget * 30; // Monthly projection
        budgetType = 'daily';
        expectedSpend = dailyBudget * rangeDays;
      } else if (lifetimeBudget > 0) {
        budget = lifetimeBudget;
        budgetType = 'lifetime';
        // Calculate expected by looking at campaign duration
        const startDate = campaign.start_time ? parseISO(campaign.start_time) : new Date();
        const endDate = campaign.stop_time ? parseISO(campaign.stop_time) : addDays(new Date(), 30);
        const totalDays = Math.max(1, differenceInDays(endDate, startDate));
        const elapsedDays = Math.max(1, differenceInDays(new Date(), startDate));
        expectedSpend = (lifetimeBudget / totalDays) * Math.min(elapsedDays, totalDays);
      }

      const pacingPercent = expectedSpend > 0 ? (spent / expectedSpend) * 100 : 0;
      const dailyRate = rangeDays > 0 ? spent / rangeDays : 0;
      const projectedMonthly = dailyRate * 30;
      const projectedExhaustDate = budget > 0 && dailyRate > 0
        ? addDays(new Date(), Math.ceil((budget - spent) / dailyRate))
        : null;

      let status: 'on_track' | 'underspend' | 'overspend' = 'on_track';
      if (pacingPercent > 115) status = 'overspend';
      else if (pacingPercent < 75) status = 'underspend';

      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        budgetType,
        budget,
        dailyBudget,
        spent,
        expectedSpend,
        pacingPercent,
        dailyRate,
        projectedMonthly,
        projectedExhaustDate,
        pacingStatus: status,
      };
    })
    .filter((p: any) => p.budget > 0)
    .sort((a: any, b: any) => b.spent - a.spent);

  if (pacingData.length === 0) return null;

  const overSpending = pacingData.filter(p => p.pacingStatus === 'overspend').length;
  const underSpending = pacingData.filter(p => p.pacingStatus === 'underspend').length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" />
              Budget Pacing & Spend Rate
            </CardTitle>
            <CardDescription className="mt-1">
              Real-time budget consumption across campaigns · {daysLeft} days left this month
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {overSpending > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {overSpending} overspending
              </Badge>
            )}
            {underSpending > 0 && (
              <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px]">
                {underSpending} underspending
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {pacingData.map((pacing) => {
            const barWidth = Math.min(pacing.pacingPercent, 150);
            const barColor = pacing.pacingStatus === 'overspend'
              ? 'bg-red-500'
              : pacing.pacingStatus === 'underspend'
                ? 'bg-amber-500'
                : 'bg-emerald-500';

            return (
              <div key={pacing.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-foreground truncate max-w-[200px]">{pacing.name}</span>
                    <Badge variant="outline" className="text-[9px] shrink-0">
                      {pacing.budgetType === 'daily' ? `${formatCurrency(pacing.dailyBudget)}/day` : `${formatCurrency(pacing.budget)} lifetime`}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-mono font-semibold ${
                      pacing.pacingStatus === 'overspend' ? 'text-red-600 dark:text-red-400' :
                      pacing.pacingStatus === 'underspend' ? 'text-amber-600 dark:text-amber-400' :
                      'text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {pacing.pacingPercent.toFixed(0)}%
                    </span>
                    {pacing.pacingStatus === 'overspend' && (
                      <Tooltip>
                        <TooltipTrigger>
                          <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Spending faster than expected. Projected to exhaust budget early.
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="relative h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${Math.min(barWidth, 100)}%` }}
                  />
                  {/* Expected marker */}
                  <div
                    className="absolute inset-y-0 w-0.5 bg-foreground/30"
                    style={{ left: '100%' }}
                  />
                </div>

                {/* Details */}
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                  <span>Spent: <span className="font-mono text-foreground">{formatCurrency(pacing.spent)}</span></span>
                  <span>Daily rate: <span className="font-mono text-foreground">{formatCurrency(pacing.dailyRate)}</span>/day</span>
                  {pacing.projectedExhaustDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Exhausts: <span className="font-mono text-foreground">{format(pacing.projectedExhaustDate, 'MMM d')}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
