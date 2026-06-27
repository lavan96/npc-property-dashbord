import { Card, CardContent } from '@/components/ui/card';
import { BarChart3, PieChart, TrendingUp, FileText } from 'lucide-react';
import type { ChartData } from './ChartCard';

interface ChartStatsProps {
  charts: ChartData[];
}

export function ChartStats({ charts }: ChartStatsProps) {
  const typeBreakdown = charts.reduce<Record<string, number>>((acc, c) => {
    acc[c.chart_type] = (acc[c.chart_type] || 0) + 1;
    return acc;
  }, {});

  const uniqueReports = new Set(charts.map(c => c.report_id).filter(Boolean)).size;
  const dominantType = Object.entries(typeBreakdown).sort((a, b) => b[1] - a[1])[0];

  const stats = [
    {
      label: 'Total Charts',
      value: charts.length,
      icon: BarChart3,
      color: 'text-blue-300',
      iconChrome: 'from-blue-400/25 via-blue-500/10 to-primary/10 ring-blue-300/25',
      edge: 'from-blue-300/0 via-blue-300/70 to-blue-300/0',
    },
    {
      label: 'Chart Types',
      value: Object.keys(typeBreakdown).length,
      icon: PieChart,
      color: 'text-emerald-300',
      iconChrome: 'from-emerald-400/25 via-emerald-500/10 to-primary/10 ring-emerald-300/25',
      edge: 'from-emerald-300/0 via-emerald-300/70 to-emerald-300/0',
    },
    {
      label: 'Linked Reports',
      value: uniqueReports,
      icon: FileText,
      color: 'text-violet-300',
      iconChrome: 'from-violet-400/25 via-violet-500/10 to-primary/10 ring-violet-300/25',
      edge: 'from-violet-300/0 via-violet-300/70 to-violet-300/0',
      connected: true,
    },
    {
      label: 'Most Common',
      value: dominantType ? `${dominantType[0]} (${dominantType[1]})` : '—',
      icon: TrendingUp,
      color: 'text-amber-200',
      iconChrome: 'from-amber-300/35 via-primary/15 to-amber-600/10 ring-amber-200/35',
      edge: 'from-amber-300/0 via-amber-200/90 to-amber-300/0',
      insight: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map(s => (
        <Card
          key={s.label}
          className={`dashboard-theme-premium-card group relative overflow-hidden rounded-3xl border-border/70 bg-gradient-to-br ${s.insight ? 'from-primary/16 via-card/95 to-amber-950/10 border-primary/25' : 'from-card/95 via-card/90 to-slate-950/5'} shadow-xl shadow-black/10 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-primary/45 hover:ring-1 hover:ring-primary/20 hover:shadow-[0_24px_70px_hsl(var(--primary)/0.16)] dark:border-white/10 dark:bg-slate-950/80 dark:shadow-black/25`}
        >
          <div className={`pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r ${s.edge} opacity-70 transition-opacity duration-300 group-hover:opacity-100`} />
          <div className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-primary/10 blur-3xl transition-opacity duration-300 group-hover:opacity-80" />
          <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-amber-200/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

          <CardContent className="relative flex min-h-[150px] flex-col justify-between gap-5 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <p className="truncate text-[11px] font-bold uppercase leading-none tracking-[0.22em] text-muted-foreground/90">
                  {s.label}
                </p>
                <div className="h-px w-12 bg-gradient-to-r from-amber-300/70 via-amber-100/25 to-transparent" />
              </div>
              <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br ${s.iconChrome} shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_14px_32px_rgba(0,0,0,0.16)] ring-1 ${s.color}`}>
                {s.connected && (
                  <span className="absolute -left-2 top-1/2 h-px w-2 bg-gradient-to-l from-violet-300/70 to-transparent" />
                )}
                <s.icon className="h-5 w-5 drop-shadow-sm" />
              </div>
            </div>

            <div className="space-y-2">
              <p className={`${s.insight ? 'text-2xl sm:text-[1.7rem]' : 'text-3xl'} truncate font-black leading-none tracking-tight text-foreground drop-shadow-sm`}>
                {s.value}
              </p>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/75">
                <span className={`h-1.5 w-1.5 rounded-full ${s.insight ? 'bg-amber-300 shadow-[0_0_16px_rgba(252,211,77,0.75)]' : s.connected ? 'bg-violet-300 shadow-[0_0_14px_rgba(196,181,253,0.55)]' : 'bg-primary/70'}`} />
                <span>{s.insight ? 'Insight metric' : s.connected ? 'Connected data' : 'Analytics metric'}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
