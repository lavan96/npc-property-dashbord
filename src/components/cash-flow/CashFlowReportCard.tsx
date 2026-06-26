import { format } from 'date-fns';
import { ArrowRight, Building, Calculator, FileText, Home, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { BuildType, InvestmentGrade, InvestmentReport } from './types';

interface CashFlowReportCardProps {
  report: InvestmentReport;
  buildType: BuildType;
  gradeInfo: InvestmentGrade | null;
  isOpening: boolean;
  onViewReport: (report: InvestmentReport) => void;
  onOpenCashFlow: (report: InvestmentReport) => void;
}

export function CashFlowReportCard({ report, buildType, gradeInfo, isOpening, onViewReport, onOpenCashFlow }: CashFlowReportCardProps) {
  const fc = report.financial_calculations || {};
  const mo = report.manual_overrides || {};
  const purchasePrice = mo.purchasePrice || fc.purchasePrice || fc.propertyValue || 0;
  const weeklyRent = mo.weeklyRent || fc.weeklyRent || 0;
  const isNewBuild = buildType === 'new_build';
  const isLandOnly = buildType === 'land_only';

  return (
    <Card className="group overflow-hidden border-slate-200/80 bg-gradient-to-b from-background to-muted/20 transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="line-clamp-2 text-base leading-snug">{report.property_address}</CardTitle>
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant={isNewBuild ? 'default' : isLandOnly ? 'outline' : 'secondary'} className="text-xs">
              {isNewBuild ? <><Building className="mr-1 h-3 w-3" />New Build</> : isLandOnly ? <><MapPin className="mr-1 h-3 w-3" />Land Only</> : <><Home className="mr-1 h-3 w-3" />Existing</>}
            </Badge>
            {gradeInfo && <Badge className={`${gradeInfo.color} text-white shadow-sm`}>{gradeInfo.grade}</Badge>}
          </div>
        </div>
        <CardDescription>{format(new Date(report.created_at), 'dd MMM yyyy')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <ReadinessMetric label="Purchase price" value={`$${purchasePrice.toLocaleString()}`} />
          <ReadinessMetric label="Weekly rent" value={`$${weeklyRent.toLocaleString()}`} />
        </div>
        <div className="rounded-xl border bg-background/80 p-3 text-xs text-muted-foreground">
          Ready for 10-year projection using configured manual overrides and report financials.
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onViewReport(report)}>
            <FileText className="mr-1 h-4 w-4" /> View Report
          </Button>
          <Button size="sm" className="flex-1" onClick={() => onOpenCashFlow(report)} disabled={isOpening}>
            <Calculator className="mr-1 h-4 w-4" /> {isOpening ? 'Loading...' : 'Cash Flow'} {!isOpening && <ArrowRight className="ml-1 h-3 w-3" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReadinessMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-muted/60 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div>;
}
