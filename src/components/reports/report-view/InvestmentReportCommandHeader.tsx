import { ArrowLeft, Calculator, Download, Edit, Send, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ReportVariantControls } from '@/components/reports/ReportVariantControls';
import type { ClientInfo, InvestmentReport } from './types';

interface Props {
  report: InvestmentReport;
  clientInfo: ClientInfo | null;
  isClientReport: boolean;
  onBack: () => void;
  onBackToClient: () => void;
  onNavigateToReport: (reportId: string) => void;
  onSendToClient: () => void;
  onCashFlow: () => void;
  onEdit: () => void;
  onOverride: () => void;
  onDownload: () => void;
}

export function InvestmentReportCommandHeader({
  report,
  clientInfo,
  isClientReport,
  onBack,
  onBackToClient,
  onNavigateToReport,
  onSendToClient,
  onCashFlow,
  onEdit,
  onOverride,
  onDownload,
}: Props) {
  return (
    <div className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80 flex-shrink-0">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {isClientReport && clientInfo ? (
            <Button variant="ghost" size="sm" onClick={onBackToClient} className="shrink-0">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to {clientInfo.primary_first_name} {clientInfo.primary_surname}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}
          <Separator orientation="vertical" className="hidden h-7 sm:block" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold">Report Workspace</p>
              {isClientReport && <Badge variant="secondary" className="text-xs">Client Report</Badge>}
            </div>
            <p className="truncate text-xs text-muted-foreground">{report.property_address}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <div className="rounded-lg border bg-card/70 p-1">
            <ReportVariantControls
              compositeReportId={report.derived_from_report_id || report.id}
              reportVariant={report.report_variant}
              derivedFromReportId={report.derived_from_report_id}
              onNavigate={onNavigateToReport}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-card/70 p-1">
            <Button variant="ghost" size="sm" onClick={onSendToClient}>
              <Send className="h-4 w-4 mr-1" />
              Send
            </Button>
            <Button variant="ghost" size="sm" onClick={onCashFlow}>
              <Calculator className="h-4 w-4 mr-1" />
              Cash Flow
            </Button>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={onOverride}>
              <Settings className="h-4 w-4 mr-1" />
              Override
            </Button>
          </div>
          <Button variant="default" size="sm" onClick={onDownload}>
            <Download className="h-4 w-4 mr-1" />
            Download
          </Button>
        </div>
      </div>
    </div>
  );
}
