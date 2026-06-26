import { format } from 'date-fns';
import { AlertCircle, Calendar, CheckCircle2, Edit, Send, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { InvestmentReport } from './types';

interface Props {
  report: InvestmentReport;
  isClientReport: boolean;
  hasOverrides: boolean;
  reportScore: string | number | null;
  reportTierLabel: string;
  reportVariantLabel: string;
  reportStatusLabel: string;
  onSendToClient: () => void;
  onEdit: () => void;
  onOverride: () => void;
}

export function InvestmentReportHero({
  report,
  isClientReport,
  hasOverrides,
  reportScore,
  reportTierLabel,
  reportVariantLabel,
  reportStatusLabel,
  onSendToClient,
  onEdit,
  onOverride,
}: Props) {
  return (
    <Card className="overflow-hidden border-primary/10 bg-gradient-to-br from-card via-card to-primary/5 shadow-sm">
      <CardContent className="p-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" /> Investment Report</Badge>
              {isClientReport && <Badge variant="outline">Client-ready</Badge>}
              {hasOverrides && <Badge className="gap-1 bg-amber-600 text-white hover:bg-amber-600"><AlertCircle className="h-3 w-3" /> Adjusted Data</Badge>}
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{report.property_address}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4" /> Generated {format(new Date(report.created_at), 'PPpp')}</span>
                <span className="inline-flex items-center gap-1.5 capitalize"><CheckCircle2 className="h-4 w-4" /> {reportStatusLabel}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[460px]">
            <div className="rounded-xl border bg-background/70 p-3"><p className="text-xs text-muted-foreground">Tier</p><p className="mt-1 truncate text-sm font-semibold capitalize">{reportTierLabel}</p></div>
            <div className="rounded-xl border bg-background/70 p-3"><p className="text-xs text-muted-foreground">Variant</p><p className="mt-1 truncate text-sm font-semibold capitalize">{reportVariantLabel}</p></div>
            <div className="rounded-xl border bg-background/70 p-3"><p className="text-xs text-muted-foreground">Score</p><p className="mt-1 text-sm font-semibold">{reportScore ?? 'Not scored'}</p></div>
            <div className="rounded-xl border bg-background/70 p-3"><p className="text-xs text-muted-foreground">Client Status</p><p className="mt-1 text-sm font-semibold">{isClientReport ? 'Client report' : 'Internal'}</p></div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" onClick={onSendToClient}><Send className="h-4 w-4 mr-1" />Send to Client</Button>
          <Button variant="outline" size="sm" onClick={onEdit}><Edit className="h-4 w-4 mr-1" />Edit Report</Button>
          <Button variant="outline" size="sm" onClick={onOverride}><SlidersHorizontal className="h-4 w-4 mr-1" />Adjust Data</Button>
        </div>
      </CardContent>
    </Card>
  );
}
