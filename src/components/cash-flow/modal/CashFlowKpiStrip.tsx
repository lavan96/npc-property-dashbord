import { ArrowDownRight, ArrowUpRight, DollarSign, Home, Landmark, LineChart, TrendingUp, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface CashFlowKpiStripProps {
  baseFinancialData: any;
  projections: any[];
  formatCurrency: (value: number) => string;
}

export function CashFlowKpiStrip({ baseFinancialData, projections, formatCurrency }: CashFlowKpiStripProps) {
  const year10 = projections[10];
  const year10Value = year10?.propertyMarketValue || 0;
  const year10CashFlow = year10?.afterTaxCashFlowPA || 0;
  const year10Equity = year10?.equityInProperty || 0;
  const totalAfterTaxCashFlow = projections
    .filter((projection) => projection.year >= 1)
    .reduce((sum, projection) => sum + (projection.afterTaxCashFlowPA || 0), 0);

  return (
    <Card className="overflow-hidden border-slate-200/80 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white shadow-xl">
      <CardContent className="p-0">
        <div className="border-b border-white/10 bg-white/[0.06] px-4 py-4 md:px-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-amber-200">Executive KPI strip</p>
              <h3 className="text-lg font-semibold tracking-tight md:text-xl">10-year cash-flow snapshot</h3>
            </div>
            <p className="text-xs text-slate-300">All figures use the current projection values.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-px bg-white/10 min-[460px]:grid-cols-2 xl:grid-cols-6">
          <KpiTile
            icon={Home}
            label="Current Value"
            sublabel="Current market value"
            value={formatCurrency(baseFinancialData.marketValueNow)}
          />
          <KpiTile
            icon={Landmark}
            label="Purchase Price"
            sublabel="Original purchase basis"
            value={formatCurrency(baseFinancialData.purchasePrice)}
          />
          <KpiTile
            icon={TrendingUp}
            label="Year 10 Value"
            sublabel="Projected property value"
            value={projections.length > 0 ? formatCurrency(year10Value) : '-'}
            tone="positive"
          />
          <KpiTile
            icon={DollarSign}
            label="Year 10 After-Tax Cash Flow"
            sublabel="Annual year-10 position"
            value={projections.length > 0 ? formatCurrency(year10CashFlow) : '-'}
            tone={year10CashFlow < 0 ? 'negative' : 'positive'}
          />
          <KpiTile
            icon={Wallet}
            label="Year 10 Equity"
            sublabel="Projected ownership"
            value={projections.length > 0 ? formatCurrency(year10Equity) : '-'}
            tone="positive"
          />
          <KpiTile
            icon={LineChart}
            label="Total 10-Year After-Tax Cash Flow"
            sublabel="Cumulative years 1-10"
            value={projections.length > 0 ? formatCurrency(totalAfterTaxCashFlow) : '-'}
            tone={totalAfterTaxCashFlow < 0 ? 'negative' : 'positive'}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function KpiTile({ icon: Icon, label, sublabel, value, tone }: {
  icon: typeof Home;
  label: string;
  sublabel: string;
  value: string;
  tone?: 'positive' | 'negative';
}) {
  const isPositive = tone === 'positive';
  const isNegative = tone === 'negative';

  return (
    <div className="group min-h-[148px] bg-slate-950/45 p-4 transition-colors hover:bg-slate-900/80 md:min-h-[158px] md:p-5">
      <div className="mb-5 flex items-start justify-between gap-3">
        <span className="rounded-2xl bg-white/10 p-2 text-amber-100 shadow-sm ring-1 ring-white/10">
          <Icon className="h-4 w-4" />
        </span>
        {tone && (
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ring-1',
            isPositive && 'bg-emerald-400/10 text-emerald-200 ring-emerald-300/15',
            isNegative && 'bg-red-400/10 text-red-200 ring-red-300/15'
          )}>
            {isNegative ? <ArrowDownRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
            {isNegative ? 'Negative' : 'Positive'}
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className={cn(
          'break-words text-2xl font-bold tracking-tight text-white md:text-[1.65rem]',
          isPositive && 'text-emerald-200',
          isNegative && 'text-red-200'
        )}>
          {value}
        </p>
        <p className="text-xs leading-5 text-slate-400">{sublabel}</p>
      </div>
    </div>
  );
}
