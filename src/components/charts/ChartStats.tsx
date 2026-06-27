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
    { label: 'Total Charts', value: charts.length, icon: BarChart3, color: 'text-blue-500' },
    { label: 'Chart Types', value: Object.keys(typeBreakdown).length, icon: PieChart, color: 'text-emerald-500' },
    { label: 'Linked Reports', value: uniqueReports, icon: FileText, color: 'text-violet-500' },
    { label: 'Most Common', value: dominantType ? `${dominantType[0]} (${dominantType[1]})` : '—', icon: TrendingUp, color: 'text-amber-500' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {stats.map(s => (
        <Card key={s.label} className="group overflow-hidden border-border/60 bg-card/80 shadow-xl shadow-black/10 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-primary/10">
          <CardContent className="relative flex items-center gap-3 p-4">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background/70 shadow-inner ${s.color}`}>
              <s.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{s.label}</p>
              <p className="truncate text-xl font-bold leading-tight capitalize text-foreground">{s.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
