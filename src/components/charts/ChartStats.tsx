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
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map(s => (
        <Card key={s.label} className="border-border/50">
          <CardContent className="p-3 flex items-center gap-3">
            <div className={`h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0 ${s.color}`}>
              <s.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground font-medium truncate">{s.label}</p>
              <p className="text-lg font-bold leading-tight capitalize truncate">{s.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
