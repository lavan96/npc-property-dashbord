import { useState } from 'react';
import { ChevronDown, MapPin, Package } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { InvestmentReportCard } from './InvestmentReportCard';
import type { InvestmentReport } from './types';
import { getReportVariantLabel, normalizeReportVariant, REPORT_VARIANT_ORDER } from '@/lib/reports/reportVariants';
import type { ReportTier } from '@/components/reports/TierBadge';

type Props = Omit<React.ComponentProps<typeof InvestmentReportCard>, 'report' | 'isSelected' | 'generatingTier'> & { reports: InvestmentReport[]; isSelected: (id: string) => boolean; generatingTier: { reportId: string; tier: ReportTier } | null };

export function PropertyReportPackageCard({ reports, isSelected, generatingTier, ...cardProps }: Props) {
  const [open, setOpen] = useState(false);
  const ordered = [...reports].sort((a, b) => REPORT_VARIANT_ORDER.indexOf(normalizeReportVariant(a.report_variant || a.report_tier)) - REPORT_VARIANT_ORDER.indexOf(normalizeReportVariant(b.report_variant || b.report_tier)) || +new Date(b.created_at) - +new Date(a.created_at));
  const latest = ordered.reduce((newest, item) => new Date(item.created_at) > new Date(newest.created_at) ? item : newest, ordered[0]);
  return <Card className="overflow-hidden rounded-2xl border-border/70 bg-card/90 shadow-sm dark:bg-background/70">
    <CardHeader className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3"><div className="rounded-xl border border-border/60 bg-primary/5 p-2 text-primary"><MapPin className="h-5 w-5" /></div><div className="min-w-0"><h3 className="break-words text-lg font-semibold">{latest.property_address}</h3><p className="mt-1 text-xs text-muted-foreground">Latest {format(new Date(latest.created_at), 'PPp')} · {latest.status || 'completed'}</p><div className="mt-2 flex flex-wrap gap-1.5">{ordered.map(r => <Badge key={r.id} variant="outline" className="text-xs">{getReportVariantLabel(r.report_variant || r.report_tier)}</Badge>)}</div></div></div>
        <Button variant="outline" size="sm" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} reports for ${latest.property_address}`} className="shrink-0 gap-1"><Package className="h-4 w-4" />{ordered.length} <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} /></Button>
      </div>
    </CardHeader>
    {open && <CardContent className="border-t border-border/60 bg-muted/15 p-4"><div className="grid gap-4">{ordered.map(report => <InvestmentReportCard key={report.id} {...cardProps} report={report} isSelected={isSelected(report.id)} generatingTier={generatingTier?.reportId === report.id ? generatingTier.tier : null} />)}</div></CardContent>}
  </Card>;
}
