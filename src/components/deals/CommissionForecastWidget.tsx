import { useMemo } from 'react';
import { format, addMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { DollarSign, TrendingUp } from 'lucide-react';
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

  const hasForecastValue = totalForecast > 0;

  return (
    <Card className="overflow-hidden rounded-[1.35rem] border-amber-300/20 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_30%),radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_34%),linear-gradient(145deg,rgba(39,39,42,0.94),rgba(9,9,11,0.88))] text-zinc-50 shadow-[0_24px_70px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.07)]">
      <CardHeader className="px-3 pb-2 pt-3 sm:px-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle className="flex items-start gap-2 text-sm font-semibold tracking-tight">
            <span className="mt-0.5 rounded-xl border border-amber-300/25 bg-amber-400/10 p-1.5 shadow-inner shadow-emerald-950/40">
              <DollarSign className="h-4 w-4 text-amber-200" />
            </span>
            <span>
              Commission Forecast
              <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-amber-100/60">Next 6 months</span>
            </span>
          </CardTitle>
          <Badge variant="outline" className="rounded-full border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-100 shadow-[0_0_26px_rgba(16,185,129,0.16)]">
            <TrendingUp className="mr-1 h-3 w-3" />
            {fmt(totalForecast)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 sm:px-4">
        <div className="relative rounded-2xl border border-white/10 bg-black/30 p-3 shadow-inner shadow-black/30">
          <div className="pointer-events-none absolute inset-x-3 top-3 bottom-10 flex flex-col justify-between">
            {[0, 1, 2].map(line => (
              <span key={line} className="border-t border-dashed border-white/[0.07]" />
            ))}
          </div>
          <div className="relative flex h-32 items-end gap-1.5 sm:h-40 sm:gap-2">
            {forecast.map((month, i) => {
              const height = month.amount > 0 ? Math.max((month.amount / maxAmount) * 100, 8) : 4;
              const isPeak = hasForecastValue && month.amount === maxAmount;
              return (
                <div key={i} className="group relative flex flex-1 flex-col items-center gap-1.5">
                  <span className={`min-h-4 text-[9px] font-semibold tabular-nums sm:text-[10px] ${month.amount > 0 ? 'text-emerald-100/85' : 'text-zinc-500'}`}>
                    {month.amount > 0 ? `$${(month.amount / 1000).toFixed(0)}k` : '$0'}
                  </span>
                  <div className="flex h-full w-full items-end">
                    <div
                      className={`w-full rounded-t-lg border transition-all duration-300 group-hover:brightness-125 ${
                        month.amount > 0
                          ? 'border-emerald-200/20 bg-gradient-to-t from-emerald-500/85 via-emerald-400/70 to-lime-200/80 shadow-[0_0_22px_rgba(16,185,129,0.22)]'
                          : 'border-white/10 bg-zinc-800/65 shadow-inner shadow-black/30'
                      } ${isPeak ? 'ring-1 ring-lime-200/60' : ''}`}
                      style={{ height: `${height}%` }}
                      title={`${month.label}: ${fmt(month.amount)} (${month.count} deals)`}
                    />
                  </div>
                  <div className="pointer-events-none absolute bottom-12 z-10 hidden min-w-32 -translate-y-2 rounded-xl border border-emerald-200/20 bg-zinc-950/95 px-3 py-2 text-center shadow-2xl shadow-black/40 group-hover:block">
                    <p className="text-[10px] font-semibold text-zinc-100">{month.label}</p>
                    <p className="text-xs font-bold text-emerald-200">{fmt(month.amount)}</p>
                    <p className="text-[10px] text-zinc-400">{month.count} deal{month.count === 1 ? '' : 's'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-300 sm:text-[11px]">{month.label.split(' ')[0]}</p>
                    <p className="text-[8px] text-zinc-500 sm:text-[9px]">{month.label.split(' ')[1]}</p>
                    <p className={`text-[8px] ${month.count > 0 ? 'text-emerald-200/70' : 'text-zinc-600'}`}>
                      {month.count} deal{month.count === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          {!hasForecastValue && (
            <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-400">
              No commission is currently forecast in this six-month window; zero-value bars remain visible for tracking.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
