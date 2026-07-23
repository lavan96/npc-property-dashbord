import { useId, useState } from 'react';
import { ChevronDown, MapPin, Package } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { InvestmentReportCard } from './InvestmentReportCard';
import type { InvestmentReport } from './types';
import { getReportVariantLabel, normalizeReportVariant, REPORT_VARIANT_ORDER } from '@/lib/reports/reportVariants';
import type { ReportTier } from '@/components/reports/TierBadge';

type Props = Omit<React.ComponentProps<typeof InvestmentReportCard>, 'report' | 'isSelected' | 'generatingTier'> & { reports: InvestmentReport[]; isSelected: (id: string) => boolean; generatingTier: { reportId: string; tier: ReportTier } | null };

export function PropertyReportPackageCard({ reports, isSelected, generatingTier, ...cardProps }: Props) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const ordered = [...reports].sort((a, b) => REPORT_VARIANT_ORDER.indexOf(normalizeReportVariant(a.report_variant || a.report_tier)) - REPORT_VARIANT_ORDER.indexOf(normalizeReportVariant(b.report_variant || b.report_tier)) || +new Date(b.created_at) - +new Date(a.created_at));
  const latest = ordered.reduce((newest, item) => new Date(item.created_at) > new Date(newest.created_at) ? item : newest, ordered[0]);
  const toggle = () => setOpen(value => !value);
  const onHeaderKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  };

  return <Card className="overflow-hidden rounded-2xl border-border/70 bg-card/90 shadow-sm transition-[border-color,box-shadow,background-color] duration-200 hover:border-primary/60 hover:bg-card hover:shadow-md hover:shadow-primary/10 dark:bg-background/70">
    <CardHeader
      className="cursor-pointer p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-controls={contentId}
      aria-label={`${open ? 'Collapse' : 'Expand'} ${ordered.length} reports for ${latest.property_address}`}
      onClick={toggle}
      onKeyDown={onHeaderKeyDown}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-3">
          <div className="shrink-0 rounded-xl border border-border/60 bg-primary/5 p-2 text-primary"><MapPin className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-lg font-semibold leading-snug">{latest.property_address}</h3>
            <p className="mt-1 text-xs text-muted-foreground">Latest {format(new Date(latest.created_at), 'PPp')} · {latest.status || 'completed'}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">{ordered.map(r => <Badge key={r.id} variant="outline" className="text-xs">{getReportVariantLabel(r.report_variant || r.report_tier)}</Badge>)}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-md border border-border/70 bg-background/60 px-2 py-1.5 text-sm font-medium" aria-hidden="true">
          <Package className="h-4 w-4" />{ordered.length}
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
        </div>
      </div>
    </CardHeader>
    <div id={contentId} className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
      <div className="overflow-hidden">
        <CardContent className="border-t border-border/60 bg-muted/15 p-4"><div className="grid gap-4">{ordered.map(report => <InvestmentReportCard key={report.id} {...cardProps} report={report} isSelected={isSelected(report.id)} generatingTier={generatingTier?.reportId === report.id ? generatingTier.tier : null} />)}</div></CardContent>
      </div>
    </div>
  </Card>;
}
