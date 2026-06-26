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
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base line-clamp-2">
            {report.property_address}
          </CardTitle>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge
              variant={isNewBuild ? "default" : isLandOnly ? "outline" : "secondary"}
              className="text-xs"
            >
              {isNewBuild ? (
                <><Building className="h-3 w-3 mr-1" />New Build</>
              ) : isLandOnly ? (
                <><MapPin className="h-3 w-3 mr-1" />Land Only</>
              ) : (
                <><Home className="h-3 w-3 mr-1" />Existing</>
              )}
            </Badge>
            {gradeInfo && (
              <Badge className={`${gradeInfo.color} text-white`}>
                {gradeInfo.grade}
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>
          {format(new Date(report.created_at), 'dd MMM yyyy')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Purchase Price</p>
            <p className="font-medium">${purchasePrice.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Weekly Rent</p>
            <p className="font-medium">${weeklyRent.toLocaleString()}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onViewReport(report)}
          >
            <FileText className="h-4 w-4 mr-1" />
            View Report
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={() => onOpenCashFlow(report)}
            disabled={isOpening}
          >
            <Calculator className="h-4 w-4 mr-1" />
            {isOpening ? 'Loading...' : 'Cash Flow'}
            {!isOpening && <ArrowRight className="h-3 w-3 ml-1" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
