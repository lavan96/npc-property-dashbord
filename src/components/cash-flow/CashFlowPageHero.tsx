import { Calculator, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface CashFlowPageHeroProps {
  dateRangeLabel: string;
  totalReports: number;
  readyReports: number;
}

export function CashFlowPageHero({ dateRangeLabel, totalReports, readyReports }: CashFlowPageHeroProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-slate-950 via-slate-900 to-primary/90 p-6 text-white shadow-xl md:p-8">
      <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_40%)]" />
      <div className="relative grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            Cash Flow Intelligence Workspace
          </div>
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight md:text-5xl">
              <span className="rounded-2xl bg-white/10 p-2 shadow-inner">
                <Calculator className="h-7 w-7 md:h-9 md:w-9" />
              </span>
              Cash Flow Analysis
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75 md:text-base">
              Review investment-ready reports, open 10-year projections, and publish client-ready cash-flow analysis from one premium workspace.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <HeroMetric icon={TrendingUp} label="Ready reports" value={readyReports.toLocaleString()} />
          <HeroMetric icon={ShieldCheck} label="Loaded library" value={totalReports.toLocaleString()} />
          <HeroMetric icon={Calculator} label="Window" value={dateRangeLabel} />
        </div>
      </div>
    </div>
  );
}

function HeroMetric({ icon: Icon, label, value }: { icon: typeof Calculator; label: string; value: string }) {
  return (
    <Card className="border-white/15 bg-white/10 text-white shadow-none backdrop-blur">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-xl bg-white/15 p-2">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-white/65">{label}</p>
          <p className="text-sm font-semibold capitalize">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
