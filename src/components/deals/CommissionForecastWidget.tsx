import { useMemo } from 'react';
import { format, addMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DealWithClient } from '@/hooks/useAllDeals';

interface Props {
  deals: DealWithClient[];
}

export function CommissionForecastWidget({ deals }: Props) {
  const forecast = useMemo(() => {
    const now = new Date();
    const months: { label: string; start: Date; end: Date; amount: number; count: number }[] = [];

    for (let i = 0; i < 6; i++) {
      const month = addMonths(now, i);
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      months.push({
        label: format(month, 'MMM yyyy'),
        start,
        end,
        amount: 0,
        count: 0,
      });
    }

    deals.forEach(deal => {
      if (!deal.settlement_date || !deal.commission_estimate) return;
      const settlementDate = new Date(deal.settlement_date);
      const month = months.find(m => isWithinInterval(settlementDate, { start: m.start, end: m.end }));
      if (month) {
        month.amount += deal.commission_estimate;
        month.count++;
      }
    });

    return months;
  }, [deals]);

  const maxAmount = Math.max(...forecast.map(m => m.amount), 1);
  const totalForecast = forecast.reduce((s, m) => s + m.amount, 0);

  const fmt = (v: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(v);

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-3 sm:px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <DollarSign className="h-4 w-4 text-green-600" />
          Commission Forecast (6 Months)
          <Badge variant="outline" className="text-[10px] ml-auto">{fmt(totalForecast)}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-4 pb-3">
        <div className="flex items-end gap-1.5 sm:gap-2 h-28 sm:h-36">
          {forecast.map((month, i) => {
            const height = month.amount > 0 ? Math.max((month.amount / maxAmount) * 100, 8) : 4;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                {month.amount > 0 && (
                  <span className="text-[9px] sm:text-[10px] font-mono text-muted-foreground">
                    ${(month.amount / 1000).toFixed(0)}k
                  </span>
                )}
                <div
                  className={`w-full rounded-t transition-all ${
                    month.amount > 0 ? 'bg-green-500/70' : 'bg-muted'
                  }`}
                  style={{ height: `${height}%` }}
                  title={`${month.label}: ${fmt(month.amount)} (${month.count} deals)`}
                />
                <div className="text-center">
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight">{month.label.split(' ')[0]}</p>
                  {month.count > 0 && (
                    <p className="text-[8px] text-muted-foreground">{month.count} deal{month.count > 1 ? 's' : ''}</p>
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
