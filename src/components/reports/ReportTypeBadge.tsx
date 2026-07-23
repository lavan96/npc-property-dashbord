import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { REPORT_VARIANT_LABELS, type ReportVariant } from '@/lib/reports/reportVariants';

const tones: Record<ReportVariant, string> = {
  compass: 'border-violet-400/45 bg-violet-500/15 text-violet-800 dark:text-violet-200',
  financial: 'border-emerald-400/45 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
  strategic: 'border-amber-400/45 bg-amber-500/15 text-amber-900 dark:text-amber-200',
  snapshot: 'border-teal-400/45 bg-teal-500/15 text-teal-800 dark:text-teal-200',
  briefing: 'border-cyan-400/45 bg-cyan-500/15 text-cyan-800 dark:text-cyan-200',
};

export function ReportTypeBadge({ type, className }: { type?: ReportVariant; className?: string }) {
  if (!type) return <Badge variant="outline" className={cn('text-xs', className)}>Report</Badge>;
  return <Badge variant="outline" className={cn('text-xs font-medium', tones[type], className)}>{REPORT_VARIANT_LABELS[type]}</Badge>;
}
